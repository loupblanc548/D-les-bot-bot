/**
 * aiGateway.ts — Gateway unifié pour tous les appels IA
 *
 * Centralise la sélection de modèle, le timeout, le retry, le fallback,
 * l'enregistrement des tokens/coûts réels et les métriques.
 *
 * Contrat commun:
 *  - modèle + capacité (tool calling, vision)
 *  - budget de tokens
 *  - coût estimé et réel
 *  - timeout
 *  - retry
 *  - statut du provider
 *  - métriques
 */

import OpenAI from "openai";
import logger from "../utils/logger.js";
import { config } from "../config.js";
import { chatWithGemini, isGeminiAvailable } from "./gemini.js";
import { getActiveGroqModel, getGroqClient, isGroqAvailable } from "./groq.js";
import { getCerebrasClient, getCerebrasModel, isCerebrasAvailable } from "./cerebras.js";
import { getSambaNovaClient, getSambaNovaModel, isSambaNovaAvailable } from "./sambanova.js";
import { getNvidiaNimClient, isNvidiaNimAvailable } from "./nvidiaNim.js";
import { chatWithColabLlm, isColabLlmAvailable } from "./colabLlm.js";
import { chatWithLocalLlm, isLocalLlmAvailable, LOCAL_LLM_MODEL_NAME } from "./localLlm.js";
import { chatWithHF } from "../utils/huggingFace.js";
import { persistUsageRecord } from "./budgetPersistence.js";
import {
  aiFallbackReason,
  aiFallbackUsed,
  aiFallbackLatency,
  aiRequests,
  budgetExceeded,
  llmCostEur,
  llmRequestLatency,
  llmTokensUsed,
} from "./prometheusExporter.js";

// ─── Types du contrat commun ─────────────────────────────────────────────────

export type ProviderName =
  | "openrouter"
  | "nvidia-nim"
  | "omniroute"
  | "groq"
  | "cerebras"
  | "sambanova"
  | "gemini"
  | "local-llm"
  | "colab"
  | "huggingface"
  | "openai";

export type ModelCapability = "tool-calling" | "vision" | "streaming" | "json-mode";

export interface ModelDescriptor {
  id: string;
  provider: ProviderName;
  displayName: string;
  capabilities: ModelCapability[];
  maxTokens: number;
  costPer1kInput: number; // € per 1K input tokens
  costPer1kOutput: number; // € per 1K output tokens
  timeoutMs: number;
  maxRetries: number;
}

export interface ProviderStatus {
  name: ProviderName;
  available: boolean;
  healthy: boolean;
  lastError: string | null;
  lastSuccess: number;
  avgLatencyMs: number;
  totalCalls: number;
  totalFailures: number;
}

export interface TokenUsage {
  promptTokens: number;
  completionTokens: number;
  totalTokens: number;
}

export interface LlmCallResult {
  content: string;
  model: string;
  provider: ProviderName;
  usage: TokenUsage;
  costEur: number;
  latencyMs: number;
  finishReason: string;
  toolCalls?: Array<{
    id: string;
    name: string;
    arguments: string;
  }>;
  fallbackCount: number;
  fallbackReason?: string;
}

export interface LlmCallRequest {
  messages: Array<{ role: "system" | "user" | "assistant" | "tool"; content: string }>;
  model?: string;
  temperature?: number;
  maxTokens?: number;
  tools?: Array<{
    type: "function";
    function: { name: string; description: string; parameters: object };
  }>;
  requireToolCalling?: boolean;
  requireVision?: boolean;
  timeoutMs?: number;
  maxRetries?: number;
  deadlineMs?: number;
  // Budget tracking
  userId?: string;
  guildId?: string;
  commandName?: string;
  providerOrder?: ProviderName[];
}

// ─── Matrice de capacités des modèles ────────────────────────────────────────

