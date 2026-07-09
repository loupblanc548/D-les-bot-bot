/**
 * ollama.ts — Client Ollama local pour traductions et résumés.
 *
 * Utilise le GPU local (4060 Ti) via Ollama pour:
 *  - Traduction automatique vers le français
 *  - Résumé de patch notes
 *  - Modération IA
 *
 * Fallback automatique vers OpenRouter si Ollama est indisponible.
 */

import logger from "./logger.js";

const OLLAMA_BASE_URL = process.env.OLLAMA_BASE_URL || "http://localhost:11434";
const OLLAMA_MODEL = process.env.OLLAMA_MODEL || "llama3.2:3b";
const OLLAMA_TIMEOUT_MS = parseInt(process.env.OLLAMA_TIMEOUT_MS || "30000", 10);

let ollamaAvailable = true;
let lastCheckTime = 0;
const CHECK_INTERVAL = 60_000; // Check availability every 60s

async function isOllamaAvailable(): Promise<boolean> {
  if (!ollamaAvailable && Date.now() - lastCheckTime < CHECK_INTERVAL) {
    return false;
  }
  lastCheckTime = Date.now();
  try {
    const res = await fetch(`${OLLAMA_BASE_URL}/api/tags`, {
      signal: AbortSignal.timeout(3000),
    });
    ollamaAvailable = res.ok;
    return ollamaAvailable;
  } catch {
    ollamaAvailable = false;
    return false;
  }
}

export async function ollamaChat(
  systemPrompt: string,
  userPrompt: string,
  options?: { temperature?: number; maxTokens?: number },
): Promise<string | null> {
  if (!(await isOllamaAvailable())) return null;

  try {
    const res = await fetch(`${OLLAMA_BASE_URL}/api/chat`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        model: OLLAMA_MODEL,
        messages: [
          { role: "system", content: systemPrompt },
          { role: "user", content: userPrompt },
        ],
        stream: false,
        options: {
          temperature: options?.temperature ?? 0.3,
          num_predict: options?.maxTokens ?? 500,
        },
      }),
      signal: AbortSignal.timeout(OLLAMA_TIMEOUT_MS),
    });

    if (!res.ok) {
      logger.debug(`[Ollama] HTTP ${res.status}`);
      ollamaAvailable = false;
      return null;
    }

    const data = (await res.json()) as { message?: { content?: string } };
    return data.message?.content || null;
  } catch (err) {
    logger.debug(`[Ollama] Erreur: ${err instanceof Error ? err.message : String(err)}`);
    ollamaAvailable = false;
    return null;
  }
}

export async function ollamaTranslate(text: string, targetLang = "fr"): Promise<string | null> {
  const system = `You are a translator. Translate the following text to ${targetLang}. Return ONLY the translated text, nothing else. Preserve formatting, URLs, and technical terms.`;
  return ollamaChat(system, text, { temperature: 0.2, maxTokens: 2000 });
}

export async function ollamaSummarize(content: string, maxPoints = 5): Promise<string | null> {
  const system = `Tu es un assistant gaming d'élite. Prends ce patch note brut et résume-le sous forme de ${maxPoints} points clés indispensables pour les joueurs. Style direct, punchy, sans fioritures. Réponds en français.`;
  return ollamaChat(system, content, { temperature: 0.7, maxTokens: 500 });
}

export async function ollamaDetectLanguage(text: string): Promise<string | null> {
  const system = "Detect the language of the following text. Reply with ONLY the ISO 639-1 language code (e.g., 'en', 'fr', 'es', 'de', 'ja').";
  return ollamaChat(system, text.slice(0, 500), { temperature: 0, maxTokens: 10 });
}

export { isOllamaAvailable };
