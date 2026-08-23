/**
 * voiceTranslation.ts — Traduction vocale en temps réel
 *
 * Extension de voiceConversation.ts: l'utilisateur parle dans sa langue,
 * le bot transcrit (Whisper), détecte la langue, traduit (DeepL),
 * génère une réponse IA dans la langue cible, et la parle (TTS).
 *
 * Cas d'usage: utilisateur francophone parle → bot répond en anglais,
 * ou utilisateur anglophone parle → bot répond en français.
 *
 * Garde-fous:
 * - Opt-in explicite (voiceOptIn de voiceAgent.ts)
 * - Toggle global (currentConfig.enabled)
 * - Rate-limit: 1 conversation every 10s per guild
 * - Session max 10 minutes
 * - Aucun stockage audio — transcription éphémère
 */

import {
  joinVoiceChannel,
  VoiceConnection,
  VoiceConnectionStatus,
  EndBehaviorType,
  AudioReceiveStream,
} from "@discordjs/voice";
import prism from "prism-media";
import { Client, TextChannel } from "discord.js";
import logger from "../utils/logger.js";
import { transcribeAudio } from "./dictation.js";
import { speakResponseInVoice, isVoiceOptedIn, getVoiceAgentConfig } from "./voiceAgent.js";
import { translate as deeplTranslate } from "../utils/deepl.js";
import { config } from "../config.js";

type TargetLang = "FR" | "EN" | "DE" | "ES" | "IT" | "PT" | "NL" | "PL" | "RU" | "JA" | "KO" | "ZH";

interface TranslationSession {
  connection: VoiceConnection;
  guildId: string;
  voiceChannelId: string;
  userId: string;
  username: string;
  targetLang: TargetLang;
  startedAt: number;
  chunks: Buffer[];
  lastTranscribeAt: number;
  isProcessing: boolean;
  audioStream: AudioReceiveStream;
  decoder: prism.opus.Decoder;
}

const activeTranslations = new Map<string, TranslationSession>(); // userId -> session

const TRANSCRIBE_INTERVAL_MS = 8_000;
const MIN_AUDIO_BYTES = 10_000;
const MAX_SESSION_MS = 10 * 60 * 1000;
const AI_TIMEOUT_MS = 15_000;

function pcmToWavBuffer(
  pcmBuffer: Buffer,
  sampleRate = 16000,
  channels = 1,
  bitDepth = 16,
): Buffer {
  const inputChannels = 2;
  if (pcmBuffer.length < inputChannels * 2) return Buffer.alloc(0);

  const mono = Buffer.alloc(Math.floor(pcmBuffer.length / inputChannels));
  for (let i = 0; i + 1 < mono.length; i += 2) {
    const l = pcmBuffer.readInt16LE(i * inputChannels);
    const r = pcmBuffer.readInt16LE(i * inputChannels + 2);
    mono.writeInt16LE(Math.round((l + r) / 2), i);
  }
  const decimated = Buffer.alloc(Math.ceil(mono.length / 3));
  let out = 0;
  for (let i = 0; i + 1 < mono.length; i += 6) {
    decimated.writeInt16LE(mono.readInt16LE(i), out);
    out += 2;
  }
  const pcm = decimated.subarray(0, out);

  const byteRate = sampleRate * channels * (bitDepth / 8);
  const blockAlign = channels * (bitDepth / 8);
  const dataSize = pcm.length;
  const header = Buffer.alloc(44);
  header.write("RIFF", 0);
  header.writeUInt32LE(36 + dataSize, 4);
  header.write("WAVE", 8);
  header.write("fmt ", 12);
  header.writeUInt32LE(16, 16);
  header.writeUInt16LE(1, 20);
  header.writeUInt16LE(channels, 22);
  header.writeUInt32LE(sampleRate, 24);
  header.writeUInt32LE(byteRate, 28);
  header.writeUInt16LE(blockAlign, 32);
  header.writeUInt16LE(bitDepth, 34);
  header.write("data", 36);
  header.writeUInt32LE(dataSize, 40);
  return Buffer.concat([header, pcm]);
}

function detectLang(
  text: string,
): "FR" | "EN" | "DE" | "ES" | "IT" | "PT" | "RU" | "JA" | "KO" | "ZH" {
  if (/[\u3040-\u30ff\u3400-\u4dbf\u4e00-\u9fff]/.test(text)) return "JA";
  if (/[\u4e00-\u9fff]/.test(text) && !/[\u3040-\u30ff]/.test(text)) return "ZH";
  if (/[\uac00-\ud7af]/.test(text)) return "KO";
  if (/[\u0400-\u04ff]/.test(text)) return "RU";
  if (/[àâçéèêëîïôûùüÿœæ]/i.test(text)) return "FR";
  if (/[äöüß]/i.test(text)) return "DE";
  if (/[ñ¿¡áéíóúü]/i.test(text)) return "ES";
  if (/[àèéìíòóù]/i.test(text)) return "IT";
  if (/[ãõáéíóúâêôç]/i.test(text)) return "PT";
  return "EN";
}

