import { callLlm, type LlmCallRequest, type ProviderName } from "../services/aiGateway.js";

export type Provider = "colab" | "local" | "openai" | "anthropic" | "openrouter";

const PROVIDER_ALIASES: Record<Provider, ProviderName> = {
  colab: "colab",
  local: "local-llm",
  openai: "openai",
  anthropic: "openrouter",
  openrouter: "openrouter",
};

function parseProviderOrder(): ProviderName[] {
  return (process.env.AI_PROVIDER_ORDER || "local,openai")
    .split(",")
    .map((provider) => provider.trim() as Provider)
    .filter((provider): provider is Provider => provider in PROVIDER_ALIASES)
    .map((provider) => PROVIDER_ALIASES[provider]);
}

/**
 * Compatibility wrapper for callers that still use the former utility gateway.
 * All provider selection, fallback, usage recording and cost metrics live in
 * services/aiGateway.ts.
 */
export async function callAi(
  prompt: string,
  opts?: {
    maxTokens?: number;
    provider?: Provider;
  },
): Promise<{ content: string; provider: string; tokensUsed?: number }> {
  const providerOrder = opts?.provider ? [PROVIDER_ALIASES[opts.provider]] : parseProviderOrder();

  const request: LlmCallRequest = {
    messages: [{ role: "user", content: prompt }],
    maxTokens: opts?.maxTokens,
    providerOrder: providerOrder.length > 0 ? providerOrder : undefined,
  };
  const result = await callLlm(request);

  return {
    content: result.content,
    provider: result.provider,
    tokensUsed: result.usage.totalTokens,
  };
}
