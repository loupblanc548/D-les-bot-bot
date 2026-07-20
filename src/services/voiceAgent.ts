/**
 * voiceAgent.ts — Real-time Voice Agent
 *
 * Agent vocal temps réel qui rejoint les channels vocaux pour :
 *  - Annoncer les alertes de sécurité critiques (raid, honeypot, risk score)
 *  - Lire les rapports d'investigation autonome à voix haute
 *  - Répondre aux commandes vocales des modérateurs
 *  - Surveiller les channels vocaux pour détecter les comportements suspects
 *
 * Utilise l'API TTS existante (ElevenLabs / Google TTS) et le pipeline
 * audio de Discord.js pour rejoindre/quitter les channels vocaux.
 */

import { Client, EmbedBuilder } from "discord.js";
import {
  joinVoiceChannel,
  getVoiceConnection,
  createAudioResource,
  createAudioPlayer,
  AudioPlayerStatus,
  VoiceConnectionStatus,
  NoSubscriberBehavior,
} from "@discordjs/voice";
import { writeFile, unlink, mkdir } from "fs/promises";
import { join } from "path";
import { tmpdir } from "os";
import { randomUUID } from "crypto";
import logger from "../utils/logger.js";
import { createLog } from "./logs.js";

// ─── Types ───────────────────────────────────────────────────────────────────

export interface VoiceAlert {
  id: string;
  guildId: string;
  channelId: string;
  message: string;
  priority: "LOW" | "MEDIUM" | "HIGH" | "CRITICAL";
  createdAt: Date;
  playedAt: Date | null;
}

export interface VoiceAgentConfig {
  enabled: boolean;
  announceAlerts: boolean;
  announceInvestigations: boolean;
  voiceChannelId: string | null;
  language: string;
  speed: number;
}

const DEFAULT_CONFIG: VoiceAgentConfig = {
  enabled: false,
  announceAlerts: true,
  announceInvestigations: true,
  voiceChannelId: null,
  language: "fr",
  speed: 1.0,
};

// ─── State ───────────────────────────────────────────────────────────────────

let currentConfig: VoiceAgentConfig = { ...DEFAULT_CONFIG };
const alertQueue: VoiceAlert[] = [];
let isPlaying = false;
const activeConnections = new Map<string, string>(); // guildId -> channelId

// ─── Configuration ───────────────────────────────────────────────────────────

export function getVoiceAgentConfig(): VoiceAgentConfig {
  return { ...currentConfig };
}

export function updateVoiceAgentConfig(updates: Partial<VoiceAgentConfig>): VoiceAgentConfig {
  currentConfig = { ...currentConfig, ...updates };
  logger.info(`[VoiceAgent] Configuration mise à jour: enabled=${currentConfig.enabled}`);
  return { ...currentConfig };
}

// ─── Gestion des connexions vocales ──────────────────────────────────────────

/**
 * Fait rejoindre le bot à un channel vocal.
 */
export async function joinVoiceChannelById(
  client: Client,
  guildId: string,
  channelId: string,
): Promise<boolean> {
  try {
    const guild = client.guilds.cache.get(guildId);
    if (!guild) return false;

    const channel = guild.channels.cache.get(channelId);
    if (!channel || !channel.isVoiceBased()) return false;

    const connection = joinVoiceChannel({
      channelId,
      guildId,
      adapterCreator: guild.voiceAdapterCreator,
    });

    connection.on(VoiceConnectionStatus.Disconnected, () => {
      activeConnections.delete(guildId);
      logger.info(`[VoiceAgent] Déconnecté du channel vocal ${channelId} (${guildId})`);
    });

    activeConnections.set(guildId, channelId);
    logger.info(`[VoiceAgent] Rejoint le channel vocal ${channelId} (${guildId})`);
    return true;
  } catch (error) {
    logger.error(
      `[VoiceAgent] Erreur join voice: ${error instanceof Error ? error.message : String(error)}`,
    );
    return false;
  }
}

/**
 * Fait quitter le bot d'un channel vocal.
 */
export function leaveVoiceChannel(guildId: string): boolean {
  const connection = getVoiceConnection(guildId);
  if (!connection) return false;

  connection.destroy();
  activeConnections.delete(guildId);
  logger.info(`[VoiceAgent] Quitté le channel vocal (${guildId})`);
  return true;
}