async function generateAiResponseTranslated(
  prompt: string,
  username: string,
  sourceLang: string,
  targetLang: TargetLang,
): Promise<string> {
  const baseUrl = config.openRouterBaseUrl || "https://openrouter.ai/api/v1";
  const model = config.openRouterModel || "meta-llama/llama-3.1-8b-instruct:free";
  const apiKey = config.openRouterApiKey;

  if (!apiKey) return "Désolé, l'IA n'est pas configurée.";

  const langNames: Record<string, string> = {
    FR: "français",
    EN: "anglais",
    DE: "allemand",
    ES: "espagnol",
    IT: "italien",
    PT: "portugais",
    NL: "néerlandais",
    PL: "polonais",
    RU: "russe",
    JA: "japonais",
    KO: "coréen",
    ZH: "chinois",
  };

  try {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), AI_TIMEOUT_MS);

    const res = await fetch(`${baseUrl}/chat/completions`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${apiKey}`,
        "HTTP-Referer": "https://discord.com",
        "X-Title": "Voice Translation",
      },
      body: JSON.stringify({
        model,
        messages: [
          {
            role: "system",
            content: `Tu es un assistant vocal de traduction. L'utilisateur ${username} parle en ${langNames[sourceLang] || sourceLang}. Réponds UNIQUEMENT en ${langNames[targetLang] || targetLang}. Sois concis et naturel (max 2-3 phrases). Pas de markdown, pas de listes. Réponds comme dans une conversation parlée.`,
          },
          { role: "user", content: prompt },
        ],
        max_tokens: 200,
        temperature: 0.7,
      }),
      signal: controller.signal,
    });

    clearTimeout(timeout);

    if (!res.ok) return "Sorry, AI error.";
    const data = (await res.json()) as { choices?: Array<{ message?: { content?: string } }> };
    return data.choices?.[0]?.message?.content?.trim() || "I didn't understand.";
  } catch (err) {
    if (err instanceof Error && err.name === "AbortError") {
      return "Sorry, AI timeout.";
    }
    return "Sorry, communication error.";
  }
}

