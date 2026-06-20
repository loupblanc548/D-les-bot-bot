import { EmbedBuilder, Client } from "discord.js";
import type { RiskProfile, RiskLevel } from "./risk-engine.js";
export type AlertStatus = "PENDING" | "RESOLVED" | "DISMISSED";
export type AlertAction = "IGNORE" | "WATCH" | "WARN" | "TIMEOUT" | "KICK" | "BAN";
export interface AlertData {
    id: string;
    guildId: string;
    userId: string;
    type: string;
    riskScore: number;
    riskLevel: RiskLevel;
    status: AlertStatus;
    details: string | null;
    resolvedBy: string | null;
    resolvedAt: Date | null;
    action: AlertAction | null;
    createdAt: Date;
}
export declare function generateAlert(profile: RiskProfile, reason: string, type?: string): Promise<AlertData>;
export declare function buildAlertEmbed(alert: AlertData, client: Client): Promise<EmbedBuilder>;
export declare function sendAlertToChannel(alert: AlertData, client: Client): Promise<void>;
export declare function notifyOwners(alert: AlertData, message: string, client: Client): Promise<void>;
export declare function resolveAlert(alertId: string, action: AlertAction, moderatorId: string): Promise<AlertData | null>;
export declare function getPendingAlerts(guildId: string): Promise<{
    type: string;
    createdAt: Date;
    id: string;
    status: import(".prisma/client").$Enums.AlertStatus;
    guildId: string;
    action: string | null;
    userId: string;
    details: string | null;
    riskScore: number;
    riskLevel: string;
    resolvedBy: string | null;
    resolvedAt: Date | null;
}[]>;
export declare function getAlertHistory(guildId: string, limit?: number): Promise<{
    type: string;
    createdAt: Date;
    id: string;
    status: import(".prisma/client").$Enums.AlertStatus;
    guildId: string;
    action: string | null;
    userId: string;
    details: string | null;
    riskScore: number;
    riskLevel: string;
    resolvedBy: string | null;
    resolvedAt: Date | null;
}[]>;
export declare function getAlertsByUser(userId: string, guildId: string): Promise<{
    type: string;
    createdAt: Date;
    id: string;
    status: import(".prisma/client").$Enums.AlertStatus;
    guildId: string;
    action: string | null;
    userId: string;
    details: string | null;
    riskScore: number;
    riskLevel: string;
    resolvedBy: string | null;
    resolvedAt: Date | null;
}[]>;
//# sourceMappingURL=alert-service.d.ts.map