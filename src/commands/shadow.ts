/**
 * shadow.ts — Commandes /shadow (Shadow Broker Intelligence)
 *
 * Subcommands (6 core) :
 *  /shadow intel <user>      — Profil d'intelligence complet d'un membre
 *  /shadow network <user>    — Cartographie des liens d'un membre
 *  /shadow patterns          — Détection de patterns suspects sur le serveur
 *  /shadow report            — Rapport global d'intelligence
 *  /shadow stealth on|off    — Active/désactive le mode stealth (alertes DM)
 *  /shadow watch <user>      — Surveille un membre (alertes DM en temps réel)
 *
 * OSINT tools moved to /osint (osint.ts) — 23 subcommands
 */

import {
  SlashCommandBuilder,
  ChatInputCommandInteraction,
  EmbedBuilder,
  MessageFlags,
} from "discord.js";
import { config } from "../config.js";
import logger from "../utils/logger.js";
import { PermissionLevel, getPermissionLevel } from "../services/permissions.js";
import {
  getMemberIntel,
  getMemberNetwork,
  detectSuspiciousPatterns,
  generateIntelReport,
  enableStealth,
  disableStealth,
  sendStealthAlert,
} from "../services/shadowBroker.js";

export const commands = [
  new SlashCommandBuilder()
    .setName("shadow")
    .setDescription("🕵️ Shadow Broker — Intelligence & surveillance serveur")
    .addSubcommand((sub) =>
      sub
        .setName("intel")
        .setDescription("Profil d'intelligence complet d'un membre")
        .addUserOption((opt) =>
          opt.setName("membre").setDescription("Le membre à analyser").setRequired(true),
        ),
    )
    .addSubcommand((sub) =>
      sub
        .setName("network")
        .setDescription("Cartographie des liens d'un membre")
        .addUserOption((opt) =>
          opt.setName("membre").setDescription("Le membre à analyser").setRequired(true),
        ),
    )
    .addSubcommand((sub) =>
      sub.setName("patterns").setDescription("Détecte les patterns suspects sur le serveur"),
    )
    .addSubcommand((sub) =>
      sub.setName("report").setDescription("Rapport global d'intelligence du serveur"),
    )
    .addSubcommand((sub) =>
      sub
        .setName("stealth")
        .setDescription("Active/désactive le mode stealth (alertes DM uniquement)")
        .addStringOption((opt) =>
          opt
            .setName("etat")
            .setDescription("on ou off")
            .setRequired(true)
            .addChoices({ name: "on", value: "on" }, { name: "off", value: "off" }),
        ),
    )
    .addSubcommand((sub) =>
      sub
        .setName("watch")
        .setDescription("Surveille un membre — alertes DM en temps réel")
        .addUserOption((opt) =>
          opt.setName("membre").setDescription("Le membre à surveiller").setRequired(true),
        ),
    ),
];

export async function handleCommand(interaction: ChatInputCommandInteraction) {
  const sub = interaction.options.getSubcommand();

  // Sous-commandes réservées à l'owner uniquement
  const ownerOnlySubs = ["stealth", "watch", "report"];
  if (ownerOnlySubs.includes(sub)) {
    if (interaction.user.id !== config.ownerId) {
      await interaction.reply({
        content: "❌ Cette sous-commande est réservée au propriétaire du bot.",
        flags: [MessageFlags.Ephemeral],
      });
      return;
    }
  } else {
    // Toutes les autres sous-commandes : modérateur minimum
    const member = interaction.member;
    if (member && "roles" in member) {
      const permLevel = await getPermissionLevel(member as any);
      if (permLevel < PermissionLevel.MODERATOR && interaction.user.id !== config.ownerId) {
        await interaction.reply({
          content: "❌ Cette commande nécessite au minimum le grade **Modérateur**.",
          flags: [MessageFlags.Ephemeral],
        });
        return;
      }
    } else if (interaction.user.id !== config.ownerId) {
      await interaction.reply({
        content: "❌ Cette commande nécessite au minimum le grade **Modérateur**.",
        flags: [MessageFlags.Ephemeral],
      });
      return;
    }
  }

  switch (sub) {
    case "intel":
      return handleIntel(interaction);
    case "network":
      return handleNetwork(interaction);
    case "patterns":
      return handlePatterns(interaction);
    case "report":
      return handleReport(interaction);
    case "stealth":
      return handleStealth(interaction);
    case "watch":
      return handleWatch(interaction);
    default:
      await interaction.reply({
        content: "Sous-commande inconnue.",
        flags: [MessageFlags.Ephemeral],
      });
  }
}

// ─── /shadow intel ───────────────────────────────────────────────────────────

