"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
const prisma_1 = __importDefault(require("../prisma"));
const logger_1 = __importDefault(require("../utils/logger"));
const config_1 = require("../config");
const embedBuilder_1 = require("../components/embedBuilder");
class DigestService {
    client;
    dailyInterval = null;
    weeklyInterval = null;
    constructor(client) {
        this.client = client;
    }
    /**
     * Récupère les statistiques pour la période donnée
     */
    async getStats(hours) {
        const since = new Date(Date.now() - hours * 60 * 60 * 1000);
        try {
            const [patchNotesCount, dealsCount, newsCount, logs] = await Promise.all([
                prisma_1.default.processedPatchNotes.count({
                    where: { createdAt: { gte: since } }
                }),
                prisma_1.default.processedDeal.count({
                    where: { createdAt: { gte: since } }
                }),
                prisma_1.default.notification.count({
                    where: { sentAt: { gte: since } }
                }),
                prisma_1.default.log.findMany({
                    where: {
                        createdAt: { gte: since }
                    },
                    take: 10
                })
            ]);
            return {
                patchNotes: patchNotesCount,
                deals: dealsCount,
                news: newsCount,
                errors: logs.length,
                uptime: 100 // Calculer l'uptime réel
            };
        }
        catch (error) {
            logger_1.default.error(`[DigestService] Erreur récupération stats: ${error}`);
            return {
                patchNotes: 0,
                deals: 0,
                news: 0,
                errors: 0,
                uptime: 0
            };
        }
    }
    /**
     * Génère le digest quotidien
     */
    async generateDailyDigest() {
        const stats = await this.getStats(24);
        const date = new Date().toLocaleDateString('fr-FR', {
            weekday: 'long',
            year: 'numeric',
            month: 'long',
            day: 'numeric'
        });
        const sections = [
            {
                title: "Patch Notes",
                content: `${stats.patchNotes} nouveaux patch notes traités`,
                emoji: "📋"
            },
            {
                title: "Deals Gaming",
                content: `${stats.deals} deals détectés et partagés`,
                emoji: "🎮"
            },
            {
                title: "Actualités",
                content: `${stats.news} articles de news publiés`,
                emoji: "📢"
            },
            {
                title: "Système",
                content: `${stats.errors} erreurs • Uptime: ${stats.uptime}%`,
                emoji: "⚡"
            }
        ];
        return embedBuilder_1.AdvancedEmbedBuilder.createDailyDigest(`Digest Quotidien - ${date}`, sections);
    }
    /**
     * Génère le digest hebdomadaire
     */
    async generateWeeklyDigest() {
        const stats = await this.getStats(168); // 7 jours
        const weekStart = new Date(Date.now() - 168 * 60 * 60 * 1000);
        const weekEnd = new Date();
        const weekRange = `${weekStart.toLocaleDateString('fr-FR')} - ${weekEnd.toLocaleDateString('fr-FR')}`;
        const sections = [
            {
                title: "Résumé Hebdomadaire",
                content: `Patch Notes: ${stats.patchNotes}\nDeals: ${stats.deals}\nNews: ${stats.news}\nErreurs: ${stats.errors}`,
                emoji: "📊"
            },
            {
                title: "Performance",
                content: `Uptime moyen: ${stats.uptime}%\nStabilité: ${stats.errors < 5 ? 'Excellente' : stats.errors < 15 ? 'Bonne' : 'À améliorer'}`,
                emoji: "📈"
            }
        ];
        return embedBuilder_1.AdvancedEmbedBuilder.createDailyDigest(`Digest Hebdomadaire - ${weekRange}`, sections);
    }
    /**
     * Envoie le digest au canal configuré
     */
    async sendDigest(embed) {
        if (!config_1.config.logChannel) {
            logger_1.default.warn("[DigestService] LOG_CHANNEL_ID non configuré");
            return;
        }
        try {
            const channel = await this.client.channels.fetch(config_1.config.logChannel);
            if (!channel?.isTextBased()) {
                logger_1.default.error("[DigestService] Canal de log invalide");
                return;
            }
            await channel.send({
                content: "📊 **Rapport automatique**",
                embeds: [embed]
            });
            logger_1.default.info("[DigestService] Digest envoyé avec succès");
        }
        catch (error) {
            logger_1.default.error(`[DigestService] Erreur envoi digest: ${error}`);
        }
    }
    /**
     * Envoie le digest quotidien
     */
    async sendDailyDigest() {
        logger_1.default.info("[DigestService] Génération du digest quotidien...");
        const embed = await this.generateDailyDigest();
        await this.sendDigest(embed);
    }
    /**
     * Envoie le digest hebdomadaire
     */
    async sendWeeklyDigest() {
        logger_1.default.info("[DigestService] Génération du digest hebdomadaire...");
        const embed = await this.generateWeeklyDigest();
        await this.sendDigest(embed);
    }
    /**
     * Démarre le service de digest
     */
    start() {
        if (this.dailyInterval || this.weeklyInterval) {
            logger_1.default.warn("[DigestService] Service déjà démarré");
            return;
        }
        // Digest quotidien à 9h00
        const now = new Date();
        const dailyTime = new Date(now);
        dailyTime.setHours(9, 0, 0, 0);
        if (dailyTime <= now) {
            dailyTime.setDate(dailyTime.getDate() + 1);
        }
        const dailyDelay = dailyTime.getTime() - now.getTime();
        this.dailyInterval = setInterval(() => {
            this.sendDailyDigest().catch(error => logger_1.default.error(`[DigestService] Erreur digest quotidien: ${error}`));
        }, 24 * 60 * 60 * 1000); // Toutes les 24h
        // Premier envoi après le délai initial
        setTimeout(() => {
            this.sendDailyDigest().catch(error => logger_1.default.error(`[DigestService] Erreur digest quotidien initial: ${error}`));
        }, dailyDelay);
        // Digest hebdomadaire le lundi à 9h00
        const weeklyTime = new Date(dailyTime);
        while (weeklyTime.getDay() !== 1) { // 1 = lundi
            weeklyTime.setDate(weeklyTime.getDate() + 1);
        }
        const weeklyDelay = weeklyTime.getTime() - now.getTime();
        this.weeklyInterval = setInterval(() => {
            this.sendWeeklyDigest().catch(error => logger_1.default.error(`[DigestService] Erreur digest hebdomadaire: ${error}`));
        }, 7 * 24 * 60 * 60 * 1000); // Toutes les semaines
        setTimeout(() => {
            this.sendWeeklyDigest().catch(error => logger_1.default.error(`[DigestService] Erreur digest hebdomadaire initial: ${error}`));
        }, weeklyDelay);
        logger_1.default.info("[DigestService] Service démarré - Quotidien: 9h00, Hebdomadaire: Lundi 9h00");
    }
    /**
     * Arrête le service de digest
     */
    stop() {
        if (this.dailyInterval) {
            clearInterval(this.dailyInterval);
            this.dailyInterval = null;
        }
        if (this.weeklyInterval) {
            clearInterval(this.weeklyInterval);
            this.weeklyInterval = null;
        }
        logger_1.default.info("[DigestService] Service arrêté");
    }
    /**
     * Envoie un digest manuel (pour test)
     */
    async sendManualDigest(type) {
        if (type === 'daily') {
            await this.sendDailyDigest();
        }
        else {
            await this.sendWeeklyDigest();
        }
    }
}
exports.default = DigestService;
//# sourceMappingURL=digestService.js.map