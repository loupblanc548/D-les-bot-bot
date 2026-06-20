import { Client } from 'discord.js';
export interface LogEntry {
    type: string;
    action: string;
    userId?: string;
    targetId?: string;
    details?: string;
    moderator?: string;
}
export declare function createLog(entry: LogEntry): Promise<{
    type: string;
    createdAt: Date;
    id: string;
    guildId: string | null;
    updatedAt: Date;
    action: string;
    userId: string | null;
    targetId: string | null;
    details: string | null;
    moderator: string | null;
}>;
export declare function getLogs(limit?: number): Promise<{
    type: string;
    createdAt: Date;
    id: string;
    guildId: string | null;
    updatedAt: Date;
    action: string;
    userId: string | null;
    targetId: string | null;
    details: string | null;
    moderator: string | null;
}[]>;
export declare function getLogsByType(type: string, limit?: number): Promise<{
    type: string;
    createdAt: Date;
    id: string;
    guildId: string | null;
    updatedAt: Date;
    action: string;
    userId: string | null;
    targetId: string | null;
    details: string | null;
    moderator: string | null;
}[]>;
export declare function getLogsByUser(userId: string, limit?: number): Promise<{
    type: string;
    createdAt: Date;
    id: string;
    guildId: string | null;
    updatedAt: Date;
    action: string;
    userId: string | null;
    targetId: string | null;
    details: string | null;
    moderator: string | null;
}[]>;
export declare function sendErrorLog(contexte: string, erreur: Error, client?: Client): Promise<void>;
export declare function sendBanPurgeLog(userTag: string, userId: string, totalDeleted: number, channelsScanned: number, client: Client): Promise<void>;
export declare function deleteOldLogs(daysOld?: number): Promise<import(".prisma/client").Prisma.BatchPayload>;
/**
 * Log d'action sensible (ban, kick, mute, etc.)
 */
export declare function logSensitiveAction(action: string, executorId: string, targetId: string, details?: string): Promise<void>;
/**
 * Log de changement de configuration
 */
export declare function logConfigChange(action: string, executorId: string, guildId: string, details?: string): Promise<void>;
/**
 * Log de tentative d'accès non autorisé
 */
export declare function logUnauthorizedAccess(action: string, userId: string, details?: string): Promise<void>;
/**
 * Log d'erreur système
 */
export declare function logSystemError(action: string, error: Error, context?: string): Promise<void>;
/**
 * Récupère les logs d'audit avec filtres avancés
 */
export declare function getAuditLogs(filters: {
    type?: string;
    userId?: string;
    targetId?: string;
    moderator?: string;
    limit?: number;
    offset?: number;
}): Promise<any[]>;
//# sourceMappingURL=logs.d.ts.map