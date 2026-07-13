/**
 * autoDefense.ts — Auto-Defense Actions
 *
 * Actions de défense automatique déclenchées par le bot sans
 * intervention humaine, basées sur les règles du SOC et de Cyber Defense.
 *
 *  1. Auto-GeoBlock — blocage automatique par pays/région
 *  2. Auto-Quarantine — quarantaine automatique selon règles
 *  3. Auto-Escalation Chain — chaîne d'escalade (bot → mod → admin → owner)
 *  4. Auto-Whitelist — whitelisting automatique des membres de confiance
 *  5. Auto-Heal Scraper — redémarrage automatique des scrapers en panne
 */

import { GuildMember, EmbedBuilder } from "discord.js";
import logger from "../utils/logger.js";
import {} from "./logs.js";
import { recordSecurityEvent } from "./socExtension.js";

// ─── Types ───────────────────────────────────────────────────────────────────

export interface GeoBlockRule {
  guildId: string;
  countryCode: string;
  action: "TIMEOUT" | "KICK" | "BAN";
  reason: string;
  enabled: boolean;
}

export interface QuarantineRule {
  id: string;
  guildId: string;
  condition: {
    riskLevel?: string;
    minSanctions?: number;
    suspiciousFlags?: string[];
    accountAgeHours?: number;
  };
  action: "TIMEOUT_1H" | "TIMEOUT_24H" | "KICK" | "BAN";
  enabled: boolean;
}

export type EscalationLevel = "BOT" | "MODERATOR" | "ADMIN" | "OWNER";

export interface EscalationStep {
  level: EscalationLevel;
  delayMs: number;
  action: string;
  notified: boolean;
}

export interface AutoDefenseConfig {
  geoBlockEnabled: boolean;
  quarantineEnabled: boolean;
  escalationEnabled: boolean;
  autoHealEnabled: boolean;
  blockedCountries: string[];
  escalationChain: EscalationStep[];
}

// ─── State ───────────────────────────────────────────────────────────────────

const geoBlockRules = new Map<string, GeoBlockRule[]>();
const quarantineRules = new Map<string, QuarantineRule[]>();
const whitelistStore = new Set<string>(); // userIds
const scraperHealth = new Map<string, { lastSuccess: number; failures: number }>();

const DEFAULT_CONFIG: AutoDefenseConfig = {
  geoBlockEnabled: true,
  quarantineEnabled: true,
  escalationEnabled: true,
  autoHealEnabled: true,
  blockedCountries: [],
  escalationChain: [
    { level: "BOT", delayMs: 0, action: "Auto-response (timeout, delete)", notified: false },
    { level: "MODERATOR", delayMs: 60_000, action: "Notify moderators", notified: false },
    { level: "ADMIN", delayMs: 300_000, action: "Notify admins", notified: false },
    { level: "OWNER", delayMs: 900_000, action: "Notify server owner", notified: false },
  ],
};

let currentConfig: AutoDefenseConfig = { ...DEFAULT_CONFIG };

// ─── Configuration ───────────────────────────────────────────────────────────

export function getAutoDefenseConfig(): AutoDefenseConfig {
  return { ...currentConfig };
}

export function updateAutoDefenseConfig(updates: Partial<AutoDefenseConfig>): AutoDefenseConfig {
  currentConfig = { ...currentConfig, ...updates };
  logger.info(
    `[AutoDefense] Config updated: geoBlock=${currentConfig.geoBlockEnabled}, quarantine=${currentConfig.quarantineEnabled}`,
  );
  return { ...currentConfig };
}

// ─── 1. Auto-GeoBlock ────────────────────────────────────────────────────────

/**
 * Ajoute une règle de blocage par pays.
 */
export function addGeoBlockRule(rule: Omit<GeoBlockRule, "enabled"> & { enabled?: boolean }): void {
  const fullRule: GeoBlockRule = { ...rule, enabled: rule.enabled ?? true };
  const rules = geoBlockRules.get(rule.guildId) ?? [];
  rules.push(fullRule);
  geoBlockRules.set(rule.guildId, rules);
  logger.info(
    `[AutoDefense] GeoBlock rule added: ${rule.countryCode} → ${rule.action} for ${rule.guildId}`,
  );
}

/**
 * Vérifie si un membre doit être bloqué par géolocalisation.
 * Appelé automatiquement sur guildMemberAdd.
 */
