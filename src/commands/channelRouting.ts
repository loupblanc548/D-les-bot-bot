/**
 * channelRouting.ts — Commande /channel-routing
 *
 * Permet de configurer dynamiquement quel type de contenu va dans quel salon.
 * Stocke la config en base (model Setting) par guild.
 * Au démarrage, le bot fusionne .env + config DB (DB prioritaire).
 *
 * Subcommands:
 *   - list         : Affiche le routage actuel
 *   - set          : Définit le salon pour un type de contenu
 *   - reset        : Réinitialise un type (retour au .env)
 *   - reset-all    : Réinitialise tout
 */

import {
  ChatInputCommandInteraction,
  SlashCommandBuilder,
  EmbedBuilder,
  MessageFlags,
  ChannelType,
  TextChannel,
} from "discord.js";
import { prisma } from "../prisma.js";
import logger from "../utils/logger.js";

// ─── Types de contenu routables ──────────────────────────────────────────────

interface ContentType {
  key: string;
  label: string;
  description: string;
  emoji: string;
  envFallback: string;
}

const CONTENT_TYPES: ContentType[] = [
  {
    key: "steam_epic",
    label: "Steam/Epic Games",
    description: "News Steam et Epic Games",
    emoji: "🎮",
    envFallback: "STEAM_EPIC_CHANNEL_ID",
  },
  {
    key: "steam_news",
    label: "Steam News",
    description: "News Steam dédiées",
    emoji: "📰",
    envFallback: "STEAM_NEWS_CHANNEL_ID",
  },
  {
    key: "playstation",
    label: "PlayStation",
    description: "News PlayStation",
    emoji: "🎮",
    envFallback: "PLAYSTATION_CHANNEL_ID",
  },
  {
    key: "xbox",
    label: "Xbox",
    description: "News Xbox",
    emoji: "🎮",
    envFallback: "XBOX_CHANNEL_ID",
  },
  {
    key: "nintendo",
    label: "Nintendo",
    description: "News Nintendo",
    emoji: "🎮",
    envFallback: "NINTENDO_CHANNEL_ID",
  },
  {
    key: "fortnite",
    label: "Fortnite",
    description: "News Fortnite + boutique",
    emoji: "🎮",
    envFallback: "FORTNITE_CHANNEL_ID",
  },
  {
    key: "instant_gaming",
    label: "Instant Gaming",
    description: "Promos Instant Gaming",
    emoji: "🛒",
    envFallback: "INSTANT_GAMING_CHANNEL_ID",
  },
  {
    key: "free_games",
    label: "Jeux gratuits",
    description: "Alertes jeux gratuits",
    emoji: "🎁",
    envFallback: "FREE_GAMES_CHANNEL_ID",
  },
  {
    key: "epic_games",
    label: "Epic Games",
    description: "Notifications Epic Games",
    emoji: "🎮",
    envFallback: "EPIC_GAMES_CHANNEL_ID",
  },
  {
    key: "deals",
    label: "Deals",
    description: "Deals Steam en temps réel",
    emoji: "💰",
    envFallback: "DEALS_CHANNEL_ID",
  },
  {
    key: "price_track",
    label: "Suivi de prix",
    description: "Alertes de prix de jeux",
    emoji: "📈",
    envFallback: "PRICE_TRACK_CHANNEL_ID",
  },
  {
    key: "dedicated",
    label: "Dédié",
    description: "RSS Helldivers 2 + CoD + alertes virales",
    emoji: "🎯",
    envFallback: "DEDICATED_CHANNEL_ID",
  },
  {
    key: "trends",
    label: "Tendances",
    description: "Tendances gaming",
    emoji: "📊",
    envFallback: "TRENDS_CHANNEL_ID",
  },
  {
    key: "viral",
    label: "Viral",
    description: "Alertes de messages viraux",
    emoji: "🔥",
    envFallback: "VIRAL_CHANNEL_ID",
  },
  {
    key: "logs",
    label: "Logs",
    description: "Logs du bot (erreurs, modération)",
    emoji: "📝",
    envFallback: "LOG_CHANNEL_ID",
  },
  {
    key: "gaming_news",
    label: "Actus Gaming",
    description: "Articles de news gaming (NewsAPI)",
    emoji: "📰",
    envFallback: "",
  },
  {
    key: "gaming_blog",
    label: "Gaming Blog",
    description: "Blog gaming général",
    emoji: "📝",
    envFallback: "GAMING_BLOG_CHANNEL_ID",
  },
];

