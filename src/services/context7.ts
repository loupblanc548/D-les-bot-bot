/**
 * context7.ts — Intégration Context7 pour l'agent IA
 *
 * Context7 permet de récupérer la documentation à jour de n'importe quelle
 * librairie/framework/SDK. L'agent peut ainsi répondre avec des infos vérifiées
 * plutôt qu'avec sa connaissance figée à sa date d'entraînement.
 *
 * API: https://context7.com/api/v1
 * - resolve-library-id : trouve l'ID Context7 à partir d'un nom de package
 * - query-docs          : récupère la doc pour un ID donné + query
 */

import logger from "../utils/logger.js";

const CONTEXT7_BASE_URL = "https://context7.com/api/v1";

export function isContext7Available(): boolean {
  return true; // Context7 est gratuit, pas de clé API requise
}

/**
 * Résout le nom d'une librairie en ID Context7.
 * Ex: "React" -> "/facebook/react"
 */
export async function resolveLibraryId(libraryName: string): Promise<{
  libraryId: string;
  name: string;
  description: string;
  codeSnippets: number;
} | null> {
  try {
    const url = `${CONTEXT7_BASE_URL}/resolve-library-id?libraryName=${encodeURIComponent(libraryName)}`;
    const res = await fetch(url, {
      method: "GET",
      headers: { Accept: "application/json" },
      signal: AbortSignal.timeout(10_000),
    });

    if (!res.ok) {
      logger.error(`[Context7] resolve-library-id HTTP ${res.status} for "${libraryName}"`);
      return null;
    }

    const data = (await res.json()) as {
      libraryId: string;
      name: string;
      description: string;
      codeSnippets: number;
    };

    if (!data.libraryId) {
      logger.warn(`[Context7] No library found for "${libraryName}"`);
      return null;
    }

    logger.info(
      `[Context7] Resolved "${libraryName}" -> ${data.libraryId} (${data.codeSnippets} snippets)`,
    );
    return data;
  } catch (err) {
    logger.error(`[Context7] resolve-library-id failed for "${libraryName}":`, String(err));
    return null;
  }
}

/**
 * Récupère la documentation pour une librairie donnée.
 * @param libraryId  ID Context7 (ex: "/facebook/react")
 * @param query      Question/sujet spécifique (ex: "how to use useEffect cleanup")
 * @param maxTokens  Limite de tokens à récupérer (défaut: 5000)
 */
export async function queryDocs(
  libraryId: string,
  query: string,
  maxTokens = 5000,
): Promise<string | null> {
  try {
    const url = `${CONTEXT7_BASE_URL}/query-docs?libraryId=${encodeURIComponent(libraryId)}&query=${encodeURIComponent(query)}&maxTokens=${maxTokens}`;
    const res = await fetch(url, {
      method: "GET",
      headers: { Accept: "application/json" },
      signal: AbortSignal.timeout(15_000),
    });

    if (!res.ok) {
      logger.error(`[Context7] query-docs HTTP ${res.status} for "${libraryId}"`);
      return null;
    }

    const data = (await res.json()) as { content: string; snippets?: string[] };
    const content = data.content || (data.snippets?.join("\n\n") ?? null);

    if (!content) {
      logger.warn(`[Context7] No docs returned for "${libraryId}" / "${query}"`);
      return null;
    }

    logger.info(`[Context7] Retrieved ${content.length} chars of docs for "${libraryId}"`);
    return content;
  } catch (err) {
    logger.error(`[Context7] query-docs failed for "${libraryId}":`, String(err));
    return null;
  }
}

/**
 * Recherche complète en une étape : nom de librairie + question.
 * Résout l'ID puis récupère la doc.
 */
export async function searchDocumentation(
  libraryName: string,
  question: string,
  maxTokens = 5000,
): Promise<{ library: string; content: string } | null> {
  const lib = await resolveLibraryId(libraryName);
  if (!lib) return null;

  const docs = await queryDocs(lib.libraryId, question, maxTokens);
  if (!docs) return null;

  return { library: lib.name, content: docs };
}
