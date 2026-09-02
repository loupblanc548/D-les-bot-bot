/**
 * tts.ts — Commande /tts (Text-to-Speech en vocal)
 *
 * Utilise l'API Google Translate TTS (gratuite, pas de clé requise)
 * pour générer un audio MP3 depuis du texte, puis le joue en vocal.
 */

import {
  ChatInputCommandInteraction,
  SlashCommandBuilder,
  EmbedBuilder,
  MessageFlags,
  GuildMember,
} from "discord.js";
import {
  joinVoiceChannel,
  createAudioPlayer,
  createAudioResource,
  AudioPlayerStatus,
  NoSubscriberBehavior,
} from "@discordjs/voice";
import { activePlayers, cleanupConnection, DISCONNECT_DELAY_MS } from "../services/audioPlayer.js";
import { writeFile, unlink, mkdir } from "fs/promises";
import { join } from "path";
import { tmpdir } from "os";
import { randomUUID } from "crypto";
import logger from "../utils/logger.js";

const TTS_DIR = join(tmpdir(), "bot-tts");
const TTS_MAX_LENGTH = 500;

const LANGUAGES = [
  { name: "Français", value: "fr" },
  { name: "English", value: "en" },
  { name: "Español", value: "es" },
  { name: "Deutsch", value: "de" },
  { name: "Italiano", value: "it" },
  { name: "Português", value: "pt" },
  { name: "日本語", value: "ja" },
  { name: "한국어", value: "ko" },
  { name: "中文", value: "zh" },
  { name: "Русский", value: "ru" },
  { name: "العربية", value: "ar" },
  { name: "Nederlands", value: "nl" },
];

export const commands = [
  new SlashCommandBuilder()
    .setName("tts")
    .setDescription("Lit du texte à voix haute dans ton salon vocal")
    .addStringOption((o) =>
      o
        .setName("texte")
        .setDescription("Texte à lire à voix haute (max 500 caractères)")
        .setRequired(true)
        .setMaxLength(TTS_MAX_LENGTH),
    )
    .addStringOption((o) =>
      o
        .setName("langue")
        .setDescription("Langue du texte")
        .setRequired(false)
        .addChoices(...LANGUAGES.map((l) => ({ name: l.name, value: l.value }))),
    )
    .toJSON(),
];

export async function handleCommand(interaction: ChatInputCommandInteraction) {
  const text = interaction.options.getString("texte", true);
  const lang = interaction.options.getString("langue") || "fr";

  const member = interaction.member as GuildMember;
  const voiceChannel = member?.voice?.channel;

  if (!voiceChannel) {
    await interaction.reply({
      content: "❌ Tu dois être dans un salon vocal pour utiliser cette commande.",
      flags: [MessageFlags.Ephemeral],
    });
    return;
  }

  await interaction.deferReply({ flags: [MessageFlags.Ephemeral] });

  try {
    // Générer l'audio TTS via le pipeline neuronal (Edge TTS / Piper / ElevenLabs)
    const audioBuffer = await generateNeuralTTS(text, lang);
    if (!audioBuffer) {
      await interaction.editReply({
        content: "❌ Impossible de générer l'audio. Réessaie plus tard.",
      });
      return;
    }

    // Sauvegarder temporairement
    await mkdir(TTS_DIR, { recursive: true });
    const filename = `tts-${randomUUID()}.mp3`;
    const filepath = join(TTS_DIR, filename);
    await writeFile(filepath, audioBuffer, { mode: 0o600 });

    // Rejoindre le vocal (non-muté, non-sourdi)
    const guildId = interaction.guildId!;
    const connection = joinVoiceChannel({
      channelId: voiceChannel.id,
      guildId,
      adapterCreator: interaction.guild!.voiceAdapterCreator,
      selfMute: false,
      selfDeaf: false,
    });

    // Créer le player et jouer
    const player = createAudioPlayer({
      behaviors: { noSubscriber: NoSubscriberBehavior.Pause },
    });

    const resource = createAudioResource(filepath);
    activePlayers.set(guildId, player);
    connection.subscribe(player);
    player.play(resource);

    const embed = new EmbedBuilder()
      .setColor(0x5865f2)
      .setTitle("🗣️ Text-to-Speech")
      .setDescription(`Lecture en cours dans **${voiceChannel.name}**`)
      .addFields(
        { name: "Langue", value: lang, inline: true },
        { name: "Longueur", value: `${text.length} caractères`, inline: true },
      )
      .setFooter({ text: "TTS • Neural Edge TTS" })
      .setTimestamp();

    await interaction.editReply({ embeds: [embed] });
    logger.info(`[TTS] ${interaction.user.tag} lit "${text.slice(0, 50)}..." en ${lang}`);

    // Nettoyer à la fin
    player.once(AudioPlayerStatus.Idle, () => {
      logger.info("[TTS] Lecture terminée");
      setTimeout(() => {
        if (
          activePlayers.get(guildId) === player &&
          player.state.status === AudioPlayerStatus.Idle
        ) {
          cleanupConnection(guildId);
          logger.info(`[TTS] Déconnexion après ${DISCONNECT_DELAY_MS / 1000}s d'inactivité`);
        }
      }, DISCONNECT_DELAY_MS);

      // Supprimer le fichier temporaire
      unlink(filepath).catch(() => {});
    });
  } catch (error) {
    logger.error("[TTS] Erreur:", error);
    try {
      await interaction.editReply({ content: "❌ Une erreur est survenue." });
    } catch {
      logger.error("[Silent catch]");
    }
  }
}

