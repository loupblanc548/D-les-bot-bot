/**
 * localTts.ts — Local TTS via Piper (on-device, no API needed)
 *
 * Piper is a fast, local neural TTS that runs on CPU.
 * - Model: fr_FR-siwis-medium (61 MB, French voice)
 * - Speed: ~0.4x real-time on the VPS CPU
 * - Quality: good neural voice, not robotic
 * - Cost: free, unlimited, no API key
 *
 * Installed at /opt/piper/ on the VPS.
 * Voices at /opt/piper/voices/
 */

import { execFile } from "node:child_process";
import { promisify } from "node:util";
import { readFile, unlink, mkdir, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { randomUUID } from "node:crypto";
import logger from "../utils/logger.js";

const execFileAsync = promisify(execFile);

const PIPER_BIN = process.env.PIPER_BIN || "/opt/piper/piper";
const PIPER_VOICES = process.env.PIPER_VOICES || "/opt/piper/voices";

// Voice mapping per language
const VOICE_MAP: Record<string, string> = {
  fr: "fr_FR-siwis-medium.onnx",
  en: "en_US-lessac-medium.onnx",
  es: "es_ES-carlfm-medium.onnx",
  de: "de_DE-thorsten-medium.onnx",
  it: "it_IT-riccardo-x_low.onnx",
};

// Cache availability check
let piperAvailable: boolean | null = null;

/**
 * Check if Piper TTS is installed and the French voice is available.
 */
export async function checkPiperAvailability(): Promise<boolean> {
  try {
    const { stat } = await import("node:fs/promises");
    await stat(PIPER_BIN);
    await stat(join(PIPER_VOICES, VOICE_MAP.fr));
    if (piperAvailable !== true) {
      logger.info("[LocalTTS] ✅ Piper TTS disponible — voix française locale");
    }
    piperAvailable = true;
    return true;
  } catch {
    if (piperAvailable !== false) {
      logger.info("[LocalTTS] Piper TTS non disponible — fallback Edge TTS/Google");
    }
    piperAvailable = false;
    return false;
  }
}

/**
 * Quick synchronous check (uses cached result).
 */
export function isPiperAvailable(): boolean {
  return piperAvailable === true;
}

/**
 * Generate speech audio locally via Piper TTS.
 * @param text Text to synthesize (max 500 chars)
 * @param lang Language code (fr, en, es, de, it)
 * @returns WAV audio buffer, or null if failed
 */
export async function generateLocalTTS(
  text: string,
  lang: string = "fr",
): Promise<Buffer | null> {
  if (piperAvailable === null) {
    await checkPiperAvailability();
  }
  if (!piperAvailable) return null;

  const voiceFile = VOICE_MAP[lang] || VOICE_MAP.fr;
  const voicePath = join(PIPER_VOICES, voiceFile);

  // Clean text for TTS
  const cleanText = text
    .replace(/```[\s\S]*?```/g, " code ")
    .replace(/`([^`]+)`/g, "$1")
    .replace(/[*_~|#>]/g, "")
    .replace(/https?:\/\/\S+/g, "")
    .replace(/\s+/g, " ")
    .trim()
    .slice(0, 500);

  if (!cleanText) return null;

  const ttsDir = join(tmpdir(), "bot-piper-tts");
  const filename = `tts-${randomUUID()}.wav`;
  const filepath = join(ttsDir, filename);

  try {
    await mkdir(ttsDir, { recursive: true, mode: 0o700 });

    const startTime = Date.now();

    // Write text to temp input file (piper reads from stdin or --input_file)
    const inputPath = filepath + ".txt";
    await writeFile(inputPath, cleanText, { mode: 0o600 });

    const { stderr } = await execFileAsync(
      PIPER_BIN,
      ["--model", voicePath, "--input_file", inputPath, "--output_file", filepath],
      {
        timeout: 10_000,
        maxBuffer: 1024 * 1024,
      },
    );

    // Cleanup input file
    unlink(inputPath).catch(() => {});

    const elapsed = Date.now() - startTime;
    const audioBuffer = await readFile(filepath);

    if (audioBuffer.length < 1000) {
      logger.warn(`[LocalTTS] Audio trop court (${audioBuffer.length} bytes) — possible échec`);
      return null;
    }

    logger.info(
      `[LocalTTS] ✅ Audio généré (${audioBuffer.length} bytes, ${elapsed}ms, voix: ${voiceFile}) — Piper local`,
    );

    // Log piper stats from stderr if available
    if (stderr && stderr.includes("Real-time factor")) {
      const rtfMatch = stderr.match(/Real-time factor: ([\d.]+)/);
      if (rtfMatch) {
        logger.debug(`[LocalTTS] Piper RTF: ${rtfMatch[1]} (lower = faster)`);
      }
    }

    return audioBuffer;
  } catch (error) {
    logger.warn(
      `[LocalTTS] Échec Piper: ${error instanceof Error ? error.message : String(error)}`,
    );
    return null;
  } finally {
    // Cleanup temp file
    unlink(filepath).catch(() => {});
  }
}
