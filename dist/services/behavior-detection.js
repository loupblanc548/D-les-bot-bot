"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.behaviorDetectionService = void 0;
const logger_1 = __importDefault(require("../utils/logger"));
const prisma_1 = __importDefault(require("../prisma"));
class BehaviorDetectionService {
    patterns;
    alerts;
    monitoringInterval = null;
    ANOMALY_THRESHOLD = 3;
    constructor() {
        this.patterns = new Map();
        this.alerts = [];
        logger_1.default.info("[BehaviorDetection] Service initialisé");
    }
    async initializePatterns(client) {
        try {
            const guild = client.guilds.cache.first();
            if (!guild)
                return;
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
            logger_1.default.info(`[BehaviorDetection] Patterns initialisés pour ${members.size} membres`);
        }
        catch (error) {
            logger_1.default.error("[BehaviorDetection] Erreur lors de l'initialisation:", error);
        }
    }
    async analyzeMessage(message) {
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
    getTimeSlot() {
        return new Date().getHours();
    }
    async checkForAnomalies(userId, pattern) {
        const historicalPattern = await this.getHistoricalPattern(userId);
        if (!historicalPattern)
            return;
        const frequencyRatio = pattern.messageFrequency / (historicalPattern.messageFrequency || 1);
        if (frequencyRatio > 5) {
            this.createAlert(userId, "sudden_activity_spike", "high", `Spike d'activité détecté: ${frequencyRatio.toFixed(1)}x la normale`, Math.min(frequencyRatio / 10, 1));
        }
        const newChannels = pattern.activeChannels.filter(c => !historicalPattern.activeChannels.includes(c));
        if (newChannels.length > 3) {
            this.createAlert(userId, "unusual_channels", "medium", `Activité dans ${newChannels.length} nouveaux channels inhabituels`, newChannels.length / 10);
        }
        if (pattern.mentionRate > 5 && historicalPattern.mentionRate < 2) {
            this.createAlert(userId, "mention_spam", "high", `Taux de mentions anormal: ${pattern.mentionRate.toFixed(1)}/message`, pattern.mentionRate / 10);
        }
        const timeSlotChange = this.calculateTimeSlotChange(pattern, historicalPattern);
        if (timeSlotChange > 0.8) {
            this.createAlert(userId, "time_pattern_change", "medium", "Changement significatif du pattern d'activité temporelle", timeSlotChange);
        }
    }
    calculateTimeSlotChange(current, historical) {
        const currentSlots = new Set(current.activeTimeSlots);
        const historicalSlots = new Set(historical.activeTimeSlots);
        const intersection = new Set([...currentSlots].filter(x => historicalSlots.has(x)));
        const union = new Set([...currentSlots, ...historicalSlots]);
        return union.size > 0 ? 1 - (intersection.size / union.size) : 0;
    }
    async getHistoricalPattern(userId) {
        const stored = await prisma_1.default.behaviorPattern.findUnique({
            where: { userId },
        });
        if (stored) {
            return {
                userId: stored.userId,
                messageFrequency: stored.messageFrequency,
                averageMessageLength: stored.averageMessageLength,
                activeChannels: stored.activeChannels,
                activeTimeSlots: stored.activeTimeSlots,
                mentionRate: stored.mentionRate,
                lastUpdated: stored.lastUpdated,
            };
        }
        return null;
    }
    async savePattern(userId) {
        const pattern = this.patterns.get(userId);
        if (!pattern)
            return;
        await prisma_1.default.behaviorPattern.upsert({
            where: { userId },
            create: pattern,
            update: pattern,
        });
    }
    createAlert(userId, type, severity, description, confidence) {
        const alert = {
            userId, type, severity, description, confidence,
            timestamp: Date.now(),
        };
        this.alerts.push(alert);
        logger_1.default.warn(`[BehaviorDetection] Anomalie détectée pour ${userId}: ${description}`);
        this.cleanupOldAlerts();
    }
    cleanupOldAlerts() {
        const oneDayAgo = Date.now() - 24 * 60 * 60 * 1000;
        this.alerts = this.alerts.filter(alert => alert.timestamp > oneDayAgo);
    }
    getRecentAlerts(hours = 24) {
        const cutoff = Date.now() - hours * 60 * 60 * 1000;
        return this.alerts.filter(alert => alert.timestamp > cutoff);
    }
    getUserAlerts(userId) {
        return this.alerts.filter(alert => alert.userId === userId);
    }
    getUserStats(userId) {
        return this.patterns.get(userId) || null;
    }
    enableMonitoring(intervalMs = 60000) {
        if (this.monitoringInterval) {
            logger_1.default.warn("[BehaviorDetection] Surveillance déjà active");
            return;
        }
        logger_1.default.info(`[BehaviorDetection] Surveillance activée (intervalle: ${intervalMs}ms)`);
        this.monitoringInterval = setInterval(() => {
            this.periodicSave();
        }, intervalMs);
    }
    async periodicSave() {
        for (const userId of this.patterns.keys()) {
            await this.savePattern(userId);
        }
    }
    disableMonitoring() {
        if (this.monitoringInterval) {
            clearInterval(this.monitoringInterval);
            this.monitoringInterval = null;
            logger_1.default.info("[BehaviorDetection] Surveillance désactivée");
        }
    }
}
exports.behaviorDetectionService = new BehaviorDetectionService();
//# sourceMappingURL=behavior-detection.js.map