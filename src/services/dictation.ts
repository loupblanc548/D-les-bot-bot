import logger from "../utils/logger";
import {
  joinVoiceChannel,
  VoiceConnection,
  VoiceConnectionStatus,
  EndBehaviorType,
  AudioReceiveStream
} from "@discordjs/voice";
import prism from "prism-media";
import { Readable } from "stream";
import { finished } from "stream/promises";
import OpenAI from "openai";
import { config } from "../config";

// \u2500\u2500\u2500 Types \u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500

interface DictationSession {
  connection: VoiceConnection;
  audioStream: AudioReceiveStream;
  decoder: prism.opus.Decoder;
  userId: string;
  targetChannelId: string;
  username: string;
  chunks: Buffer[];
  finished: boolean;
}

// \u2500\u2500\u2500 \u00c9tat global \u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500

const activeSessions = new Map<string, DictationSession>();

// \u2500\u2500\u2500 Client OpenAI (OpenRouter) \u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500

function getOpenAIClient(): OpenAI {
  return new OpenAI({
    baseURL: "https://openrouter.ai/api/v1",
    apiKey: config.openRouterApiKey,
    defaultHeaders: {
      "HTTP-Referer": "https://discord.com",
      "X-Title": "John Helldiver Dictation",
    },
  });
}

// \u2500\u2500\u2500 Conversion PCM \u2192 WAV \u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500

function pcmToWavBuffer(pcmBuffer: Buffer, sampleRate = 16000, channels = 1, bitDepth = 16): Buffer {
  // Downmix stéréo 48kHz → mono 16kHz pour Whisper (meilleure qualité de transcription)
  const inputSampleRate = 48000;
  const inputChannels = 2;
  const mono = Buffer.alloc(pcmBuffer.length / inputChannels);
  for (let i = 0; i < mono.length; i += 2) {
    // Moyenne des 2 canaux (16-bit signed LE)
    const l = pcmBuffer.readInt16LE(i * inputChannels);
    const r = pcmBuffer.readInt16LE(i * inputChannels + 2);
    mono.writeInt16LE(Math.round((l + r) / 2), i);
  }
  // Decimation 48kHz -> 16kHz (garder 1 sample sur 3)
  const decimated = Buffer.alloc(Math.ceil(mono.length / 3));
  let out = 0;
  for (let i = 0; i + 1 < mono.length; i += 6) {
    decimated.writeInt16LE(mono.readInt16LE(i), out);
    out += 2;
  }
  pcmBuffer = decimated.subarray(0, out);
  sampleRate = 16000;
  channels = 1;

  const byteRate = sampleRate * channels * (bitDepth / 8);
  const blockAlign = channels * (bitDepth / 8);
  const dataSize = pcmBuffer.length;

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

  return Buffer.concat([header, pcmBuffer]);
}

// \u2500\u2500\u2500 Transcription Whisper \u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500

export async function transcribeAudio(audioBuffer: Buffer): Promise<string> {
  if (audioBuffer.length <= 44) {
    logger.warn("\u26a0\ufe0f [Dictation] Audio vide ou trop court, transcription ignor\u00e9e.");
    return "";
  }

  const openai = getOpenAIClient();

  // Cr\u00e9er un stream lisible depuis le buffer (pas de fichier disque)
  const stream = Readable.from(audioBuffer);
  (stream as any).path = "audio.wav"; // n\u00e9cessaire pour l'API OpenAI

  try {
    const transcription = await openai.audio.transcriptions.create({
      file: stream as any,
      model: "openai/whisper-1",
      language: "fr",
    });
    return transcription.text || "";
  } catch (err) {
    logger.error("\u274c [Dictation] \u00c9chec transcription Whisper :", String(err));
    return "";
  }
}

// \u2500\u2500\u2500 D\u00e9marrage de la dict\u00e9e \u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500

