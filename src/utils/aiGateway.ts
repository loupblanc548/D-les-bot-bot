import { withCircuitBreaker } from "./circuitBreaker.js";

export type Provider = 'local' | 'openai' | 'anthropic' | 'openrouter';

// Prometheus token counters (lazy-loaded)
let tokenCounter: any = null;
let callCounter: any = null;
let latencyHistogram: any = null;

async function getMetrics() {
  try {
    const { register, Counter, Histogram } = await import("../services/metrics.js");
    if (!tokenCounter) {
      tokenCounter = new Counter({
        name: "bot_ai_tokens_total",
        help: "Total AI tokens used",
        labelNames: ["provider", "type"],
        registers: [register],
      });
      callCounter = new Counter({
        name: "bot_ai_calls_total",
        help: "Total AI calls",
        labelNames: ["provider", "status"],
        registers: [register],
      });
      latencyHistogram = new Histogram({
        name: "bot_ai_response_seconds",
        help: "AI response latency in seconds",
        labelNames: ["provider"],
        buckets: [1, 5, 10, 20, 30, 60, 90, 120],
        registers: [register],
      });
    }
    return { tokenCounter, callCounter, latencyHistogram };
  } catch {
    return null;
  }
}

export async function callAi(prompt: string, opts?: {
  maxTokens?: number;
  provider?: Provider;
}): Promise<{ content: string; provider: string; tokensUsed?: number }> {
  const order = (process.env.AI_PROVIDER_ORDER || "local,openai").split(",");
  const metrics = await getMetrics();
  const startTime = Date.now();

  for (const p of order) {
    const provider = p.trim() as Provider;
    try {
      const result = await withCircuitBreaker(provider, async () => {
        if (provider === 'local') {
          // call local LLM endpoint
          return { content: "", provider: 'local' };
        } else if (provider === 'openai') {
          // call OpenAI via key
          return { content: "", provider: 'openai' };
        }
        return { content: "", provider };
      });

      const elapsed = (Date.now() - startTime) / 1000;
      metrics?.callCounter?.inc({ provider, status: "success" });
      metrics?.latencyHistogram?.observe({ provider }, elapsed);
      if (result.tokensUsed) {
        metrics?.tokenCounter?.inc({ provider, type: "total" }, result.tokensUsed);
      }
      return result;
    } catch (e) {
      console.warn(`[aiGateway] provider ${provider} failed: ${e instanceof Error ? e.message : String(e)}`);
      metrics?.callCounter?.inc({ provider, status: "error" });
      continue;
    }
  }
  throw new Error("No AI provider available");
}
