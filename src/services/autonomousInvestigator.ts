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

import { Client, EmbedBuilder } from "discord.js";
import logger from "../utils/logger.js";
import prisma from "../prisma.js";
import { config } from "../config.js";
import { RiskProfile, recordSanction } from "./risk-engine.js";
import {
  generateAlert,
  sendAlertToChannel,
  notifyOwners,
  type AlertAction,
} from "./alert-service.js";
import { queryOSINT, OSINTResult } from "./osintProvider.js";
import { getMemberIntel, MemberIntel } from "./shadowBroker.js";
import { createLog } from "./logs.js";
import { getOpenAIClient } from "./ai.js";

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
  aiDecision: AIDecision | null;
}

export interface AIDecision {
  action: AlertAction;
  confidence: number;
  reasoning: string;
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

  // 3.5. Analyse et décision par l'agent IA
  const aiDecision = await analyzeWithAI(profile, discordIntel, osintResults);

  // 4. Compiler le rapport
  const markdownReport = compileMarkdownReport(
    reportId,
    profile,
    discordIntel,
    osintResults,
    triggerReason,
    aiDecision,
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
    aiDecision,
  };

  // 5. Dispatcher le rapport
  await dispatchReport(report, profile, client);

  logger.info(
    `[Investigator] Investigation ${reportId} terminée en ${durationMs}ms — ${osintResults.length} résultats OSINT`,
  );

  return report;
}

// ─── 3.5. Décision de l'Agent IA ─────────────────────────────────────────────

const VALID_AI_ACTIONS: AlertAction[] = ["IGNORE", "WATCH", "WARN", "TIMEOUT", "KICK", "BAN"];

/**
 * Analyse le profil de risque + l'intel Discord + les résultats OSINT avec un
 * LLM pour produire une décision structurée (action, confiance, justification).
 * Retourne `null` en cas d'échec (réseau, parsing) — le caller doit alors
 * retomber sur la logique basée sur des règles (`getRecommendation`).
 */
