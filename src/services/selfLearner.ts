/**
 * selfLearner.ts — Auto-apprentissage continu
 *
 * Le bot génère des questions sur des sujets variés, y répond via des sources
 * gratuites (Wikipédia, Wiktionnaire) et stocke les Q&A dans Obsidian.
 * Au fil du temps, le vault se remplit de connaissances pré-construites.
 *
 * Quand un utilisateur pose une question similaire, le bot trouve la Q&A
 * dans Obsidian et répond SANS appeler l'API payante.
 */

import logger from "../utils/logger.js";
import { saveQA, searchQA } from "./obsidianMemory.js";

const LEARN_INTERVAL_MS = 10 * 60 * 1000; // 10 min entre chaque batch d'apprentissage
const BATCH_SIZE = 3; // 3 Q&A par batch
let isLearning = false;
let learnTimer: ReturnType<typeof setInterval> | null = null;

// ─── Sujets prédéfinis pour l'apprentissage ──────────────────────────────────
// Catégories couvrant un large éventail de connaissances
const LEARN_TOPICS: { category: string; subjects: string[] }[] = [
  {
    category: "tech",
    subjects: [
      "processeur",
      "carte graphique",
      "RAM",
      "SSD",
      "disque dur",
      "système d'exploitation",
      "Linux",
      "Windows",
      "macOS",
      "Python",
      "JavaScript",
      "TypeScript",
      "Rust",
      "C++",
      "intelligence artificielle",
      "machine learning",
      "réseau de neurones",
      "blockchain",
      "cryptomonnaie",
      "Bitcoin",
      "Ethereum",
      "cybersécurité",
      "VPN",
      "pare-feu",
      "chiffrement",
      "Docker",
      "Kubernetes",
      "cloud computing",
      "AWS",
      "Azure",
    ],
  },
  {
    category: "science",
    subjects: [
      "photosynthèse",
      "ADN",
      "évolution",
      "gravité",
      "relativité",
      "trou noir",
      "système solaire",
      "étoile",
      "galaxie",
      "big bang",
      "atome",
      "molécule",
      "réaction chimique",
      "tableau périodique",
      "électricité",
      "magnétisme",
      "thermodynamique",
      "quantique",
      "volcan",
      "tremblement de terre",
      "tectonique des plaques",
      "climat",
      "météo",
      "effet de serre",
      "océan",
      "courant marin",
    ],
  },
  {
    category: "culture",
    subjects: [
      "Renaissance",
      "Révolution française",
      "Seconde Guerre mondiale",
      "Empire romain",
      "Antiquité grecque",
      "Moyen Âge",
      "philosophie",
      "Socrate",
      "Platon",
      "Aristote",
      "Kant",
      "Nietzsche",
      "art",
      "peinture",
      "sculpture",
      "architecture",
      "musique",
      "littérature",
      "poésie",
      "théâtre",
      "cinéma",
      "mythologie",
      "religion",
      "bouddhisme",
      "christianisme",
      "islam",
    ],
  },
  {
    category: "gaming",
    subjects: [
      "Helldivers",
      "GTA",
      "Minecraft",
      "Fortnite",
      "Valorant",
      "League of Legends",
      "Counter-Strike",
      "Dota 2",
      "PlayStation",
      "Xbox",
      "Nintendo Switch",
      "PC gaming",
      "Steam",
      "Epic Games",
      "Battle.net",
      "MMORPG",
      "FPS",
      "RPG",
      "RTS",
      "battle royale",
      "speedrun",
      "esport",
      "streaming",
      "Twitch",
    ],
  },
  {
    category: "quotidien",
    subjects: [
      "nutrition",
      "vitamine",
      "protéine",
      "glucide",
      "lipide",
      "sommeil",
      "stress",
      "méditation",
      "exercice physique",
      "yoga",
      "cuisine",
      "recette",
      "pâtisserie",
      "jardinage",
      "plante",
      "fleur",
      "voyage",
      "culture japonaise",
      "culture coréenne",
      "culture américaine",
      "langue",
      "apprentissage des langues",
      "français",
      "anglais",
    ],
  },
  {
    category: "discord",
    subjects: [
      "comment bannir un membre Discord",
      "comment configurer les rôles Discord",
      "comment créer un bot Discord",
      "permissions Discord",
      "webhooks Discord",
      "salons vocaux Discord",
      "intégrations Discord",
      "Discord Nitro",
      "serveur Discord communautaire",
      "modération Discord automatisée",
    ],
  },
  {
    category: "osint",
    subjects: [
      "recherche OSINT",
      "investigation numérique",
      "analyse de domaine",
      "WHOIS",
      "DNS lookup",
      "scan de ports",
      "empreinte digitale web",
      "réseaux sociaux investigation",
      "géolocalisation",
      "analyse de métadonnées",
      "stéganographie",
    ],
  },
  {
    category: "meteo",
    subjects: [
      "prévision météo",
      "nuages",
      "orage",
      "foudre",
      "tornade",
      "ouragan",
      "cyclone",
      "anticyclone",
      "dépression atmosphérique",
      "front froid",
      "front chaud",
      "humidité",
      "pression atmosphérique",
    ],
  },
];

