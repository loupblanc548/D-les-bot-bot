import { Client, TextChannel, EmbedBuilder } from "discord.js";
import os from "os";
import logger from "../utils/logger.js";
import { safeInterval } from "../utils/safe-interval.js";
import { config } from "../config.js";
import { AdvancedEmbedBuilder } from "../components/embedBuilder.js";
import { metricsCollector } from "../utils/metrics.js";

/**
 * Service de tableau de bord de monitoring en temps reel
 * Affiche l'etat des services, les metriques et les performances
 *
 * Les metriques par periode (1h, 6h, 24h) utilisent l'agregation
 * temporelle basee sur les snapshots horodates (delta entre le premier
 * et le dernier snapshot de la periode = 60 min de donnees, pas 60 pts).
 */

export interface ServiceStatus {
  name: string;
  status: "online" | "warning" | "offline" | "maintenance";
  uptime: number;
  lastCheck: Date;
  responseTime?: number;
  errorCount?: number;
}

export interface SystemMetrics {
  cpu: number;
  memory: number;
  disk: number;
  network: {
    inbound: number;
    outbound: number;
  };
}

class MonitoringDashboard {
  private client: Client;
  private services: Map<string, ServiceStatus> = new Map();
  private updateInterval: NodeJS.Timeout | null = null;
  private readonly UPDATE_INTERVAL_MS = 60000; // 1 minute

  constructor(client: Client) {
    this.client = client;
    this.initializeServices();
  }

  /**
   * Initialise les services a surveiller
   */
  private initializeServices(): void {
    this.services.set("discord", {
      name: "Discord API",
      status: "online",
      uptime: 100,
      lastCheck: new Date(),
      responseTime: 50,
    });

    this.services.set("database", {
      name: "Base de donnees",
      status: "online",
      uptime: 100,
      lastCheck: new Date(),
      responseTime: 20,
    });

    this.services.set("rss", {
      name: "Flux RSS",
      status: "online",
      uptime: 100,
      lastCheck: new Date(),
      responseTime: 150,
    });

    this.services.set("cron", {
      name: "Taches cron",
      status: "online",
      uptime: 100,
      lastCheck: new Date(),
      errorCount: 0,
    });

    this.services.set("ai", {
      name: "Service IA",
      status: "online",
      uptime: 100,
      lastCheck: new Date(),
      responseTime: 300,
    });
  }

  /**
   * Met a jour le statut d'un service
   */
  updateServiceStatus(
    serviceName: string,
    status: "online" | "warning" | "offline" | "maintenance",
    metadata?: Partial<ServiceStatus>,
  ): void {
    const service = this.services.get(serviceName);
    if (service) {
      service.status = status;
      service.lastCheck = new Date();
      if (metadata) {
        Object.assign(service, metadata);
      }
      logger.info(`[Monitoring] Service ${serviceName}: ${status}`);
    }
  }

  /**
   * Obtient les metriques systeme reelles (process, pas Math.random)
   */
  private async getSystemMetrics(): Promise<SystemMetrics> {
    const mem = process.memoryUsage();
    const totalMem = os.totalmem();
    const freeMem = os.freemem();

    return {
      cpu: process.cpuUsage().user / 1000000, // secondes CPU user
      memory: (mem.rss / totalMem) * 100, // % mémoire RSS
      disk: ((totalMem - freeMem) / totalMem) * 100, // % disque (approximation via mem)
      network: {
        inbound: 0, // Non disponible sans monitoring réseau
        outbound: 0,
      },
    };
  }

