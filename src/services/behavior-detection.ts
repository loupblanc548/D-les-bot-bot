import logger from "../utils/logger";
import { Client, GuildMember, Message } from "discord.js";
import prisma from "../prisma";


// Safe JSON.parse: returns fallback on null/undefined/parse error instead of throwing
function safeJsonParse<T>(value: string | null | undefined, fallback: T): T {
  if (value == null) return fallback;
  try {
    return JSON.parse(value) as T;
  } catch {
    return fallback;
  }
}


interface BehaviorPattern {
  userId: string;
  messageFrequency: number;
  averageMessageLength: number;
  activeChannels: string[];
  activeTimeSlots: number[];
  mentionRate: number;
  lastUpdated: number;
}

interface AnomalyAlert {
  userId: string;
  type: "sudden_activity_spike" | "unusual_channels" | "mention_spam" | "time_pattern_change" | "content_change";
  severity: "low" | "medium" | "high" | "critical";
  description: string;
  confidence: number;
  timestamp: number;
}

class BehaviorDetectionService {
  private patterns: Map<string, BehaviorPattern>;
  private alerts: AnomalyAlert[];
  private monitoringInterval: NodeJS.Timeout | null = null;
  private readonly ANOMALY_THRESHOLD = 3;

  constructor() {
    this.patterns = new Map();
    this.alerts = [];
    logger.info("[BehaviorDetection] Service initialisé");
  }

  async initializePatterns(client: Client): Promise<void> {
    try {
      const guild = client.guilds.cache.first();
      if (!guild) return;

      const members = await guild.members.fetch();
      
      for (const [id, member] of members) {
        this.patterns.set(id, {
          userId: id,
          messageFrequency: 0,
          averageMessageLength: 0,
          activeChannels: [],
          activeTimeSlots: [],
          mentionRate: 0,
          lastUpdated: Date.now(),
        });
      }

      logger.info(`[BehaviorDetection] Patterns initialisés pour ${members.size} membres`);
    } catch (error) {
      logger.error("[BehaviorDetection] Erreur lors de l'initialisation:", error);
    }
  }

  async analyzeMessage(message: Message): Promise<void> {
    const userId = message.author.id;
    const pattern = this.patterns.get(userId);

    if (!pattern) {
      this.patterns.set(userId, {
        userId,
        messageFrequency: 1,
        averageMessageLength: message.content.length,
        activeChannels: [message.channelId],
        activeTimeSlots: [this.getTimeSlot()],
        mentionRate: message.mentions.users.size,
        lastUpdated: Date.now(),
      });
      return;
    }

    const alpha = 0.1;
    pattern.messageFrequency = pattern.messageFrequency * (1 - alpha) + 1 * alpha;
    pattern.averageMessageLength = pattern.averageMessageLength * (1 - alpha) + message.content.length * alpha;
    pattern.mentionRate = pattern.mentionRate * (1 - alpha) + message.mentions.users.size * alpha;

    if (!pattern.activeChannels.includes(message.channelId)) {
      pattern.activeChannels.push(message.channelId);
    }

    const timeSlot = this.getTimeSlot();
    if (!pattern.activeTimeSlots.includes(timeSlot)) {
      pattern.activeTimeSlots.push(timeSlot);
    }

    pattern.lastUpdated = Date.now();
    this.patterns.set(userId, pattern);

    await this.checkForAnomalies(userId, pattern);
  }

  private getTimeSlot(): number {
    return new Date().getHours();
  }

