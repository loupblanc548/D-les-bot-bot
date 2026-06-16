import { Client } from "discord.js";
declare class SocialGraphService {
    private graph;
    private updateInterval;
    constructor();
    /**
     * Initialise le graphe avec les membres du serveur
     */
    initializeGraph(client: Client): Promise<void>;
    /**
     * Ajoute un noeud au graphe
     */
    addNode(id: string, name: string, type: "user" | "channel" | "role", metadata?: Record<string, any>): void;
    /**
     * Ajoute une connexion (edge) au graphe
     */
    addEdge(source: string, target: string, type: "mention" | "message" | "reaction" | "voice", weight?: number): void;
    /**
     * Analyse les connexions d'un utilisateur
     */
    analyzeUserConnections(userId: string): {
        directConnections: string[];
        influenceScore: number;
        communities: string[];
    };
    /**
     * Calcule le score d'influence d'un utilisateur
     */
    private calculateInfluenceScore;
    /**
     * Vérifie si un utilisateur est influent
     */
    private isInfluential;
    /**
     * Détecte les communautés d'un utilisateur
     */
    private detectCommunities;
    /**
     * Génère un rapport du graphe
     */
    generateGraphReport(): {
        totalNodes: number;
        totalEdges: number;
        nodeTypes: Record<string, number>;
        mostConnectedUsers: Array<{
            id: string;
            connections: number;
        }>;
        influentialUsers: Array<{
            id: string;
            score: number;
        }>;
    };
    /**
     * Exporte le graphe au format JSON
     */
    exportGraph(): string;
    /**
     * Active la mise à jour automatique du graphe
     */
    enableAutoUpdate(intervalMs?: number): void;
    /**
     * Désactive la mise à jour automatique
     */
    disableAutoUpdate(): void;
    /**
     * Nettoie les anciennes connexions (plus de 30 jours)
     */
    private cleanupOldEdges;
}
export declare const socialGraphService: SocialGraphService;
export {};
//# sourceMappingURL=social-graph.d.ts.map