/**
 * Vérifie si le bot est connecté à un channel vocal dans la guilde.
 */
export function isInVoiceChannel(guildId: string): boolean {
  return activeConnections.has(guildId);
}

/**
 * Fait parler le bot dans le salon vocal de l'utilisateur qui a envoyé le message.
 * - Détecte le salon vocal de l'utilisateur
 * - Rejoint le salon
 * - Génère le TTS de la réponse
 * - Joue l'audio
 * - Quitte le salon après avoir fini de parler
 *
 * @param client Le client Discord
 * @param guildId L'ID de la guilde
 * @param userId L'ID de l'utilisateur (pour trouver son salon vocal)
 * @param text Le texte à parler
 * @param lang La langue du TTS (défaut: fr)
 * @returns true si l'audio a été joué, false sinon
 */
export async function speakResponseInVoice(
  client: Client,
  guildId: string,
  userId: string,
  text: string,
  lang = "fr",
): Promise<boolean> {
  try {
    const guild = client.guilds.cache.get(guildId);
    if (!guild) return false;

    // Trouver le salon vocal de l'utilisateur
    const member = await guild.members.fetch(userId).catch(() => null);
    if (!member?.voice.channelId) return false;

    const voiceChannelId = member.voice.channelId;
    const wasAlreadyInVoice = activeConnections.get(guildId) === voiceChannelId;

    // Rejoindre le salon vocal
    if (!wasAlreadyInVoice) {
      const joined = await joinVoiceChannelById(client, guildId, voiceChannelId);
      if (!joined) return false;
    }

    // Nettoyer le texte pour le TTS (retirer markdown, emojis, blocs de code)
    const cleanText = text
      .replace(/```[\s\S]*?```/g, " (code) ")
      .replace(/`([^`]+)`/g, "$1")
      .replace(/\*\*([^*]+)\*\*/g, "$1")
      .replace(/\*([^*]+)\*/g, "$1")
      .replace(/__([^_]+)__/g, "$1")
      .replace(/~~([^~]+)~~/g, "$1")
      .replace(/#[^\s]+/g, "") // hashtags
      .replace(/<:[^:]+:\d+>/g, "") // custom emojis
      .replace(/[\u{1F000}-\u{1FFFF}]/gu, "") // unicode emojis
      .replace(/\[([^\]]+)\]\([^)]+\)/g, "$1") // links
      .replace(/https?:\/\/\S+/g, "") // URLs
      .replace(/\s+/g, " ")
      .trim()
      .slice(0, 500); // Google TTS limite à ~500 chars

    if (!cleanText) return false;

    // Générer l'audio TTS
    const audioBuffer = await generateTTS(cleanText, lang, 1.0);
    if (!audioBuffer) {
      logger.warn("[VoiceAgent] TTS non disponible pour réponse vocale");
      if (!wasAlreadyInVoice) leaveVoiceChannel(guildId);
      return false;
    }

    // Jouer l'audio
    const connection = getVoiceConnection(guildId);
    if (!connection) {
      if (!wasAlreadyInVoice) leaveVoiceChannel(guildId);
      return false;
    }

    const player = createAudioPlayer({ behaviors: { noSubscriber: NoSubscriberBehavior.Play } });
    const { Readable } = await import("node:stream");
    const stream = Readable.from(audioBuffer);
    const resource = createAudioResource(stream);
    player.play(resource);

    connection.subscribe(player);

    return new Promise<boolean>((resolve) => {
      let resolved = false;
      const finish = (result: boolean) => {
        if (resolved) return;
        resolved = true;
        // Quitter le salon si on l'a rejoint uniquement pour parler
        if (!wasAlreadyInVoice) {
          setTimeout(() => leaveVoiceChannel(guildId), 2000);
        }
        resolve(result);
      };

      player.on(AudioPlayerStatus.Idle, () => finish(true));
      player.on("error", (err) => {
        logger.error(`[VoiceAgent] Audio player error: ${err.message}`);
        finish(false);
      });

      // Timeout de sécurité (30s max)
      setTimeout(() => finish(true), 30_000);
    });
  } catch (err) {
    logger.error(
      `[VoiceAgent] speakResponseInVoice error: ${err instanceof Error ? err.message : String(err)}`,
    );
    return false;
  }
}

// ─── Queue d'alertes vocales ─────────────────────────────────────────────────

/**
 * Ajoute une alerte à la queue vocale.
 * Si le bot est dans un channel vocal, l'alerte sera annoncée.
 */
export async function queueVoiceAlert(
  client: Client,
  guildId: string,
  message: string,
  priority: VoiceAlert["priority"] = "MEDIUM",
): Promise<VoiceAlert | null> {
  if (!currentConfig.enabled || !currentConfig.announceAlerts) return null;

  const channelId = activeConnections.get(guildId) ?? currentConfig.voiceChannelId;
  if (!channelId) {
    logger.info(`[VoiceAgent] Aucun channel vocal configuré pour ${guildId} — alerte skipée`);
    return null;
  }

  // Rejoindre si pas déjà connecté
  if (!isInVoiceChannel(guildId) && currentConfig.voiceChannelId) {
    await joinVoiceChannelById(client, guildId, currentConfig.voiceChannelId);
  }

  const alert: VoiceAlert = {
    id: `va_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`,
    guildId,
    channelId,
    message,
    priority,
    createdAt: new Date(),
    playedAt: null,
  };

  // Insérer selon la priorité (CRITICAL en premier)
  if (priority === "CRITICAL") {
    alertQueue.unshift(alert);
  } else {
    alertQueue.push(alert);
  }

  logger.info(`[VoiceAgent] Alerte vocale queueée (${priority}): ${message.slice(0, 80)}...`);

  // Déclencher la lecture
  void processAlertQueue(client);

  return alert;
}

/**
 * Traite la queue d'alertes vocales de manière séquentielle.
 */
async function processAlertQueue(client: Client): Promise<void> {
  if (isPlaying || alertQueue.length === 0) return;

  const alert = alertQueue.shift();
  if (!alert) return;

  isPlaying = true;

  try {
    await playTTSMessage(client, alert);
    alert.playedAt = new Date();

    await createLog({
      type: "VOICE_ALERT",
      action: `Alerte vocale jouée: ${alert.message.slice(0, 100)}`,
      targetId: alert.guildId,
      details: JSON.stringify({ alertId: alert.id, priority: alert.priority }),
    }).catch(() => {});
  } catch (error) {
    logger.error(
      `[VoiceAgent] Erreur lecture alerte: ${error instanceof Error ? error.message : String(error)}`,
    );
  } finally {
    isPlaying = false;
    // Traiter la suivante
    if (alertQueue.length > 0) {
      void processAlertQueue(client);
    }
  }
}

/**
 * Joue un message TTS dans le channel vocal.
 * Utilise l'API TTS existante ou génère un audio simple.
 */
async function playTTSMessage(client: Client, alert: VoiceAlert): Promise<void> {
  const guildId = alert.guildId;
  const connection = getVoiceConnection(guildId);
  if (!connection) {
    logger.warn(`[VoiceAgent] Pas de connexion vocale pour ${guildId}`);
    return;
  }

  // Préfixer avec la priorité
  const prefix =
    alert.priority === "CRITICAL"
      ? "Alerte critique. "
      : alert.priority === "HIGH"
        ? "Alerte importante. "
        : "";
  const fullMessage = prefix + alert.message;

  // Générer l'audio TTS
  const audioBuffer = await generateTTS(fullMessage, currentConfig.language, currentConfig.speed);
  if (!audioBuffer) {
    logger.warn(`[VoiceAgent] TTS non disponible — message texte uniquement`);
    return;
  }

  // Sauvegarder en fichier temporaire (createAudioResource nécessite un path ou Readable)
  const ttsDir = join(tmpdir(), "bot-voiceagent");
  await mkdir(ttsDir, { recursive: true, mode: 0o700 });
  const filepath = join(ttsDir, `va-${randomUUID()}.mp3`);
  await writeFile(filepath, audioBuffer, { mode: 0o600 });

  const player = createAudioPlayer({
    behaviors: { noSubscriber: NoSubscriberBehavior.Pause },
  });
  const resource = createAudioResource(filepath);

  player.play(resource);
  connection.subscribe(player);

  return new Promise((resolve) => {
    player.on(AudioPlayerStatus.Idle, () => {
      unlink(filepath).catch(() => {});
      resolve();
    });
    player.on("error", (err) => {
      logger.error(`[VoiceAgent] Erreur audio player: ${err.message}`);
      unlink(filepath).catch(() => {});
      resolve();
    });
  });
}

/**
 * Génère un audio TTS via l'API Google Translate (même méthode que tts.ts).
 */
async function generateTTS(text: string, lang: string, _speed: number): Promise<Buffer | null> {
  try {
    const url = `https://translate.google.com/translate_tts?ie=UTF-8&q=${encodeURIComponent(text.slice(0, 500))}&tl=${lang}&client=tw-ob`;
    const res = await fetch(url, {
      headers: {
        "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36",
        Referer: "https://translate.google.com/",
      },
      signal: AbortSignal.timeout(10000),
    });

    if (!res.ok) {
      logger.warn(`[VoiceAgent] TTS HTTP ${res.status}`);
      return null;
    }

    const arrayBuffer = await res.arrayBuffer();
    return Buffer.from(arrayBuffer);
  } catch (error) {
    logger.error(
      `[VoiceAgent] Erreur TTS: ${error instanceof Error ? error.message : String(error)}`,
    );
    return null;
  }
}

