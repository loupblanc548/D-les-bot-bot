import { Client, EmbedBuilder, TextChannel } from "discord.js";
import logger from "../utils/logger.js";
import { safeInterval } from "../utils/safe-interval.js";

const DASHBOARD_CHANNEL = process.env.RATELIMIT_DASHBOARD_CHANNEL || "";
const CHECK_INTERVAL_MS = 5 * 60 * 1000;
let dashboardInterval: NodeJS.Timeout | null = null;

interface RateLimitInfo {
  global: boolean;
  resetAfter: number;
  remaining: number;
  limit: number;
  method: string;
  bucket: string;
}

const rateLimitEvents: RateLimitInfo[] = [];
const MAX_EVENTS = 100;

export function startRateLimitDashboard(client: Client): void {
  if (dashboardInterval) return;

  client.on("rateLimit", (info) => {
    rateLimitEvents.push({
      global: info.global,
      resetAfter: info.timeToReset ?? 0,
      remaining: info.remaining ?? 0,
      limit: info.limit ?? 0,
      method: info.method ?? "UNKNOWN",
      bucket: info.bucket ?? "unknown",
    });
    if (rateLimitEvents.length > MAX_EVENTS) rateLimitEvents.shift();
    logger.warn(`[RateLimit] ${info.method} ${info.url} — ${info.remaining}/${info.limit} remaining, reset in ${info.timeToReset}ms`);
  });

  if (!DASHBOARD_CHANNEL) {
    logger.info("[RateLimitDashboard] Dashboard désactivé (RATELIMIT_DASHBOARD_CHANNEL vide)");
    return;
  }

  logger.info("[RateLimitDashboard] Dashboard activé (intervalle: 5min)");
  dashboardInterval = safeInterval("RateLimitDashboard", () => sendDashboard(client), CHECK_INTERVAL_MS);
}

async function sendDashboard(client: Client): Promise<void> {
  if (rateLimitEvents.length === 0) return;

  const channel = client.channels.cache.get(DASHBOARD_CHANNEL) as TextChannel;
  if (!channel?.isTextBased()) return;

  const recentEvents = rateLimitEvents.slice(-20);
  const globalHits = recentEvents.filter((e) => e.global).length;
  const avgReset = recentEvents.reduce((sum, e) => sum + e.resetAfter, 0) / recentEvents.length;

  const embed = new EmbedBuilder()
    .setTitle("📊 Rate Limit Dashboard")
    .setColor(globalHits > 0 ? 0xff3344 : 0xffaa00)
    .addFields(
      { name: "Événements récents", value: `${rateLimitEvents.length}/${MAX_EVENTS}`, inline: true },
      { name: "Global rate limits", value: `${globalHits}`, inline: true },
      { name: "Reset moyen", value: `${Math.round(avgReset)}ms`, inline: true },
    )
    .setFooter({ text: "Surveillance System • Rate Limit Dashboard" })
    .setTimestamp();

  const buckets = new Map<string, number>();
  for (const e of recentEvents) {
    buckets.set(e.bucket, (buckets.get(e.bucket) ?? 0) + 1);
  }
  const topBuckets = [...buckets.entries()].sort((a, b) => b[1] - a[1]).slice(0, 5);
  if (topBuckets.length > 0) {
    embed.addFields({
      name: "Top buckets touchés",
      value: topBuckets.map(([bucket, count]) => `\`${bucket}\`: ${count}x`).join("\n"),
      inline: false,
    });
  }

  try {
    await channel.send({ embeds: [embed] });
  } catch (err) {
    logger.error(`[RateLimitDashboard] Erreur envoi: ${err instanceof Error ? err.message : String(err)}`);
  }
}

export function stopRateLimitDashboard(): void {
  if (dashboardInterval) {
    clearInterval(dashboardInterval);
    dashboardInterval = null;
  }
}
