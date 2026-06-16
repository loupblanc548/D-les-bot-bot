"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.blockchainGamingService = void 0;
const logger_1 = __importDefault(require("../utils/logger"));
const discord_js_1 = require("discord.js");
const config_1 = require("../config");
const prisma_1 = __importDefault(require("../prisma"));
class BlockchainGamingService {
    nftCollections;
    gamingTokens;
    alerts;
    monitoringInterval = null;
    constructor() {
        this.nftCollections = new Map();
        this.gamingTokens = new Map();
        this.alerts = [];
        logger_1.default.info("[BlockchainGaming] Service initialisé");
    }
    async initializeCollections() {
        const collections = [
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
        logger_1.default.info(`[BlockchainGaming] ${collections.length} collection(s) NFT initialisée(s)`);
    }
    async initializeTokens() {
        const tokens = [
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
        logger_1.default.info(`[BlockchainGaming] ${tokens.length} token(s) gaming initialisé(s)`);
    }
    async updateNFTPrices() {
        for (const [address, collection] of this.nftCollections) {
            const priceChange = (Math.random() - 0.5) * 0.1;
            const newFloorPrice = collection.floorPrice * (1 + priceChange);
            const previousPrice = collection.floorPrice;
            collection.floorPrice = newFloorPrice;
            collection.lastUpdated = Date.now();
            if (priceChange < -0.05) {
                this.createAlert("nft_floor_drop", "high", `Chute significative du floor price de ${collection.name}: ${(priceChange * 100).toFixed(2)}%`, { collection: collection.name, previousPrice, newPrice: newFloorPrice });
            }
            this.nftCollections.set(address, collection);
        }
        logger_1.default.debug("[BlockchainGaming] Prix NFT mis à jour");
    }
    async updateTokenPrices() {
        for (const [symbol, token] of this.gamingTokens) {
            const priceChange = (Math.random() - 0.5) * 0.08;
            const newPrice = token.price * (1 + priceChange);
            const previousPrice = token.price;
            token.price = newPrice;
            token.change24h = priceChange * 100;
            token.lastUpdated = Date.now();
            if (priceChange > 0.05) {
                this.createAlert("token_spike", "medium", `Spike de prix pour ${token.name}: ${(priceChange * 100).toFixed(2)}%`, { token: token.name, previousPrice, newPrice });
            }
            this.gamingTokens.set(symbol, token);
        }
        logger_1.default.debug("[BlockchainGaming] Prix tokens mis à jour");
    }
    createAlert(type, severity, message, data) {
        const alert = {
            type, severity, message, data, timestamp: Date.now(),
        };
        this.alerts.push(alert);
        logger_1.default.warn(`[BlockchainGaming] Alert: ${message}`);
        this.cleanupOldAlerts();
    }
    cleanupOldAlerts() {
        const oneDayAgo = Date.now() - 24 * 60 * 60 * 1000;
        this.alerts = this.alerts.filter(alert => alert.timestamp > oneDayAgo);
    }
    getRecentAlerts(hours = 24) {
        const cutoff = Date.now() - hours * 60 * 60 * 1000;
        return this.alerts.filter(alert => alert.timestamp > cutoff);
    }
    getLowestFloorCollections(limit = 5) {
        return Array.from(this.nftCollections.values())
            .sort((a, b) => a.floorPrice - b.floorPrice)
            .slice(0, limit);
    }
    getTopGainers(limit = 5) {
        return Array.from(this.gamingTokens.values())
            .sort((a, b) => b.change24h - a.change24h)
            .slice(0, limit);
    }
    getTopLosers(limit = 5) {
        return Array.from(this.gamingTokens.values())
            .sort((a, b) => a.change24h - b.change24h)
            .slice(0, limit);
    }
    async sendBlockchainReport(client) {
        if (!config_1.config.logChannel) {
            logger_1.default.error("[BlockchainGaming] Channel de logs non configuré");
            return;
        }
        const channel = client.channels.cache.get(config_1.config.logChannel);
        if (!channel || !channel.isTextBased()) {
            logger_1.default.error("[BlockchainGaming] Channel non disponible");
            return;
        }
        const topGainers = this.getTopGainers(3);
        const topLosers = this.getTopLosers(3);
        const recentAlerts = this.getRecentAlerts(24);
        const embed = new discord_js_1.EmbedBuilder()
            .setTitle("🔗 Rapport Blockchain Gaming")
            .setDescription("Aperçu du marché gaming NFT et tokens")
            .setColor(0x00ff00)
            .addFields({
            name: "📈 Top Gainers",
            value: topGainers.map(t => `${t.symbol}: ${t.change24h.toFixed(2)}%`).join("\n") || "Aucune donnée",
            inline: true,
        }, {
            name: "📉 Top Losers",
            value: topLosers.map(t => `${t.symbol}: ${t.change24h.toFixed(2)}%`).join("\n") || "Aucune donnée",
            inline: true,
        }, {
            name: "🚨 Alertes Récentes",
            value: recentAlerts.slice(0, 3).map(a => a.message).join("\n") || "Aucune alerte",
            inline: false,
        })
            .setTimestamp()
            .setFooter({ text: "Données mises à jour automatiquement" });
        try {
            await channel.send({ embeds: [embed] });
            logger_1.default.info("[BlockchainGaming] Rapport envoyé");
        }
        catch (error) {
            logger_1.default.error("[BlockchainGaming] Erreur lors de l'envoi du rapport:", error);
        }
    }
    enableMonitoring(client, intervalMs = 300000) {
        if (this.monitoringInterval) {
            logger_1.default.warn("[BlockchainGaming] Surveillance déjà active");
            return;
        }
        logger_1.default.info(`[BlockchainGaming] Surveillance activée (intervalle: ${intervalMs}ms)`);
        this.monitoringInterval = setInterval(async () => {
            await this.updateNFTPrices();
            await this.updateTokenPrices();
            await this.sendBlockchainReport(client);
        }, intervalMs);
    }
    disableMonitoring() {
        if (this.monitoringInterval) {
            clearInterval(this.monitoringInterval);
            this.monitoringInterval = null;
            logger_1.default.info("[BlockchainGaming] Surveillance désactivée");
        }
    }
    getGlobalStats() {
        const collections = Array.from(this.nftCollections.values());
        const tokens = Array.from(this.gamingTokens.values());
        const totalVolume = collections.reduce((sum, c) => sum + c.volume24h, 0);
        co;
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
    async saveData() {
        for (const collection of this.nftCollections.values()) {
            await prisma_1.default.nftCollection.upsert({
                where: { contractAddress: collection.contractAddress },
                create: collection,
                update: collection,
            });
        }
        for (const token of this.gamingTokens.values()) {
            await prisma_1.default.gamingToken.upsert({
                where: { symbol: token.symbol },
                create: token,
                update: token,
            });
        }
        logger_1.default.info("[BlockchainGaming] Données sauvegardées dans Prisma");
    }
    async loadDataFromPrisma() {
        const collections = await prisma_1.default.nftCollection.findMany();
        for (const collection of collections) {
            this.nftCollections.set(collection.contractAddress, collection);
        }
        const tokens = await prisma_1.default.gamingToken.findMany();
        for (const token of tokens) {
            this.gamingTokens.set(token.symbol, token);
        }
        logger_1.default.info(`[BlockchainGaming] ${collections.length} collection(s) et ${tokens.length} token(s) chargé(s)`);
    }
}
exports.blockchainGamingService = new BlockchainGamingService();
//# sourceMappingURL=blockchain-gaming.js.map