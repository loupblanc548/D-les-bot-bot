/**
 * agentPlanner.ts — MODULE A: Planification multi-étapes
 *
 * Avant d'entrer dans la boucle REASON→ACT→OBSERVE→REPLY, l'agent
 * décompose les requêtes complexes en un plan structuré.
 *
 * Ex: "Organise un tournoi" →
 *   Step 1: Créer un salon #tournoi
 *   Step 2: Annoncer le tournoi avec les règles
 *   Step 3: Ouvrir les inscriptions
 *   Step 4: Lancer le tournoi
 *
 * Le plan est injecté dans le system prompt pour guider l'agent.
 */

import { getOpenAIClient } from "./ai.js";
import { config } from "../config.js";
import logger from "../utils/logger.js";

// ─── Types ───────────────────────────────────────────────────────────────────

export interface PlanStep {
  id: number;
  description: string;
  tool_hint: string;
  depends_on: number[];
}

export interface AgentPlan {
  goal: string;
  is_complex: boolean;
  steps: PlanStep[];
  estimated_tools: number;
}

// ─── Configuration ───────────────────────────────────────────────────────────

const PLANNER_TIMEOUT_MS = 8_000;
const MAX_PLAN_STEPS = 8;

// Heuristics for detecting complex requests without an LLM call
const COMPLEXITY_KEYWORDS = [
  "organise",
  "organiser",
  "planifie",
  "planifier",
  "crée",
  "créer",
  "setup",
  "configure",
  "mets en place",
  "démarre",
  "lance un",
  "tournoi",
  "event",
  "événement",
  "concours",
  "giveaway",
  "purge",
  "nettoie",
  "backup",
  "sauvegarde",
  "migrate",
  "résume",
  "analyse",
  "rapport",
  "investigate",
  "investigation",
];

// ─── Quick complexity check (no LLM needed) ──────────────────────────────────

export function isComplexRequest(userMessage: string): boolean {
  const lower = userMessage.toLowerCase();
  const wordCount = userMessage.split(/\s+/).length;

  // Keyword match
  if (COMPLEXITY_KEYWORDS.some((kw) => lower.includes(kw))) return true;

  // Long message with multiple sentences
  const sentences = userMessage.split(/[.!?]/).filter((s) => s.trim().length > 0);
  if (sentences.length >= 3 && wordCount >= 20) return true;

  // Multiple action verbs
  const actionVerbs = ["et", "puis", "ensuite", "après", "finally", "also"];
  const actionCount = actionVerbs.filter((v) => lower.includes(v)).length;
  if (actionCount >= 2) return true;

  return false;
}

// ─── Ambiguity detection (no LLM needed) ─────────────────────────────────────

/**
 * Détecte si une requête est ambiguë et nécessite une clarification.
 * Couvre TOUTES les capacités du bot : OSINT, modération, génération,
 * recherche, gaming, musique, traduction, météo, crypto, bourse, etc.
 * Retourne les questions à poser si ambigu, null sinon.
 */
