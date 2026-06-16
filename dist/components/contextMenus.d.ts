import { ContextMenuCommandBuilder, ContextMenuCommandInteraction } from "discord.js";
/**
 * Système de menus contextuels pour commandes
 * Permet d'ajouter des actions contextuelles sur les messages et utilisateurs
 */
export interface ContextMenuConfig {
    name: string;
    type: "USER" | "MESSAGE";
    permissions?: bigint[];
    handler: (interaction: ContextMenuCommandInteraction) => Promise<void>;
}
declare class ContextMenuSystem {
    private menus;
    /**
     * Enregistre un menu contextuel
     */
    registerMenu(config: ContextMenuConfig): void;
    /**
     * Obtient un menu contextuel par son nom
     */
    getMenu(name: string): ContextMenuConfig | undefined;
    /**
     * Obtient tous les menus contextuels
     */
    getAllMenus(): ContextMenuConfig[];
    /**
     * Obtient les menus par type
     */
    getMenusByType(type: "USER" | "MESSAGE"): ContextMenuConfig[];
    /**
     * Génère les builders Discord pour l'enregistrement
     */
    generateBuilders(): Array<ContextMenuCommandBuilder>;
    /**
     * Gère l'exécution d'un menu contextuel
     */
    handleInteraction(interaction: ContextMenuCommandInteraction): Promise<void>;
}
export declare const contextMenuSystem: ContextMenuSystem;
/**
 * Menus contextuels prédéfinis pour les utilisateurs
 */
export declare const USER_CONTEXT_MENUS: ContextMenuConfig[];
/**
 * Menus contextuels prédéfinis pour les messages
 */
export declare const MESSAGE_CONTEXT_MENUS: ContextMenuConfig[];
/**
 * Enregistre tous les menus contextuels prédéfinis
 */
export declare function registerDefaultContextMenus(): void;
/**
 * Crée un menu contextuel personnalisé
 */
export declare function createCustomContextMenu(config: ContextMenuConfig): void;
/**
 * Menus contextuels spécifiques pour la modération
 */
export declare const MODERATION_CONTEXT_MENUS: ContextMenuConfig[];
/**
 * Enregistre les menus contextuels de modération
 */
export declare function registerModerationContextMenus(): void;
export {};
//# sourceMappingURL=contextMenus.d.ts.map