/**
 * minecraftGroup.ts — Commandes Discord pour le bot Minecraft Bedrock
 *
 * Subcommands:
 *   /mc connect    — Connecter le bot à un serveur Bedrock
 *   /mc mine       — Démarrer l'auto-mining (strip/branch/tunnel)
 *   /mc stop       — Arrêter le mining
 *   /mc status     — Statut du bot (position, santé, mining)
 *   /mc chat       — Envoyer un message dans le chat Minecraft
 *   /mc disconnect — Déconnecter le bot
 */

import {
  SlashCommandBuilder,
  ChatInputCommandInteraction,
  EmbedBuilder,
  MessageFlags,
} from "discord.js";
import {
  connectBot,
  disconnectBot,
  startMining,
  stopMining,
  getBotStatus,
  getMiningStats,
  sendChat,
  startServerWithSeed,
  stopServer,
  followPlayer,
  stopFollowing,
  giveItem,
  equipTool,
  startFarming,
  stopFarming,
  soloMode,
} from "../services/minecraftBot.js";
import {
  startLink,
  unlink as mcUnlink,
  getLinkedProfile,
  fetchPlayerStats,
} from "../services/minecraftLink.js";
import { buildMinecraftLinkEmbed, buildMinecraftConnectEmbed } from "../utils/gameSetupEmbeds.js";

