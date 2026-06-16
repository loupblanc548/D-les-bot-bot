import { Message } from "discord.js";
/**
 * Système de pagination pour les longues listes
 * Permet de naviguer entre les pages avec des boutons interactifs
 */
export interface PaginationItem {
    title: string;
    description: string;
    emoji?: string;
    url?: string;
}
export interface PaginationOptions {
    items: PaginationItem[];
    itemsPerPage: number;
    timeout?: number;
    embedColor?: number;
    embedTitle?: string;
    footerText?: string;
}
export declare class PaginationSystem {
    private message;
    private items;
    private itemsPerPage;
    private currentPage;
    private totalPages;
    private timeout;
    private embedColor;
    private embedTitle;
    private footerText;
    private collector;
    private timeoutId;
    constructor(message: Message, options: PaginationOptions);
    /**
     * Génère l'embed pour la page actuelle
     */
    private generateEmbed;
    /**
     * Génère le contenu de la page
     */
    private generatePageContent;
    /**
     * Génère les boutons de navigation
     */
    private generateButtons;
    /**
     * Met à jour le message avec la nouvelle page
     */
    private updateMessage;
    /**
     * Gère les interactions avec les boutons
     */
    private handleInteraction;
    /**
     * Démarre la pagination
     */
    start(): Promise<void>;
    /**
     * Arrête la pagination
     */
    stop(): void;
    /**
     * Change de page manuellement
     */
    goToPage(pageNumber: number): void;
    /**
     * Obtient la page actuelle
     */
    getCurrentPage(): number;
    /**
     * Obtient le nombre total de pages
     */
    getTotalPages(): number;
}
/**
 * Fonction utilitaire pour créer une pagination rapidement
 */
export declare function createPagination(message: Message, items: PaginationItem[], options?: Partial<PaginationOptions>): Promise<PaginationSystem>;
/**
 * Types de pagination prédéfinis
 */
export declare class PaginationPresets {
    /**
     * Pagination pour les commandes
     */
    static commands(items: string[]): PaginationItem[];
    /**
     * Pagination pour les utilisateurs
     */
    static users(users: Array<{
        name: string;
        id: string;
        activity: string;
    }>): PaginationItem[];
    /**
     * Pagination pour les deals
     */
    static deals(deals: Array<{
        title: string;
        price: string;
        platform: string;
    }>): PaginationItem[];
    /**
     * Pagination pour les patch notes
     */
    static patchNotes(patches: Array<{
        title: string;
        platform: string;
        date: string;
    }>): PaginationItem[];
}
//# sourceMappingURL=pagination.d.ts.map