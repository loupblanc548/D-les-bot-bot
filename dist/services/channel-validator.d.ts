import { Client } from "discord.js";
export interface ChannelDef {
    /** ID du salon Discord (valeur de config.xxxChannel) */
    id: string | null | undefined;
    /** Nom lisible pour les logs (ex: "Steam/Epic") */
    label: string;
    /** Clé de la variable d'environnement (ex: "STEAM_EPIC_CHANNEL_ID") */
    envKey: string;
    /** Si true, l'absence de ce salon est considérée comme un avertissement et non une erreur */
    optional?: boolean;
}
export interface ChannelCheckResult {
    label: string;
    envKey: string;
    id: string | null | undefined;
    status: "ok" | "unchecked" | "missing_env" | "invalid_snowflake" | "not_found" | "not_text" | "no_access" | "skipped";
    message: string;
}
export interface ChannelsValidationReport {
    passed: number;
    warnings: number;
    errors: number;
    results: ChannelCheckResult[];
}
/**
 * Valide au démarrage que tous les CHANNEL_ID configurés dans le .env
 * sont des salons Discord valides et accessibles par le bot.
 *
 * @param client - Le client Discord connecté
 * @returns Un rapport détaillé avec le statut de chaque salon
 */
export declare function validateChannels(client: Client): Promise<ChannelsValidationReport>;
/**
 * Version synchrone légère qui vérifie juste que les IDs sont des Snowflakes
 * valides (sans appeler l'API Discord). Utile pour le healthcheck statique.
 */
export declare function validateChannelIdsStatic(): ChannelCheckResult[];
//# sourceMappingURL=channel-validator.d.ts.map