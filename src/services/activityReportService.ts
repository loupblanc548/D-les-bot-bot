import { Client, TextChannel, EmbedBuilder } from "discord.js";
import prisma from "../prisma.js";
import logger from "../utils/logger.js";
import { config } from "../config.js";
import { AdvancedEmbedBuilder } from "../components/embedBuilder.js";

/**
 * Service de rapports d'activité avec statistiques
 * Génère des rapports détaillés sur l'utilisation du bot
 */

export interface CommandUsage {
  name: string;
  uses: number;
  successRate: number;
  avgResponseTime: number;
}

export interface UserActivity {
  userId: string;
  username: string;
  commandCount: number;
  lastActive: Date;
}

export interface ActivityReport {
  period: string;
  totalCommands: number;
  uniqueUsers: number;
  topCommands: CommandUsage[];
  topUsers: UserActivity[];
  errorRate: number;
  avgResponseTime: number;
}

class ActivityReportService {
  private client: Client;

  constructor(client: Client) {
    this.client = client;
  }

  /**
   * Génère un rapport d'activité pour une période donnée
   */
  async generateReport(hours: number): Promise<ActivityReport> {
    const since = new Date(Date.now() - hours * 60 * 60 * 1000);
    const period =
      hours >= 168
        ? "7 derniers jours"
        : hours >= 24
          ? "24 dernières heures"
          : `${hours} dernières heures`;

    try {
      // Récupérer les logs de commandes depuis la base de données
      const commandLogs = await prisma.commandLog.findMany({
        where: {
          timestamp: { gte: since },
        },
        orderBy: { timestamp: "desc" },
      });

      // Analyser les logs pour extraire les statistiques
      const commandStats = new Map<string, { uses: number; errors: number; totalTime: number }>();
      const userStats = new Map<string, { count: number; lastActive: Date }>();

      for (const log of commandLogs) {
        const commandName = log.command || "unknown";

        // Statistiques de commandes
        const cmdStats = commandStats.get(commandName) || { uses: 0, errors: 0, totalTime: 0 };
        cmdStats.uses++;
        commandStats.set(commandName, cmdStats);

        // Statistiques utilisateurs
        if (log.userId) {
          const userStatsData = userStats.get(log.userId) || {
            count: 0,
            lastActive: log.timestamp,
          };
          userStatsData.count++;
          if (log.timestamp > userStatsData.lastActive) {
            userStatsData.lastActive = log.timestamp;
          }
          userStats.set(log.userId, userStatsData);
        }
      }

      // Calculer les statistiques finales
      const totalCommands = commandLogs.length;
      const uniqueUsers = userStats.size;
      const _totalErrors = 0; // Pas de champ d'erreur dans CommandLog
      const errorRate = 0;

      // Top commandes
      const topCommands: CommandUsage[] = Array.from(commandStats.entries())
        .map(([name, stats]) => ({
          name,
          uses: stats.uses,
          successRate: stats.uses > 0 ? ((stats.uses - stats.errors) / stats.uses) * 100 : 100,
          avgResponseTime: stats.uses > 0 ? stats.totalTime / stats.uses : 0,
        }))
        .sort((a, b) => b.uses - a.uses)
        .slice(0, 10);

      // Top utilisateurs
      const topUsers: UserActivity[] = Array.from(userStats.entries())
        .map(([userId, stats]) => ({
          userId,
          username: this.getUsername(userId),
          commandCount: stats.count,
          lastActive: stats.lastActive,
        }))
        .sort((a, b) => b.commandCount - a.commandCount)
        .slice(0, 10);

      return {
        period,
        totalCommands,
        uniqueUsers,
        topCommands,
        topUsers,
        errorRate,
        avgResponseTime: 0, // Calculer si des temps de réponse sont disponibles
      };
    } catch (error) {
      logger.error(`[ActivityReport] Erreur génération rapport: ${error}`);
      return this.getEmptyReport(period);
    }
  }

  /**
   * Obtient le nom d'utilisateur à partir de l'ID
   */
  private getUsername(userId: string): string {
    try {
      const user = this.client.users.cache.get(userId);
      return user?.username || userId;
    } catch {
      return userId;
    }
  }

  /**
   * Obtient un rapport vide en cas d'erreur
   */
  private getEmptyReport(period: string): ActivityReport {
    return {
      period,
      totalCommands: 0,
      uniqueUsers: 0,
      topCommands: [],
      topUsers: [],
      errorRate: 0,
      avgResponseTime: 0,
    };
  }

  /**
   * Génère l'embed du rapport d'activité
   */
  generateReportEmbed(report: ActivityReport): EmbedBuilder {
    const embed = new AdvancedEmbedBuilder()
      .setTitle(`📊 Rapport d'activité - ${report.period}`)
      .setColor(0x0099ff)
      .setTimestamp();

    // Statistiques générales
    embed.addFields(
      { name: "🎮 Commandes totales", value: report.totalCommands.toString(), inline: true },
      { name: "👥 Utilisateurs uniques", value: report.uniqueUsers.toString(), inline: true },
      { name: "❌ Taux d'erreur", value: `${report.errorRate.toFixed(1)}%`, inline: true },
    );

    // Top commandes
    if (report.topCommands.length > 0) {
      const topCommandsText = report.topCommands
        .map(
          (cmd, i) =>
            `${i + 1}. \`/${cmd.name}\`: ${cmd.uses} utilisations (${cmd.successRate.toFixed(1)}% succès)`,
        )
        .join("\n");

      embed.addFields({
        name: "🏆 Top commandes",
        value: topCommandsText,
        inline: false,
      });
    }

    // Top utilisateurs
    if (report.topUsers.length > 0) {
      const topUsersText = report.topUsers
        .map((user, i) => `${i + 1}. ${user.username}: ${user.commandCount} commandes`)
        .join("\n");

      embed.addFields({
        name: "👥 Top utilisateurs",
        value: topUsersText,
        inline: false,
      });
    }

    // Graphique de répartition
    if (report.topCommands.length > 0) {
      const chart = this.generateCommandChart(report.topCommands.slice(0, 5));
      embed.addFields({
        name: "📈 Répartition des commandes",
        value: "```" + chart + "```",
        inline: false,
      });
    }

    return embed;
  }

