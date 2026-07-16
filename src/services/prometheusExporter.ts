import { Registry, Counter, Gauge, Histogram, collectDefaultMetrics } from "prom-client";
import logger from "../utils/logger.js";

const registry = new Registry();
collectDefaultMetrics({ register: registry });

export const discordMessagesReceived = new Counter({
  name: "discord_messages_received_total",
  help: "Total messages received",
  registers: [registry],
});
export const discordMessagesSent = new Counter({
  name: "discord_messages_sent_total",
  help: "Total messages sent",
  registers: [registry],
});
export const discordCommandsExecuted = new Counter({
  name: "discord_commands_executed_total",
  help: "Total commands executed",
  labelNames: ["command", "status"],
  registers: [registry],
});
export const discordGuilds = new Gauge({
  name: "discord_guilds_count",
  help: "Number of guilds",
  registers: [registry],
});
export const discordUsers = new Gauge({
  name: "discord_users_count",
  help: "Total users",
  registers: [registry],
});
export const discordLatency = new Gauge({
  name: "discord_gateway_latency_ms",
  help: "Gateway latency ms",
  registers: [registry],
});
export const moderationActions = new Counter({
  name: "moderation_actions_total",
  help: "Moderation actions",
  labelNames: ["action"],
  registers: [registry],
});
export const spamDetected = new Counter({
  name: "spam_detected_total",
  help: "Spam detected",
  registers: [registry],
});
export const aiRequests = new Counter({
  name: "ai_requests_total",
  help: "AI requests",
  labelNames: ["provider"],
  registers: [registry],
});
export const cronExecutions = new Counter({
  name: "cron_executions_total",
  help: "Cron executions",
  labelNames: ["job", "status"],
  registers: [registry],
});
export const dealsNotified = new Counter({
  name: "deals_notified_total",
  help: "Deals notified",
  labelNames: ["platform"],
  registers: [registry],
});
export const dbQueryDuration = new Histogram({
  name: "db_query_duration_seconds",
  help: "DB query duration",
  buckets: [0.01, 0.05, 0.1, 0.5, 1, 5],
  registers: [registry],
});

// ─── Agent loop metrics ───
export const agentLoopIterations = new Histogram({
  name: "agent_loop_iterations",
  help: "Number of iterations per agent loop",
  buckets: [1, 2, 3, 4, 5, 6, 7, 8],
  registers: [registry],
});
export const agentLoopDuration = new Histogram({
  name: "agent_loop_duration_seconds",
  help: "Total agent loop duration in seconds",
  buckets: [1, 5, 10, 15, 20, 30, 45],
  registers: [registry],
});
export const agentModelUsed = new Counter({
  name: "agent_model_used_total",
  help: "Model used by the agent",
  labelNames: ["model", "status"],
  registers: [registry],
});
export const agentToolCalls = new Counter({
  name: "agent_tool_calls_total",
  help: "Tool calls by the agent",
  labelNames: ["tool", "status"],
  registers: [registry],
});
export const agentCacheHits = new Counter({
  name: "agent_cache_hits_total",
  help: "Semantic cache hits",
  registers: [registry],
});
export const agentCacheMisses = new Counter({
  name: "agent_cache_misses_total",
  help: "Semantic cache misses",
  registers: [registry],
});
export const toolRateLimited = new Counter({
  name: "tool_rate_limited_total",
  help: "Tools rate limited globally",
  labelNames: ["tool"],
  registers: [registry],
});
export const toolAutoDisabled = new Gauge({
  name: "tool_auto_disabled",
  help: "Currently auto-disabled tools",
  registers: [registry],
});
export const modelsAvailable = new Gauge({
  name: "models_available_count",
  help: "Number of available OpenRouter models",
  registers: [registry],
});

export async function getMetrics(): Promise<string> {
  return registry.metrics();
}
export function getRegistry(): Registry {
  return registry;
}

export function updateDiscordMetrics(client: {
  guilds: {
    cache: {
      size: number;
      reduce: (fn: (sum: number, g: { memberCount: number }) => number, init: number) => number;
    };
  };
  ws: { ping: number };
}): void {
  discordGuilds.set(client.guilds.cache.size);
  discordUsers.set(
    client.guilds.cache.reduce(
      (sum: number, g: { memberCount: number }) => sum + (g.memberCount || 0),
      0,
    ),
  );
  discordLatency.set(client.ws.ping);
}

logger.info("[PrometheusExporter] Initialized with agent metrics");