async function analyzeWithAI(
  profile: RiskProfile,
  discordIntel: MemberIntel | null,
  osintResults: OSINTResult[],
): Promise<AIDecision | null> {
  try {
    const client = getOpenAIClient();

    const osintSummary =
      osintResults.length === 0
        ? "Aucune recherche OSINT effectuée (pas de pseudo disponible)."
        : osintResults
            .map((r) =>
              r.success
                ? `- ${r.type}: ${summarizeOsintData(r.type, r.data)}`
                : `- ${r.type}: échec (${r.error ?? "raison inconnue"})`,
            )
            .join("\n");

    const intelSummary = discordIntel
      ? `- Comptes liés détectés: ${discordIntel.linkedAccounts?.length ?? 0}\n` +
        `- Flags suspects: ${discordIntel.suspiciousFlags?.join(", ") || "aucun"}\n` +
        `- Changements de pseudo: ${discordIntel.nameChanges ?? 0}\n` +
        `- Changements d'avatar: ${discordIntel.avatarChanges ?? 0}`
      : "Intelligence Discord indisponible.";

    const prompt =
      `Tu es un agent de modération autonome pour un serveur Discord. ` +
      `Tu dois analyser les données suivantes sur un utilisateur signalé et prendre une décision de sanction.\n\n` +
      `## Profil de risque\n` +
      `- Score: ${profile.riskScore} (niveau ${profile.riskLevel})\n` +
      `- Sanctions historiques: ${profile.totalSanctions} total ` +
      `(${profile.warnCount} warns, ${profile.timeoutCount} timeouts, ${profile.kickCount} kicks, ` +
      `${profile.tempbanCount} tempbans, ${profile.banCount} bans)\n` +
      `- Déjà sous surveillance: ${profile.underWatch ? "oui" : "non"}\n\n` +
      `## Intelligence Discord\n${intelSummary}\n\n` +
      `## Résultats OSINT\n${osintSummary}\n\n` +
      `## Processus de raisonnement\n` +
      `Avant de décider, analyse étape par étape :\n` +
      `1. Quelles preuves de comportement malveillant sont présentes ?\n` +
      `2. Y a-t-il des circonstances atténuantes (nouvel utilisateur, malentendu possible) ?\n` +
      `3. L'utilisateur a-t-il déjà été sanctionné ? L'escalade est-elle justifiée ?\n` +
      `4. Quelle est la gravité réelle : nuisance mineure, problème récurrent, ou menace grave ?\n` +
      `5. Quelle action est proportionnée ?\n\n` +
      `## Règles de décision\n` +
      `- IGNORE: aucune preuve de comportement malveillant, score isolé, faux positif probable\n` +
      `- WATCH: signaux faibles mais préoccupants, à surveiller sans action immédiate\n` +
      `- WARN: comportement inapproprié mais non grave, premier avertissement justifié\n` +
      `- TIMEOUT: comportement problématique nécessitant une pause (spam, harcèlement léger)\n` +
      `- KICK: violation claire mais réversible (récidive après timeout, toxicité modérée)\n` +
      `- BAN: preuve forte de malveillance (multi-comptes pour contourner un ban, raid, harcèlement grave, pédophilie)\n\n` +
      `Réponds UNIQUEMENT avec un objet JSON valide (aucun texte, aucun markdown autour), au format :\n` +
      `{"action": "IGNORE|WATCH|WARN|TIMEOUT|KICK|BAN", "confidence": <entier 0-100>, "reasoning": "<ton analyse concise en français incluant les preuves retenues et la proportionnalité>"}`;

    const completion = await client.chat.completions.create(
      {
        model: config.openRouterModel,
        messages: [
          {
            role: "system",
            content: "Tu réponds uniquement en JSON valide, sans markdown ni texte additionnel.",
          },
          { role: "user", content: prompt },
        ],
        max_tokens: 350,
        temperature: 0.3,
      },
      { timeout: 12_000 },
    );

    const raw = completion.choices[0]?.message?.content ?? "";
    const jsonMatch = raw.match(/\{[\s\S]*\}/);
    if (!jsonMatch) {
      logger.warn("[Investigator] Réponse IA sans JSON exploitable, fallback rule-based");
      return null;
    }

    const parsed = JSON.parse(jsonMatch[0]) as {
      action?: string;
      confidence?: number;
      reasoning?: string;
    };

    if (!parsed.action || !VALID_AI_ACTIONS.includes(parsed.action as AlertAction)) {
      logger.warn(
        `[Investigator] Action IA invalide: ${String(parsed.action)}, fallback rule-based`,
      );
      return null;
    }

    const confidence =
      typeof parsed.confidence === "number" && Number.isFinite(parsed.confidence)
        ? Math.max(0, Math.min(100, Math.round(parsed.confidence)))
        : 50;

    return {
      action: parsed.action as AlertAction,
      confidence,
      reasoning: parsed.reasoning?.trim() || "Aucune justification fournie par l'IA.",
    };
  } catch (error) {
    logger.warn(
      `[Investigator] Analyse IA échouée, fallback rule-based: ${error instanceof Error ? error.message : String(error)}`,
    );
    return null;
  }
}

/**
 * Ordre d'escalade : l'agent ne peut pas sauter directement au BAN
 * sans avoir d'abord escaladé progressivement.
 */
const ESCALATION_ORDER: AlertAction[] = ["WARN", "TIMEOUT", "KICK", "BAN"];

/**
 * Détermine l'action réelle à exécuter en fonction de l'escalade progressive.
 * L'agent peut monter d'un cran max par rapport à la sanction précédente,
 * sauf si le score de risque est CRITIQUE (≥100) auquel cas il peut aller
 * directement à KICK ou BAN.
 */
