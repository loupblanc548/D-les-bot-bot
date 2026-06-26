import logger from "../utils/logger.js";
import { Client } from "discord.js";
interface GraphNode {
  id: string;
  name: string;
  type: "user" | "channel" | "role";
  connections: string[];
  metadata: Record<string, unknown>;
}

interface GraphEdge {
  source: string;
  target: string;
  type: "mention" | "message" | "reaction" | "voice";
  weight: number;
  timestamp: number;
}

interface SocialGraph {
  nodes: Map<string, GraphNode>;
  edges: GraphEdge[];
  lastUpdated: number;
}

class SocialGraphService {
  private graph: SocialGraph;
  private updateInterval: NodeJS.Timeout | null = null;

  constructor() {
    this.graph = {
      nodes: new Map(),
      edges: [],
      lastUpdated: Date.now(),
    };
    logger.info("[SocialGraph] Service initialisé");
  }

  /**
   * Initialise le graphe avec les membres du serveur
   */
  async initializeGraph(client: Client): Promise<void> {
    try {
      const guild = client.guilds.cache.first();
      if (!guild) {
        logger.warn("[SocialGraph] Aucun guild trouvée");
        return;
      }

      // Ajouter tous les membres comme noeuds
      const members = await guild.members.fetch();
      for (const [id, member] of members) {
        this.addNode(id, member.user.username, "user", {
          joinedAt: member.joinedAt?.toISOString(),
          roles: member.roles.cache.map((r) => r.name),
        });
      }

      // Ajouter tous les salons comme noeuds
      for (const [id, channel] of guild.channels.cache) {
        this.addNode(id, channel.name, "channel", {
          type: channel.type,
          parentId: channel.parentId,
        });
      }

      // Ajouter tous les rôles comme noeuds
      for (const [id, role] of guild.roles.cache) {
        this.addNode(id, role.name, "role", {
          color: role.hexColor,
          position: role.position,
        });
      }

      logger.info(`[SocialGraph] Graphe initialisé avec ${this.graph.nodes.size} noeuds`);
    } catch (error) {
      logger.error("[SocialGraph] Erreur lors de l'initialisation:", error);
    }
  }

  /**
   * Ajoute un noeud au graphe
   */
  addNode(
    id: string,
    name: string,
    type: "user" | "channel" | "role",
    metadata: Record<string, unknown> = {},
  ): void {
    this.graph.nodes.set(id, {
      id,
      name,
      type,
      connections: [],
      metadata,
    });
  }

  /**
   * Ajoute une connexion (edge) au graphe
   */
  addEdge(
    source: string,
    target: string,
    type: "mention" | "message" | "reaction" | "voice",
    weight: number = 1,
  ): void {
    const edge: GraphEdge = {
      source,
      target,
      type,
      weight,
      timestamp: Date.now(),
    };

    this.graph.edges.push(edge);

    // Mettre à jour les connexions des noeuds
    const sourceNode = this.graph.nodes.get(source);
    const targetNode = this.graph.nodes.get(target);

    if (sourceNode && !sourceNode.connections.includes(target)) {
      sourceNode.connections.push(target);
    }

    if (targetNode && !targetNode.connections.includes(source)) {
      targetNode.connections.push(source);
    }

    this.graph.lastUpdated = Date.now();
  }

  /**
   * Analyse les connexions d'un utilisateur
   */
  analyzeUserConnections(userId: string): {
    directConnections: string[];
    influenceScore: number;
    communities: string[];
  } {
    const node = this.graph.nodes.get(userId);
    if (!node) {
      return {
        directConnections: [],
        influenceScore: 0,
        communities: [],
      };
    }

    const directConnections = node.connections;
    const influenceScore = this.calculateInfluenceScore(userId);
    const communities = this.detectCommunities(userId);

    return {
      directConnections,
      influenceScore,
      communities,
    };
  }

  /**
   * Calcule le score d'influence d'un utilisateur
   */
  private calculateInfluenceScore(userId: string): number {
    const userEdges = this.graph.edges.filter((e) => e.source === userId || e.target === userId);

    // Score basé sur le nombre de connexions et leur poids
    const connectionScore = userEdges.reduce((sum, edge) => sum + edge.weight, 0);

    // Bonus pour les connexions avec des utilisateurs influents
    const influentialBonus =
      userEdges.filter((e) => this.isInfluential(e.source === userId ? e.target : e.source))
        .length * 5;

    return connectionScore + influentialBonus;
  }

