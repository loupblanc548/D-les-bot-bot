/**
 * openrouterMcp.ts — OpenRouter MCP Client
 *
 * Intègre le serveur MCP d'OpenRouter (https://mcp.openrouter.ai/mcp)
 * pour permettre à l'agent IA de:
 *   - Découvrir les modèles disponibles en temps réel
 *   - Comparer les benchmarks et prix
 *   - Tester des prompts sur différents modèles
 *   - Chercher dans la doc OpenRouter
 *   - Vérifier les crédits restants
 *
 * Le MCP utilise JSON-RPC 2.0 over HTTP. On implémente un client léger.
 */

import logger from "../utils/logger.js";

// ─── Types ───────────────────────────────────────────────────────────────────

export interface McpModelInfo {
  id: string;
  name: string;
  description: string;
  context_length: number;
  pricing: {
    prompt: string;
    completion: string;
  };
  supported_parameters: string[];
  architecture: {
    modality: string;
    tokenizer: string;
  };
}

export interface McpBenchmark {
  model_id: string;
  name: string;
  score: number;
  category: string;
  source: string;
}

export interface McpChatResult {
  model: string;
  content: string;
  cost: number;
  tokens: {
    prompt: number;
    completion: number;
  };
  provider: string;
}

export interface McpDocResult {
  title: string;
  url: string;
  snippet: string;
}

// ─── Configuration ───────────────────────────────────────────────────────────

const MCP_ENDPOINT = "https://mcp.openrouter.ai/mcp";
const MCP_TIMEOUT_MS = 15_000;
const CACHE_TTL_MS = 5 * 60 * 1000; // 5 min cache for read-only operations

// ─── Cache ───────────────────────────────────────────────────────────────────

const mcpCache = new Map<string, { data: unknown; ts: number }>();

function getCached<T>(key: string): T | null {
  const entry = mcpCache.get(key);
  if (entry && Date.now() - entry.ts < CACHE_TTL_MS) {
    return entry.data as T;
  }
  return null;
}

function setCached(key: string, data: unknown): void {
  // Enforce cache size limit
  if (mcpCache.size > 50) {
    const oldestKey = mcpCache.keys().next().value;
    if (oldestKey) mcpCache.delete(oldestKey);
  }
  mcpCache.set(key, { data, ts: Date.now() });
}

// ─── MCP JSON-RPC Client ─────────────────────────────────────────────────────

let requestId = 0;

/**
 * Call a tool on the OpenRouter MCP server.
 * Uses JSON-RPC 2.0 over HTTP POST.
 */
async function callMcpTool(toolName: string, args: Record<string, unknown> = {}): Promise<unknown> {
  const id = ++requestId;

  const body = {
    jsonrpc: "2.0",
    id,
    method: "tools/call",
    params: {
      name: toolName,
      arguments: args,
    },
  };

  const headers: Record<string, string> = {
    "Content-Type": "application/json",
  };

  // Use the bot's OpenRouter API key for authentication
  const apiKey = process.env.OPENROUTER_API_KEY;
  if (apiKey) {
    headers["Authorization"] = `Bearer ${apiKey}`;
  }

  const response = await fetch(MCP_ENDPOINT, {
    method: "POST",
    headers,
    body: JSON.stringify(body),
    signal: AbortSignal.timeout(MCP_TIMEOUT_MS),
  });

  if (!response.ok) {
    throw new Error(`MCP HTTP ${response.status}: ${response.statusText}`);
  }

  const result = (await response.json()) as {
    result?: { content?: Array<{ type: string; text: string }> };
    error?: { code: number; message: string };
  };

  if (result.error) {
    throw new Error(`MCP error ${result.error.code}: ${result.error.message}`);
  }

  // MCP returns content as array of { type, text }
  const content = result.result?.content;
  if (!content || !Array.isArray(content) || content.length === 0) {
    return null;
  }

  // Extract text from the first text content block
  const textBlock = content.find((c) => c.type === "text");
  if (!textBlock) return null;

  try {
    return JSON.parse(textBlock.text);
  } catch {
    return textBlock.text;
  }
}

// ─── Public API ──────────────────────────────────────────────────────────────

/**
 * List available models with optional filters.
 */
export async function listModels(filters?: {
  modality?: string;
  provider?: string;
  min_context?: number;
  max_price?: number;
  free_only?: boolean;
}): Promise<McpModelInfo[]> {
  const cacheKey = `models-list-${JSON.stringify(filters || {})}`;
  const cached = getCached<McpModelInfo[]>(cacheKey);
  if (cached) return cached;

  try {
    const args: Record<string, unknown> = {};
    if (filters?.modality) args.modality = filters.modality;
    if (filters?.provider) args.provider = filters.provider;
    if (filters?.min_context) args.min_context = filters.min_context;
    if (filters?.max_price) args.max_price = filters.max_price;
    if (filters?.free_only) args.free_only = true;

    const result = await callMcpTool("models-list", args);
    const models = (Array.isArray(result) ? result : []) as McpModelInfo[];
    setCached(cacheKey, models);
    logger.info(`[OpenRouterMCP] Listed ${models.length} models`);
    return models;
  } catch (err) {
    logger.warn(
      `[OpenRouterMCP] listModels failed: ${err instanceof Error ? err.message : String(err)}`,
    );
    return [];
  }
}

