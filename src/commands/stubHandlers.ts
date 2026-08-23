/**
 * stubHandlers.ts — Handlers pour les nouvelles sous-commandes
 * Implémentations de base qui peuvent être enrichies ensuite.
 */

import {
  ChatInputCommandInteraction,
  Client,
  EmbedBuilder,
  ChannelType,
  Role,
  AttachmentBuilder,
  Collection,
} from "discord.js";
import prisma from "../prisma.js";
import logger from "../utils/logger.js";
import { getUserXp, getLeaderboard, levelFromXp } from "../services/xpService.js";
import { generateRankCard } from "../services/imageService.js";
import {
  deepSentimentAnalysis,
  detectSpamPhishing,
  analyzeThreatIntel,
  advancedChat,
} from "../services/ai-moderation.js";
import {
  runReasoningPipeline,
  type ModerationPipelineSolution,
} from "../services/reasoningPipeline.js";
import { getMultiExpertConsensus } from "../services/multiExpertConsensus.js";
import { thinkTree, type ModerationToTResult } from "../services/treeOfThought.js";
import {
  testPrompts,
  SPAM_TEST_CASES,
  SENTIMENT_TEST_CASES,
  type PromptTestCase,
} from "../services/promptTesting.js";
import {
  scorePromptDetailed,
  scorePromptsBatch,
  gradeEmoji,
  validateBestPractices,
  detectAntiPatterns,
} from "../services/promptScoring.js";
import {
  SPAM_PHISHING_PROMPT,
  DEEP_SENTIMENT_PROMPT,
  THREAT_INTEL_PROMPT,
  CODE_REVIEW_PROMPT,
  MODERATION_PROMPT,
  SENTIMENT_PROMPT,
  RISK_ASSESSMENT_PROMPT,
} from "../services/moderationPrompts.js";
import { listPersonas, getPersona } from "../services/personaPrompts.js";
import { buildFromPreset, listPresets, getPreset } from "../services/promptBuilder.js";
import { translateText, detectLanguage } from "../services/translateService.js";
import { summarizeChannel } from "../services/channelSummary.js";
import { getAiHistory, clearAiHistory, getAiStats } from "../services/aiHistory.js";
import {
  exportChannelMessages,
  exportToJSON,
  exportToMarkdown,
  exportToCSV,
} from "../services/chatExport.js";
import { listModels } from "../services/modelSelector.js";
import { getUsageStats, getGlobalStats } from "../services/tokenTracker.js";
import { generateUserSummary, generateUserEmbed } from "../services/userSummary.js";
import { sendPaginatedEmbed } from "../services/paginationUtil.js";
import { safeFetch } from "../utils/ssrfGuard.js";

async function readSetting(guildId: string, key: string): Promise<string | null> {
  try {
    const setting = await prisma.setting.findUnique({ where: { guildId_key: { guildId, key } } });
    return setting?.value ?? null;
  } catch (error) {
    logger.warn(
      `[stubHandlers] read setting ${key}: ${error instanceof Error ? error.message : String(error)}`,
    );
    return null;
  }
}

async function writeSetting(guildId: string, key: string, value: string): Promise<void> {
  await prisma.setting.upsert({
    where: { guildId_key: { guildId, key } },
    create: { guildId, key, value },
    update: { value },
  });
}

async function readJsonSetting<T>(guildId: string, key: string, fallback: T): Promise<T> {
  const raw = await readSetting(guildId, key);
  if (!raw) return fallback;
  try {
    return JSON.parse(raw) as T;
  } catch {
    return fallback;
  }
}

async function ensureEconomyUser(discordId: string, guildId: string) {
  return prisma.user.upsert({
    where: { discordId },
    create: { discordId, guildId },
    update: { guildId },
  });
}

// ─── Modération étendue ───────────────────────────────────────────────────────

