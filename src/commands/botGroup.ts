import {
  ChatInputCommandInteraction,
  SlashCommandBuilder,
  Client,
  EmbedBuilder,
  ButtonBuilder,
  ButtonStyle,
  ActionRowBuilder,
} from "discord.js";
import { handleCommand as handleMain } from "./main.js";
import { handleCommand as handleExtraCmd } from "./extraCommands.js";
import { handleCommand as handleDashboard } from "./dashboard.js";
import { handleCommand as handleUptime } from "./uptime.js";

import { handleBotExtra } from "./stubHandlers.js";
import { getShardStats, restartShard, isSharded, getShardCount } from "../shardManager.js";
import { requireAdmin } from "../services/permissions.js";

export const commands = [
  new SlashCommandBuilder()
    .setName("bot")
    .setDescription("Commandes principales du bot")
    .addSubcommand((sc) => sc.setName("start").setDescription("Démarre le bot"))
    .addSubcommand((sc) => sc.setName("help").setDescription("Affiche l'aide"))
    .addSubcommand((sc) => sc.setName("restart").setDescription("Redémarre le bot (admin)"))
    .addSubcommand((sc) => sc.setName("status").setDescription("Statut du bot"))
    .addSubcommand((sc) => sc.setName("uptime").setDescription("Statistiques d'exécution"))
    .addSubcommand((sc) => sc.setName("server-info").setDescription("Infos du serveur"))
    .addSubcommand((sc) =>
      sc
        .setName("userinfo")
        .setDescription("Infos d'un utilisateur")
        .addUserOption((o) =>
          o.setName("cible").setDescription("L'utilisateur").setRequired(false),
        ),
    )
    .addSubcommand((sc) => sc.setName("dashboard").setDescription("Dashboard de gestion (admin)"))
    .addSubcommand((sc) =>
      sc.setName("shadowbroker").setDescription("Ouvre le dashboard Shadow Broker"),
    )
    // ─── Nouvelles sous-commandes bot ───
    .addSubcommand((sc) =>
      sc
        .setName("invite")
        .setDescription("Génère un lien d'invitation du bot")
        .addStringOption((o) => o.setName("permissions").setDescription("Niveau de permissions (bitfield)").setRequired(false)),
    )
    .addSubcommand((sc) => sc.setName("stats").setDescription("Statistiques détaillées du bot"))
    .addSubcommand((sc) => sc.setName("ping").setDescription("Latence du bot"))
    .addSubcommand((sc) => sc.setName("changelog").setDescription("Derniers changements du bot"))
    .addSubcommand((sc) => sc.setName("vote").setDescription("Vote pour le bot sur les listes"))
    .addSubcommand((sc) => sc.setName("support").setDescription("Serveur support et documentation"))
    .addSubcommand((sc) => sc.setName("privacy").setDescription("Politique de confidentialité"))
    .addSubcommand((sc) => sc.setName("commands-list").setDescription("Liste toutes les commandes disponibles"))
    .addSubcommand((sc) => sc.setName("shard-stats").setDescription("Statut des shards (admin)"))
    .addSubcommand((sc) =>
      sc
        .setName("shard-restart")
        .setDescription("Redémarre un shard spécifique (admin)")
        .addIntegerOption((o) =>
          o.setName("shard_id").setDescription("ID du shard à redémarrer").setRequired(true).setMinValue(0),
        ),
    )
    .toJSON(),
];

const MAIN_SUBS = ["start", "help", "restart", "status"];
const EXTRA_SUBS = ["server-info", "userinfo"];