function applyEscalation(requestedAction: AlertAction, profile: RiskProfile): AlertAction {
  // IGNORE et WATCH ne sont pas soumis à l'escalade
  if (requestedAction === "IGNORE" || requestedAction === "WATCH") {
    return requestedAction;
  }

  // Score critique → l'agent peut agir avec force immédiatement
  if (profile.riskLevel === "CRITIQUE" && profile.riskScore >= 100) {
    return requestedAction;
  }

  // Déterminer le niveau de la dernière sanction de l'utilisateur
  const previousActions: AlertAction[] = [];
  if (profile.warnCount > 0) previousActions.push("WARN");
  if (profile.timeoutCount > 0) previousActions.push("TIMEOUT");
  if (profile.kickCount > 0) previousActions.push("KICK");
  if (profile.banCount > 0) previousActions.push("BAN");

  if (previousActions.length === 0) {
    // Aucune sanction précédente → max TIMEOUT (pas de KICK/BAN direct)
    const maxIndex = Math.min(1, ESCALATION_ORDER.indexOf(requestedAction));
    return ESCALATION_ORDER[maxIndex];
  }

  // Trouver l'indice de la sanction la plus élevée déjà reçue
  const highestPrevIndex = Math.max(...previousActions.map((a) => ESCALATION_ORDER.indexOf(a)));

  // L'agent peut monter d'un cran au-dessus
  const maxAllowedIndex = Math.min(highestPrevIndex + 1, ESCALATION_ORDER.length - 1);
  const requestedIndex = ESCALATION_ORDER.indexOf(requestedAction);

  if (requestedIndex <= maxAllowedIndex) {
    return requestedAction;
  }

  // Limiter à l'escalade max autorisée
  return ESCALATION_ORDER[maxAllowedIndex];
}

/**
 * Exécute une action de modération de manière autonome (sans intervention
 * humaine), utilisée uniquement quand `AUTONOMOUS_AGENT_MODE=autonomous` et
 * que la confiance de l'IA dépasse le seuil configuré.
 * Applique l'escalade progressive pour éviter un BAN direct sans historique.
 */