// ─── Surveillance vocale ─────────────────────────────────────────────────────

/**
 * Initialise la surveillance des channels vocaux.
 * Détecte les connexions massives (raid vocal) et les comportements suspects.
 */
export function initVoiceMonitoring(client: Client): void {
  const voiceJoinTracker = new Map<string, { count: number; firstJoin: number }>();
  const VOICE_RAID_THRESHOLD = 5;
  const VOICE_RAID_WINDOW = 30_000; // 30 secondes

  client.on("voiceStateUpdate", async (oldState, newState) => {
    // Détection de connexion à un channel vocal
    if (!oldState.channelId && newState.channelId) {
      const guildId = newState.guild.id;
      const now = Date.now();

      let tracker = voiceJoinTracker.get(guildId);
      if (!tracker || now - tracker.firstJoin > VOICE_RAID_WINDOW) {
        tracker = { count: 0, firstJoin: now };
        voiceJoinTracker.set(guildId, tracker);
      }

      tracker.count++;

      if (tracker.count >= VOICE_RAID_THRESHOLD) {
        logger.warn(
          `[VoiceAgent] Raid vocal suspect: ${tracker.count} joins en <30s sur ${guildId}`,
        );

        if (currentConfig.enabled) {
          await queueVoiceAlert(
            client,
            guildId,
            `Raid vocal détecté: ${tracker.count} utilisateurs ont rejoint les channels vocaux en moins de 30 secondes.`,
            "CRITICAL",
          );
        }

        // Reset
        voiceJoinTracker.delete(guildId);
      }
    }
  });

  logger.info("[VoiceAgent] Surveillance vocale activée");
}

// ─── API publique ────────────────────────────────────────────────────────────

export function getAlertQueue(): VoiceAlert[] {
  return [...alertQueue];
}

export function clearAlertQueue(): void {
  alertQueue.length = 0;
}

export function getActiveVoiceConnections(): Map<string, string> {
  return new Map(activeConnections);
}

export function buildVoiceAgentEmbed(config: VoiceAgentConfig): EmbedBuilder {
  return new EmbedBuilder()
    .setTitle("🎙️ Voice Agent")
    .setColor(config.enabled ? 0x57f287 : 0x808080)
    .setDescription("Agent vocal temps réel")
    .addFields(
      { name: "Statut", value: config.enabled ? "✅ Activé" : "❌ Désactivé", inline: true },
      { name: "Alertes vocales", value: config.announceAlerts ? "✅" : "❌", inline: true },
      { name: "Investigations", value: config.announceInvestigations ? "✅" : "❌", inline: true },
      {
        name: "Channel vocal",
        value: config.voiceChannelId ? `<#${config.voiceChannelId}>` : "Non configuré",
        inline: true,
      },
      { name: "Langue", value: config.language, inline: true },
      { name: "Alertes en queue", value: `${alertQueue.length}`, inline: true },
    )
    .setTimestamp();
}
