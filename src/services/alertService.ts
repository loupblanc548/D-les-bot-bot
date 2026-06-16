import { Client, TextChannel, EmbedBuilder, ColorResolvable } from "discord.js";
import logger from "../utils/logger";
import { config } from "../config";
import { AdvancedEmbedBuilder, AlertPriority, ALERT_COLORS } from "../components/embedBuilder";

/**
 * Service d'alertes priorisées par couleur
 * Gère l'envoi d'alertes avec différents niveaux de priorité et couleurs
 */

export interface AlertOptions {
  title: string;
  message: string;
  priority: AlertPriority;
  category?: "system" | "gaming" | "moderation" | "security" | "performance";
  source?: string;
  metadata?: Record<string, any>;
  mentionRoles?: string[];
  mentionUsers?: string[];
}

export class AlertService {
  private client: Client;
  private alertHistory: Map<string, number> = new Map();
  private readonly COOLDOWN_MS = 30000; // 30 secondes entre alertes similaires

  constructor(client: Client) {
    this.client = client;
  }

  /**
   * Envoie une alerte avec le niveau de priorité spécifié
   */
  async sendAlert(options: AlertOptions): Promise<void> {
    const { title, message, priority, category, source, metadata, mentionRoles, mentionUsers } = options;

    // Vérifier le cooldown pour éviter le spam
    const alertKey = `${category || 'default'}:${title}`;
    const lastAlert = this.alertHistory.get(alertKey);
    if (lastAlert && Date.now() - lastAlert < this.COOLDOWN_MS) {
      logger.debug(`[AlertService] Alert cooldown pour: ${title}`);
      return;
    }

    this.alertHistory.set(alertKey, Date.now());

    // Créer l'embed avec la couleur appropriée
    const embed = new AdvancedEmbedBuilder()
      .setAlertPriority(priority)
      .setTitle(this.getPriorityEmoji(priority) + " " + title)
      .setDescription(message)
      .setColor(ALERT_COLORS[priority] as ColorResolvable)
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
  async sendCriticalAlert(title: string, message: string, options?: Partial<AlertOptions>): Promise<void> {
    await this.sendAlert({
      title,
      message,
      priority: AlertPriority.CRITICAL,
      ...options
    });
  }

  /**
   * Envoie une alerte haute priorité
   */
  async sendHighAlert(title: string, message: string, options?: Partial<AlertOptions>): Promise<void> {
    await this.sendAlert({
      title,
      message,
      priority: AlertPriority.HIGH,
      ...options
    });
  }

  /**
   * Envoie une alerte moyenne priorité
   */
  async sendMediumAlert(title: string, message: string, options?: Partial<AlertOptions>): Promise<void> {
    await this.sendAlert({
      title,
      message,
      priority: AlertPriority.MEDIUM,
      ...options
    });
  }

  /**
   * Envoie une alerte basse priorité
   */
  async sendLowAlert(title: string, message: string, options?: Partial<AlertOptions>): Promise<void> {
    await this.sendAlert({
      title,
      message,
      priority: AlertPriority.LOW,
      ...options
    });
  }

  /**
   * Envoie une alerte information
   */
  async sendInfoAlert(title: string, message: string, options?: Partial<AlertOptions>): Promise<void> {
    await this.sendAlert({
      title,
      message,
      priority: AlertPriority.INFO,
      ...options
    });
  }

  /**
   * Envoie un tableau de bord des alertes récentes
   */
  async sendAlertDashboard(): Promise<void> {
    const recentAlerts = Array.from(this.alertHistory.entries())
      .sort((a, b) => b[1] - a[1])
      .slice(0, 10);

    if (recentAlerts.length === 0) {
      return;
    }

    const embed = new AdvancedEmbedBuilder()
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
  cleanupOldAlerts(): void {
    const now = Date.now();
    const maxAge = 24 * 60 * 60 * 1000; // 24 heures

    for (const [key, timestamp] of this.alertHistory.entries()) {
      if (now - timestamp > maxAge) {
        this.alertHistory.delete(key);
      }
    }

    logger.debug(`[AlertService] Nettoyage: ${this.alertHistory.size} alertes conservées`);
  }

  /**
   * Obtient l'emoji pour le niveau de priorité
   */
  private getPriorityEmoji(priority: AlertPriority): string {
    switch (priority) {
      case AlertPriority.CRITICAL: return "🚨";
      case AlertPriority.HIGH: return "⚠️";
      case AlertPriority.MEDIUM: return "🔶";
      case AlertPriority.LOW: return "🔵";
      case AlertPriority.INFO: return "ℹ️";
    }
  }

  /**
   * Obtient l'emoji pour la catégorie
   */
  private getCategoryEmoji(category: string): string {
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
  private async sendToLogChannel(content: string, embed: EmbedBuilder): Promise<void> {
    if (!config.logChannel) {
      logger.warn("[AlertService] LOG_CHANNEL_ID non configuré");
      return;
    }

    try {
      const channel = await this.client.channels.fetch(config.logChannel);
      if (!channel?.isTextBased()) {
        logger.error("[AlertService] Canal de log invalide");
        return;
      }

      await (channel as TextChannel).send({
        content: content || undefined,
        embeds: [embed]
      });

      logger.info(`[AlertService] Alert envoyée: ${embed.data.title}`);
    } catch (error) {
      logger.error(`[AlertService] Erreur envoi alert: ${error}`);
    }
  }

  /**
   * Démarre le nettoyage automatique des alertes anciennes
   */
  startAutoCleanup(): void {
    setInterval(() => {
      this.cleanupOldAlerts();
    }, 60 * 60 * 1000); // Toutes les heures

    logger.info("[AlertService] Nettoyage automatique démarré");
  }
}

export default AlertService;
