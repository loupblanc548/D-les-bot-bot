/**
 * nlp-deal-filter.ts
 *
 * Filtrage NLP léger avec Compromise pour améliorer la détection de deals.
 * - Détecte les noms de jeux (entités nommées)
 * - Détecte le sentiment (positif/négatif)
 * - Extrait les pourcentages de réduction
 * - Catégorise le type d'offre (free, discount, bundle, etc.)
 */

import nlp from "compromise";

export interface DealNlpResult {
  gameNames: string[];
  discountPercent: number | null;
  offerType: "free" | "discount" | "bundle" | "unknown";
  sentiment: "positive" | "neutral" | "negative";
  keywords: string[];
}

/**
 * Analyse un titre/description de deal avec NLP pour extraire des infos structurées.
 */
export function analyzeDealText(text: string): DealNlpResult {
  const doc = nlp(text);

  // Extraire les noms de jeux (noms propres, organisations)
  const orgs = doc.organizations().out("array");
  const nouns = doc.nouns().out("array");
  const gameNames = [...new Set([...orgs, ...nouns.slice(0, 3)])].slice(0, 5);

  // Détecter les pourcentages de réduction
  const percentMatch = text.match(/(\d{1,2})\s*%/);
  const discountPercent = percentMatch ? parseInt(percentMatch[1]) : null;

  // Détecter le type d'offre
  const lowerText = text.toLowerCase();
  let offerType: DealNlpResult["offerType"] = "unknown";
  if (/\b(free|gratuit|100%\s*off|à vie)\b/i.test(lowerText)) {
    offerType = "free";
  } else if (/\b(discount|promo|réduction|sale|soldes|-?\d{1,2}%)\b/i.test(lowerText)) {
    offerType = "discount";
  } else if (/\b(bundle|pack|collection|édition)\b/i.test(lowerText)) {
    offerType = "bundle";
  }

  // Sentiment basique
  const positiveWords = (
    lowerText.match(/\b(gratuit|free|best|amazing|incroyable|excellent|top)\b/g) || []
  ).length;
  const negativeWords = (lowerText.match(/\b(bad|worst|scam|arnaque|éviter)\b/g) || []).length;
  const sentiment: DealNlpResult["sentiment"] =
    positiveWords > negativeWords
      ? "positive"
      : negativeWords > positiveWords
        ? "negative"
        : "neutral";

  // Mots-clés pertinents
  const keywords = doc.match("#Noun+#").out("array").slice(0, 10);

  return {
    gameNames,
    discountPercent,
    offerType,
    sentiment,
    keywords,
  };
}

/**
 * Score de pertinence d'un deal (0-100).
 * Plus le score est élevé, plus le deal est intéressant.
 */
export function scoreDeal(text: string, nlpResult?: DealNlpResult): number {
  const result = nlpResult || analyzeDealText(text);
  let score = 0;

  // Bonus pour les jeux gratuits
  if (result.offerType === "free") score += 40;

  // Bonus selon le pourcentage de réduction
  if (result.discountPercent !== null) {
    if (result.discountPercent >= 75) score += 30;
    else if (result.discountPercent >= 50) score += 20;
    else if (result.discountPercent >= 25) score += 10;
  }

  // Bonus pour les bundles
  if (result.offerType === "bundle") score += 15;

  // Bonus pour le sentiment positif
  if (result.sentiment === "positive") score += 10;

  // Bonus si des noms de jeux sont détectés
  if (result.gameNames.length > 0) score += 5;

  return Math.min(score, 100);
}
