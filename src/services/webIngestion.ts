/**
 * webIngestion.ts — Ingestion de contenu web pour l'agent IA
 *
 * Permet au bot de :
 *  1. Fetch une URL et extraire le contenu proprement (Readability)
 *  2. Résumer le contenu avec l'IA
 *  3. Stocker dans la RAG memory pour réutilisation
 *  4. Ingérer de la documentation technique en batch
 */

import { Readability } from "@mozilla/readability";
import { JSDOM } from "jsdom";
import prisma from "../prisma.js";
import logger from "../utils/logger.js";
import { config } from "../config.js";
import { embedTexts, cosineSimilarity, isCohereAvailable } from "./cohere.js";

const AI_BASE_URL = config.openRouterBaseUrl || "https://openrouter.ai/api/v1";
const AI_MODEL = config.openRouterModel || "meta-llama/llama-3.1-8b-instruct:free";
const AI_API_KEY = config.openRouterApiKey;

const MAX_CONTENT_LENGTH = 12000;
const MAX_SUMMARY_LENGTH = 2000;

interface IngestedContent {
  url: string;
  title: string;
  content: string;
  excerpt: string;
  wordCount: number;
}

/**
 * Fetch une URL et extrait le contenu principal avec Readability.
 * Supprime le boilerplate (nav, footer, ads) et garde uniquement l'article.
 */
export async function fetchAndExtract(url: string): Promise<IngestedContent | null> {
  if (!url.startsWith("http")) return null;

  try {
    const res = await fetch(url, {
      headers: {
        "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36",
        Accept: "text/html,application/xhtml+xml",
      },
      signal: AbortSignal.timeout(15000),
    });

    if (!res.ok) {
      logger.warn(`[WebIngestion] HTTP ${res.status} for ${url}`);
      return null;
    }

    const html = await res.text();
    const dom = new JSDOM(html, { url });
    const reader = new Readability(dom.window.document);
    const article = reader.parse();

    if (!article || !article.textContent) {
      logger.warn(`[WebIngestion] Readability failed for ${url}`);
      return null;
    }

    const content = article.textContent.replace(/\s+/g, " ").trim().slice(0, MAX_CONTENT_LENGTH);

    dom.window.close();

    return {
      url,
      title: article.title?.slice(0, 200) || url,
      content,
      excerpt: content.slice(0, 500),
      wordCount: content.split(/\s+/).length,
    };
  } catch (err) {
    logger.error(`[WebIngestion] Fetch error for ${url}:`, err);
    return null;
  }
}

/**
 * Résume un contenu avec l'IA (OpenAI).
 */
export async function summarizeContent(
  content: string,
  customPrompt?: string,
): Promise<string | null> {
  if (!AI_API_KEY) {
    logger.warn("[WebIngestion] No AI key, returning truncated content");
    return content.slice(0, MAX_SUMMARY_LENGTH);
  }

  try {
    const OpenAI = (await import("openai")).default;
    const client = new OpenAI({ apiKey: AI_API_KEY, baseURL: AI_BASE_URL });

    const prompt =
      customPrompt ||
      "Résume le contenu suivant de façon concise et informative. Garde les points clés, les concepts importants, et les détails techniques pertinents. Réponds en français.";

    const res = await client.chat.completions.create({
      model: AI_MODEL,
      messages: [
        { role: "system", content: prompt },
        { role: "user", content: content.slice(0, MAX_CONTENT_LENGTH) },
      ],
      max_tokens: 800,
      temperature: 0.3,
    });

    return res.choices[0]?.message?.content || null;
  } catch (err) {
    logger.error("[WebIngestion] Summarize error:", err);
    return content.slice(0, MAX_SUMMARY_LENGTH);
  }
}

/**
 * Ingestion complète : fetch + extract + summarize + store en DB.
 */
