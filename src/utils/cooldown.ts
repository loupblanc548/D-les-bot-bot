import logger from "./logger";

interface CooldownEntry {
  lastAlert: number;
  alertCount: number;
  severity: "low" | "medium" | "high" | "critical";
}

const cooldownMap = new Map<string, CooldownEntry>();

const COOLDOWN_CONFIG = {
  low: { duration: 60000, maxAlerts: 5 },      // 1 minute, 5 alertes
  medium: { duration: 300000, maxAlerts: 3 },   // 5 minutes, 3 alertes
  high: { duration: 900000, maxAlerts: 2 },     // 15 minutes, 2 alertes
  critical: { duration: 1800000, maxAlerts: 1 }, // 30 minutes, 1 alerte
};

/**
 * Vérifie si une alerte peut être envoyée pour une clé donnée
 * @param key Clé unique pour l'alerte (ex: "user_123_spam", "guild_456_raid")
 * @param severity Sévérité de l'alerte
 * @returns true si l'alerte peut être envoyée, false sinon
 */
export function canSendAlert(key: string, severity: "low" | "medium" | "high" | "critical" = "medium"): boolean {
  const now = Date.now();
  const entry = cooldownMap.get(key);
  const config = COOLDOWN_CONFIG[severity];

  if (!entry) {
    // Première alerte
    cooldownMap.set(key, {
      lastAlert: now,
      alertCount: 1,
      severity,
    });
    logger.debug(`[Cooldown] Première alerte pour ${key} (${severity})`);
    return true;
  }

  const timeSinceLastAlert = now - entry.lastAlert;

  // Si le temps de cooldown est écoulé, réinitialiser
  if (timeSinceLastAlert > config.duration) {
    cooldownMap.set(key, {
      lastAlert: now,
      alertCount: 1,
      severity,
    });
    logger.debug(`[Cooldown] Cooldown écoulé pour ${key}, réinitialisation`);
    return true;
  }

  // Vérifier si le nombre maximum d'alertes est atteint
  if (entry.alertCount >= config.maxAlerts) {
    logger.debug(`[Cooldown] Maximum d'alertes atteint pour ${key} (${entry.alertCount}/${config.maxAlerts})`);
    return false;
  }

  // Incrémenter le compteur et autoriser l'alerte
  entry.alertCount++;
  entry.lastAlert = now;
  cooldownMap.set(key, entry);
  logger.debug(`[Cooldown] Alertes pour ${key}: ${entry.alertCount}/${config.maxAlerts}`);
  return true;
}

/**
 * Force l'envoi d'une alerte (ignore le cooldown)
 * @param key Clé unique pour l'alerte
 */
export function forceAlert(key: string): void {
  const entry = cooldownMap.get(key);
  if (entry) {
    entry.lastAlert = Date.now();
    entry.alertCount = 0; // Réinitialiser le compteur
    cooldownMap.set(key, entry);
    logger.debug(`[Cooldown] Alertes forcées pour ${key}`);
  }
}

/**
 * Réinitialise le cooldown pour une clé donnée
 * @param key Clé unique pour l'alerte
 */
export function resetCooldown(key: string): void {
  cooldownMap.delete(key);
  logger.debug(`[Cooldown] Cooldown réinitialisé pour ${key}`);
}

/**
 * Réinitialise tous les cooldowns
 */
export function resetAllCooldowns(): void {
  const count = cooldownMap.size;
  cooldownMap.clear();
  logger.info(`[Cooldown] ${count} cooldown(s) réinitialisé(s)`);
}

/**
 * Obtient les informations de cooldown pour une clé
 * @param key Clé unique pour l'alerte
 * @returns Informations de cooldown ou null si inexistant
 */
export function getCooldownInfo(key: string): CooldownEntry | null {
  return cooldownMap.get(key) || null;
}

/**
 * Nettoie les entrées de cooldown expirées
 */
export function cleanupExpiredCooldowns(): void {
  const now = Date.now();
  let cleaned = 0;

  for (const [key, entry] of cooldownMap.entries()) {
    const config = COOLDOWN_CONFIG[entry.severity];
    if (now - entry.lastAlert > config.duration * 2) { // Double du cooldown pour être sûr
      cooldownMap.delete(key);
      cleaned++;
    }
  }

  if (cleaned > 0) {
    logger.debug(`[Cooldown] ${cleaned} entrée(s) expirée(s) nettoyée(s)`);
  }
}

/**
 * Active le nettoyage automatique des cooldowns expirés
 */
let cleanupInterval: NodeJS.Timeout | null = null;

export function enableCooldownCleanup(intervalMs: number = 300000): void {
  if (cleanupInterval) {
    logger.warn("[Cooldown] Nettoyage automatique déjà activé");
    return;
  }

  logger.info(`[Cooldown] Nettoyage automatique activé (intervalle: ${intervalMs}ms)`);
  cleanupInterval = setInterval(() => {
    cleanupExpiredCooldowns();
  }, intervalMs);
}

/**
 * Désactive le nettoyage automatique
 */
export function disableCooldownCleanup(): void {
  if (cleanupInterval) {
    clearInterval(cleanupInterval);
    cleanupInterval = null;
    logger.info("[Cooldown] Nettoyage automatique désactivé");
  }
}
