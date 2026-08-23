/**
 * embeddingProvider.ts — Abstraction d'embedding interchangeable
 *
 * Permet de remplacer le fallback lexical TF-IDF/hash par de vrais embeddings
 * (OpenAI, Voyage, local) tout en conservant le fallback lexical.
 *
 * Recherche hybride: BM25/lexical + vecteurs + reranking
 */

import logger from "../utils/logger.js";

// ─── Types ───────────────────────────────────────────────────────────────────

export interface EmbeddingVector {
  values: number[];
  dimensions: number;
}

export interface EmbeddingProvider {
  name: string;
  embed(text: string): Promise<EmbeddingVector>;
  embedBatch(texts: string[]): Promise<EmbeddingVector[]>;
  isAvailable(): boolean;
}

export interface HybridSearchResult {
  id: string;
  content: string;
  score: number;
  lexicalScore: number;
  vectorScore: number;
  rerankedScore: number;
}

// ─── Fallback lexical (TF-IDF simplifié) ─────────────────────────────────────

const STOP_WORDS = new Set([
  "the",
  "a",
  "an",
  "is",
  "are",
  "was",
  "were",
  "be",
  "been",
  "i",
  "you",
  "he",
  "she",
  "it",
  "we",
  "they",
  "to",
  "of",
  "in",
  "on",
  "at",
  "for",
  "with",
  "by",
  "and",
  "or",
  "but",
  "not",
  "no",
  "yes",
  "le",
  "la",
  "les",
  "un",
  "une",
  "des",
  "de",
  "du",
  "et",
  "ou",
  "que",
  "qui",
  "dans",
  "pour",
  "sur",
  "avec",
  "sans",
  "pas",
]);

function tokenize(text: string): string[] {
  return text
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[^a-z0-9\s]/g, " ")
    .split(/\s+/)
    .filter((w) => w.length > 2 && !STOP_WORDS.has(w));
}

function termFrequency(tokens: string[]): Map<string, number> {
  const freq = new Map<string, number>();
  for (const token of tokens) {
    freq.set(token, (freq.get(token) || 0) + 1);
  }
  const total = tokens.length || 1;
  for (const [key, value] of freq) {
    freq.set(key, value / total);
  }
  return freq;
}

export function cosineSim(a: Map<string, number>, b: Map<string, number>): number {
  let dot = 0;
  let magA = 0;
  let magB = 0;
  for (const [key, valA] of a) {
    magA += valA * valA;
    const valB = b.get(key);
    if (valB) dot += valA * valB;
  }
  for (const [, valB] of b) {
    magB += valB * valB;
  }
  if (magA === 0 || magB === 0) return 0;
  return dot / (Math.sqrt(magA) * Math.sqrt(magB));
}

export class LexicalEmbeddingProvider implements EmbeddingProvider {
  name = "lexical-tf";

  async embed(text: string): Promise<EmbeddingVector> {
    // Use hash-based vector for compatibility
    const tokens = tokenize(text);
    const freq = termFrequency(tokens);
    const vector = new Array(256).fill(0);
    for (const [token, tf] of freq) {
      let hash = 0;
      for (let i = 0; i < token.length; i++) {
        hash = ((hash << 5) - hash + token.charCodeAt(i)) | 0;
      }
      const idx = Math.abs(hash) % 256;
      vector[idx] += tf;
    }
    return { values: vector, dimensions: 256 };
  }

  async embedBatch(texts: string[]): Promise<EmbeddingVector[]> {
    return Promise.all(texts.map((t) => this.embed(t)));
  }

  isAvailable(): boolean {
    return true;
  }
}

// ─── BM25 pour recherche lexicale ────────────────────────────────────────────

export class BM25Index {
  private docs: Array<{ id: string; tokens: string[]; freq: Map<string, number> }> = [];
  private avgDocLength = 0;
  private docFreq = new Map<string, number>(); // term → number of docs containing it
  private k1 = 1.5;
  private b = 0.75;

  addDoc(id: string, content: string): void {
    const tokens = tokenize(content);
    const freq = new Map<string, number>();
    for (const token of tokens) {
      freq.set(token, (freq.get(token) || 0) + 1);
    }
    this.docs.push({ id, tokens, freq });
    for (const term of freq.keys()) {
      this.docFreq.set(term, (this.docFreq.get(term) || 0) + 1);
    }
    this.avgDocLength = this.docs.reduce((sum, d) => sum + d.tokens.length, 0) / this.docs.length;
  }