/**
 * Génère l'audio TTS via le pipeline neuronal de voiceAgent.
 * Ordre de priorité: Piper local → ElevenLabs → Edge TTS → StreamElements → Google Translate
 */
async function generateNeuralTTS(text: string, lang: string): Promise<Buffer | null> {
  // 1. Piper TTS local (gratuit, illimité, ~0.3s latence)
  try {
    const { generateLocalTTS, isPiperAvailable } = await import("../services/localTts.js");
    if (isPiperAvailable()) {
      const piperBuffer = await generateLocalTTS(text, lang);
      if (piperBuffer && piperBuffer.length > 1000) {
        logger.info(`[TTS] Via Piper local (lang: ${lang})`);
        return piperBuffer;
      }
    }
  } catch {
    logger.error("[Silent catch]");
  }

  // 2. ElevenLabs si configuré
  try {
    const { generateElevenLabsTTS, isElevenLabsConfigured } =
      await import("../services/elevenLabsTts.js");
    if (isElevenLabsConfigured()) {
      const result = await generateElevenLabsTTS(text.slice(0, 500));
      if (result?.audioUrl?.startsWith("data:audio/mpeg;base64,")) {
        const base64Data = result.audioUrl.split(",")[1];
        const buffer = Buffer.from(base64Data, "base64");
        logger.info("[TTS] Via ElevenLabs (neural premium)");
        return buffer;
      }
    }
  } catch {
    logger.error("[Silent catch]");
  }

  // 3. Microsoft Edge TTS (gratuit, voix neuronales Azure)
  try {
    const edgeBuffer = await generateEdgeTTS(text.slice(0, 500), lang);
    if (edgeBuffer && edgeBuffer.length > 1000) {
      logger.info(`[TTS] Via Microsoft Edge TTS (neural, lang: ${lang})`);
      return edgeBuffer;
    }
  } catch {
    logger.error("[Silent catch]");
  }

  // 4. StreamElements / Amazon Polly (gratuit, voix naturelle)
  try {
    const voiceMap: Record<string, string> = {
      fr: "Mathieu",
      en: "Brian",
      es: "Enrique",
      de: "Hans",
      it: "Giorgio",
      pt: "Ricardo",
      ja: "Takumi",
      ko: "Minho",
      zh: "Zhiyu",
      ru: "Maxim",
      ar: "Zeina",
      nl: "Ruben",
    };
    const voice = voiceMap[lang] || "Brian";
    const seUrl = `https://api.streamelements.com/kappa/v2/speech?voice=${encodeURIComponent(voice)}&text=${encodeURIComponent(text.slice(0, 500))}`;
    const seRes = await fetch(seUrl, {
      signal: AbortSignal.timeout(10_000),
      headers: { "User-Agent": "DiscordBot/1.0" },
    });
    if (seRes.ok) {
      const seBuffer = Buffer.from(await seRes.arrayBuffer());
      if (seBuffer.length > 1000) {
        logger.info(`[TTS] Via StreamElements/Polly (voix: ${voice})`);
        return seBuffer;
      }
    }
  } catch {
    logger.error("[Silent catch]");
  }

  // 5. Fallback: Google Translate TTS (robotique mais toujours disponible)
  try {
    const url = `https://translate.google.com/translate_tts?ie=UTF-8&q=${encodeURIComponent(text.slice(0, 500))}&tl=${lang}&client=tw-ob`;
    const res = await fetch(url, {
      headers: {
        "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36",
        Referer: "https://translate.google.com/",
      },
      signal: AbortSignal.timeout(10_000),
    });
    if (!res.ok) {
      logger.warn(`[TTS] Fallback HTTP ${res.status}`);
      return null;
    }
    const arrayBuffer = await res.arrayBuffer();
    logger.info("[TTS] Via Google Translate (fallback)");
    return Buffer.from(arrayBuffer);
  } catch (error) {
    logger.error("[TTS] Erreur fetch:", error);
    return null;
  }
}