  /**
   * Génère un graphique ASCII simple pour les commandes
   */
  private generateCommandChart(commands: CommandUsage[]): string {
    const maxUses = Math.max(...commands.map((c) => c.uses));

    let chart = "";
    for (const cmd of commands) {
      const barLength = Math.round((cmd.uses / maxUses) * 20);
      const bar = "█".repeat(barLength) + "░".repeat(20 - barLength);
      chart += `${cmd.name.padEnd(15)} ${bar} ${cmd.uses}\n`;
    }

    return chart;
  }

  /**
   * Envoie le rapport au canal de log
   */
  async sendReport(hours: number = 24): Promise<void> {
    if (!config.logChannel) {
      logger.warn("[ActivityReport] LOG_CHANNEL_ID non configuré");
      return;
    }

    try {
      const report = await this.generateReport(hours);
      const embed = this.generateReportEmbed(report);

      const channel = await this.client.channels.fetch(config.logChannel);
      if (!channel?.isTextBased()) {
        logger.error("[ActivityReport] Canal de log invalide");
        return;
      }

      await (channel as TextChannel).send({
        content: "📊 **Rapport d'activité automatique**",
        embeds: [embed],
      });

      logger.info(`[ActivityReport] Rapport envoyé pour ${report.period}`);
    } catch (error) {
      logger.error(`[ActivityReport] Erreur envoi rapport: ${error}`);
    }
  }

  /**
   * Envoie un rapport comparatif entre deux périodes
   */
  async sendComparativeReport(hours1: number, hours2: number): Promise<void> {
    if (!config.logChannel) {
      logger.warn("[ActivityReport] LOG_CHANNEL_ID non configuré");
      return;
    }

    try {
      const [report1, report2] = await Promise.all([
        this.generateReport(hours1),
        this.generateReport(hours2),
      ]);

      const embed = new AdvancedEmbedBuilder()
        .setTitle("📊 Rapport comparatif d'activité")
        .setColor(0x0099ff)
        .setTimestamp();

      // Comparaison des commandes
      const commandGrowth = report2.totalCommands - report1.totalCommands;
      const commandGrowthPercent =
        report1.totalCommands > 0
          ? ((commandGrowth / report1.totalCommands) * 100).toFixed(1)
          : "0";

      const userGrowth = report2.uniqueUsers - report1.uniqueUsers;
      const userGrowthPercent =
        report1.uniqueUsers > 0 ? ((userGrowth / report1.uniqueUsers) * 100).toFixed(1) : "0";

      embed.addFields(
        {
          name: "📈 Croissance des commandes",
          value: `${commandGrowth > 0 ? "+" : ""}${commandGrowth} (${commandGrowthPercent}%)`,
          inline: true,
        },
        {
          name: "👥 Croissance des utilisateurs",
          value: `${userGrowth > 0 ? "+" : ""}${userGrowth} (${userGrowthPercent}%)`,
          inline: true,
        },
      );

      const channel = await this.client.channels.fetch(config.logChannel);
      if (!channel?.isTextBased()) {
        logger.error("[ActivityReport] Canal de log invalide");
        return;
      }

      await (channel as TextChannel).send({
        content: "📊 **Rapport comparatif**",
        embeds: [embed],
      });

      logger.info("[ActivityReport] Rapport comparatif envoyé");
    } catch (error) {
      logger.error(`[ActivityReport] Erreur rapport comparatif: ${error}`);
    }
  }

  /**
   * Obtient les tendances d'utilisation
   */
  async getUsageTrends(days: number = 7): Promise<Array<{ date: string; commands: number }>> {
    const trends: Array<{ date: string; commands: number }> = [];

    for (let i = days - 1; i >= 0; i--) {
      const date = new Date(Date.now() - i * 24 * 60 * 60 * 1000);
      const dayStart = new Date(date.setHours(0, 0, 0, 0));
      const dayEnd = new Date(date.setHours(23, 59, 59, 999));

      try {
        const count = await prisma.commandLog.count({
          where: {
            timestamp: {
              gte: dayStart,
              lte: dayEnd,
            },
          },
        });

        trends.push({
          date: dayStart.toLocaleDateString("fr-FR", { day: "2-digit", month: "2-digit" }),
          commands: count,
        });
      } catch (error) {
        logger.error(`[ActivityReport] Erreur récupération tendance: ${error}`);
        trends.push({
          date: dayStart.toLocaleDateString("fr-FR", { day: "2-digit", month: "2-digit" }),
          commands: 0,
        });
      }
    }

    return trends;
  }
}

export default ActivityReportService;