export const commands = [
  new SlashCommandBuilder()
    .setName("mc")
    .setDescription("Bot Minecraft Bedrock (auto-mining, contrôle)")
    .addSubcommand((sc) =>
      sc
        .setName("connect")
        .setDescription("Connecte le bot à un serveur Minecraft Bedrock")
        .addStringOption((o) =>
          o.setName("ip").setDescription("IP du serveur Bedrock").setRequired(true),
        )
        .addIntegerOption((o) =>
          o.setName("port").setDescription("Port du serveur (défaut: 19132)").setRequired(false),
        )
        .addStringOption((o) =>
          o.setName("pseudo").setDescription("Pseudo du bot").setRequired(false),
        ),
    )
    .addSubcommand((sc) =>
      sc
        .setName("mine")
        .setDescription("Démarre l'auto-mining")
        .addStringOption((o) =>
          o
            .setName("mode")
            .setDescription("Mode de mining")
            .setRequired(false)
            .addChoices(
              { name: "Strip mining (tunnel droit)", value: "strip" },
              { name: "Branch mining (branches perpendiculaires)", value: "branch" },
              { name: "Tunnel (tunnel 1x2)", value: "tunnel" },
            ),
        ),
    )
    .addSubcommand((sc) => sc.setName("stop").setDescription("Arrête l'auto-mining"))
    .addSubcommand((sc) => sc.setName("status").setDescription("Statut du bot Minecraft"))
    .addSubcommand((sc) =>
      sc
        .setName("chat")
        .setDescription("Envoie un message dans le chat Minecraft")
        .addStringOption((o) =>
          o.setName("message").setDescription("Message à envoyer").setRequired(true),
        ),
    )
    .addSubcommand((sc) =>
      sc
        .setName("seed")
        .setDescription("Démarre un serveur Bedrock avec une graine spécifique")
        .addStringOption((o) =>
          o.setName("graine").setDescription("Graine du monde (seed)").setRequired(true),
        )
        .addIntegerOption((o) =>
          o.setName("port").setDescription("Port du serveur (défaut: 19132)").setRequired(false),
        ),
    )
    .addSubcommand((sc) => sc.setName("disconnect").setDescription("Déconnecte le bot Minecraft"))
    .addSubcommand((sc) =>
      sc.setName("stop-server").setDescription("Arrête le serveur Bedrock dédié"),
    )
    // ── Follow ──
    .addSubcommand((sc) =>
      sc
        .setName("follow")
        .setDescription("Le bot suit un joueur")
        .addStringOption((o) =>
          o.setName("joueur").setDescription("Nom du joueur à suivre").setRequired(true),
        ),
    )
    .addSubcommand((sc) => sc.setName("unfollow").setDescription("Arrête de suivre le joueur"))
    // ── Give ──
    .addSubcommand((sc) =>
      sc
        .setName("give")
        .setDescription("Donne un item au joueur le plus proche")
        .addStringOption((o) =>
          o.setName("item").setDescription("Nom de l'item (ex: diamond_sword)").setRequired(true),
        )
        .addIntegerOption((o) =>
          o.setName("quantite").setDescription("Quantité (défaut: 1)").setRequired(false),
        )
        .addStringOption((o) =>
          o.setName("joueur").setDescription("Joueur cible (défaut: toi)").setRequired(false),
        ),
    )
    // ── Equip ──
    .addSubcommand((sc) =>
      sc
        .setName("equip")
        .setDescription("Équipe un outil dans la main du bot")
        .addStringOption((o) =>
          o
            .setName("outil")
            .setDescription("Type d'outil")
            .setRequired(true)
            .addChoices(
              { name: "⚔️ Épée", value: "sword" },
              { name: "⛏️ Pioche", value: "pickaxe" },
              { name: "🪓 Hache", value: "axe" },
              { name: "🪏 Pelle", value: "shovel" },
              { name: "🌾 Houe", value: "hoe" },
              { name: "🏹 Arc", value: "bow" },
              { name: "🏹 Arbalète", value: "crossbow" },
              { name: "🛡️ Bouclier", value: "shield" },
              { name: "🔥 Briquet", value: "flint_and_steel" },
              { name: "🎣 Canne à pêche", value: "fishing_rod" },
              { name: "✂️ Cisailles", value: "shears" },
            ),
        ),
    )
    // ── Farm ──
    .addSubcommand((sc) =>
      sc
        .setName("farm")
        .setDescription("Agriculture automatique")
        .addStringOption((o) =>
          o
            .setName("mode")
            .setDescription("Mode d'agriculture")
            .setRequired(true)
            .addChoices(
              { name: "🌱 Planter", value: "plant" },
              { name: "🌾 Récolter", value: "harvest" },
              { name: "🪏 Labourer", value: "till" },
            ),
        )
        .addStringOption((o) =>
          o
            .setName("culture")
            .setDescription("Type de culture")
            .setRequired(false)
            .addChoices(
              { name: "🌾 Blé", value: "wheat" },
              { name: "🥕 Carotte", value: "carrot" },
              { name: "🥔 Pomme de terre", value: "potato" },
              { name: "🫐 Betterave", value: "beetroot" },
              { name: "🎃 Citrouille", value: "pumpkin" },
              { name: "🍉 Pastèque", value: "melon" },
            ),
        ),
    )
    .addSubcommand((sc) => sc.setName("stop-farm").setDescription("Arrête l'agriculture"))
    // ── Solo (tout-en-un) ──
    .addSubcommand((sc) =>
      sc
        .setName("solo")
        .setDescription("Démarre un serveur + connecte le bot + mine automatiquement (tout-en-un)")
        .addStringOption((o) =>
          o
            .setName("graine")
            .setDescription("Graine du monde (aléatoire si vide)")
            .setRequired(false),
        )
        .addBooleanOption((o) =>
          o
            .setName("miner")
            .setDescription("Démarrer le mining automatiquement (défaut: oui)")
            .setRequired(false),
        )
        .addStringOption((o) =>
          o
            .setName("mode")
            .setDescription("Mode de mining")
            .setRequired(false)
            .addChoices(
              { name: "Strip mining (tunnel droit)", value: "strip" },
              { name: "Branch mining (branches)", value: "branch" },
              { name: "Tunnel (1x2)", value: "tunnel" },
            ),
        ),
    )
    // ── Liaison compte Minecraft ──
    .addSubcommand((sc) =>
      sc
        .setName("link")
        .setDescription("Lier ton compte Minecraft à ton Discord")
        .addStringOption((o) =>
          o
            .setName("gamertag")
            .setDescription("Ton gamertag Minecraft (Java ou Bedrock)")
            .setRequired(true)
            .setMinLength(3)
            .setMaxLength(16),
        ),
    )
    .addSubcommand((sc) => sc.setName("unlink").setDescription("Détacher ton compte Minecraft"))
    .addSubcommand((sc) => sc.setName("profile").setDescription("Affiche ton profil Minecraft lié"))
    .addSubcommand((sc) =>
      sc
        .setName("stats")
        .setDescription("Affiche les stats d'un joueur Minecraft")
        .addStringOption((o) =>
          o
            .setName("pseudo")
            .setDescription("Pseudo Minecraft (ou ton compte lié si vide)")
            .setRequired(false),
        ),
    )
    .toJSON(),
];

