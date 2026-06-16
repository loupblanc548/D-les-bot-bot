import logger from "../utils/logger";
import { Client, EmbedBuilder, TextChannel } from "discord.js";
import { config } from "../config";
import prisma from "../prisma";

interface NFTCollection {
  contractAddress: string;
  name: string;
  symbol: string;
  floorPrice: number;
  volume24h: number;
  owners: number;
  lastUpdated: number;
}

interface GamingToken {
  symbol: string;
  name: string;
  price: number;
  change24h: number;
  marketCap: number;
  lastUpdated: number;
}

interface BlockchainAlert {
  type: "nft_floor_drop" | "token_spike" | "whale_transaction" | "new_collection";
  severity: "low" | "medium" | "high";
  message: string;
  data: Record<string, unknown>;
  timestamp: number;
}

class BlockchainGamingService {
  private nftCollections: Map<string, NFTCollection>;
  private gamingTokens: Map<string, GamingToken>;
  private alerts: BlockchainAlert[];
  private monitoringInterval: NodeJS.Timeout | null = null;

  constructor() {
    this.nftCollections = new Map();
    this.gamingTokens = new Map();
    this.alerts = [];
    logger.info("[BlockchainGaming] Service initialisé");
  }

  async initializeCollections(): Promise<void> {
    const collections: NFTCollection[] = [
      {
        contractAddress: "0xbc4ca0eda7647a8ab7c2061c2e118a18a936f13d",
        name: "Bored Ape Yacht Club", symbol: "BAYC",
        floorPrice: 50000, volume24h: 1000000, owners: 6000, lastUpdated: Date.now(),
      },
      {
        contractAddress: "0x60ae865ee4c749cdfe64ab18a64c482dcfc77ae8",
        name: "Azuki", symbol: "AZUKI",
        floorPrice: 15000, volume24h: 500000, owners: 5000, lastUpdated: Date.now(),
      },
    ];

    for (const collection of collections) {
      this.nftCollections.set(collection.contractAddress, collection);
    }

    logger.info(`[BlockchainGaming] ${collections.length} collection(s) NFT initialisée(s)`);
  }

  async initializeTokens(): Promise<void> {
    const tokens: GamingToken[] = [
      {
        symbol: "AXS", name: "Axie Infinity", price: 5.50,
        change24h: 2.5, marketCap: 500000000, lastUpdated: Date.now(),
      },
      {
        symbol: "MANA", name: "Decentraland", price: 0.50,
        change24h: -1.2, marketCap: 1000000000, lastUpdated: Date.now(),
      },
      {
        symbol: "SAND", name: "The Sandbox", price: 0.60,
        change24h: 3.8, marketCap: 1200000000, lastUpdated: Date.now(),
      },
    ];

    for (const token of tokens) {
      this.gamingTokens.set(token.symbol, token);
    }

    logger.info(`[BlockchainGaming] ${tokens.length} token(s) gaming initialisé(s)`);
  }

  async updateNFTPrices(): Promise<void> {
    for (const [address, collection] of this.nftCollections) {
      const priceChange = (Math.random() - 0.5) * 0.1;
      const newFloorPrice = collection.floorPrice * (1 + priceChange);

      const previousPrice = collection.floorPrice;
      collection.floorPrice = newFloorPrice;
      collection.lastUpdated = Date.now();

      if (priceChange < -0.05) {
        this.createAlert("nft_floor_drop", "high",
          `Chute significative du floor price de ${collection.name}: ${(priceChange * 100).toFixed(2)}%`,
          { collection: collection.name, previousPrice, newPrice: newFloorPrice }
        );
      }

      this.nftCollections.set(address, collection);
    }

    logger.debug("[BlockchainGaming] Prix NFT mis à jour");
  }

  async updateTokenPrices(): Promise<void> {
    for (const [symbol, token] of this.gamingTokens) {
      const priceChange = (Math.random() - 0.5) * 0.08;
      const newPrice = token.price * (1 + priceChange);

      const previousPrice = token.price;
      token.price = newPrice;
      token.change24h = priceChange * 100;
      token.lastUpdated = Date.now();

      if (priceChange > 0.05) {
        this.createAlert("token_spike", "medium",
          `Spike de prix pour ${token.name}: ${(priceChange * 100).toFixed(2)}%`,
          { token: token.name, previousPrice, newPrice }
        );
      }

      this.gamingTokens.set(symbol, token);
    }

    logger.debug("[BlockchainGaming] Prix tokens mis à jour");
  }

  private createAlert(
    type: BlockchainAlert["type"], severity: BlockchainAlert["severity"],
    message: string, data: Record<string, unknown>
  ): void {
    const alert: BlockchainAlert = {
      type, severity, message, data, timestamp: Date.now(),
    };

    this.alerts.push(alert);
    logger.warn(`[BlockchainGaming] Alert: ${message}`);
    this.cleanupOldAlerts();
  }

  private cleanupOldAlerts(): void {
    const oneDayAgo = Date.now() - 24 * 60 * 60 * 1000;
    this.alerts = this.alerts.filter(alert => alert.timestamp > oneDayAgo);
  }