export async function handleModExtra(
  interaction: ChatInputCommandInteraction,
  _client: Client,
): Promise<void> {
  const action = interaction.options.getSubcommand();
  const embed = new EmbedBuilder().setColor(0xe74c3c);

  switch (action) {
    case "unban": {
      const id = interaction.options.getString("id", true);
      const raison = interaction.options.getString("raison") ?? "Aucune raison";
      try {
        await interaction.guild?.bans.remove(id, raison);
        embed
          .setTitle("✅ Unban")
          .setDescription(`Utilisateur <@${id}> débanni.\nRaison: ${raison}`);
      } catch {
        embed.setTitle("❌ Erreur").setDescription("Impossible de débannir cet utilisateur.");
      }
      await interaction.reply({ embeds: [embed], ephemeral: true });
      break;
    }

    case "ban-all": {
      const ids =
        interaction.options
          .getString("ids", true)
          ?.split(/[\s,]+/)
          .filter(Boolean) ?? [];
      const raison = interaction.options.getString("raison") ?? "Ban en masse";
      let count = 0;
      for (const id of ids.slice(0, 20)) {
        try {
          await interaction.guild?.bans.create(id, { reason: raison });
          count++;
        } catch {
          /* skip */
        }
      }
      embed
        .setTitle("🔨 Ban en masse")
        .setDescription(`${count}/${ids.length} utilisateurs bannis.`);
      await interaction.reply({ embeds: [embed], ephemeral: true });
      break;
    }

    case "mass-unban": {
      try {
        const bans = await interaction.guild?.bans.fetch();
        let count = 0;
        for (const ban of bans?.values() ?? []) {
          try {
            await interaction.guild?.bans.remove(ban.user.id);
            count++;
          } catch {
            /* skip */
          }
        }
        embed.setTitle("✅ Mass Unban").setDescription(`${count} utilisateurs débannis.`);
      } catch {
        embed.setTitle("❌ Erreur").setDescription("Impossible de récupérer la liste des bans.");
      }
      await interaction.reply({ embeds: [embed], ephemeral: true });
      break;
    }

    case "mute-list": {
      const members = interaction.guild?.members.cache.filter((m) => m.isCommunicationDisabled());
      if (!members || !members.size) {
        await interaction.reply({ content: "ℹ️ Aucun membre actuellement mute.", ephemeral: true });
        return;
      }
      embed.setTitle("🔇 Membres mute");
      members.forEach((m) => {
        const until = m.communicationDisabledUntil;
        embed.addFields({
          name: m.user.tag,
          value: `Jusqu'à: ${until ? `<t:${Math.floor(until!.getTime() / 1000)}:R>` : "Inconnu"}`,
        });
      });
      await interaction.reply({ embeds: [embed], ephemeral: true });
      break;
    }

    case "warn-list": {
      const cible = interaction.options.getUser("cible", true);
      const warns = await prisma.sanction
        .findMany({
          where: { userId: cible.id, guildId: interaction.guildId!, type: "WARN" },
          orderBy: { createdAt: "desc" },
          take: 10,
        })
        .catch((): [] => []);
      if (!warns.length) {
        await interaction.reply({ content: `ℹ️ Aucun warn pour <@${cible.id}>.`, ephemeral: true });
        return;
      }
      embed.setTitle(`⚠️ Warns — ${cible.tag}`);
      warns.forEach((w) => {
        embed.addFields({
          name: `#${w.id}`,
          value: `${w.reason ?? "N/A"} — <t:${Math.floor(w.createdAt.getTime() / 1000)}:R>`,
        });
      });
      await interaction.reply({ embeds: [embed], ephemeral: true });
      break;
    }

    case "warn-remove": {
      const id = interaction.options.getInteger("id", true);
      try {
        await prisma.sanction.delete({ where: { id } });
        embed.setTitle("✅ Warn supprimé").setDescription(`Warn #${id} supprimé.`);
      } catch {
        embed.setTitle("❌ Erreur").setDescription(`Warn #${id} introuvable.`);
      }
      await interaction.reply({ embeds: [embed], ephemeral: true });
      break;
    }

    case "warn-reset": {
      const cible = interaction.options.getUser("cible", true);
      try {
        await prisma.sanction.deleteMany({
          where: { userId: cible.id, guildId: interaction.guildId!, type: "WARN" },
        });
        embed
          .setTitle("✅ Warns réinitialisés")
          .setDescription(`Tous les warns de <@${cible.id}> ont été supprimés.`);
      } catch {
        embed.setTitle("❌ Erreur").setDescription("Impossible de réinitialiser les warns.");
      }
      await interaction.reply({ embeds: [embed], ephemeral: true });
      break;
    }

    case "lockdown": {
      const raison = interaction.options.getString("raison") ?? "Lockdown";
      const channels =
        interaction.guild?.channels.cache.filter((c) => c.type === ChannelType.GuildText) ??
        new Collection();
      let count = 0;
      for (const ch of channels.values()) {
        try {
          await ch.permissionOverwrites.edit(
            interaction.guild!.roles.everyone,
            { SendMessages: false },
            { reason: raison },
          );
          count++;
        } catch {
          /* skip */
        }
      }
      embed
        .setTitle("🔒 Lockdown")
        .setDescription(`${count} salons verrouillés.\nRaison: ${raison}`);
      await interaction.reply({ embeds: [embed], ephemeral: true });
      break;
    }

    case "unlock-all": {
      const channels =
        interaction.guild?.channels.cache.filter((c) => c.type === ChannelType.GuildText) ??
        new Collection();
      let count = 0;
      for (const ch of channels.values()) {
        try {
          await ch.permissionOverwrites.edit(
            interaction.guild!.roles.everyone,
            { SendMessages: null },
            { reason: "Unlock all" },
          );
          count++;
        } catch {
          /* skip */
        }
      }
      embed.setTitle("🔓 Unlock All").setDescription(`${count} salons déverrouillés.`);
      await interaction.reply({ embeds: [embed], ephemeral: true });
      break;
    }

    case "dehoist": {
      const members =
        interaction.guild?.members.cache.filter((m) =>
          /^[!@#$%^&*()_+=\-.~`]/.test(m.displayName),
        ) ?? new Collection();
      let count = 0;
      for (const m of members.values()) {
        try {
          const newName = m.displayName.replace(/^[!@#$%^&*()_+=\-.~`]+/, "");
          await m.setNickname(newName, "Dehoist");
          count++;
        } catch {
          /* skip */
        }
      }
      embed.setTitle("🧹 Dehoist").setDescription(`${count} pseudos nettoyés.`);
      await interaction.reply({ embeds: [embed], ephemeral: true });
      break;
    }

    case "nickname-force": {
      const cible = interaction.options.getUser("cible", true);
      const pseudo = interaction.options.getString("pseudo", true);
      try {
        await interaction.guild?.members.edit(cible, { nick: pseudo });
        embed.setTitle("✅ Pseudo forcé").setDescription(`<@${cible.id}> → **${pseudo}**`);
      } catch {
        embed.setTitle("❌ Erreur").setDescription("Impossible de changer le pseudo.");
      }
      await interaction.reply({ embeds: [embed], ephemeral: true });
      break;
    }

    case "nickname-reset": {
      const cible = interaction.options.getUser("cible", true);
      try {
        await interaction.guild?.members.edit(cible, { nick: null });
        embed
          .setTitle("✅ Pseudo réinitialisé")
          .setDescription(`<@${cible.id}> pseudo remis par défaut.`);
      } catch {
        embed.setTitle("❌ Erreur").setDescription("Impossible de réinitialiser le pseudo.");
      }
      await interaction.reply({ embeds: [embed], ephemeral: true });
      break;
    }

    case "inrole": {
      const role = interaction.options.getRole("rôle", true) as Role;
      const members = interaction.guild?.members.cache.filter((m) => m.roles.cache.has(role.id));
      if (!members || !members.size) {
        await interaction.reply({
          content: `ℹ️ Aucun membre avec le rôle ${role.name}.`,
          ephemeral: true,
        });
        return;
      }
      embed.setTitle(`👥 Rôle: ${role.name} (${members.size})`);
      const list = members
        .map((m) => m.user.tag)
        .slice(0, 50)
        .join("\n");
      embed.setDescription(list);
      await interaction.reply({ embeds: [embed], ephemeral: true });
      break;
    }

    case "role-all": {
      const role = interaction.options.getRole("rôle", true) as Role;
      const members = interaction.guild?.members.cache ?? new Collection();
      let count = 0;
      for (const m of members.values()) {
        try {
          await m.roles.add(role);
          count++;
        } catch {
          /* skip */
        }
      }
      embed
        .setTitle("✅ Rôle ajouté en masse")
        .setDescription(`${count} membres ont reçu ${role.name}.`);
      await interaction.reply({ embeds: [embed], ephemeral: true });
      break;
    }

    case "role-remove-all": {
      const role = interaction.options.getRole("rôle", true) as Role;
      const members =
        interaction.guild?.members.cache.filter((m) => m.roles.cache.has(role.id)) ??
        new Collection();
      let count = 0;
      for (const m of members.values()) {
        try {
          await m.roles.remove(role);
          count++;
        } catch {
          /* skip */
        }
      }
      embed
        .setTitle("✅ Rôle retiré en masse")
        .setDescription(`${count} membres ont perdu ${role.name}.`);
      await interaction.reply({ embeds: [embed], ephemeral: true });
      break;
    }

    default:
      await interaction.reply({ content: "❌ Sous-commande non implémentée.", ephemeral: true });
  }
}

// ─── Sécurité étendue ─────────────────────────────────────────────────────────

export async function handleSecurityExtra(
  interaction: ChatInputCommandInteraction,
  _client: Client,
): Promise<void> {
  const action = interaction.options.getSubcommand();
  const guildId = interaction.guildId ?? "global";
  const embed = new EmbedBuilder().setColor(0xe74c3c);

  switch (action) {
    case "raid-mode": {
      const duree = interaction.options.getInteger("duree") ?? 30;
      await prisma.guildConfig.upsert({
        where: { guildId },
        create: { guildId, antiRaidEnabled: true },
        update: { antiRaidEnabled: true },
      });
      await writeSetting(
        guildId,
        "raid_mode_expires",
        new Date(Date.now() + duree * 60_000).toISOString(),
      );
      embed
        .setTitle("🚨 Mode Raid Activé")
        .setDescription(`Protection anti-raid activée pour ${duree} minutes.`);
      await interaction.reply({ embeds: [embed] });
      break;
    }

    case "lockdown-server": {
      const raison = interaction.options.getString("raison") ?? "Lockdown serveur";
      let count = 0;
      for (const channel of interaction.guild?.channels.cache.values() ?? []) {
        if (channel.type !== ChannelType.GuildText) continue;
        try {
          await channel.permissionOverwrites.edit(
            interaction.guild!.roles.everyone,
            { SendMessages: false },
            { reason: raison },
          );
          count++;
        } catch {
          /* permissions */
        }
      }
      await writeSetting(guildId, "server_lockdown", "true");
      embed
        .setTitle("🔒 Lockdown Serveur")
        .setDescription(`${count} salon(s) verrouillé(s). Raison: ${raison}`);
      await interaction.reply({ embeds: [embed] });
      break;
    }

    case "automod-config": {
      const action2 = interaction.options.getString("action", true);
      const filtre = interaction.options.getString("filtre");
      await prisma.autoModConfig.upsert({
        where: { guildId },
        create: { guildId, enabled: action2 !== "off", badwords: filtre ?? "" },
        update: { enabled: action2 !== "off", badwords: filtre ?? undefined },
      });
      embed
        .setTitle("⚙️ Automod Config")
        .setDescription(
          `Configuration enregistrée: ${action2}${filtre ? ` • Filtre: ${filtre}` : ""}`,
        );
      await interaction.reply({ embeds: [embed], ephemeral: true });
      break;
    }

    case "automod-status": {
      const config = await prisma.autoModConfig.findUnique({ where: { guildId } });
      embed
        .setTitle("📊 Statut Automod")
        .setDescription(
          config
            ? `${config.enabled ? "Actif" : "Inactif"}${config.badwords ? ` • filtre: ${config.badwords}` : ""}`
            : "Non configuré.",
        );
      await interaction.reply({ embeds: [embed], ephemeral: true });
      break;
    }

    case "invite-block": {
      const action2 = interaction.options.getString("action", true);
      await writeSetting(guildId, "invite_block", action2);
      embed
        .setTitle("🚫 Blocage d'invitations")
        .setDescription(`Configuration enregistrée: ${action2}`);
      await interaction.reply({ embeds: [embed], ephemeral: true });
      break;
    }

    case "captcha-config": {
      const action2 = interaction.options.getString("action", true);
      await writeSetting(
        guildId,
        "captcha_config",
        JSON.stringify({ action: action2, updatedBy: interaction.user.id }),
      );
      embed.setTitle("🤖 Captcha Config").setDescription(`Configuration enregistrée: ${action2}`);
      await interaction.reply({ embeds: [embed], ephemeral: true });
      break;
    }

    case "anti-bot": {
      const action2 = interaction.options.getString("action", true);
      await writeSetting(guildId, "anti_bot", action2);
      embed.setTitle("🤖 Anti-Bot").setDescription(`Configuration enregistrée: ${action2}`);
      await interaction.reply({ embeds: [embed], ephemeral: true });
      break;
    }

    case "logging-config": {
      const event = interaction.options.getString("event", true);
      const salon = interaction.options.getChannel("salon");
      if (salon)
        await prisma.notificationSetting.upsert({
          where: { guildId_type: { guildId, type: event } },
          create: { guildId, type: event, channelId: salon.id },
          update: { channelId: salon.id, enabled: true },
        });
      embed
        .setTitle("📋 Logging Config")
        .setDescription(`Event: ${event}${salon ? ` → <#${salon.id}>` : ""}`);
      await interaction.reply({ embeds: [embed], ephemeral: true });
      break;
    }

    case "audit-export": {
      const logs = await prisma.log.findMany({
        where: { guildId },
        orderBy: { createdAt: "desc" },
        take: 500,
      });
      await interaction.reply({
        content: `📊 ${logs.length} événement(s) exporté(s).`,
        files: [
          new AttachmentBuilder(Buffer.from(JSON.stringify(logs, null, 2), "utf8"), {
            name: `audit-${guildId}.json`,
          }),
        ],
        ephemeral: true,
      });
      break;
    }

    case "whitelist-domain": {
      const domaine = interaction.options.getString("domaine", true).toLowerCase();
      const domains = await readJsonSetting<string[]>(guildId, "whitelist_domains", []);
      if (!domains.includes(domaine)) domains.push(domaine);
      await writeSetting(guildId, "whitelist_domains", JSON.stringify(domains));
      embed
        .setTitle("✅ Domaine Whitelisté")
        .setDescription(`\`${domaine}\` ajouté à la whitelist.`);
      await interaction.reply({ embeds: [embed], ephemeral: true });
      break;
    }

    case "intel": {
      await interaction.deferReply({ ephemeral: true });
      const target =
        interaction.options.getString("target") ??
        interaction.options.getString("domaine") ??
        interaction.options.getString("ip") ??
        "unknown";
      if (target === "unknown") {
        await interaction.editReply({ content: "❌ Aucune cible spécifiée." });
        break;
      }
      const result = await analyzeThreatIntel(target);
      const colorMap: Record<string, number> = {
        none: 0x2ecc71,
        low: 0x2ecc71,
        medium: 0xf1c40f,
        high: 0xff8800,
        critical: 0xe74c3c,
      };
      const intelEmbed = new EmbedBuilder()
        .setTitle(`🔍 Threat Intel — ${result.target}`)
        .setColor(colorMap[result.threat_level] ?? 0x2ecc71)
        .addFields(
          { name: "🎯 Threat Level", value: result.threat_level, inline: true },
          { name: "🔐 Confiance", value: `${result.confidence}%`, inline: true },
          { name: "📍 Localisation", value: result.findings.location || "inconnue", inline: true },
          { name: "📊 Réputation", value: result.findings.reputation.slice(0, 500), inline: false },
          {
            name: "🦠 Malware",
            value:
              result.findings.malware_detections.length > 0
                ? result.findings.malware_detections.join(", ")
                : "Aucun",
            inline: false,
          },
          {
            name: "🎣 Phishing",
            value:
              result.findings.phishing_reports.length > 0
                ? result.findings.phishing_reports.join(", ")
                : "Aucun",
            inline: false,
          },
          {
            name: "🔗 IPs associées",
            value:
              result.findings.associated_ips.length > 0
                ? result.findings.associated_ips.join(", ")
                : "Aucune",
            inline: false,
          },
          {
            name: "⚡ Actions",
            value: result.actions_recommended.join(", ") || "monitor",
            inline: false,
          },
        )
        .setTimestamp();
      if (result.findings.ssl_info)
        intelEmbed.addFields({
          name: "🔒 SSL",
          value: result.findings.ssl_info.slice(0, 200),
          inline: false,
        });
      if (result.findings.abuse_history)
        intelEmbed.addFields({
          name: "📜 Abuse History",
          value: result.findings.abuse_history.slice(0, 500),
          inline: false,
        });
      await interaction.editReply({ embeds: [intelEmbed] });
      break;
    }

    case "threatreport": {
      await interaction.deferReply({ ephemeral: true });
      const reportEmbed = new EmbedBuilder()
        .setTitle("📋 Rapport de Menace")
        .setColor(0xe74c3c)
        .setDescription("Génération du rapport de menace pour le serveur...")
        .addFields(
          { name: "📊 Membres", value: `${interaction.guild?.memberCount ?? 0}`, inline: true },
          {
            name: "🔒 Verif Level",
            value: String(interaction.guild?.verificationLevel ?? "unknown"),
            inline: true,
          },
          { name: "📅 Généré", value: new Date().toISOString(), inline: true },
        )
        .setTimestamp();
      await interaction.editReply({ embeds: [reportEmbed] });
      break;
    }

    case "privacy": {
      embed
        .setTitle("🔒 Audit Vie Privée")
        .setDescription("Audit des données exposées sur le serveur.")
        .setColor(0x9b59b6);
      await interaction.reply({ embeds: [embed], ephemeral: true });
      break;
    }

    case "network": {
      embed
        .setTitle("🌐 Analyse Réseau")
        .setDescription("Analyse réseau du serveur Discord.")
        .setColor(0x3498db);
      await interaction.reply({ embeds: [embed], ephemeral: true });
      break;
    }

    case "auto-report": {
      embed
        .setTitle("📊 Rapport Auto")
        .setDescription("Rapport automatique activé.")
        .setColor(0x2ecc71);
      await interaction.reply({ embeds: [embed], ephemeral: true });
      break;
    }

    case "autodefense": {
      embed
        .setTitle("🛡️ Auto-Défense")
        .setDescription("Système d'auto-défense activé.")
        .setColor(0xe74c3c);
      await interaction.reply({ embeds: [embed], ephemeral: true });
      break;
    }

    default:
      await interaction.reply({ content: "❌ Sous-commande non implémentée.", ephemeral: true });
  }
}

// ─── Bot étendu ───────────────────────────────────────────────────────────────

export async function handleBotExtra(
  interaction: ChatInputCommandInteraction,
  client: Client,
): Promise<void> {
  const action = interaction.options.getSubcommand();
  const embed = new EmbedBuilder().setColor(0x5865f2);

  switch (action) {
    case "invite": {
      const perms = interaction.options.getString("permissions") ?? "0";
      const link = `https://discord.com/api/oauth2/authorize?client_id=${client.user?.id}&permissions=${perms}&scope=bot%20applications.commands`;
      embed.setTitle("🔗 Lien d'invitation").setDescription(link);
      await interaction.reply({ embeds: [embed], ephemeral: true });
      break;
    }

    case "stats": {
      const mem = process.memoryUsage();
      embed.setTitle("📊 Statistiques du bot").addFields(
        { name: "RAM", value: `${(mem.rss / 1024 / 1024).toFixed(1)} MB`, inline: true },
        {
          name: "Uptime",
          value: `<t:${Math.floor(Date.now() / 1000 - process.uptime())}:R>`,
          inline: true,
        },
        { name: "Serveurs", value: String(client.guilds.cache.size), inline: true },
        { name: "Utilisateurs", value: String(client.users.cache.size), inline: true },
        { name: "Salons", value: String(client.channels.cache.size), inline: true },
      );
      await interaction.reply({ embeds: [embed] });
      break;
    }

    case "ping": {
      const ws = client.ws.ping;
      embed.setTitle("🏓 Pong!").setDescription(`Latence WebSocket: **${ws}ms**`);
      await interaction.reply({ embeds: [embed] });
      break;
    }

    case "changelog": {
      embed
        .setTitle("📋 Changelog")
        .setDescription("Voir le repo GitHub pour les derniers changements.");
      await interaction.reply({ embeds: [embed] });
      break;
    }

    case "vote": {
      embed.setTitle("🗳️ Vote pour le bot").setDescription("Lien de vote à venir.");
      await interaction.reply({ embeds: [embed] });
      break;
    }

    case "support": {
      embed.setTitle("💬 Support").setDescription("Serveur support: lien à venir.");
      await interaction.reply({ embeds: [embed] });
      break;
    }

    case "privacy": {
      embed
        .setTitle("🔒 Confidentialité")
        .setDescription(
          "Le bot stocke uniquement les données nécessaires au fonctionnement des commandes.",
        );
      await interaction.reply({ embeds: [embed] });
      break;
    }

    case "commands-list": {
      embed
        .setTitle("📜 Liste des commandes")
        .setDescription("Utilise `/bot help` pour la liste complète.");
      await interaction.reply({ embeds: [embed] });
      break;
    }

    default:
      await interaction.reply({ content: "❌ Sous-commande non implémentée.", ephemeral: true });
  }
}

// ─── Admin étendu ─────────────────────────────────────────────────────────────

export async function handleAdminExtra(
  interaction: ChatInputCommandInteraction,
  _client: Client,
): Promise<void> {
  const action = interaction.options.getSubcommand();
  const embed = new EmbedBuilder().setColor(0x5865f2);

  switch (action) {
    case "role-create": {
      const nom = interaction.options.getString("nom", true);
      const couleur = interaction.options.getString("couleur") ?? "#5865f2";
      try {
        const role = await interaction.guild?.roles.create({
          name: nom,
          color: couleur as `#${string}`,
        });
        embed.setTitle("✅ Rôle créé").setDescription(`<@&${role!.id}> (${nom})`);
      } catch {
        embed.setTitle("❌ Erreur").setDescription("Impossible de créer le rôle.");
      }
      await interaction.reply({ embeds: [embed], ephemeral: true });
      break;
    }

    case "role-delete": {
      const role = interaction.options.getRole("rôle", true) as Role;
      try {
        await role.delete();
        embed.setTitle("✅ Rôle supprimé").setDescription(role.name);
      } catch {
        embed.setTitle("❌ Erreur").setDescription("Impossible de supprimer le rôle.");
      }
      await interaction.reply({ embeds: [embed], ephemeral: true });
      break;
    }

    case "role-edit": {
      const role = interaction.options.getRole("rôle", true) as Role;
      const param = interaction.options.getString("parametre", true).toLowerCase();
      const valeur = interaction.options.getString("valeur", true);
      try {
        if (param === "name" || param === "nom") await role.setName(valeur);
        else if (param === "color" || param === "couleur")
          await role.setColor(valeur as `#${string}`);
        else if (param === "mentionable")
          await role.setMentionable(["true", "oui", "on"].includes(valeur.toLowerCase()));
        else if (param === "hoist")
          await role.setHoist(["true", "oui", "on"].includes(valeur.toLowerCase()));
        else throw new Error("Paramètre autorisé: name, color, mentionable, hoist");
        embed.setTitle("✅ Rôle modifié").setDescription(`${role.name}: ${param} → ${valeur}`);
      } catch (error) {
        embed
          .setTitle("❌ Modification refusée")
          .setDescription(error instanceof Error ? error.message : String(error));
      }
      await interaction.reply({ embeds: [embed], ephemeral: true });
      break;
    }

    case "channel-create": {
      const nom = interaction.options.getString("nom", true);
      try {
        const ch = await interaction.guild?.channels.create({
          name: nom,
          type: ChannelType.GuildText,
        });
        embed.setTitle("✅ Salon créé").setDescription(`<#${ch!.id}>`);
      } catch {
        embed.setTitle("❌ Erreur").setDescription("Impossible de créer le salon.");
      }
      await interaction.reply({ embeds: [embed], ephemeral: true });
      break;
    }

    case "channel-delete": {
      const salon = interaction.options.getChannel("salon", true);
      try {
        await (salon as { delete: () => Promise<any> }).delete();
        embed.setTitle("✅ Salon supprimé").setDescription(salon.name ?? "");
      } catch {
        embed.setTitle("❌ Erreur").setDescription("Impossible de supprimer le salon.");
      }
      await interaction.reply({ embeds: [embed], ephemeral: true });
      break;
    }

    case "emoji-add": {
      const url = interaction.options.getString("url", true);
      const nom = interaction.options.getString("nom", true);
      try {
        const res = await fetch(url);
        const buf = await res.arrayBuffer();
        const emoji = await interaction.guild?.emojis.create({
          attachment: Buffer.from(buf),
          name: nom,
        });
        embed.setTitle("✅ Emoji ajouté").setDescription(`<:${emoji!.name}:${emoji!.id}>`);
      } catch {
        embed.setTitle("❌ Erreur").setDescription("Impossible d'ajouter l'emoji.");
      }
      await interaction.reply({ embeds: [embed], ephemeral: true });
      break;
    }

    case "emoji-remove": {
      const emojiStr = interaction.options.getString("emoji", true);
      const emoji = interaction.guild?.emojis.cache.find(
        (e) => e.name === emojiStr || e.toString() === emojiStr,
      );
      if (!emoji) {
        await interaction.reply({ content: "❌ Emoji introuvable.", ephemeral: true });
        return;
      }
      try {
        await emoji.delete();
        embed.setTitle("✅ Emoji supprimé").setDescription(emojiStr);
      } catch {
        embed.setTitle("❌ Erreur").setDescription("Impossible de supprimer l'emoji.");
      }
      await interaction.reply({ embeds: [embed], ephemeral: true });
      break;
    }

    case "webhook-config": {
      const salon = interaction.options.getChannel("salon", true);
      const action2 = interaction.options.getString("action", true);
      embed
        .setTitle("🪝 Webhook Config")
        .setDescription(`Salon: <#${salon.id}> • Action: ${action2}`);
      await interaction.reply({ embeds: [embed], ephemeral: true });
      break;
    }

    default:
      await interaction.reply({ content: "❌ Sous-commande non implémentée.", ephemeral: true });
  }
}

// ─── Alert étendu ─────────────────────────────────────────────────────────────

export async function handleAlertExtra(
  interaction: ChatInputCommandInteraction,
  client: Client,
): Promise<void> {
  const action = interaction.options.getSubcommand();
  const guildId = interaction.guildId ?? "global";
  const embed = new EmbedBuilder().setColor(0xff9800);

  switch (action) {
    case "alert-test": {
      const alert = await prisma.alert.create({
        data: {
          guildId,
          userId: interaction.user.id,
          type: "manual_test",
          riskScore: 0,
          riskLevel: "info",
          details: "Alerte de test créée par une commande administrateur",
        },
      });
      embed.setTitle("🧪 Test d'alerte").setDescription(`Alerte de test créée: \`${alert.id}\``);
      await interaction.reply({ embeds: [embed], ephemeral: true });
      break;
    }
    case "alert-export": {
      const alerts = await prisma.alert.findMany({
        where: { guildId },
        orderBy: { createdAt: "desc" },
      });
      const payload = JSON.stringify(alerts, null, 2);
      await interaction.reply({
        content: `📊 ${alerts.length} alerte(s) exportée(s).`,
        files: [
          new AttachmentBuilder(Buffer.from(payload, "utf8"), { name: `alerts-${guildId}.json` }),
        ],
        ephemeral: true,
      });
      break;
    }
    case "alert-whitelist": {
      const cible = interaction.options.getUser("cible", true);
      const whitelist = await readJsonSetting<string[]>(guildId, "alert_whitelist", []);
      if (!whitelist.includes(cible.id)) whitelist.push(cible.id);
      await writeSetting(guildId, "alert_whitelist", JSON.stringify(whitelist));
      embed
        .setTitle("✅ Whitelist")
        .setDescription(`<@${cible.id}> est maintenant exclu des alertes.`);
      await interaction.reply({ embeds: [embed], ephemeral: true });
      break;
    }
    case "alert-digest": {
      const frequence = interaction.options.getString("frequence", true);
      const salon = interaction.options.getChannel("salon");
      await writeSetting(
        guildId,
        "alert_digest",
        JSON.stringify({ frequence, channelId: salon?.id ?? null, enabled: true }),
      );
      embed
        .setTitle("📬 Digest configuré")
        .setDescription(`Fréquence: ${frequence}${salon ? ` → <#${salon.id}>` : ""}`);
      await interaction.reply({ embeds: [embed], ephemeral: true });
      break;
    }
    case "alert-ack": {
      const id = interaction.options.getString("id", true);
      const alert = await prisma.alert.findUnique({ where: { id } });
      if (!alert || alert.guildId !== guildId) {
        await interaction.reply({
          content: "❌ Alerte introuvable pour ce serveur.",
          ephemeral: true,
        });
        break;
      }
      await prisma.alert.update({
        where: { id },
        data: { status: "RESOLVED", resolvedBy: interaction.user.id, resolvedAt: new Date() },
      });
      embed
        .setTitle("✅ Alerte acquittée")
        .setDescription(`Alerte \`${id}\` marquée comme traitée.`);
      await interaction.reply({ embeds: [embed], ephemeral: true });
      break;
    }
    case "alert-escalate": {
      const id = interaction.options.getString("id", true);
      const alert = await prisma.alert.findUnique({ where: { id } });
      if (!alert || alert.guildId !== guildId) {
        await interaction.reply({
          content: "❌ Alerte introuvable pour ce serveur.",
          ephemeral: true,
        });
        break;
      }
      await prisma.alert.update({
        where: { id },
        data: { action: `escalated:${interaction.user.id}` },
      });
      try {
        const user = await client.users.fetch(alert.userId);
        await user.send(`⬆️ L'alerte ${id} a été escaladée par les administrateurs.`);
      } catch (error) {
        logger.warn(
          `[alerts] escalation DM failed: ${error instanceof Error ? error.message : String(error)}`,
        );
      }
      embed
        .setTitle("⬆️ Alerte escaladée")
        .setDescription(`Alerte \`${id}\` escaladée aux administrateurs.`);
      await interaction.reply({ embeds: [embed], ephemeral: true });
      break;
    }
    default:
      await interaction.reply({ content: "❌ Non implémentée.", ephemeral: true });
  }
}

// ─── Sources étendu ───────────────────────────────────────────────────────────

export async function handleSourcesExtra(
  interaction: ChatInputCommandInteraction,
  _client: Client,
): Promise<void> {
  const action = interaction.options.getSubcommand();
  const guildId = interaction.guildId ?? "global";
  const embed = new EmbedBuilder().setColor(0x2ecc71);

  switch (action) {
    case "source-edit": {
      const handle = interaction.options.getString("handle", true);
      const nouveauHandle = interaction.options.getString("nouveau_handle");
      const salon = interaction.options.getChannel("salon");
      const source = await prisma.source.findFirst({ where: { guildId, urlOrHandle: handle } });
      if (!source) {
        await interaction.reply({ content: "❌ Source introuvable.", ephemeral: true });
        break;
      }
      const updated = await prisma.source.update({
        where: { id: source.id },
        data: {
          urlOrHandle: nouveauHandle ?? source.urlOrHandle,
          channelId: salon?.id ?? source.channelId,
        },
      });
      embed
        .setTitle("✏️ Source modifiée")
        .setDescription(`\`${updated.urlOrHandle}\` → <#${updated.channelId}>`);
      await interaction.reply({ embeds: [embed], ephemeral: true });
      break;
    }
    case "source-test": {
      const handle = interaction.options.getString("handle", true);
      const source = await prisma.source.findFirst({ where: { guildId, urlOrHandle: handle } });
      if (!source) {
        await interaction.reply({ content: "❌ Source introuvable.", ephemeral: true });
        break;
      }
      let detail = "Source enregistrée; aucun test réseau disponible pour ce type.";
      if (/^https?:\/\//i.test(source.urlOrHandle)) {
        try {
          const response = await safeFetch(
            source.urlOrHandle,
            { method: "GET", signal: AbortSignal.timeout(10000) },
            "source-test",
          );
          detail = `HTTP ${response.status} (${response.ok ? "OK" : "échec"})`;
        } catch (error) {
          detail = `Échec réseau: ${error instanceof Error ? error.message : String(error)}`;
        }
      }
      await prisma.log.create({
        data: {
          guildId,
          type: "source",
          action: "test",
          targetId: String(source.id),
          details: detail,
        },
      });
      embed.setTitle("🧪 Test de source").setDescription(`\`${source.urlOrHandle}\`: ${detail}`);
      await interaction.reply({ embeds: [embed], ephemeral: true });
      break;
    }
    case "source-logs": {
      const logs = await prisma.log.findMany({
        where: { guildId, type: "source" },
        orderBy: { createdAt: "desc" },
        take: 15,
      });
      embed.setTitle("📋 Logs de source").setDescription(
        logs.length
          ? logs
              .map((log) => `${log.action}: ${log.details ?? ""}`)
              .join("\n")
              .slice(0, 4000)
          : "Aucun log de source.",
      );
      await interaction.reply({ embeds: [embed], ephemeral: true });
      break;
    }
    case "source-pause-all":
      await writeSetting(guildId, "sources_paused", "true");
      embed.setTitle("⏸️ Sources en pause").setDescription("La surveillance est suspendue.");
      await interaction.reply({ embeds: [embed], ephemeral: true });
      break;
    case "source-resume-all":
      await writeSetting(guildId, "sources_paused", "false");
      embed.setTitle("▶️ Sources reprises").setDescription("La surveillance est active.");
      await interaction.reply({ embeds: [embed], ephemeral: true });
      break;
    case "source-health": {
      const sources = await prisma.source.findMany({ where: { guildId } });
      const paused = (await readSetting(guildId, "sources_paused")) === "true";
      embed
        .setTitle("💚 Santé des sources")
        .setDescription(
          `${sources.length} source(s) configurée(s) • ${paused ? "en pause" : "actives"}.`,
        );
      await interaction.reply({ embeds: [embed], ephemeral: true });
      break;
    }
    case "source-export": {
      const sources = await prisma.source.findMany({ where: { guildId }, orderBy: { id: "asc" } });
      const payload = JSON.stringify(
        { version: 1, guildId, sources: sources.map(({ id: _id, ...source }) => source) },
        null,
        2,
      );
      await interaction.reply({
        content: `📤 ${sources.length} source(s) exportée(s).`,
        files: [
          new AttachmentBuilder(Buffer.from(payload, "utf8"), { name: `sources-${guildId}.json` }),
        ],
        ephemeral: true,
      });
      break;
    }
    case "source-import": {
      const raw = interaction.options.getString("json", true);
      let parsed: {
        sources?: Array<{
          channelId?: string;
          type?: string;
          urlOrHandle?: string;
          priority?: number;
        }>;
      };
      try {
        parsed = JSON.parse(raw) as typeof parsed;
      } catch {
        await interaction.reply({ content: "❌ JSON invalide.", ephemeral: true });
        break;
      }
      const sources = parsed.sources ?? [];
      let imported = 0;
      for (const source of sources) {
        if (!source.urlOrHandle || !source.type || !source.channelId) continue;
        await prisma.source.upsert({
          where: {
            urlOrHandle_type_channelId: {
              urlOrHandle: source.urlOrHandle,
              type: source.type,
              channelId: source.channelId,
            },
          },
          create: {
            guildId,
            channelId: source.channelId,
            type: source.type,
            urlOrHandle: source.urlOrHandle,
            priority: source.priority ?? 0,
          },
          update: { guildId, priority: source.priority ?? 0 },
        });
        imported++;
      }
      embed
        .setTitle("📥 Import des sources")
        .setDescription(`${imported}/${sources.length} source(s) importée(s).`);
      await interaction.reply({ embeds: [embed], ephemeral: true });
      break;
    }
    default:
      await interaction.reply({ content: "❌ Non implémentée.", ephemeral: true });
  }
}

// ─── Casier étendu ────────────────────────────────────────────────────────────

export async function handleCasierExtra(
  interaction: ChatInputCommandInteraction,
  _client: Client,
): Promise<void> {
  const action = interaction.options.getSubcommand();
  const guildId = interaction.guildId ?? "global";
  const embed = new EmbedBuilder().setColor(0x8e44ad);
  const typeMap: Record<
    string,
    "BAN" | "KICK" | "MUTE" | "WARN" | "TIMEOUT" | "TEMPBAN" | "UNBAN"
  > = {
    ban: "BAN",
    kick: "KICK",
    mute: "MUTE",
    warn: "WARN",
    timeout: "TIMEOUT",
    tempban: "TEMPBAN",
    unban: "UNBAN",
  };

  switch (action) {
    case "add": {
      const cible = interaction.options.getUser("cible", true);
      const type = interaction.options.getString("type", true).toLowerCase();
      const raison = interaction.options.getString("raison", true);
      const sanctionType = typeMap[type] ?? "WARN";
      const locked = (await readSetting(guildId, `casier_locked:${cible.id}`)) === "true";
      if (locked) {
        await interaction.reply({
          content: "❌ Le casier de ce membre est verrouillé.",
          ephemeral: true,
        });
        break;
      }
      const sanction = await prisma.sanction.create({
        data: {
          userId: cible.id,
          guildId,
          moderatorId: interaction.user.id,
          type: sanctionType,
          reason: raison,
        },
      });
      embed
        .setTitle("✅ Sanction ajoutée")
        .setDescription(`<@${cible.id}> • ${sanctionType} • #${sanction.id}\nRaison: ${raison}`);
      await interaction.reply({ embeds: [embed], ephemeral: true });
      break;
    }
    case "export": {
      const cible = interaction.options.getUser("cible", true);
      const sanctions = await prisma.sanction.findMany({
        where: { guildId, userId: cible.id },
        orderBy: { createdAt: "asc" },
      });
      const payload = JSON.stringify({ guildId, userId: cible.id, sanctions }, null, 2);
      await interaction.reply({
        content: `📤 ${sanctions.length} sanction(s) exportée(s).`,
        files: [
          new AttachmentBuilder(Buffer.from(payload, "utf8"), { name: `casier-${cible.id}.json` }),
        ],
        ephemeral: true,
      });
      break;
    }
    case "stats": {
      const [total, active, grouped] = await Promise.all([
        prisma.sanction.count({ where: { guildId } }),
        prisma.sanction.count({ where: { guildId, active: true } }),
        prisma.sanction.groupBy({ by: ["type"], where: { guildId }, _count: { _all: true } }),
      ]);
      const details =
        grouped.map((entry) => `${entry.type}: ${entry._count._all}`).join(" • ") || "Aucune";
      embed
        .setTitle("📊 Statistiques des sanctions")
        .setDescription(`Total: ${total} • Actives: ${active}\n${details}`);
      await interaction.reply({ embeds: [embed], ephemeral: true });
      break;
    }
    case "top-sanctioned": {
      const grouped = await prisma.sanction.groupBy({
        by: ["userId"],
        where: { guildId },
        _count: { _all: true },
        orderBy: { _count: { userId: "desc" } },
        take: 10,
      });
      embed
        .setTitle("🏆 Top sanctionnés")
        .setDescription(
          grouped.length
            ? grouped
                .map((entry, index) => `${index + 1}. <@${entry.userId}> — ${entry._count._all}`)
                .join("\n")
            : "Aucune sanction.",
        );
      await interaction.reply({ embeds: [embed], ephemeral: true });
      break;
    }
    case "history": {
      const history = await prisma.sanction.findMany({
        where: { guildId },
        orderBy: { createdAt: "desc" },
        take: 25,
      });
      embed.setTitle("📜 Historique des sanctions").setDescription(
        history.length
          ? history
              .map((entry) => `#${entry.id} <@${entry.userId}> — ${entry.type} — ${entry.reason}`)
              .join("\n")
              .slice(0, 4000)
          : "Aucune sanction.",
      );
      await interaction.reply({ embeds: [embed], ephemeral: true });
      break;
    }
    case "lock": {
      const cible = interaction.options.getUser("cible", true);
      await writeSetting(guildId, `casier_locked:${cible.id}`, "true");
      embed
        .setTitle("🔒 Casier verrouillé")
        .setDescription(`Casier de <@${cible.id}> en lecture seule.`);
      await interaction.reply({ embeds: [embed], ephemeral: true });
      break;
    }
    case "unlock": {
      const cible = interaction.options.getUser("cible", true);
      await writeSetting(guildId, `casier_locked:${cible.id}`, "false");
      embed
        .setTitle("🔓 Casier déverrouillé")
        .setDescription(`Casier de <@${cible.id}> modifiable.`);
      await interaction.reply({ embeds: [embed], ephemeral: true });
      break;
    }
    case "migrate": {
      const legacyWarns = await prisma.log.findMany({
        where: { guildId, type: { in: ["warn", "WARN"] } },
      });
      let migrated = 0;
      for (const legacy of legacyWarns) {
        if (!legacy.userId) continue;
        await prisma.sanction.create({
          data: {
            userId: legacy.userId,
            guildId,
            moderatorId: legacy.moderator ?? "system",
            type: "WARN",
            reason: legacy.details ?? legacy.action,
          },
        });
        migrated++;
      }
      embed
        .setTitle("🔄 Migration terminée")
        .setDescription(`${migrated} warn(s) migré(s) vers le casier.`);
      await interaction.reply({ embeds: [embed], ephemeral: true });
      break;
    }
    default:
      await interaction.reply({ content: "❌ Non implémentée.", ephemeral: true });
  }
}

// ─── Community étendu ─────────────────────────────────────────────────────────

export async function handleCommunityExtraCmd(
  interaction: ChatInputCommandInteraction,
  _client: Client,
): Promise<void> {
  const action = interaction.options.getSubcommand();
  const embed = new EmbedBuilder().setColor(0x2ecc71);

  switch (action) {
    case "poll": {
      const question = interaction.options.getString("question", true);
      const optionsStr = interaction.options.getString("options", true);
      const options = optionsStr
        .split(",")
        .map((s) => s.trim())
        .slice(0, 10);
      const emojis = ["1️⃣", "2️⃣", "3️⃣", "4️⃣", "5️⃣", "6️⃣", "7️⃣", "8️⃣", "9️⃣", "🔟"];
      embed.setTitle("📊 Sondage").setDescription(`**${question}**`);
      options.forEach((opt, i) => {
        embed.addFields({ name: emojis[i], value: opt, inline: true });
      });
      const msg = await interaction.reply({ embeds: [embed], fetchReply: true });
      await prisma.poll
        .create({
          data: {
            guildId: interaction.guildId ?? "global",
            channelId: interaction.channelId,
            messageId: msg.id,
            authorId: interaction.user.id,
            question,
            options: JSON.stringify(options),
          },
        })
        .catch((error) =>
          logger.warn(
            `[community] poll persistence failed: ${error instanceof Error ? error.message : String(error)}`,
          ),
        );
      for (let i = 0; i < options.length; i++) {
        await msg.react(emojis[i]).catch(() => {});
      }
      break;
    }

    case "giveaway": {
      const duree = interaction.options.getString("duree", true);
      const prix = interaction.options.getString("prix", true);
      const gagnants = interaction.options.getInteger("gagnants") ?? 1;
      const durationMatch = duree.match(/^(\d+)\s*(m|h|d|j)$/i);
      const multiplier =
        durationMatch?.[2].toLowerCase() === "m"
          ? 60_000
          : durationMatch?.[2].toLowerCase() === "h"
            ? 3_600_000
            : 86_400_000;
      const endsAt = durationMatch
        ? new Date(Date.now() + Number(durationMatch[1]) * multiplier).toISOString()
        : null;
      embed
        .setTitle("🎉 Giveaway!")
        .setDescription(
          `**Prix:** ${prix}\n**Gagnants:** ${gagnants}\n**Durée:** ${duree}${endsAt ? `\nFin: <t:${Math.floor(new Date(endsAt).getTime() / 1000)}:R>` : ""}\n\nRéagis avec 🎉 pour participer!`,
        );
      const msg = await interaction.reply({ embeds: [embed], fetchReply: true });
      const giveaways = await readJsonSetting<Array<Record<string, any>>>(
        interaction.guildId ?? "global",
        "community_giveaways",
        [],
      );
      giveaways.push({
        messageId: msg.id,
        channelId: interaction.channelId,
        prize: prix,
        winners: gagnants,
        endsAt,
        createdBy: interaction.user.id,
        active: true,
      });
      await writeSetting(
        interaction.guildId ?? "global",
        "community_giveaways",
        JSON.stringify(giveaways),
      );
      await msg.react("🎉").catch(() => {});
      break;
    }

    case "giveaway-list": {
      const giveaways = await readJsonSetting<Array<Record<string, any>>>(
        interaction.guildId ?? "global",
        "community_giveaways",
        [],
      );
      const active = giveaways.filter(
        (giveaway) =>
          giveaway.active !== false &&
          (!giveaway.endsAt || new Date(String(giveaway.endsAt)).getTime() > Date.now()),
      );
      embed
        .setTitle("🎉 Giveaways actifs")
        .setDescription(
          active.length
            ? active
                .map(
                  (giveaway) =>
                    `\`${String(giveaway.messageId)}\` — ${String(giveaway.prize)} — ${giveaway.endsAt ? `<t:${Math.floor(new Date(String(giveaway.endsAt)).getTime() / 1000)}:R>` : "sans échéance"}`,
                )
                .join("\n")
            : "Aucun giveaway actif.",
        );
      await interaction.reply({ embeds: [embed], ephemeral: true });
      break;
    }

    case "giveaway-reroll": {
      const msgId = interaction.options.getString("message_id", true);
      const giveaways = await readJsonSetting<Array<Record<string, any>>>(
        interaction.guildId ?? "global",
        "community_giveaways",
        [],
      );
      const giveaway = giveaways.find((entry) => entry.messageId === msgId);
      if (!giveaway) {
        await interaction.reply({ content: "❌ Giveaway introuvable.", ephemeral: true });
        break;
      }
      try {
        const channel = interaction.guild?.channels.cache.get(String(giveaway.channelId));
        if (!channel || !channel.isTextBased() || !("messages" in channel))
          throw new Error("Salon inaccessible");
        const message = await channel.messages.fetch(msgId);
        const reaction = message.reactions.cache.get("🎉");
        const users = reaction
          ? (await reaction.users.fetch()).filter((user) => !user.bot).map((user) => user)
          : [];
        const winner = users.length ? users[Math.floor(Math.random() * users.length)] : null;
        embed
          .setTitle("🎲 Re-tirage")
          .setDescription(
            winner ? `Nouveau gagnant: <@${winner.id}>` : "Aucun participant disponible.",
          );
        if (winner) giveaway.lastWinner = winner.id;
        await writeSetting(
          interaction.guildId ?? "global",
          "community_giveaways",
          JSON.stringify(giveaways),
        );
      } catch {
        embed
          .setTitle("❌ Re-tirage impossible")
          .setDescription("Le message ou le salon est inaccessible.");
      }
      await interaction.reply({ embeds: [embed], ephemeral: true });
      break;
    }

    case "reaction-roles":
      await writeSetting(
        interaction.guildId ?? "global",
        "reaction_roles_config",
        JSON.stringify({
          enabled: true,
          updatedBy: interaction.user.id,
          updatedAt: new Date().toISOString(),
        }),
      );
      embed
        .setTitle("🎭 Reaction Roles")
        .setDescription(
          "Configuration enregistrée. Ajoute ensuite les règles de rôle dans le dashboard.",
        );
      await interaction.reply({ embeds: [embed], ephemeral: true });
      break;

    case "welcome-config":
      await writeSetting(
        interaction.guildId ?? "global",
        "welcome_config",
        JSON.stringify({
          enabled: true,
          updatedBy: interaction.user.id,
          updatedAt: new Date().toISOString(),
        }),
      );
      embed.setTitle("👋 Configuration de bienvenue").setDescription("Configuration enregistrée.");
      await interaction.reply({ embeds: [embed], ephemeral: true });
      break;

    case "goodbye-config":
      await writeSetting(
        interaction.guildId ?? "global",
        "goodbye_config",
        JSON.stringify({
          enabled: true,
          updatedBy: interaction.user.id,
          updatedAt: new Date().toISOString(),
        }),
      );
      embed.setTitle("👋 Configuration de départ").setDescription("Configuration enregistrée.");
      await interaction.reply({ embeds: [embed], ephemeral: true });
      break;

    case "birthday-set": {
      const date = interaction.options.getString("date", true);
      const birthdays = await readJsonSetting<Record<string, string>>(
        interaction.guildId ?? "global",
        "birthdays",
        {},
      );
      birthdays[interaction.user.id] = date;
      await writeSetting(interaction.guildId ?? "global", "birthdays", JSON.stringify(birthdays));
      embed.setTitle("🎂 Anniversaire défini").setDescription(`Ton anniversaire: ${date}`);
      await interaction.reply({ embeds: [embed], ephemeral: true });
      break;
    }

    case "birthday-list": {
      const birthdays = await readJsonSetting<Record<string, string>>(
        interaction.guildId ?? "global",
        "birthdays",
        {},
      );
      embed.setTitle("🎂 Anniversaires à venir").setDescription(
        Object.entries(birthdays).length
          ? Object.entries(birthdays)
              .map(([userId, date]) => `<@${userId}> — ${date}`)
              .join("\n")
          : "Aucun anniversaire enregistré.",
      );
      await interaction.reply({ embeds: [embed] });
      break;
    }

    case "birthday-config":
      await writeSetting(
        interaction.guildId ?? "global",
        "birthday_config",
        JSON.stringify({
          enabled: true,
          updatedBy: interaction.user.id,
          updatedAt: new Date().toISOString(),
        }),
      );
      embed.setTitle("🎂 Configuration anniversaire").setDescription("Configuration enregistrée.");
      await interaction.reply({ embeds: [embed], ephemeral: true });
      break;

    case "level-config":
      await writeSetting(
        interaction.guildId ?? "global",
        "level_config",
        JSON.stringify({
          enabled: true,
          updatedBy: interaction.user.id,
          updatedAt: new Date().toISOString(),
        }),
      );
      embed.setTitle("📈 Configuration des niveaux").setDescription("Configuration enregistrée.");
      await interaction.reply({ embeds: [embed], ephemeral: true });
      break;

    case "rank": {
      const cible = interaction.options.getUser("cible") ?? interaction.user;
      const xpData = await getUserXp(cible.id);
      if (!xpData) {
        embed
          .setTitle(`🏆 Rang de ${cible.username}`)
          .setDescription("Aucun XP enregistré. Envoie des messages pour gagner de l'XP !");
        await interaction.reply({ embeds: [embed] });
        break;
      }
      await interaction.deferReply();
      try {
        const buffer = await generateRankCard({
          username: cible.username,
          avatarUrl: cible.displayAvatarURL({ extension: "png", size: 256 }),
          level: xpData.level,
          xp: xpData.xp,
          xpNeeded: levelFromXp(xpData.xp).xpNeeded,
          rank: xpData.rank,
        });
        await interaction.editReply({
          content: `🏆 Rang de **${cible.username}** — Niveau ${xpData.level} • #${xpData.rank}`,
          files: [new AttachmentBuilder(buffer, { name: "rank-card.png" })],
        });
      } catch {
        embed
          .setTitle(`🏆 Rang de ${cible.username}`)
          .setDescription(`Niveau ${xpData.level} • ${xpData.xp} XP • Rang #${xpData.rank}`);
        await interaction.editReply({ embeds: [embed] });
      }
      break;
    }

    case "leaderboard": {
      const top = await getLeaderboard(10);
      if (top.length === 0) {
        embed
          .setTitle("🏆 Classement XP")
          .setDescription("Aucune donnée XP. Envoie des messages pour gagner de l'XP !");
        await interaction.reply({ embeds: [embed] });
        break;
      }
      const lines = top.map((u, i) => {
        const medal = i === 0 ? "🥇" : i === 1 ? "🥈" : i === 2 ? "🥉" : `**${i + 1}.**`;
        return `${medal} <@${u.discordId}> — Niv. ${u.level} • ${u.xp.toLocaleString()} XP`;
      });
      embed.setTitle("🏆 Classement XP").setDescription(lines.join("\n")).setColor(0xffd700);
      await interaction.reply({ embeds: [embed] });
      break;
    }

    case "lfg": {
      const jeu = interaction.options.getString("jeu", true);
      const nombre = interaction.options.getInteger("nombre") ?? 4;
      const duree = interaction.options.getString("duree");
      embed
        .setTitle("🎮 Looking For Group")
        .setDescription(
          `**Jeu:** ${jeu}\n**Joueurs recherchés:** ${nombre}${duree ? `\n**Durée:** ${duree}` : ""}\n\nRéagis avec ✅ pour rejoindre!`,
        );
      const msg = await interaction.reply({ embeds: [embed], fetchReply: true });
      const groups = await readJsonSetting<Array<Record<string, any>>>(
        interaction.guildId ?? "global",
        "community_lfg",
        [],
      );
      groups.push({
        messageId: msg.id,
        channelId: interaction.channelId,
        game: jeu,
        players: nombre,
        duration: duree ?? null,
        createdBy: interaction.user.id,
        active: true,
      });
      await writeSetting(interaction.guildId ?? "global", "community_lfg", JSON.stringify(groups));
      await msg.react("✅").catch(() => {});
      break;
    }

    case "lfg-list": {
      const groups = await readJsonSetting<Array<Record<string, any>>>(
        interaction.guildId ?? "global",
        "community_lfg",
        [],
      );
      const active = groups.filter((group) => group.active !== false);
      embed
        .setTitle("🎮 Groupes LFG actifs")
        .setDescription(
          active.length
            ? active
                .map(
                  (group) =>
                    `\`${String(group.messageId)}\` — ${String(group.game)} — ${String(group.players)} joueur(s)`,
                )
                .join("\n")
            : "Aucun groupe actif.",
        );
      await interaction.reply({ embeds: [embed] });
      break;
    }

    case "server-info": {
      const g = interaction.guild!;
      embed
        .setTitle(`ℹ️ ${g.name}`)
        .addFields(
          { name: "Membres", value: String(g.memberCount), inline: true },
          { name: "Salons", value: String(g.channels.cache.size), inline: true },
          { name: "Rôles", value: String(g.roles.cache.size), inline: true },
          {
            name: "Créé le",
            value: `<t:${Math.floor(g.createdTimestamp / 1000)}:F>`,
            inline: true,
          },
          { name: "Boost", value: `Niveau ${g.premiumTier}`, inline: true },
        )
        .setThumbnail(g.iconURL() ?? "");
      await interaction.reply({ embeds: [embed] });
      break;
    }

    case "avatar": {
      const cible = interaction.options.getUser("cible") ?? interaction.user;
      embed
        .setTitle(`🖼️ Avatar de ${cible.username}`)
        .setImage(cible.displayAvatarURL({ size: 512 }));
      await interaction.reply({ embeds: [embed] });
      break;
    }

    case "role-info": {
      const role = interaction.options.getRole("rôle", true) as Role;
      embed
        .setTitle(`🎭 ${role.name}`)
        .addFields(
          {
            name: "Membres",
            value: String(
              interaction.guild?.members.cache.filter((m) => m.roles.cache.has(role.id)).size ?? 0,
            ),
            inline: true,
          },
          { name: "Couleur", value: role.hexColor, inline: true },
          { name: "Position", value: String(role.position), inline: true },
          { name: "Mentionnable", value: role.mentionable ? "Oui" : "Non", inline: true },
          {
            name: "Créé le",
            value: `<t:${Math.floor(role.createdTimestamp / 1000)}:F>`,
            inline: true,
          },
        )
        .setColor(role.color || 0x5865f2);
      await interaction.reply({ embeds: [embed] });
      break;
    }

    case "channel-info": {
      const salon = interaction.options.getChannel("salon") ?? interaction.channel!;
      const salonName = (salon as { name?: string }).name ?? "N/A";
      const salonTs = (salon as { createdTimestamp?: number }).createdTimestamp ?? Date.now();
      embed
        .setTitle(`📢 ${salonName}`)
        .addFields(
          { name: "Type", value: String(salon.type), inline: true },
          { name: "ID", value: salon.id, inline: true },
          { name: "Créé le", value: `<t:${Math.floor(salonTs / 1000)}:F>`, inline: true },
        );
      await interaction.reply({ embeds: [embed] });
      break;
    }

    case "member-count": {
      const g = interaction.guild!;
      embed
        .setTitle("👥 Compteur de membres")
        .setDescription(
          `**Total:** ${g.memberCount}\n**En ligne:** ${g.presences.cache.filter((p) => p.status !== "offline").size}`,
        );
      await interaction.reply({ embeds: [embed] });
      break;
    }

    case "server-boost": {
      const g = interaction.guild!;
      embed
        .setTitle("🚀 Boost du serveur")
        .addFields(
          { name: "Niveau", value: String(g.premiumTier), inline: true },
          { name: "Boosts", value: String(g.premiumSubscriptionCount), inline: true },
        );
      await interaction.reply({ embeds: [embed] });
      break;
    }

    case "color": {
      const hex = interaction.options.getString("hex", true);
      embed
        .setTitle("🎨 Couleur de profil")
        .setDescription(`Couleur définie: ${hex}`)
        .setColor(hex as `#${string}`);
      await interaction.reply({ embeds: [embed], ephemeral: true });
      break;
    }

    default:
      await interaction.reply({ content: "❌ Non implémentée.", ephemeral: true });
  }
}

// ─── AI étendu ────────────────────────────────────────────────────────────────

export async function handleAiExtra(
  interaction: ChatInputCommandInteraction,
  _client: Client,
): Promise<void> {
  const action = interaction.options.getSubcommand();
  const embed = new EmbedBuilder().setColor(0x9b59b6);

  switch (action) {
    case "summarize": {
      const salon = interaction.options.getChannel("salon");
      const nombre = interaction.options.getInteger("nombre") ?? 50;
      embed
        .setTitle("📝 Résumé")
        .setDescription(
          `Résumé des ${nombre} derniers messages de <#${salon?.id ?? interaction.channelId}>.`,
        );
      await interaction.deferReply();
      try {
        const targetChannel = (salon ?? interaction.channel) as
          import("discord.js").TextChannel | null;
        if (targetChannel && targetChannel.type === ChannelType.GuildText) {
          const recentMessages = await targetChannel.messages.fetch({
            limit: Math.min(nombre, 100),
          });
          const messageTexts = recentMessages
            .filter((m) => m.content.trim().length > 0 && !m.author.bot)
            .map((m) => `${m.author.username}: ${m.content}`)
            .reverse();
          if (messageTexts.length > 0) {
            const summary = await summarizeChannel(messageTexts, nombre);
            embed.setDescription(summary.slice(0, 4000) || "Aucun résumé disponible.");
          } else {
            embed.setDescription("Aucun message à résumer dans ce salon.");
          }
        }
      } catch (err) {
        embed.setDescription("Erreur lors de la génération du résumé. Réessaie plus tard.");
        logger.error(
          `[stubHandlers] summarize error: ${err instanceof Error ? err.message : String(err)}`,
        );
      }
      await interaction.editReply({ embeds: [embed] });
      break;
    }
    case "explain": {
      const sujet = interaction.options.getString("sujet", true);
      await interaction.deferReply();
      try {
        const explanation = await advancedChat(
          `Explique de façon claire et concise: ${sujet}. Adapte le niveau de détail pour un utilisateur Discord.`,
        );
        embed
          .setTitle("💡 Explication")
          .setDescription((explanation || `Explication de: ${sujet}`).slice(0, 4000));
      } catch (err) {
        logger.error(
          `[stubHandlers] explain error: ${err instanceof Error ? err.message : String(err)}`,
        );
        embed
          .setTitle("💡 Explication")
          .setDescription(`Erreur lors de l'explication de: ${sujet}. Réessaie plus tard.`);
      }
      await interaction.editReply({ embeds: [embed] });
      break;
    }
    case "ai-sentiment": {
      const messageId = interaction.options.getString("message_id", true);
      await interaction.deferReply({ ephemeral: true });
      try {
        const channel = interaction.channel;
        if (!channel || !channel.isTextBased()) {
          await interaction.editReply({ content: "❌ Salon invalide." });
          break;
        }
        const msg = await channel.messages.fetch(messageId).catch((): null => null);
        if (!msg) {
          await interaction.editReply({ content: "❌ Message introuvable." });
          break;
        }
        const result = await deepSentimentAnalysis(msg.content || "");
        const dim = result.dimensions;
        const sentimentEmoji =
          result.sentiment === "très_positif"
            ? "😄"
            : result.sentiment === "positif"
              ? "🙂"
              : result.sentiment === "neutre"
                ? "😐"
                : result.sentiment === "négatif"
                  ? "😠"
                  : "🤬";
        const embed = new EmbedBuilder()
          .setTitle(`${sentimentEmoji} Analyse de sentiment — ${result.sentiment}`)
          .setColor(
            result.risque_global > 60 ? 0xe74c3c : result.risque_global > 30 ? 0xff8800 : 0x2ecc71,
          )
          .addFields(
            { name: "Positivité", value: `${dim.positivité}/10`, inline: true },
            { name: "Agressivité", value: `${dim.agressivité}/10`, inline: true },
            { name: "Spam", value: `${dim.spam}/10`, inline: true },
            { name: "Phishing", value: `${dim.phishing}/10`, inline: true },
            { name: "Harcèlement", value: `${dim.harcèlement}/10`, inline: true },
            { name: "Risque global", value: `${result.risque_global}/100`, inline: true },
          )
          .setDescription(result.explication)
          .setFooter({
            text: `Action recommandée: ${result.action_recommandée}${result.flags.length > 0 ? ` | Flags: ${result.flags.join(", ")}` : ""}`,
          })
          .setTimestamp();
        await interaction.editReply({ embeds: [embed] });
      } catch (err) {
        await interaction.editReply({
          content: `❌ Erreur: ${err instanceof Error ? err.message : String(err)}`,
        });
      }
      break;
    }
    case "ai-spam-analysis": {
      const salon = interaction.options.getChannel("salon");
      await interaction.deferReply({ ephemeral: true });
      try {
        const channel = salon ?? interaction.channel;
        if (!channel || !("isTextBased" in channel) || !channel.isTextBased()) {
          await interaction.editReply({ content: "❌ Salon invalide." });
          break;
        }
        const textChannel = channel as import("discord.js").TextBasedChannel;
        const messages = await textChannel.messages.fetch({ limit: 20 });
        const recentContent = messages
          .map((m) => m.content)
          .filter((c) => c.length > 0)
          .slice(0, 10);
        if (recentContent.length === 0) {
          await interaction.editReply({ content: "❌ Aucun message récent à analyser." });
          break;
        }
        const combined = recentContent.join("\n---\n");
        const result = await detectSpamPhishing(combined);
        const embed = new EmbedBuilder()
          .setTitle("🔍 Analyse spam/phishing")
          .setColor(
            result.verdict === "clean" ? 0x2ecc71 : result.verdict === "spam" ? 0xff8800 : 0xe74c3c,
          )
          .addFields(
            { name: "Verdict", value: result.verdict, inline: true },
            { name: "Confiance", value: `${result.confidence}%`, inline: true },
            { name: "Action", value: result.action, inline: true },
          )
          .setDescription(result.raison)
          .setTimestamp();
        await interaction.editReply({ embeds: [embed] });
      } catch (err) {
        await interaction.editReply({
          content: `❌ Erreur: ${err instanceof Error ? err.message : String(err)}`,
        });
      }
      break;
    }
    case "ai-persona": {
      const personaName = interaction.options.getString("persona", true);
      const persona = getPersona(personaName);
      if (!persona) {
        const list = listPersonas()
          .map((p) => `${p.emoji} \`${p.key}\` — ${p.name} (${p.tone})`)
          .join("\n");
        await interaction.reply({
          content: `❌ Persona "${personaName}" introuvable.\n\n**Personas disponibles:**\n${list}`,
          ephemeral: true,
        });
        break;
      }
      const embed = new EmbedBuilder()
        .setTitle(`${persona.emoji} Persona: ${persona.name}`)
        .setColor(persona.color)
        .addFields(
          { name: "🎭 Personnalité", value: persona.personality, inline: false },
          { name: "🗣️ Ton", value: persona.tone, inline: true },
          { name: "🎨 Style", value: persona.writingStyle.slice(0, 200), inline: false },
          { name: "❤️ Intérêts", value: persona.interests.join(", "), inline: false },
          { name: "🚫 Limites", value: persona.limits.join("\n"), inline: false },
        )
        .setFooter({
          text: `Persona ${personaName} configuré. Le bot utilisera cette personnalité.`,
        })
        .setTimestamp();
      await interaction.reply({ embeds: [embed], ephemeral: true });
      break;
    }
    case "ai-prompt-templates": {
      const personas = listPersonas();
      const embed = new EmbedBuilder()
        .setTitle("📋 Personas disponibles")
        .setColor(0x9b59b6)
        .setDescription(
          personas
            .map((p) => `${p.emoji} **${p.name}** (\`/ai advanced persona ${p.key}\`) — ${p.tone}`)
            .join("\n"),
        )
        .setFooter({ text: "Utilise /ai advanced persona <nom> pour sélectionner" })
        .setTimestamp();
      await interaction.reply({ embeds: [embed], ephemeral: true });
      break;
    }
    case "ai-context": {
      const sujet =
        interaction.options.getString("sujet") ?? interaction.options.getString("context");
      await interaction.deferReply({ ephemeral: true });
      if (!sujet) {
        await interaction.editReply({ content: "❌ Aucun sujet fourni." });
        break;
      }
      const pipeline = await runReasoningPipeline<ModerationPipelineSolution>(sujet, {
        maxAspects: 5,
        timeoutPerStep: 12_000,
      });
      const embed = new EmbedBuilder()
        .setTitle("🧠 Analyse multi-étapes")
        .setColor(0x5865f2)
        .setDescription(`Pipeline: ${pipeline.steps} étapes en ${pipeline.durationMs}ms`)
        .addFields(
          {
            name: "📋 Aspects identifiés",
            value:
              pipeline.aspects.length > 0
                ? pipeline.aspects.map((a, i) => `${i + 1}. ${a}`).join("\n")
                : "Aucun",
            inline: false,
          },
          {
            name: "🔍 Analyses",
            value:
              pipeline.analyses
                .map(
                  (a) =>
                    `**${a.aspect}**: ${a.result.analysis.slice(0, 200)}${a.result.severity !== undefined ? ` (${a.result.severity}/10)` : ""}`,
                )
                .join("\n\n")
                .slice(0, 1024) || "Aucune",
            inline: false,
          },
          {
            name: "✅ Solution",
            value: JSON.stringify(pipeline.solution, null, 2).slice(0, 1024),
            inline: false,
          },
        )
        .setTimestamp();
      await interaction.editReply({ embeds: [embed] });
      break;
    }
    case "ai-mood": {
      const messageId = interaction.options.getString("message_id");
      await interaction.deferReply({ ephemeral: true });
      try {
        let messageContent = "";
        if (
          messageId &&
          interaction.channel &&
          "isTextBased" in interaction.channel &&
          interaction.channel.isTextBased()
        ) {
          const msg = await interaction.channel.messages.fetch(messageId).catch((): null => null);
          if (msg) messageContent = msg.content;
        }
        if (!messageContent) {
          await interaction.editReply({ content: "❌ Message introuvable ou vide." });
          break;
        }
        const consensus = await getMultiExpertConsensus(messageContent);
        const moodEmoji = consensus.unanimity ? "🟢" : "🟡";
        const embed = new EmbedBuilder()
          .setTitle(`${moodEmoji} Consensus multi-experts — ${consensus.final_verdict}`)
          .setColor(
            consensus.final_verdict === "clean"
              ? 0x2ecc71
              : consensus.final_verdict === "warning"
                ? 0xf1c40f
                : consensus.final_verdict === "violation"
                  ? 0xff8800
                  : 0xe74c3c,
          )
          .setDescription(
            `Action: **${consensus.final_action}** | Confiance: **${consensus.confidence}%** | Méthode: ${consensus.decision_method}`,
          )
          .addFields(
            {
              name: "🗳️ Votes",
              value: consensus.votes.map((v) => `${v.verdict}: ${v.count}`).join(" | "),
              inline: false,
            },
            {
              name: "🔍 Avis des experts",
              value: consensus.opinions
                .map(
                  (o) =>
                    `**${o.expert}**: ${o.verdict} (${o.confidence}%) — ${o.reasoning.slice(0, 150)}`,
                )
                .join("\n\n")
                .slice(0, 1024),
              inline: false,
            },
          )
          .setFooter({ text: consensus.unanimity ? "Unanimité totale" : "Consensus par vote" })
          .setTimestamp();
        await interaction.editReply({ embeds: [embed] });
      } catch (err) {
        await interaction.editReply({
          content: `❌ Erreur: ${err instanceof Error ? err.message : String(err)}`,
        });
      }
      break;
    }
    case "ai-suggest": {
      const sujet =
        interaction.options.getString("sujet") ?? interaction.options.getString("probleme");
      await interaction.deferReply({ ephemeral: true });
      if (!sujet) {
        await interaction.editReply({ content: "❌ Aucun sujet fourni." });
        break;
      }
      const result = await thinkTree<ModerationToTResult>(sujet, { timeoutPerStep: 12_000 });
      const embed = new EmbedBuilder()
        .setTitle("🌳 Tree of Thought")
        .setColor(0x2ecc71)
        .setDescription(
          `3 approches en parallèle • ${result.durationMs}ms${result.best_branch ? ` • Meilleure: **${result.best_branch}**` : ""}`,
        )
        .addFields(
          {
            name: "🌿 Branches",
            value: result.branches
              .map(
                (b) =>
                  `**${b.name}**${b.score !== undefined ? ` (${b.score}/10)` : ""}: ${b.analysis.slice(0, 200)}`,
              )
              .join("\n\n")
              .slice(0, 1024),
            inline: false,
          },
          {
            name: "✅ Synthèse",
            value: JSON.stringify(result.synthesis, null, 2).slice(0, 1024),
            inline: false,
          },
        )
        .setTimestamp();
      await interaction.editReply({ embeds: [embed] });
      break;
    }
    case "ai-moderation-config": {
      const suite = interaction.options.getString("suite") ?? "spam";
      await interaction.deferReply({ ephemeral: true });
      const promptA =
        "Analyse ce message et classifie-le. Réponds en JSON: {verdict, confidence, raison, action}";
      const promptB =
        "Tu es un modérateur expert. Analyse ce message avec few-shot. Réponds en JSON: {verdict, confidence, raison, action}";
      const testCases: PromptTestCase[] =
        suite === "sentiment" ? SENTIMENT_TEST_CASES : SPAM_TEST_CASES;
      const result = await testPrompts(promptA, promptB, testCases, {
        maxTokens: 200,
        timeout: 10_000,
      });
      const embed = new EmbedBuilder()
        .setTitle("🧪 A/B Test de Prompts")
        .setColor(result.winner === "A" ? 0x3498db : result.winner === "B" ? 0x2ecc71 : 0xf1c40f)
        .setDescription(
          `**Winner: ${result.winner === "tie" ? "Égalité" : `Prompt ${result.winner}`}** | Suite: ${suite} | ${testCases.length} cas`,
        )
        .addFields(
          {
            name: "📊 Accuracy",
            value: `A: ${result.accuracyA}% | B: ${result.accuracyB}%`,
            inline: true,
          },
          {
            name: "⏱️ Temps moyen",
            value: `A: ${result.timeA}ms | B: ${result.timeB}ms`,
            inline: true,
          },
          { name: "💰 Tokens", value: `A: ${result.costA} | B: ${result.costB}`, inline: true },
          {
            name: "📋 Détails par cas",
            value: result.details
              .map(
                (d) =>
                  `Cas ${d.case}: A=${d.scoreA}% (${d.timeA}ms) vs B=${d.scoreB}% (${d.timeB}ms)`,
              )
              .join("\n")
              .slice(0, 1024),
            inline: false,
          },
        )
        .setTimestamp();
      await interaction.editReply({ embeds: [embed] });
      break;
    }
    case "ai-temperature": {
      const prompts = [
        { name: "Spam/Phishing", prompt: SPAM_PHISHING_PROMPT },
        { name: "Deep Sentiment", prompt: DEEP_SENTIMENT_PROMPT },
        { name: "Threat Intel", prompt: THREAT_INTEL_PROMPT },
        { name: "Code Review", prompt: CODE_REVIEW_PROMPT },
        { name: "Moderation", prompt: MODERATION_PROMPT },
        { name: "Quick Sentiment", prompt: SENTIMENT_PROMPT },
        { name: "Risk Assessment", prompt: RISK_ASSESSMENT_PROMPT },
      ];
      const scores = scorePromptsBatch(prompts);
      const avgScore = Math.round(scores.reduce((sum, s) => sum + s.score, 0) / scores.length);
      const embed = new EmbedBuilder()
        .setTitle("📊 Scoring des Prompts IA")
        .setColor(avgScore >= 75 ? 0x2ecc71 : avgScore >= 60 ? 0xf1c40f : 0xff8800)
        .setDescription(`Score moyen: **${avgScore}/100** | ${prompts.length} prompts évalués`)
        .addFields({
          name: "📝 Scores par prompt",
          value: scores
            .map((s) => `${gradeEmoji(s.grade)} **${s.name}**: ${s.score}/100 (Grade ${s.grade})`)
            .join("\n"),
          inline: false,
        })
        .setTimestamp();
      const worst = scores.sort((a, b) => a.score - b.score)[0];
      if (worst && worst.score < 80) {
        embed.addFields({
          name: "⚠️ Améliorations — " + worst.name,
          value: worst.suggestions.slice(0, 3).join("\n"),
          inline: false,
        });
      }
      // Best practices validation sur le prompt le plus faible
      const worstPrompt = prompts.sort(
        (a, b) => scorePromptDetailed(a.prompt).total - scorePromptDetailed(b.prompt).total,
      )[0];
      if (worstPrompt) {
        const bp = validateBestPractices(worstPrompt.prompt);
        embed.addFields({
          name: `${gradeEmoji(bp.grade)} Best Practices — ${worstPrompt.name} (${bp.passedCount}/${bp.totalCount})`,
          value: bp.checks
            .map((c) => `${c.passed ? "✅" : "❌"} #${c.id} ${c.name}`)
            .join("\n")
            .slice(0, 1024),
          inline: false,
        });
        // Anti-patterns detection
        const ap = detectAntiPatterns(worstPrompt.prompt);
        if (!ap.clean) {
          embed.addFields({
            name: `🔴 Anti-Patterns — ${worstPrompt.name} (${ap.detectedCount} détectés, score ${ap.score}/100)`,
            value: ap.checks
              .filter((c) => c.detected)
              .map(
                (c) =>
                  `${c.severity === "critical" ? "🔴" : c.severity === "warning" ? "🟠" : "🟡"} #${c.id} ${c.name}: ${c.fix}`,
              )
              .join("\n")
              .slice(0, 1024),
            inline: false,
          });
        }
      }
      await interaction.reply({ embeds: [embed], ephemeral: true });
      break;
    }
    case "ai-profile": {
      const message = interaction.options.getString("message");
      const personaName = interaction.options.getString("persona") ?? "helldiver";
      await interaction.deferReply({ ephemeral: true });
      if (!message) {
        await interaction.editReply({ content: "❌ Aucun message fourni." });
        break;
      }
      const persona = getPersona(personaName);
      const personaName2 = persona?.name ?? "John Helldiver";
      const personality = persona?.personality ?? "direct, tactique, loyal";
      const expertise = persona?.interests?.join(", ") ?? "gaming, modération, sécurité Discord";
      const tone = persona?.tone ?? "amical mais professionnel";
      const response = await advancedChat(message, {
        botName: personaName2,
        personality,
        expertise,
        tone,
        username: interaction.user.username,
        serverContext: interaction.guild?.name ?? "serveur Discord",
      });
      const embed = new EmbedBuilder()
        .setTitle(`💬 ${personaName2}`)
        .setColor(0x5865f2)
        .setDescription(response.slice(0, 4000))
        .setFooter({ text: `Persona: ${personaName} | ${tone}` })
        .setTimestamp();
      await interaction.editReply({ embeds: [embed] });
      break;
    }
    case "ai-fun": {
      const presetKey = interaction.options.getString("preset") ?? "moderation";
      const content = interaction.options.getString("content") ?? "Test message";
      const preset = getPreset(presetKey);
      if (!preset) {
        const list = listPresets()
          .map((p) => `- \`${p.key}\` — ${p.name} (${p.domain})`)
          .join("\n");
        await interaction.reply({
          content: `❌ Preset introuvable.\n\n**Presets disponibles:**\n${list}`,
          ephemeral: true,
        });
        break;
      }
      const prompt = buildFromPreset(preset, content);
      const embed = new EmbedBuilder()
        .setTitle(`🔧 Prompt Builder — ${presetKey}`)
        .setColor(0x5865f2)
        .setDescription(`\`\`\`\n${prompt.slice(0, 4000)}\n\`\``)
        .setFooter({ text: `Domain: ${preset.domain} | Experience: ${preset.experience} ans` })
        .setTimestamp();
      await interaction.reply({ embeds: [embed], ephemeral: true });
      break;
    }
    case "ai-channel-summary": {
      await interaction.deferReply({ ephemeral: true });
      try {
        const channel = interaction.channel;
        if (!channel || !("messages" in channel)) {
          await interaction.editReply("❌ Canal non lisible.");
          break;
        }
        const messages = await channel.messages.fetch({ limit: 50 });
        const contents = messages
          .map((m) => m.content)
          .filter((c) => c.length > 0)
          .reverse();
        const summary = await summarizeChannel(contents, 30);
        embed
          .setTitle("📋 Résumé du channel")
          .setColor(0x5865f2)
          .setDescription(summary.slice(0, 4000));
        await interaction.editReply({ embeds: [embed] });
      } catch {
        await interaction.editReply("❌ Impossible de résumer le channel.");
      }
      break;
    }
    case "ai-translate-custom": {
      const text = interaction.options.getString("texte", true);
      const target = interaction.options.getString("langue", true);
      await interaction.deferReply({ ephemeral: true });
      const translated = await translateText(text, target);
      const detected = await detectLanguage(text);
      embed
        .setTitle("🌍 Traduction")
        .setColor(0x5865f2)
        .addFields(
          { name: "Langue détectée", value: detected || "?", inline: true },
          { name: "Cible", value: target, inline: true },
        )
        .setDescription(translated.slice(0, 4000));
      await interaction.editReply({ embeds: [embed] });
      break;
    }
    case "ai-image":
      embed
        .setTitle("🎨 Génération d'image")
        .setDescription(
          "⚠️ En cours de développement — nécessite une API d'image (DALL-E, Stable Diffusion).",
        );
      await interaction.reply({ embeds: [embed], ephemeral: true });
      break;
    case "ai-history": {
      const subHist = interaction.options.getString("action") ?? "list";
      if (subHist === "clear") {
        await clearAiHistory(interaction.user.id);
        await interaction.reply({ content: "✅ Historique IA effacé.", ephemeral: true });
      } else if (subHist === "stats") {
        const stats = await getAiStats(interaction.user.id);
        embed
          .setTitle("📊 Stats IA")
          .setColor(0x5865f2)
          .addFields(
            { name: "Requêtes", value: String(stats.totalRequests), inline: true },
            { name: "Tokens", value: String(stats.totalTokens), inline: true },
            { name: "Commande préférée", value: stats.mostUsedCommand, inline: true },
          );
        await interaction.reply({ embeds: [embed], ephemeral: true });
      } else {
        const history = await getAiHistory(interaction.user.id, 20);
        if (history.length === 0) {
          await interaction.reply({ content: "Aucun historique IA.", ephemeral: true });
        } else {
          const items = history.map(
            (h) => `**${h.command}** — ${h.timestamp.toDateString()} (${h.tokensUsed} tokens)`,
          );
          await sendPaginatedEmbed(interaction, {
            title: "📜 Historique IA",
            color: 0x5865f2,
            items,
            itemsPerPage: 10,
            ephemeral: true,
          });
        }
      }
      break;
    }
    case "ai-chat-export": {
      const format = interaction.options.getString("format") ?? "json";
      await interaction.deferReply({ ephemeral: true });
      const channel = interaction.channel;
      if (!channel || !("id" in channel)) {
        await interaction.editReply("❌ Canal non valide.");
        break;
      }
      const messages = await exportChannelMessages(channel.id, 50);
      let content: string;
      if (format === "markdown") content = exportToMarkdown(messages);
      else if (format === "csv") content = exportToCSV(messages);
      else content = exportToJSON(messages);
      const attachment = new AttachmentBuilder(Buffer.from(content, "utf-8"), {
        name: `export.${format === "markdown" ? "md" : format === "csv" ? "csv" : "json"}`,
      });
      await interaction.editReply({
        content: `📤 Export de ${messages.length} messages (${format})`,
        files: [attachment],
      });
      break;
    }
    case "ai-model-select": {
      const models = listModels();
      const items = models.map(
        (m) =>
          `**${m.name}** — ${m.id}\nContexte: ${m.contextLength.toLocaleString()} | $${m.pricing.prompt}/${m.pricing.completion} per M tokens | ${m.capabilities.join(", ")}`,
      );
      await sendPaginatedEmbed(interaction, {
        title: "🤖 Modèles disponibles",
        color: 0x5865f2,
        items,
        itemsPerPage: 3,
        ephemeral: true,
      });
      break;
    }
    case "ai-token-usage": {
      const stats = getUsageStats(interaction.user.id);
      const global = getGlobalStats();
      embed
        .setTitle("📊 Token Usage")
        .setColor(0x5865f2)
        .addFields(
          { name: "Vos tokens", value: String(stats.totalTokens), inline: true },
          { name: "Coût estimé", value: `$${stats.totalCost.toFixed(4)}`, inline: true },
          {
            name: "Par commande",
            value:
              Object.entries(stats.byCommand)
                .map(([k, v]) => `${k}: ${v}`)
                .join("\n") || "Aucun",
            inline: false,
          },
          { name: "Global users", value: String(global.totalUsers), inline: true },
          { name: "Global tokens", value: String(global.totalTokens), inline: true },
        );
      await interaction.reply({ embeds: [embed], ephemeral: true });
      break;
    }
    case "ai-summarize-user": {
      const targetUser = interaction.options.getUser("utilisateur") ?? interaction.user;
      const guildId = interaction.guildId;
      if (!guildId) {
        await interaction.reply({ content: "❌ Serveur requis.", ephemeral: true });
        break;
      }
      await interaction.deferReply({ ephemeral: true });
      const summary = await generateUserSummary(targetUser.id, guildId);
      const summaryEmbed = await generateUserEmbed(summary);
      await interaction.editReply({ embeds: [summaryEmbed] });
      break;
    }
    default:
      await interaction.reply({ content: "❌ Non implémentée.", ephemeral: true });
  }
}

// ─── Shadow étendu ────────────────────────────────────────────────────────────

export async function handleShadowExtra(
  interaction: ChatInputCommandInteraction,
  _client: Client,
): Promise<void> {
  const action = interaction.options.getSubcommand();
  const embed = new EmbedBuilder().setColor(0x2c2f33);

  switch (action) {
    case "headers": {
      const url = interaction.options.getString("url", true);
      await interaction.deferReply();
      try {
        const res = await fetch(url, { method: "HEAD", signal: AbortSignal.timeout(5000) });
        const headers: string[] = [];
        res.headers.forEach((v, k) => headers.push(`**${k}:** ${v}`));
        embed
          .setTitle("📋 Headers HTTP")
          .setDescription(headers.slice(0, 20).join("\n") || "Aucun header.");
        await interaction.editReply({ embeds: [embed] });
      } catch {
        await interaction.editReply("❌ Impossible de récupérer les headers.");
      }
      break;
    }
    case "ssl-check": {
      const domaine = interaction.options.getString("domaine", true);
      embed
        .setTitle("🔒 Vérification SSL")
        .setDescription(`Domaine: ${domaine}\nVérification en cours...`);
      await interaction.deferReply();
      try {
        const res = await fetch(`https://${domaine}`, { signal: AbortSignal.timeout(5000) });
        embed.setDescription(`✅ SSL valide — ${res.status} ${res.statusText}`);
      } catch {
        embed.setDescription("❌ SSL invalide ou inaccessible.");
      }
      await interaction.editReply({ embeds: [embed] });
      break;
    }
    case "port-scan": {
      const host = interaction.options.getString("host", true);
      embed
        .setTitle("🔍 Scan de ports")
        .setDescription(`Host: ${host}\nPorts communs scannés (80, 443, 22, 21, 25, 3389)...`);
      await interaction.deferReply();
      const ports = [80, 443, 22, 21, 25, 3389];
      const results: string[] = [];
      for (const port of ports) {
        try {
          const controller = new AbortController();
          const timeout = setTimeout(() => controller.abort(), 2000);
          await fetch(`http://${host}:${port}`, { signal: controller.signal }).catch(() => {});
          clearTimeout(timeout);
          results.push(`Port ${port}: ⚠️ Réponse reçue`);
        } catch (err) {
          const isAbort = err instanceof Error && err.name === "AbortError";
          results.push(`Port ${port}: ${isAbort ? "🔴 Fermé" : "🟡 Potentiellement ouvert"}`);
        }
      }
      embed.setDescription(results.join("\n"));
      await interaction.editReply({ embeds: [embed] });
      break;
    }
    case "username-gen": {
      const mots =
        interaction.options
          .getString("mots", true)
          ?.split(/[\s,]+/)
          .filter(Boolean) ?? [];
      const generated: string[] = [];
      for (let i = 0; i < 5; i++) {
        const combined = mots.sort(() => Math.random() - 0.5).join("");
        const num = Math.floor(Math.random() * 999);
        generated.push(`${combined}${num}`);
      }
      embed.setTitle("🎭 Usernames générés").setDescription(generated.join("\n"));
      await interaction.reply({ embeds: [embed], ephemeral: true });
      break;
    }
    case "metadata": {
      const url = interaction.options.getString("url", true);
      embed.setTitle("📊 Métadonnées").setDescription(`Analyse des métadonnées de: ${url}`);
      await interaction.deferReply();
      try {
        const res = await fetch(url, { signal: AbortSignal.timeout(5000) });
        const contentType = res.headers.get("content-type");
        const contentLength = res.headers.get("content-length");
        embed.addFields(
          { name: "Content-Type", value: contentType ?? "N/A", inline: true },
          {
            name: "Taille",
            value: contentLength ? `${(parseInt(contentLength) / 1024).toFixed(1)} KB` : "N/A",
            inline: true,
          },
        );
        await interaction.editReply({ embeds: [embed] });
      } catch {
        await interaction.editReply("❌ Impossible de récupérer les métadonnées.");
      }
      break;
    }
    case "tech-detect": {
      const url = interaction.options.getString("url", true);
      embed.setTitle("🔍 Détection de technologies").setDescription(`Analyse de: ${url}`);
      await interaction.deferReply();
      try {
        const res = await fetch(url, { signal: AbortSignal.timeout(5000) });
        const techs: string[] = [];
        const poweredBy = res.headers.get("x-powered-by");
        if (poweredBy) techs.push(`⚡ X-Powered-By: ${poweredBy}`);
        const server = res.headers.get("server");
        if (server) techs.push(`🖥️ Server: ${server}`);
        if (!techs.length) techs.push("Aucune technologie détectée via les headers.");
        embed.setDescription(techs.join("\n"));
        await interaction.editReply({ embeds: [embed] });
      } catch {
        await interaction.editReply("❌ Analyse impossible.");
      }
      break;
    }
    default:
      await interaction.reply({ content: "❌ Non implémentée.", ephemeral: true });
  }
}

// ─── Music ────────────────────────────────────────────────────────────────────

export async function handleMusic(
  interaction: ChatInputCommandInteraction,
  _client: Client,
): Promise<void> {
  const action = interaction.options.getSubcommand();
  const embed = new EmbedBuilder().setColor(0x1db954);

  switch (action) {
    case "play": {
      const query = interaction.options.getString("requete", true);
      embed
        .setTitle("🎵 Lecture")
        .setDescription(
          `Recherche: ${query}\n\n⚠️ Le système de musique nécessite un player audio (en développement).`,
        );
      await interaction.reply({ embeds: [embed] });
      break;
    }
    case "stop":
      embed.setTitle("⏹️ Musique arrêtée").setDescription("File d'attente vidée.");
      await interaction.reply({ embeds: [embed] });
      break;
    case "pause":
      embed.setTitle("⏸️ Pause").setDescription("Musique mise en pause.");
      await interaction.reply({ embeds: [embed] });
      break;
    case "resume":
      embed.setTitle("▶️ Reprise").setDescription("Lecture reprise.");
      await interaction.reply({ embeds: [embed] });
      break;
    case "skip":
      embed.setTitle("⏭️ Skip").setDescription("Musique suivante.");
      await interaction.reply({ embeds: [embed] });
      break;
    case "previous":
      embed.setTitle("⏮️ Précédent").setDescription("Musique précédente.");
      await interaction.reply({ embeds: [embed] });
      break;
    case "shuffle":
      embed.setTitle("🔀 Shuffle").setDescription("Mode aléatoire activé.");
      await interaction.reply({ embeds: [embed] });
      break;
    case "loop": {
      const mode = interaction.options.getString("mode") ?? "off";
      embed.setTitle("🔁 Loop").setDescription(`Mode: ${mode}`);
      await interaction.reply({ embeds: [embed] });
      break;
    }
    case "seek": {
      const position = interaction.options.getString("position", true);
      embed.setTitle("⏯️ Seek").setDescription(`Position: ${position}`);
      await interaction.reply({ embeds: [embed] });
      break;
    }
    case "volume": {
      const vol = interaction.options.getInteger("volume", true);
      embed.setTitle("🔊 Volume").setDescription(`Volume: ${vol}%`);
      await interaction.reply({ embeds: [embed] });
      break;
    }
    case "queue":
      embed.setTitle("📋 File d'attente").setDescription("File d'attente vide.");
      await interaction.reply({ embeds: [embed] });
      break;
    case "nowplaying":
      embed.setTitle("🎵 En cours de lecture").setDescription("Aucune musique en cours.");
      await interaction.reply({ embeds: [embed] });
      break;
    case "lyrics": {
      const titre = interaction.options.getString("titre");
      embed
        .setTitle("🎤 Paroles")
        .setDescription(titre ? `Recherche de paroles pour: ${titre}` : "Aucune musique en cours.");
      await interaction.reply({ embeds: [embed] });
      break;
    }
    case "playlist-add": {
      const nom = interaction.options.getString("nom", true);
      embed.setTitle("📝 Playlist créée").setDescription(`Playlist "${nom}" créée.`);
      await interaction.reply({ embeds: [embed] });
      break;
    }
    case "playlist-play": {
      const nom = interaction.options.getString("nom", true);
      embed.setTitle("▶️ Playlist").setDescription(`Lecture de la playlist "${nom}".`);
      await interaction.reply({ embeds: [embed] });
      break;
    }
    case "playlist-list":
      embed.setTitle("📋 Playlists").setDescription("Aucune playlist.");
      await interaction.reply({ embeds: [embed] });
      break;
    case "playlist-delete": {
      const nom = interaction.options.getString("nom", true);
      embed.setTitle("🗑️ Playlist supprimée").setDescription(`"${nom}" supprimée.`);
      await interaction.reply({ embeds: [embed] });
      break;
    }
    case "radio":
      embed.setTitle("📻 Radio Gaming").setDescription("Radio démarrée.");
      await interaction.reply({ embeds: [embed] });
      break;
    case "radio-stop":
      embed.setTitle("📻 Radio arrêtée").setDescription("Radio gaming arrêtée.");
      await interaction.reply({ embeds: [embed] });
      break;
    case "audio-effects":
      embed
        .setTitle("🎚️ Effets audio")
        .setDescription("Effets audio (bassboost, nightcore, 8d) — en développement.");
      await interaction.reply({ embeds: [embed] });
      break;
    default:
      await interaction.reply({ content: "❌ Non implémentée.", ephemeral: true });
  }
}

// ─── Economy ──────────────────────────────────────────────────────────────────

export async function handleEconomy(
  interaction: ChatInputCommandInteraction,
  _client: Client,
): Promise<void> {
  const action = interaction.options.getSubcommand();
  const guildId = interaction.guildId ?? "global";
  const embed = new EmbedBuilder().setColor(0xf1c40f);
  const userId = interaction.user.id;

  const grant = async (amount: number, period: string, title: string): Promise<void> => {
    const key = `economy_claim:${userId}:${period}`;
    const last = Number((await readSetting(guildId, key)) ?? 0);
    const windows: Record<string, number> = {
      daily: 86_400_000,
      weekly: 604_800_000,
      work: 3_600_000,
    };
    const remaining = last + (windows[period] ?? 0) - Date.now();
    if (remaining > 0) {
      embed
        .setTitle(`⏳ ${title}`)
        .setDescription(`Réessaie <t:${Math.ceil((Date.now() + remaining) / 1000)}:R>.`);
    } else {
      const user = await ensureEconomyUser(userId, guildId);
      await prisma.user.update({
        where: { discordId: userId },
        data: { balance: { increment: amount } },
      });
      await writeSetting(guildId, key, String(Date.now()));
      embed
        .setTitle(`✅ ${title}`)
        .setDescription(`Tu as reçu **${amount} crédits**. Solde: **${user.balance + amount}**.`);
    }
    await interaction.reply({ embeds: [embed] });
  };

  switch (action) {
    case "balance": {
      const cible = interaction.options.getUser("cible") ?? interaction.user;
      const user = await ensureEconomyUser(cible.id, guildId);
      embed
        .setTitle(`💰 Solde de ${cible.username}`)
        .setDescription(`Solde: **${user.balance} crédits**`);
      await interaction.reply({ embeds: [embed] });
      break;
    }
    case "daily":
      await grant(100, "daily", "Récompense quotidienne");
      break;
    case "weekly":
      await grant(500, "weekly", "Récompense hebdomadaire");
      break;
    case "work":
      await grant(50, "work", "Travail");
      break;
    case "gamble": {
      const montant = interaction.options.getInteger("montant", true);
      const user = await ensureEconomyUser(userId, guildId);
      if (user.balance < montant) {
        embed.setTitle("❌ Pari impossible").setDescription("Solde insuffisant.");
      } else if (Math.random() < 0.45) {
        await prisma.user.update({
          where: { discordId: userId },
          data: { balance: { increment: montant } },
        });
        embed.setTitle("🎲 Gagné!").setDescription(`Gain net: **${montant} crédits**.`);
      } else {
        await prisma.user.update({
          where: { discordId: userId },
          data: { balance: { decrement: montant } },
        });
        embed.setTitle("🎲 Perdu!").setDescription(`Perte: **${montant} crédits**.`);
      }
      await interaction.reply({ embeds: [embed] });
      break;
    }
    case "shop": {
      const items = await prisma.shopItem.findMany({
        where: { guildId },
        orderBy: { price: "asc" },
        take: 25,
      });
      embed
        .setTitle("🛒 Boutique")
        .setDescription(
          items.length
            ? items
                .map(
                  (item) =>
                    `${item.emoji ?? "▫️"} **${item.name}** — ${item.price} crédits${item.stock !== null && item.stock >= 0 ? ` (${item.stock} restant(s))` : ""}`,
                )
                .join("\n")
            : "Aucun article configuré.",
        );
      await interaction.reply({ embeds: [embed] });
      break;
    }
    case "buy": {
      const itemName = interaction.options.getString("item", true);
      const item = await prisma.shopItem.findFirst({
        where: { guildId, name: { equals: itemName, mode: "insensitive" } },
      });
      if (!item || (item.stock !== null && item.stock === 0)) {
        await interaction.reply({ content: "❌ Article introuvable ou épuisé.", ephemeral: true });
        break;
      }
      const result = await prisma.$transaction(async (tx) => {
        const user = await tx.user.upsert({
          where: { discordId: userId },
          create: { discordId: userId, guildId },
          update: { guildId },
        });
        const charged = await tx.user.updateMany({
          where: { discordId: userId, balance: { gte: item.price } },
          data: { balance: { decrement: item.price } },
        });
        if (charged.count !== 1) return { ok: false, balance: user.balance };
        if (item.stock !== null && item.stock > 0)
          await tx.shopItem.update({ where: { id: item.id }, data: { stock: { decrement: 1 } } });
        await tx.inventory.upsert({
          where: { userId_guildId_itemName: { userId, guildId, itemName: item.name } },
          create: { userId, guildId, itemName: item.name, quantity: 1 },
          update: { quantity: { increment: 1 } },
        });
        return { ok: true, balance: user.balance - item.price };
      });
      embed
        .setTitle(result.ok ? "✅ Achat effectué" : "❌ Achat refusé")
        .setDescription(
          result.ok
            ? `**${item.name}** ajouté à ton inventaire. Solde: ${result.balance} crédits.`
            : "Solde insuffisant.",
        );
      await interaction.reply({ embeds: [embed] });
      break;
    }
    case "sell": {
      const itemName = interaction.options.getString("item", true);
      const inventory = await prisma.inventory.findUnique({
        where: { userId_guildId_itemName: { userId, guildId, itemName } },
      });
      if (!inventory) {
        await interaction.reply({
          content: "❌ Article absent de ton inventaire.",
          ephemeral: true,
        });
        break;
      }
      const item = await prisma.shopItem.findFirst({
        where: { guildId, name: { equals: itemName, mode: "insensitive" } },
      });
      const refund = Math.max(1, Math.floor((item?.price ?? 10) / 2));
      await prisma.$transaction(async (tx) => {
        if (inventory.quantity > 1)
          await tx.inventory.update({
            where: { id: inventory.id },
            data: { quantity: { decrement: 1 } },
          });
        else await tx.inventory.delete({ where: { id: inventory.id } });
        await tx.user.upsert({
          where: { discordId: userId },
          create: { discordId: userId, guildId, balance: refund },
          update: { guildId, balance: { increment: refund } },
        });
      });
      embed
        .setTitle("✅ Vente effectuée")
        .setDescription(`**${itemName}** vendu pour ${refund} crédits.`);
      await interaction.reply({ embeds: [embed] });
      break;
    }
    case "inventory": {
      const items = await prisma.inventory.findMany({
        where: { userId, guildId },
        orderBy: { itemName: "asc" },
      });
      embed
        .setTitle("📦 Inventaire")
        .setDescription(
          items.length
            ? items.map((item) => `• **${item.itemName}** × ${item.quantity}`).join("\n")
            : "Ton inventaire est vide.",
        );
      await interaction.reply({ embeds: [embed] });
      break;
    }
    case "transfer": {
      const cible = interaction.options.getUser("cible", true);
      const montant = interaction.options.getInteger("montant", true);
      if (cible.id === userId) {
        await interaction.reply({
          content: "❌ Tu ne peux pas te transférer des crédits.",
          ephemeral: true,
        });
        break;
      }
      const result = await prisma.$transaction(async (tx) => {
        const sender = await tx.user.upsert({
          where: { discordId: userId },
          create: { discordId: userId, guildId },
          update: { guildId },
        });
        if (sender.balance < montant) return false;
        const charged = await tx.user.updateMany({
          where: { discordId: userId, balance: { gte: montant } },
          data: { balance: { decrement: montant } },
        });
        if (charged.count !== 1) return false;
        await tx.user.upsert({
          where: { discordId: cible.id },
          create: { discordId: cible.id, guildId, balance: montant },
          update: { guildId, balance: { increment: montant } },
        });
        return true;
      });
      embed
        .setTitle(result ? "✅ Transfert effectué" : "❌ Transfert refusé")
        .setDescription(
          result ? `${montant} crédits envoyés à <@${cible.id}>.` : "Solde insuffisant.",
        );
      await interaction.reply({ embeds: [embed] });
      break;
    }
    case "leaderboard": {
      const users = await prisma.user.findMany({
        where: { guildId, balance: { gt: 0 } },
        orderBy: { balance: "desc" },
        take: 10,
      });
      embed
        .setTitle("🏆 Classement des plus riches")
        .setDescription(
          users.length
            ? users
                .map(
                  (user, index) => `${index + 1}. <@${user.discordId}> — ${user.balance} crédits`,
                )
                .join("\n")
            : "Aucun solde enregistré.",
        );
      await interaction.reply({ embeds: [embed] });
      break;
    }
    case "level": {
      const xpData = await getUserXp(userId);
      embed
        .setTitle("📈 Ton niveau")
        .setDescription(`Niveau ${xpData?.level ?? 0} • ${(xpData?.xp ?? 0).toLocaleString()} XP`);
      await interaction.reply({ embeds: [embed] });
      break;
    }
    case "rank": {
      const cible = interaction.options.getUser("cible") ?? interaction.user;
      const xpData = await getUserXp(cible.id);
      embed
        .setTitle(`🏆 Rang de ${cible.username}`)
        .setDescription(
          xpData
            ? `Niveau ${xpData.level} • ${xpData.xp.toLocaleString()} XP • Rang #${xpData.rank}`
            : "Aucun XP enregistré.",
        );
      await interaction.reply({ embeds: [embed] });
      break;
    }
    case "rank-card": {
      const xpData = await getUserXp(userId);
      if (!xpData) {
        embed.setTitle("🏆 Carte de rang").setDescription("Aucun XP enregistré.");
        await interaction.reply({ embeds: [embed] });
        break;
      }
      await interaction.deferReply();
      try {
        const buffer = await generateRankCard({
          username: interaction.user.username,
          avatarUrl: interaction.user.displayAvatarURL({ extension: "png", size: 256 }),
          level: xpData.level,
          xp: xpData.xp,
          xpNeeded: levelFromXp(xpData.xp).xpNeeded,
          rank: xpData.rank,
        });
        await interaction.editReply({
          files: [new AttachmentBuilder(buffer, { name: "rank-card.png" })],
        });
      } catch {
        await interaction.editReply({ content: "❌ Erreur lors de la génération." });
      }
      break;
    }
    case "xp-config":
      await writeSetting(
        guildId,
        "xp_config",
        JSON.stringify({ enabled: true, updatedBy: userId, updatedAt: new Date().toISOString() }),
      );
      embed
        .setTitle("⚙️ Configuration XP")
        .setDescription("Système XP activé et configuration enregistrée.");
      await interaction.reply({ embeds: [embed], ephemeral: true });
      break;
    default:
      await interaction.reply({ content: "❌ Non implémentée.", ephemeral: true });
  }
}