export const MODEL_REGISTRY: ModelDescriptor[] = [
  {
    id: "meta/llama-3.3-70b-instruct",
    provider: "nvidia-nim",
    displayName: "Llama 3.3 70B (NVIDIA NIM)",
    capabilities: ["tool-calling", "streaming", "json-mode"],
    maxTokens: 131072,
    costPer1kInput: 0.0007,
    costPer1kOutput: 0.0008,
    timeoutMs: 30_000,
    maxRetries: 2,
  },
  {
    id: "meta/llama-3.1-70b-instruct",
    provider: "nvidia-nim",
    displayName: "Llama 3.1 70B (NVIDIA NIM)",
    capabilities: ["tool-calling", "streaming"],
    maxTokens: 131072,
    costPer1kInput: 0.0007,
    costPer1kOutput: 0.0008,
    timeoutMs: 30_000,
    maxRetries: 2,
  },
  {
    id: "llama-3.3-70b-versatile",
    provider: "groq",
    displayName: "Llama 3.3 70B (Groq)",
    capabilities: ["tool-calling", "streaming", "json-mode"],
    maxTokens: 131072,
    costPer1kInput: 0.00059,
    costPer1kOutput: 0.00079,
    timeoutMs: 30_000,
    maxRetries: 2,
  },
  {
    id: "gemini-2.0-flash",
    provider: "gemini",
    displayName: "Gemini 2.0 Flash",
    capabilities: ["tool-calling", "vision", "streaming", "json-mode"],
    maxTokens: 1_048_576,
    costPer1kInput: 0.0001,
    costPer1kOutput: 0.0004,
    timeoutMs: 60_000,
    maxRetries: 2,
  },
  {
    id: "gemini-2.5-flash",
    provider: "gemini",
    displayName: "Gemini 2.5 Flash",
    capabilities: ["tool-calling", "vision", "streaming", "json-mode"],
    maxTokens: 1_048_576,
    costPer1kInput: 0.00015,
    costPer1kOutput: 0.0006,
    timeoutMs: 60_000,
    maxRetries: 2,
  },
  {
    id: "local-llm",
    provider: "local-llm",
    displayName: "Local LLM (Ollama)",
    capabilities: ["streaming"],
    maxTokens: 8192,
    costPer1kInput: 0,
    costPer1kOutput: 0,
    timeoutMs: 120_000,
    maxRetries: 1,
  },
  {
    id: "colab-llm",
    provider: "colab",
    displayName: "Colab LLM",
    capabilities: ["streaming"],
    maxTokens: 8192,
    costPer1kInput: 0,
    costPer1kOutput: 0,
    timeoutMs: 60_000,
    maxRetries: 1,
  },
  {
    id: "huggingface-router",
    provider: "huggingface",
    displayName: "Hugging Face Router",
    capabilities: ["streaming"],
    maxTokens: 4096,
    costPer1kInput: 0,
    costPer1kOutput: 0,
    timeoutMs: 15_000,
    maxRetries: 1,
  },
];

const modelMap = new Map<string, ModelDescriptor>(MODEL_REGISTRY.map((m) => [m.id, m]));

export function getModelDescriptor(modelId: string): ModelDescriptor | null {
  return modelMap.get(modelId) ?? null;
}

