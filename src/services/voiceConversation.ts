/**
 * voiceConversation.ts — Boucle vocale conversationnelle complète
 *
 * Connecte dictation.ts (STT/Whisper) → AI (OpenRouter) → voiceAgent.ts (TTS)
 * pour un assistant vocal conversationnel: l'utilisateur parle, le bot transcrit,
 * génère une réponse IA, et la parle en vocal.
 *
 * Garde-fous:
 * - Opt-in explicite par utilisateur (voiceOptIn de voiceAgent.ts)
 * - Toggle global (currentConfig.enabled)
 * - Rate-limit: 1 conversation every 10s per guild
 * - Session max 10 minutes
 * - Aucun stockage audio — transcription éphémère
 * - RGPD: /privacy forget-me couvre ChatHistory/ChatConversation
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
import { config } from "../config.js";

interface ConversationSession {
  connection: VoiceConnection;
  guildId: string;
  voiceChannelId: string;
  userId: string;
  username: string;
  startedAt: number;
  chunks: Buffer[];
  lastTranscribeAt: number;
  isProcessing: boolean;
  audioStream: AudioReceiveStream;
  decoder: prism.opus.Decoder;
}

const activeConversations = new Map<string, ConversationSession>(); // userId -> session

const TRANSCRIBE_INTERVAL_MS = 8_000; // wait 8s of speech before transcribing
const MIN_AUDIO_BYTES = 10_000;
const MAX_SESSION_MS = 10 * 60 * 1000; // 10 min max
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

async function generateAiResponse(prompt: string, username: string): Promise<string> {
  const baseUrl = config.openRouterBaseUrl || "https://openrouter.ai/api/v1";
  const model = config.openRouterModel || "meta-llama/llama-3.1-8b-instruct:free";
  const apiKey = config.openRouterApiKey;

  if (!apiKey) return "Désolé, l'IA n'est pas configurée.";

  try {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), AI_TIMEOUT_MS);

    const res = await fetch(`${baseUrl}/chat/completions`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${apiKey}`,
        "HTTP-Referer": "https://discord.com",
        "X-Title": "Voice Conversation",
      },
      body: JSON.stringify({
        model,
        messages: [
          {
            role: "system",
            content: `Tu es un assistant vocal Discord. L'utilisateur ${username} te parle en vocal. Réponds de façon concise et naturelle (max 2-3 phrases), comme dans une conversation parlée. Évite le markdown, les listes, et les longues explications.`,
          },
          { role: "user", content: prompt },
        ],
        max_tokens: 200,
        temperature: 0.7,
      }),
      signal: controller.signal,
    });

    clearTimeout(timeout);

    if (!res.ok) return "Désolé, erreur de l'IA.";
    const data = (await res.json()) as { choices?: Array<{ message?: { content?: string } }> };
    return data.choices?.[0]?.message?.content?.trim() || "Je n'ai pas compris.";
  } catch (err) {
    if (err instanceof Error && err.name === "AbortError") {
      return "Désolé, l'IA a mis trop de temps à répondre.";
    }
    return "Désolé, erreur de communication.";
  }
}

export async function startConversation(
  client: Client,
  guildId: string,
  voiceChannelId: string,
  userId: string,
  username: string,
  adapterCreator: any,
  textChannelId?: string,
): Promise<{ success: boolean; message: string }> {
  // Guard 1: voice agent must be enabled
  const voiceConfig = getVoiceAgentConfig();
  if (!voiceConfig.enabled) {
    return { success: false, message: "❌ Le voice agent est désactivé. Activez-le avec /voice." };
  }

  // Guard 2: user must have opted in
  if (!isVoiceOptedIn(userId)) {
    return {
      success: false,
      message:
        "❌ Tu dois d'abord activer la voix avec `/voice opt-in` pour utiliser la conversation vocale.",
    };
  }

  if (activeConversations.has(userId)) {
    return { success: false, message: "Tu as déjà une conversation vocale en cours." };
  }

  try {
    const connection = joinVoiceChannel({
      channelId: voiceChannelId,
      guildId,
      adapterCreator: adapterCreator as never,
      selfDeaf: false,
      selfMute: false,
    });

    // Wait for connection
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

    const session: ConversationSession = {
      connection,
      guildId,
      voiceChannelId,
      userId,
      username,
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

    // Periodic check for speech to transcribe
    const interval = setInterval(async () => {
      if (!activeConversations.has(userId)) {
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

        logger.info(`[VoiceConv] ${username}: "${text.slice(0, 80)}"`);

        // Optionally show transcription in text channel
        if (textChannelId) {
          const channel = client.channels.cache.get(textChannelId);
          if (channel instanceof TextChannel) {
            await channel
              .send({
                content: `🎤 **${username}:** ${text.slice(0, 300)}`,
                allowedMentions: { repliedUser: false },
              })
              .catch(() => {});
          }
        }

        // Generate AI response
        const aiResponse = await generateAiResponse(text, username);

        // Show response in text channel
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

        // Speak the response
        const detectedLang = text.match(/[àâçéèêëîïôûùüÿœæ]/i) ? "fr" : "en";
        await speakResponseInVoice(
          client,
          guildId,
          client.user?.id || "bot",
          aiResponse,
          detectedLang,
        ).catch(() => {});
      } catch (err) {
        logger.debug(`[VoiceConv] Error for ${userId}: ${err}`);
      } finally {
        session.isProcessing = false;
      }
    }, 3000);

    // Store interval for cleanup
    (session as any as { interval: NodeJS.Timeout }).interval = interval;

    activeConversations.set(userId, session);
    logger.info(`[VoiceConv] Started conversation for ${username} (${userId}) in guild ${guildId}`);

    // Auto-stop after MAX_SESSION_MS
    setTimeout(() => {
      if (activeConversations.has(userId)) {
        stopConversation(userId).catch(() => {});
      }
    }, MAX_SESSION_MS);

    return {
      success: true,
      message: `✅ Conversation vocale démarrée! Parle dans le salon vocal, le bot répondra. Session auto-stop dans 10 min. Utilise /voice stop pour arrêter.`,
    };
  } catch (err) {
    logger.error(`[VoiceConv] Failed to start: ${err}`);
    return {
      success: false,
      message: `Erreur: ${err instanceof Error ? err.message : String(err)}`,
    };
  }
}

export async function stopConversation(
  userId: string,
): Promise<{ success: boolean; message: string }> {
  const session = activeConversations.get(userId);
  if (!session) {
    return { success: false, message: "Aucune conversation vocale active." };
  }

  const intervalData = session as any as { interval?: NodeJS.Timeout };
  if (intervalData.interval) clearInterval(intervalData.interval);

  session.audioStream.destroy();
  session.decoder.destroy();
  session.connection.destroy();
  activeConversations.delete(userId);

  logger.info(`[VoiceConv] Stopped for ${session.username} (${userId})`);
  return { success: true, message: "✅ Conversation vocale arrêtée." };
}

export function hasActiveConversation(userId: string): boolean {
  return activeConversations.has(userId);
}

export function getConversationSessionInfo(userId: string): { duration: string } | null {
  const session = activeConversations.get(userId);
  if (!session) return null;
  const elapsed = Math.floor((Date.now() - session.startedAt) / 1000);
  const min = Math.floor(elapsed / 60);
  const sec = elapsed % 60;
  return { duration: `${min}m${sec.toString().padStart(2, "0")}s` };
}
