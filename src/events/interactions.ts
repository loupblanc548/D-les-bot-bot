import {
  Client,
  ButtonInteraction,
  GuildMember,
  EmbedBuilder,
  PermissionFlagsBits,
} from "discord.js";
import prisma from "../prisma.js";
import logger from "../utils/logger.js";
import { createLog } from "../services/logs.js";
import { resolveAlert, type AlertAction } from "../services/alert-service.js";
import { recordSanction } from "../services/risk-engine.js";
import { undoNetworkBan, markFalsePositive, investigateAlert, handleApproval, handleRejection } from "../services/activeDefenseEngine.js";

// ============================================================
// Gestionnaire des boutons interactifs SOAR (Active Defense)
// ============================================================
export function handleSoarInteractions(client: Client): void {
  client.on("interactionCreate", async (interaction) => {
    if (!interaction.isButton()) return;

    const customId = interaction.customId;
    if (!customId.startsWith("soar_")) return;

    // Format: soar_ACTION_wazuhAlertId
    const parts = customId.split("_");
    if (parts.length < 3) return;

    const action = parts[1];
    const alertId = parts.slice(2).join("_");

    await interaction.deferReply({ ephemeral: true });

    try {
      switch (action) {
        case "approve": {
          await handleApproval(alertId);
          await interaction.editReply({ content: "⚔️ RiPOSTE APPROUVÉE — Exécution en cours..." });
          break;
        }

        case "reject": {
          await handleRejection(alertId);
          await interaction.editReply({ content: "❌ RiPOSTE REJETÉE — Incident marqué DISMISSED_BY_ADMIN." });
          break;
        }

        case "undo": {
          // Extract the banned IP from the incident
          const incident = await prisma.securityIncident.findUnique({
            where: { wazuhAlertId: alertId },
          }).catch(() => null);

          if (!incident) {
            await interaction.editReply({ content: "⚠️ Incident introuvable dans la base." });
            return;
          }

          // Parse IP from agentAssessment
          const ipMatch = incident.agentAssessment.match(/Source:\s*([\d.]+)/);
          const ip = ipMatch?.[1] ?? "";

          if (ip) {
            const undone = await undoNetworkBan(ip);
            if (undone) {
              await prisma.securityIncident.update({
                where: { wazuhAlertId: alertId },
                data: { status: "RESOLVED" },
              }).catch(() => {});
              await interaction.editReply({ content: `🔓 Rollback exécuté — IP ${ip} débannie.` });
            } else {
              await interaction.editReply({ content: `⚠️ Échec du rollback pour IP ${ip}.` });
            }
          } else {
            await interaction.editReply({ content: "⚠️ Aucune IP à débannir trouvée pour cet incident." });
          }
          break;
        }

        case "investigate": {
          const incident = await prisma.securityIncident.findUnique({
            where: { wazuhAlertId: alertId },
          }).catch(() => null);

          if (!incident) {
            await interaction.editReply({ content: "⚠️ Incident introuvable." });
            return;
          }

          const ipMatch = incident.agentAssessment.match(/Source:\s*([\d.]+)/);
          const ip = ipMatch?.[1];
          const investigation = await investigateAlert(alertId, ip);

          await interaction.editReply({
            content: `🔍 Investigation pour ${alertId}:\n\`\`\`\n${investigation.slice(0, 1800)}\n\`\`\``,
          });
          break;
        }

        case "falsepos": {
          await markFalsePositive(alertId);
          await interaction.editReply({
            content: `🟢 Alert ${alertId} marquée comme FALSE POSITIVE. Signature whitelisted.`,
          });
          break;
        }

        default:
          await interaction.editReply({ content: "Action SOAR inconnue." });
      }
    } catch (err) {
      logger.error(`[SOAR-Button] Error: ${err instanceof Error ? err.message : String(err)}`);
      await interaction.editReply({ content: "❌ Erreur lors du traitement de l'action SOAR." });
    }
  });
}

