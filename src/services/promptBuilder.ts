/**
 * promptBuilder.ts — Générateur de prompts à partir du template maître
 *
 * Template universel: RÔLE + CONTEXTE + TÂCHE + RÈGLES + EXEMPLES + FORMAT + CONTRAINTES + CONTENU
 *
 * Usage:
 *   const prompt = buildPrompt({
 *     domain: "modération Discord",
 *     experience: "10 ans",
 *     context: "Serveur gaming francophone...",
 *     task: "Analyse si ce message viole les règles",
 *     rules: ["Pas de spam", "Considère le contexte", "Évite les faux positifs"],
 *     examples: [{ input: "GG!", output: '{"violation": false}' }],
 *     format: '{"verdict": "...", "confidence": 0-100}',
 *     constraints: ["Réponds en JSON strict", "Max 500 tokens"],
 *     content: "Message à analyser...",
 *   });
 */

// ─── Types ────────────────────────────────────────────────────────────

export interface PromptExample {
  input: string;
  output: string;
}

export interface PromptBuilderOptions {
  domain: string;
  experience?: string;
  context: string;
  task: string;
  rules?: string[];
  examples?: PromptExample[];
  format?: string;
  constraints?: string[];
  content: string;
}

// ─── Template maître ──────────────────────────────────────────────────

export const MASTER_TEMPLATE = `Tu es un expert en {DOMAIN} avec {EXPERIENCE} ans d'expérience.

CONTEXTE:
{CONTEXT}

TÂCHE:
{TASK}

RÈGLES:
{RULES}

EXEMPLES:
{EXAMPLES}

FORMAT RÉPONSE:
{FORMAT}

CONTRAINTES SUPPLÉMENTAIRES:
{CONSTRAINTS}

{CONTENT}`;

// ─── Builder ──────────────────────────────────────────────────────────

export function buildPrompt(opts: PromptBuilderOptions): string {
  const rules = (opts.rules ?? [])
    .map((r, i) => `- ${r}`)
    .join("\n") || "- Aucune règle spécifique";

  const examples = (opts.examples ?? [])
    .map((ex, i) => `- Exemple ${i + 1}: ${ex.input} → ${ex.output}`)
    .join("\n") || "- Aucun exemple";

  const format = opts.format ?? "Réponds naturellement en gardant ton rôle";

  const constraints = (opts.constraints ?? [])
    .map((c) => `- ${c}`)
    .join("\n") || "- Aucune contrainte supplémentaire";

  return MASTER_TEMPLATE
    .replace("{DOMAIN}", opts.domain)
    .replace("{EXPERIENCE}", String(opts.experience ?? "10"))
    .replace("{CONTEXT}", opts.context)
    .replace("{TASK}", opts.task)
    .replace("{RULES}", rules)
    .replace("{EXAMPLES}", examples)
    .replace("{FORMAT}", format)
    .replace("{CONSTRAINTS}", constraints)
    .replace("{CONTENT}", opts.content.slice(0, 4000));
}

// ─── Presets ──────────────────────────────────────────────────────────

export const MODERATION_PRESET: Omit<PromptBuilderOptions, "content"> = {
  domain: "modération Discord",
  experience: "10",
  context: "Serveur gaming francophone avec règles standards (pas de spam, pas d'insultes, pas de phishing, respect mutuel). Le trash talk gaming est toléré dans une certaine mesure.",
  task: "Analyse si le message viole les règles et recommande une action.",
  rules: [
    "Considère le contexte gaming (trash talk toléré)",
    "Distingue blague et harcèlement",
    "Évite les faux positifs",
    "Considère l'intention derrière le message",
    "Sois juste mais strict",
  ],
  examples: [
    { input: "GG bien joué les gars!", output: '{"violation": false, "action": "none"}' },
    { input: "Free Nitro! discord.gg/scam", output: '{"violation": true, "action": "ban", "type": "phishing"}' },
    { input: "T'es nul à ce jeu", output: '{"violation": false, "action": "none", "note": "trash talk toléré"}' },
  ],
  format: '{"violation": true|false, "severity": 1-5, "action": "none|warn|timeout|kick|ban", "reason": "...", "confidence": 0-100}',
  constraints: [
    "Réponds en JSON strict valide",
    "Pas de modération excessive",
    "Confiance basée sur la clarté de la violation",
  ],
};

