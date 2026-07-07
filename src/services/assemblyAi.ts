/**
 * assemblyAi.ts — AssemblyAI API integration (audio transcription)
 *
 * Free tier: 5 hours of transcription/month
 * Supports: MP3, WAV, M4A, OGG, FLAC, WebM
 * Features: speaker diarization, sentiment, chapters
 *
 * Primary use: transcribe Discord voice messages, audio attachments
 */

import logger from "../utils/logger.js";
import { config } from "../config.js";

const ASSEMBLYAI_BASE_URL = "https://api.assemblyai.com/v2";

export function isAssemblyAiAvailable(): boolean {
  return !!config.assemblyAiApiKey;
}

interface AssemblyTranscriptResponse {
  id: string;
  status: "queued" | "processing" | "completed" | "error";
  text?: string;
  error?: string;
  words?: Array<{ text: string; start: number; end: number; confidence: number }>;
  utterances?: Array<{
    text: string;
    speaker: string;
    start: number;
    end: number;
  }>;
}

/**
 * Submit an audio URL for transcription
 * @param audioUrl URL of the audio file
 * @param options Transcription options
 * @returns Transcript ID
 */
async function submitTranscription(
  audioUrl: string,
  options: { speakerLabels?: boolean; sentiment?: boolean } = {},
): Promise<string | null> {
  try {
    const res = await fetch(`${ASSEMBLYAI_BASE_URL}/transcript`, {
      method: "POST",
      headers: {
        Authorization: config.assemblyAiApiKey,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        audio_url: audioUrl,
        speaker_labels: options.speakerLabels || false,
        sentiment_analysis: options.sentiment || false,
        language_code: "fr",
      }),
      signal: AbortSignal.timeout(10_000),
    });

    if (!res.ok) {
      logger.debug(`[AssemblyAI] Submit HTTP ${res.status}`);
      return null;
    }

    const data = (await res.json()) as AssemblyTranscriptResponse;
    return data.id;
  } catch (error) {
    logger.debug(`[AssemblyAI] Submit error: ${error instanceof Error ? error.message : String(error)}`);
    return null;
  }
}

/**
 * Poll for transcription completion
 * @param transcriptId Transcript ID
 * @param maxWaitMs Maximum wait time (default 60s)
 * @returns Transcribed text or null
 */
async function pollTranscription(
  transcriptId: string,
  maxWaitMs = 60_000,
): Promise<string | null> {
  const startTime = Date.now();
  const pollInterval = 3_000;

  while (Date.now() - startTime < maxWaitMs) {
    try {
      const res = await fetch(`${ASSEMBLYAI_BASE_URL}/transcript/${transcriptId}`, {
        headers: { Authorization: config.assemblyAiApiKey },
        signal: AbortSignal.timeout(5_000),
      });

      if (!res.ok) {
        logger.debug(`[AssemblyAI] Poll HTTP ${res.status}`);
        await new Promise((r) => setTimeout(r, pollInterval));
        continue;
      }

      const data = (await res.json()) as AssemblyTranscriptResponse;

      if (data.status === "completed") {
        return data.text || null;
      }

      if (data.status === "error") {
        logger.debug(`[AssemblyAI] Transcription error: ${data.error}`);
        return null;
      }

      // Still processing, wait and retry
      await new Promise((r) => setTimeout(r, pollInterval));
    } catch (error) {
      logger.debug(`[AssemblyAI] Poll error: ${error instanceof Error ? error.message : String(error)}`);
      await new Promise((r) => setTimeout(r, pollInterval));
    }
  }

  logger.debug(`[AssemblyAI] Timeout waiting for transcript ${transcriptId}`);
  return null;
}

/**
 * Transcribe an audio file from URL
 * @param audioUrl URL of the audio file
 * @returns Transcribed text or null
 */
export async function transcribeAudio(audioUrl: string): Promise<string | null> {
  if (!config.assemblyAiApiKey) return null;

  const transcriptId = await submitTranscription(audioUrl);
  if (!transcriptId) return null;

  return pollTranscription(transcriptId);
}

/**
 * Transcribe audio with speaker diarization
 * @param audioUrl URL of the audio file
 * @returns Formatted transcript with speaker labels
 */
export async function transcribeAudioWithSpeakers(
  audioUrl: string,
): Promise<string | null> {
  if (!config.assemblyAiApiKey) return null;

  const transcriptId = await submitTranscription(audioUrl, { speakerLabels: true });
  if (!transcriptId) return null;

  // For speaker-labeled transcripts, we need to fetch the full response
  const startTime = Date.now();
  const maxWaitMs = 60_000;
  const pollInterval = 3_000;

  while (Date.now() - startTime < maxWaitMs) {
    try {
      const res = await fetch(`${ASSEMBLYAI_BASE_URL}/transcript/${transcriptId}`, {
        headers: { Authorization: config.assemblyAiApiKey },
        signal: AbortSignal.timeout(5_000),
      });

      if (!res.ok) {
        await new Promise((r) => setTimeout(r, pollInterval));
        continue;
      }

      const data = (await res.json()) as AssemblyTranscriptResponse;

      if (data.status === "completed") {
        if (data.utterances && data.utterances.length > 0) {
          return data.utterances
            .map((u) => `[${u.speaker}]: ${u.text}`)
            .join("\n");
        }
        return data.text || null;
      }

      if (data.status === "error") return null;

      await new Promise((r) => setTimeout(r, pollInterval));
    } catch {
      await new Promise((r) => setTimeout(r, pollInterval));
    }
  }

  return null;
}
