/**
 * parle.ts — Commande /parle (fait parler le bot en vocal)
 *
 * Le bot rejoint le salon vocal de l'utilisateur et lit le texte à voix haute.
 * Utilise le pipeline TTS neuronal (Edge TTS / Piper / ElevenLabs).
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
  getVoiceConnection,
  createAudioPlayer,
  createAudioResource,
  AudioPlayerStatus,
  NoSubscriberBehavior,
} from "@discordjs/voice";
import { Readable } from "node:stream";
import logger from "../utils/logger.js";

const MAX_LENGTH = 500;

export const commands = [
  new SlashCommandBuilder()
    .setName("parle")
    .setDescription("Fait parler le bot dans ton salon vocal (TTS neuronal)")
    .addStringOption((o) =>
      o
        .setName("texte")
        .setDescription("Texte que le bot doit dire à voix haute")
        .setRequired(true)
        .setMaxLength(MAX_LENGTH),
    )
    .addStringOption((o) =>
      o
        .setName("langue")
        .setDescription("Langue du texte (défaut: Français)")
        .setRequired(false)
        .addChoices(
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
        ),
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
      content: "❌ Tu dois être dans un salon vocal pour que je puisse parler.",
      flags: [MessageFlags.Ephemeral],
    });
    return;
  }

  await interaction.deferReply({ flags: [MessageFlags.Ephemeral] });

  try {
    // Générer l'audio TTS neuronal
    const audioBuffer = await generateNeuralTTS(text, lang);
    if (!audioBuffer) {
      await interaction.editReply({
        content: "❌ Impossible de générer l'audio. Réessaie plus tard.",
      });
      return;
    }

    // Détruire l'ancienne connexion si dans un autre salon
    const guildId = interaction.guildId!;
    const existing = getVoiceConnection(guildId);
    if (existing && existing.joinConfig.channelId !== voiceChannel.id) {
      existing.destroy();
    }

    // Rejoindre le vocal (non-muté!)
    const connection = joinVoiceChannel({
      channelId: voiceChannel.id,
      guildId,
      adapterCreator: interaction.guild!.voiceAdapterCreator,
      selfMute: false,
      selfDeaf: false,
    });

    // Créer le player et jouer
    const player = createAudioPlayer({
      behaviors: { noSubscriber: NoSubscriberBehavior.Play },
    });

    const stream = Readable.from(audioBuffer);
    const resource = createAudioResource(stream);
    connection.subscribe(player);
    player.play(resource);

    const embed = new EmbedBuilder()
      .setColor(0x57f287)
      .setTitle("🗣️ Le bot parle!")
      .setDescription(`Lecture dans **${voiceChannel.name}**`)
      .addFields(
        { name: "Texte", value: text.slice(0, 200), inline: false },
        { name: "Langue", value: lang, inline: true },
        { name: "Voix", value: "Neuronale (Edge TTS)", inline: true },
      )
      .setFooter({ text: "Commande /parle • TTS neuronal" })
      .setTimestamp();

    await interaction.editReply({ embeds: [embed] });
    logger.info(`[Parle] ${interaction.user.tag} dit "${text.slice(0, 50)}..." en ${lang}`);

    // Nettoyer à la fin
    player.once(AudioPlayerStatus.Idle, () => {
      logger.info("[Parle] Lecture terminée");
      // Déconnexion auto après 10s d'inactivité
      setTimeout(() => {
        const conn = getVoiceConnection(guildId);
        if (conn && conn.joinConfig.channelId === voiceChannel.id) {
          conn.destroy();
          logger.info("[Parle] Déconnexion auto");
        }
      }, 10_000);
    });

    player.on("error", (err) => {
      logger.error(`[Parle] Player error: ${err.message}`);
    });
  } catch (error) {
    logger.error("[Parle] Erreur:", error);
    try {
      await interaction.editReply({ content: "❌ Une erreur est survenue." });
    } catch { logger.error("[Silent catch]"); }
  }
}

/**
 * Pipeline TTS neuronal — même que voiceAgent.ts
 * Priorité: Piper local → ElevenLabs → Edge TTS → StreamElements → Google Translate
 */
async function generateNeuralTTS(text: string, lang: string): Promise<Buffer | null> {
  // 1. Piper TTS local
  try {
    const { generateLocalTTS, isPiperAvailable } = await import("../services/localTts.js");
    if (isPiperAvailable()) {
      const buf = await generateLocalTTS(text, lang);
      if (buf && buf.length > 1000) {
        logger.info(`[Parle] TTS via Piper local (lang: ${lang})`);
        return buf;
      }
    }
  } catch { logger.error("[Silent catch]"); }

  // 2. ElevenLabs
  try {
    const { generateElevenLabsTTS, isElevenLabsConfigured } =
      await import("../services/elevenLabsTts.js");
    if (isElevenLabsConfigured()) {
      const result = await generateElevenLabsTTS(text.slice(0, 500));
      if (result?.audioUrl?.startsWith("data:audio/mpeg;base64,")) {
        logger.info("[Parle] TTS via ElevenLabs (neural premium)");
        return Buffer.from(result.audioUrl.split(",")[1], "base64");
      }
    }
  } catch { logger.error("[Silent catch]"); }

  // 3. Microsoft Edge TTS (voix neuronales Azure gratuites)
  try {
    const edgeBuffer = await generateEdgeTTS(text.slice(0, 500), lang);
    if (edgeBuffer && edgeBuffer.length > 1000) {
      logger.info(`[Parle] TTS via Microsoft Edge TTS (neural, lang: ${lang})`);
      return edgeBuffer;
    }
  } catch { logger.error("[Silent catch]"); }

  // 4. StreamElements / Amazon Polly
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
        logger.info(`[Parle] TTS via StreamElements/Polly (voix: ${voice})`);
        return seBuffer;
      }
    }
  } catch { logger.error("[Silent catch]"); }

  // 5. Fallback: Google Translate TTS
  try {
    const url = `https://translate.google.com/translate_tts?ie=UTF-8&q=${encodeURIComponent(text.slice(0, 500))}&tl=${lang}&client=tw-ob`;
    const res = await fetch(url, {
      headers: {
        "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36",
        Referer: "https://translate.google.com/",
      },
      signal: AbortSignal.timeout(10_000),
    });
    if (!res.ok) return null;
    logger.info("[Parle] TTS via Google Translate (fallback)");
    return Buffer.from(await res.arrayBuffer());
  } catch (err) {
    logger.error("[Parle] Erreur TTS:", err);
    return null;
  }
}

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
      } catch { logger.error("[Silent catch]"); }
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

    const timeout = setTimeout(() => finish(null), 10_000);

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

    ws.on("error", () => {
      clearTimeout(timeout);
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
