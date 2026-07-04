/**
 * ChannelRouter.ts — Routeur Multi-Salon avec Regex & Couleurs Dynamiques
 *
 * Pour chaque élément validé issu des crons, applique un routage par
 * expressions régulières sur le titre pour déterminer le(s) salon(s) cible(s).
 *
 * Supporte le multi-routage: un article concernant plusieurs plateformes
 * est envoyé dans TOUS les salons correspondants simultanément.
 *
 * Applique les couleurs d'embed officielles des marques.
 */

import { EmbedBuilder, TextChannel, Client, MessageCreateOptions } from "discord.js";
import logger from "../utils/logger.js";
import { stripAllHtml } from "../utils/sanitizeHtml.js";
import {
  generateCardAttachment,
  getPlatformColor,
  getPlatformLabel,
} from "../utils/notificationCards.js";

// ─── Configuration des plateformes ─────────────────────────────────────────

interface PlatformConfig {
  name: string;
  keywords: RegExp[];
  envChannelKey: string;
  color: number; // Couleur d'embed officielle
  icon: string; // URL d'icône pour l'embed
  guildEnvKey?: string; // Optionnel: variable d'env pour le guild ID
}

const PLATFORM_CONFIGS: PlatformConfig[] = [
  {
    name: "Steam/PC",
    keywords: [
      /steam/i,
      /\bpc\b/i,
      /\bgog\b/i,
      /\bepic\s*games\b/i,
      /\bepic\b/i,
      /\bdeck\b/i,
      /\blinux\b/i,
      /\bitch\.io\b/i,
      /\bhumble\b/i,
    ],
    envChannelKey: "STEAM_EPIC_CHANNEL_ID",
    color: 0x1b2838, // Noir/bleu sombre Steam
    icon: "https://store.steampowered.com/favicon.ico",
  },
  {
    name: "PlayStation",
    keywords: [/playstation/i, /\bps4\b/i, /\bps5\b/i, /psn/i, /\bps plus\b/i, /\bps now\b/i],
    envChannelKey: "PLAYSTATION_CHANNEL_ID",
    color: 0x003791, // Bleu PlayStation
    icon: "https://www.playstation.com/favicon.ico",
  },
  {
    name: "Xbox",
    keywords: [/xbox/i, /microsoft/i, /xbl/i, /game\s*pass/i, /series\s*x/i, /xcloud/i],
    envChannelKey: "XBOX_CHANNEL_ID",
    color: 0x107c10, // Vert Xbox
    icon: "https://www.xbox.com/favicon.ico",
  },
  {
    name: "Nintendo",
    keywords: [/nintendo/i, /switch/i, /\bwii\b/i, /gamecube/i, /3ds/i, /ds\b/i, /amiibo/i],
    envChannelKey: "NINTENDO_CHANNEL_ID",
    color: 0xe60012, // Rouge Nintendo
    icon: "https://www.nintendo.com/favicon.ico",
  },
  {
    name: "Fortnite",
    keywords: [/\bfortnite\b/i, /\bfn\b/i, /\bfort\b/i, /\bhypex\b/i, /\bshiina\b/i],
    envChannelKey: "FORTNITE_CHANNEL_ID",
    color: 0x9147ff, // Violet Fortnite
    icon: "https://static-assets-prod.epicgames.com/fortnite/favicon.ico",
  },
];

// ─── Types ──────────────────────────────────────────────────────────────────

export interface RoutedArticle {
  title: string;
  content: string;
  url: string;
  pubDate: string;
  image?: string;
  platforms: string[]; // Noms des plateformes matchées
  channelIds: string[]; // IDs des channels cibles
}

export interface RoutingResult {
  routed: boolean;
  article: RoutedArticle;
  sentTo: string[]; // IDs des channels où l'article a été envoyé
  errors: string[];
}

// ─── Détection des plateformes par regex ────────────────────────────────────

/**
 * Analyse un titre et retourne les plateformes matchées.
 * Un article peut matcher plusieurs plateformes.
 */