async function autoExecuteAction(
  action: AlertAction,
  userId: string,
  guildId: string,
  client: Client,
  reasoning: string,
  profile: RiskProfile,
): Promise<boolean> {
  // Appliquer l'escalade progressive
  const escalatedAction = applyEscalation(action, profile);

  if (escalatedAction !== action) {
    logger.info(
      `[Investigator] 🤖 Escalade: ${action} → ${escalatedAction} (historique utilisateur)`,
    );
  }

  if (escalatedAction === "IGNORE" || escalatedAction === "WATCH") {
    logger.info(`[Investigator] 🤖 Action ${escalatedAction} — pas d'exécution nécessaire`);
    return true;
  }

  const guild = client.guilds.cache.get(guildId);
  if (!guild) return false;

  const reason = `[Agent IA autonome] ${reasoning}`.slice(0, 512);

  try {
    switch (escalatedAction) {
      case "WARN":
        await prisma.sanction.create({
          data: { guildId, userId, moderatorId: "AI_AGENT", type: "WARN", reason },
        });
        await recordSanction(userId, guildId, "WARN");
        break;
      case "TIMEOUT": {
        const member = await guild.members.fetch(userId).catch(() => null);
        if (!member) return false;
        // Escalader la durée du timeout selon le nombre de timeouts précédents
        const timeoutDuration = Math.min(
          24 * 60 * 60 * 1000, // max 24h
          (profile.timeoutCount + 1) * 60 * 60 * 1000, // 1h, 2h, 3h...
        );
        await member.timeout(timeoutDuration, reason);
        await recordSanction(userId, guildId, "TIMEOUT");
        break;
      }
      case "KICK": {
        const member = await guild.members.fetch(userId).catch(() => null);
        if (!member) return false;
        await member.kick(reason);
        await recordSanction(userId, guildId, "KICK");
        break;
      }
      case "BAN":
        await guild.members.ban(userId, { reason, deleteMessageSeconds: 7 * 86400 });
        await recordSanction(userId, guildId, "BAN");
        break;
      default:
        return false;
    }

    await createLog({
      type: `AUTONOMOUS_${escalatedAction}`,
      action: `Action autonome ${escalatedAction}${escalatedAction !== action ? ` (escaladé depuis ${action})` : ""} exécutée par l'agent IA`,
      userId,
      moderator: "AI_AGENT",
      details: JSON.stringify({
        requestedAction: action,
        executedAction: escalatedAction,
        reasoning,
        confidence: profile.riskScore,
      }),
    });

    logger.info(
      `[Investigator] 🤖 Action autonome ${escalatedAction} exécutée sur ${userId} (raison: ${reasoning.slice(0, 100)})`,
    );
    return true;
  } catch (error) {
    logger.error(
      `[Investigator] Échec exécution autonome ${escalatedAction} pour ${userId}: ${error instanceof Error ? error.message : String(error)}`,
    );
    return false;
  }
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
  aiDecision: AIDecision | null = null,
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

  // Section décision IA
  if (aiDecision) {
    lines.push("## Décision de l'Agent IA");
    lines.push("");
    lines.push(`- **Action recommandée:** ${aiDecision.action}`);
    lines.push(`- **Confiance:** ${aiDecision.confidence}%`);
    lines.push(`- **Justification:** ${aiDecision.reasoning}`);
    lines.push("");
  }

  // Conclusion
  lines.push("## Conclusion");
  lines.push("");
  const totalFound = osintResults.filter((r) => r.success).length;
  lines.push(`- **Recherches OSINT:** ${osintResults.length} effectuées, ${totalFound} réussies`);
  lines.push(`- **Niveau de menace:** ${profile.riskLevel} (score: ${profile.riskScore})`);
  if (aiDecision) {
    lines.push(`- **Décision IA:** ${aiDecision.action} (${aiDecision.confidence}% confiance)`);
  } else {
    lines.push(`- **Recommandation:** ${getRecommendation(profile, osintResults, discordIntel)}`);
  }
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

  // 3.5. Exécution autonome si activée et confiance suffisante
  if (
    report.aiDecision &&
    config.autonomousAgentMode === "autonomous" &&
    report.aiDecision.confidence >= config.autonomousAgentConfidenceThreshold &&
    report.aiDecision.action !== "IGNORE" &&
    report.aiDecision.action !== "WATCH"
  ) {
    logger.info(
      `[Investigator] 🤖 Mode autonome — exécution de ${report.aiDecision.action} (${report.aiDecision.confidence}% confiance)`,
    );
    const executed = await autoExecuteAction(
      report.aiDecision.action,
      report.userId,
      report.guildId,
      client,
      report.aiDecision.reasoning,
      profile,
    );
    if (executed) {
      try {
        await createLog({
          type: `AUTONOMOUS_EXECUTED`,
          action: `Action ${report.aiDecision.action} exécutée automatiquement (${report.aiDecision.confidence}% confiance)`,
          userId: report.userId,
          targetId: report.guildId,
          details: JSON.stringify({
            reportId: report.reportId,
            action: report.aiDecision.action,
            confidence: report.aiDecision.confidence,
            reasoning: report.aiDecision.reasoning,
          }),
        });
      } catch {
        // Non-critique
      }
    }
  } else if (report.aiDecision && config.autonomousAgentMode === "autonomous") {
    logger.info(
      `[Investigator] 🤖 Mode autonome — action ${report.aiDecision.action} non exécutée (confiance ${report.aiDecision.confidence}% < seuil ${config.autonomousAgentConfidenceThreshold}% ou action non-exécutable)`,
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

export function extractUsername(intel: MemberIntel | null, _userId: string): string | null {
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

  const embed = new EmbedBuilder()
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

  if (report.aiDecision) {
    embed.addFields(
      {
        name: "🤖 Décision IA",
        value: `**${report.aiDecision.action}** (${report.aiDecision.confidence}% confiance)`,
        inline: true,
      },
      {
        name: "Justification IA",
        value: report.aiDecision.reasoning.slice(0, 1024),
        inline: false,
      },
    );
  }

  return embed;
}
