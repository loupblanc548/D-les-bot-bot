/**
 * autonomousInvestigator.ts — Module d'Investigation Autonome
 *
 * Intercepte les événements où un utilisateur dépasse un seuil critique
 * de riskscore. Orchestre séquentiellement les outils OSINT existants
 * (Sherlock, Maigret, Holehe, etc.) en fonction des données disponibles
 * sur le profil suspect, compile un rapport structuré et l'envoie
 * automatiquement vers le module /alertcenter.
 *
 * Déclencheurs :
 *  - riskLevel === "CRITIQUE" (score >= 100)
 *  - riskLevel === "ELEVE" && totalSanctions >= 5
 *
 * Flow :
 *  1. gatherDiscordIntel() — récupère pseudo, historique, sanctions via Shadow Broker
 *  2. runOSINTSequence() — orchestre Sherlock → Maigret → Holehe en séquence
 *  3. compileReport() — génère un rapport Markdown structuré
 *  4. dispatchReport() — envoie vers alertcenter + notification owners
 */

import { Client, EmbedBuilder, GuildMember } from "discord.js";
import logger from "../utils/logger.js";
import { RiskProfile } from "./risk-engine.js";
import { generateAlert, sendAlertToChannel, notifyOwners } from "./alert-service.js";
import { queryOSINT, OSINTResult } from "./osintProvider.js";
import { getMemberIntel, MemberIntel } from "./shadowBroker.js";
import { createLog } from "./logs.js";

// ─── Types ───────────────────────────────────────────────────────────────────

export interface InvestigationReport {
  reportId: string;
  userId: string;
  guildId: string;
  triggeredAt: Date;
  triggerReason: string;
  riskScore: number;
  riskLevel: string;
  discordIntel: MemberIntel | null;
  osintResults: OSINTResult[];
  summary: string;
  markdownReport: string;
  durationMs: number;
}

export interface InvestigationConfig {
  enableSherlock: boolean;
  enableMaigret: boolean;
  enableHolehe: boolean;
  enableWhatsMyName: boolean;
  maxOsintDurationMs: number;
}

const DEFAULT_CONFIG: InvestigationConfig = {
  enableSherlock: true,
  enableMaigret: true,
  enableHolehe: true,
  enableWhatsMyName: true,
  maxOsintDurationMs: 120_000,
};

// Anti-spam : une investigation par utilisateur par 6h
const INVESTIGATION_COOLDOWN_MS = 6 * 60 * 60 * 1000;
const recentInvestigations = new Map<string, number>();

// ─── Déclencheur principal ───────────────────────────────────────────────────

/**
 * Vérifie si un profil de risque déclenche une investigation autonome.
 * À appeler après chaque recordSanction() ou recordSecurityEvent().
 */
export function shouldInvestigate(profile: RiskProfile): boolean {
  if (profile.riskLevel === "CRITIQUE") return true;
  if (profile.riskLevel === "ELEVE" && profile.totalSanctions >= 5) return true;
  return false;
}

/**
 * Lance une investigation autonome si le profil le justifie.
 * Non-bloquant : catch toutes les erreurs en interne.
 */
export async function maybeTriggerInvestigation(
  client: Client,
  profile: RiskProfile,
  config: InvestigationConfig = DEFAULT_CONFIG,
): Promise<InvestigationReport | null> {
  if (!shouldInvestigate(profile)) return null;

  // Cooldown check
  const cooldownKey = `${profile.userId}:${profile.guildId}`;
  const lastInvestigation = recentInvestigations.get(cooldownKey);
  if (lastInvestigation && Date.now() - lastInvestigation < INVESTIGATION_COOLDOWN_MS) {
    logger.info(`[Investigator] Cooldown actif pour ${profile.userId} — investigation skipée`);
    return null;
  }

  try {
    const report = await runInvestigation(client, profile, config);
    recentInvestigations.set(cooldownKey, Date.now());
    return report;
  } catch (error) {
    logger.error(
      `[Investigator] Échec investigation pour ${profile.userId}: ${error instanceof Error ? error.message : String(error)}`,
    );
    return null;
  }
}

