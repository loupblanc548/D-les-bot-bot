/**
 * promptSanitizer.ts — Sanitization des inputs avant envoi aux LLM
 *
 * Protège contre:
 * - Prompt injection (instructions cachées dans le contenu utilisateur)
 * - Data exfiltration via LLM (commandes système simulées)
 * - Jailbreak attempts
 */

const INJECTION_PATTERNS = [
  /ignore (all )?(previous|above|prior) instructions/gi,
  /disregard (the )?(system|previous|above) prompt/gi,
  /you are (now )?(a|an) (different|new)/gi,
  /forget (everything|all|your|previous)/gi,
  /act as (if you are|a|an)/gi,
  /pretend (you are|to be)/gi,
  /system prompt/gi,
  /reveal (your|the) (system|initial|original) prompt/gi,
  /show (me )?(your|the) (system|initial|original) (prompt|instructions)/gi,
  /\[SYSTEM\]/gi,
  /\[ADMIN\]/gi,
  /\[/INST\]/gi,
  /<\|system\|>/gi,
  /<\|im_start\|>/gi,
  /new instructions:/gi,
  /override (your|the) (system|rules|instructions)/gi,
];

const EXFIL_PATTERNS = [
  /process\.env/gi,
  /dotenv/gi,
  /API_KEY/gi,
  /SECRET/gi,
  /TOKEN/gi,
  /PASSWORD/gi,
  /file:/gi,
  /etc\/passwd/gi,
  /\.env\b/gi,
  /docker-compose/gi,
];

/**
 * Sanitize un input utilisateur avant de l'inclure dans un prompt LLM.
 * - Supprime les tentatives d'injection de prompt
 * - Masque les patterns d'exfiltration de données
 * - Limite la longueur
 */
export function sanitizePromptInput(input: string, maxLength = 4000): string {
  let sanitized = input;

  // Limiter la longueur
  if (sanitized.length > maxLength) {
    sanitized = sanitized.slice(0, maxLength);
  }

  // Supprimer les patterns d'injection
  for (const pattern of INJECTION_PATTERNS) {
    sanitized = sanitized.replace(pattern, "[FILTERED]");
  }

  // Masquer les patterns d'exfiltration
  for (const pattern of EXFIL_PATTERNS) {
    sanitized = sanitized.replace(pattern, "[REDACTED]");
  }

  // Supprimer les caractères de contrôle non imprimables
  sanitized = sanitized.replace(/[\x00-\x08\x0B\x0C\x0E-\x1F\x7F]/g, "");

  return sanitized;
}

/**
 * Sanitize un tableau de messages pour un call LLM.
 * Préserve les messages system/assistant, sanitize uniquement les messages user.
 */
export function sanitizeConversationMessages(
  messages: Array<{ role: string; content: string }>,
): Array<{ role: string; content: string }> {
  return messages.map((msg) => {
    if (msg.role === "user") {
      return { ...msg, content: sanitizePromptInput(msg.content) };
    }
    return msg;
  });
}

/**
 * Wrapper pour sanitizer une string avant de l'envoyer à un LLM.
 * À utiliser sur tout input provenant de Discord (messages, attachments, etc.)
 */
export function sanitizeForLlm(input: string): string {
  return sanitizePromptInput(input);
}