export async function handleCommand(interaction: ChatInputCommandInteraction): Promise<void> {
  const action = interaction.options.getSubcommand();

  switch (action) {
    case "connect": {
      const ip = interaction.options.getString("ip", true);
      const port = interaction.options.getInteger("port") ?? 19132;
      const pseudo =
        interaction.options.getString("pseudo") ?? `Bot_${Math.floor(Math.random() * 9999)}`;

      await interaction.deferReply({ flags: [MessageFlags.Ephemeral] });

      const result = await connectBot({
        host: ip,
        port,
        username: pseudo,
        offline: true,
      });

      if (result.success) {
        const embed = buildMinecraftConnectEmbed(ip, port, pseudo);
        await interaction.editReply({ embeds: [embed] });
      } else {
        await interaction.editReply({ content: result.message });
      }
      break;
    }

    case "mine": {
      const mode = (interaction.options.getString("mode") ?? "strip") as
        "strip" | "branch" | "tunnel";
      const result = startMining(mode);
      await interaction.reply({ content: result.message, flags: [MessageFlags.Ephemeral] });
      break;
    }

    case "stop": {
      const result = stopMining();
      await interaction.reply({ content: result.message, flags: [MessageFlags.Ephemeral] });
      break;
    }

    case "status": {
      const status = getBotStatus();

      if (!status.connected) {
        await interaction.reply({
          content: "❌ Le bot Minecraft n'est pas connecté. Utilise `/mc connect` d'abord.",
          flags: [MessageFlags.Ephemeral],
        });
        return;
      }

      const stats = getMiningStats();
      const embed = new EmbedBuilder()
        .setTitle("⛏️ Bot Minecraft — Statut")
        .setColor(status.mining ? 0x00ff00 : 0x808080)
        .addFields(
          {
            name: "🔗 Connexion",
            value: `**Serveur:** \`${status.host}\`\n**Pseudo:** \`${status.username}\`\n**Uptime:** ${formatUptime(status.uptime)}`,
          },
          {
            name: "📍 Position",
            value: status.position
              ? `X: ${status.position.x} | Y: ${status.position.y} | Z: ${status.position.z}`
              : "Inconnue",
          },
          {
            name: "❤️ Santé",
            value: `**Vie:** ${"❤".repeat(Math.ceil(status.health / 2))} (${status.health}/20)\n**Faim:** ${"🍗".repeat(Math.ceil(status.hunger / 2))} (${status.hunger}/20)`,
          },
          {
            name: "⛏️ Mining",
            value: status.mining
              ? `**Mode:** ${stats.mode}\n**Blocs minés:** ${stats.blocksMined}\n**Durée:** ${stats.duration}`
              : "Inactif",
          },
        )
        .setTimestamp();

      await interaction.reply({ embeds: [embed], flags: [MessageFlags.Ephemeral] });
      break;
    }

    case "chat": {
      const message = interaction.options.getString("message", true);
      const result = sendChat(message);
      await interaction.reply({ content: result.message, flags: [MessageFlags.Ephemeral] });
      break;
    }

    case "seed": {
      const seed = interaction.options.getString("graine", true);
      const port = interaction.options.getInteger("port") ?? 19132;

      await interaction.deferReply({ flags: [MessageFlags.Ephemeral] });

      const result = await startServerWithSeed(seed, port);
      await interaction.editReply({ content: result.message });
      break;
    }

    case "stop-server": {
      const result = stopServer();
      await interaction.reply({ content: result.message, flags: [MessageFlags.Ephemeral] });
      break;
    }

    case "follow": {
      const username = interaction.options.getString("joueur", true);
      const result = followPlayer(username);
      await interaction.reply({ content: result.message, flags: [MessageFlags.Ephemeral] });
      break;
    }

    case "unfollow": {
      const result = stopFollowing();
      await interaction.reply({ content: result.message, flags: [MessageFlags.Ephemeral] });
      break;
    }

    case "give": {
      const item = interaction.options.getString("item", true);
      const qty = interaction.options.getInteger("quantite") ?? 1;
      const target = interaction.options.getString("joueur") ?? undefined;
      const result = giveItem(item, qty, target);
      await interaction.reply({ content: result.message, flags: [MessageFlags.Ephemeral] });
      break;
    }

    case "equip": {
      const tool = interaction.options.getString("outil", true);
      const result = equipTool(tool);
      await interaction.reply({ content: result.message, flags: [MessageFlags.Ephemeral] });
      break;
    }

    case "farm": {
      const mode = interaction.options.getString("mode", true) as "plant" | "harvest" | "till";
      const crop = interaction.options.getString("culture") ?? "wheat";
      const result = startFarming(mode, crop);
      await interaction.reply({ content: result.message, flags: [MessageFlags.Ephemeral] });
      break;
    }

    case "stop-farm": {
      const result = stopFarming();
      await interaction.reply({ content: result.message, flags: [MessageFlags.Ephemeral] });
      break;
    }

    case "solo": {
      const seed = interaction.options.getString("graine") ?? undefined;
      const autoMine = interaction.options.getBoolean("miner") ?? true;
      const mineMode = (interaction.options.getString("mode") ?? "strip") as
        "strip" | "branch" | "tunnel";

      await interaction.deferReply({ flags: [MessageFlags.Ephemeral] });

      const result = await soloMode(seed, 19132, autoMine, mineMode);
      await interaction.editReply({ content: result.message });
      break;
    }

    case "link": {
      const gamertag = interaction.options.getString("gamertag", true);
      await interaction.deferReply({ flags: [MessageFlags.Ephemeral] });
      const result = await startLink(interaction.user.id, gamertag);
      if (result.success && result.code) {
        const embed = buildMinecraftLinkEmbed(gamertag, result.code);
        await interaction.editReply({ embeds: [embed] });
      } else {
        await interaction.editReply({ content: result.message });
      }
      break;
    }

    case "unlink": {
      await interaction.deferReply({ flags: [MessageFlags.Ephemeral] });
      const result = await mcUnlink(interaction.user.id);
      await interaction.editReply({ content: result.message });
      break;
    }

    case "profile": {
      await interaction.deferReply({ flags: [MessageFlags.Ephemeral] });
      const profile = await getLinkedProfile(interaction.user.id);
      if (!profile) {
        await interaction.editReply({
          content: "❌ Tu n'as pas de compte Minecraft lié. Utilise `/mc link` d'abord.",
        });
        break;
      }

      const embed = new EmbedBuilder()
        .setTitle("🎮 Profil Minecraft")
        .setColor(profile.verified ? 0x4a9b4a : 0xffaa00)
        .setDescription(
          profile.verified
            ? `✅ Compte **vérifié**`
            : `⏳ Vérification en attente. Tape \`/verify ${profile.verifyCode}\` dans le chat Minecraft.`,
        )
        .addFields(
          { name: "Gamertag", value: profile.gamertag, inline: true },
          { name: "UUID", value: profile.uuid ? `\`${profile.uuid}\`` : "N/A", inline: true },
          {
            name: "Statut",
            value: profile.verified ? "✅ Vérifié" : "⏳ En attente",
            inline: true,
          },
          {
            name: "Lié le",
            value: `<t:${Math.floor(profile.linkedAt.getTime() / 1000)}:R>`,
            inline: true,
          },
        )
        .setTimestamp();

      if (profile.verified && profile.uuid) {
        embed.setThumbnail(`https://crafatar.com/avatars/${profile.uuid}?size=128&overlay`);
      }

      await interaction.editReply({ embeds: [embed] });
      break;
    }

    case "stats": {
      const pseudo = interaction.options.getString("pseudo");
      await interaction.deferReply({ flags: [MessageFlags.Ephemeral] });

      let username = pseudo;
      if (!username) {
        const profile = await getLinkedProfile(interaction.user.id);
        if (!profile?.verified) {
          await interaction.editReply({
            content:
              "❌ Tu n'as pas de compte Minecraft lié. Utilise `/mc link` ou précise un pseudo.",
          });
          break;
        }
        username = profile.gamertag;
      }

      const stats = await fetchPlayerStats(username);
      if (!stats) {
        await interaction.editReply({
          content: `❌ Joueur **${username}** introuvable. Vérifie le pseudo (préfixe avec \`.\` pour Bedrock).`,
        });
        break;
      }

      const embed = new EmbedBuilder()
        .setTitle(`📊 Stats Minecraft — ${stats.username}`)
        .setColor(stats.platform === "java" ? 0x4a9b4a : 0xb86b34)
        .setThumbnail(stats.avatarUrl)
        .addFields(
          { name: "Pseudo", value: stats.username, inline: true },
          { name: "UUID", value: `\`${stats.uuid}\``, inline: true },
          {
            name: "Plateforme",
            value: stats.platform === "java" ? "☕ Java Edition" : "🟫 Bedrock",
            inline: true,
          },
        )
        .setTimestamp();

      if (stats.nameHistory && stats.nameHistory.length > 1) {
        const history = stats.nameHistory
          .slice(-10)
          .map(
            (n) =>
              `${n.name}${n.changedToAt ? ` (<t:${Math.floor(n.changedToAt / 1000)}:R>)` : " (original)"}`,
          )
          .join("\n");
        embed.addFields({ name: "Historique des pseudos", value: history, inline: false });
      }

      embed.setImage(stats.skinUrl);

      await interaction.editReply({ embeds: [embed] });
      break;
    }

    case "disconnect": {
      const result = disconnectBot();
      await interaction.reply({ content: result.message, flags: [MessageFlags.Ephemeral] });
      break;
    }

    default:
      await interaction.reply({
        content: "❌ Subcommand inconnue.",
        flags: [MessageFlags.Ephemeral],
      });
  }
}

function formatUptime(seconds: number): string {
  if (seconds < 60) return `${seconds}s`;
  if (seconds < 3600) return `${Math.floor(seconds / 60)}m${seconds % 60}s`;
  return `${Math.floor(seconds / 3600)}h${Math.floor((seconds % 3600) / 60)}m`;
}
