/**
 * moderationPrompts.ts — Templates de prompts structurés pour la modération IA
 *
 * Format: RÔLE + CONTEXTE + TÂCHE + CONTRAINTES + FORMAT SORTIE
 * Utilisés par ai-moderation.ts, sentiment-analysis.ts, et l'agent autonome.
 */

export interface ModerationVerdict {
  reasoning?: {
    step1_patterns: string;
    step2_match: string;
    step3_context: string;
    step4_verdict: string;
  };
  verdict: "spam" | "phishing" | "clean";
  confidence: number;
  raison: string;
  action: "delete" | "warn" | "ban" | "none";
}

export interface DeepSentimentResult {
  reasoning?: {
    step1_dimensions: string;
    step2_evidence: string;
    step3_context: string;
    step4_conclusion: string;
  };
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

EXEMPLES DE CLASSIFICATION:

Exemple 1:
Message: "Hey tu veux t'amuser?"
Classification: CLEAN

Exemple 2:
Message: "CLICK HERE NOW!!! FREE MONEY!!!"
Classification: SPAM

Exemple 3:
Message: "discord.gg/scam"
Classification: PHISHING

Exemple 4:
Message: "GG bien joué les gars, on les a eu"
Classification: CLEAN

Exemple 5:
Message: "Free Nitro! Claim now at discord-nitro-free.xyz"
Classification: PHISHING

Exemple 6:
Message: "SPAM SPAM SPAM SPAM SPAM"
Classification: SPAM

Exemple 7:
Message: "T'es nul à ce jeu frérot"
Classification: CLEAN

Exemple 8:
Message: "Clique ici pour gagner un iPhone 15 → bit.ly/free-iphone"
Classification: PHISHING

FORMAT SORTIE (JSON strict):
{
  "reasoning": {
    "step1_patterns": "Quels patterns de spam typiques sont présents?",
    "step2_match": "Ce message contient-il ces patterns?",
    "step3_context": "Y a-t-il du contexte qui change l'analyse?",
    "step4_verdict": "Verdict final et justification"
  },
  "verdict": "spam|phishing|clean",
  "confidence": 0-100,
  "raison": "...",
  "action": "delete|warn|ban|none"
}`;

export function buildSpamPhishingPrompt(message: string, _context?: string): string {
  return `${SPAM_PHISHING_PROMPT}

Réfléchis étape par étape:
1. Quels sont les patterns de spam typiques pertinents ici?
2. Ce message contient-il ces patterns?
3. Y a-t-il du contexte qui change l'analyse?
4. Quel est ton verdict final?

Réponds en détail pour chaque étape, puis donne le JSON final.

Message: "${message.slice(0, 2000)}"`;
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

EXEMPLES D'ANALYSE:

Exemple 1:
Message: "GG bien joué!"
Sentiment: positif | Agressivité: 0 | Spam: 0 | Phishing: 0 | Harcèlement: 0

Exemple 2:
Message: "T'es vraiment le pire joueur que j'ai jamais vu, dégage"
Sentiment: négatif | Agressivité: 7 | Spam: 0 | Phishing: 0 | Harcèlement: 6

Exemple 3:
Message: "Free Nitro! Claim now!"
Sentiment: neutre | Agressivité: 0 | Spam: 9 | Phishing: 8 | Harcèlement: 0

Exemple 4:
Message: "Lol t'es mauvais frérot"
Sentiment: neutre | Agressivité: 2 | Spam: 0 | Phishing: 0 | Harcèlement: 1

Exemple 5:
Message: "Je vais te trouver IRL et te faire payer"
Sentiment: très_négatif | Agressivité: 10 | Spam: 0 | Phishing: 0 | Harcèlement: 10

FORMAT RÉPONSE (JSON strict):
{
  "reasoning": {
    "step1_dimensions": "Quelles dimensions sont pertinentes pour ce message?",
    "step2_evidence": "Quelles preuves textuelles supportent chaque score?",
    "step3_context": "Le contexte gaming change-t-il l'analyse?",
    "step4_conclusion": "Synthèse et niveau de risque"
  },
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

Réfléchis étape par étape:
1. Quelles dimensions sont pertinentes pour ce message?
2. Quelles preuves textuelles supportent chaque score?
3. Le contexte gaming change-t-il l'analyse?
4. Quelle est ta synthèse et le niveau de risque final?

Réponds en détail pour chaque étape, puis donne le JSON final.

Message: "${message.slice(0, 2000)}"${ctx}`;
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

CONTRAINTES DE FORMAT:
- EXACTEMENT 5 points clés dans le reasoning
- Langage technique mais compréhensible
- Action recommandée explicite (pas de "peut-être")
- Pas de jargon obscur sans explication
- Chaque facteur doit avoir une justification courte

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

CONTRAINTES DE FORMAT:
- EXACTEMENT 3 points dans l'explication (contexte, analyse, verdict)
- Action recommandée explicite (pas de "peut-être")
- Langage technique mais compréhensible
- Pas de jargon obscur

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

// ─── Prompt 6: Code Review IA ────────────────────────────────────────

export const CODE_REVIEW_PROMPT = `Tu es un expert en sécurité logicielle avec:
- 20 ans d'expérience
- Spécialité: vulnérabilités Web
- Certifications: OSCP, CEH
- Track record: 500+ bugs trouvés

Avec cette expertise, analyse ce code TypeScript/JavaScript pour:
1. Failles de sécurité
2. Performance issues
3. Code smell
4. Best practices violations
5. Bugs potentiels

RÈGLES:
- Sois très critique
- Priorise les failles de sécurité
- Suggère des solutions concrètes
- Donne du code d'exemple pour chaque correction
- Considère le contexte (framework, version, environnement)
- Vérifie: injection, XSS, CSRF, hardcoded secrets, eval, prototype pollution, ReDoS, memory leaks

FORMAT RÉPONSE (Markdown):
# Code Review

## 🔴 Sécurité (Critiques)
- Issue: [description]
  Correction: [code ou explication]

## 🟠 Performance
- Issue: [description]
  Correction: [code ou explication]

## 🟡 Code Quality
- Issue: [description]
  Correction: [code ou explication]

## 🟢 Suggestions
- Suggestion: [description]`;

export function buildCodeReviewPrompt(
  code: string,
  context: { framework?: string; version?: string; environment?: string } = {},
): string {
  const ctx = [
    context.framework ? `- Framework: ${context.framework}` : null,
    context.version ? `- Version: ${context.version}` : null,
    context.environment ? `- Environnement: ${context.environment}` : null,
  ].filter(Boolean).join("\n");

  return `${CODE_REVIEW_PROMPT}

CONTEXTE:
${ctx || "- Projet Discord.js/TypeScript"}

CODE À ANALYSER:
\`\`\`
${code.slice(0, 4000)}
\`\`\``;
}

// ─── Prompt 7: Threat Intelligence (IP/Domain) ───────────────────────

export interface ThreatIntelResult {
  target: string;
  threat_level: "none" | "low" | "medium" | "high" | "critical";
  findings: {
    reputation: string;
    location: string;
    associated_ips: string[];
    malware_detections: string[];
    phishing_reports: string[];
    ssl_info?: string;
    abuse_history?: string;
  };
  actions_recommended: string[];
  confidence: number;
}

export const THREAT_INTEL_PROMPT = `Tu es un expert en cyber-sécurité et threat intelligence avec spécialité en discord/web threats.

TÂCHE:
Analyser une IP ou un domaine pour évaluer son niveau de menace.

RECHERCHE:
1. Historique connu d'abus
2. Réputation auprès des blocklists
3. Localisation et ISP
4. Associated domains/IPs
5. Malware/Phishing patterns
6. Abuse history
7. SSL certificate info

BASES DE DONNÉES À VÉRIFIER VIRTUELLEMENT:
- AbuseIPDB
- VirusTotal
- MalwareBytes
- URLhaus
- PhishTank

RÈGLES:
- Sois précis sur les faits
- Distingue certitude/probabilité
- Donne des sources quand possible
- Recommande des actions de sécurité
- Si tu n'as pas de données réelles, indique "données limitées" et base-toi sur les patterns connus
- Les domaines de gaming connus (steam, discord, twitch) sont sûrs par défaut

CONTRAINTES DE FORMAT:
- EXACTEMENT 3 paragraphes dans reputation (contexte, analyse, conclusion)
- Pas plus de 5 actions_recommended
- Langage technique mais compréhensible
- Action recommandée explicite (pas de "peut-être")
- Pas de jargon obscur sans explication
- Chaque finding doit être factuel ou clairement marqué comme estimation

FORMAT RÉPONSE (JSON strict):
{
  "target": "...",
  "threat_level": "none|low|medium|high|critical",
  "findings": {
    "reputation": "...",
    "location": "...",
    "associated_ips": [],
    "malware_detections": [],
    "phishing_reports": [],
    "ssl_info": "...",
    "abuse_history": "..."
  },
  "actions_recommended": ["block", "investigate", "monitor"],
  "confidence": 0-100
}`;

export function buildThreatIntelPrompt(ipOrDomain: string): string {
  return `${THREAT_INTEL_PROMPT}

IP/DOMAINE À ANALYSER:
${ipOrDomain}`;
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

// ─── Prompt 8: Quick Sentiment (fast path, 5 dimensions) ─────────────

export interface QuickSentimentResult {
  sentiment: "très_positif" | "positif" | "neutre" | "négatif" | "très_négatif";
  toxicity: number;
  urgency: number;
  confidence: number;
  engagement: number;
  summary: string;
}

export const SENTIMENT_PROMPT = `Tu es un expert en analyse de sentiment.

MESSAGE: "{message}"
CONTEXTE: {context}

Analyse sur 5 dimensions (0-10):
1. Positivité
2. Toxicité
3. Urgence
4. Confiance
5. Engagement

Réponds en JSON: {sentiment, toxicity, urgency, confidence, engagement, summary}`;

export function buildQuickSentimentPrompt(message: string, context?: string): string {
  return SENTIMENT_PROMPT
    .replace("{message}", message.slice(0, 2000))
    .replace("{context}", context ?? "serveur Discord gaming francophone");
}
