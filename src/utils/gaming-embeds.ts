/**
 * gaming-embeds.ts
 *
 * Générateurs d'Embeds modulaires pour les notifications automatiques
 * de bons plans et sorties de jeux. Une fonction par plateforme,
 * chaque plateforme ayant son identité visuelle propre.
 *
 * Usage : import { embedEpicGames, embedSteam, ... } from "../utils/gaming-embeds";
 */

import { MessageFlags, EmbedBuilder } from "discord.js";

// ── Footer commun ─────────────────────────────────────────────────────────

const GAMING_FOOTER = { text: "Alerte Bons Plans • Surveillance Gaming" };
const SEPARATOR = "\n────────────────────────────────";

// ── Types partagés ─────────────────────────────────────────────────────────

export interface BaseGame {
  name: string;
  imageUrl?: string;
  linkUrl?: string;
}

// ────────────────────────────────────────────────────────────────────────────
// 🎮 EPIC GAMES — #00F0FF (Bleu néon / Style Tactique)
// ────────────────────────────────────────────────────────────────────────────

export interface EpicGameDeal extends BaseGame {
  originalPrice: string;
  endDate: string;
  description?: string;
}

export function embedEpicGames(game: EpicGameDeal): EmbedBuilder {
  const embed = new EmbedBuilder()
    .setTitle("🎁 JEU GRATUIT EPIC GAMES • " + game.name)
    .setColor(0x00f0ff)
    .setFooter(GAMING_FOOTER)
    .setTimestamp();

  if (game.description) {
    embed.setDescription(game.description.slice(0, 1024) + SEPARATOR);
  } else {
    embed.setDescription(SEPARATOR);
  }

  embed.addFields(
    {
      name: "💰 Prix",
      value: "~~" + game.originalPrice + "~~ ➔ **GRATUIT**",
      inline: true,
    },
    {
      name: "⏰ Date limite",
      value: game.endDate,
      inline: true,
    }
  );

  if (game.imageUrl) {
    embed.setImage(game.imageUrl);
  }

  if (game.linkUrl) {
    embed.setURL(game.linkUrl);
  }

  return embed;
}

// ────────────────────────────────────────────────────────────────────────────
// ⚙️ STEAM — #1b2838 (Bleu nuit / Style Clean)
// ────────────────────────────────────────────────────────────────────────────

export type SteamOfferType = "free" | "discount" | "special";

export interface SteamDeal extends BaseGame {
  offerType: SteamOfferType;
  discountPercent?: number;
  description?: string;
  steamAppUrl: string;
}

export function embedSteam(game: SteamDeal): EmbedBuilder {
  const offerLabels: Record<SteamOfferType, string> = {
    free: "🆓 100% Gratuit (À garder à vie)",
    discount: "🔥 Offre Spéciale (-" + (game.discountPercent || 0) + "%)",
    special: "🔥 Offre Spéciale",
  };

  const embed = new EmbedBuilder()
    .setTitle("🔥 PROMO OU JEU GRATUIT STEAM • " + game.name)
    .setColor(0x1b2838)
    .setURL(game.steamAppUrl)
    .setFooter(GAMING_FOOTER)
    .setTimestamp();

  let description = offerLabels[game.offerType] + "\n";
  if (game.description) {
    description += "\n" + game.description.slice(0, 900);
  }
  description += SEPARATOR;

  embed.setDescription(description);

  if (game.imageUrl) {
    embed.setImage(game.imageUrl);
  }

  return embed;
}

// ────────────────────────────────────────────────────────────────────────────
// 💙 PLAYSTATION — #003087 (Bleu PlayStation)
// ────────────────────────────────────────────────────────────────────────────

export type PSNTier = "Essential" | "Extra" | "Premium" | "Soldes" | "Promo";

export interface PlayStationDeal extends BaseGame {
  tier: PSNTier;
  platforms: string[];
  description?: string;
}

export function embedPlayStation(game: PlayStationDeal): EmbedBuilder {
  const tierLabels: Record<PSNTier, string> = {
    Essential: "[PS Plus Essential]",
    Extra: "[PS Plus Extra]",
    Premium: "[PS Plus Premium]",
    Soldes: "[Soldes PSN]",
    Promo: "[Promo PSN]",
  };

  const embed = new EmbedBuilder()
    .setTitle("🎮 AJOUTS PLAYSTATION PLUS / PROMO • " + game.name)
    .setColor(0x003087)
    .setFooter(GAMING_FOOTER)
    .setTimestamp();

  if (game.description) {
    embed.setDescription(game.description.slice(0, 1024) + SEPARATOR);
  } else {
    embed.setDescription(SEPARATOR);
  }

  embed.addFields(
    {
      name: "🎮 Plateforme",
      value: game.platforms.join(" / "),
      inline: true,
    },
    {
      name: "🏷️ Offre",
      value: tierLabels[game.tier],
      inline: true,
    }
  );

  if (game.imageUrl) {
    embed.setImage(game.imageUrl);
  }

  if (game.linkUrl) {
    embed.setURL(game.linkUrl);
  }

  return embed;
}