export function detectAmbiguity(userMessage: string): string[] | null {
  const lower = userMessage.toLowerCase().trim();
  const words = lower.split(/\s+/);
  const questions: string[] = [];
  const hasUrl = lower.includes("http://") || lower.includes("https://");
  const hasMention = lower.includes("@") || /\d{17,19}/.test(lower);
  const hasIp = /\b\d{1,3}\.\d{1,3}\.\d{1,3}\.\d{1,3}\b/.test(lower);
  const hasEmail = /\S+@\S+\.\S+/.test(lower);
  const hasDomain = /\S+\.\S{2,}/.test(lower) && !hasUrl;

  // ─── OSINT ───
  if (
    (lower.includes("scan") || lower.includes("osint") || lower.includes("investig")) &&
    !hasMention &&
    !hasIp &&
    !hasEmail &&
    !hasDomain &&
    words.length < 8
  ) {
    questions.push("Quelle cible exacte veux-tu scanner ? (domaine, IP, ou email)");
  }
  if (lower.includes("shodan") && !hasIp && !hasDomain && words.length < 6) {
    questions.push("Quelle IP ou domaine veux-tu rechercher sur Shodan ?");
  }
  if (lower.includes("steamrep") && !lower.match(/\d{17}/) && words.length < 6) {
    questions.push("Quel Steam ID veux-tu vérifier sur SteamRep ?");
  }

  // ─── Modération ───
  if (
    (lower.includes("ban") ||
      lower.includes("kick") ||
      lower.includes("timeout") ||
      lower.includes("warn")) &&
    !hasMention
  ) {
    questions.push("Quel utilisateur veux-tu sanctionner ? (mentionne-le avec @)");
  }
  if (
    (lower.includes("timeout") || lower.includes("mute")) &&
    hasMention &&
    !lower.match(/\d+\s*(min|heure|hour|sec|jour|day)/)
  ) {
    questions.push("Quelle durée pour le timeout ? (ex: 10min, 1heure, 1jour)");
  }
  if (
    lower.includes("purge") ||
    lower.includes("nettoie") ||
    (lower.includes("delete") && lower.includes("message"))
  ) {
    if (!lower.match(/\d+/) || words.length < 5) {
      questions.push("Combien de messages veux-tu que je supprime ?");
    }
  }

  // ─── Génération d'image ───
  if (
    (lower.includes("génère") || lower.includes("crée") || lower.includes("image")) &&
    lower.includes("image") &&
    words.length < 6
  ) {
    questions.push("Quelle image veux-tu que je génère ? Décris-la (sujet, style, ambiance).");
  }

  // ─── Génération audio / TTS ───
  if (
    (lower.includes("audio") ||
      lower.includes("voix") ||
      lower.includes("tts") ||
      lower.includes("lis à voix haute")) &&
    !lower.includes("texte") &&
    words.length < 8
  ) {
    questions.push("Quel texte veux-tu que je convertisse en audio ?");
  }
  if (
    lower.includes("tts") &&
    hasMention === false &&
    lower.length > 20 &&
    !lower.includes("voix")
  ) {
    // a du texte, ask which voice
  }

  // ─── Analyse de lien / URL ───
  if (
    (lower.includes("analyse") || lower.includes("résume") || lower.includes("lis")) &&
    (lower.includes("lien") || lower.includes("url") || lower.includes("page")) &&
    !hasUrl
  ) {
    questions.push("Donne-moi le lien (URL) que tu veux que j'analyse.");
  }
  if (lower.includes("raccourci") && lower.includes("url") && !hasUrl) {
    questions.push("Quelle URL veux-tu que je raccourcisse ?");
  }
  if (lower.includes("qr") && lower.includes("code") && !hasUrl && words.length < 8) {
    questions.push("Quel texte ou URL veux-tu que je convertisse en QR code ?");
  }
  if (lower.includes("screenshot") || lower.includes("capture d")) {
    if (!hasUrl && words.length < 8) {
      questions.push("De quelle page web veux-tu que je fasse une capture d'écran ? (donne l'URL)");
    }
  }

  // ─── Ingestion de doc ───
  if (
    (lower.includes("ingère") ||
      lower.includes("apprends") ||
      lower.includes("documentation") ||
      lower.includes("ingest")) &&
    !hasUrl &&
    words.length < 10
  ) {
    questions.push("Quelle(s) URL(s) de documentation veux-tu que j'ingère ?");
  }

  // ─── Code / Script ───
  if (
    (lower.includes("code") ||
      lower.includes("script") ||
      lower.includes("programme") ||
      lower.includes("fonction")) &&
    !lower.includes("python") &&
    !lower.includes("javascript") &&
    !lower.includes("js") &&
    !lower.includes("shell") &&
    !lower.includes("bash") &&
    !lower.includes("ts") &&
    words.length < 12
  ) {
    questions.push("Quel langage veux-tu que j'utilise ? (Python, JavaScript, Shell)");
  }

  // ─── Recherche web ───
  if (
    (lower.includes("cherche") || lower.includes("trouve") || lower.includes("recherche")) &&
    words.length < 6 &&
    !lower.includes("quoi") &&
    !lower.includes("qui") &&
    !lower.includes("comment")
  ) {
    questions.push("Que veux-tu que je recherche exactement ?");
  }

  // ─── YouTube ───
  if (
    lower.includes("youtube") &&
    (lower.includes("cherche") || lower.includes("vidéo") || lower.includes("video")) &&
    words.length < 8 &&
    !lower.includes("url")
  ) {
    questions.push("Quelles vidéos YouTube veux-tu que je cherche ? (sujet ou mot-clé)");
  }

  // ─── Météo ───
  if (
    (lower.includes("météo") ||
      lower.includes("meteo") ||
      (lower.includes("temps") && lower.includes("fait"))) &&
    !lower.match(/[a-zA-Z]{3,}\s*(ville|city)/) &&
    words.length < 5
  ) {
    questions.push("Pour quelle ville veux-tu la météo ?");
  }

  // ─── Crypto ───
  if (
    (lower.includes("crypto") ||
      lower.includes("bitcoin") ||
      lower.includes("ethereum") ||
      lower.includes("prix")) &&
    lower.includes("crypto") &&
    !lower.match(/bitcoin|ethereum|solana|doge|cardano|litecoin|ripple|xrp|bnb|polygon|matic/) &&
    words.length < 6
  ) {
    questions.push("Quelle cryptomonnaie t'intéresse ? (ex: bitcoin, ethereum, solana)");
  }

  // ─── Bourse / Actions ───
  if (
    (lower.includes("action") || lower.includes("bourse") || lower.includes("stock")) &&
    !lower.match(/AAPL|TSLA|MSFT|GOOGL|AMZN|NVDA|META|NFLX|AMD|INTC/) &&
    words.length < 6
  ) {
    questions.push("Quel ticker/action veux-tu vérifier ? (ex: AAPL, TSLA, MSFT)");
  }

  // ─── Traduction ───
  if (lower.includes("traduit") || lower.includes("traduis") || lower.includes("traduction")) {
    if (words.length < 5) {
      questions.push("Quel texte veux-tu que je traduise ?");
    }
    if (
      !lower.includes("anglais") &&
      !lower.includes("français") &&
      !lower.includes("espagnol") &&
      !lower.includes("allemand") &&
      !lower.includes("italien") &&
      !lower.includes("japonais") &&
      !lower.includes("vers") &&
      !lower.includes("en") &&
      words.length < 10
    ) {
      questions.push(
        "Vers quelle langue veux-tu la traduction ? (anglais, espagnol, allemand, etc.)",
      );
    }
  }

  // ─── Wikipedia ───
  if (lower.includes("wikipedia") || lower.includes("encyclopéd")) {
    if (words.length < 5) {
      questions.push("Quel sujet veux-tu que je cherche sur Wikipedia ?");
    }
  }

  // ─── GitHub ───
  if (
    lower.includes("github") &&
    (lower.includes("profil") || lower.includes("repo") || lower.includes("dépôt"))
  ) {
    if (!lower.match(/github\.com\/\S+/) && words.length < 8) {
      questions.push("Quel utilisateur ou dépôt GitHub veux-tu que je vérifie ? (donne le nom)");
    }
  }

  // ─── Reddit ───
  if (
    lower.includes("reddit") &&
    (lower.includes("subreddit") || lower.includes("post") || lower.includes("cherche"))
  ) {
    if (!lower.match(/r\/\w+/) && words.length < 8) {
      questions.push("Quel subreddit ou sujet veux-tu que je cherche sur Reddit ?");
    }
  }

  // ─── Twitter / X ───
  if (
    (lower.includes("twitter") || lower.includes("tweet")) &&
    !lower.includes("@") &&
    words.length < 8
  ) {
    questions.push("Quel compte ou mot-clé Twitter/X veux-tu que je recherche ?");
  }

  // ─── Twitch ───
  if (
    lower.includes("twitch") &&
    (lower.includes("live") || lower.includes("stream")) &&
    !lower.includes("@") &&
    words.length < 8
  ) {
    questions.push("Quel streamer Twitch veux-tu que je vérifie ? (donne le nom)");
  }

  // ─── Gaming ───
  if (lower.includes("fortnite") && lower.includes("shop") && words.length < 5) {
    // ok, no question needed
  }
  if (lower.includes("patch") && lower.includes("note") && !lower.match(/[a-zA-Z]{4,}/)) {
    questions.push("De quel jeu veux-tu les patch notes ?");
  }
  if (lower.includes("speedrun") && !lower.includes("jeu") && words.length < 6) {
    questions.push("De quel jeu veux-tu le record speedrun ?");
  }
  if (
    lower.includes("steam") &&
    (lower.includes("news") || lower.includes("actu")) &&
    !lower.match(/\d{5,}/) &&
    words.length < 8
  ) {
    questions.push("De quel jeu Steam veux-tu les news ? (donne l'App ID ou le nom)");
  }
  if (lower.includes("chess") || lower.includes("échec")) {
    if (
      (lower.includes("stat") || lower.includes("rating") || lower.includes("elo")) &&
      !lower.includes("com") &&
      words.length < 6
    ) {
      questions.push("Quel joueur Chess.com/Lichess veux-tu que je vérifie ? (donne le pseudo)");
    }
  }
  if (lower.includes("pokémon") || (lower.includes("pokemon") && words.length < 4)) {
    questions.push("Quel Pokémon veux-tu que je cherche ?");
  }

  // ─── Musique ───
  if (lower.includes("musique") || lower.includes("joue") || lower.includes("chanson")) {
    if (
      lower.includes("joue") &&
      !lower.includes("url") &&
      !lower.includes("lien") &&
      words.length < 8
    ) {
      questions.push(
        "Quelle chanson veux-tu que je joue ? (donne le titre ou un lien YouTube/Spotify)",
      );
    }
    if (lower.includes("lyrics") || lower.includes("paroles")) {
      if (words.length < 6) {
        questions.push("De quelle chanson veux-tu les paroles ? (titre + artiste si possible)");
      }
    }
  }

  // ─── Livres ───
  if (
    lower.includes("livre") ||
    (lower.includes("book") && (lower.includes("cherche") || lower.includes("trouve")))
  ) {
    if (words.length < 6) {
      questions.push("Quel livre veux-tu que je cherche ? (titre ou auteur)");
    }
  }

  // ─── Nourriture ───
  if (lower.includes("nourriture") || lower.includes("food") || lower.includes("calorie")) {
    if (words.length < 5) {
      questions.push("Quel produit alimentaire veux-tu que je recherche ?");
    }
  }

  // ─── Science / arXiv ───
  if (
    lower.includes("paper") ||
    lower.includes("scientif") ||
    lower.includes("arxiv") ||
    lower.includes("recherche scientifique")
  ) {
    if (words.length < 6) {
      questions.push("Quel sujet scientifique veux-tu que je recherche sur arXiv ?");
    }
  }

  // ─── Vols ───
  if (lower.includes("vol") || lower.includes("flight") || lower.includes("avion")) {
    if (words.length < 6 && !lower.match(/[A-Z]{2}\d+/)) {
      questions.push(
        "Quelle zone ou quel callsign de vol veux-tu que je track ? (ex: AAL pour American Airlines)",
      );
    }
  }

  // ─── Tendances Google ───
  if (lower.includes("tendance") || lower.includes("trend") || lower.includes("google trend")) {
    if (
      !lower.includes("france") &&
      !lower.includes("us") &&
      !lower.includes("monde") &&
      words.length < 6
    ) {
      questions.push("Pour quel pays veux-tu les tendances Google ? (France, US, etc.)");
    }
  }

  // ─── Pays ───
  if (lower.includes("pays") || lower.includes("country") || lower.includes("capitale")) {
    if (
      words.length < 5 &&
      !lower.match(/france|usa|japon|chine|allemagne|espagne|italie|angleterre/)
    ) {
      questions.push("Quel pays veux-tu que je renseigne ?");
    }
  }

  // ─── Devise ───
  if (lower.includes("devise") || lower.includes("currency") || lower.includes("convertir")) {
    if (!lower.match(/eur|usd|gbp|jpy|chf|cad|aud|cny/) && words.length < 8) {
      questions.push("Quelle devise veux-tu convertir et en quelle autre ? (ex: 100 EUR vers USD)");
    }
  }

  // ─── DNS ───
  if (
    lower.includes("dns") &&
    (lower.includes("lookup") || lower.includes("résous") || lower.includes("vérifie"))
  ) {
    if (!hasDomain && words.length < 6) {
      questions.push("Quel domaine veux-tu que je résolve en DNS ?");
    }
  }

  // ─── Domain age ───
  if (lower.includes("âge") && lower.includes("domaine") && !hasDomain && words.length < 6) {
    questions.push("De quel domaine veux-tu connaître l'âge ?");
  }

  // ─── Email jetable ───
  if (
    lower.includes("email") &&
    (lower.includes("jetable") || lower.includes("temporaire") || lower.includes("disposable"))
  ) {
    if (!hasEmail && words.length < 6) {
      questions.push("Quel email veux-tu que je vérifie ? (donne l'adresse complète)");
    }
  }

  // ─── Typosquatting ───
  if (
    lower.includes("typosquat") ||
    lower.includes("frauduleux") ||
    (lower.includes("suspect") && lower.includes("domaine"))
  ) {
    if (!hasDomain && words.length < 6) {
      questions.push("Quel domaine veux-tu que je vérifie pour le typosquatting ?");
    }
  }

  // ─── Lien suspect ───
  if (
    lower.includes("lien") &&
    (lower.includes("suspect") ||
      lower.includes("sécur") ||
      lower.includes("phishing") ||
      lower.includes("arnaque"))
  ) {
    if (!hasUrl && words.length < 8) {
      questions.push("Donne-moi le lien (URL) que tu trouves suspect.");
    }
  }

  // ─── Avatar hash / évadé de ban ───
  if (
    lower.includes("évadé") ||
    lower.includes("evade") ||
    lower.includes("ban evad") ||
    lower.includes("double compte")
  ) {
    if (!hasMention && words.length < 8) {
      questions.push(
        "Quel utilisateur suspectes-tu d'être un évadé de ban ? (mentionne-le avec @)",
      );
    }
  }

  // ─── Ghost ping ───
  if (lower.includes("ghost") && lower.includes("ping") && words.length < 5) {
    // ok, no target needed — scans recent messages
  }

  // ─── Raid / sécurité serveur ───
  if (
    lower.includes("raid") &&
    !lower.includes("détect") &&
    !lower.includes("vérifie") &&
    !lower.includes("scan") &&
    words.length < 5
  ) {
    questions.push(
      "Tu veux que je vérifie si un raid est en cours sur ce serveur, ou que je verrouille un salon en urgence ?",
    );
  }

  // ─── Suggestion / système ───
  if (lower.includes("suggestion") && words.length < 5) {
    questions.push("Quelle suggestion veux-tu que j'ajoute au système de suggestions du serveur ?");
  }

  // ─── Sondage / vote ───
  if (lower.includes("sondage") || lower.includes("poll") || lower.includes("vote")) {
    if (words.length < 8 && !lower.includes("?")) {
      questions.push("Quelle question veux-tu pour le sondage ? Et quels choix de réponse ?");
    }
  }

  // ─── Rappel / reminder ───
  if (lower.includes("rappel") || lower.includes("reminder") || lower.includes("rappelle")) {
    if (!lower.match(/\d+\s*(min|heure|hour|sec|jour|day|demain)/) && words.length < 8) {
      questions.push("Dans combien de temps veux-tu le rappel ? (ex: dans 2 heures, demain à 14h)");
    }
    if (words.length < 6) {
      questions.push("De quoi veux-tu que je te rappelle ?");
    }
  }

  // ─── Giveaway ───
  if (lower.includes("giveaway") || lower.includes("concours") || lower.includes("tirage")) {
    if (words.length < 8) {
      questions.push("Quel prix veux-tu pour le giveaway ? Et quelle durée ? (ex: 24h, 1 semaine)");
    }
  }

  // ─── Modération auto / slowmode ───
  if (lower.includes("slowmode") && !lower.match(/\d+\s*(sec|s|min)/) && words.length < 6) {
    questions.push("Quelle durée pour le slowmode ? (ex: 5s, 10s, 30s, 1min)");
  }

  // ─── Embed personnalisé ───
  if (
    lower.includes("embed") &&
    (lower.includes("crée") || lower.includes("fais")) &&
    words.length < 8
  ) {
    questions.push("Quel titre et contenu veux-tu pour l'embed ? (donne les détails)");
  }

  // ─── Mot de passe ───
  if (lower.includes("mot de passe") || (lower.includes("password") && lower.includes("génère"))) {
    if (!lower.match(/\d+/) && words.length < 6) {
      questions.push("Quelle longueur pour le mot de passe ? (ex: 16, 24, 32)");
    }
  }

  // ─── Math ───
  if (lower.includes("calcule") || lower.includes("résous") || lower.includes("math")) {
    if (words.length < 4 && !lower.match(/[\d+\-*/^()]/)) {
      questions.push("Quelle expression mathématique veux-tu que je résolve ?");
    }
  }

  // ─── Helldivers 2 ───
  // No question needed — no params

  // ─── Epic free games ───
  // No question needed — no params

  // ─── NASA APOD ───
  // No question needed — no params

  // ─── Dev.to articles ───
  if (lower.includes("dev.to") || (lower.includes("article tech") && words.length < 5)) {
    // ok, fetches latest — no question needed
  }

  // ─── Package NPM/PyPI ───
  if (
    (lower.includes("npm") || lower.includes("pypi") || lower.includes("package")) &&
    !lower.match(/[a-z@\-\/]{2,}/) &&
    words.length < 5
  ) {
    questions.push("Quel package veux-tu que je vérifie ? (donne le nom)");
  }

  // ─── Sismes ───
  if (lower.includes("séisme") || lower.includes("earthquake") || lower.includes("tremblement")) {
    if (!lower.match(/\d/) && words.length < 5) {
      questions.push(
        "Quelle magnitude minimum ? (ex: 4.0, 5.0) Ou tu veux tous les séismes récents ?",
      );
    }
  }

  // ─── Demande vague générique ───
  if (
    words.length <= 3 &&
    (lower.includes("fais") ||
      lower.includes("aide") ||
      lower.includes("peux tu") ||
      lower.includes("bot"))
  ) {
    questions.push("Peux-tu détailler ce que tu veux que je fasse exactement ?");
  }

  return questions.length > 0 ? questions : null;
}

