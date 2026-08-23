/**
 * taskModelRouter.ts — Routeur intelligent de modèles gratuits selon la complexité de la tâche
 *
 * Classe la demande utilisateur en 4 niveaux de complexité:
 *  - TRIVIAL:   "ok", "mdrr", "oui", "non", salutations → modèle ultra-léger (1-8B)
 *  - SIMPLE:    météo, blague, traduction simple, calcul → modèle léger (8-14B)
 *  - MODERATE:  recherche web, résumé, analyse d'image, OSINT basique → modèle moyen (24-72B)
 *  - COMPLEX:   raisonnement multi-étapes, code, audit sécurité, planification → modèle lourd (70B+)
 *
 * Sélectionne ensuite le meilleur modèle gratuit disponible pour ce niveau.
 * Si le modèle sélectionné est en cooldown (429), passe au suivant dans la même catégorie.
 */

import logger from "../utils/logger.js";
import { getAvailableFreeModels } from "./modelRotation.js";
import { NVIDIA_MODEL_TIERS, isNvidiaNimAvailable } from "./nvidiaNim.js";

// ─── Niveaux de complexité ───────────────────────────────────────────────────

export type TaskComplexity = "trivial" | "simple" | "moderate" | "complex";

interface ComplexityRule {
  patterns: RegExp[];
  complexity: TaskComplexity;
}