function getRuntimeModelDescriptor(provider: ProviderName, modelId: string): ModelDescriptor {
  const registered = getModelDescriptor(modelId);
  if (registered) return registered;

  const defaults: Record<
    ProviderName,
    Pick<
      ModelDescriptor,
      | "capabilities"
      | "maxTokens"
      | "costPer1kInput"
      | "costPer1kOutput"
      | "timeoutMs"
      | "maxRetries"
    >
  > = {
    openrouter: {
      capabilities: ["streaming"],
      maxTokens: 8192,
      costPer1kInput: 0.0007,
      costPer1kOutput: 0.0008,
      timeoutMs: 30_000,
      maxRetries: 2,
    },
    "nvidia-nim": {
      capabilities: ["tool-calling", "streaming"],
      maxTokens: 8192,
      costPer1kInput: 0.0007,
      costPer1kOutput: 0.0008,
      timeoutMs: 30_000,
      maxRetries: 2,
    },
    groq: {
      capabilities: ["tool-calling", "streaming"],
      maxTokens: 8192,
      costPer1kInput: 0.00059,
      costPer1kOutput: 0.00079,
      timeoutMs: 30_000,
      maxRetries: 2,
    },
    cerebras: {
      capabilities: ["tool-calling", "streaming"],
      maxTokens: 8192,
      costPer1kInput: 0.0006,
      costPer1kOutput: 0.0012,
      timeoutMs: 15_000,
      maxRetries: 1,
    },
    sambanova: {
      capabilities: ["tool-calling", "streaming"],
      maxTokens: 8192,
      costPer1kInput: 0.0006,
      costPer1kOutput: 0.0012,
      timeoutMs: 20_000,
      maxRetries: 1,
    },
    gemini: {
      capabilities: ["tool-calling", "vision", "streaming", "json-mode"],
      maxTokens: 8192,
      costPer1kInput: 0.00015,
      costPer1kOutput: 0.0006,
      timeoutMs: 60_000,
      maxRetries: 2,
    },
    "local-llm": {
      capabilities: ["streaming"],
      maxTokens: 8192,
      costPer1kInput: 0,
      costPer1kOutput: 0,
      timeoutMs: 120_000,
      maxRetries: 1,
    },
    colab: {
      capabilities: ["streaming"],
      maxTokens: 8192,
      costPer1kInput: 0,
      costPer1kOutput: 0,
      timeoutMs: 60_000,
      maxRetries: 1,
    },
    huggingface: {
      capabilities: ["streaming"],
      maxTokens: 4096,
      costPer1kInput: 0,
      costPer1kOutput: 0,
      timeoutMs: 15_000,
      maxRetries: 1,
    },
    openai: {
      capabilities: ["tool-calling", "vision", "streaming", "json-mode"],
      maxTokens: 16_384,
      costPer1kInput: 0.005,
      costPer1kOutput: 0.015,
      timeoutMs: 30_000,
      maxRetries: 2,
    },
    omniroute: {
      capabilities: ["streaming"],
      maxTokens: 8192,
      costPer1kInput: 0,
      costPer1kOutput: 0,
      timeoutMs: 30_000,
      maxRetries: 1,
    },
  };
  return { id: modelId, provider, displayName: modelId, ...defaults[provider] };
}

export function findModelsByCapability(capability: ModelCapability): ModelDescriptor[] {
  return MODEL_REGISTRY.filter((m) => m.capabilities.includes(capability));
}

// ─── Statut des providers ────────────────────────────────────────────────────

const providerStatuses = new Map<ProviderName, ProviderStatus>();

function getOrCreateProviderStatus(name: ProviderName): ProviderStatus {
  let status = providerStatuses.get(name);
  if (!status) {
    status = {
      name,
      available: false,
      healthy: true,
      lastError: null,
      lastSuccess: 0,
      avgLatencyMs: 0,
      totalCalls: 0,
      totalFailures: 0,
    };
    providerStatuses.set(name, status);
  }
  return status;
}

export function markProviderAvailable(name: ProviderName): void {
  const status = getOrCreateProviderStatus(name);
  status.available = true;
  status.healthy = true;
  status.lastError = null;
}

export function markProviderUnavailable(name: ProviderName, reason: string): void {
  const status = getOrCreateProviderStatus(name);
  status.available = false;
  status.healthy = false;
  status.lastError = reason;
}

export function recordProviderCall(name: ProviderName, success: boolean, latencyMs: number): void {
  const status = getOrCreateProviderStatus(name);
  status.totalCalls++;
  if (!success) {
    status.totalFailures++;
    status.healthy = status.totalFailures < 5;
  } else {
    status.lastSuccess = Date.now();
    status.healthy = true;
    status.lastError = null;
    // Rolling average latency
    const alpha = 0.3;
    status.avgLatencyMs = Math.round(
      status.avgLatencyMs === 0 ? latencyMs : alpha * latencyMs + (1 - alpha) * status.avgLatencyMs,
    );
  }
}

export function getProviderStatus(name: ProviderName): ProviderStatus | null {
  return providerStatuses.get(name) ?? null;
}

export function getAllProviderStatuses(): ProviderStatus[] {
  return Array.from(providerStatuses.values());
}

// ─── Calcul de coût réel ─────────────────────────────────────────────────────

export function calculateCost(modelId: string, usage: TokenUsage): number {
  const desc = getModelDescriptor(modelId);
  if (!desc) return 0;
  return (
    (usage.promptTokens / 1000) * desc.costPer1kInput +
    (usage.completionTokens / 1000) * desc.costPer1kOutput
  );
}