// ============================================================
// Gestionnaire des boutons interactifs d'alerte
// ============================================================
export function handleAlertInteractions(client: Client): void {
  client.on("interactionCreate", async (interaction) => {
    if (!interaction.isButton()) return;

    const customId = interaction.customId;
    if (!customId.startsWith("alert_")) return;

    // Format: alert_ACTION_alertId
    const parts = customId.split("_");
    if (parts.length < 3) return;

    const action = parts[1] as AlertAction;
    const alertId = parts.slice(2).join("_");

    await interaction.deferReply({ ephemeral: true });

    try {
      // Vérifier les permissions du modérateur
      const member = interaction.member as GuildMember | null;
      if (!member) {
        await interaction.editReply({
          content: "\u274C Impossible de v\u00E9rifier vos permissions.",
        });
        return;
      }

      const requiredPerms = getRequiredPermissions(action);
      if (requiredPerms && !member.permissions.has(requiredPerms)) {
        await interaction.editReply({
          content: `\u274C Permission insuffisante pour l'action **${action}**. Permission requise : \`${String(requiredPerms)}\``,
        });
        return;
      }

      // Résoudre l'alerte
      const alert = await resolveAlert(alertId, action, interaction.user.id);

      if (!alert) {
        await interaction.editReply({
          content: "\u274C Cette alerte n'est plus en attente ou n'existe pas.",
        });
        return;
      }

      // Exécuter l'action correspondante
      const actionResult = await executeAlertAction(
        action,
        alert.userId,
        alert.guildId,
        interaction,
        client,
      );

      // Mettre à jour l'embed original pour montrer la résolution
      try {
        const originalMessage = interaction.message;
        if (originalMessage) {
          const embed = EmbedBuilder.from(originalMessage.embeds[0] || {});
          embed.setColor(action === "IGNORE" ? 0x808080 : 0x53fc18);
          embed.setFooter({
            text: `R\u00E9solu par ${interaction.user.tag} \u2022 Action: ${action}`,
          });

          await originalMessage.edit({
            embeds: [embed],
            components: [], // Retirer les boutons
          });
        }
      } catch {}

      const responseText = actionResult
        ? `${actionResult}\n\n\u2705 Alerte r\u00E9solue.`
        : `\u2705 Alerte **${action}** trait\u00E9e avec succ\u00E8s.`;

      await interaction.editReply({ content: responseText });
    } catch (error) {
      logger.error(`[AlertInteraction] Erreur traitement alerte ${alertId}:`, error);
      try {
        await interaction.editReply({
          content: "\u274C Une erreur est survenue lors du traitement de l'alerte.",
        });
      } catch {}
    }
  });
}

// ============================================================
// Permissions requises par action
// ============================================================
function getRequiredPermissions(action: AlertAction): bigint | null {
  switch (action) {
    case "WARN":
    case "TIMEOUT":
      return PermissionFlagsBits.ModerateMembers;
    case "KICK":
      return PermissionFlagsBits.KickMembers;
    case "BAN":
      return PermissionFlagsBits.BanMembers;
    case "IGNORE":
    case "WATCH":
      return null; // Tout modérateur peut ignorer ou surveiller
    default:
      return PermissionFlagsBits.ModerateMembers;
  }
}

// ============================================================
// Exécution de l'action correspondante
// ============================================================
async function executeAlertAction(
  action: AlertAction,
  userId: string,
  guildId: string,
  interaction: ButtonInteraction,
  client: Client,
): Promise<string | null> {
  const guild = client.guilds.cache.get(guildId);
  if (!guild) return null;

  switch (action) {
    case "IGNORE":
      return "\u274C Alerte ignor\u00E9e.";

    case "WATCH": {
      await createLog({
        type: "ALERT_ACTION",
        action: `Utilisateur plac\u00E9 sous surveillance`,
        userId,
        moderator: interaction.user.id,
        details: `Action depuis alerte`,
      });
      return "\u2139 Utilisateur ajout\u00E9 \u00E0 la liste de surveillance.";
    }

    case "WARN": {
      await executeWarn(userId, guildId, interaction);
      await recordSanction(userId, guildId, "WARN");
      return "\u26A0 Avertissement envoy\u00E9 et enregistr\u00E9.";
    }

    case "TIMEOUT": {
      await executeTimeout(userId, guildId, interaction);
      await recordSanction(userId, guildId, "TIMEOUT");
      return "\u23F0 Timeout de 1 heure appliqu\u00E9.";
    }

    case "KICK": {
      await executeKick(userId, guildId, interaction);
      await recordSanction(userId, guildId, "KICK");
      return "\uD83D\uDCE6 Membre expuls\u00E9.";
    }

    case "BAN": {
      await executeBan(userId, guildId, interaction);
      await recordSanction(userId, guildId, "BAN");
      return "\uD83D\uDEA8 Membre banni.";
    }

    default:
      return null;
  }
}

async function executeWarn(userId: string, guildId: string, interaction: ButtonInteraction) {
  await prisma.sanction.create({
    data: {
      guildId,
      userId,
      moderatorId: interaction.user.id,
      type: "WARN",
      reason: "Avertissement depuis alerte de mod\u00E9ration",
    },
  });

  await createLog({
    type: "WARN",
    action: "Avertissement depuis alerte",
    userId,
    moderator: interaction.user.id,
    details: "Warn via bouton d'alerte",
  });
}

async function executeTimeout(userId: string, guildId: string, interaction: ButtonInteraction) {
  const guild = interaction.guild;
  if (!guild) return;

  const member = await guild.members.fetch(userId).catch(() => null);
  if (member) {
    await member.timeout(60 * 60 * 1000, "Timeout depuis alerte de mod\u00E9ration");
  }

  await createLog({
    type: "TIMEOUT",
    action: "Timeout 1h depuis alerte",
    userId,
    moderator: interaction.user.id,
    details: "Timeout via bouton d'alerte",
  });
}