// ─── Tracker pour éviter de répéter les mêmes sujets ─────────────────────────
const learnedSubjects = new Set<string>();
let topicIndex = 0;
let subjectIndex = 0;

function getNextSubject(): { category: string; subject: string } | null {
  if (LEARN_TOPICS.length === 0) return null;

  let attempts = 0;
  while (attempts < 100) {
    const topic = LEARN_TOPICS[topicIndex];
    if (subjectIndex >= topic.subjects.length) {
      topicIndex = (topicIndex + 1) % LEARN_TOPICS.length;
      subjectIndex = 0;
      continue;
    }

    const subject = topic.subjects[subjectIndex];
    subjectIndex++;
    attempts++;

    const key = `${topic.category}:${subject}`;
    if (!learnedSubjects.has(key)) {
      learnedSubjects.add(key);
      return { category: topic.category, subject };
    }
  }

  // Tous les sujets ont été traités — reset
  logger.info("[SelfLearner] 🔄 Tous les sujets ont été traités — reset du cycle");
  learnedSubjects.clear();
  return null;
}

// ─── Récupérer un résumé Wikipédia (gratuit, pas d'API payante) ──────────────
async function fetchWikipediaSummary(subject: string, lang = "fr"): Promise<string | null> {
  try {
    // Search
    const searchUrl = `https://${lang}.wikipedia.org/w/api.php?action=query&list=search&srsearch=${encodeURIComponent(subject)}&format=json&srlimit=1`;
    const searchRes = await fetch(searchUrl, { signal: AbortSignal.timeout(8000) });
    if (!searchRes.ok) return null;
    const searchData = (await searchRes.json()) as {
      query?: { search?: Array<{ title: string }> };
    };
    const title = searchData.query?.search?.[0]?.title;
    if (!title) return null;

    // Summary
    const summaryUrl = `https://${lang}.wikipedia.org/api/rest_v1/page/summary/${encodeURIComponent(title)}`;
    const summaryRes = await fetch(summaryUrl, { signal: AbortSignal.timeout(8000) });
    if (!summaryRes.ok) return null;
    const summary = (await summaryRes.json()) as {
      title: string;
      extract: string;
      content_urls?: { desktop?: { page: string } };
    };

    if (!summary.extract || summary.extract.length < 20) return null;

    return `**${summary.title}**\n\n${summary.extract}\n\nSource: ${summary.content_urls?.desktop?.page || `https://${lang}.wikipedia.org/wiki/${encodeURIComponent(title)}`}`;
  } catch {
    return null;
  }
}