  search(query: string, topK = 10): Array<{ id: string; score: number }> {
    const queryTokens = tokenize(query);
    const scores: Array<{ id: string; score: number }> = [];

    for (const doc of this.docs) {
      let score = 0;
      for (const term of queryTokens) {
        const tf = doc.freq.get(term) || 0;
        if (tf === 0) continue;
        const idf = Math.log(
          (this.docs.length - (this.docFreq.get(term) || 0) + 0.5) /
            ((this.docFreq.get(term) || 0) + 0.5) +
            1,
        );
        const tfNorm =
          (tf * (this.k1 + 1)) /
          (tf + this.k1 * (1 - this.b + this.b * (doc.tokens.length / (this.avgDocLength || 1))));
        score += idf * tfNorm;
      }
      scores.push({ id: doc.id, score });
    }

    scores.sort((a, b) => b.score - a.score);
    return scores.filter((s) => s.score > 0).slice(0, topK);
  }

  clear(): void {
    this.docs = [];
    this.docFreq.clear();
    this.avgDocLength = 0;
  }
}

// ─── Recherche hybride ───────────────────────────────────────────────────────

export class HybridSearch {
  private bm25 = new BM25Index();
  private vectorIndex = new Map<string, { id: string; vector: EmbeddingVector; content: string }>();
  private provider: EmbeddingProvider;

  constructor(provider?: EmbeddingProvider) {
    this.provider = provider ?? new LexicalEmbeddingProvider();
  }

  async addDocument(id: string, content: string): Promise<void> {
    this.bm25.addDoc(id, content);
    const vector = await this.provider.embed(content);
    this.vectorIndex.set(id, { id, vector, content });
  }

  async search(
    query: string,
    topK = 10,
    options?: { lexicalWeight?: number; vectorWeight?: number },
  ): Promise<HybridSearchResult[]> {
    const lexicalWeight = options?.lexicalWeight ?? 0.4;
    const vectorWeight = options?.vectorWeight ?? 0.6;

    // Lexical search (BM25)
    const lexicalResults = this.bm25.search(query, topK * 2);
    const lexicalMap = new Map(lexicalResults.map((r) => [r.id, r.score]));

    // Vector search
    const queryVector = await this.provider.embed(query);
    const vectorResults: Array<{ id: string; score: number; content: string }> = [];
    for (const [id, entry] of this.vectorIndex) {
      const sim = this.cosineSimilarity(queryVector.values, entry.vector.values);
      vectorResults.push({ id, score: sim, content: entry.content });
    }
    vectorResults.sort((a, b) => b.score - a.score);

    // Normalize scores
    const maxLexical = Math.max(...lexicalResults.map((r) => r.score), 1);
    const maxVector = Math.max(...vectorResults.map((r) => r.score), 1);

    // Combine scores
    const allIds = new Set([...lexicalMap.keys(), ...vectorResults.map((r) => r.id)]);
    const results: HybridSearchResult[] = [];

    for (const id of allIds) {
      const lexicalScore = (lexicalMap.get(id) || 0) / maxLexical;
      const vectorEntry = vectorResults.find((r) => r.id === id);
      const vectorScore = (vectorEntry?.score || 0) / maxVector;
      const content = vectorEntry?.content ?? "";

      // Reranking: weighted combination
      const rerankedScore = lexicalWeight * lexicalScore + vectorWeight * vectorScore;

      results.push({
        id,
        content,
        score: rerankedScore,
        lexicalScore,
        vectorScore,
        rerankedScore,
      });
    }

    results.sort((a, b) => b.rerankedScore - a.rerankedScore);
    return results.slice(0, topK);
  }

  private cosineSimilarity(a: number[], b: number[]): number {
    let dot = 0;
    let magA = 0;
    let magB = 0;
    const len = Math.min(a.length, b.length);
    for (let i = 0; i < len; i++) {
      dot += a[i] * b[i];
      magA += a[i] * a[i];
      magB += b[i] * b[i];
    }
    if (magA === 0 || magB === 0) return 0;
    return dot / (Math.sqrt(magA) * Math.sqrt(magB));
  }

  clear(): void {
    this.bm25.clear();
    this.vectorIndex.clear();
  }

  get size(): number {
    return this.vectorIndex.size;
  }
}

// ─── Factory ─────────────────────────────────────────────────────────────────

let activeProvider: EmbeddingProvider | null = null;

export function getEmbeddingProvider(): EmbeddingProvider {
  if (activeProvider && activeProvider.isAvailable()) return activeProvider;
  return new LexicalEmbeddingProvider();
}

export function setEmbeddingProvider(provider: EmbeddingProvider): void {
  activeProvider = provider;
  logger.info(`[EmbeddingProvider] Switched to ${provider.name}`);
}

export default {
  HybridSearch,
  BM25Index,
  getEmbeddingProvider,
  setEmbeddingProvider,
  LexicalEmbeddingProvider,
};
