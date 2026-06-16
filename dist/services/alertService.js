"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.AlertService = void 0;
const logger_1 = __importDefault(require("../utils/logger"));
const config_1 = require("../config");
const embedBuilder_1 = require("../components/embedBuilder");
class AlertService {
    client;
    alertHistory = new Map();
    COOLDOWN_MS = 30000; // 30 secondes entre alertes similaires
    constructor(client) {
        this.client = client;
    }
    /**
     * Envoie une alerte avec le niveau de priorité spécifié
     */
    async sendAlert(options) {
        const { title, message, priority, category, source, metadata, mentionRoles, mentionUsers } = options;
        // Vérifier le cooldown pour éviter le spam
        const alertKey = `${category || 'default'}:${title}`;
        const lastAlert = this.alertHistory.get(alertKey);
        if (lastAlert && Date.now() - lastAlert < this.COOLDOWN_MS) {
            logger_1.default.debug(`[AlertService] Alert cooldown pour: ${title}`);
            return;
        }
        this.alertHistory.set(alertKey, Date.now());
        // Créer l'embed avec la couleur appropriée
        const embed = new embedBuilder_1.AdvancedEmbedBuilder()
            .setAlertPriority(priority)
            .setTitle(this.getPriorityEmoji(priority) + " " + title)
            .setDescription(message)
            .setColor(embedBuilder_1.ALERT_COLORS[priority])
            .setTimestamp();
        // Ajouter des informations supplémentaires
        if (category) {
            embed.addFields({ name: "Catégorie", value: this.getCategoryEmoji(category), inline: true });
        }
        if (source) {
            embed.addFields({ name: "Source", value: source, inline: true });
        }
        // Ajouter les métadonnées si présentes
        if (metadata && Object.keys(metadata).length > 0) {
            const metadataText = Object.entries(metadata)
                .map(([key, value]) => `**${key}**: ${value}`)
                .join("\n");
            embed.addFields({ name: "Détails", value: metadataText, inline: false });
        }
        // Construire le contenu avec les mentions
        let content = "";
        if (mentionRoles && mentionRoles.length > 0) {
            content += mentionRoles.map(role => `<@&${role}>`).join(" ") + " ";
        }
        if (mentionUsers && mentionUsers.length > 0) {
            content += mentionUsers.map(user => `<@${user}>`).join(" ") + " ";
        }
        // Envoyer l'alerte
        await this.sendToLogChannel(content, embed);
    }
    /**
     * Envoie une alerte critique
     */
    async sendCriticalAlert(title, message, options) {
        await this.sendAlert({
            title,
            message,
            priority: embedBuilder_1.AlertPriority.CRITICAL,
            ...options
        });
    }
    /**
     * Envoie une alerte haute priorité
     */
    async sendHighAlert(title, message, options) {
        await this.sendAlert({
            title,
            message,
            priority: embedBuilder_1.AlertPriority.HIGH,
            ...options
        });
    }
    /**
     * Envoie une alerte moyenne priorité
     */
    async sendMediumAlert(title, message, options) {
        await this.sendAlert({
            title,
            message,
            priority: embedBuilder_1.AlertPriority.MEDIUM,
            ...options
        });
    }
    /**
     * Envoie une alerte basse priorité
     */
    async sendLowAlert(title, message, options) {
        await this.sendAlert({
            title,
            message,
            priority: embedBuilder_1.AlertPriority.LOW,
            ...options
        });
    }
    /**
     * Envoie une alerte information
     */
    async sendInfoAlert(title, message, options) {
        await this.sendAlert({
            title,
            message,
            priority: embedBuilder_1.AlertPriority.INFO,
            ...options
        });
    }
    /**
     * Envoie un tableau de bord des alertes récentes
     */
    async sendAlertDashboard() {
        const recentAlerts = Array.from(this.alertHistory.entries())
            .sort((a, b) => b[1] - a[1])
            .slice(0, 10);
        if (recentAlerts.length === 0) {
            return;
        }
        const embed = new embedBuilder_1.AdvancedEmbedBuilder()
            .setTitle("📊 Tableau de bord des alertes")
            .setColor(0x0099ff)
            .setTimestamp();
        const alertList = recentAlerts.map(([key, timestamp]) => {
            const timeAgo = Math.floor((Date.now() - timestamp) / 1000);
            return `• ${key} (${timeAgo}s)`;
        }).join("\n");
        embed.addFields({
            name: "Alertes récentes",
            value: alertList,
            inline: false
        });
        await this.sendToLogChannel("📊 **Dashboard des alertes**", embed);
    }
    /**
     * Nettoie l'historique des alertes anciennes
     */
    cleanupOldAlerts() {
        const now = Date.now();
        const maxAge = 24 * 60 * 60 * 1000; // 24 heures
        for (const [key, timestamp] of this.alertHistory.entries()) {
            if (now - timestamp > maxAge) {
                this.alertHistory.delete(key);
            }
        }
        logger_1.default.debug(`[AlertService] Nettoyage: ${this.alertHistory.size} alertes conservées`);
    }
    /**
     * Obtient l'emoji pour le niveau de priorité
     */
    getPriorityEmoji(priority) {
        switch (priority) {
            case embedBuilder_1.AlertPriority.CRITICAL: return "🚨";
            case embedBuilder_1.AlertPriority.HIGH: return "⚠️";
            case embedBuilder_1.AlertPriority.MEDIUM: return "🔶";
            case embedBuilder_1.AlertPriority.LOW: return "🔵";
            case embedBuilder_1.AlertPriority.INFO: return "ℹ️";
        }
    }
    /**
     * Obtient l'emoji pour la catégorie
     */
    getCategoryEmoji(category) {
        switch (category) {
            case "system": return "⚙️";
            case "gaming": return "🎮";
            case "moderation": return "🛡️";
            case "security": return "🔒";
            case "performance": return "📈";
            default: return "📌";
        }
    }
    /**
     * Envoie l'embed au canal de log
     */
    async sendToLogChannel(content, embed) {
        if (!config_1.config.logChannel) {
            logger_1.default.warn("[AlertService] LOG_CHANNEL_ID non configuré");
            return;
        }
        try {
            const channel = await this.client.channels.fetch(config_1.config.logChannel);
            if (!channel?.isTextBased()) {
                logger_1.default.error("[AlertService] Canal de log invalide");
                return;
            }
            await channel.send({
                content: content || undefined,
                embeds: [embed]
            });
            logger_1.default.info(`[AlertService] Alert envoyée: ${embed.data.title}`);
        }
        catch (error) {
            logger_1.default.error(`[AlertService] Erreur envoi alert: ${error}`);
        }
    }
    /**
     * Démarre le nettoyage automatique des alertes anciennes
     */
    startAutoCleanup() {
        setInterval(() => {
            this.cleanupOldAlerts();
        }, 60 * 60 * 1000); // Toutes les heures
        logger_1.default.info("[AlertService] Nettoyage automatique démarré");
    }
}
exports.AlertService = AlertService;
exports.default = AlertService;
//# sourceMappingURL=alertService.js.map