async function handleIntel(interaction: ChatInputCommandInteraction) {
  const user = interaction.options.getUser("membre", true);
  await interaction.deferReply({ flags: [MessageFlags.Ephemeral] });

  if (!interaction.guild) {
    await interaction.editReply({ content: "Commande à utiliser dans un serveur." });
    return;
  }

  try {
    const member = await interaction.guild.members.fetch(user.id).catch(() => null);
    if (!member) {
      await interaction.editReply({ content: "Membre introuvable." });
      return;
    }

    const intel = await getMemberIntel(member);

    const embed = new EmbedBuilder()
      .setTitle(`🕵️ Shadow Broker — Intel: ${intel.tag}`)
      .setThumbnail(intel.avatarUrl)
      .setColor(0x00ff41)
      .setTimestamp();

    // Infos de base
    embed.addFields(
      {
        name: "📅 Compte créé",
        value: `<t:${Math.floor(intel.accountCreatedAt.getTime() / 1000)}:R>`,
        inline: true,
      },
      {
        name: "📥 A rejoint",
        value: intel.joinedAt ? `<t:${Math.floor(intel.joinedAt.getTime() / 1000)}:R>` : "Inconnu",
        inline: true,
      },
      {
        name: "🎭 Rôles",
        value: intel.roles.length > 0 ? intel.roles.join(", ") : "Aucun",
        inline: false,
      },
    );

    // Stats
    embed.addFields(
      { name: "📊 Score d'activité", value: String(intel.activityScore), inline: true },
      { name: "⚖️ Sanctions", value: String(intel.sanctionCount), inline: true },
      {
        name: "🔴 Risque",
        value: `${intel.riskScore} (${intel.riskLevel})`,
        inline: true,
      },
      { name: "🔄 Changements pseudo", value: String(intel.nameChanges), inline: true },
      { name: "🖼️ Changements avatar", value: String(intel.avatarChanges), inline: true },
      {
        name: "🕐 Dernière activité",
        value: intel.lastActive
          ? `<t:${Math.floor(intel.lastActive.getTime() / 1000)}:R>`
          : "Aucune",
        inline: true,
      },
    );

    // Flags suspects
    if (intel.suspiciousFlags.length > 0) {
      embed.addFields({
        name: "⚠️ Flags suspects",
        value: intel.suspiciousFlags.join("\n"),
        inline: false,
      });
    }

    // Comptes liés
    if (intel.linkedAccounts.length > 0) {
      const linkedText = intel.linkedAccounts
        .map((l) => `**${l.tag}** (${l.confidence}%)\n> ${l.reasons.join(", ")}`)
        .join("\n");
      embed.addFields({
        name: "🔗 Comptes liés (alt-accounts)",
        value: linkedText,
        inline: false,
      });
    }

    await interaction.editReply({ embeds: [embed] });
  } catch (error) {
    logger.error("[Shadow/intel] Erreur:", error);
    await interaction.editReply({
      content: "Erreur lors de la collecte d'intelligence.",
    });
  }
}

// ─── /shadow network ─────────────────────────────────────────────────────────

async function handleNetwork(interaction: ChatInputCommandInteraction) {
  const user = interaction.options.getUser("membre", true);
  await interaction.deferReply({ flags: [MessageFlags.Ephemeral] });

  if (!interaction.guild) {
    await interaction.editReply({ content: "Commande à utiliser dans un serveur." });
    return;
  }

  try {
    const member = await interaction.guild.members.fetch(user.id).catch(() => null);
    if (!member) {
      await interaction.editReply({ content: "Membre introuvable." });
      return;
    }

    const network = await getMemberNetwork(member);

    const embed = new EmbedBuilder()
      .setTitle(`🕸️ Shadow Broker — Réseau: ${network.tag}`)
      .setColor(0x2d2d44)
      .setTimestamp();

    if (network.connections.length === 0) {
      embed.setDescription("Aucune connexion significative détectée.");
    } else {
      const connectionsText = network.connections
        .map((c) => `**${c.targetTag}** — Force: ${c.strength}%\n> ${c.reasons.join(", ")}`)
        .join("\n\n");
      embed.setDescription(connectionsText);
      embed.setFooter({ text: `${network.connections.length} connexion(s) détectée(s)` });
    }

    await interaction.editReply({ embeds: [embed] });
  } catch (error) {
    logger.error("[Shadow/network] Erreur:", error);
    await interaction.editReply({ content: "Erreur lors de la cartographie." });
  }
}

// ─── /shadow patterns ────────────────────────────────────────────────────────

async function handlePatterns(interaction: ChatInputCommandInteraction) {
  await interaction.deferReply({ flags: [MessageFlags.Ephemeral] });

  if (!interaction.guild) {
    await interaction.editReply({ content: "Commande à utiliser dans un serveur." });
    return;
  }

  try {
    const patterns = await detectSuspiciousPatterns(interaction.client, interaction.guild.id);

    const embed = new EmbedBuilder()
      .setTitle("🔍 Shadow Broker — Patterns suspects détectés")
      .setColor(0x00ff41)
      .setTimestamp();

    if (patterns.length === 0) {
      embed.setDescription("✅ Aucun pattern suspect détecté sur le serveur.");
    } else {
      const severityEmojis: Record<string, string> = {
        critical: "🔴",
        high: "🟠",
        medium: "🟡",
        low: "🟢",
      };

      const patternsText = patterns
        .slice(0, 10)
        .map(
          (p) =>
            `${severityEmojis[p.severity]} **[${p.severity.toUpperCase()}]** ${p.type}\n> ${p.description}\n> 👤 ${p.userTag}`,
        )
        .join("\n\n");

      embed.setDescription(patternsText);
      embed.setFooter({ text: `${patterns.length} pattern(s) au total` });
      embed.setColor(patterns[0]?.severity === "critical" ? 0xff0000 : 0xff6600);
    }

    await interaction.editReply({ embeds: [embed] });
  } catch (error) {
    logger.error("[Shadow/patterns] Erreur:", error);
    await interaction.editReply({ content: "Erreur lors de la détection." });
  }
}

