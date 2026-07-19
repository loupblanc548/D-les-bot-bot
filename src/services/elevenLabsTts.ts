/**
 * elevenLabsTts.ts — ElevenLabs Text-to-Speech (premium quality)
 *
 * Extends the existing TTS capabilities (StreamElements in freeApis.ts) with
 * ElevenLabs as a higher-quality option. Not a replacement — the admin/user
 * can choose. ElevenLabs has a real cost per character, so a monthly char
 * limit is enforced to prevent cost explosion.
 *
 * Env vars:
 *  - ELEVENLABS_API_KEY: API key (required)
 *  - ELEVENLABS_VOICE_ID: default voice ID (optional, falls back to a default)
 *  - ELEVENLABS_MONTHLY_CHAR_LIMIT: max chars per month (default 50000)
 *
 * Degrades gracefully: if not configured, returns null and the tool is filtered.
 */

import logger from "../utils/logger.js";

const ELEVENLABS_API_KEY = process.env.ELEVENLABS_API_KEY ?? "";
const DEFAULT_VOICE_ID = process.env.ELEVENLABS_VOICE_ID ?? "21m00Tcm4TlvDq8ikWAM"; // Rachel
const MONTHLY_CHAR_LIMIT = parseInt(process.env.ELEVENLABS_MONTHLY_CHAR_LIMIT ?? "50000", 10);

const MAX_CHARS_PER_CALL = 5000;

// ─── Monthly usage counter ───────────────────────────────────────────────────

let monthlyCharCount = 0;
let currentMonth = new Date().getMonth();

function resetIfNewMonth(): void {
  const now = new Date().getMonth();
  if (now !== currentMonth) {
    monthlyCharCount = 0;
    currentMonth = now;
    logger.info(`[ElevenLabs] Monthly char counter reset (month ${now + 1})`);
  }
}

export function getMonthlyUsage(): { used: number; limit: number; remaining: number } {
  resetIfNewMonth();
  return {
    used: monthlyCharCount,
    limit: MONTHLY_CHAR_LIMIT,
    remaining: Math.max(0, MONTHLY_CHAR_LIMIT - monthlyCharCount),
  };
}

// ─── Public API ──────────────────────────────────────────────────────────────

export async function generateElevenLabsTTS(
  text: string,
  voiceId?: string,
): Promise<{ audioUrl: string; charsUsed: number } | null> {
  if (!ELEVENLABS_API_KEY) {
    logger.debug("[ElevenLabs] API key not configured");
    return null;
  }

  resetIfNewMonth();

  const truncated = text.slice(0, MAX_CHARS_PER_CALL);
  if (monthlyCharCount + truncated.length > MONTHLY_CHAR_LIMIT) {
    logger.warn(
      `[ElevenLabs] Monthly char limit reached (${monthlyCharCount}/${MONTHLY_CHAR_LIMIT}) — rejecting TTS request`,
    );
    return null;
  }

  const voice = voiceId || DEFAULT_VOICE_ID;

  try {
    const res = await fetch(`https://api.elevenlabs.io/v1/text-to-speech/${voice}`, {
      method: "POST",
      headers: {
        "xi-api-key": ELEVENLABS_API_KEY,
        "Content-Type": "application/json",
        Accept: "audio/mpeg",
      },
      body: JSON.stringify({
        text: truncated,
        model_id: "eleven_multilingual_v2",
        voice_settings: { stability: 0.5, similarity_boost: 0.75 },
      }),
      signal: AbortSignal.timeout(30_000),
    });

    if (!res.ok) {
      logger.warn(`[ElevenLabs] HTTP ${res.status}: ${await res.text().catch(() => "unknown")}`);
      return null;
    }

    // ElevenLabs returns binary audio data. We need to convert to a usable format.
    // Since we can't host the audio, we return a data URL or use a temp approach.
    // For Discord, the caller should handle the buffer directly.
    const arrayBuffer = await res.arrayBuffer();
    const base64 = Buffer.from(arrayBuffer).toString("base64");
    const dataUrl = `data:audio/mpeg;base64,${base64}`;

    monthlyCharCount += truncated.length;
    logger.info(
      `[ElevenLabs] TTS generated (${truncated.length} chars, monthly total: ${monthlyCharCount}/${MONTHLY_CHAR_LIMIT})`,
    );

    return { audioUrl: dataUrl, charsUsed: truncated.length };
  } catch (err) {
    logger.warn(`[ElevenLabs] TTS error: ${err instanceof Error ? err.message : String(err)}`);
    return null;
  }
}

export function isElevenLabsConfigured(): boolean {
  return !!ELEVENLABS_API_KEY;
}
