/**
 * assemblyAi.ts — AssemblyAI API integration (audio transcription)
 *
 * Free tier: 5 hours of transcription/month
 * Uses the official AssemblyAI Node SDK for correct polling, uploads, and error handling.
 *
 * Models: universal-3-5-pro (flagship, 18 languages + code-switching) → universal-2 (fallback, 99 languages)
 * Auth: raw API key (no Bearer prefix) — handled by SDK
 *
 * Primary use: transcribe Discord voice messages, audio attachments
 */

import { AssemblyAI } from "assemblyai";
import logger from "../utils/logger.js";
import { config } from "../config.js";

export function isAssemblyAiAvailable(): boolean {
  return !!config.assemblyAiApiKey;
}

function getClient(): AssemblyAI {
  return new AssemblyAI({ apiKey: config.assemblyAiApiKey });
}

/**
 * Transcribe an audio file from URL
 * @param audioUrl URL of the audio file (public URL or AssemblyAI upload URL)
 * @returns Transcribed text or null
 */
export async function transcribeAudio(audioUrl: string): Promise<string | null> {
  if (!config.assemblyAiApiKey) return null;

  try {
    const client = getClient();

    const transcript = await client.transcripts.transcribe({
      audio: audioUrl,
      speech_models: ["universal-3-5-pro", "universal-2"],
      language_code: "fr",
    });

    if (transcript.status === "error") {
      logger.warn(`[AssemblyAI] Transcription error: ${transcript.error}`);
      return null;
    }

    return transcript.text || null;
  } catch (error) {
    logger.warn(`[AssemblyAI] transcribeAudio error: ${error instanceof Error ? error.message : String(error)}`);
    return null;
  }
}

/**
 * Transcribe audio with speaker diarization
 * @param audioUrl URL of the audio file
 * @returns Formatted transcript with speaker labels or null
 */
export async function transcribeAudioWithSpeakers(
  audioUrl: string,
): Promise<string | null> {
  if (!config.assemblyAiApiKey) return null;

  try {
    const client = getClient();

    const transcript = await client.transcripts.transcribe({
      audio: audioUrl,
      speech_models: ["universal-3-5-pro", "universal-2"],
      speaker_labels: true,
      language_code: "fr",
    });

    if (transcript.status === "error") {
      logger.warn(`[AssemblyAI] Diarization error: ${transcript.error}`);
      return null;
    }

    if (transcript.utterances && transcript.utterances.length > 0) {
      return transcript.utterances
        .map((u) => `[${u.speaker}]: ${u.text}`)
        .join("\n");
    }

    return transcript.text || null;
  } catch (error) {
    logger.warn(`[AssemblyAI] transcribeAudioWithSpeakers error: ${error instanceof Error ? error.message : String(error)}`);
    return null;
  }
}

/**
 * Transcribe a local audio file (Buffer or file path)
 * @param audio Buffer or file path
 * @returns Transcribed text or null
 */
export async function transcribeLocalAudio(
  audio: Buffer | string,
): Promise<string | null> {
  if (!config.assemblyAiApiKey) return null;

  try {
    const client = getClient();

    const transcript = await client.transcripts.transcribe({
      audio,
      speech_models: ["universal-3-5-pro", "universal-2"],
      language_code: "fr",
    });

    if (transcript.status === "error") {
      logger.warn(`[AssemblyAI] Local transcription error: ${transcript.error}`);
      return null;
    }

    return transcript.text || null;
  } catch (error) {
    logger.warn(`[AssemblyAI] transcribeLocalAudio error: ${error instanceof Error ? error.message : String(error)}`);
    return null;
  }
}

