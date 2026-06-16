import { Client, Message } from "discord.js";
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
declare class BehaviorDetectionService {
    private patterns;
    private alerts;
    private monitoringInterval;
    private readonly ANOMALY_THRESHOLD;
    constructor();
    initializePatterns(client: Client): Promise<void>;
    analyzeMessage(message: Message): Promise<void>;
    private getTimeSlot;
    private checkForAnomalies;
    private calculateTimeSlotChange;
    private getHistoricalPattern;
    savePattern(userId: string): Promise<void>;
    private createAlert;
    private cleanupOldAlerts;
    getRecentAlerts(hours?: number): AnomalyAlert[];
    getUserAlerts(userId: string): AnomalyAlert[];
    getUserStats(userId: string): BehaviorPattern | null;
    enableMonitoring(intervalMs?: number): void;
    private periodicSave;
    disableMonitoring(): void;
}
export declare const behaviorDetectionService: BehaviorDetectionService;
export {};
//# sourceMappingURL=behavior-detection.d.ts.map