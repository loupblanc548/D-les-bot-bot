export type RiskLevel = "FAIBLE" | "MOYEN" | "ÉLEVÉ" | "CRITIQUE";
export type SanctionType = "WARN" | "TIMEOUT" | "KICK" | "TEMPBAN" | "BAN" | "SOFTBAN";
export type EventType = "ANTI_RAID" | "ANTI_SPAM" | "ANTI_PHISHING" | "SUSPICIOUS_ACCOUNT" | "AI_MODERATION";
export interface RiskProfile {
    userId: string;
    guildId: string;
    riskScore: number;
    riskLevel: RiskLevel;
    warnCount: number;
    timeoutCount: number;
    kickCount: number;
    tempbanCount: number;
    banCount: number;
    totalSanctions: number;
    underWatch: boolean;
    lastSanctionAt: Date | null;
    lastAlertAt: Date | null;
}
export declare function calculateRiskScore(counts: {
    warn: number;
    timeout: number;
    kick: number;
    tempban: number;
    ban: number;
    softban: number;
}, events: {
    antiRaid: number;
    antiSpam: number;
    antiPhishing: number;
    suspicious: number;
}, lastSanctionAt: Date | null): number;
export declare function getOrCreateRiskProfile(userId: string, guildId: string): Promise<RiskProfile>;
export declare function recordSanction(userId: string, guildId: string, type: SanctionType): Promise<RiskProfile>;
export declare function recordSecurityEvent(userId: string, guildId: string, eventType: EventType): Promise<RiskProfile>;
export interface ThresholdCheck {
    shouldAlert: boolean;
    profile: RiskProfile;
    reason: string;
}
export declare function checkAlertThreshold(profile: RiskProfile, guildId: string): Promise<ThresholdCheck>;
export declare function getRiskReport(userId: string, guildId: string): Promise<{
    profile: RiskProfile;
    recentSanctions: {
        type: string;
        createdAt: Date;
        id: number;
        guildId: string;
        updatedAt: Date;
        userId: string;
        duration: number | null;
        reason: string;
        moderatorId: string;
        active: boolean;
    }[];
}>;
export declare function resetRiskProfile(userId: string, guildId: string): Promise<void>;
export declare function getAllRiskyUsers(guildId: string, minLevel?: RiskLevel): Promise<{
    createdAt: Date;
    id: number;
    guildId: string;
    updatedAt: Date;
    userId: string;
    riskScore: number;
    riskLevel: string;
    warnCount: number;
    timeoutCount: number;
    kickCount: number;
    tempbanCount: number;
    banCount: number;
    lastSanctionAt: Date | null;
    lastAlertAt: Date | null;
    totalSanctions: number;
    underWatch: boolean;
}[]>;
//# sourceMappingURL=risk-engine.d.ts.map