export const SECURITY_PRESET: Omit<PromptBuilderOptions, "content"> = {
  domain: "cyber-sécurité et threat intelligence",
  experience: "15",
  context: "Analyse de menaces sur Discord: phishing, malware, raid, scam. Domaines de gaming (steam, discord, twitch) sont sûrs par défaut.",
  task: "Analyse la cible (IP, domaine, message) et évalue le niveau de menace.",
  rules: [
    "Distingue certitude et probabilité",
    "Donne des sources quand possible",
    "Si données limitées, indique-le clairement",
    "Les domaines gaming connus sont sûrs par défaut",
    "Recommande des actions de sécurité",
  ],
  examples: [
    { input: "discord.com", output: '{"threat_level": "none", "confidence": 100}' },
    { input: "discord-nitro-free.xyz", output: '{"threat_level": "high", "confidence": 90, "type": "phishing"}' },
  ],
  format: '{"target": "...", "threat_level": "none|low|medium|high|critical", "findings": {}, "actions_recommended": [], "confidence": 0-100}',
  constraints: [
    "Réponds en JSON strict valide",
    "Base-toi sur les faits, pas sur des suppositions",
    "Indique 'données limitées' si nécessaire",
  ],
};

export const SENTIMENT_PRESET: Omit<PromptBuilderOptions, "content"> = {
  domain: "analyse de sentiment et psychologie",
  experience: "8",
  context: "Analyse de messages Discord gaming francophone. Le sarcasme et le trash talk sont courants et ne sont pas nécessairement toxiques.",
  task: "Analyse le sentiment et la toxicité du message sur 5 dimensions.",
  rules: [
    "Distingue sarcasme et toxicité réelle",
    "Le trash talk gaming est toléré",
    "Considère le contexte conversationnel",
    "Évalue l'intention, pas juste les mots",
  ],
  examples: [
    { input: "GG bien joué!", output: '{"sentiment": "positif", "toxicity": 0, "confidence": 95}' },
    { input: "Je vais te trouver IRL", output: '{"sentiment": "négatif", "toxicity": 8, "confidence": 90, "type": "menace"}' },
  ],
  format: '{"sentiment": "très_positif|positif|neutre|négatif|très_négatif", "toxicity": 0-10, "urgency": 0-10, "confidence": 0-100, "summary": "..."}',
  constraints: [
    "Réponds en JSON strict valide",
    "Évalue l'intention, pas juste les mots",
  ],
};

export const CODE_REVIEW_PRESET: Omit<PromptBuilderOptions, "content"> = {
  domain: "sécurité logicielle",
  experience: "20",
  context: "Spécialité: vulnérabilités Web. Certifications: OSCP, CEH. Track record: 500+ bugs trouvés.",
  task: "Analyse le code fourni pour identifier les vulnérabilités et problèmes de qualité.",
  rules: [
    "Couvre 5 catégories: sécurité, performance, qualité, bugs, suggestions",
    "Priorise par sévérité (critique → info)",
    "Donne des exemples de fix pour chaque problème",
    "Considère le contexte du projet",
  ],
  examples: [
    { input: "eval(userInput)", output: '{"severity": "critical", "issue": "Code injection via eval", "fix": "Use JSON.parse or sanitize input"}' },
  ],
  format: "Markdown avec sections: ## Sécurité, ## Performance, ## Qualité, ## Bugs, ## Suggestions",
  constraints: [
    "Réponds en Markdown structuré",
    "Sois spécifique sur les vulnérabilités",
    "Donne des fixes actionnables",
  ],
};

// ─── Helper: build from preset ────────────────────────────────────────

export function buildFromPreset(
  preset: Omit<PromptBuilderOptions, "content">,
  content: string,
  overrides?: Partial<PromptBuilderOptions>,
): string {
  return buildPrompt({ ...preset, ...overrides, content });
}

// ─── Helper: list presets ─────────────────────────────────────────────

export function listPresets(): { key: string; name: string; domain: string }[] {
  return [
    { key: "moderation", name: "Modération", domain: "modération Discord" },
    { key: "security", name: "Sécurité", domain: "cyber-sécurité" },
    { key: "sentiment", name: "Sentiment", domain: "analyse de sentiment" },
    { key: "code-review", name: "Code Review", domain: "sécurité logicielle" },
  ];
}

export function getPreset(key: string): Omit<PromptBuilderOptions, "content"> | null {
  switch (key) {
    case "moderation": return MODERATION_PRESET;
    case "security": return SECURITY_PRESET;
    case "sentiment": return SENTIMENT_PRESET;
    case "code-review": return CODE_REVIEW_PRESET;
    default: return null;
  }
}
