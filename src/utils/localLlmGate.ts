/**
 * localLlmGate.ts — Qwen/Ollama stay on disk until Llama is installed.
 *
 * Default = standby: the bot does not ping Ollama, does not pre-warm, and
 * does not send chat/generate/embed requests that would load weights into RAM.
 * Model files are not deleted (`ollama rm` is never used).
 *
 * Activate later (Llama on the mini PC):
 *   LOCAL_LLM_ENABLED=true
 *   OLLAMA_STANDBY=false
 *   LOCAL_LLM_MODEL=llama3.1:8b   (or whichever Llama tag)
 *
 * Cloud GLM / Qwen via OpenRouter stay untouched — those are APIs, not RAM.
 */

export type LocalLlmEnv = NodeJS.ProcessEnv;

function envFlagTrue(value: string | undefined): boolean {
  return ["true", "1", "yes"].includes((value ?? "").trim().toLowerCase());
}

function envFlagFalse(value: string | undefined): boolean {
  return ["false", "0", "no"].includes((value ?? "").trim().toLowerCase());
}

/** Explicit opt-in. Unset / false → local weights stay unloaded. */
export function isLocalLlmEnabled(env: LocalLlmEnv = process.env): boolean {
  return envFlagTrue(env.LOCAL_LLM_ENABLED);
}

/**
 * Standby when local LLM is off, or when OLLAMA_STANDBY is explicitly true.
 * LOCAL_LLM_ENABLED=true with OLLAMA_STANDBY unset/false is enough to wake Ollama.
 */
export function isOllamaStandby(env: LocalLlmEnv = process.env): boolean {
  if (envFlagTrue(env.OLLAMA_STANDBY)) return true;
  if (envFlagFalse(env.OLLAMA_STANDBY)) return !isLocalLlmEnabled(env);
  return !isLocalLlmEnabled(env);
}

/** True only when the bot may call Ollama (and therefore load a model). */
export function shouldUseLocalOllama(env: LocalLlmEnv = process.env): boolean {
  return isLocalLlmEnabled(env) && !isOllamaStandby(env);
}