export function detectPlatforms(title: string): PlatformConfig[] {
  const matched: PlatformConfig[] = [];

  for (const config of PLATFORM_CONFIGS) {
    const matches = config.keywords.some((regex) => regex.test(title));
    if (matches) {
      matched.push(config);
    }
  }

  return matched;
}

/**
 * Résout les IDs de channels à partir des plateformes détectées.
 * Retourne un set dédoublonné.
 */
export function resolveChannelIds(platforms: PlatformConfig[]): string[] {
  const channelIds = new Set<string>();

  for (const platform of platforms) {
    const channelId = process.env[platform.envChannelKey];
    if (channelId && channelId.trim()) {
      channelIds.add(channelId.trim());
    }
  }

  return Array.from(channelIds);
}

// ─── Construction d'embed dynamique ─────────────────────────────────────────

/**
 * Construit un embed Discord avec la couleur de la plateforme.
 * Si plusieurs plateformes, utilise la première comme dominante.
 */
export function buildPlatformEmbed(
  article: Omit<RoutedArticle, "platforms" | "channelIds">,
  platform: PlatformConfig,
): EmbedBuilder {
  const embed = new EmbedBuilder()
    .setColor(platform.color)
    .setTitle(article.title.slice(0, 256))
    .setURL(article.url || null)
    .setTimestamp(article.pubDate ? new Date(article.pubDate) : new Date());

  if (article.content && article.content.length > 0) {
    const cleaned = stripAllHtml(article.content)
      .replace(/\n{3,}/g, "\n\n")
      .trim();

    if (cleaned.length > 0) {
      embed.setDescription(cleaned.length > 1800 ? cleaned.slice(0, 1797) + "..." : cleaned);
    }
  }

  if (article.image) {
    embed.setImage(article.image);
  }

  embed.setFooter({
    text: `Plateforme: ${platform.name}`,
    iconURL: platform.icon,
  });

  return embed;
}

// ─── Envoi multi-salon ──────────────────────────────────────────────────────

/**
 * Envoie un article dans TOUS les salons correspondant aux plateformes détectées.
 * Sauvegarde l'état dans Prisma SEULEMENT après confirmation de l'envoi Discord.
 */
export async function dispatchToChannels(
  client: Client,
  article: RoutedArticle,
): Promise<RoutingResult> {
  const result: RoutingResult = {
    routed: false,
    article,
    sentTo: [],
    errors: [],
  };

  if (article.channelIds.length === 0) {
    result.errors.push("Aucun channel configuré pour les plateformes détectées");
    logger.warn(
      `[ChannelRouter] Aucun channel pour: "${article.title.slice(0, 60)}" — plateformes: ${article.platforms.join(", ")}`,
    );
    return result;
  }

  // Récupérer les configs de plateformes pour les channels résolus
  const platformMap = new Map<string, PlatformConfig>();
  for (const config of PLATFORM_CONFIGS) {
    const channelId = process.env[config.envChannelKey];
    if (channelId) {
      platformMap.set(channelId.trim(), config);
    }
  }

  // Construire l'embed pour chaque plateforme et envoyer
  for (const channelId of article.channelIds) {
    try {
      let channel;
      try {
        channel = await client.channels.fetch(channelId);
      } catch {
        // Channel deleted or bot lacks access — skip silently with warning
        result.errors.push(`Channel ${channelId} introuvable (supprimé ou inaccessible)`);
        logger.warn(`[ChannelRouter] Channel ${channelId} introuvable — ignoré`);
        continue;
      }
      if (!channel || !channel.isTextBased()) {
        result.errors.push(`Channel ${channelId} introuvable ou non textuel`);
        logger.warn(`[ChannelRouter] Channel invalide: ${channelId}`);
        continue;
      }

      const textChannel = channel as TextChannel;
      const platform = platformMap.get(channelId) || PLATFORM_CONFIGS[0];
      const embed = buildPlatformEmbed(article, platform);

      // Générer la carte visuelle
      const cardAttachment = await generateCardAttachment(
        {
          type: "gaming",
          title: article.title,
          subtitle: platform.name,
          description: article.content?.slice(0, 120),
          imageUrl: article.image,
          platformName: platform.name.toUpperCase(),
          platformColor: `#${platform.color.toString(16).padStart(6, "0")}`,
          url: article.url,
        },
        `route-${channelId}-${Date.now()}`,
      );

      const messagePayload: MessageCreateOptions = {
        embeds: [embed],
      };

      if (cardAttachment) {
        embed.setImage(`attachment://${cardAttachment.name}`);
        messagePayload.files = [cardAttachment];
      }

      // Ajouter le lien URL en contenu si présent
      if (article.url) {
        messagePayload.content = article.url;
      }

      await textChannel.send(messagePayload);
      // 🔒 Delai anti rate-limit Discord (1s entre chaque envoi canal)
      await new Promise((resolve) => setTimeout(resolve, 1000));

      result.sentTo.push(channelId);
      result.routed = true;

      logger.info(
        `[ChannelRouter] ✅ Envoyé → #${(textChannel as TextChannel).name} (${platform.name}): "${article.title.slice(0, 60)}"`,
      );
    } catch (error) {
      const errMsg = `Échec envoi channel ${channelId}: ${(error as Error).message}`;
      result.errors.push(errMsg);
      logger.error(`[ChannelRouter] ${errMsg}`);
    }
  }

  return result;
}