// ─── Helpers DB ──────────────────────────────────────────────────────────────

async function getRouting(guildId: string): Promise<Record<string, string>> {
  const settings = await prisma.setting.findMany({
    where: { guildId, key: { startsWith: "routing:" } },
  });
  const routing: Record<string, string> = {};
  for (const s of settings) {
    routing[s.key.replace("routing:", "")] = s.value;
  }
  return routing;
}

async function setRouting(guildId: string, contentKey: string, channelId: string): Promise<void> {
  await prisma.setting.upsert({
    where: { guildId_key: { guildId, key: `routing:${contentKey}` } },
    update: { value: channelId },
    create: { guildId, key: `routing:${contentKey}`, value: channelId },
  });
}

async function resetRouting(guildId: string, contentKey: string): Promise<void> {
  await prisma.setting.deleteMany({
    where: { guildId, key: `routing:${contentKey}` },
  });
}

async function resetAllRouting(guildId: string): Promise<void> {
  await prisma.setting.deleteMany({
    where: { guildId, key: { startsWith: "routing:" } },
  });
}

// ─── API publique (pour les autres modules) ──────────────────────────────────

/**
 * Récupère le channelId configuré pour un type de contenu.
 * Priorité : DB (guild) > .env > null
 */
export async function getChannelFor(guildId: string, contentKey: string): Promise<string | null> {
  const dbRouting = await getRouting(guildId);
  const dbValue = dbRouting[contentKey];
  if (dbValue) return dbValue;

  // Fallback .env via config
  const ct = CONTENT_TYPES.find((c) => c.key === contentKey);
  if (ct?.envFallback) {
    const envValue = process.env[ct.envFallback];
    if (envValue) return envValue;
  }
  return null;
}

// ─── Définition de la commande ───────────────────────────────────────────────

const contentChoices = CONTENT_TYPES.map((c) => ({
  name: `${c.emoji} ${c.label}`,
  value: c.key,
}));

export const commands = [
  new SlashCommandBuilder()
    .setName("channel-routing")
    .setDescription("Configure le routage des contenus vers les salons")
    .addSubcommand((s) => s.setName("list").setDescription("Affiche le routage actuel"))
    .addSubcommand((s) =>
      s
        .setName("set")
        .setDescription("Définit le salon pour un type de contenu")
        .addStringOption((o) =>
          o
            .setName("type")
            .setDescription("Type de contenu")
            .setRequired(true)
            .addChoices(...contentChoices),
        )
        .addChannelOption((o) =>
          o
            .setName("salon")
            .setDescription("Le salon de destination")
            .addChannelTypes(ChannelType.GuildText)
            .setRequired(true),
        ),
    )
    .addSubcommand((s) =>
      s
        .setName("reset")
        .setDescription("Réinitialise un type de contenu (retour au .env)")
        .addStringOption((o) =>
          o
            .setName("type")
            .setDescription("Type de contenu")
            .setRequired(true)
            .addChoices(...contentChoices),
        ),
    )
    .addSubcommand((s) =>
      s.setName("reset-all").setDescription("Réinitialise tout le routage (retour au .env)"),
    )
    .toJSON(),
];

// ─── Handler ─────────────────────────────────────────────────────────────────