export async function ingestUrl(
  url: string,
  options?: { summarize?: boolean; customPrompt?: string; guildId?: string },
): Promise<{ title: string; summary: string; wordCount: number } | null> {
  const extracted = await fetchAndExtract(url);
  if (!extracted) return null;

  const shouldSummarize = options?.summarize !== false;
  const summary = shouldSummarize
    ? (await summarizeContent(extracted.content, options?.customPrompt)) || extracted.excerpt
    : extracted.excerpt;

  // Stocker en DB pour réutilisation par l'agent
  try {
    // Générer un embedding pour la recherche sémantique
    let embedding: number[] | null = null;
    if (isCohereAvailable()) {
      const embeddings = await embedTexts([`${extracted.title} ${summary}`]);
      if (embeddings && embeddings[0]) {
        embedding = embeddings[0];
      }
    }

    await prisma.agentKnowledge.upsert({
      where: { url },
      create: {
        url,
        title: extracted.title,
        content: extracted.content,
        summary,
        wordCount: extracted.wordCount,
        source: "web_ingestion",
      },
      update: {
        title: extracted.title,
        content: extracted.content,
        summary,
        wordCount: extracted.wordCount,
        updatedAt: new Date(),
      },
    });

    // Stocker l'embedding dans un cache en mémoire (évite de requêter Cohere à chaque recherche)
    if (embedding) {
      knowledgeEmbeddings.set(url, embedding);
      logger.debug(`[WebIngestion] Embedding stored for ${url} (${embedding.length} dims)`);
    }

    logger.info(
      `[WebIngestion] Stored "${extracted.title}" (${extracted.wordCount} words) from ${url}`,
    );
  } catch (err) {
    // Si la table n'existe pas, on log et continue
    logger.warn(`[WebIngestion] DB store failed (table may not exist): ${err}`);
  }

  return { title: extracted.title, summary, wordCount: extracted.wordCount };
}

// Cache d'embeddings en mémoire pour la recherche sémantique
const knowledgeEmbeddings = new Map<string, number[]>();

/**
 * Recherche dans la base de connaissances ingérée.
 * Utilise les embeddings sémantiques si Cohere est disponible,
 * sinon fallback sur recherche textuelle ILIKE.
 */
export async function searchKnowledge(
  query: string,
  limit = 5,
): Promise<{ title: string; summary: string; url: string }[]> {
  try {
    // Récupérer tous les documents (la base est petite)
    const allDocs = await prisma.agentKnowledge.findMany({
      take: 100,
      orderBy: { updatedAt: "desc" },
    });

    if (allDocs.length === 0) return [];

    // Si Cohere est disponible, faire une recherche sémantique
    if (isCohereAvailable()) {
      const queryEmbedding = await embedTexts([query]);
      if (queryEmbedding && queryEmbedding[0]) {
        const queryVec = queryEmbedding[0];

        // Calculer les embeddings manquants et scorer tous les docs
        const scored = await Promise.all(
          allDocs.map(async (doc) => {
            let docEmbedding = knowledgeEmbeddings.get(doc.url);
            if (!docEmbedding) {
              const embeddings = await embedTexts([`${doc.title} ${doc.summary}`]);
              if (embeddings && embeddings[0]) {
                docEmbedding = embeddings[0];
                knowledgeEmbeddings.set(doc.url, docEmbedding);
              }
            }
            const score = docEmbedding ? cosineSimilarity(queryVec, docEmbedding) : 0;
            return { doc, score };
          }),
        );

        // Trier par score de similarité
        scored.sort((a, b) => b.score - a.score);
        return scored.slice(0, limit).map(({ doc }) => ({
          title: doc.title,
          summary: doc.summary || doc.content.slice(0, 500),
          url: doc.url,
        }));
      }
    }

    // Fallback: recherche textuelle ILIKE
    const results = await prisma.agentKnowledge.findMany({
      where: {
        OR: [
          { title: { contains: query, mode: "insensitive" } },
          { content: { contains: query, mode: "insensitive" } },
          { summary: { contains: query, mode: "insensitive" } },
        ],
      },
      take: limit,
      orderBy: { updatedAt: "desc" },
    });

    return results.map(
      (r: { title: string; summary: string | null; content: string; url: string }) => ({
        title: r.title,
        summary: r.summary || r.content.slice(0, 500),
        url: r.url,
      }),
    );
  } catch {
    return [];
  }
}

/**
 * Ingère plusieurs URLs en batch (ex: documentation).
 */
export async function ingestBatch(
  urls: string[],
  options?: { summarize?: boolean; customPrompt?: string },
): Promise<{ success: number; failed: number; results: { title: string; url: string }[] }> {
  let success = 0;
  let failed = 0;
  const results: { title: string; url: string }[] = [];

  for (const url of urls) {
    const result = await ingestUrl(url, options);
    if (result) {
      success++;
      results.push({ title: result.title, url });
    } else {
      failed++;
    }
    // Petite pause entre chaque fetch
    await new Promise((r) => setTimeout(r, 500));
  }

  logger.info(`[WebIngestion] Batch done: ${success} success, ${failed} failed`);
  return { success, failed, results };
}