// ─── Enregistrement des tokens réels ─────────────────────────────────────────

interface UsageRecord {
  timestamp: number;
  provider: ProviderName;
  model: string;
  promptTokens: number;
  completionTokens: number;
  totalTokens: number;
  costEur: number;
  userId?: string;
  guildId?: string;
  commandName?: string;
  latencyMs: number;
  success: boolean;
  fallbackCount?: number;
  fallbackReason?: string;
}

const usageLog: UsageRecord[] = [];
const MAX_USAGE_LOG = 10_000;

export function recordUsage(record: UsageRecord): void {
  usageLog.push(record);
  if (usageLog.length > MAX_USAGE_LOG) {
    usageLog.shift();
  }
  // Persist to Prisma + update daily counters (fire-and-forget)
  void persistUsageRecord({
    timestamp: record.timestamp,
    provider: record.provider,
    model: record.model,
    promptTokens: record.promptTokens,
    completionTokens: record.completionTokens,
    totalTokens: record.totalTokens,
    costEur: record.costEur,
    latencyMs: record.latencyMs,
    success: record.success,
    fallbackCount: record.fallbackCount,
    fallbackReason: record.fallbackReason,
    userId: record.userId,
    guildId: record.guildId,
    commandName: record.commandName,
  });
}

export function getUsageSummary(filter?: {
  userId?: string;
  guildId?: string;
  commandName?: string;
  since?: number;
}): {
  totalTokens: number;
  totalCostEur: number;
  totalCalls: number;
  byProvider: Record<string, { tokens: number; cost: number; calls: number }>;
} {
  let records = usageLog;
  if (filter?.userId) records = records.filter((r) => r.userId === filter.userId);
  if (filter?.guildId) records = records.filter((r) => r.guildId === filter.guildId);
  if (filter?.commandName) records = records.filter((r) => r.commandName === filter.commandName);
  if (filter?.since) records = records.filter((r) => r.timestamp >= filter.since!);

  const byProvider: Record<string, { tokens: number; cost: number; calls: number }> = {};
  let totalTokens = 0;
  let totalCostEur = 0;

  for (const r of records) {
    const key = r.provider;
    if (!byProvider[key]) byProvider[key] = { tokens: 0, cost: 0, calls: 0 };
    byProvider[key].tokens += r.totalTokens;
    byProvider[key].cost += r.costEur;
    byProvider[key].calls++;
    totalTokens += r.totalTokens;
    totalCostEur += r.costEur;
  }

  return { totalTokens, totalCostEur, totalCalls: records.length, byProvider };
}

// ─── Budget par utilisateur/serveur/commande ─────────────────────────────────

interface BudgetConfig {
  dailyTokenLimit: number;
  dailyCostLimitEur: number;
  perCallTokenLimit: number;
}

const defaultBudget: BudgetConfig = {
  dailyTokenLimit: 100_000,
  dailyCostLimitEur: 0.5,
  perCallTokenLimit: 8_000,
};

const customBudgets = new Map<string, BudgetConfig>(); // key: `userId` or `guildId:commandName`

export function setBudget(key: string, config: Partial<BudgetConfig>): void {
  const existing = customBudgets.get(key) ?? defaultBudget;
  customBudgets.set(key, { ...existing, ...config });
}

export function getBudget(key: string): BudgetConfig {
  return customBudgets.get(key) ?? defaultBudget;
}