// ─── Investigation complète ──────────────────────────────────────────────────

export async function runInvestigation(
  client: Client,
  profile: RiskProfile,
  config: InvestigationConfig = DEFAULT_CONFIG,
): Promise<InvestigationReport> {
  const startTime = Date.now();
  const reportId = `INV-${Date.now()}-${profile.userId.slice(-4)}`;
  const triggerReason =
    profile.riskLevel === "CRITIQUE"
      ? `Score critique (${profile.riskScore})`
      : `Score élevé (${profile.riskScore}) avec ${profile.totalSanctions} sanctions`;

  logger.info(
    `[Investigator] Investigation ${reportId} démarrée pour ${profile.userId} — ${triggerReason}`,
  );

  // 1. Discord Intel via Shadow Broker
  const discordIntel = await gatherDiscordIntel(client, profile.userId, profile.guildId);

  // 2. Extraire le pseudo depuis Discord Intel
  const username = extractUsername(discordIntel, profile.userId);

  // 3. OSINT séquentiel
  const osintResults = await runOSINTSequence(username, config);

  // 4. Compiler le rapport
  const markdownReport = compileMarkdownReport(
    reportId,
    profile,
    discordIntel,
    osintResults,
    triggerReason,
  );

  const durationMs = Date.now() - startTime;
  const summary = generateSummary(profile, osintResults, discordIntel);

  const report: InvestigationReport = {
    reportId,
    userId: profile.userId,
    guildId: profile.guildId,
    triggeredAt: new Date(),
    triggerReason,
    riskScore: profile.riskScore,
    riskLevel: profile.riskLevel,
    discordIntel,
    osintResults,
    summary,
    markdownReport,
    durationMs,
  };

  // 5. Dispatcher le rapport
  await dispatchReport(report, profile, client);

  logger.info(
    `[Investigator] Investigation ${reportId} terminée en ${durationMs}ms — ${osintResults.length} résultats OSINT`,
  );

  return report;
}

// ─── 1. Discord Intel ────────────────────────────────────────────────────────

async function gatherDiscordIntel(
  client: Client,
  userId: string,
  guildId: string,
): Promise<MemberIntel | null> {
  try {
    const guild = client.guilds.cache.get(guildId);
    if (!guild) {
      logger.warn(`[Investigator] Guilde ${guildId} non trouvée pour Discord Intel`);
      return null;
    }
    const member = await guild.members.fetch(userId).catch(() => null);
    if (!member) {
      logger.warn(`[Investigator] Membre ${userId} non trouvé dans la guilde`);
      return null;
    }
    const intel = await getMemberIntel(member);
    logger.info(`[Investigator] Discord Intel récupéré pour ${userId}`);
    return intel;
  } catch (error) {
    logger.warn(
      `[Investigator] Échec Discord Intel pour ${userId}: ${error instanceof Error ? error.message : String(error)}`,
    );
    return null;
  }
}

// ─── 2. Orchestration OSINT séquentielle ─────────────────────────────────────

