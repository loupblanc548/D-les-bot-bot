import logger from "../utils/logger.js";
import prisma from "../prisma.js";

export interface AnomalyAlert {
  type: "message_spike" | "error_spike" | "moderation_spike" | "new_user_flood" | "command_anomaly";
  severity: "low" | "medium" | "high" | "critical";
  guildId: string; metric: string; currentValue: number; expectedValue: number;
  deviationPercent: number; description: string; timestamp: string;
}

export interface AnomalyReport {
  guildId: string; alerts: AnomalyAlert[]; overallRisk: "normal" | "elevated" | "high" | "critical";
  checkedAt: string;
}

export async function detectAnomalies(guildId: string): Promise<AnomalyReport> {
  const alerts: AnomalyAlert[] = [];
  const now = new Date();
  const oneHourAgo = new Date(now.getTime() - 60 * 60 * 1000);
  const twoHoursAgo = new Date(now.getTime() - 2 * 60 * 60 * 1000);
  const oneDayAgo = new Date(now.getTime() - 24 * 60 * 60 * 1000);

  const [recentMessages, previousMessages, recentErrors, previousErrors, recentMod, previousMod, recentJoins] = await Promise.all([
    prisma.chatHistory.count({ where: { guildId, createdAt: { gte: oneHourAgo } } }).catch(() => 0),
    prisma.chatHistory.count({ where: { guildId, createdAt: { gte: twoHoursAgo, lt: oneHourAgo } } }).catch(() => 0),
    prisma.errorMessage.count({ where: { createdAt: { gte: oneHourAgo } } }).catch(() => 0),
    prisma.errorMessage.count({ where: { createdAt: { gte: twoHoursAgo, lt: oneHourAgo } } }).catch(() => 0),
    prisma.modAction.count({ where: { guildId, createdAt: { gte: oneHourAgo } } }).catch(() => 0),
    prisma.modAction.count({ where: { guildId, createdAt: { gte: twoHoursAgo, lt: oneHourAgo } } }).catch(() => 0),
    prisma.user.count({ where: { guildId, joinedAt: { gte: oneDayAgo } } }).catch(() => 0),
  ]);

  if (previousMessages > 0) {
    const dev = Math.round(((recentMessages - previousMessages) / previousMessages) * 100);
    if (dev > 200) alerts.push({ type: "message_spike", severity: dev > 500 ? "critical" : "high", guildId, metric: "messages_per_hour", currentValue: recentMessages, expectedValue: previousMessages, deviationPercent: dev, description: `Pic d'activité: ${recentMessages} messages/h vs ${previousMessages} précédent (+${dev}%)`, timestamp: now.toISOString() });
    else if (dev > 100) alerts.push({ type: "message_spike", severity: "medium", guildId, metric: "messages_per_hour", currentValue: recentMessages, expectedValue: previousMessages, deviationPercent: dev, description: `Activité élevée: +${dev}% vs heure précédente`, timestamp: now.toISOString() });
  }

  if (previousErrors > 0) {
    const dev = Math.round(((recentErrors - previousErrors) / previousErrors) * 100);
    if (dev > 100) alerts.push({ type: "error_spike", severity: dev > 300 ? "critical" : "high", guildId, metric: "errors_per_hour", currentValue: recentErrors, expectedValue: previousErrors, deviationPercent: dev, description: `Pic d'erreurs: ${recentErrors} erreurs/h vs ${previousErrors} (+${dev}%)`, timestamp: now.toISOString() });
  } else if (recentErrors > 5) {
    alerts.push({ type: "error_spike", severity: "medium", guildId, metric: "errors_per_hour", currentValue: recentErrors, expectedValue: 0, deviationPercent: 100, description: `${recentErrors} erreurs dans la dernière heure`, timestamp: now.toISOString() });
  }

  if (previousMod > 0) {
    const dev = Math.round(((recentMod - previousMod) / previousMod) * 100);
    if (dev > 200) alerts.push({ type: "moderation_spike", severity: "high", guildId, metric: "mod_actions_per_hour", currentValue: recentMod, expectedValue: previousMod, deviationPercent: dev, description: `Pic de modération: ${recentMod} actions/h (+${dev}%)`, timestamp: now.toISOString() });
  } else if (recentMod > 10) {
    alerts.push({ type: "moderation_spike", severity: "medium", guildId, metric: "mod_actions_per_hour", currentValue: recentMod, expectedValue: 0, deviationPercent: 100, description: `${recentMod} actions de modération dans la dernière heure`, timestamp: now.toISOString() });
  }

  if (recentJoins > 20) {
    alerts.push({ type: "new_user_flood", severity: recentJoins > 50 ? "critical" : "high", guildId, metric: "new_users_24h", currentValue: recentJoins, expectedValue: 5, deviationPercent: Math.round((recentJoins / 5) * 100), description: `${recentJoins} nouveaux membres en 24h — possible raid`, timestamp: now.toISOString() });
  }

  const criticalCount = alerts.filter(a => a.severity === "critical").length;
  const highCount = alerts.filter(a => a.severity === "high").length;
  const mediumCount = alerts.filter(a => a.severity === "medium").length;
  const overallRisk: AnomalyReport["overallRisk"] = criticalCount > 0 ? "critical" : highCount > 1 ? "high" : mediumCount > 0 || highCount > 0 ? "elevated" : "normal";

  logger.info(`[Anomaly] Guild ${guildId}: ${alerts.length} alerts, risk=${overallRisk}`);
  return { guildId, alerts, overallRisk, checkedAt: now.toISOString() };
}

export function simpleMovingAverage(values: number[], window: number): number[] {
  if (values.length < window) return values;
  const result: number[] = [];
  for (let i = window - 1; i < values.length; i++) {
    const slice = values.slice(i - window + 1, i + 1);
    result.push(slice.reduce((a, b) => a + b, 0) / window);
  }
  return result;
}

export function detectSpike(values: number[], threshold = 2.5): { index: number; value: number; expected: number; zScore: number }[] {
  if (values.length < 5) return [];
  const mean = values.reduce((a, b) => a + b, 0) / values.length;
  const variance = values.reduce((a, b) => a + (b - mean) ** 2, 0) / values.length;
  const stdDev = Math.sqrt(variance);
  if (stdDev === 0) return [];
  const spikes: { index: number; value: number; expected: number; zScore: number }[] = [];
  for (let i = 0; i < values.length; i++) {
    const z = (values[i] - mean) / stdDev;
    if (z > threshold) spikes.push({ index: i, value: values[i], expected: Math.round(mean), zScore: Math.round(z * 100) / 100 });
  }
  return spikes;
}