// ─── Pipeline de routage complet ────────────────────────────────────────────

/**
 * Pipeline complet : détection → résolution → dispatch.
 * À appeler depuis les crons après validation/dédup.
 */

// ─── Silent Mode (anti-spam prime au demarrage) ──────────────────────────
let __silentMode = false;

/** Active le mode silencieux : routeArticle retourne un succes factice sans envoyer a Discord */
export function enableSilentMode(): void {
  __silentMode = true;
}

/** Desactive le mode silencieux : les envois Discord reprennent normalement */
export function disableSilentMode(): void {
  __silentMode = false;
}

export async function routeArticle(
  client: Client,
  title: string,
  content: string,
  url: string,
  pubDate: string,
  image?: string,
): Promise<RoutingResult> {
  // 🔒 Mode silencieux : retourne un succes factice (cache prime sans envoi Discord)
  if (__silentMode) {
    return {
      routed: true,
      article: {
        title,
        content,
        url,
        pubDate,
        image,
        platforms: ["silent"],
        channelIds: ["silent"],
      },
      sentTo: ["silent"],
      errors: [],
    };
  }

  logger.info(`[ChannelRouter] Routage: "${title.slice(0, 60)}"`);

  // Étape 1: Détection des plateformes
  const platforms = detectPlatforms(title);
  const platformNames = platforms.map((p) => p.name);

  logger.debug(
    `[ChannelRouter] Plateformes détectées: ${platformNames.length > 0 ? platformNames.join(", ") : "AUCUNE"}`,
  );

  // Étape 2: Résolution des channels
  let channelIds = resolveChannelIds(platforms);

  // Fallback : si aucune plateforme détectée, envoyer vers le salon dédié
  if (channelIds.length === 0) {
    const fallbackChannel = process.env.DEDICATED_CHANNEL_ID || process.env.FREE_GAMES_CHANNEL_ID;
    if (fallbackChannel) {
      channelIds = [fallbackChannel.trim()];
      logger.info(
        `[ChannelRouter] Aucune plateforme détectée → fallback salon dédié (${fallbackChannel})`,
      );
    }
  }

  // Étape 3: Construction de l'article routé
  const article: RoutedArticle = {
    title,
    content,
    url,
    pubDate,
    image,
    platforms: platformNames,
    channelIds,
  };

  // Étape 4: Dispatch multi-salon
  const result = await dispatchToChannels(client, article);

  logger.info(
    `[ChannelRouter] Routage terminé: ${result.sentTo.length} channel(s), ${result.errors.length} erreur(s)`,
  );
  return result;
}

export { PLATFORM_CONFIGS };