export function checkBudget(
  userId?: string,
  guildId?: string,
  commandName?: string,
): { allowed: boolean; reason?: string; remaining?: number } {
  const keys: string[] = [];
  if (userId) keys.push(`user:${userId}`);
  if (guildId) keys.push(`guild:${guildId}`);
  if (guildId && commandName) keys.push(`guild:${guildId}:cmd:${commandName}`);

  const now = Date.now();
  const dayStart = now - (now % (24 * 60 * 60 * 1000));

  for (const key of keys) {
    const budget = getBudget(key);
    // Check against the relevant scope.
    let filteredTokens = 0;
    let filteredCost = 0;
    if (key.startsWith("user:")) {
      const uid = key.slice(5);
      const s = getUsageSummary({ userId: uid, since: dayStart });
      filteredTokens = s.totalTokens;
      filteredCost = s.totalCostEur;
    } else if (key.startsWith("guild:") && key.includes(":cmd:")) {
      const [, gid, , commandName] = key.split(":");
      const s = getUsageSummary({ guildId: gid, commandName, since: dayStart });
      filteredTokens = s.totalTokens;
      filteredCost = s.totalCostEur;
    } else if (key.startsWith("guild:")) {
      const gid = key.slice(6);
      const s = getUsageSummary({ guildId: gid, since: dayStart });
      filteredTokens = s.totalTokens;
      filteredCost = s.totalCostEur;
    }

    if (filteredTokens >= budget.dailyTokenLimit) {
      budgetExceeded.labels(key, "token_limit").inc();
      return {
        allowed: false,
        reason: `Budget quotidien dépassé: ${filteredTokens}/${budget.dailyTokenLimit} tokens`,
        remaining: 0,
      };
    }
    if (filteredCost >= budget.dailyCostLimitEur) {
      budgetExceeded.labels(key, "cost_limit").inc();
      return {
        allowed: false,
        reason: `Budget quotidien dépassé: ${filteredCost.toFixed(4)}/${budget.dailyCostLimitEur}€`,
        remaining: 0,
      };
    }
  }

  return { allowed: true };
}

// ─── Exécution centralisée et fallback ──────────────────────────────────────

type OpenAICompatibleClient = {
  chat: {
    completions: {
      create: (body: Record<string, unknown>, options?: { timeout?: number }) => Promise<unknown>;
    };
  };
};

type NormalizedCompletion = {
  content: string;
  usage: TokenUsage;
  finishReason: string;
  toolCalls?: LlmCallResult["toolCalls"];
};

function normalizeCompletion(response: unknown): NormalizedCompletion {
  const completion = response as {
    choices?: Array<{
      message?: {
        content?: string | null;
        tool_calls?: Array<{ id?: string; function?: { name?: string; arguments?: string } }>;
      };
      finish_reason?: string | null;
    }>;
    usage?: { prompt_tokens?: number; completion_tokens?: number; total_tokens?: number };
  };
  const choice = completion.choices?.[0];
  const promptTokens = completion.usage?.prompt_tokens ?? 0;
  const completionTokens = completion.usage?.completion_tokens ?? 0;
  const content = choice?.message?.content?.trim() ?? "";
  const toolCalls = choice?.message?.tool_calls?.map((call, index) => ({
    id: call.id ?? `tool-call-${index}`,
    name: call.function?.name ?? "unknown",
    arguments: call.function?.arguments ?? "{}",
  }));

  return {
    content,
    usage: {
      promptTokens,
      completionTokens,
      totalTokens: completion.usage?.total_tokens ?? promptTokens + completionTokens,
    },
    finishReason: choice?.finish_reason ?? "unknown",
    ...(toolCalls && toolCalls.length > 0 ? { toolCalls } : {}),
  };
}

function getConfiguredProviderModel(provider: ProviderName, requested?: string): string {
  const requestedDescriptor = requested ? getModelDescriptor(requested) : null;
  if (requested && requestedDescriptor?.provider === provider) return requested;
  if (requested && provider === "openrouter" && !requestedDescriptor) return requested;

  switch (provider) {
    case "groq":
      return getActiveGroqModel();
    case "cerebras":
      return getCerebrasModel();
    case "sambanova":
      return getSambaNovaModel();
    case "nvidia-nim":
      return (
        MODEL_REGISTRY.find((model) => model.provider === provider)?.id ??
        "meta/llama-3.3-70b-instruct"
      );
    case "local-llm":
      return LOCAL_LLM_MODEL_NAME;
    case "colab":
      return "colab-llm";
    case "openrouter":
      return config.openRouterModel;
    case "openai":
      return config.openaiModel;
    case "gemini":
      return config.geminiModel;
    case "huggingface":
      return "huggingface-router";
    case "omniroute":
      return "omniroute";
  }
}