export async function handleCommand(interaction: ChatInputCommandInteraction): Promise<void> {
  if (!interaction.guildId) {
    await interaction.reply({
      content: "❌ Cette commande doit être utilisée dans un serveur.",
      flags: [MessageFlags.Ephemeral],
    });
    return;
  }

  const sub = interaction.options.getSubcommand();
  const guildId = interaction.guildId;

  try {
    switch (sub) {
      case "list":
        await handleList(interaction, guildId);
        break;
      case "set":
        await handleSet(interaction, guildId);
        break;
      case "reset":
        await handleReset(interaction, guildId);
        break;
      case "reset-all":
        await handleResetAll(interaction, guildId);
        break;
    }
  } catch (error) {
    logger.error(
      `[ChannelRouting] ${sub}: ${error instanceof Error ? error.message : String(error)}`,
    );
    await interaction.reply({
      content: `❌ Erreur: ${String(error).slice(0, 150)}`,
      flags: [MessageFlags.Ephemeral],
    });
  }
}

// ─── Handlers ────────────────────────────────────────────────────────────────

async function handleList(
  interaction: ChatInputCommandInteraction,
  guildId: string,
): Promise<void> {
  await interaction.deferReply({ flags: [MessageFlags.Ephemeral] });

  const routing = await getRouting(guildId);

  const embed = new EmbedBuilder()
    .setTitle("🔀 Routage des contenus")
    .setColor(0x5865f2)
    .setDescription("Configuration actuelle : DB (personnalisé) → .env (par défaut)")
    .setFooter({ text: "Utilise /channel-routing set pour modifier" })
    .setTimestamp();

  const lines = CONTENT_TYPES.map((ct) => {
    const dbChannel = routing[ct.key];
    const envChannel = ct.envFallback ? process.env[ct.envFallback] : undefined;

    if (dbChannel) {
      return `${ct.emoji} **${ct.label}** → <#${dbChannel}> ✅ *(personnalisé)*`;
    } else if (envChannel) {
      return `${ct.emoji} **${ct.label}** → <#${envChannel}> *(défaut .env)*`;
    } else {
      return `${ct.emoji} **${ct.label}** → ❌ *non configuré*`;
    }
  });

  // Couper en chunks de 1024 chars pour les fields
  const chunks: string[] = [];
  let current = "";
  for (const line of lines) {
    if (current.length + line.length + 1 > 1024) {
      chunks.push(current);
      current = "";
    }
    current += line + "\n";
  }
  if (current) chunks.push(current);

  chunks.forEach((chunk, i) => {
    embed.addFields({ name: i === 0 ? "📋 Routage" : "⠀", value: chunk, inline: false });
  });

  await interaction.editReply({ embeds: [embed] });
}

async function handleSet(interaction: ChatInputCommandInteraction, guildId: string): Promise<void> {
  const contentKey = interaction.options.getString("type", true);
  const channel = interaction.options.getChannel("salon", true);

  if (!(channel instanceof TextChannel)) {
    await interaction.reply({
      content: "❌ Le salon doit être un salon textuel.",
      flags: [MessageFlags.Ephemeral],
    });
    return;
  }

  await setRouting(guildId, contentKey, channel.id);

  const ct = CONTENT_TYPES.find((c) => c.key === contentKey);
  await interaction.reply({
    content: `✅ **${ct?.emoji ?? ""} ${ct?.label ?? contentKey}** → ${channel} (${channel.id})`,
    flags: [MessageFlags.Ephemeral],
  });
}

async function handleReset(
  interaction: ChatInputCommandInteraction,
  guildId: string,
): Promise<void> {
  const contentKey = interaction.options.getString("type", true);

  await resetRouting(guildId, contentKey);

  const ct = CONTENT_TYPES.find((c) => c.key === contentKey);
  const envValue = ct?.envFallback ? process.env[ct.envFallback] : undefined;

  await interaction.reply({
    content: envValue
      ? `✅ **${ct?.label ?? contentKey}** réinitialisé → retour au défaut .env (<#${envValue}>)`
      : `✅ **${ct?.label ?? contentKey}** réinitialisé → ❌ non configuré`,
    flags: [MessageFlags.Ephemeral],
  });
}

async function handleResetAll(
  interaction: ChatInputCommandInteraction,
  guildId: string,
): Promise<void> {
  await resetAllRouting(guildId);
  await interaction.reply({
    content: "✅ Tout le routage a été réinitialisé. Retour aux valeurs du .env.",
    flags: [MessageFlags.Ephemeral],
  });
}