export async function startDictation(
  voiceChannelId: string,
  guildId: string,
  adapterCreator: any,
  userId: string,
  username: string,
  targetChannelId: string
): Promise<void> {
  if (activeSessions.has(userId)) {
    throw new Error("Tu as d\u00e9j\u00e0 une dict\u00e9e en cours. Utilise `/dictee stop` d'abord.");
  }

  logger.info("\ud83c\udf99\ufe0f [Dictation] Connexion au salon vocal pour", username);

  const connection = joinVoiceChannel({
    channelId: voiceChannelId,
    guildId,
    adapterCreator,
    selfDeaf: false,
    selfMute: true,
  });

  // Attendre que la connexion soit pr\u00eate (stateChange + VoiceConnectionStatus.Ready)
  await new Promise<void>((resolve, reject) => {
    const timeout = setTimeout(() => {
      connection.destroy();
      reject(new Error("Timeout de connexion vocale (5s)"));
    }, 5000);

    connection.on("stateChange", (oldState, newState) => {
      if (newState.status === VoiceConnectionStatus.Ready) {
        clearTimeout(timeout);
        resolve();
      } else if (newState.status === VoiceConnectionStatus.Disconnected) {
        clearTimeout(timeout);
        reject(new Error("Connexion vocale perdue."));
      }
    });

    connection.on("error", (err) => {
      clearTimeout(timeout);
      reject(err);
    });
  });

  logger.info("\u2705 [Dictation] Connect\u00e9 au salon vocal, \u00e9coute de", username);

  const audioStream = connection.receiver.subscribe(userId, {
    end: { behavior: EndBehaviorType.Manual },
  });

  const decoder = new prism.opus.Decoder({
    rate: 48000,
    channels: 2,
    frameSize: 960,
  });

  const chunks: Buffer[] = [];
  let totalBytes = 0;
  let finished = false;
  const MAX_PCM_BYTES = 50 * 1024 * 1024; // ~5 min de dictée en PCM stéréo 48kHz

  decoder.on("data", (chunk: Buffer) => {
    totalBytes += chunk.length;
    if (totalBytes > MAX_PCM_BYTES) {
      logger.warn("⚠️ [Dictation] Limite de 50 Mo atteinte, arrêt automatique.");
      audioStream.destroy();
      return;
    }
    chunks.push(chunk);
  });

  decoder.on("end", () => {
    finished = true;
  });

  audioStream.pipe(decoder);

  activeSessions.set(userId, {
    connection,
    audioStream,
    decoder,
    userId,
    targetChannelId,
    username,
    chunks,
    finished,
  });
}

// \u2500\u2500\u2500 Arr\u00eat de la dict\u00e9e \u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500

export async function stopDictation(userId: string): Promise<{
  text: string;
  username: string;
  targetChannelId: string;
} | null> {
  const session = activeSessions.get(userId);
  if (!session) return null;

  logger.info("\u23f9\ufe0f [Dictation] Arr\u00eat de l'enregistrement pour", session.username);

  // Arr\u00eater le flux audio (Manual mode)
  session.audioStream.destroy();

  // Attendre que le decoder flush ses derniers chunks (event 'end')
  if (!session.finished) {
    try {
      await finished(session.decoder, { cleanup: true });
    } catch {
      // Le decoder peut \u00e9mettre une erreur si d\u00e9truit avant 'end'
    }
  }

  // Assembler le buffer PCM
  const pcmBuffer = Buffer.concat(session.chunks);

  // D\u00e9truire la connexion vocale
  session.connection.destroy();

  logger.info(
    "\ud83d\udcca [Dictation] Audio captur\u00e9 :",
    (pcmBuffer.length / 1024).toFixed(1),
    "Ko PCM",
    pcmBuffer.length === 0 ? "(silence)" : ""
  );

  // Audio vide ?
  if (pcmBuffer.length === 0) {
    activeSessions.delete(userId);
    return { text: "", username: session.username, targetChannelId: session.targetChannelId };
  }

  // Convertir en WAV et transcrire
  const wavBuffer = pcmToWavBuffer(pcmBuffer);

  let text = "";
  try {
    text = await transcribeAudio(wavBuffer);
  } catch (err) {
    logger.error("\u274c [Dictation] Transcription \u00e9chou\u00e9e :", String(err));
  }

  // Supprimer la session APR\u00c8S transcription (m\u00eame si \u00e9chec)
  activeSessions.delete(userId);

  const preview = text ? text.substring(0, 100) + (text.length > 100 ? "..." : "") : "(vide)";
  logger.info("\u2705 [Dictation] Transcription :", preview);

  return {
    text,
    username: session.username,
    targetChannelId: session.targetChannelId,
  };
}

export function hasActiveSession(userId: string): boolean {
  return activeSessions.has(userId);
}

export function cancelDictation(userId: string): void {
  const session = activeSessions.get(userId);
  if (!session) return;

  session.audioStream.destroy();
  session.decoder.destroy();
  session.connection.destroy();
  activeSessions.delete(userId);
  logger.info("\u26a0\ufe0f [Dictation] Session annul\u00e9e pour", session.username);
}
