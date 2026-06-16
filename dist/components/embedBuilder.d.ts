import { EmbedBuilder } from "discord.js";
/**
 * Thèmes visuels par plateforme
 */
export interface PlatformTheme {
    color: number;
    iconUrl: string;
    label: string;
    emoji: string;
}
export declare const PLATFORM_THEMES: Record<string, PlatformTheme>;
/**
 * Niveaux de priorité pour les alertes
 */
export declare enum AlertPriority {
    CRITICAL = 0,
    HIGH = 1,
    MEDIUM = 2,
    LOW = 3,
    INFO = 4
}
export declare const ALERT_COLORS: Record<AlertPriority, number>;
/**
 * Créateur d'embeds visuels avancés
 */
export declare class AdvancedEmbedBuilder extends EmbedBuilder {
    private theme?;
    private priority?;
    /**
     * Définit le thème de la plateforme
     */
    setPlatformTheme(platform: string): this;
    /**
     * Définit le niveau de priorité de l'alerte
     */
    setAlertPriority(priority: AlertPriority): this;
    /**
     * Crée un tableau de bord visuel avec ASCII art
     */
    createDashboard(stats: Record<string, number>): this;
    /**
     * Crée un graphique ASCII simple
     */
    private createAsciiChart;
    /**
     * Ajoute une barre de progression visuelle
     */
    addProgressBar(label: string, current: number, max: number, emoji?: string): this;
    /**
     * Crée une section avec séparateur visuel
     */
    addSection(title: string, content: string, emoji?: string): this;
    /**
     * Crée une grille de comparaison
     */
    addComparisonGrid(items: Array<{
        name: string;
        value: string;
        emoji: string;
    }>): this;
    /**
     * Applique le thème complet à l'embed
     */
    applyTheme(): this;
    /**
     * Crée un embed de digest quotidien
     */
    static createDailyDigest(title: string, sections: Array<{
        title: string;
        content: string;
        emoji: string;
    }>): AdvancedEmbedBuilder;
    /**
     * Crée un embed de tableau de bord de monitoring
     */
    static createMonitoringDashboard(services: Array<{
        name: string;
        status: string;
        uptime: number;
        emoji: string;
    }>): AdvancedEmbedBuilder;
    /**
     * Crée un embed de rapport d'activité
     */
    static createActivityReport(metrics: {
        totalCommands: number;
        activeUsers: number;
        topCommands: Array<{
            name: string;
            uses: number;
        }>;
        period: string;
    }): AdvancedEmbedBuilder;
}
/**
 * Utilitaires pour les boutons d'action
 */
export interface ActionButton {
    label: string;
    style: "Primary" | "Secondary" | "Success" | "Danger";
    emoji?: string;
    customId: string;
}
export declare const COMMON_ACTIONS: Record<string, ActionButton[]>;
//# sourceMappingURL=embedBuilder.d.ts.map