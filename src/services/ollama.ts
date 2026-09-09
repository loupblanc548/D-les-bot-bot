import axios from "axios";
import logger from "../utils/logger.js";
import { isOllamaStandby, shouldUseLocalOllama } from "../utils/localLlmGate.js";

const OLLAMA_BASE_URL = process.env.OLLAMA_BASE_URL || "http://localhost:11434";
const OLLAMA_MODEL = process.env.OLLAMA_MODEL || "llama3.2";

/** @deprecated use isOllamaStandby() — kept so existing imports keep compiling */
export const OLLAMA_STANDBY = true;

export async function isOllamaAvailable(): Promise<boolean> {
  if (!shouldUseLocalOllama()) return false;
  try {
    const res = await axios.get(`${OLLAMA_BASE_URL}/api/tags`, { timeout: 3000 });
    return res.status === 200;
  } catch {
    return false;
  }
}

export async function generate(
  prompt: string,
  opts?: { model?: string; system?: string; temperature?: number; maxTokens?: number },
): Promise<string> {
  if (!shouldUseLocalOllama()) return "";
  try {
    const res = await axios.post(
      `${OLLAMA_BASE_URL}/api/generate`,
      {
        model: opts?.model || OLLAMA_MODEL,
        prompt,
        system: opts?.system || "",
        stream: false,
        options: { temperature: opts?.temperature ?? 0.7, num_predict: opts?.maxTokens ?? 500 },
      },
      { timeout: 60000 },
    );
    return String(res.data?.response || "");
  } catch (err) {
    logger.error(`[Ollama] generate error: ${err instanceof Error ? err.message : String(err)}`);
    return "";
  }
}

export async function chat(
  messages: { role: string; content: string }[],
  opts?: { model?: string; temperature?: number; maxTokens?: number },
): Promise<string> {
  if (!shouldUseLocalOllama()) return "";
  try {
    const res = await axios.post(
      `${OLLAMA_BASE_URL}/api/chat`,
      {
        model: opts?.model || OLLAMA_MODEL,
        messages,
        stream: false,
        options: { temperature: opts?.temperature ?? 0.7, num_predict: opts?.maxTokens ?? 500 },
      },
      { timeout: 60000 },
    );
    return String(res.data?.message?.content || "");
  } catch (err) {
    logger.error(`[Ollama] chat error: ${err instanceof Error ? err.message : String(err)}`);
    return "";
  }
}

export async function embed(text: string, model = "nomic-embed-text"): Promise<number[]> {
  if (!shouldUseLocalOllama()) return [];
  try {
    const res = await axios.post(
      `${OLLAMA_BASE_URL}/api/embeddings`,
      { model, prompt: text },
      { timeout: 30000 },
    );
    return Array.isArray(res.data?.embedding) ? res.data.embedding : [];
  } catch (err) {
    logger.error(`[Ollama] embed error: ${err instanceof Error ? err.message : String(err)}`);
    return [];
  }
}

export function isOllamaConfigured(): boolean {
  return shouldUseLocalOllama() && !!OLLAMA_BASE_URL;
}

export { isOllamaStandby };
