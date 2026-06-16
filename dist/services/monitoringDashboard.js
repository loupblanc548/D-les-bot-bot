"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
const logger_1 = __importDefault(require("../utils/logger"));
const config_1 = require("../config");
const embedBuilder_1 = require("../components/embedBuilder");
const metrics_1 = require("../utils/metrics");
class MonitoringDashboard {
    client;
    services = new Map();
    updateInterval = null;
    UPDATE_INTERVAL_MS = 60000; // 1 minute
    constructor(client) {
        this.client = client;
        this.initializeServices();
    }
    /**
     * Initialise les services à surveiller
     */
    initializeServices() {
        this.services.set("discord", {
            name: "Discord API",
            status: "online",
            uptime: 100,
            lastCheck: new Date(),
            responseTime: 50
        });
        this.services.set("database", {
            name: "Base de données",
            status: "online",
            uptime: 100,
            lastCheck: new Date(),
            responseTime: 20
        });
        this.services.set("rss", {
            name: "Flux RSS",
            status: "online",
            uptime: 100,
            lastCheck: new Date(),
            responseTime: 150
        });
        this.services.set("cron", {
            name: "Tâches cron",
            status: "online",
            uptime: 100,
            lastCheck: new Date(),
            errorCount: 0
        });
        this.services.set("ai", {
            name: "Service IA",
            status: "online",
            uptime: 100,
            lastCheck: new Date(),
            responseTime: 300
        });
    }
    /**
     * Met à jour le statut d'un service
     */
    updateServiceStatus(serviceName, status, metadata) {
        const service = this.services.get(serviceName);
        if (service) {
            service.status = status;
            service.lastCheck = new Date();
            if (metadata) {
                Object.assign(service, metadata);
            }
            logger_1.default.info(`[Monitoring] Service ${serviceName}: ${status}`);
        }
    }
    /**
     * Obtient les métriques système
     */
    async getSystemMetrics() {
        // Simulation des métriques système
        // Dans un environnement réel, vous utiliseriez os-utils ou similaire
        return {
            cpu: Math.random() * 30 + 10, // 10-40%
            memory: Math.random() * 40 + 30, // 30-70%
            disk: Math.random() * 20 + 40, // 40-60%
            network: {
                inbound: Math.random() * 1000,
                outbound: Math.random() * 500
            }
        };
    }
    /**
     * Génère l'embed du tableau de bord
     */
    async generateDashboardEmbed() {
        const systemMetrics = await this.getSystemMetrics();
        const servicesArray = Array.from(this.services.values());
        const embed = new embedBuilder_1.AdvancedEmbedBuilder()
            .setTitle("🔍 Tableau de bord de monitoring en temps réel")
            .setColor(0x0099ff)
            .setTimestamp();
        // Section Services
        const servicesText = servicesArray.map(service => {
            const statusEmoji = service.status === "online" ? "🟢" :
                service.status === "warning" ? "🟡" :
                    service.status === "maintenance" ? "🟠" : "🔴";
            const responseTime = service.responseTime ? ` (${service.responseTime}ms)` : "";
            return `${statusEmoji} **${service.name}**: ${service.status}${responseTime} • Uptime: ${service.uptime}%`;
        }).join("\n");
        embed.addFields({
            name: "📡 État des services",
            value: servicesText,
            inline: false
        });
        // Section Métriques système
        embed.addProgressBar("CPU", systemMetrics.cpu, 100, "▓");
        embed.addProgressBar("Mémoire", systemMetrics.memory, 100, "▓");
        embed.addProgressBar("Disque", systemMetrics.disk, 100, "▓");
        embed.addFields({
            name: "🌐 Réseau",
            value: `↓ Entrant: ${systemMetrics.network.inbound.toFixed(2)} KB/s\n↑ Sortant: ${systemMetrics.network.outbound.toFixed(2)} KB/s`,
            inline: true
        });
        // Section Métriques de performance
        const performanceMetrics = metrics_1.metricsCollector.getAllMetrics();
        const metricsText = Array.from(performanceMetrics.entries())
            .map(([key, value]) => {
            const successRate = value.totalProcessed > 0 ? ((value.totalSuccess / value.totalProcessed) * 100).toFixed(1) : "0";
            const avgTime = value.totalProcessed > 0 ? (value.averageProcessingTime).toFixed(0) : "0";
            return `• ${key}: ${value.totalProcessed} exécutions, ${successRate}% succès, ${avgTime}ms moyen`;
        })
            .join("\n");
        embed.addFields({
            name: "📊 Métriques de performance",
            value: metricsText || "Aucune métrique disponible",
            inline: false
        });
        // Section Statistiques Discord
        const guildCount = this.client.guilds.cache.size;
        const userCount = this.client.users.cache.size;
        const channelCount = this.client.channels.cache.size;
        embed.addFields({ name: "🌐 Serveurs", value: guildCount.toString(), inline: true }, { name: "👥 Utilisateurs", value: userCount.toString(), inline: true }, { name: "📢 Salons", value: channelCount.toString(), inline: true });
        return embed;
    }
    /**
     * Envoie le tableau de bord au canal de monitoring
     */
    async sendDashboard() {
        if (!config_1.config.logChannel) {
            logger_1.default.warn("[MonitoringDashboard] LOG_CHANNEL_ID non configuré");
            return;
        }
        try {
            const channel = await this.client.channels.fetch(config_1.config.logChannel);
            if (!channel?.isTextBased()) {
                logger_1.default.error("[MonitoringDashboard] Canal de monitoring invalide");
                return;
            }
            const embed = await this.generateDashboardEmbed();
            await channel.send({
                content: "🔍 **Mise à jour du tableau de bord**",
                embeds: [embed]
            });
            logger_1.default.info("[MonitoringDashboard] Tableau de bord envoyé");
        }
        catch (error) {
            logger_1.default.error(`[MonitoringDashboard] Erreur envoi dashboard: ${error}`);
        }
    }
    /**
     * Démarre le monitoring automatique
     */
    start() {
        if (this.updateInterval) {
            logger_1.default.warn("[MonitoringDashboard] Déjà en cours d'exécution");
            return;
        }
        // Envoyer immédiatement
        this.sendDashboard().catch(error => logger_1.default.error(`[MonitoringDashboard] Erreur envoi initial: ${error}`));
        // Mettre à jour régulièrement
        this.updateInterval = setInterval(() => {
            this.sendDashboard().catch(error => logger_1.default.error(`[MonitoringDashboard] Erreur mise à jour: ${error}`));
        }, this.UPDATE_INTERVAL_MS);
        logger_1.default.info(`[MonitoringDashboard] Démarré - Mise à jour toutes les ${this.UPDATE_INTERVAL_MS / 1000} secondes`);
    }
    /**
     * Arrête le monitoring
     */
    stop() {
        if (this.updateInterval) {
            clearInterval(this.updateInterval);
            this.updateInterval = null;
            logger_1.default.info("[MonitoringDashboard] Arrêté");
        }
    }
    /**
     * Envoie un rapport de santé rapide
     */
    async sendHealthCheck() {
        const servicesArray = Array.from(this.services.values());
        const allOnline = servicesArray.every(s => s.status === "online");
        const embed = new embedBuilder_1.AdvancedEmbedBuilder()
            .setTitle(allOnline ? "✅ Système sain" : "⚠️ Problèmes détectés")
            .setColor(allOnline ? 0x00cc00 : 0xffcc00)
            .setTimestamp();
        const healthText = servicesArray.map(service => {
            const statusEmoji = service.status === "online" ? "✅" : "❌";
            return `${statusEmoji} ${service.name}: ${service.status}`;
        }).join("\n");
        embed.addFields({
            name: "État de santé",
            value: healthText,
            inline: false
        });
        await this.sendDashboard();
    }
    /**
     * Obtient le statut actuel des services
     */
    getServiceStatus(serviceName) {
        return this.services.get(serviceName);
    }
    /**
     * Obtient tous les services
     */
    getAllServices() {
        return Array.from(this.services.values());
    }
    /**
     * Réinitialise les compteurs d'erreurs
     */
    resetErrorCounters() {
        for (const service of this.services.values()) {
            if (service.errorCount !== undefined) {
                service.errorCount = 0;
            }
        }
        logger_1.default.info("[MonitoringDashboard] Compteurs d'erreurs réinitialisés");
    }
}
exports.default = MonitoringDashboard;
//# sourceMappingURL=monitoringDashboard.js.map