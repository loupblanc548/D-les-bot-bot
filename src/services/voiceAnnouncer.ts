/**
 * voiceAnnouncer.ts — Le bot rejoint un vocal et parle (TTS) pour annoncer des actions.
 *
 * Utilise Google Translate TTS (gratuit) pour générer l'audio.
 * Le bot rejoint le vocal de l'utilisateur qui a déclenché l'action,
 * annonce le message à voix haute, puis se déconnecte après quelques secondes.
 */

import { Client, GuildMember, VoiceBasedChannel, VoiceChannel, StageChannel } from "discord.js";
import {
  joinVoiceChannel,
  getVoiceConnection,
  createAudioPlayer,
  createAudioResource,
  AudioPlayerStatus,
  NoSubscriberBehavior,
  VoiceConnectionStatus,
  entersState,
} from "@discordjs/voice";
import { writeFile, unlink, mkdir } from "fs/promises";
import { join } from "path";
import { tmpdir } from "os";
import { randomUUID } from "crypto";
import logger from "../utils/logger.js";

const TTS_DIR = join(tmpdir(), "bot-voice-announcer");
const MAX_TTS_LENGTH = 400;
const DISCONNECT_DELAY_MS = 8_000;

let initialized = false;

/**
 * Initialise le dossier temporaire pour les fichiers TTS.
 */
export async function initVoiceAnnouncer(): Promise<void> {
  if (initialized) return;
  try {
    await mkdir(TTS_DIR, { recursive: true });
    initialized = true;
    logger.info("[VoiceAnnouncer] Service initialisé");
  } catch (err) {
    logger.warn(`[VoiceAnnouncer] Init échouée: ${err}`);
  }
}

/**
 * Récupère l'audio TTS depuis Google Translate.
 */
async function fetchTTS(text: string, lang = "fr"): Promise<Buffer | null> {
  const cleanText = text.slice(0, MAX_TTS_LENGTH);
  const url = `https://translate.google.com/translate_tts?ie=UTF-8&q=${encodeURIComponent(cleanText)}&tl=${lang}&client=tw-ob`;

  try {
    const res = await fetch(url, {
      headers: {
        "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36",
        Referer: "https://translate.google.com/",
      },
      signal: AbortSignal.timeout(10000),
    });

    if (!res.ok) {
      logger.warn(`[VoiceAnnouncer] TTS HTTP ${res.status}`);
      return null;
    }

    const arrayBuffer = await res.arrayBuffer();
    return Buffer.from(arrayBuffer);
  } catch (err) {
    logger.error(
      `[VoiceAnnouncer] TTS fetch error: ${err instanceof Error ? err.message : String(err)}`,
    );
    return null;
  }
}

/**
 * Le bot rejoint le vocal d'un membre et annonce un message à voix haute.
 * @param member Le membre dont on veut rejoindre le vocal
 * @param text Le texte à prononcer
 * @param lang Langue du TTS (défaut: fr)
 * @returns true si l'annonce a été jouée, false sinon
 */
export async function announceInVoice(
  member: GuildMember,
  text: string,
  lang = "fr",
): Promise<boolean> {
  const voiceChannel = member.voice?.channel;
  if (!voiceChannel) return false;

  return await speakInChannel(voiceChannel, text, lang);
}

/**
 * Le bot rejoint un salon vocal spécifique et annonce un message.
 */
export async function speakInChannel(
  voiceChannel: VoiceBasedChannel,
  text: string,
  lang = "fr",
): Promise<boolean> {
  try {
    await initVoiceAnnouncer();

    const guildId = voiceChannel.guild.id;

    // Générer l'audio TTS
    const audioBuffer = await fetchTTS(text, lang);
    if (!audioBuffer) {
      logger.warn("[VoiceAnnouncer] Impossible de générer l'audio TTS");
      return false;
    }

    // Sauvegarder temporairement
    const filename = `va-${randomUUID()}.mp3`;
    const filepath = join(TTS_DIR, filename);
    await writeFile(filepath, audioBuffer, { mode: 0o600 });

    // Vérifier si le bot est déjà connecté
    let connection = getVoiceConnection(guildId);
    if (!connection || connection.state.status === VoiceConnectionStatus.Destroyed) {
      connection = joinVoiceChannel({
        channelId: voiceChannel.id,
        guildId,
        adapterCreator: voiceChannel.guild.voiceAdapterCreator,
      });

      // Attendre que la connexion soit prête
      try {
        await entersState(connection, VoiceConnectionStatus.Ready, 10_000);
      } catch {
        logger.warn("[VoiceAnnouncer] Timeout connexion vocale");
        connection.destroy();
        return false;
      }
    }

    // Créer le player et jouer
    const player = createAudioPlayer({
      behaviors: { noSubscriber: NoSubscriberBehavior.Pause },
    });

    const resource = createAudioResource(filepath);
    connection.subscribe(player);
    player.play(resource);

    logger.info(
      `[VoiceAnnouncer] Annonce vocale dans #${voiceChannel.name} (${voiceChannel.guild.name})`,
    );

    // Nettoyer à la fin
    return new Promise<boolean>((resolve) => {
      player.once(AudioPlayerStatus.Idle, () => {
        // Supprimer le fichier temporaire
        unlink(filepath).catch(() => {});

        // Déconnexion après délai
        setTimeout(() => {
          const conn = getVoiceConnection(guildId);
          if (conn && conn.state.status !== VoiceConnectionStatus.Destroyed) {
            conn.destroy();
            logger.info("[VoiceAnnouncer] Déconnexion vocale après annonce");
          }
        }, DISCONNECT_DELAY_MS);

        resolve(true);
      });

      player.once("error", (err) => {
        logger.error(`[VoiceAnnouncer] Player error: ${err.message}`);
        unlink(filepath).catch(() => {});
        resolve(false);
      });
    });
  } catch (err) {
    logger.error(`[VoiceAnnouncer] Erreur: ${err instanceof Error ? err.message : String(err)}`);
    return false;
  }
}

/**
 * Trouve un salon vocal avec des membres connectés dans une guilde.
 * Priorise le salon avec le plus de membres.
 */
export function findActiveVoiceChannel(
  guildId: string,
  client: Client,
): VoiceChannel | StageChannel | null {
  const guild = client.guilds.cache.get(guildId);
  if (!guild) return null;

  const voiceChannels = guild.channels.cache.filter(
    (c): c is VoiceChannel | StageChannel => (c.type === 2 || c.type === 13) && c.members.size > 0,
  );

  if (voiceChannels.size === 0) return null;

  // Prendre le salon avec le plus de membres humains
  let best: VoiceChannel | StageChannel | null = null;
  let maxMembers = 0;
  for (const [, channel] of voiceChannels) {
    const humanCount = channel.members.filter((m: GuildMember) => !m.user.bot).size;
    if (humanCount > maxMembers) {
      maxMembers = humanCount;
      best = channel;
    }
  }

  return best;
}
