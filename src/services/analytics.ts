import logger from "../utils/logger.js";
import prisma from "../prisma.js";

export interface AnalyticsEvent {
  event: string;
  userId?: string;
  guildId?: string;
  properties?: Record<string, unknown>;
}

const eventBuffer: AnalyticsEvent[] = [];
const FLUSH_INTERVAL = 60_000;
let flushTimer: NodeJS.Timeout | null = null;

export function trackEvent(event: AnalyticsEvent): void {
  eventBuffer.push(event);
  if (eventBuffer.length >= 50) flushEvents().catch(() => {});
  if (!flushTimer) {
    flushTimer = setInterval(() => {
      flushEvents().catch(() => {});
    }, FLUSH_INTERVAL);
    flushTimer.unref();
  }
}

export async function flushEvents(): Promise<void> {
  if (eventBuffer.length === 0) return;
  const batch = eventBuffer.splice(0, eventBuffer.length);
  try {
    await prisma.userActivityLog.createMany({
      data: batch.map((e) => ({
        userId: e.userId || "system",
        guildId: e.guildId || "unknown",
        activity: e.event.slice(0, 100),
        details: e.properties ? JSON.stringify(e.properties) : null,
      })),
    });
  } catch (err) {
    logger.error(`[Analytics] flush: ${err instanceof Error ? err.message : String(err)}`);
  }
}

export interface GuildAnalytics {
  totalMembers: number;
  activeMembers: number;
  messagesLast7d: number;
  commandsUsed: number;
  moderationActions: number;
  eventBreakdown: { event: string; count: number }[];
}

export async function getGuildAnalytics(guildId: string): Promise<GuildAnalytics> {
  const sevenDaysAgo = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000);
  const [commands, modActions, activities, chatHistory] = await Promise.all([
    prisma.commandLog
      .count({ where: { guildId, timestamp: { gte: sevenDaysAgo } } })
      .catch(() => 0),
    prisma.modAction.count({ where: { guildId, createdAt: { gte: sevenDaysAgo } } }).catch(() => 0),
    prisma.userActivityLog
      .findMany({
        where: { guildId, createdAt: { gte: sevenDaysAgo } },
        distinct: ["userId"],
        select: { userId: true },
      })
      .catch(() => []),
    prisma.chatHistory
      .count({ where: { guildId, createdAt: { gte: sevenDaysAgo } } })
      .catch(() => 0),
  ]);
  const eventBreakdown = await prisma.userActivityLog
    .groupBy({
      by: ["activity"],
      where: { guildId, createdAt: { gte: sevenDaysAgo } },
      _count: true,
      orderBy: { _count: { activity: "desc" } },
      take: 10,
    })
    .catch(() => []);
  return {
    totalMembers: 0,
    activeMembers: activities.length,
    messagesLast7d: chatHistory,
    commandsUsed: commands,
    moderationActions: modActions,
    eventBreakdown: eventBreakdown.map((e: Record<string, unknown>) => ({
      event: String(e.activity || ""),
      count: Number(e._count || 0),
    })),
  };
}

export interface BotHealthMetrics {
  uptime: number;
  memoryUsage: { rss: number; heapUsed: number; heapTotal: number };
  activeGuilds: number;
  totalUsers: number;
  commandsToday: number;
  errorsLast24h: number;
  avgResponseTime: number;
}

export async function getBotHealthMetrics(): Promise<BotHealthMetrics> {
  const mem = process.memoryUsage();
  const oneDayAgo = new Date(Date.now() - 24 * 60 * 60 * 1000);
  const [guilds, users, commands, errors] = await Promise.all([
    prisma.guildConfig.count().catch(() => 0),
    prisma.user.count().catch(() => 0),
    prisma.commandLog.count({ where: { timestamp: { gte: oneDayAgo } } }).catch(() => 0),
    prisma.errorMessage.count({ where: { createdAt: { gte: oneDayAgo } } }).catch(() => 0),
  ]);
  return {
    uptime: process.uptime(),
    memoryUsage: { rss: mem.rss, heapUsed: mem.heapUsed, heapTotal: mem.heapTotal },
    activeGuilds: guilds,
    totalUsers: users,
    commandsToday: commands,
    errorsLast24h: errors,
    avgResponseTime: 0,
  };
}

export interface TrendAnalysis {
  period: string;
  trend: "up" | "down" | "stable";
  changePercent: number;
  current: number;
  previous: number;
  insight: string;
}

export async function getMessageTrend(guildId: string, days = 7): Promise<TrendAnalysis> {
  const now = new Date();
  const midPoint = new Date(now.getTime() - (days / 2) * 24 * 60 * 60 * 1000);
  const startPrev = new Date(now.getTime() - days * 24 * 60 * 60 * 1000);
  const [recent, previous] = await Promise.all([
    prisma.chatHistory.count({ where: { guildId, createdAt: { gte: midPoint } } }).catch(() => 0),
    prisma.chatHistory
      .count({ where: { guildId, createdAt: { gte: startPrev, lt: midPoint } } })
      .catch(() => 0),
  ]);
  const changePercent = previous > 0 ? Math.round(((recent - previous) / previous) * 100) : 0;
  const trend: TrendAnalysis["trend"] =
    changePercent > 5 ? "up" : changePercent < -5 ? "down" : "stable";
  return {
    period: `${days}d`,
    trend,
    changePercent,
    current: recent,
    previous,
    insight:
      trend === "up"
        ? `Activité en hausse de ${changePercent}%`
        : trend === "down"
          ? `Activité en baisse de ${Math.abs(changePercent)}%`
          : "Activité stable",
  };
}

export async function getTopCommands(
  guildId: string,
  days = 7,
): Promise<{ command: string; count: number }[]> {
  const sevenDaysAgo = new Date(Date.now() - days * 24 * 60 * 60 * 1000);
  const result = await prisma.commandLog
    .groupBy({
      by: ["command"],
      where: { guildId, timestamp: { gte: sevenDaysAgo } },
      _count: true,
      orderBy: { _count: { command: "desc" } },
      take: 10,
    })
    .catch(() => []);
  return result.map((r: Record<string, unknown>) => ({
    command: String(r.command || ""),
    count: Number(r._count || 0),
  }));
}

export async function getModerationStats(
  guildId: string,
  days = 30,
): Promise<{ action: string; count: number }[]> {
  const daysAgo = new Date(Date.now() - days * 24 * 60 * 60 * 1000);
  const result = await prisma.modAction
    .groupBy({
      by: ["action"],
      where: { guildId, createdAt: { gte: daysAgo } },
      _count: true,
      orderBy: { _count: { action: "desc" } },
      take: 10,
    })
    .catch(() => []);
  return result.map((r: Record<string, unknown>) => ({
    action: String(r.action || ""),
    count: Number(r._count || 0),
  }));
}
