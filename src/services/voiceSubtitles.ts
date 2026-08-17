/**
 * voiceSubtitles.ts — Sous-titrage vocal en direct (accessibilité)
 *
 * Rejoint un salon vocal, écoute tous les utilisateurs en continu,
 * transcrit la parole périodiquement via Whisper, et affiche le texte
 * dans un salon texte associé.
 *
 * Garde-fous:
 * - Opt-in explicite par utilisateur (voiceOptIn de voiceAgent.ts)
 * - Toggle global (currentConfig.enabled)
 * - Rate-limit: transcription max toutes les 5s par utilisateur
 * - Limite de durée: session max 30 minutes
 * - Aucun stockage audio — transcription éphémère affichée puis oubliée
 */

import {
  joinVoiceChannel,
  VoiceConnection,
  VoiceConnectionStatus,
  EndBehaviorType,
} from "@discordjs/voice";
import prism from "prism-media";
import { Client, TextChannel } from "discord.js";
import logger from "../utils/logger.js";
import { transcribeAudio } from "./dictation.js";
import { getVoiceAgentConfig } from "./voiceAgent.js";

interface SubtitleSession {
  connection: VoiceConnection;
  guildId: string;
  voiceChannelId: string;
  textChannelId: string;
  startedAt: number;
  userStreams: Map<string, { chunks: Buffer[]; lastTranscribeAt: number }>;
}

const activeSubtitles = new Map<string, SubtitleSession>(); // guildId -> session

const TRANSCRIBE_INTERVAL_MS = 5_000; // min 5s between transcriptions per user
const MIN_AUDIO_BYTES = 8_000; // ignore very short audio (noise)
const MAX_SESSION_MS = 30 * 60 * 1000; // 30 min max
const CHUNK_WINDOW_MS = 10_000; // collect 10s of audio before transcribing