async function runOSINTSequence(
  username: string | null,
  config: InvestigationConfig,
): Promise<OSINTResult[]> {
  const results: OSINTResult[] = [];

  if (!username) {
    logger.info("[Investigator] Aucun pseudo disponible — OSINT skipé");
    return results;
  }

  // Étape 1 : scan rapide natif (35+ plateformes)
  logger.info(`[Investigator] OSINT étape 1/4 — username-fast pour "${username}"`);
  const fastResult = await queryOSINT(null, "username-fast", username, {
    timeoutMs: 30_000,
  });
  results.push(fastResult);

  // Étape 2 : Sherlock (480+ sites) — si activé
  if (config.enableSherlock) {
    logger.info(`[Investigator] OSINT étape 2/4 — sherlock pour "${username}"`);
    const sherlockResult = await queryOSINT(null, "sherlock", username, {
      timeoutMs: config.maxOsintDurationMs,
    });
    results.push(sherlockResult);
  }

  // Étape 3 : Maigret (2500+ sites, profiling profond) — si activé
  if (config.enableMaigret) {
    logger.info(`[Investigator] OSINT étape 3/4 — maigret pour "${username}"`);
    const maigretResult = await queryOSINT(null, "maigret", username, {
      timeoutMs: config.maxOsintDurationMs,
    });
    results.push(maigretResult);
  }

  // Étape 4 : WhatsMyName (600+ sites) — si activé
  if (config.enableWhatsMyName) {
    logger.info(`[Investigator] OSINT étape 4/4 — wmn pour "${username}"`);
    const wmnResult = await queryOSINT(null, "wmn", username, {
      timeoutMs: 60_000,
    });
    results.push(wmnResult);
  }

  // Bonus : si on a trouvé des comptes avec email potentiel, lancer Holehe
  if (config.enableHolehe) {
    const email = extractEmailFromResults(results);
    if (email) {
      logger.info(`[Investigator] OSINT bonus — holehe pour "${email}"`);
      const holeheResult = await queryOSINT(null, "holehe", email, {
        timeoutMs: 60_000,
      });
      results.push(holeheResult);
    }
  }

  return results;
}

// ─── 3. Compilation du rapport Markdown ──────────────────────────────────────

export function compileMarkdownReport(
  reportId: string,
  profile: RiskProfile,
  discordIntel: MemberIntel | null,
  osintResults: OSINTResult[],
  triggerReason: string,
): string {
  const lines: string[] = [];

  lines.push(`# Rapport d'Investigation Autonome — ${reportId}`);
  lines.push("");
  lines.push(`**Date:** ${new Date().toISOString()}`);
  lines.push(`**Utilisateur:** <@${profile.userId}> (\`${profile.userId}\`)`);
  lines.push(`**Serveur:** ${profile.guildId}`);
  lines.push(`**Déclencheur:** ${triggerReason}`);
  lines.push(`**Score de risque:** ${profile.riskScore} (${profile.riskLevel})`);
  lines.push("");

  // Section Discord Intel
  lines.push("## Intelligence Discord");
  lines.push("");
  if (discordIntel) {
    lines.push(`- **Pseudo actuel:** ${discordIntel.tag || "N/A"}`);
    lines.push(`- **Score d'activité:** ${discordIntel.activityScore ?? "N/A"}`);
    lines.push(`- **Flags suspects:** ${discordIntel.suspiciousFlags?.length ?? 0}`);
    if (discordIntel.suspiciousFlags && discordIntel.suspiciousFlags.length > 0) {
      lines.push(`  - ${discordIntel.suspiciousFlags.join(", ")}`);
    }
    lines.push(`- **Comptes liés:** ${discordIntel.linkedAccounts?.length ?? 0}`);
    if (discordIntel.linkedAccounts && discordIntel.linkedAccounts.length > 0) {
      for (const acc of discordIntel.linkedAccounts.slice(0, 5)) {
        lines.push(`  - ${acc.tag} (confiance: ${acc.confidence}%) — ${acc.reasons.join(", ")}`);
      }
    }
    lines.push(`- **Changements de nom:** ${discordIntel.nameChanges ?? 0}`);
    lines.push(`- **Changements d'avatar:** ${discordIntel.avatarChanges ?? 0}`);
    lines.push(`- **Sanctions totales:** ${profile.totalSanctions}`);
    lines.push(`  - Warns: ${profile.warnCount} | Timeouts: ${profile.timeoutCount}`);
    lines.push(`  - Kicks: ${profile.kickCount} | Tempbans: ${profile.tempbanCount}`);
    lines.push(`  - Bans: ${profile.banCount}`);
  } else {
    lines.push("*Données Discord indisponibles.*");
  }
  lines.push("");

  // Section OSINT
  lines.push("## Résultats OSINT");
  lines.push("");

  if (osintResults.length === 0) {
    lines.push("*Aucune recherche OSINT effectuée (pas de pseudo disponible).*");
  } else {
    for (const result of osintResults) {
      lines.push(`### ${result.type.toUpperCase()} — ${result.success ? "✅" : "❌"}`);
      lines.push("");
      lines.push(`- **Durée:** ${result.durationMs}ms`);
      lines.push(`- **Cache:** ${result.fromCache ? "Oui" : "Non"}`);
      if (result.error) {
        lines.push(`- **Erreur:** ${result.error}`);
      }
      if (result.success && result.data) {
        lines.push(`- **Données:** ${summarizeOsintData(result.type, result.data)}`);
      }
      lines.push("");
    }
  }

  // Conclusion
  lines.push("## Conclusion");
  lines.push("");
  const totalFound = osintResults.filter((r) => r.success).length;
  lines.push(`- **Recherches OSINT:** ${osintResults.length} effectuées, ${totalFound} réussies`);
  lines.push(`- **Niveau de menace:** ${profile.riskLevel} (score: ${profile.riskScore})`);
  lines.push(`- **Recommandation:** ${getRecommendation(profile, osintResults, discordIntel)}`);
  lines.push("");
  lines.push("---");
  lines.push(`*Rapport généré automatiquement par le module d'investigation autonome.*`);

  return lines.join("\n");
}