  getRecentAlerts(hours: number = 24): BlockchainAlert[] {
    const cutoff = Date.now() - hours * 60 * 60 * 1000;
    return this.alerts.filter(alert => alert.timestamp > cutoff);
  }

  getLowestFloorCollections(limit: number = 5): NFTCollection[] {
    return Array.from(this.nftCollections.values())
      .sort((a, b) => a.floorPrice - b.floorPrice)
      .slice(0, limit);
  }

  getTopGainers(limit: number = 5): GamingToken[] {
    return Array.from(this.gamingTokens.values())
      .sort((a, b) => b.change24h - a.change24h)
      .slice(0, limit);
  }

  getTopLosers(limit: number = 5): GamingToken[] {
    return Array.from(this.gamingTokens.values())
      .sort((a, b) => a.change24h - b.change24h)
      .slice(0, limit);
  }

  async sendBlockchainReport(client: Client): Promise<void> {
    if (!config.logChannel) {
      logger.error("[BlockchainGaming] Channel de logs non configuré");
      return;
    }

    const channel = client.channels.cache.get(config.logChannel) as TextChannel;
    if (!channel || !channel.isTextBased()) {
      logger.error("[BlockchainGaming] Channel non disponible");
      return;
    }

    const topGainers = this.getTopGainers(3);
    const topLosers = this.getTopLosers(3);
    const recentAlerts = this.getRecentAlerts(24);

    const embed = new EmbedBuilder()
      .setTitle("🔗 Rapport Blockchain Gaming")
      .setDescription("Aperçu du marché gaming NFT et tokens")
      .setColor(0x00ff00)
      .addFields(
        {
          name: "📈 Top Gainers",
          value: topGainers.map(t => `${t.symbol}: ${t.change24h.toFixed(2)}%`).join("\n") || "Aucune donnée",
          inline: true,
        },
        {
          name: "📉 Top Losers",
          value: topLosers.map(t => `${t.symbol}: ${t.change24h.toFixed(2)}%`).join("\n") || "Aucune donnée",
          inline: true,
        },
        {
          name: "🚨 Alertes Récentes",
          value: recentAlerts.slice(0, 3).map(a => a.message).join("\n") || "Aucune alerte",
          inline: false,
        }
      )
      .setTimestamp()
      .setFooter({ text: "Données mises à jour automatiquement" });

    try {
      await channel.send({ embeds: [embed] });
      logger.info("[BlockchainGaming] Rapport envoyé");
    } catch (error) {
      logger.error("[BlockchainGaming] Erreur lors de l'envoi du rapport:", error);
    }
  }

  enableMonitoring(client: Client, intervalMs: number = 300000): void {
    if (this.monitoringInterval) {
      logger.warn("[BlockchainGaming] Surveillance déjà active");
      return;
    }

    logger.info(`[BlockchainGaming] Surveillance activée (intervalle: ${intervalMs}ms)`);

    this.monitoringInterval = setInterval(async () => {
      await this.updateNFTPrices();
      await this.updateTokenPrices();
      await this.sendBlockchainReport(client);
    }, intervalMs);
  }

  disableMonitoring(): void {
    if (this.monitoringInterval) {
      clearInterval(this.monitoringInterval);
      this.monitoringInterval = null;
      logger.info("[BlockchainGaming] Surveillance désactivée");
    }
  }

  getGlobalStats(): {
    totalCollections: number;
    totalTokens: number;
    totalVolume: number;
    averageFloorPrice: number;
    activeAlerts: number;
  } {
    const collections = Array.from(this.nftCollections.values());
    const tokens = Array.from(this.gamingTokens.values());

    const totalVolume = collections.reduce((sum, c) => sum + c.volume24h, 0);
    const averageFloorPrice = collections.length > 0
      ? collections.reduce((sum, c) => sum + c.floorPrice, 0) / collections.length
      : 0;

    return {
      totalCollections: collections.length,
      totalTokens: tokens.length,
      totalVolume,
      averageFloorPrice,
      activeAlerts: this.alerts.length,
    };
  }

  async saveData(): Promise<void> {
    for (const collection of this.nftCollections.values()) {
      await prisma.nftCollection.upsert({
        where: { contractAddress: collection.contractAddress },
        create: collection as any,
        update: collection as any,
      });
    }

    for (const token of this.gamingTokens.values()) {
      await prisma.gamingToken.upsert({
        where: { symbol: token.symbol },
        create: token as any,
        update: token as any,
      });
    }

    logger.info("[BlockchainGaming] Données sauvegardées dans Prisma");
  }

  async loadDataFromPrisma(): Promise<void> {
    const collections = await prisma.nftCollection.findMany();
    for (const collection of collections) {
      this.nftCollections.set(collection.contractAddress, collection as unknown as NFTCollection);
    }

    const tokens = await prisma.gamingToken.findMany();
    for (const token of tokens) {
      this.gamingTokens.set(token.symbol, token as unknown as GamingToken);
    }

    logger.info(`[BlockchainGaming] ${collections.length} collection(s) et ${tokens.length} token(s) chargé(s)`);
  }
}

export const blockchainGamingService = new BlockchainGamingService();