function getProviderAvailability(provider: ProviderName): boolean {
  // Check runtime status first (set by markProviderUnavailable on failures)
  const status = providerStatuses.get(provider);
  if (status && !status.available) return false;

  // Then check API key / config presence
  switch (provider) {
    case "groq":
      return isGroqAvailable();
    case "cerebras":
      return isCerebrasAvailable();
    case "sambanova":
      return isSambaNovaAvailable();
    case "nvidia-nim":
      return isNvidiaNimAvailable();
    case "gemini":
      return isGeminiAvailable();
    case "local-llm":
      return isLocalLlmAvailable();
    case "colab":
      return isColabLlmAvailable();
    case "huggingface":
      return !!config.hfApiKey;
    case "openrouter":
      return !!config.openRouterApiKey;
    case "openai":
      return !!config.openaiApiKey;
    case "omniroute":
      return false;
  }
}

function getOpenRouterClient(): OpenAI {
  return new OpenAI({
    baseURL: config.openRouterBaseUrl,
    apiKey: config.openRouterApiKey,
    timeout: config.aiTimeoutMs,
    maxRetries: 0,
  });
}

function getOpenAIClient(): OpenAI {
  return new OpenAI({
    apiKey: config.openaiApiKey,
    timeout: config.aiTimeoutMs,
    maxRetries: 0,
  });
}

async function callOpenAICompatible(
  client: OpenAICompatibleClient,
  model: string,
  request: LlmCallRequest,
  timeoutMs: number,
): Promise<NormalizedCompletion> {
  const response = await client.chat.completions.create(
    {
      model,
      messages: request.messages,
      max_tokens: request.maxTokens,
      temperature: request.temperature,
      ...(request.tools ? { tools: request.tools } : {}),
    },
    { timeout: timeoutMs },
  );
  const normalized = normalizeCompletion(response);
  if (!normalized.content && !normalized.toolCalls?.length) {
    throw new Error("provider returned an empty response");
  }
  return normalized;
}

async function executeProvider(
  provider: ProviderName,
  request: LlmCallRequest,
  model: string,
  timeoutMs: number,
): Promise<NormalizedCompletion> {
  if (provider === "colab") {
    const content = await chatWithColabLlm(request.messages, {
      maxTokens: request.maxTokens,
      temperature: request.temperature,
    });
    if (!content) throw new Error("Colab provider returned an empty response");
    return {
      content,
      usage: { promptTokens: 0, completionTokens: 0, totalTokens: 0 },
      finishReason: "stop",
    };
  }

  if (provider === "local-llm") {
    const content = await chatWithLocalLlm(request.messages, {
      maxTokens: request.maxTokens,
      temperature: request.temperature,
      timeoutMs,
      model: model === LOCAL_LLM_MODEL_NAME ? undefined : model,
    });
    if (!content) throw new Error("local provider returned an empty response");
    return {
      content,
      usage: { promptTokens: 0, completionTokens: 0, totalTokens: 0 },
      finishReason: "stop",
    };
  }

  if (provider === "gemini") {
    const systemPrompt =
      request.messages.find((message) => message.role === "system")?.content ?? "";
    const userMessage = request.messages
      .filter((message) => message.role !== "system")
      .map((message) => `${message.role}: ${message.content}`)
      .join("\n");
    const content = await chatWithGemini(systemPrompt, userMessage, request.maxTokens);
    if (!content) throw new Error("Gemini returned an empty response");
    return {
      content,
      usage: { promptTokens: 0, completionTokens: 0, totalTokens: 0 },
      finishReason: "stop",
    };
  }

  if (provider === "huggingface") {
    const systemPrompt = request.messages.find((message) => message.role === "system")?.content;
    const userMessage = request.messages
      .filter((message) => message.role !== "system")
      .map((message) => message.content)
      .join("\n");
    const content = await chatWithHF(userMessage, systemPrompt);
    if (!content) throw new Error("Hugging Face returned an empty response");
    return {
      content,
      usage: { promptTokens: 0, completionTokens: 0, totalTokens: 0 },
      finishReason: "stop",
    };
  }

  let client: OpenAI | null = null;
  switch (provider) {
    case "groq":
      client = getGroqClient();
      break;
    case "cerebras":
      client = getCerebrasClient();
      break;
    case "sambanova":
      client = getSambaNovaClient();
      break;
    case "nvidia-nim":
      client = getNvidiaNimClient();
      break;
    case "openrouter":
      client = getOpenRouterClient();
      break;
    case "openai":
      client = getOpenAIClient();
      break;
    case "omniroute":
      client = null;
      break;
  }
  if (!client) throw new Error(`${provider} provider is unavailable`);

  const compatibleClient: OpenAICompatibleClient = {
    chat: {
      completions: {
        create: (body, options) => client!.chat.completions.create(body as never, options as never),
      },
    },
  };
  return callOpenAICompatible(compatibleClient, model, request, timeoutMs);
}