  /**
   * Vérifie si un utilisateur est influent
   */
  private isInfluential(userId: string): boolean {
    const node = this.graph.nodes.get(userId);
    if (!node) return false;

    const connections = node.connections.length;
    return connections > 50; // Seuil arbitraire
  }

  /**
   * Détecte les communautés d'un utilisateur
   */
  private detectCommunities(userId: string): string[] {
    const node = this.graph.nodes.get(userId);
    if (!node) return [];

    const communities: string[] = [];

    // Regrouper par rôles communs
    const userNode = this.graph.nodes.get(userId);
    if (userNode?.metadata.roles) {
      communities.push(...(userNode.metadata.roles as string[]));
    }

    // Regrouper par salons communs
    const connectedChannels = node.connections.filter((id) => {
      const connectedNode = this.graph.nodes.get(id);
      return connectedNode?.type === "channel";
    });

    communities.push(...connectedChannels);

    return [...new Set(communities)];
  }

  /**
   * Génère un rapport du graphe
   */
  generateGraphReport(): {
    totalNodes: number;
    totalEdges: number;
    nodeTypes: Record<string, number>;
    mostConnectedUsers: Array<{ id: string; connections: number }>;
    influentialUsers: Array<{ id: string; score: number }>;
  } {
    const nodeTypes: Record<string, number> = {};
    for (const node of this.graph.nodes.values()) {
      nodeTypes[node.type] = (nodeTypes[node.type] || 0) + 1;
    }

    const userConnections = Array.from(this.graph.nodes.entries())
      .filter(([_, node]) => node.type === "user")
      .map(([id, node]) => ({ id, connections: node.connections.length }))
      .sort((a, b) => b.connections - a.connections)
      .slice(0, 10);

    const influentialUsers = Array.from(this.graph.nodes.entries())
      .filter(([_, node]) => node.type === "user")
      .map(([id, _]) => ({ id, score: this.calculateInfluenceScore(id) }))
      .sort((a, b) => b.score - a.score)
      .slice(0, 10);

    return {
      totalNodes: this.graph.nodes.size,
      totalEdges: this.graph.edges.length,
      nodeTypes,
      mostConnectedUsers: userConnections,
      influentialUsers,
    };
  }

  /**
   * Exporte le graphe au format JSON
   */
  exportGraph(): string {
    return JSON.stringify(
      {
        nodes: Array.from(this.graph.nodes.values()),
        edges: this.graph.edges,
        lastUpdated: this.graph.lastUpdated,
      },
      null,
      2,
    );
  }

  /**
   * Active la mise à jour automatique du graphe
   */
  enableAutoUpdate(intervalMs: number = 300000): void {
    if (this.updateInterval) {
      logger.warn("[SocialGraph] Auto-update déjà activé");
      return;
    }

    logger.info(`[SocialGraph] Auto-update activé (intervalle: ${intervalMs}ms)`);
    this.updateInterval = setInterval(() => {
      this.cleanupOldEdges();
    }, intervalMs);
  }

  /**
   * Désactive la mise à jour automatique
   */
  disableAutoUpdate(): void {
    if (this.updateInterval) {
      clearInterval(this.updateInterval);
      this.updateInterval = null;
      logger.info("[SocialGraph] Auto-update désactivé");
    }
  }

  /**
   * Nettoie les anciennes connexions (plus de 30 jours)
   */
  private cleanupOldEdges(): void {
    const thirtyDaysAgo = Date.now() - 30 * 24 * 60 * 60 * 1000;
    const beforeCount = this.graph.edges.length;

    this.graph.edges = this.graph.edges.filter((edge) => edge.timestamp > thirtyDaysAgo);

    const afterCount = this.graph.edges.length;
    logger.debug(`[SocialGraph] ${beforeCount - afterCount} anciennes connexions nettoyées`);
  }
}

export const socialGraphService = new SocialGraphService();