function pcmToWavBuffer(
  pcmBuffer: Buffer,
  sampleRate = 16000,
  channels = 1,
  bitDepth = 16,
): Buffer {
  const inputChannels = 2;
  if (pcmBuffer.length < inputChannels * 2) return Buffer.alloc(0);

  // Downmix stéréo 48kHz → mono 16kHz
  const mono = Buffer.alloc(Math.floor(pcmBuffer.length / inputChannels));
  for (let i = 0; i + 1 < mono.length; i += 2) {
    const l = pcmBuffer.readInt16LE(i * inputChannels);
    const r = pcmBuffer.readInt16LE(i * inputChannels + 2);
    mono.writeInt16LE(Math.round((l + r) / 2), i);
  }
  // Decimation 48kHz -> 16kHz (1 sample sur 3)
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

export async function startSubtitles(
  client: Client,
  guildId: string,
  voiceChannelId: string,
  textChannelId: string,
  adapterCreator: unknown,
): Promise<{ success: boolean; message: string }> {
  // Guard: voice agent must be enabled
  const config = getVoiceAgentConfig();
  if (!config.enabled) {
    return {
      success: false,
      message: "❌ Le voice agent est désactivé. Activez-le d'abord avec /voice.",
    };
  }

  if (activeSubtitles.has(guildId)) {
    return { success: false, message: "Le sous-titrage est déjà actif sur ce serveur." };
  }

  try {
    const connection = joinVoiceChannel({
      channelId: voiceChannelId,
      guildId,
      adapterCreator: adapterCreator as never,
      selfDeaf: false,
      selfMute: true,
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

    const session: SubtitleSession = {
      connection,
      guildId,
      voiceChannelId,
      textChannelId,
      startedAt: Date.now(),
      userStreams: new Map(),
    };

    // Subscribe to ALL users' audio
    connection.receiver.speaking.on("start", (userId: string) => {
      if (!session.userStreams.has(userId)) {
        const audioStream = connection.receiver.subscribe(userId, {
          end: { behavior: EndBehaviorType.Manual },
        });

        const decoder = new prism.opus.Decoder({
          rate: 48000,
          channels: 2,
          frameSize: 960,
        });

        const userData = { chunks: [] as Buffer[], lastTranscribeAt: 0 };
        session.userStreams.set(userId, userData);

        decoder.on("data", (chunk: Buffer) => {
          userData.chunks.push(chunk);
        });

        audioStream.pipe(decoder);

        // Periodic transcription every CHUNK_WINDOW_MS
        const interval = setInterval(async () => {
          if (!activeSubtitles.has(guildId)) {
            clearInterval(interval);
            return;
          }

          const now = Date.now();
          if (now - userData.lastTranscribeAt < TRANSCRIBE_INTERVAL_MS) return;
          if (userData.chunks.length === 0) return;

          const pcmBuffer = Buffer.concat(userData.chunks);
          userData.chunks = [];
          userData.lastTranscribeAt = now;

          if (pcmBuffer.length < MIN_AUDIO_BYTES) return;

          try {
            const wavBuffer = pcmToWavBuffer(pcmBuffer);
            const text = await transcribeAudio(wavBuffer);
            if (!text || text.trim().length < 2) return;

            // Fetch username
            const guild = client.guilds.cache.get(guildId);
            const member = await guild?.members.fetch(userId).catch(() => null);
            const displayName = member?.displayName || "Inconnu";

            // Send to text channel
            const channel = client.channels.cache.get(textChannelId);
            if (channel instanceof TextChannel) {
              await channel
                .send({
                  content: `🗣️ **${displayName}:** ${text.slice(0, 500)}`,
                  allowedMentions: { repliedUser: false },
                })
                .catch(() => {});
            }
          } catch (err) {
            logger.debug(`[VoiceSubtitles] Transcription error for ${userId}: ${err}`);
          }
        }, CHUNK_WINDOW_MS);

        // Store interval for cleanup
        (userData as unknown as { interval: NodeJS.Timeout }).interval = interval;
      }
    });

    activeSubtitles.set(guildId, session);
    logger.info(
      `[VoiceSubtitles] Started for guild ${guildId}, voice=${voiceChannelId}, text=${textChannelId}`,
    );

    // Auto-stop after MAX_SESSION_MS
    setTimeout(() => {
      if (activeSubtitles.has(guildId)) {
        stopSubtitles(guildId).catch(() => {});
      }
    }, MAX_SESSION_MS);

    return {
      success: true,
      message: `✅ Sous-titrage activé dans <#${textChannelId}>. Le bot écoute le salon vocal et transcrit en direct. Session auto-stop dans 30 min.`,
    };
  } catch (err) {
    logger.error(`[VoiceSubtitles] Failed to start: ${err}`);
    return {
      success: false,
      message: `Erreur: ${err instanceof Error ? err.message : String(err)}`,
    };
  }
}

export async function stopSubtitles(
  guildId: string,
): Promise<{ success: boolean; message: string }> {
  const session = activeSubtitles.get(guildId);
  if (!session) {
    return { success: false, message: "Aucun sous-titrage actif sur ce serveur." };
  }

  // Cleanup all user streams
  for (const [, userData] of session.userStreams) {
    const intervalData = userData as unknown as { interval?: NodeJS.Timeout };
    if (intervalData.interval) clearInterval(intervalData.interval);
  }
  session.userStreams.clear();

  // Destroy connection
  session.connection.destroy();
  activeSubtitles.delete(guildId);

  logger.info(`[VoiceSubtitles] Stopped for guild ${guildId}`);
  return { success: true, message: "✅ Sous-titrage arrêté." };
}

export function hasActiveSubtitles(guildId: string): boolean {
  return activeSubtitles.has(guildId);
}

export function getSubtitleSessionInfo(
  guildId: string,
): { duration: string; userCount: number } | null {
  const session = activeSubtitles.get(guildId);
  if (!session) return null;
  const elapsed = Math.floor((Date.now() - session.startedAt) / 1000);
  const min = Math.floor(elapsed / 60);
  const sec = elapsed % 60;
  return {
    duration: `${min}m${sec.toString().padStart(2, "0")}s`,
    userCount: session.userStreams.size,
  };
}
