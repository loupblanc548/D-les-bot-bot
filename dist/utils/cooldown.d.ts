interface CooldownEntry {
    lastAlert: number;
    alertCount: number;
    severity: "low" | "medium" | "high" | "critical";
}
/**
 * Vérifie si une alerte peut être envoyée pour une clé donnée
 * @param key Clé unique pour l'alerte (ex: "user_123_spam", "guild_456_raid")
 * @param severity Sévérité de l'alerte
 * @returns true si l'alerte peut être envoyée, false sinon
 */
export declare function canSendAlert(key: string, severity?: "low" | "medium" | "high" | "critical"): boolean;
/**
 * Force l'envoi d'une alerte (ignore le cooldown)
 * @param key Clé unique pour l'alerte
 */
export declare function forceAlert(key: string): void;
/**
 * Réinitialise le cooldown pour une clé donnée
 * @param key Clé unique pour l'alerte
 */
export declare function resetCooldown(key: string): void;
/**
 * Réinitialise tous les cooldowns
 */
export declare function resetAllCooldowns(): void;
/**
 * Obtient les informations de cooldown pour une clé
 * @param key Clé unique pour l'alerte
 * @returns Informations de cooldown ou null si inexistant
 */
export declare function getCooldownInfo(key: string): CooldownEntry | null;
/**
 * Nettoie les entrées de cooldown expirées
 */
export declare function cleanupExpiredCooldowns(): void;
export declare function enableCooldownCleanup(intervalMs?: number): void;
/**
 * Désactive le nettoyage automatique
 */
export declare function disableCooldownCleanup(): void;
export {};
//# sourceMappingURL=cooldown.d.ts.map