// ─── LLM Planner ─────────────────────────────────────────────────────────────

/**
 * Generate a structured plan for a complex user request.
 * Uses a fast LLM call to decompose the goal into steps.
 */
export async function generatePlan(
  userMessage: string,
  availableTools: string[],
): Promise<AgentPlan | null> {
  // Quick check: is this complex enough to warrant planning?
  if (!isComplexRequest(userMessage)) {
    return null;
  }

  try {
    const client = getOpenAIClient();

    const toolList = availableTools.slice(0, 50).join(", ");

    const response = await client.chat.completions.create(
      {
        model: config.openRouterModel,
        messages: [
          {
            role: "system",
            content:
              "Tu es un planificateur d'agent IA. Décompose la requête en étapes structurées.\n" +
              "Réponds UNIQUEMENT en JSON valide avec ce format:\n" +
              '{"goal": "objectif global", "is_complex": true, "steps": [{"id": 1, "description": "...", "tool_hint": "nom_du_tool", "depends_on": []}]}\n' +
              "Maximum " +
              MAX_PLAN_STEPS +
              " étapes. Sois concis.\n" +
              "Tools disponibles: " +
              toolList,
          },
          {
            role: "user",
            content: userMessage,
          },
        ],
        max_tokens: 600,
        temperature: 0.3,
      },
      { timeout: PLANNER_TIMEOUT_MS },
    );

    const raw = response.choices[0]?.message?.content ?? "";
    const jsonMatch = raw.match(/\{[\s\S]*\}/);
    if (!jsonMatch) return null;

    const plan = JSON.parse(jsonMatch[0]) as AgentPlan;

    // Validate and sanitize
    if (!plan.steps || !Array.isArray(plan.steps) || plan.steps.length === 0) {
      return null;
    }

    // Enforce max steps
    plan.steps = plan.steps.slice(0, MAX_PLAN_STEPS);

    // Ensure each step has required fields
    plan.steps = plan.steps.map((step, i) => ({
      id: step.id || i + 1,
      description: step.description || `Étape ${i + 1}`,
      tool_hint: step.tool_hint || "auto",
      depends_on: Array.isArray(step.depends_on) ? step.depends_on : [],
    }));

    plan.estimated_tools = plan.steps.length;
    plan.is_complex = true;

    logger.info(
      `[Planner] Plan généré: ${plan.steps.length} étapes pour "${userMessage.slice(0, 60)}..."`,
    );
    return plan;
  } catch (err) {
    logger.warn(
      `[Planner] Échec planification: ${err instanceof Error ? err.message : String(err)}`,
    );
    return null;
  }
}

/**
 * Format the plan as a string for injection into the system prompt.
 */
export function formatPlanForPrompt(plan: AgentPlan): string {
  const stepsText = plan.steps
    .map((s) => `  ${s.id}. ${s.description} [tool: ${s.tool_hint}]`)
    .join("\n");

  return (
    "\n## PLAN D'EXÉCUTION APPROUVÉ\n" +
    `Objectif: ${plan.goal}\n` +
    "Suis ces étapes dans l'ordre. Utilise les tools appropriés pour chaque étape.\n" +
    "Après chaque étape, vérifie le résultat avant de passer à la suivante.\n\n" +
    `Étapes:\n${stepsText}\n`
  );
}
