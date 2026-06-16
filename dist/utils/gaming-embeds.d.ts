/**
 * gaming-embeds.ts
 *
 * Générateurs d'Embeds modulaires pour les notifications automatiques
 * de bons plans et sorties de jeux. Une fonction par plateforme,
 * chaque plateforme ayant son identité visuelle propre.
 *
 * Usage : import { embedEpicGames, embedSteam, ... } from "../utils/gaming-embeds";
 */
import { EmbedBuilder } from "discord.js";
export interface BaseGame {
    name: string;
    imageUrl?: string;
    linkUrl?: string;
}
export interface EpicGameDeal extends BaseGame {
    originalPrice: string;
    endDate: string;
    description?: string;
}
export declare function embedEpicGames(game: EpicGameDeal): EmbedBuilder;
export type SteamOfferType = "free" | "discount" | "special";
export interface SteamDeal extends BaseGame {
    offerType: SteamOfferType;
    discountPercent?: number;
    description?: string;
    steamAppUrl: string;
}
export declare function embedSteam(game: SteamDeal): EmbedBuilder;
export type PSNTier = "Essential" | "Extra" | "Premium" | "Soldes" | "Promo";
export interface PlayStationDeal extends BaseGame {
    tier: PSNTier;
    platforms: string[];
    description?: string;
}
export declare function embedPlayStation(game: PlayStationDeal): EmbedBuilder;
export type XboxAvailability = "Console" | "PC" | "Cloud";
export interface XboxDeal extends BaseGame {
    availability: XboxAvailability[];
    status?: string;
    rating?: string;
    description?: string;
}
export declare function embedXbox(game: XboxDeal): EmbedBuilder;
export interface InstantGamingDeal extends BaseGame {
    instantPrice: string;
    reduction: string;
    storePrice?: string;
    buyUrl?: string;
}
export declare function embedInstantGaming(game: InstantGamingDeal): EmbedBuilder;
export type GamingPlatform = "epic" | "steam" | "playstation" | "xbox" | "instantgaming";
export type GamingDealData = EpicGameDeal | SteamDeal | PlayStationDeal | XboxDeal | InstantGamingDeal;
export declare function embedGamingNotification(platform: "epic", data: EpicGameDeal): EmbedBuilder;
export declare function embedGamingNotification(platform: "steam", data: SteamDeal): EmbedBuilder;
export declare function embedGamingNotification(platform: "playstation", data: PlayStationDeal): EmbedBuilder;
export declare function embedGamingNotification(platform: "xbox", data: XboxDeal): EmbedBuilder;
export declare function embedGamingNotification(platform: "instantgaming", data: InstantGamingDeal): EmbedBuilder;
//# sourceMappingURL=gaming-embeds.d.ts.map