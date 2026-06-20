import { EmbedBuilder } from "discord.js";
export const PLATFORM_THEMES = {
    steam: {
        color: 0x000080,
        iconUrl: "https://store.steampowered.com/favicon.ico",
        label: "Steam",
        emoji: "🎮"
    },
    epic: {
        color: 0x2a2a2a,
        iconUrl: "https://store.epicgames.com/favicon.ico",
        label: "Epic Games",
        emoji: "🎯"
    },
    playstation: {
        color: 0x003791,
        iconUrl: "https://www.playstation.com/favicon.ico",
        label: "PlayStation",
        emoji: "🎮"
    },
    xbox: {
        color: 0x107c10,
        iconUrl: "https://www.xbox.com/favicon.ico",
        label: "Xbox",
        emoji: "🎮"
    },
    nintendo: {
        color: 0xe60012,
        iconUrl: "https://www.nintendo.com/favicon.ico",
        label: "Nintendo",
        emoji: "🎮"
    },
    default: {
        color: 0x0099ff,
        iconUrl: "https://cdn.discordapp.com/embed/avatars/0.png",
        label: "Bot",
        emoji: "🤖"
    }
};
/**
 * Niveaux de priorité pour les alertes
 */
export var AlertPriority;
(function (AlertPriority) {
    AlertPriority[AlertPriority["CRITICAL"] = 0] = "CRITICAL";
    AlertPriority[AlertPriority["HIGH"] = 1] = "HIGH";
    AlertPriority[AlertPriority["MEDIUM"] = 2] = "MEDIUM";
    AlertPriority[AlertPriority["LOW"] = 3] = "LOW";
    AlertPriority[AlertPriority["INFO"] = 4] = "INFO";
})(AlertPriority || (AlertPriority = {}));
export const ALERT_COLORS = {
    [AlertPriority.CRITICAL]: 0xff0000,
    [AlertPriority.HIGH]: 0xff6600,
    [AlertPriority.MEDIUM]: 0xffcc00,
    [AlertPriority.LOW]: 0x00cc00,
    [AlertPriority.INFO]: 0x0099ff
};
/**
 * Créateur d'embeds visuels avancés
 */
export class AdvancedEmbedBuilder extends EmbedBuilder {
    theme;
    priority;
    /**
     * Définit le thème de la plateforme
     */
    setPlatformTheme(platform) {
        this.theme = PLATFORM_THEMES[platform.toLowerCase()] || PLATFORM_THEMES.default;
        this.setColor(this.theme.color);
        return this;
    }
    /**
     * Définit le niveau de priorité de l'alerte
     */
    setAlertPriority(priority) {
        this.priority = priority;
        this.setColor(ALERT_COLORS[priority]);
        return this;
    }
    /**
     * Crée un tableau de bord visuel avec ASCII art
     */
    createDashboard(stats) {
        const dashboard = this.createAsciiChart(stats);
        this.addFields({
            name: "📊 Statistiques",
            value: "```" + dashboard + "```",
            inline: false
        });
        return this;
    }
    /**
     * Crée un graphique ASCII simple
     */
    createAsciiChart(stats) {
        const entries = Object.entries(stats);
        const maxVal = Math.max(...Object.values(stats));
        let chart = "";
        for (const [key, value] of entries) {
            const barLength = Math.round((value / maxVal) * 20);
            const bar = "█".repeat(barLength) + "░".repeat(20 - barLength);
            chart += `${key.padEnd(15)} ${bar} ${value}\n`;
        }
        return chart;
    }
    /**
     * Ajoute une barre de progression visuelle
     */
    addProgressBar(label, current, max, emoji = "▓") {
        const percentage = Math.round((current / max) * 100);
        const filled = Math.round((current / max) * 20);
        const bar = emoji.repeat(filled) + "░".repeat(20 - filled);
        this.addFields({
            name: label,
            value: `${bar} ${percentage}% (${current}/${max})`,
            inline: false
        });
        return this;
    }
    /**
     * Crée une section avec séparateur visuel
     */
    addSection(title, content, emoji = "📌") {
        this.addFields({
            name: `${emoji} ${title}`,
            value: content,
            inline: false
        });
        return this;
    }
    /**
     * Crée une grille de comparaison
     */
    addComparisonGrid(items) {
        const grid = items.map(item => `${item.emoji} **${item.name}**: ${item.value}`).join("\n");
        this.addFields({
            name: "⚖️ Comparaison",
            value: grid,
            inline: false
        });
        return this;
    }
    /**
     * Applique le thème complet à l'embed
     */
    applyTheme() {
        if (this.theme) {
            this.setAuthor({
                name: this.theme.label,
                iconURL: this.theme.iconUrl
            });
        }
        return this;
    }
    /**
     * Crée un embed de digest quotidien
     */
    static createDailyDigest(title, sections) {
        const embed = new AdvancedEmbedBuilder()
            .setTitle(`📅 ${title}`)
            .setColor(0x0099ff)
            .setTimestamp();
        for (const section of sections) {
            embed.addSection(section.title, section.content, section.emoji);
        }
        return embed;
    }
    /**
     * Crée un embed de tableau de bord de monitoring
     */
    static createMonitoringDashboard(services) {
        const embed = new AdvancedEmbedBuilder()
            .setTitle("🔍 Tableau de bord de monitoring")
            .setColor(0x0099ff)
            .setTimestamp();
        const statusGrid = services.map(service => {
            const statusEmoji = service.status === "online" ? "🟢" :
                service.status === "warning" ? "🟡" : "🔴";
            return `${statusEmoji} ${service.emoji} **${service.name}**: ${service.status} (${service.uptime}% uptime)`;
        }).join("\n");
        embed.addFields({
            name: "📡 État des services",
            value: statusGrid,
            inline: false
        });
        return embed;
    }
    /**
     * Crée un embed de rapport d'activité
     */
    static createActivityReport(metrics) {
        const embed = new AdvancedEmbedBuilder()
            .setTitle(`📊 Rapport d'activité - ${metrics.period}`)
            .setColor(0x0099ff)
            .setTimestamp();
        embed.addFields({ name: "🎮 Commandes totales", value: metrics.totalCommands.toString(), inline: true }, { name: "👥 Utilisateurs actifs", value: metrics.activeUsers.toString(), inline: true });
        const topCommands = metrics.topCommands
            .slice(0, 5)
            .map((cmd, i) => `${i + 1}. ${cmd.name}: ${cmd.uses} utilisations`)
            .join("\n");
        embed.addFields({
            name: "🏆 Top commandes",
            value: topCommands,
            inline: false
        });
        return embed;
    }
}
export const COMMON_ACTIONS = {
    patchNote: [
        { label: "👍 Utile", style: "Success", customId: "patch_upvote" },
        { label: "👎 Pas utile", style: "Danger", customId: "patch_downvote" },
        { label: "🔄 Rafraîchir", style: "Secondary", customId: "patch_refresh" },
        { label: "🗑️ Masquer", style: "Secondary", customId: "patch_hide" }
    ],
    deal: [
        { label: "🔗 Voir", style: "Primary", customId: "deal_view" },
        { label: "💾 Sauvegarder", style: "Success", customId: "deal_save" },
        { label: "📤 Partager", style: "Secondary", customId: "deal_share" }
    ],
    news: [
        { label: "📖 Lire", style: "Primary", customId: "news_read" },
        { label: "💬 Discuter", style: "Secondary", customId: "news_discuss" },
        { label: "🔔 Suivre", style: "Success", customId: "news_follow" }
    ]
};
//# sourceMappingURL=embedBuilder.js.map