export async function handleCommand(interaction: ChatInputCommandInteraction, client: unknown) {
  const dc = client as Client;
  const action = interaction.options.getSubcommand();

  if (MAIN_SUBS.includes(action)) {
    Object.defineProperty(interaction, "commandName", { value: action, writable: true });
    await handleMain(interaction, dc);
  } else if (action === "uptime") {
    Object.defineProperty(interaction, "commandName", { value: "uptime", writable: true });
    await handleUptime(interaction);
  } else if (EXTRA_SUBS.includes(action)) {
    Object.defineProperty(interaction, "commandName", { value: action, writable: true });
    await handleExtraCmd(interaction, dc);
  } else if (action === "dashboard") {
    Object.defineProperty(interaction, "commandName", { value: "dashboard", writable: true });
    await handleDashboard(interaction, dc);
  } else if (action === "shadowbroker") {
    const dashboardUrl =
      process.env.DASHBOARD_URL || "https://dashboard-bot-helldivers-production.up.railway.app";
    const embed = new EmbedBuilder()
      .setColor(0x2f3136)
      .setTitle("🕵️ Shadow Broker")
      .setDescription("Clique sur un des boutons ci-dessous pour ouvrir le dashboard ou l'outil.")
      .addFields(
        { name: "📊 Dashboard Bot", value: "Gestion du bot, stats, config serveurs", inline: true },
        {
          name: "🔍 EQGRP Lost in Translation",
          value: "Equation Group — outils déchiffrés",
          inline: true,
        },
      )
      .setTimestamp();
    const row = new ActionRowBuilder<ButtonBuilder>().addComponents(
      new ButtonBuilder().setLabel("Dashboard Bot").setStyle(ButtonStyle.Link).setURL(dashboardUrl),
      new ButtonBuilder()
        .setLabel("EQGRP Lost in Translation")
        .setStyle(ButtonStyle.Link)
        .setURL("https://github.com/x0rz/EQGRP_Lost_in_Translation"),
    );
    await interaction.reply({ embeds: [embed], components: [row] });
  } else if (action === "shard-stats") {
    await handleShardStats(interaction);
  } else if (action === "shard-restart") {
    await handleShardRestart(interaction);
  } else {
    await handleBotExtra(interaction, dc);
  }
}

async function handleShardStats(interaction: ChatInputCommandInteraction): Promise<void> {
  if (!(await requireAdmin(interaction))) return;

  const sharded = isSharded();
  const count = getShardCount();

  if (!sharded) {
    await interaction.reply({
      content: `ℹ️ Le bot tourne en mode **single** (pas de sharding).\nPour activer le sharding : \`FORCE_SHARDING=true\` dans le .env`,
      ephemeral: true,
    });
    return;
  }

  await interaction.deferReply({ ephemeral: true });

  try {
    const stats = await getShardStats();
    if (stats.length === 0) {
      await interaction.editReply("❌ Aucune donnée de shard disponible.");
      return;
    }

    const embed = new EmbedBuilder()
      .setTitle("📊 Statut des Shards")
      .setColor(0x5865f2)
      .setDescription(`${stats.length} shard(s) — Total: ${count}`);

    let totalGuilds = 0;
    let totalPing = 0;
    let connectedCount = 0;

    for (const stat of stats) {
      const statusEmoji =
        stat.status === "connected" ? "🟢" : stat.status === "disconnected" ? "🔴" : "❌";
      embed.addFields({
        name: `${statusEmoji} Shard ${stat.id}`,
        value: `**Ping:** ${stat.ping}ms\n**Guildes:** ${stat.guilds}\n**Statut:** ${stat.status}`,
        inline: true,
      });
      totalGuilds += stat.guilds;
      if (stat.ping > 0) totalPing += stat.ping;
      if (stat.status === "connected") connectedCount++;
    }

    embed.setFooter({
      text: `${connectedCount}/${stats.length} connectés • ${totalGuilds} guildes • ${Math.round(totalPing / stats.length)}ms avg`,
    });

    await interaction.editReply({ embeds: [embed] });
  } catch (error) {
    await interaction.editReply(`❌ Erreur: ${error instanceof Error ? error.message : "erreur inconnue"}`);
  }
}

async function handleShardRestart(interaction: ChatInputCommandInteraction): Promise<void> {
  if (!(await requireAdmin(interaction))) return;

  const shardId = interaction.options.getInteger("shard_id", true);

  if (!isSharded()) {
    await interaction.reply({
      content: "❌ Le bot n'est pas en mode sharded. Impossible de redémarrer un shard.",
      ephemeral: true,
    });
    return;
  }

  await interaction.deferReply({ ephemeral: true });

  const restarted = await restartShard(shardId);
  await interaction.editReply(
    restarted
      ? `✅ Shard ${shardId} redémarré avec succès.`
      : `❌ Impossible de redémarrer le shard ${shardId} (introuvable ou erreur).`,
  );
}
