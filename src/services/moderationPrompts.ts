/**
 * moderationPrompts.ts — Templates de prompts structurés pour la modération IA
 *
 * Format: RÔLE + CONTEXTE + TÂCHE + CONTRAINTES + FORMAT SORTIE
 * Utilisés par ai-moderation.ts, sentiment-analysis.ts, et l'agent autonome.
 */

export interface ModerationVerdict {
  verdict: "spam" | "phishing" | "clean";
  confidence: number;
  raison: string;
  action: "delete" | "warn" | "ban" | "none";
}

export interface DeepSentimentResult {
  sentiment: "très_positif" | "positif" | "neutre" | "négatif" | "très_négatif";
  dimensions: {
    positivité: number;
    agressivité: number;
    spam: number;
    phishing: number;
    harcèlement: number;
  };
  risque_global: number;
  flags: string[];
  action_recommandée: "rien" | "warn" | "timeout" | "kick" | "ban";
  explication: string;
}

// ─── Prompt 1: Spam/Phishing Detection ───────────────────────────────

export const SPAM_PHISHING_PROMPT = `Tu es un modérateur Discord expert avec 10 ans d'expérience.

CONTEXTE:
Un utilisateur a écrit un message sur le serveur de gaming.
Le message peut contenir du spam et des liens suspects.

TÂCHE:
Analyse ce message et détermine si c'est du spam/phishing.

CONTRAINTES:
- Sois strict mais juste
- Explique ta décision
- Pas de faux positifs
- Vérifie les patterns classiques: liens suspects, répétition, all-caps, emojis excessifs, promesses irréalistes
- Les liens discord.gg/ sont légitimes sauf s'ils mènent à un serveur de scam
- Le langage familier/gaming n'est PAS du spam

FORMAT SORTIE (JSON strict):
{
  "verdict": "spam|phishing|clean",
  "confidence": 0-100,
  "raison": "...",
  "action": "delete|warn|ban|none"
}`;

export function buildSpamPhishingPrompt(message: string, _context?: string): string {
  return `${SPAM_PHISHING_PROMPT}

MESSAGE À ANALYSER:
"${message.slice(0, 2000)}"`;
}

// ─── Prompt 2: Deep Sentiment Analysis (5 dimensions) ────────────────

export const DEEP_SENTIMENT_PROMPT = `Tu es un expert en analyse de sentiment avec 15 ans d'expérience en psychologie.
Tu analyses les messages Discord pour détecter les toxicités cachées.

TÂCHE:
Analyser le sentiment du message suivant sur 5 dimensions:
1. Positivité/Négativité
2. Agressivité
3. Spam/Flood
4. Phishing/Scam
5. Harcèlement

RÈGLES:
- Sois très strict sur les patterns suspects
- Détecte les sarcasmes toxiques
- Regarde aussi ce qui n'est pas dit (implicite)
- Considère le contexte du serveur (gaming, francophone)
- Le trash talk gaming léger n'est PAS de l'agressivité
- Les insultes entre amis qui se connaissent ne sont PAS du harcèlement

FORMAT RÉPONSE (JSON strict):
{
  "sentiment": "très_positif|positif|neutre|négatif|très_négatif",
  "dimensions": {
    "positivité": -10 à +10,
    "agressivité": 0-10,
    "spam": 0-10,
    "phishing": 0-10,
    "harcèlement": 0-10
  },
  "risque_global": 0-100,
  "flags": ["flag1", "flag2"],
  "action_recommandée": "rien|warn|timeout|kick|ban",
  "explication": "..."
}`;

export function buildDeepSentimentPrompt(message: string, context?: string): string {
  const ctx = context ? `\nCONTEXTE ADDITIONNEL: ${context}` : "";
  return `${DEEP_SENTIMENT_PROMPT}

MESSAGE À ANALYSER:
"${message.slice(0, 2000)}"${ctx}`;
}

// ─── Prompt 3: Threat Detection & User Risk Assessment (7 factors) ──

export interface ThreatAssessment {
  risk_score: number;
  risk_level: "très_bas" | "bas" | "moyen" | "élevé" | "très_élevé" | "critique";
  factors: {
    new_account: number;
    message_rate: number;
    raid_pattern: number;
    phishing: number;
    spam: number;
    harassment: number;
    malware: number;
  };
  action: "monitor" | "warn" | "timeout" | "kick" | "ban" | "investigate";
  confidence: number;
  reasoning: string;
}