function classifyFailure(error: unknown): string {
  const message =
    error instanceof Error ? error.message.toLowerCase() : String(error).toLowerCase();
  if (message.includes("429") || message.includes("rate limit") || message.includes("quota"))
    return "rate_limit";
  if (message.includes("timeout") || message.includes("timed out") || message.includes("aborted"))
    return "timeout";
  if (message.includes("empty response")) return "empty_response";
  return "error";
}

function isRetryableFailure(reason: string): boolean {
  return reason === "timeout" || reason === "error";
}

async function executeWithRetries(
  provider: ProviderName,
  request: LlmCallRequest,
  model: string,
  timeoutMs: number,
  maxRetries: number,
): Promise<NormalizedCompletion> {
  let lastError: unknown;
  for (let attempt = 0; attempt <= maxRetries; attempt++) {
    try {
      return await executeProvider(provider, request, model, timeoutMs);
    } catch (error) {
      lastError = error;
      const reason = classifyFailure(error);
      if (attempt >= maxRetries || !isRetryableFailure(reason)) throw error;
      const backoffMs = Math.min(100 * 2 ** attempt, 500);
      await new Promise((resolve) => setTimeout(resolve, backoffMs));
    }
  }
  throw lastError instanceof Error ? lastError : new Error(String(lastError));
}