// ────────────────────────────────────────────────────────────────────────────
// 💚 XBOX — #107C10 (Vert Xbox)
// ────────────────────────────────────────────────────────────────────────────

export type XboxAvailability = "Console" | "PC" | "Cloud";

export interface XboxDeal extends BaseGame {
  availability: XboxAvailability[];
  status?: string;
  rating?: string;
  description?: string;
}

export function embedXbox(game: XboxDeal): EmbedBuilder {
  const embed = new EmbedBuilder()
    .setTitle("🟩 ENTRÉE XBOX GAME PASS / PROMO • " + game.name)
    .setColor(0x107c10)
    .setFooter(GAMING_FOOTER)
    .setTimestamp();

  let description = "";
  if (game.status) {
    description += "• " + game.status + "\n";
  }
  if (game.rating) {
    description += "• 🌟 " + game.rating + "\n";
  }
  if (game.description) {
    description += "\n" + game.description.slice(0, 800);
  }
  if (description) {
    description += SEPARATOR;
    embed.setDescription(description);
  }

  embed.addFields({
    name: "💻 Disponible sur",
    value: game.availability.map((a) => "• " + a).join("\n"),
    inline: false,
  });

  if (game.imageUrl) {
    embed.setImage(game.imageUrl);
  }

  if (game.linkUrl) {
    embed.setURL(game.linkUrl);
  }

  return embed;
}

// ────────────────────────────────────────────────────────────────────────────
// 🧡 INSTANT GAMING — #FF5400 (Orange Instant Gaming)
// ────────────────────────────────────────────────────────────────────────────

export interface InstantGamingDeal extends BaseGame {
  instantPrice: string;
  reduction: string;
  storePrice?: string;
  buyUrl?: string;
}

export function embedInstantGaming(game: InstantGamingDeal): EmbedBuilder {
  const embed = new EmbedBuilder()
    .setTitle("💥 VENTE FLASH / BAISSE DE PRIX • " + game.name)
    .setColor(0xff5400)
    .setFooter(GAMING_FOOTER)
    .setTimestamp();

  embed.setDescription(SEPARATOR);

  embed.addFields(
    {
      name: "💸 Prix Instant G.",
      value: "**" + game.instantPrice + "**",
      inline: true,
    },
    {
      name: "📉 Réduction",
      value: game.reduction + (game.storePrice ? " vs " + game.storePrice : ""),
      inline: true,
    }
  );

  if (game.buyUrl) {
    embed.addFields({
      name: "🛒 Acheter",
      value: "[🛒 Acheter la clé](" + game.buyUrl + ")",
      inline: false,
    });
  }

  if (game.imageUrl) {
    embed.setImage(game.imageUrl);
  }

  return embed;
}

// ============================================================
//  Dispatcheur generique — route selon la plateforme
// ============================================================
export type GamingPlatform = "epic" | "steam" | "playstation" | "xbox" | "instantgaming";

export type GamingDealData =
  | EpicGameDeal
  | SteamDeal
  | PlayStationDeal
  | XboxDeal
  | InstantGamingDeal;

// Overloads : chaque paire (plateforme, donnees) est verifiee a la compilation
export function embedGamingNotification(platform: "epic", data: EpicGameDeal): EmbedBuilder;
export function embedGamingNotification(platform: "steam", data: SteamDeal): EmbedBuilder;
export function embedGamingNotification(platform: "playstation", data: PlayStationDeal): EmbedBuilder;
export function embedGamingNotification(platform: "xbox", data: XboxDeal): EmbedBuilder;
export function embedGamingNotification(platform: "instantgaming", data: InstantGamingDeal): EmbedBuilder;
// Implementation
export function embedGamingNotification(
  platform: GamingPlatform,
  data: GamingDealData
): EmbedBuilder {
  switch (platform) {
    case "epic":
      return embedEpicGames(data as EpicGameDeal);
    case "steam":
      return embedSteam(data as SteamDeal);
    case "playstation":
      return embedPlayStation(data as PlayStationDeal);
    case "xbox":
      return embedXbox(data as XboxDeal);
    case "instantgaming":
      return embedInstantGaming(data as InstantGamingDeal);
    default:
      throw new Error("Plateforme inconnue : " + platform);
  }
}