/**
 * Microsoft Edge TTS — voix neuronales Azure gratuites.
 */
async function generateEdgeTTS(text: string, lang: string): Promise<Buffer | null> {
  const { WebSocket } = await import("ws");

  const voiceMap: Record<string, string> = {
    fr: "fr-FR-HenriNeural",
    en: "en-US-AndrewMultilingualNeural",
    es: "es-ES-AlvaroNeural",
    de: "de-DE-ConradNeural",
    it: "it-IT-DiegoNeural",
    pt: "pt-BR-AntonioNeural",
    ja: "ja-JP-KeitaNeural",
    ko: "ko-KR-InJoonNeural",
    zh: "zh-CN-XiaoxiaoNeural",
    ru: "ru-RU-DmitryNeural",
    ar: "ar-SA-HamedNeural",
    nl: "nl-NL-MaartenNeural",
  };

  const voice = voiceMap[lang] || "en-US-AndrewMultilingualNeural";
  const SSML = `<speak version='1.0' xmlns='http://www.w3.org/2001/10/synthesis' xml:lang='${lang}'><voice name='${voice}'>${text.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;")}</voice></speak>`;

  return new Promise<Buffer | null>((resolve) => {
    const chunks: Buffer[] = [];
    let resolved = false;

    const finish = (result: Buffer | null) => {
      if (resolved) return;
      resolved = true;
      try {
        ws.close();
      } catch {
        logger.error("[Silent catch]");
      }
      resolve(result);
    };

    const ws = new WebSocket(
      "wss://speech.platform.bing.com/consumer/speech/synthesize/readaloud/edge/v1",
      {
        headers: {
          "User-Agent": "Mozilla/5.0",
          Origin: "chrome-extension://jdiccldimpdaibmpdkjnbmckianbfold",
        },
      },
    );

    const timeout = setTimeout(() => {
      logger.warn("[TTS] Edge TTS timeout");
      finish(null);
    }, 10_000);

    ws.on("open", () => {
      ws.send(
        `Content-Type:application/json; charset=utf-8\r\nPath:speech.config\r\n\r\n${JSON.stringify({ context: { synthesis: { audio: { outputFormat: "audio-24khz-48kbitrate-mono-mp3" } } } })}`,
      );
      ws.send(
        `Content-Type:application/ssml+xml\r\nX-Timestamp:${new Date().toISOString()}\r\nPath:ssml\r\n\r\n${SSML}`,
      );
    });

    ws.on("message", (data: Buffer) => {
      const str = data.toString();
      if (str.includes("Path:audio")) {
        const idx = str.indexOf("\r\n\r\n");
        if (idx !== -1) {
          const audioData = data.subarray(idx + 4);
          if (audioData.length > 0) chunks.push(audioData);
        }
      }
      if (str.includes("Path:turn.end")) {
        clearTimeout(timeout);
        const combined = Buffer.concat(chunks);
        finish(combined.length > 100 ? combined : null);
      }
    });

    ws.on("error", (err) => {
      clearTimeout(timeout);
      logger.warn(`[TTS] Edge TTS error: ${err.message}`);
      finish(null);
    });

    ws.on("close", () => {
      clearTimeout(timeout);
      if (chunks.length > 0) {
        const combined = Buffer.concat(chunks);
        finish(combined.length > 100 ? combined : null);
      } else {
        finish(null);
      }
    });
  });
}
