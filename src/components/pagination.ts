import { 
  ActionRowBuilder, 
  ButtonBuilder, 
  ButtonStyle, 
  EmbedBuilder, 
  Message, 
  MessageComponentInteraction 
} from "discord.js";
import logger from "../utils/logger.js";

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

export class PaginationSystem {
  private message: Message;
  private items: PaginationItem[];
  private itemsPerPage: number;
  private currentPage: number;
  private totalPages: number;
  private timeout: number;
  private embedColor: number;
  private embedTitle: string;
  private footerText: string;
  private collector: any = null;
  private timeoutId: NodeJS.Timeout | null = null;

  constructor(message: Message, options: PaginationOptions) {
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
  private generateEmbed(): EmbedBuilder {
    const startIndex = this.currentPage * this.itemsPerPage;
    const endIndex = Math.min(startIndex + this.itemsPerPage, this.items.length);
    const pageItems = this.items.slice(startIndex, endIndex);

    const embed = new EmbedBuilder()
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
  private generatePageContent(items: PaginationItem[]): string {
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
  private generateButtons(): ActionRowBuilder<ButtonBuilder> {
    const row = new ActionRowBuilder<ButtonBuilder>();

    // Bouton première page
    row.addComponents(
      new ButtonBuilder()
        .setCustomId('pagination_first')
        .setLabel('⏮️')
        .setStyle(ButtonStyle.Secondary)
        .setDisabled(this.currentPage === 0)
    );

    // Bouton page précédente
    row.addComponents(
      new ButtonBuilder()
        .setCustomId('pagination_prev')
        .setLabel('◀️')
        .setStyle(ButtonStyle.Secondary)
        .setDisabled(this.currentPage === 0)
    );

    // Bouton page suivante
    row.addComponents(
      new ButtonBuilder()
        .setCustomId('pagination_next')
        .setLabel('▶️')
        .setStyle(ButtonStyle.Secondary)
        .setDisabled(this.currentPage === this.totalPages - 1)
    );

    // Bouton dernière page
    row.addComponents(
      new ButtonBuilder()
        .setCustomId('pagination_last')
        .setLabel('⏭️')
        .setStyle(ButtonStyle.Secondary)
        .setDisabled(this.currentPage === this.totalPages - 1)
    );

    // Bouton stop
    row.addComponents(
      new ButtonBuilder()
        .setCustomId('pagination_stop')
        .setLabel('⏹️')
        .setStyle(ButtonStyle.Danger)
    );

    return row;
  }

  /**
   * Met à jour le message avec la nouvelle page
   */
  private async updateMessage(): Promise<void> {
    try {
      await this.message.edit({
        embeds: [this.generateEmbed()],
        components: [this.generateButtons()]
      });
    } catch (error) {
      logger.error(`[Pagination] Erreur mise à jour message: ${error}`);
    }
  }

  /**
   * Gère les interactions avec les boutons
   */
  private handleInteraction(interaction: MessageComponentInteraction): void {
    if (!interaction.isButton()) return;

    switch (interaction.customId) {
      case 'pagination_first':
        this.currentPage = 0;
        break;
      case 'pagination_prev':
        if (this.currentPage > 0) this.currentPage--;
        break;
      case 'pagination_next':
        if (this.currentPage < this.totalPages - 1) this.currentPage++;
        break;
      case 'pagination_last':
        this.currentPage = this.totalPages - 1;
        break;
      case 'pagination_stop':
        this.stop();
        interaction.update({ components: [] }).catch(() => {});
        return;
    }

    this.updateMessage();
    interaction.update({}).catch(() => {});
  }

  /**
   * Démarre la pagination
   */
  async start(): Promise<void> {
    await this.updateMessage();

    // Créer le collector pour les interactions
    const filter = (i: MessageComponentInteraction) => i.user.id === this.message.author.id;
    
    this.collector = this.message.createMessageComponentCollector({
      filter,
      time: this.timeout
    });

    (this.collector as any).on('collect', (interaction: MessageComponentInteraction) => {
      this.handleInteraction(interaction);
    });

    (this.collector as any).on('end', () => {
      this.stop();
    });

    // Timeout automatique
    this.timeoutId = setTimeout(() => {
      this.stop();
    }, this.timeout);

    logger.info(`[Pagination] Démarrée pour ${this.items.length} éléments, ${this.totalPages} pages`);
  }

  /**
   * Arrête la pagination
   */
  stop(): void {
    if (this.collector) {
      (this.collector as any).stop();
    }
    if (this.timeoutId) {
      clearTimeout(this.timeoutId);
    }

    this.message.edit({ components: [] }).catch(() => {});
    logger.info("[Pagination] Arrêtée");
  }

  /**
   * Change de page manuellement
   */
  goToPage(pageNumber: number): void {
    if (pageNumber >= 0 && pageNumber < this.totalPages) {
      this.currentPage = pageNumber;
      this.updateMessage();
    }
  }

  /**
   * Obtient la page actuelle
   */
  getCurrentPage(): number {
    return this.currentPage;
  }

  /**
   * Obtient le nombre total de pages
   */
  getTotalPages(): number {
    return this.totalPages;
  }
}

/**
 * Fonction utilitaire pour créer une pagination rapidement
 */
export async function createPagination(
  message: Message,
  items: PaginationItem[],
  options: Partial<PaginationOptions> = {}
): Promise<PaginationSystem> {
  const defaultOptions: PaginationOptions = {
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
export class PaginationPresets {
  /**
   * Pagination pour les commandes
   */
  static commands(items: string[]): PaginationItem[] {
    return items.map((cmd, i) => ({
      title: `/${cmd}`,
      description: `Commande #${i + 1}`,
      emoji: "⚡"
    }));
  }

  /**
   * Pagination pour les utilisateurs
   */
  static users(users: Array<{ name: string; id: string; activity: string }>): PaginationItem[] {
    return users.map(user => ({
      title: user.name,
      description: user.activity,
      emoji: "👤"
    }));
  }

  /**
   * Pagination pour les deals
   */
  static deals(deals: Array<{ title: string; price: string; platform: string }>): PaginationItem[] {
    return deals.map(deal => ({
      title: deal.title,
      description: `${deal.price} • ${deal.platform}`,
      emoji: "🎮"
    }));
  }

  /**
   * Pagination pour les patch notes
   */
  static patchNotes(patches: Array<{ title: string; platform: string; date: string }>): PaginationItem[] {
    return patches.map(patch => ({
      title: patch.title,
      description: `${patch.platform} • ${patch.date}`,
      emoji: "📋"
    }));
  }
}