// Règles de classification (évaluées dans l'ordre, première correspondance gagne)
const COMPLEXITY_RULES: ComplexityRule[] = [
  // ─── TRIVIAL: réponses courtes, pas de tools ───
  {
    patterns: [
      /^\s*(ok|oui|non|mdr|mdrr|lol|vrai|faux|graves|ouf|bref|nice|cool|gg|wp|ez|noob)\s*$/i,
    ],
    complexity: "trivial",
  },
  {
    patterns: [/^\s*(salut|bonjour|hey|coucou|yo|hello|hi|cc)\s*$/i],
    complexity: "trivial",
  },
  {
    patterns: [/^\s*(merci|thanks|thx|cimer)\s*$/i],
    complexity: "trivial",
  },
  {
    patterns: [/^\s*[\p{Emoji}\s]+$/u],
    complexity: "trivial",
  },

  // ─── COMPLEX: tâches nécessitant un raisonnement approfondi ───
  {
    patterns: [
      /\b(audit|security|sécurité|pentest|vulnérabilit|exploit|reverse|malware|ransomware|phishing|attack|attaque)\b/i,
      /\b(code|function|class|bug|error|fix|debug|refactor|implement|typescript|python|javascript|rust)\b/i,
      /\b(analyz|analys|compare|comparison|versus|diff|différence)\b/i,
      /\b(plan|strateg|stratég|déploy|deploy|architecture|design|conception)\b/i,
      /\b(multi.?step|enchaînement|pipeline|workflow|orchestrat)\b/i,
      /\b(osint|investigation|forensic|shodan|scan|nmap|nikto)\b/i,
      /\b(rapport|report|detailed|détaillé|complet|comprehensive)\b/i,
      /\b(mathématique|équation|calcul.*complexe|démonstr|proof|preuve)\b/i,
    ],
    complexity: "complex",
  },

  // ─── MODERATE: tâches nécessitant des tools et une analyse ───
  {
    patterns: [
      /\b(recherch|search|trouve|lookup|scan|vérif|check|inspect)\b/i,
      /\b(météo|weather|température|forecast)\b/i,
      /\b(traduis|translate|traduction)\b/i,
      /\b(résum|summariz|summary|tl;dr)\b/i,
      /\b(image|photo|picture|screenshot|capture)\b/i,
      /\[Image jointe:/,
      /\b(sentiment|émotion|toxic|toxicité)\b/i,
      /\b(wiki|wikipedia|article|documentation|doc)\b/i,
      /\b(crypto|price|prix|stock|action|finance|devis)\b/i,
      /\b(steam|epic|fortnite|game|jeu|gaming|patch)\b/i,
      /\b(news|actu|article|blog|hacker\s?news)\b/i,
      /\b(github|repo|trending|gist)\b/i,
      /\b(discord|server|serveur|member|membre|role|rôle)\b/i,
      /\b(email|phone|ip|domain|url|breach|fuite)\b/i,
      /\b(track|tracker|suivre|pister|surveille|alerte|notification)\b/i,
      /\b(amazon|ebay|fnac|cdiscount|darty|boulanger|ldlc|decathlon|backmarket|vinted|leboncoin|rakuten|ikea|zalando|alternate|mindfactory|caseking|dealabs|mydealz|hotukdeals|idealo|pricespy|cdkeys|fanatical|eneba|kinguin|g2a|shopto|games365|basecom|gamesplanet)\b/i,
      /\b(produit|product|deal|promo|promotion|discount|réduction|compar|compare|boutique|revendeur|retailer|panier|cart)\b/i,
    ],
    complexity: "moderate",
  },

  // ─── SIMPLE: tâches basiques nécessitant un tool simple ───
  {
    patterns: [
      /\b(blague|joke|funny|riddle|devinette)\b/i,
      /\b(pile|face|coin|flip|dice|dé|aléatoire|random)\b/i,
      /\b(nasa|apod|space|espace|astronom)\b/i,
      /\b(cat|dog|chat|chien|animal|image)\b/i,
      /\b(uuid|hash|base64|encode|decode|qr|qrcode)\b/i,
      /\b(emoji|color|couleur|palette|lorem)\b/i,
      /\b(pokemon|chess|échecs|lichess)\b/i,
      /\b(country|pays|capitale|flag|drapeau)\b/i,
      /\b(convert|conversion|unit|unité)\b/i,
      /\b(time|heure|timezone|fuseau)\b/i,
    ],
    complexity: "simple",
  },
];

// ─── Catégories de modèles gratuits par complexité ───────────────────────────

const MODEL_TIERS: Record<TaskComplexity, string[]> = {
  // Ultra-léger: 1-8B — réponses triviales, pas de tools
  trivial: [
    // NVIDIA NIM (modèles rapides d'abord)
    ...(isNvidiaNimAvailable() ? NVIDIA_MODEL_TIERS.trivial : []),
    "nvidia/nemotron-mini-4b-instruct",
    "nvidia/nvidia-nemotron-nano-9b-v2",
  ],

  // Léger: 8-30B — tâches simples avec tools
  simple: [
    // NVIDIA NIM (modèles rapides d'abord)
    ...(isNvidiaNimAvailable() ? NVIDIA_MODEL_TIERS.simple : []),
    "nvidia/nemotron-3-nano-30b-a3b",
    "openai/gpt-oss-20b",
  ],

  // Moyen: 30-120B — tâches modérées avec tools + raisonnement
  moderate: [
    // NVIDIA NIM — Nemotron 49B d'abord (répond en ~12s, fiable)
    "nvidia/llama-3.3-nemotron-super-49b-v1",
    "nvidia/nemotron-3-nano-30b-a3b",
    "meta/llama-3.3-70b-instruct",
    "meta/llama-3.1-70b-instruct",
    "nvidia/nemotron-3-super-120b-a12b",
  ],

  // Lourd: 70B+ — tâches complexes nécessitant un raisonnement profond
  complex: [
    // NVIDIA NIM — Nemotron 49B d'abord (répond en ~12s, fiable)
    "nvidia/llama-3.3-nemotron-super-49b-v1",
    "nvidia/nemotron-3-nano-30b-a3b",
    "meta/llama-3.3-70b-instruct",
    "meta/llama-3.1-70b-instruct",
    "nvidia/nemotron-3-super-120b-a12b",
  ],
};

// ─── Classification ──────────────────────────────────────────────────────────

/**
 * Classifie la complexité d'une demande utilisateur.
 * @param userMessage Le message brut de l'utilisateur
 * @param toolCount Nombre de tools que l'IA a suggérés (0 = pas de tools)
 * @returns Le niveau de complexité
 */
export function classifyTaskComplexity(userMessage: string, toolCount = 0): TaskComplexity {
  const msg = userMessage.trim();

  // Si l'IA a demandé beaucoup de tools, c'est complexe
  if (toolCount >= 3) return "complex";
  if (toolCount === 2) return "moderate";

  // Longueur du message: très court = probablement trivial
  if (msg.length < 10) return "trivial";

  // Évaluer les règles dans l'ordre
  for (const rule of COMPLEXITY_RULES) {
    for (const pattern of rule.patterns) {
      if (pattern.test(msg)) {
        return rule.complexity;
      }
    }
  }

  // Défaut: modéré (la plupart des conversations Discord)
  return "moderate";
}

// ─── Sélection du modèle ─────────────────────────────────────────────────────

/**
 * Sélectionne le meilleur modèle gratuit disponible pour un niveau de complexité donné.
 * Si tous les modèles du tier sont en cooldown, remonte au tier supérieur.
 * @param complexity Niveau de complexité de la tâche
 * @returns Nom du modèle à utiliser, ou null si aucun disponible
 */
export function selectModelByComplexity(complexity: TaskComplexity): string | null {
  const availableFree = new Set(getAvailableFreeModels());
  const tierModels = MODEL_TIERS[complexity];

  // 1. Chercher le premier modèle disponible dans le tier
  for (const model of tierModels) {
    if (availableFree.has(model)) {
      logger.info(`[TaskRouter] 🎯 Modèle sélectionné (tier: ${complexity}): ${model}`);
      return model;
    }
  }

  // 2. Tous en cooldown → remonter au tier supérieur
  const tierOrder: TaskComplexity[] = ["trivial", "simple", "moderate", "complex"];
  const currentIdx = tierOrder.indexOf(complexity);

  for (let i = currentIdx + 1; i < tierOrder.length; i++) {
    const upperTier = MODEL_TIERS[tierOrder[i]];
    for (const model of upperTier) {
      if (availableFree.has(model)) {
        logger.warn(
          `[TaskRouter] ⚠️ Tier "${complexity}" épuisé — remontée vers "${tierOrder[i]}": ${model}`,
        );
        return model;
      }
    }
  }

  // 3. Si on était déjà au tier max, descendre vers les tiers inférieurs
  for (let i = currentIdx - 1; i >= 0; i--) {
    const lowerTier = MODEL_TIERS[tierOrder[i]];
    for (const model of lowerTier) {
      if (availableFree.has(model)) {
        logger.warn(
          `[TaskRouter] ⚠️ Tier "${complexity}" épuisé — descente vers "${tierOrder[i]}": ${model}`,
        );
        return model;
      }
    }
  }

  // 4. Aucun modèle gratuit disponible
  logger.error(`[TaskRouter] ❌ Aucun modèle gratuit disponible pour le tier "${complexity}"`);
  return null;
}

/**
 * Retourne la liste ordonnée des modèles à essayer pour une tâche donnée.
 * Le modèle sélectionné est en premier, puis les fallbacks du même tier,
 * puis les tiers supérieurs.
 * @param complexity Niveau de complexité
 * @returns Liste ordonnée de noms de modèles
 */
export function getModelChainForTask(complexity: TaskComplexity): string[] {
  const availableFree = new Set(getAvailableFreeModels());
  const chain: string[] = [];
  const seen = new Set<string>();

  // 1. Modèles du tier actuel (dans l'ordre)
  for (const model of MODEL_TIERS[complexity]) {
    if (availableFree.has(model) && !seen.has(model)) {
      chain.push(model);
      seen.add(model);
    }
  }

  // 2. Remonter vers les tiers supérieurs
  const tierOrder: TaskComplexity[] = ["trivial", "simple", "moderate", "complex"];
  const currentIdx = tierOrder.indexOf(complexity);

  for (let i = currentIdx + 1; i < tierOrder.length; i++) {
    for (const model of MODEL_TIERS[tierOrder[i]]) {
      if (availableFree.has(model) && !seen.has(model)) {
        chain.push(model);
        seen.add(model);
      }
    }
  }

  // 3. Descendre vers les tiers inférieurs
  for (let i = currentIdx - 1; i >= 0; i--) {
    for (const model of MODEL_TIERS[tierOrder[i]]) {
      if (availableFree.has(model) && !seen.has(model)) {
        chain.push(model);
        seen.add(model);
      }
    }
  }

  logger.info(
    `[TaskRouter] 📋 Chaîne de modèles (tier: ${complexity}, ${chain.length} disponibles): ${chain.slice(0, 5).join(", ")}${chain.length > 5 ? "..." : ""}`,
  );
  return chain;
}

/**
 * Retourne un résumé lisible du routing pour les logs.
 */
export function getTaskRouterSummary(userMessage: string): string {
  const complexity = classifyTaskComplexity(userMessage);
  const model = selectModelByComplexity(complexity);
  const tierSizes = {
    trivial: MODEL_TIERS.trivial.length,
    simple: MODEL_TIERS.simple.length,
    moderate: MODEL_TIERS.moderate.length,
    complex: MODEL_TIERS.complex.length,
  };

  return `Complexity: ${complexity} | Selected: ${model || "none"} | Tiers: T=${tierSizes.trivial} S=${tierSizes.simple} M=${tierSizes.moderate} C=${tierSizes.complex}`;
}