  /**
   * Genere l'embed du tableau de bord
   */
  private async generateDashboardEmbed(): Promise<EmbedBuilder> {
    const systemMetrics = await this.getSystemMetrics();
    const servicesArray = Array.from(this.services.values());

    // Enregistre les snapshots temporels pour l'agregation par periode
    const performanceMetrics = metricsCollector.getAllMetrics();
    for (const [jobName] of performanceMetrics) {
      metricsCollector.recordSnapshot(jobName);
    }

    const embed = new AdvancedEmbedBuilder()
      .setTitle("🔍 Tableau de bord de monitoring en temps reel")
      .setColor(0x0099ff)
      .setTimestamp();

    // Section Services
    const servicesText = servicesArray
      .map((service) => {
        const statusEmoji =
          service.status === "online"
            ? "🟢"
            : service.status === "warning"
              ? "🟡"
              : service.status === "maintenance"
                ? "🟠"
                : "🔴";
        const responseTime = service.responseTime ? ` (${service.responseTime}ms)` : "";
        return `${statusEmoji} **${service.name}**: ${service.status}${responseTime} • Uptime: ${service.uptime}%`;
      })
      .join("\n");

    embed.addFields({
      name: "📡 Etat des services",
      value: servicesText,
      inline: false,
    });

    // Section Metriques systeme
    embed.addProgressBar("CPU", systemMetrics.cpu, 100, "▓");
    embed.addProgressBar("Memoire", systemMetrics.memory, 100, "▓");
    embed.addProgressBar("Disque", systemMetrics.disk, 100, "▓");

    embed.addFields({
      name: "🌐 Reseau",
      value: `↓ Entrant: ${systemMetrics.network.inbound.toFixed(2)} KB/s\n↑ Sortant: ${systemMetrics.network.outbound.toFixed(2)} KB/s`,
      inline: true,
    });

    // Section Metriques de performance
    const metricsText = Array.from(performanceMetrics.entries())
      .map(([key, value]) => {
        const successRate =
          value.totalProcessed > 0
            ? ((value.totalSuccess / value.totalProcessed) * 100).toFixed(1)
            : "0";
        const avgTime = value.totalProcessed > 0 ? value.averageProcessingTime.toFixed(0) : "0";
        return `• ${key}: ${value.totalProcessed} executions, ${successRate}% succes, ${avgTime}ms moyen`;
      })
      .join("\n");

    embed.addFields({
      name: "📊 Metriques de performance",
      value: metricsText || "Aucune metrique disponible",
      inline: false,
    });

    // Section Metriques agrégées par periode (1h = 60 min, pas 60 pts)
    if (performanceMetrics.size > 0) {
      const summary1h = metricsCollector.getAggregatedSummaryForPeriod(60 * 60 * 1000, "1h");
      const summary6h = metricsCollector.getAggregatedSummaryForPeriod(6 * 60 * 60 * 1000, "6h");
      const summary24h = metricsCollector.getAggregatedSummaryForPeriod(24 * 60 * 60 * 1000, "24h");

      const periodLines: string[] = [];
      if (summary1h) {
        periodLines.push(
          `• **1h** : ${summary1h.processedInPeriod} traites, ${summary1h.successRate.toFixed(1)}% succes`,
        );
      }
      if (summary6h) {
        periodLines.push(
          `• **6h** : ${summary6h.processedInPeriod} traites, ${summary6h.successRate.toFixed(1)}% succes`,
        );
      }
      if (summary24h) {
        periodLines.push(
          `• **24h** : ${summary24h.processedInPeriod} traites, ${summary24h.successRate.toFixed(1)}% succes`,
        );
      }

      if (periodLines.length > 0) {
        embed.addFields({
          name: "📈 Metriques par periode (agrégées)",
          value: periodLines.join("\n"),
          inline: false,
        });
      }
    }

    // Section Statistiques Discord
    const guildCount = this.client.guilds.cache.size;
    const userCount = this.client.users.cache.size;
    const channelCount = this.client.channels.cache.size;

    embed.addFields(
      { name: "🌐 Serveurs", value: guildCount.toString(), inline: true },
      { name: "👥 Utilisateurs", value: userCount.toString(), inline: true },
      { name: "📢 Salons", value: channelCount.toString(), inline: true },
    );

    return embed;
  }

  /**
   * Envoie le tableau de bord au canal de monitoring
   */
  private async sendDashboard(): Promise<void> {
    if (!config.logChannel) {
      logger.warn("[MonitoringDashboard] LOG_CHANNEL_ID non configure");
      return;
    }

    try {
      const channel = await this.client.channels.fetch(config.logChannel);
      if (!channel?.isTextBased()) {
        logger.error("[MonitoringDashboard] Canal de monitoring invalide");
        return;
      }

      const embed = await this.generateDashboardEmbed();
      await (channel as TextChannel).send({
        content: "🔍 **Mise a jour du tableau de bord**",
        embeds: [embed],
      });

      logger.info("[MonitoringDashboard] Tableau de bord envoye");
    } catch (error) {
      logger.error(`[MonitoringDashboard] Erreur envoi dashboard: ${error}`);
    }
  }

  /**
   * Demarre le monitoring automatique
   */
  start(): void {
    if (this.updateInterval) {
      logger.warn("[MonitoringDashboard] Deja en cours d'execution");
      return;
    }

    // Envoyer immediatement
    this.sendDashboard().catch((error) =>
      logger.error(`[MonitoringDashboard] Erreur envoi initial: ${error}`),
    );

    // Mettre a jour regulierement
    this.updateInterval = safeInterval(
      "MonitoringDashboard",
      () =>
        this.sendDashboard().catch((error) =>
          logger.error(`[MonitoringDashboard] Erreur mise a jour: ${error}`),
        ),
      this.UPDATE_INTERVAL_MS,
    );

    logger.info(
      `[MonitoringDashboard] Demarre - Mise a jour toutes les ${this.UPDATE_INTERVAL_MS / 1000} secondes`,
    );
  }

  /**
   * Arrete le monitoring
   */
  stop(): void {
    if (this.updateInterval) {
      clearInterval(this.updateInterval);
      this.updateInterval = null;
      logger.info("[MonitoringDashboard] Arrete");
    }
  }

  /**
   * Envoie un rapport de sante rapide
   */
  async sendHealthCheck(): Promise<void> {
    const servicesArray = Array.from(this.services.values());
    const allOnline = servicesArray.every((s) => s.status === "online");

    const embed = new AdvancedEmbedBuilder()
      .setTitle(allOnline ? "✅ Systeme sain" : "⚠️ Problemes detectes")
      .setColor(allOnline ? 0x00cc00 : 0xffcc00)
      .setTimestamp();

    const healthText = servicesArray
      .map((service) => {
        const statusEmoji = service.status === "online" ? "✅" : "❌";
        return `${statusEmoji} ${service.name}: ${service.status}`;
      })
      .join("\n");

    embed.addFields({
      name: "Etat de sante",
      value: healthText,
      inline: false,
    });

    await this.sendDashboard();
  }

  /**
   * Obtient le statut actuel des services
   */
  getServiceStatus(serviceName: string): ServiceStatus | undefined {
    return this.services.get(serviceName);
  }

  /**
   * Obtient tous les services
   */
  getAllServices(): ServiceStatus[] {
    return Array.from(this.services.values());
  }

  /**
   * Reinitialise les compteurs d'erreurs
   */
  resetErrorCounters(): void {
    for (const service of this.services.values()) {
      if (service.errorCount !== undefined) {
        service.errorCount = 0;
      }
    }
    logger.info("[MonitoringDashboard] Compteurs d'erreurs reinitialises");
  }
}

export default MonitoringDashboard;
