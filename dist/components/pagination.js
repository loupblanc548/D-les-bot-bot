"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.PaginationPresets = exports.PaginationSystem = void 0;
exports.createPagination = createPagination;
const discord_js_1 = require("discord.js");
const logger_1 = __importDefault(require("../utils/logger"));
class PaginationSystem {
    message;
    items;
    itemsPerPage;
    currentPage;
    totalPages;
    timeout;
    embedColor;
    embedTitle;
    footerText;
    collector;
    timeoutId = null;
    constructor(message, options) {
        this.message = message;
        this.items = options.items;
        this.itemsPerPage = options.itemsPerPage;
        this.currentPage = 0;
        this.totalPages = Math.ceil(this.items.length / this.itemsPerPage);
        this.timeout = options.timeout || 60000; // 1 minute par défaut
        this.embedColor = options.embedColor || 0x0099ff;
        this.embedTitle = options.embedTitle || "Pagination";
        this.footerText = options.footerText || "Navigation";
    }
    /**
     * Génère l'embed pour la page actuelle
     */
    generateEmbed() {
        const startIndex = this.currentPage * this.itemsPerPage;
        const endIndex = Math.min(startIndex + this.itemsPerPage, this.items.length);
        const pageItems = this.items.slice(startIndex, endIndex);
        const embed = new discord_js_1.EmbedBuilder()
            .setColor(this.embedColor)
            .setTitle(this.embedTitle)
            .setDescription(this.generatePageContent(pageItems))
            .setFooter({
            text: `${this.footerText} • Page ${this.currentPage + 1}/${this.totalPages} • ${this.items.length} éléments`
        })
            .setTimestamp();
        return embed;
    }
    /**
     * Génère le contenu de la page
     */
    generatePageContent(items) {
        return items.map((item, index) => {
            const globalIndex = this.currentPage * this.itemsPerPage + index + 1;
            const emoji = item.emoji || "•";
            const url = item.url ? ` [🔗](${item.url})` : "";
            return `${globalIndex}. ${emoji} **${item.title}**${url}\n   ${item.description}`;
        }).join("\n\n");
    }
    /**
     * Génère les boutons de navigation
     */
    generateButtons() {
        const row = new discord_js_1.ActionRowBuilder();
        // Bouton première page
        row.addComponents(new discord_js_1.ButtonBuilder()
            .setCustomId('pagination_first')
            .setLabel('⏮️')
            .setStyle(discord_js_1.ButtonStyle.Secondary)
            .setDisabled(this.currentPage === 0));
        // Bouton page précédente
        row.addComponents(new discord_js_1.ButtonBuilder()
            .setCustomId('pagination_prev')
            .setLabel('◀️')
            .setStyle(discord_js_1.ButtonStyle.Secondary)
            .setDisabled(this.currentPage === 0));
        // Bouton page suivante
        row.addComponents(new discord_js_1.ButtonBuilder()
            .setCustomId('pagination_next')
            .setLabel('▶️')
            .setStyle(discord_js_1.ButtonStyle.Secondary)
            .setDisabled(this.currentPage === this.totalPages - 1));
        // Bouton dernière page
        row.addComponents(new discord_js_1.ButtonBuilder()
            .setCustomId('pagination_last')
            .setLabel('⏭️')
            .setStyle(discord_js_1.ButtonStyle.Secondary)
            .setDisabled(this.currentPage === this.totalPages - 1));
        // Bouton stop
        row.addComponents(new discord_js_1.ButtonBuilder()
            .setCustomId('pagination_stop')
            .setLabel('⏹️')
            .setStyle(discord_js_1.ButtonStyle.Danger));
        return row;
    }
    /**
     * Met à jour le message avec la nouvelle page
     */
    async updateMessage() {
        try {
            await this.message.edit({
                embeds: [this.generateEmbed()],
                components: [this.generateButtons()]
            });
        }
        catch (error) {
            logger_1.default.error(`[Pagination] Erreur mise à jour message: ${error}`);
        }
    }
    /**
     * Gère les interactions avec les boutons
     */
    handleInteraction(interaction) {
        if (!interaction.isButton())
            return;
        switch (interaction.customId) {
            case 'pagination_first':
                this.currentPage = 0;
                break;
            case 'pagination_prev':
                if (this.currentPage > 0)
                    this.currentPage--;
                break;
            case 'pagination_next':
                if (this.currentPage < this.totalPages - 1)
                    this.currentPage++;
                break;
            case 'pagination_last':
                this.currentPage = this.totalPages - 1;
                break;
            case 'pagination_stop':
                this.stop();
                interaction.update({ components: [] }).catch(() => { });
                return;
        }
        this.updateMessage();
        interaction.update({}).catch(() => { });
    }
    /**
     * Démarre la pagination
     */
    async start() {
        await this.updateMessage();
        // Créer le collector pour les interactions
        const filter = (i) => i.user.id === this.message.author.id;
        this.collector = this.message.createMessageComponentCollector({
            filter,
            time: this.timeout
        });
        this.collector.on('collect', (interaction) => {
            this.handleInteraction(interaction);
        });
        this.collector.on('end', () => {
            this.stop();
        });
        // Timeout automatique
        this.timeoutId = setTimeout(() => {
            this.stop();
        }, this.timeout);
        logger_1.default.info(`[Pagination] Démarrée pour ${this.items.length} éléments, ${this.totalPages} pages`);
    }
    /**
     * Arrête la pagination
     */
    stop() {
        if (this.collector) {
            this.collector.stop();
        }
        if (this.timeoutId) {
            clearTimeout(this.timeoutId);
        }
        this.message.edit({ components: [] }).catch(() => { });
        logger_1.default.info("[Pagination] Arrêtée");
    }
    /**
     * Change de page manuellement
     */
    goToPage(pageNumber) {
        if (pageNumber >= 0 && pageNumber < this.totalPages) {
            this.currentPage = pageNumber;
            this.updateMessage();
        }
    }
    /**
     * Obtient la page actuelle
     */
    getCurrentPage() {
        return this.currentPage;
    }
    /**
     * Obtient le nombre total de pages
     */
    getTotalPages() {
        return this.totalPages;
    }
}
exports.PaginationSystem = PaginationSystem;
/**
 * Fonction utilitaire pour créer une pagination rapidement
 */
