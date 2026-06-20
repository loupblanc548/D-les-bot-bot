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
import { EmbedBuilder, Client } from "discord.js";
interface PlatformConfig {
    name: string;
    keywords: RegExp[];
    envChannelKey: string;
    color: number;
    icon: string;
    guildEnvKey?: string;
}
declare const PLATFORM_CONFIGS: PlatformConfig[];
export interface RoutedArticle {
    title: string;
    content: string;
    url: string;
    pubDate: string;
    image?: string;
    platforms: string[];
    channelIds: string[];
}
export interface RoutingResult {
    routed: boolean;
    article: RoutedArticle;
    sentTo: string[];
    errors: string[];
}
/**
 * Analyse un titre et retourne les plateformes matchées.
 * Un article peut matcher plusieurs plateformes.
 */
export declare function detectPlatforms(title: string): PlatformConfig[];
/**
 * Résout les IDs de channels à partir des plateformes détectées.
 * Retourne un set dédoublonné.
 */
export declare function resolveChannelIds(platforms: PlatformConfig[]): string[];
/**
 * Construit un embed Discord avec la couleur de la plateforme.
 * Si plusieurs plateformes, utilise la première comme dominante.
 */
export declare function buildPlatformEmbed(article: Omit<RoutedArticle, "platforms" | "channelIds">, platform: PlatformConfig): EmbedBuilder;
/**
 * Envoie un article dans TOUS les salons correspondant aux plateformes détectées.
 * Sauvegarde l'état dans Prisma SEULEMENT après confirmation de l'envoi Discord.
 */
export declare function dispatchToChannels(client: Client, article: RoutedArticle): Promise<RoutingResult>;
/** Active le mode silencieux : routeArticle retourne un succes factice sans envoyer a Discord */
export declare function enableSilentMode(): void;
/** Desactive le mode silencieux : les envois Discord reprennent normalement */
export declare function disableSilentMode(): void;
export declare function routeArticle(client: Client, title: string, content: string, url: string, pubDate: string, image?: string): Promise<RoutingResult>;
export { PLATFORM_CONFIGS };
//# sourceMappingURL=ChannelRouter.d.ts.map