// ─── Récupérer une définition Wiktionnaire (gratuit) ─────────────────────────
async function fetchWiktionaryDefinition(word: string, lang = "fr"): Promise<string | null> {
  try {
    const restUrl = `https://${lang}.wiktionary.org/api/rest_v1/page/definition/${encodeURIComponent(word)}`;
    const res = await fetch(restUrl, { signal: AbortSignal.timeout(8000) });
    if (!res.ok) return null;
    const data = (await res.json()) as {
      definitions?: Array<{ partOfSpeech?: string; definition: string }>;
    };
    if (!data.definitions || data.definitions.length === 0) return null;

    const defs = data.definitions
      .slice(0, 3)
      .map((d) => `(${d.partOfSpeech || ""}) ${d.definition.replace(/<[^>]+>/g, "").trim()}`)
      .join("\n");

    return `**${word}**\n\n${defs}\n\nSource: https://${lang}.wiktionary.org/wiki/${encodeURIComponent(word)}`;
  } catch {
    return null;
  }
}

// ─── Générer une Q&A et la sauvegarder dans Obsidian ──────────────────────────
async function learnSubject(category: string, subject: string): Promise<boolean> {
  // Vérifier si on a déjà une Q&A pour ce sujet
  const existing = await searchQA(subject);
  if (existing) {
    logger.debug(`[SelfLearner] ⏭️ Déjà appris: ${subject} (catégorie: ${existing.category})`);
    return false;
  }

  // Construire la question
  const question = `Qu'est-ce que ${subject} ?`;

  // Essayer Wikipédia d'abord
  let answer = await fetchWikipediaSummary(subject);

  // Si pas de résultat Wikipédia, essayer le Wiktionnaire
  if (!answer) {
    answer = await fetchWiktionaryDefinition(subject);
  }

  // Si toujours rien, essayer en anglais
  if (!answer) {
    answer = await fetchWikipediaSummary(subject, "en");
  }

  if (!answer) {
    logger.debug(`[SelfLearner] ❌ Pas de source trouvée pour: ${subject}`);
    return false;
  }

  // Sauvegarder dans Obsidian
  await saveQA(question, answer, category);
  logger.info(`[SelfLearner] 📚 Appris: ${subject} (catégorie: ${category}) → Obsidian`);
  return true;
}

// ─── Cycle d'apprentissage ────────────────────────────────────────────────────
async function learnBatch(): Promise<void> {
  if (isLearning) return;
  isLearning = true;

  try {
    let learned = 0;
    for (let i = 0; i < BATCH_SIZE; i++) {
      const next = getNextSubject();
      if (!next) break;

      const success = await learnSubject(next.category, next.subject);
      if (success) learned++;

      // Petite pause entre chaque requête pour ne pas spammer Wikipédia
      await new Promise((resolve) => setTimeout(resolve, 2000));
    }

    if (learned > 0) {
      logger.info(`[SelfLearner] ✅ Batch terminé: ${learned} Q&A apprises`);
    }
  } catch (error) {
    logger.warn(
      `[SelfLearner] ⚠️ Erreur apprentissage: ${error instanceof Error ? error.message : String(error)}`,
    );
  } finally {
    isLearning = false;
  }
}

// ─── Démarrage / arrêt ────────────────────────────────────────────────────────
export function startSelfLearner(): void {
  if (learnTimer) return;

  // Premier batch après 30s (laisser le bot démarrer)
  setTimeout(() => {
    void learnBatch();
  }, 30_000);

  // Puis toutes les 10 minutes
  learnTimer = setInterval(() => {
    void learnBatch();
  }, LEARN_INTERVAL_MS);

  if (learnTimer.unref) learnTimer.unref();
  logger.info(
    `[SelfLearner] 🧠 Auto-apprentissage démarré (${BATCH_SIZE} Q&A toutes les ${LEARN_INTERVAL_MS / 60000}min)`,
  );
}

export function stopSelfLearner(): void {
  if (learnTimer) {
    clearInterval(learnTimer);
    learnTimer = null;
    logger.info("[SelfLearner] 🛑 Auto-apprentissage arrêté");
  }
}

export function getSelfLearnerStatus(): {
  active: boolean;
  subjectsLearned: number;
  nextBatchInMs: number | null;
} {
  return {
    active: learnTimer !== null,
    subjectsLearned: learnedSubjects.size,
    nextBatchInMs: learnTimer ? LEARN_INTERVAL_MS : null,
  };
}