async function createPagination(message, items, options = {}) {
    const defaultOptions = {
        items,
        itemsPerPage: options.itemsPerPage || 10,
        timeout: options.timeout || 60000,
        embedColor: options.embedColor || 0x0099ff,
        embedTitle: options.embedTitle || "Pagination",
        footerText: options.footerText || "Navigation"
    };
    const pagination = new PaginationSystem(message, defaultOptions);
    await pagination.start();
    return pagination;
}
/**
 * Types de pagination prédéfinis
 */
class PaginationPresets {
    /**
     * Pagination pour les commandes
     */
    static commands(items) {
        return items.map((cmd, i) => ({
            title: `/${cmd}`,
            description: `Commande #${i + 1}`,
            emoji: "⚡"
        }));
    }
    /**
     * Pagination pour les utilisateurs
     */
    static users(users) {
        return users.map(user => ({
            title: user.name,
            description: user.activity,
            emoji: "👤"
        }));
    }
    /**
     * Pagination pour les deals
     */
    static deals(deals) {
        return deals.map(deal => ({
            title: deal.title,
            description: `${deal.price} • ${deal.platform}`,
            emoji: "🎮"
        }));
    }
    /**
     * Pagination pour les patch notes
     */
    static patchNotes(patches) {
        return patches.map(patch => ({
            title: patch.title,
            description: `${patch.platform} • ${patch.date}`,
            emoji: "📋"
        }));
    }
}
exports.PaginationPresets = PaginationPresets;
//# sourceMappingURL=pagination.js.map