export async function checkGeoBlock(
  member: GuildMember,
  countryCode: string | null,
): Promise<boolean> {
  if (!currentConfig.geoBlockEnabled || !countryCode) return false;

  const rules = geoBlockRules.get(member.guild.id) ?? [];
  const matchedRule = rules.find((r) => r.enabled && r.countryCode === countryCode);

  if (!matchedRule) return false;

  try {
    switch (matchedRule.action) {
      case "TIMEOUT":
        await member.timeout(60 * 60 * 1000, `Auto-GeoBlock: ${matchedRule.reason}`);
        break;
      case "KICK":
        await member.kick(`Auto-GeoBlock: ${matchedRule.reason}`);
        break;
      case "BAN":
        await member.ban({ reason: `Auto-GeoBlock: ${matchedRule.reason}` });
        break;
    }

    recordSecurityEvent({
      guildId: member.guild.id,
      type: "GEOBLOCK",
      severity: "HIGH",
      source: "AutoDefense",
      message: `Membre bloqué (${countryCode}): ${member.user.tag} → ${matchedRule.action}`,
      relatedUserId: member.id,
      metadata: { countryCode, action: matchedRule.action, reason: matchedRule.reason },
    });

    logger.warn(
      `[AutoDefense] GeoBlock: ${member.user.tag} (${countryCode}) → ${matchedRule.action}`,
    );
    return true;
  } catch (error) {
    logger.error(
      `[AutoDefense] GeoBlock error: ${error instanceof Error ? error.message : String(error)}`,
    );
    return false;
  }
}

// ─── 2. Auto-Quarantine ──────────────────────────────────────────────────────

/**
 * Ajoute une règle de quarantaine automatique.
 */
export function addQuarantineRule(rule: Omit<QuarantineRule, "id"> & { id?: string }): string {
  const id = rule.id ?? `qr_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;
  const fullRule: QuarantineRule = { ...rule, id };
  const rules = quarantineRules.get(rule.guildId) ?? [];
  rules.push(fullRule);
  quarantineRules.set(rule.guildId, rules);
  logger.info(`[AutoDefense] Quarantine rule added: ${id} for ${rule.guildId}`);
  return id;
}

/**
 * Évalue si un membre doit être mis en quarantaine automatiquement.
 * Appelé automatiquement après chaque mise à jour du risk profile.
 */
export async function checkAutoQuarantine(
  member: GuildMember,
  profile: {
    riskLevel: string;
    totalSanctions: number;
    suspiciousFlags: string[];
    accountAgeHours?: number;
  },
): Promise<boolean> {
  if (!currentConfig.quarantineEnabled) return false;

  const rules = quarantineRules.get(member.guild.id) ?? [];

  for (const rule of rules) {
    if (!rule.enabled) continue;

    const cond = rule.condition;
    let matches = true;

    if (cond.riskLevel && profile.riskLevel !== cond.riskLevel) matches = false;
    if (cond.minSanctions && profile.totalSanctions < cond.minSanctions) matches = false;
    if (
      cond.suspiciousFlags &&
      !cond.suspiciousFlags.every((f) => profile.suspiciousFlags.includes(f))
    )
      matches = false;
    if (cond.accountAgeHours && (profile.accountAgeHours ?? 999) > cond.accountAgeHours)
      matches = false;

    if (matches) {
      try {
        switch (rule.action) {
          case "TIMEOUT_1H":
            await member.timeout(60 * 60 * 1000, `Auto-Quarantine: rule ${rule.id}`);
            break;
          case "TIMEOUT_24H":
            await member.timeout(24 * 60 * 60 * 1000, `Auto-Quarantine: rule ${rule.id}`);
            break;
          case "KICK":
            await member.kick(`Auto-Quarantine: rule ${rule.id}`);
            break;
          case "BAN":
            await member.ban({ reason: `Auto-Quarantine: rule ${rule.id}` });
            break;
        }

        recordSecurityEvent({
          guildId: member.guild.id,
          type: "QUARANTINE",
          severity: "HIGH",
          source: "AutoDefense",
          message: `Auto-quarantine: ${member.user.tag} → ${rule.action} (rule ${rule.id})`,
          relatedUserId: member.id,
          metadata: { ruleId: rule.id, action: rule.action, profile },
        });

        logger.warn(`[AutoDefense] Auto-quarantine: ${member.user.tag} → ${rule.action}`);
        return true;
      } catch (error) {
        logger.error(
          `[AutoDefense] Quarantine error: ${error instanceof Error ? error.message : String(error)}`,
        );
      }
    }
  }

  return false;
}

// ─── 3. Auto-Escalation Chain ────────────────────────────────────────────────

const activeEscalations = new Map<string, { steps: EscalationStep[]; incidentId: string }>();

/**
 * Démarre une chaîne d'escalade pour un incident.
 */
export function startEscalation(
  guildId: string,
  incidentId: string,
  notifyCallback: (level: EscalationLevel, action: string) => Promise<void>,
): void {
  if (!currentConfig.escalationEnabled) return;

  const steps = currentConfig.escalationChain.map((s) => ({ ...s, notified: false }));
  activeEscalations.set(`${guildId}_${incidentId}`, { steps, incidentId });

  for (const step of steps) {
    setTimeout(async () => {
      const escalation = activeEscalations.get(`${guildId}_${incidentId}`);
      if (!escalation || escalation.incidentId !== incidentId) return; // Résolu entre-temps

      if (!step.notified) {
        try {
          await notifyCallback(step.level, step.action);
          step.notified = true;

          recordSecurityEvent({
            guildId,
            type: "ESCALATION",
            severity: step.level === "OWNER" ? "CRITICAL" : "HIGH",
            source: "AutoDefense",
            message: `Escalade ${step.level}: ${step.action} (incident ${incidentId})`,
            metadata: { level: step.level, action: step.action, incidentId },
          });

          logger.warn(`[AutoDefense] Escalation ${step.level} for incident ${incidentId}`);
        } catch (error) {
          logger.error(
            `[AutoDefense] Escalation notify error: ${error instanceof Error ? error.message : String(error)}`,
          );
        }
      }
    }, step.delayMs);
  }
}

/**
 * Annule une escalade (incident résolu).
 */
export function cancelEscalation(guildId: string, incidentId: string): void {
  activeEscalations.delete(`${guildId}_${incidentId}`);
  logger.info(`[AutoDefense] Escalation cancelled for incident ${incidentId}`);
}

// ─── 4. Auto-Whitelist ───────────────────────────────────────────────────────

/**
 * Ajoute un utilisateur à la whitelist (ne sera pas bloqué par les règles auto).
 */
export function addToWhitelist(userId: string): void {
  whitelistStore.add(userId);
  logger.info(`[AutoDefense] User ${userId} whitelisted`);
}

/**
 * Vérifie si un utilisateur est sur la whitelist.
 */
export function isWhitelisted(userId: string): boolean {
  return whitelistStore.has(userId);
}

/**
 * Retire un utilisateur de la whitelist.
 */
export function removeFromWhitelist(userId: string): void {
  whitelistStore.delete(userId);
}

// ─── 5. Auto-Heal Scraper ────────────────────────────────────────────────────

/**
 * Signale le succès ou l'échec d'un scraper.
 */
export function reportScraperHealth(scraperId: string, success: boolean): void {
  if (!currentConfig.autoHealEnabled) return;

  const health = scraperHealth.get(scraperId) ?? { lastSuccess: Date.now(), failures: 0 };

  if (success) {
    health.lastSuccess = Date.now();
    health.failures = 0;
  } else {
    health.failures++;
    logger.warn(`[AutoDefense] Scraper ${scraperId} failure #${health.failures}`);

    if (health.failures >= 3) {
      logger.warn(`[AutoDefense] Scraper ${scraperId} needs healing (${health.failures} failures)`);
      // Le redémarrage est géré par le incidentResolver ou le hot-reload
    }
  }

  scraperHealth.set(scraperId, health);
}