// ─── /shadow report ──────────────────────────────────────────────────────────

async function handleReport(interaction: ChatInputCommandInteraction) {
  await interaction.deferReply({ flags: [MessageFlags.Ephemeral] });

  if (!interaction.guild) {
    await interaction.editReply({ content: "Commande à utiliser dans un serveur." });
    return;
  }

  try {
    const report = await generateIntelReport(interaction.client, interaction.guild.id);

    const embed = new EmbedBuilder()
      .setTitle("📊 Shadow Broker — Rapport d'intelligence serveur")
      .setColor(0x00ff41)
      .setTimestamp();

    embed.addFields(
      { name: "👥 Membres totaux", value: String(report.totalMembers), inline: true },
      { name: "🟠 Risque élevé", value: String(report.highRiskCount), inline: true },
      { name: "🔴 Risque critique", value: String(report.criticalRiskCount), inline: true },
      { name: "⚖️ Sanctions totales", value: String(report.totalSanctions), inline: true },
      { name: "📥 Joins (24h)", value: String(report.recentJoins), inline: true },
      {
        name: "🔍 Patterns suspects",
        value: String(report.suspiciousPatterns.length),
        inline: true,
      },
    );

    // Top risque
    if (report.topRiskMembers.length > 0) {
      const topText = report.topRiskMembers
        .map(
          (m, i) =>
            `${i + 1}. <@${m.userId}> — Score: ${m.riskScore} | ${m.riskLevel} | ${m.totalSanctions} sanction(s)`,
        )
        .join("\n");
      embed.addFields({
        name: "🏆 Top 10 risque",
        value: topText,
        inline: false,
      });
    }

    // Patterns critiques
    const criticalPatterns = report.suspiciousPatterns.filter(
      (p) => p.severity === "critical" || p.severity === "high",
    );
    if (criticalPatterns.length > 0) {
      embed.addFields({
        name: "⚠️ Alertes critiques",
        value: criticalPatterns
          .slice(0, 5)
          .map((p) => `**[${p.severity}]** ${p.description}`)
          .join("\n"),
        inline: false,
      });
    }

    await interaction.editReply({ embeds: [embed] });
  } catch (error) {
    logger.error("[Shadow/report] Erreur:", error);
    await interaction.editReply({ content: "Erreur lors de la génération du rapport." });
  }
}

// ─── /shadow stealth ─────────────────────────────────────────────────────────

async function handleStealth(interaction: ChatInputCommandInteraction) {
  const state = interaction.options.getString("etat", true);
  const guildId = interaction.guildId!;

  if (state === "on") {
    enableStealth(guildId);
    await interaction.reply({
      content: "🕵️ Mode stealth **activé**. Les alertes seront envoyées en DM uniquement.",
      flags: [MessageFlags.Ephemeral],
    });
  } else {
    disableStealth(guildId);
    await interaction.reply({
      content: "📡 Mode stealth **désactivé**. Les alertes reprennent normalement.",
      flags: [MessageFlags.Ephemeral],
    });
  }
}

// ─── /shadow watch ───────────────────────────────────────────────────────────

const watchedMembers = new Map<string, Set<string>>(); // userId -> Set<guildId>

async function handleWatch(interaction: ChatInputCommandInteraction) {
  const user = interaction.options.getUser("membre", true);
  const guildId = interaction.guildId!;

  if (!watchedMembers.has(user.id)) {
    watchedMembers.set(user.id, new Set());
  }
  const watched = watchedMembers.get(user.id)!;

  if (watched.has(guildId)) {
    watched.delete(guildId);
    await interaction.reply({
      content: `👁️ Surveillance de **${user.tag}** désactivée sur ce serveur.`,
      flags: [MessageFlags.Ephemeral],
    });
  } else {
    watched.add(guildId);
    await interaction.reply({
      content: `👁️ **${user.tag}** est maintenant sous surveillance. Tu recevras des alertes DM en temps réel.`,
      flags: [MessageFlags.Ephemeral],
    });

    // Alert DM immédiate
    await sendStealthAlert(
      interaction.client,
      "Surveillance activée",
      `**${user.tag}** (${user.id}) est maintenant surveillé sur le serveur **${interaction.guild?.name}**.`,
    );
  }
}

export function isWatched(userId: string, guildId: string): boolean {
  return watchedMembers.get(userId)?.has(guildId) ?? false;
}