  private async checkForAnomalies(userId: string, pattern: BehaviorPattern): Promise<void> {
    const historicalPattern = await this.getHistoricalPattern(userId);
    if (!historicalPattern) return;

    const frequencyRatio = pattern.messageFrequency / (historicalPattern.messageFrequency || 1);
    if (frequencyRatio > 5) {
      this.createAlert(userId, "sudden_activity_spike", "high", 
        `Spike d'activité détecté: ${frequencyRatio.toFixed(1)}x la normale`, 
        Math.min(frequencyRatio / 10, 1));
    }

    const newChannels = pattern.activeChannels.filter(
      c => !historicalPattern.activeChannels.includes(c)
    );
    if (newChannels.length > 3) {
      this.createAlert(userId, "unusual_channels", "medium",
        `Activité dans ${newChannels.length} nouveaux channels inhabituels`,
        newChannels.length / 10);
    }

    if (pattern.mentionRate > 5 && historicalPattern.mentionRate < 2) {
      this.createAlert(userId, "mention_spam", "high",
        `Taux de mentions anormal: ${pattern.mentionRate.toFixed(1)}/message`,
        pattern.mentionRate / 10);
    }

    const timeSlotChange = this.calculateTimeSlotChange(pattern, historicalPattern);
    if (timeSlotChange > 0.8) {
      this.createAlert(userId, "time_pattern_change", "medium",
        "Changement significatif du pattern d'activité temporelle",
        timeSlotChange);
    }
  }

  private calculateTimeSlotChange(current: BehaviorPattern, historical: BehaviorPattern): number {
    const currentSlots = new Set(current.activeTimeSlots);
    const historicalSlots = new Set(historical.activeTimeSlots);

    const intersection = new Set([...currentSlots].filter(x => historicalSlots.has(x)));
    const union = new Set([...currentSlots, ...historicalSlots]);

    return union.size > 0 ? 1 - (intersection.size / union.size) : 0;
  }

  private async getHistoricalPattern(userId: string): Promise<BehaviorPattern | null> {
    const stored = await prisma.behaviorPattern.findUnique({
      where: { userId },
    });

    if (stored) {
      return {
        userId: stored.userId,
        messageFrequency: stored.messageFrequency,
        averageMessageLength: stored.averageMessageLength,
        activeChannels: safeJsonParse<string[]>(stored.activeChannels, []),
        activeTimeSlots: safeJsonParse<number[]>(stored.activeTimeSlots, []),
        mentionRate: stored.mentionRate,
        lastUpdated: stored.lastUpdated.getTime(),
      };
    }

    return null;
  }

  async savePattern(userId: string): Promise<void> {
    const pattern = this.patterns.get(userId);
    if (!pattern) return;

    await prisma.behaviorPattern.upsert({
      where: { userId },
      create: pattern as any,
      update: pattern as any,
    });
  }

  private createAlert(
    userId: string,
    type: AnomalyAlert["type"],
    severity: AnomalyAlert["severity"],
    description: string,
    confidence: number
  ): void {
    const alert: AnomalyAlert = {
      userId, type, severity, description, confidence,
      timestamp: Date.now(),
    };

    this.alerts.push(alert);
    logger.warn(`[BehaviorDetection] Anomalie détectée pour ${userId}: ${description}`);
    this.cleanupOldAlerts();
  }

  private cleanupOldAlerts(): void {
    const oneDayAgo = Date.now() - 24 * 60 * 60 * 1000;
    this.alerts = this.alerts.filter(alert => alert.timestamp > oneDayAgo);
  }

  getRecentAlerts(hours: number = 24): AnomalyAlert[] {
    const cutoff = Date.now() - hours * 60 * 60 * 1000;
    return this.alerts.filter(alert => alert.timestamp > cutoff);
  }

  getUserAlerts(userId: string): AnomalyAlert[] {
    return this.alerts.filter(alert => alert.userId === userId);
  }

  getUserStats(userId: string): BehaviorPattern | null {
    return this.patterns.get(userId) || null;
  }

  enableMonitoring(intervalMs: number = 60000): void {
    if (this.monitoringInterval) {
      logger.warn("[BehaviorDetection] Surveillance déjà active");
      return;
    }

    logger.info(`[BehaviorDetection] Surveillance activée (intervalle: ${intervalMs}ms)`);
    this.monitoringInterval = setInterval(() => {
      this.periodicSave();
    }, intervalMs);
  }

  private async periodicSave(): Promise<void> {
    for (const userId of this.patterns.keys()) {
      await this.savePattern(userId);
    }
  }

  disableMonitoring(): void {
    if (this.monitoringInterval) {
      clearInterval(this.monitoringInterval);
      this.monitoringInterval = null;
      logger.info("[BehaviorDetection] Surveillance désactivée");
    }
  }
}

export const behaviorDetectionService = new BehaviorDetectionService();