// ─── 4. Dispatch du rapport ──────────────────────────────────────────────────

async function dispatchReport(
  report: InvestigationReport,
  profile: RiskProfile,
  client: Client,
): Promise<void> {
  // 1. Créer une alerte dans le système alertcenter
  try {
    const alert = await generateAlert(
      profile,
      `Investigation autonome ${report.reportId}: ${report.summary}`,
      "AUTONOMOUS_INVESTIGATION",
    );

    // 2. Envoyer dans le salon d'alertes
    await sendAlertToChannel(alert, client);

    // 3. Notifier les owners par DM
    await notifyOwners(
      alert,
      `🔍 **Investigation autonome déclenchée**\n\n` +
        `**Utilisateur:** <@${report.userId}>\n` +
        `**Score:** ${report.riskScore} (${report.riskLevel})\n` +
        `**Raison:** ${report.triggerReason}\n` +
        `**Résultats OSINT:** ${report.osintResults.length}\n` +
        `**Durée:** ${report.durationMs}ms\n\n` +
        `Rapport complet disponible dans le salon d'alertes.`,
      client,
    );

    logger.info(`[Investigator] Rapport ${report.reportId} dispatché vers alertcenter`);
  } catch (error) {
    logger.error(
      `[Investigator] Échec dispatch rapport ${report.reportId}: ${error instanceof Error ? error.message : String(error)}`,
    );
  }

  // 4. Logger dans la DB
  try {
    await createLog({
      type: "INVESTIGATION",
      action: `Investigation autonome ${report.reportId} pour ${report.userId}`,
      userId: report.userId,
      targetId: report.guildId,
      details: JSON.stringify({
        reportId: report.reportId,
        riskScore: report.riskScore,
        riskLevel: report.riskLevel,
        osintResults: report.osintResults.length,
        durationMs: report.durationMs,
        summary: report.summary,
      }),
    });
  } catch {
    // Non-critique
  }
}

// ─── Helpers ─────────────────────────────────────────────────────────────────

export function extractUsername(intel: MemberIntel | null, userId: string): string | null {
  if (!intel) return null;
  // Essayer d'extraire un pseudo depuis le tag Discord
  if (intel.tag) {
    const parts = intel.tag.split("#");
    return parts[0] || null;
  }
  return null;
}

function extractEmailFromResults(results: OSINTResult[]): string | null {
  // Tenter d'extraire un email des résultats OSINT si disponible
  for (const result of results) {
    if (!result.success || !result.data) continue;
    const dataStr = JSON.stringify(result.data);
    const emailMatch = dataStr.match(/[a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,}/);
    if (emailMatch) return emailMatch[0];
  }
  return null;
}