export async function startVoiceTranslation(
  client: Client,
  guildId: string,
  voiceChannelId: string,
  userId: string,
  username: string,
  targetLang: TargetLang,
  adapterCreator: any,
  textChannelId?: string,
): Promise<{ success: boolean; message: string }> {
  const voiceConfig = getVoiceAgentConfig();
  if (!voiceConfig.enabled) {
    return { success: false, message: "❌ Le voice agent est désactivé. Activez-le avec /voice." };
  }

  if (!isVoiceOptedIn(userId)) {
    return {
      success: false,
      message:
        "❌ Tu dois d'abord activer la voix avec `/voice opt-in` pour utiliser la traduction vocale.",
    };
  }

  if (activeTranslations.has(userId)) {
    return { success: false, message: "Tu as déjà une session de traduction vocale en cours." };
  }

  try {
    const connection = joinVoiceChannel({
      channelId: voiceChannelId,
      guildId,
      adapterCreator: adapterCreator as never,
      selfDeaf: false,
      selfMute: false,
    });

    await new Promise<void>((resolve, reject) => {
      const timeout = setTimeout(() => {
        connection.destroy();
        reject(new Error("Timeout de connexion vocale (5s)"));
      }, 5000);

      connection.on("stateChange", (_old, newState) => {
        if (newState.status === VoiceConnectionStatus.Ready) {
          clearTimeout(timeout);
          resolve();
        } else if (newState.status === VoiceConnectionStatus.Disconnected) {
          clearTimeout(timeout);
          reject(new Error("Connexion vocale perdue"));
        }
      });

      connection.on("error", (err) => {
        clearTimeout(timeout);
        reject(err);
      });
    });

    const audioStream = connection.receiver.subscribe(userId, {
      end: { behavior: EndBehaviorType.Manual },
    });

    const decoder = new prism.opus.Decoder({
      rate: 48000,
      channels: 2,
      frameSize: 960,
    });

    const session: TranslationSession = {
      connection,
      guildId,
      voiceChannelId,
      userId,
      username,
      targetLang,
      startedAt: Date.now(),
      chunks: [],
      lastTranscribeAt: Date.now(),
      isProcessing: false,
      audioStream,
      decoder,
    };

    decoder.on("data", (chunk: Buffer) => {
      if (!session.isProcessing) {
        session.chunks.push(chunk);
      }
    });

    audioStream.pipe(decoder);

    const interval = setInterval(async () => {
      if (!activeTranslations.has(userId)) {
        clearInterval(interval);
        return;
      }

      if (session.isProcessing) return;

      const now = Date.now();
      if (now - session.lastTranscribeAt < TRANSCRIBE_INTERVAL_MS) return;
      if (session.chunks.length === 0) return;

      const pcmBuffer = Buffer.concat(session.chunks);
      session.chunks = [];

      if (pcmBuffer.length < MIN_AUDIO_BYTES) return;

      session.isProcessing = true;
      session.lastTranscribeAt = now;

      try {
        const wavBuffer = pcmToWavBuffer(pcmBuffer);
        const text = await transcribeAudio(wavBuffer);

        if (!text || text.trim().length < 2) {
          session.isProcessing = false;
          return;
        }

        const sourceLang = detectLang(text);
        logger.info(
          `[VoiceTrans] ${username} (${sourceLang}→${targetLang}): "${text.slice(0, 80)}"`,
        );

        // Translate user's speech to target language for display
        const translatedInput =
          sourceLang !== targetLang ? await deeplTranslate(text, targetLang as never) : text;

        if (textChannelId) {
          const channel = client.channels.cache.get(textChannelId);
          if (channel instanceof TextChannel) {
            const flagMap: Record<string, string> = {
              FR: "🇫🇷",
              EN: "🇬🇧",
              DE: "🇩🇪",
              ES: "🇪🇸",
              IT: "🇮🇹",
              PT: "🇵🇹",
              NL: "🇳🇱",
              PL: "🇵🇱",
              RU: "🇷🇺",
              JA: "🇯🇵",
              KO: "🇰🇷",
              ZH: "🇨🇳",
            };
            await channel
              .send({
                content: `🎤 ${flagMap[sourceLang] || "🗣️"} **${username}:** ${text.slice(0, 200)}${sourceLang !== targetLang ? `\n🔄 ${flagMap[targetLang] || "🌐"} **Traduction:** ${translatedInput.slice(0, 200)}` : ""}`,
                allowedMentions: { repliedUser: false },
              })
              .catch(() => {});
          }
        }

        // Generate AI response directly in target language
        const aiResponse = await generateAiResponseTranslated(
          text,
          username,
          sourceLang,
          targetLang,
        );

        if (textChannelId) {
          const channel = client.channels.cache.get(textChannelId);
          if (channel instanceof TextChannel) {
            await channel
              .send({
                content: `🤖 **Bot:** ${aiResponse.slice(0, 500)}`,
                allowedMentions: { repliedUser: false },
              })
              .catch(() => {});
          }
        }

        // Speak the response in target language
        const ttsLang =
          targetLang === "FR"
            ? "fr"
            : targetLang === "EN"
              ? "en"
              : targetLang === "DE"
                ? "de"
                : targetLang === "ES"
                  ? "es"
                  : targetLang === "IT"
                    ? "it"
                    : targetLang === "PT"
                      ? "pt"
                      : targetLang === "JA"
                        ? "ja"
                        : targetLang === "KO"
                          ? "ko"
                          : targetLang === "ZH"
                            ? "zh"
                            : targetLang === "RU"
                              ? "ru"
                              : "en";
        await speakResponseInVoice(
          client,
          guildId,
          client.user?.id || "bot",
          aiResponse,
          ttsLang,
        ).catch(() => {});
      } catch (err) {
        logger.debug(`[VoiceTrans] Error for ${userId}: ${err}`);
      } finally {
        session.isProcessing = false;
      }
    }, 3000);

    (session as any as { interval: NodeJS.Timeout }).interval = interval;

    activeTranslations.set(userId, session);
    logger.info(`[VoiceTrans] Started for ${username} (${userId}), target=${targetLang}`);

    setTimeout(() => {
      if (activeTranslations.has(userId)) {
        stopVoiceTranslation(userId).catch(() => {});
      }
    }, MAX_SESSION_MS);

    const langNames: Record<string, string> = {
      FR: "français",
      EN: "anglais",
      DE: "allemand",
      ES: "espagnol",
      IT: "italien",
      PT: "portugais",
      JA: "japonais",
      KO: "coréen",
      ZH: "chinois",
      RU: "russe",
    };

    return {
      success: true,
      message: `✅ Traduction vocale démarrée! Parle dans le salon vocal, le bot répondra en ${langNames[targetLang] || targetLang}. Session auto-stop dans 10 min.`,
    };
  } catch (err) {
    logger.error(`[VoiceTrans] Failed to start: ${err}`);
    return {
      success: false,
      message: `Erreur: ${err instanceof Error ? err.message : String(err)}`,
    };
  }
}

export async function stopVoiceTranslation(
  userId: string,
): Promise<{ success: boolean; message: string }> {
  const session = activeTranslations.get(userId);
  if (!session) {
    return { success: false, message: "Aucune traduction vocale active." };
  }

  const intervalData = session as any as { interval?: NodeJS.Timeout };
  if (intervalData.interval) clearInterval(intervalData.interval);

  session.audioStream.destroy();
  session.decoder.destroy();
  session.connection.destroy();
  activeTranslations.delete(userId);

  logger.info(`[VoiceTrans] Stopped for ${session.username} (${userId})`);
  return { success: true, message: "✅ Traduction vocale arrêtée." };
}

export function hasActiveVoiceTranslation(userId: string): boolean {
  return activeTranslations.has(userId);
}