/**
 * Retourne les scrapers en mauvaise santé.
 */
export function getUnhealthyScrapers(): {
  scraperId: string;
  failures: number;
  lastSuccess: number;
}[] {
  return Array.from(scraperHealth.entries())
    .filter(([, h]) => h.failures > 0)
    .map(([id, h]) => ({ scraperId: id, failures: h.failures, lastSuccess: h.lastSuccess }));
}

// ─── API publique ────────────────────────────────────────────────────────────

export function getGeoBlockRules(guildId?: string): GeoBlockRule[] {
  if (guildId) return geoBlockRules.get(guildId) ?? [];
  return Array.from(geoBlockRules.values()).flat();
}

export function getQuarantineRules(guildId?: string): QuarantineRule[] {
  if (guildId) return quarantineRules.get(guildId) ?? [];
  return Array.from(quarantineRules.values()).flat();
}

export function clearAutoDefense(): void {
  geoBlockRules.clear();
  quarantineRules.clear();
  whitelistStore.clear();
  scraperHealth.clear();
  activeEscalations.clear();
  currentConfig = { ...DEFAULT_CONFIG };
}

export function buildAutoDefenseEmbed(config: AutoDefenseConfig): EmbedBuilder {
  return new EmbedBuilder()
    .setTitle("🤖 Auto-Defense System")
    .setColor(config.geoBlockEnabled || config.quarantineEnabled ? 0xff6600 : 0x808080)
    .setDescription("Système de défense automatique")
    .addFields(
      {
        name: "GeoBlock",
        value: config.geoBlockEnabled ? "✅ Activé" : "❌ Désactivé",
        inline: true,
      },
      {
        name: "Quarantine",
        value: config.quarantineEnabled ? "✅ Activé" : "❌ Désactivé",
        inline: true,
      },
      {
        name: "Escalation",
        value: config.escalationEnabled ? "✅ Activé" : "❌ Désactivé",
        inline: true,
      },
      {
        name: "Auto-Heal",
        value: config.autoHealEnabled ? "✅ Activé" : "❌ Désactivé",
        inline: true,
      },
      {
        name: "Pays bloqués",
        value: config.blockedCountries.length > 0 ? config.blockedCountries.join(", ") : "Aucun",
        inline: true,
      },
      { name: "Scrapers en panne", value: `${getUnhealthyScrapers().length}`, inline: true },
    )
    .setTimestamp();
}