async function executeKick(userId: string, guildId: string, interaction: ButtonInteraction) {
  const guild = interaction.guild;
  if (!guild) return;

  const member = await guild.members.fetch(userId).catch(() => null);
  if (member) {
    await member.kick("Expulsion depuis alerte de mod\u00E9ration");
  }

  await createLog({
    type: "KICK",
    action: "Expulsion depuis alerte",
    userId,
    moderator: interaction.user.id,
    details: "Kick via bouton d'alerte",
  });
}

async function executeBan(userId: string, guildId: string, interaction: ButtonInteraction) {
  const guild = interaction.guild;
  if (!guild) return;

  await guild.members.ban(userId, {
    reason: "Bannissement depuis alerte de mod\u00E9ration",
    deleteMessageSeconds: 7 * 86400,
  });

  await createLog({
    type: "BAN",
    action: "Bannissement depuis alerte",
    userId,
    moderator: interaction.user.id,
    details: "Ban via bouton d'alerte",
  });
}

// ============================================================
// Gestionnaire des boutons Kali Linux Audit (Layer 7)
// ============================================================
export function handleKaliInteractions(client: Client): void {
  client.on("interactionCreate", async (interaction) => {
    if (!interaction.isButton()) return;

    const customId = interaction.customId;
    if (!customId.startsWith("kali_")) return;

    const parts = customId.split("_");
    if (parts.length < 3) return;

    const action = parts[1]; // "approve" or "reject"
    const auditId = parts.slice(2).join("_");

    await interaction.deferReply({ ephemeral: true });

    try {
      const { handleKaliApprove, handleKaliReject } = await import("../services/agentToolsKali.js");

      switch (action) {
        case "approve": {
          await handleKaliApprove(auditId);
          await interaction.editReply({ content: "🟢 Audit Kali APPROUVÉ — Lancement en cours..." });
          break;
        }
        case "reject": {
          await handleKaliReject(auditId);
          await interaction.editReply({ content: "❌ Audit Kali ANNULÉ." });
          break;
        }
        default:
          await interaction.editReply({ content: "Action Kali inconnue." });
      }
    } catch (err) {
      logger.error(`[Kali-Button] Error: ${err instanceof Error ? err.message : String(err)}`);
      await interaction.editReply({ content: "❌ Erreur lors du traitement de l'action Kali." });
    }
  });
}

// ============================================================
// Gestionnaire des boutons VPS Maintenance (Layer 10)
// ============================================================
export function handleVpsMaintenanceInteractions(client: Client): void {
  client.on("interactionCreate", async (interaction) => {
    if (!interaction.isButton()) return;

    const customId = interaction.customId;
    if (!customId.startsWith("vps_")) return;

    await interaction.deferReply({ ephemeral: true });

    try {
      const { purgeOldLogs, pruneDockerCache } = await import("../services/vpsMaintenance.js");

      switch (customId) {
        case "vps_purge_logs": {
          const result = await purgeOldLogs(14);
          await interaction.editReply({
            content: result.success
              ? `🧹 ${result.message}`
              : `❌ ${result.message}`,
          });
          break;
        }
        case "vps_prune_docker": {
          const result = await pruneDockerCache();
          await interaction.editReply({
            content: result.success
              ? `🐳 ${result.message}`
              : `❌ ${result.message}`,
          });
          break;
        }
        default:
          await interaction.editReply({ content: "Action VPS inconnue." });
      }
    } catch (err) {
      logger.error(`[VPS-Button] Error: ${err instanceof Error ? err.message : String(err)}`);
      await interaction.editReply({ content: "❌ Erreur lors du traitement de l'action VPS." });
    }
  });
}

// ============================================================
// Gestionnaire des boutons Git-Healer (Layer 6.3)
// ============================================================
export function handleGitHealerInteractions(client: Client): void {
  client.on("interactionCreate", async (interaction) => {
    if (!interaction.isButton()) return;

    const customId = interaction.customId;
    if (!customId.startsWith("git_")) return;

    const parts = customId.split("_");
    if (parts.length < 3) return;

    const action = parts[1]; // "merge" or "reject"
    const issueNumber = parts[2];

    await interaction.deferReply({ ephemeral: true });

    try {
      const { handleGitMerge, handleGitReject } = await import("../services/gitAutoHealer.js");

      switch (action) {
        case "merge": {
          const branchName = parts.slice(3).join("_");
          const result = await handleGitMerge(issueNumber, branchName);
          await interaction.editReply({ content: result });
          break;
        }
        case "reject": {
          const result = await handleGitReject(issueNumber);
          await interaction.editReply({ content: result });
          break;
        }
        default:
          await interaction.editReply({ content: "Action Git-Healer inconnue." });
      }
    } catch (err) {
      logger.error(`[Git-Healer-Button] Error: ${err instanceof Error ? err.message : String(err)}`);
      await interaction.editReply({ content: "❌ Erreur lors du traitement de l'action Git-Healer." });
    }
  });
}
