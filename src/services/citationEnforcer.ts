/**
 * citationEnforcer.ts — Force les citations pour les réponses issues du web ou de la base documentaire
 *
 * Ajoute automatiquement des citations aux réponses de l'IA qui utilisent
 * des résultats de recherche web ou de la base de connaissances.
 */

export interface Citation {
  source: string;
  url?: string;
  snippet?: string;
  relevanceScore?: number;
}

export interface CitationResult {
  content: string;
  citations: Citation[];
  hasCitations: boolean;
}

/**
 * Extrait les citations d'une réponse IA en analysant les sources fournies.
 */
export function extractCitations(content: string, sources: Citation[]): CitationResult {
  if (!sources.length) {
    return { content, citations: [], hasCitations: false };
  }

  // Check if content already has inline citations [1], [2], etc.
  const hasInlineCitations = /\[\d+\]/.test(content);

  if (hasInlineCitations) {
    return { content, citations: sources, hasCitations: true };
  }

  // Append citations at the end
  const citationText = sources
    .map((src, i) => `[${i + 1}] ${src.source}${src.url ? ` — ${src.url}` : ""}`)
    .join("\n");

  const contentWithCitations = `${content}\n\n📚 **Sources:**\n${citationText}`;

  return {
    content: contentWithCitations,
    citations: sources,
    hasCitations: true,
  };
}

/**
 * Vérifie qu'une réponse contient des citations si elle cite des informations externes.
 */
export function verifyCitations(
  content: string,
  expectedSources: Citation[],
): { valid: boolean; missing: number; reason: string } {
  if (expectedSources.length === 0) {
    return { valid: true, missing: 0, reason: "No sources expected" };
  }

  const hasInline = /\[\d+\]/.test(content);
  const hasSourcesSection = /Sources\s*:|Références\s*:|📚/i.test(content);

  if (!hasInline && !hasSourcesSection) {
    return {
      valid: false,
      missing: expectedSources.length,
      reason: "Response references external information but contains no citations",
    };
  }

  return { valid: true, missing: 0, reason: "Citations present" };
}

export default { extractCitations, verifyCitations };
