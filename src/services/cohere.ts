/**
 * cohere.ts — Cohere API integration (reranking, embeddings, classification)
 *
 * Free tier: Trial key = 1000 req/month, 100 req/min
 * Models: command-r (chat), embed-english-v3 / embed-multilingual-v3, rerank-english-v3 / rerank-multilingual-v3
 *
 * Primary use:
 *  - Rerank search results (Brave Search → Cohere Rerank → best results)
 *  - Semantic embeddings for memory search (vector similarity)
 *  - Text classification (toxicity, sentiment, spam)
 */

import logger from "../utils/logger.js";
import { config } from "../config.js";

const COHERE_BASE_URL = "https://api.cohere.com/v1";

export function isCohereAvailable(): boolean {
  return !!config.cohereApiKey;
}

function getHeaders(): Record<string, string> {
  return {
    Authorization: `Bearer ${config.cohereApiKey}`,
    "Content-Type": "application/json",
  };
}

// ─── Reranking ───────────────────────────────────────────────────────────────

export interface RerankResult {
  index: number;
  relevanceScore: number;
  document: { text: string };
}

/**
 * Rerank documents by relevance to a query
 * @param query The search query
 * @param documents Array of document texts to rerank
 * @param topN Number of top results to return
 * @returns Reranked results sorted by relevance
 */
export async function rerankDocuments(
  query: string,
  documents: string[],
  topN = 5,
): Promise<RerankResult[]> {
  if (!config.cohereApiKey || documents.length === 0) return [];

  try {
    const res = await fetch(`${COHERE_BASE_URL}/rerank`, {
      method: "POST",
      headers: getHeaders(),
      body: JSON.stringify({
        model: "rerank-multilingual-v3.0",
        query,
        documents,
        top_n: Math.min(topN, documents.length),
        return_documents: true,
      }),
      signal: AbortSignal.timeout(8_000),
    });

    if (!res.ok) {
      logger.debug(`[Cohere] Rerank HTTP ${res.status}`);
      return [];
    }

    const data = (await res.json()) as { results?: RerankResult[] };
    return data.results || [];
  } catch (error) {
    logger.debug(`[Cohere] Rerank error: ${error instanceof Error ? error.message : String(error)}`);
    return [];
  }
}

// ─── Embeddings ──────────────────────────────────────────────────────────────

/**
 * Generate embeddings for texts (multilingual model)
 * @param texts Array of texts to embed
 * @returns Array of embedding vectors (float arrays)
 */
export async function embedTexts(texts: string[]): Promise<number[][] | null> {
  if (!config.cohereApiKey || texts.length === 0) return null;

  try {
    const res = await fetch(`${COHERE_BASE_URL}/embed`, {
      method: "POST",
      headers: getHeaders(),
      body: JSON.stringify({
        model: "embed-multilingual-v3.0",
        texts,
        input_type: "search_document",
        embedding_types: ["float"],
      }),
      signal: AbortSignal.timeout(8_000),
    });

    if (!res.ok) {
      logger.debug(`[Cohere] Embed HTTP ${res.status}`);
      return null;
    }

    const data = (await res.json()) as {
      embeddings?: { float?: number[][] };
    };
    return data.embeddings?.float || null;
  } catch (error) {
    logger.debug(`[Cohere] Embed error: ${error instanceof Error ? error.message : String(error)}`);
    return null;
  }
}

/**
 * Compute cosine similarity between two embedding vectors
 */
export function cosineSimilarity(a: number[], b: number[]): number {
  if (a.length !== b.length) return 0;
  let dot = 0, normA = 0, normB = 0;
  for (let i = 0; i < a.length; i++) {
    dot += a[i] * b[i];
    normA += a[i] * a[i];
    normB += b[i] * b[i];
  }
  const denom = Math.sqrt(normA) * Math.sqrt(normB);
  return denom === 0 ? 0 : dot / denom;
}

/**
 * Find the most semantically similar texts to a query
 * @param query The query text
 * @param candidates Array of candidate texts
 * @param topK Number of top matches to return
 * @returns Indices of the top K most similar candidates
 */
export async function semanticSearch(
  query: string,
  candidates: string[],
  topK = 3,
): Promise<Array<{ index: number; score: number }>> {
  if (!config.cohereApiKey || candidates.length === 0) return [];

  const allEmbeddings = await embedTexts([query, ...candidates]);
  if (!allEmbeddings || allEmbeddings.length < 2) return [];

  const queryEmbedding = allEmbeddings[0];
  const candidateEmbeddings = allEmbeddings.slice(1);

  const scores = candidateEmbeddings.map((emb, i) => ({
    index: i,
    score: cosineSimilarity(queryEmbedding, emb),
  }));

  return scores.sort((a, b) => b.score - a.score).slice(0, topK);
}

// ─── Classification ──────────────────────────────────────────────────────────

export interface ClassifyResult {
  label: string;
  confidence: number;
}

/**
 * Classify text into predefined categories
 * @param text Text to classify
 * @param labels Array of possible labels
 * @returns Top label + confidence
 */
export async function classifyText(
  text: string,
  labels: string[],
): Promise<ClassifyResult | null> {
  if (!config.cohereApiKey || labels.length === 0) return null;

  try {
    const res = await fetch(`${COHERE_BASE_URL}/classify`, {
      method: "POST",
      headers: getHeaders(),
      body: JSON.stringify({
        model: "embed-multilingual-v3.0",
        inputs: [text],
        examples: labels.map((label) => ({ text: "", label })),
      }),
      signal: AbortSignal.timeout(8_000),
    });

    if (!res.ok) {
      logger.debug(`[Cohere] Classify HTTP ${res.status}`);
      return null;
    }

    const data = (await res.json()) as {
      classifications?: Array<{ label: string; confidence: number }>;
    };
    const result = data.classifications?.[0];
    if (!result) return null;
    return { label: result.label, confidence: result.confidence };
  } catch (error) {
    logger.debug(`[Cohere] Classify error: ${error instanceof Error ? error.message : String(error)}`);
    return null;
  }
}