function summarizeOsintData(type: string, data: unknown): string {
  try {
    if (Array.isArray(data)) {
      const found = data.filter((item: any) => item.found || item.registered);
      return `${data.length} résultats, ${found.length} positifs`;
    }
    if (typeof data === "object" && data !== null) {
      const obj = data as Record<string, unknown>;
      if ("totalFound" in obj) return `${obj.totalFound} trouvés`;
      if ("totalRegistered" in obj) return `${obj.totalRegistered} inscrits`;
      if ("totalBreaches" in obj) return `${obj.totalBreaches} breaches`;
      if ("subdomains" in obj && Array.isArray(obj.subdomains))
        return `${(obj.subdomains as unknown[]).length} sous-domaines`;
      return "Données récupérées";
    }
    return String(data).slice(0, 200);
  } catch {
    return "Données indisponibles";
  }
}

export function generateSummary(
  profile: RiskProfile,
  osintResults: OSINTResult[],
  discordIntel: MemberIntel | null,
): string {
  const successCount = osintResults.filter((r) => r.success).length;
  const linkedAccounts = discordIntel?.linkedAccounts?.length ?? 0;
  const suspiciousFlags = discordIntel?.suspiciousFlags?.length ?? 0;

  return (
    `Score ${profile.riskScore} (${profile.riskLevel}), ` +
    `${successCount}/${osintResults.length} OSINT réussis, ` +
    `${linkedAccounts} comptes liés, ` +
    `${suspiciousFlags} flags suspects`
  );
}

export function getRecommendation(
  profile: RiskProfile,
  osintResults: OSINTResult[],
  discordIntel: MemberIntel | null,
): string {
  if (profile.riskLevel === "CRITIQUE") {
    const linkedAccounts = discordIntel?.linkedAccounts?.length ?? 0;
    if (linkedAccounts > 2) {
      return "BAN immédiat recommandé — réseau de comptes liés détecté";
    }
    return "BAN recommandé — score critique atteint";
  }
  if (profile.riskLevel === "ELEVE" && profile.totalSanctions >= 5) {
    return "Timeout延长 ou tempban recommandé — récidive confirmée";
  }
  return "Surveillance renforcée recommandée";
}

// ─── API publique pour tests ─────────────────────────────────────────────────

export function clearCooldowns(): void {
  recentInvestigations.clear();
}

export function getCooldownStatus(userId: string, guildId: string): boolean {
  const key = `${userId}:${guildId}`;
  const last = recentInvestigations.get(key);
  if (!last) return false;
  return Date.now() - last < INVESTIGATION_COOLDOWN_MS;
}

export function buildInvestigationEmbed(report: InvestigationReport): EmbedBuilder {
  const colorMap: Record<string, number> = {
    CRITIQUE: 0xff3344,
    ELEVE: 0xff6600,
    MOYEN: 0xffaa00,
    FAIBLE: 0x53fc18,
  };

  return new EmbedBuilder()
    .setTitle(`🔍 Investigation Autonome — ${report.reportId}`)
    .setColor(colorMap[report.riskLevel] ?? 0x808080)
    .setDescription(report.summary)
    .addFields(
      { name: "Utilisateur", value: `<@${report.userId}>`, inline: true },
      { name: "Score", value: `${report.riskScore} (${report.riskLevel})`, inline: true },
      { name: "Durée", value: `${report.durationMs}ms`, inline: true },
      {
        name: "Résultats OSINT",
        value: `${report.osintResults.filter((r) => r.success).length}/${report.osintResults.length} réussis`,
        inline: true,
      },
      {
        name: "Déclencheur",
        value: report.triggerReason,
        inline: false,
      },
    )
    .setFooter({ text: `Investigation autonome • ${report.reportId}` })
    .setTimestamp(report.triggeredAt);
}