export async function callLlm(request: LlmCallRequest): Promise<LlmCallResult> {
  const budget = checkBudget(request.userId, request.guildId, request.commandName);
  if (!budget.allowed) {
    throw new Error(budget.reason ?? "AI budget exceeded");
  }

  const requestedTokens = request.maxTokens ?? 0;
  const budgetKeys = [
    request.userId ? `user:${request.userId}` : null,
    request.guildId ? `guild:${request.guildId}` : null,
    request.guildId && request.commandName
      ? `guild:${request.guildId}:cmd:${request.commandName}`
      : null,
  ].filter((key): key is string => key !== null);
  if (budgetKeys.some((key) => requestedTokens > getBudget(key).perCallTokenLimit)) {
    throw new Error(`Per-call AI token budget exceeded: ${requestedTokens} tokens requested`);
  }

  const order = request.providerOrder ?? [
    "nvidia-nim",
    "groq",
    "cerebras",
    "sambanova",
    "openrouter",
    "gemini",
    "huggingface",
    "local-llm",
  ];
  const candidates = order.filter((provider) => getProviderAvailability(provider));
  if (candidates.length === 0) throw new Error("No AI provider available");

  let fallbackCount = 0;
  let fallbackReason: string | undefined;
  const startedAt = Date.now();
  const deadline = request.deadlineMs ? startedAt + request.deadlineMs : Infinity;

  for (const provider of candidates) {
    // Global deadline check: skip remaining providers if time is up
    const remainingMs = deadline - Date.now();
    if (remainingMs <= 0) {
      logger.warn(
        `[AIGateway] Global deadline exceeded (${request.deadlineMs}ms) — aborting cascade`,
      );
      break;
    }

    const model = getConfiguredProviderModel(provider, request.model);
    const descriptor = getRuntimeModelDescriptor(provider, model);
    const requestedTimeout = request.timeoutMs ?? descriptor.timeoutMs ?? config.aiTimeoutMs;
    // Clamp per-provider timeout to remaining deadline
    const timeoutMs = Math.min(requestedTimeout, remainingMs);
    const maxRetries = Math.min(request.maxRetries ?? descriptor.maxRetries ?? 0, 2);
    const providerStartedAt = Date.now();
    markProviderAvailable(provider);
    aiRequests.labels(provider).inc();

    try {
      const completion = await executeWithRetries(provider, request, model, timeoutMs, maxRetries);
      const latencyMs = Date.now() - providerStartedAt;
      const usage = completion.usage;
      const costEur =
        (usage.promptTokens / 1000) * descriptor.costPer1kInput +
        (usage.completionTokens / 1000) * descriptor.costPer1kOutput;
      recordProviderCall(provider, true, latencyMs);
      recordUsage({
        timestamp: Date.now(),
        provider,
        model,
        ...usage,
        costEur,
        userId: request.userId,
        guildId: request.guildId,
        commandName: request.commandName,
        latencyMs,
        success: true,
        fallbackCount,
        fallbackReason,
      });
      llmTokensUsed.labels(provider, model, "prompt").inc(usage.promptTokens);
      llmTokensUsed.labels(provider, model, "completion").inc(usage.completionTokens);
      llmCostEur.labels(provider, model).inc(costEur);
      llmRequestLatency.labels(provider, model).observe(latencyMs / 1000);
      if (fallbackCount > 0) {
        aiFallbackUsed.labels(provider, "success").inc();
        aiFallbackLatency.labels(provider).observe(latencyMs / 1000);
      }
      return {
        content: completion.content,
        model,
        provider,
        usage,
        costEur,
        latencyMs: Date.now() - startedAt,
        finishReason: completion.finishReason,
        toolCalls: completion.toolCalls,
        fallbackCount,
        fallbackReason,
      };
    } catch (error) {
      const latencyMs = Date.now() - providerStartedAt;
      const reason = classifyFailure(error);
      recordProviderCall(provider, false, latencyMs);
      markProviderUnavailable(provider, error instanceof Error ? error.message : String(error));
      if (fallbackReason === undefined) fallbackReason = reason;
      if (fallbackCount > 0 || candidates.length > 1) {
        aiFallbackReason
          .labels(
            reason,
            provider,
            candidates[Math.min(fallbackCount + 1, candidates.length - 1)] ?? "none",
          )
          .inc();
      }
      aiFallbackUsed.labels(provider, "failure").inc();
      logger.warn(`[AIGateway] ${provider}/${model} failed (${reason}); trying fallback`);
      fallbackCount++;
    }
  }

  const elapsedMs = Date.now() - startedAt;
  const deadlineExceeded = deadline !== Infinity && Date.now() >= deadline;
  throw new Error(
    deadlineExceeded
      ? `AI cascade aborted: global deadline (${request.deadlineMs}ms) exceeded after ${fallbackCount} provider attempts (${elapsedMs}ms elapsed)`
      : `All AI providers failed after ${fallbackCount} attempts (${elapsedMs}ms elapsed)`,
  );
}

// ─── Sélection de modèle ─────────────────────────────────────────────────────

export function selectModel(
  request: LlmCallRequest,
  availableModels: string[],
): ModelDescriptor | null {
  // Filter by capabilities
  let candidates = availableModels
    .map((id) => getModelDescriptor(id))
    .filter((m): m is ModelDescriptor => m !== null);

  if (request.requireToolCalling) {
    candidates = candidates.filter((m) => m.capabilities.includes("tool-calling"));
  }
  if (request.requireVision) {
    candidates = candidates.filter((m) => m.capabilities.includes("vision"));
  }

  // Filter by availability
  candidates = candidates.filter((m) => {
    const status = getProviderStatus(m.provider);
    return status?.available && status?.healthy;
  });

  // Sort by cost (cheapest first)
  candidates.sort((a, b) => a.costPer1kInput - b.costPer1kInput);

  return candidates[0] ?? null;
}

export default {
  MODEL_REGISTRY,
  getModelDescriptor,
  callLlm,
  findModelsByCapability,
  markProviderAvailable,
  markProviderUnavailable,
  recordProviderCall,
  getProviderStatus,
  getAllProviderStatuses,
  calculateCost,
  recordUsage,
  getUsageSummary,
  setBudget,
  getBudget,
  checkBudget,
  selectModel,
};