/**
 * Get detailed info for a specific model.
 */
export async function getModel(modelId: string): Promise<McpModelInfo | null> {
  const cacheKey = `model-get-${modelId}`;
  const cached = getCached<McpModelInfo>(cacheKey);
  if (cached) return cached;

  try {
    const result = await callMcpTool("model-get", { model_id: modelId });
    if (result && typeof result === "object") {
      const model = result as McpModelInfo;
      setCached(cacheKey, model);
      return model;
    }
    return null;
  } catch (err) {
    logger.warn(
      `[OpenRouterMCP] getModel failed: ${err instanceof Error ? err.message : String(err)}`,
    );
    return null;
  }
}

/**
 * Get benchmark scores for models.
 */
export async function getBenchmarks(category?: string): Promise<McpBenchmark[]> {
  const cacheKey = `benchmarks-${category || "all"}`;
  const cached = getCached<McpBenchmark[]>(cacheKey);
  if (cached) return cached;

  try {
    const args: Record<string, unknown> = {};
    if (category) args.category = category;

    const result = await callMcpTool("benchmarks", args);
    const benchmarks = (Array.isArray(result) ? result : []) as McpBenchmark[];
    setCached(cacheKey, benchmarks);
    return benchmarks;
  } catch (err) {
    logger.warn(
      `[OpenRouterMCP] getBenchmarks failed: ${err instanceof Error ? err.message : String(err)}`,
    );
    return [];
  }
}

/**
 * Get daily rankings (most used models).
 */
export async function getRankings(): Promise<
  Array<{ model_id: string; rank: number; token_volume: number }>
> {
  const cacheKey = "rankings-daily";
  const cached =
    getCached<Array<{ model_id: string; rank: number; token_volume: number }>>(cacheKey);
  if (cached) return cached;

  try {
    const result = await callMcpTool("rankings-daily");
    const rankings = (Array.isArray(result) ? result : []) as Array<{
      model_id: string;
      rank: number;
      token_volume: number;
    }>;
    setCached(cacheKey, rankings);
    return rankings;
  } catch (err) {
    logger.warn(
      `[OpenRouterMCP] getRankings failed: ${err instanceof Error ? err.message : String(err)}`,
    );
    return [];
  }
}

/**
 * Send a test prompt to any model via MCP chat-send.
 * This is a billable operation.
 */
export async function chatSend(
  model: string,
  prompt: string,
  maxTokens = 500,
): Promise<McpChatResult | null> {
  try {
    const result = await callMcpTool("chat-send", {
      model,
      messages: [{ role: "user", content: prompt }],
      max_tokens: maxTokens,
    });

    if (result && typeof result === "object") {
      return result as McpChatResult;
    }
    return null;
  } catch (err) {
    logger.warn(
      `[OpenRouterMCP] chatSend failed: ${err instanceof Error ? err.message : String(err)}`,
    );
    return null;
  }
}

/**
 * Search OpenRouter documentation.
 */
export async function searchDocs(query: string): Promise<McpDocResult[]> {
  try {
    const result = await callMcpTool("docs-search", { query });
    if (Array.isArray(result)) return result as McpDocResult[];
    if (typeof result === "string") {
      return [{ title: "Doc Search", url: "", snippet: result }];
    }
    return [];
  } catch (err) {
    logger.warn(
      `[OpenRouterMCP] searchDocs failed: ${err instanceof Error ? err.message : String(err)}`,
    );
    return [];
  }
}

/**
 * Get remaining account credits.
 */
export async function getCredits(): Promise<number | null> {
  try {
    const result = await callMcpTool("credits-get");
    if (typeof result === "number") return result;
    if (result && typeof result === "object" && "credits" in result) {
      return (result as { credits: number }).credits;
    }
    return null;
  } catch (err) {
    logger.warn(
      `[OpenRouterMCP] getCredits failed: ${err instanceof Error ? err.message : String(err)}`,
    );
    return null;
  }
}

/**
 * List available providers.
 */
export async function listProviders(): Promise<Array<{ name: string; id: string }>> {
  const cacheKey = "providers-list";
  const cached = getCached<Array<{ name: string; id: string }>>(cacheKey);
  if (cached) return cached;

  try {
    const result = await callMcpTool("providers-list");
    const providers = (Array.isArray(result) ? result : []) as Array<{ name: string; id: string }>;
    setCached(cacheKey, providers);
    return providers;
  } catch (err) {
    logger.warn(
      `[OpenRouterMCP] listProviders failed: ${err instanceof Error ? err.message : String(err)}`,
    );
    return [];
  }
}

// ─── Cache Management ────────────────────────────────────────────────────────

export function clearMcpCache(): void {
  mcpCache.clear();
  logger.info("[OpenRouterMCP] Cache cleared");
}

export function getMcpCacheStats(): { size: number; maxSize: number } {
  return { size: mcpCache.size, maxSize: 50 };
}
