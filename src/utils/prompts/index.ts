/**
 * prompts/index.ts — Registre versionné des prompts système
 *
 * Centralise tous les prompts LLM dans un registre versionné.
 * Chaque famille de prompt est dans un fichier séparé sous prompts/.
 */

import logger from "../../utils/logger.js";

export interface PromptVersion {
  version: string;
  template: string;
  description: string;
}

type PromptRegistry = Map<string, PromptVersion>;

const registry: PromptRegistry = new Map();

export function registerPrompt(name: string, prompt: PromptVersion): void {
  registry.set(name, prompt);
  logger.debug(`[Prompts] Registered "${name}" v${prompt.version}`);
}

export function getPrompt(name: string): PromptVersion | null {
  return registry.get(name) ?? null;
}

export function listPrompts(): string[] {
  return Array.from(registry.keys());
}

export function renderPrompt(name: string, variables: Record<string, string> = {}): string {
  const prompt = registry.get(name);
  if (!prompt) {
    logger.warn(`[Prompts] Prompt "${name}" not found`);
    return "";
  }
  return prompt.template.replace(/\{\{(\w+)\}\}/g, (_, key: string) => variables[key] ?? "");
}

// ─── Built-in prompts ───────────────────────────────────────────────

registerPrompt("default", {
  version: "1.0.0",
  description: "Prompt système par défaut pour les conversations générales",
  template: `Tu es un assistant Discord serviable et amical. Réponds en français de manière concise et pertinente.

Contexte: {{context}}`,
});

registerPrompt("moderation", {
  version: "1.0.0",
  description: "Prompt pour l'analyse de modération de messages",
  template: `Tu es un modérateur de serveur Discord. Analyse le message suivant et détermine s'il enfreint les règles.

Règles:
- Pas de propos haineux, racistes, ou discriminatoires
- Pas de spam ou de flood
- Pas de liens malveillants
- Pas de harcèlement

Message à analyser: "{{message}}"

Réponds au format JSON: {"violation": boolean, "severity": "low"|"medium"|"high", "reason": "string"}`,
});

registerPrompt("summary", {
  version: "1.0.0",
  description: "Prompt pour résumer une conversation ou un fil de discussion",
  template: `Résume la conversation suivante de manière concise (max 200 mots). Mets en évidence les points clés et les décisions prises.

Conversation:
{{conversation}}`,
});

registerPrompt("agent", {
  version: "1.0.0",
  description: "Prompt système pour l'agent IA autonome",
  template: `Tu es un agent IA autonome intégré à un bot Discord. Tu peux utiliser des outils pour accomplir des tâches.

Personnalité: Amical, direct, avec un humour subtil. Tu parles français par défaut.

Capacités: Tu peux rechercher sur le web, prendre des screenshots, gérer des rappels, et plus.

Contexte additionnel: {{context}}`,
});