export const THREAT_DETECTION_PROMPT = `Tu es un expert en détection de menaces cyber et social engineering.

TÂCHE:
Analyser le profil d'un utilisateur et calculer son niveau de risque sur 7 dimensions.

CALCULER LE RISQUE SUR:
1. Nouveau compte (age < 7 jours)
2. Taux de messages anormal
3. Patterns de raid
4. Phishing/Scam attempts
5. Spam/Flood
6. Harcèlement
7. Contenu malveillant

RÈGLES:
- Pèse lourd les comportements coordonnés
- Considère les tendances long-terme
- Regarde les anomalies temporelles
- Basé uniquement sur les faits fournis
- Pas de profilage discriminatoire
- Le contexte gaming permet une tolérance au trash talk
- Considère la récidive vs première offense

FORMAT SORTIE (JSON strict):
{
  "risk_score": 0-100,
  "risk_level": "très_bas|bas|moyen|élevé|très_élevé|critique",
  "factors": {
    "new_account": 0-10,
    "message_rate": 0-10,
    "raid_pattern": 0-10,
    "phishing": 0-10,
    "spam": 0-10,
    "harassment": 0-10,
    "malware": 0-10
  },
  "action": "monitor|warn|timeout|kick|ban|investigate",
  "confidence": 0-100,
  "reasoning": "..."
}`;

export interface UserProfile {
  accountAgeDays: number;
  messageCount: number;
  violations: number;
  suspiciousBehaviors: string[];
  history: string[];
  sanctions?: number;
  warnings?: number;
  recentActions?: string[];
}

export function buildThreatDetectionPrompt(profile: UserProfile): string {
  return `${THREAT_DETECTION_PROMPT}

PROFIL UTILISATEUR À ANALYSER:
- Compte age: ${profile.accountAgeDays} jours
- Messages: ${profile.messageCount}
- Violations précédentes: ${profile.violations}
- Comportement suspect: ${profile.suspiciousBehaviors.join(", ") || "aucun"}
- Historique: ${profile.history.slice(0, 15).join(", ") || "vide"}${profile.sanctions !== undefined ? `\n- Sanctions: ${profile.sanctions}` : ""}${profile.warnings !== undefined ? `\n- Avertissements: ${profile.warnings}` : ""}`;
}

// ─── Prompt 4: Link Safety Analysis ──────────────────────────────────

export const LINK_SAFETY_PROMPT = `Tu es un expert en cybersécurité spécialisé dans la détection de liens malveillants.

TÂCHE:
Analyser si un lien est sûr ou potentiellement dangereux.

CONTRAINTES:
- Vérifie le domaine, le format, les caractères suspects
- Les raccourcisseurs d'URL (bit.ly, tinyurl) sont suspects
- Les domaines qui imitent des sites connus (typosquatting) sont dangereux
- Les liens discord.com/discord.gg sont légitimes
- Les liens youtube.com/twitch.tv/steam.com sont légitimes en contexte gaming

FORMAT SORTIE (JSON strict):
{
  "sûr": true|false,
  "confiance": 0-100,
  "type_menace": "phishing|malware|scam|aucun",
  "raison": "...",
  "action": "autoriser|bloquer|avertir"
}`;

export function buildLinkSafetyPrompt(url: string): string {
  return `${LINK_SAFETY_PROMPT}

LIEN À ANALYSER:
${url}`;
}

// ─── Prompt 5: Message Context Analysis ──────────────────────────────

export const CONTEXT_ANALYSIS_PROMPT = `Tu es un modérateur Discord expert en analyse contextuelle.

TÂCHE:
Analyser un message dans son contexte (messages précédents) pour déterminer si une action de modération est nécessaire.

CONTRAINTES:
- Le contexte est crucial: une blague entre amis ≠ harcèlement
- Considère le ton de la conversation
- Une escalade soudaine est un signal d'alarme
- Le sarcasme peut être toxique selon le contexte

FORMAT SORTIE (JSON strict):
{
  "action_nécessaire": true|false,
  "type": "spam|toxicité|harcèlement|phishing|aucun",
  "sévérité": "faible|moyenne|élevée|critique",
  "explication": "...",
  "action_recommandée": "rien|warn|timeout|kick|ban"
}`;

export function buildContextAnalysisPrompt(
  targetMessage: string,
  previousMessages: string[],
): string {
  const context = previousMessages.slice(-10).map((m, i) => `[${i + 1}] ${m}`).join("\n");
  return `${CONTEXT_ANALYSIS_PROMPT}

MESSAGES PRÉCÉDENTS (contexte):
${context}

MESSAGE CIBLE À ANALYSER:
"${targetMessage.slice(0, 2000)}"`;
}

// ─── Helper: Parse JSON from LLM response ─────────────────────────────

export function parseJsonResponse<T>(content: string): T | null {
  try {
    const cleaned = content
      .replace(/```json\s*/gi, "")
      .replace(/```\s*/g, "")
      .trim();
    const jsonStart = cleaned.indexOf("{");
    const jsonEnd = cleaned.lastIndexOf("}");
    if (jsonStart === -1 || jsonEnd === -1) return null;
    return JSON.parse(cleaned.slice(jsonStart, jsonEnd + 1)) as T;
  } catch {
    return null;
  }
}
