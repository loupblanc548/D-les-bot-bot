import { Client, TextChannel, EmbedBuilder } from "discord.js";
import prisma from "../prisma";
import logger from "../utils/logger";
import { config } from "../config";
import { AdvancedEmbedBuilder } from "../components/embedBuilder";

/**
 * Service de digest quotidien et hebdomadaire
 * Envoie des résumés automatiques des activités du bot
 */

interface DigestStats {
  patchNotes: number;
  deals: number;
  news: number;
  errors: number;
  uptime: number;
}

class DigestService {
  private client: Client;
  private dailyInterval: NodeJS.Timeout | null = null;
  private weeklyInterval: NodeJS.Timeout | null = null;

  constructor(client: Client) {
    this.client = client;
  }

  /**
   * Récupère les statistiques pour la période donnée
   */
  private async getStats(hours: number): Promise<DigestStats> {
    const since = new Date(Date.now() - hours * 60 * 60 * 1000);
    
    try {
      const [patchNotesCount, dealsCount, newsCount, logs] = await Promise.all([
        prisma.processedPatchNotes.count({
          where: { createdAt: { gte: since } }
        }),
        prisma.processedDeal.count({
          where: { createdAt: { gte: since } }
        }),
        prisma.notification.count({
          where: { sentAt: { gte: since } }
        }),
        prisma.log.findMany({
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
    } catch (error) {
      logger.error(`[DigestService] Erreur récupération stats: ${error}`);
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
  private async generateDailyDigest(): Promise<EmbedBuilder> {
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

    return AdvancedEmbedBuilder.createDailyDigest(`Digest Quotidien - ${date}`, sections);
  }

  /**
   * Génère le digest hebdomadaire
   */
  private async generateWeeklyDigest(): Promise<EmbedBuilder> {
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

    return AdvancedEmbedBuilder.createDailyDigest(`Digest Hebdomadaire - ${weekRange}`, sections);
  }

  /**
   * Envoie le digest au canal configuré
   */
  private async sendDigest(embed: EmbedBuilder): Promise<void> {
    if (!config.logChannel) {
      logger.warn("[DigestService] LOG_CHANNEL_ID non configuré");
      return;
    }

    try {
      const channel = await this.client.channels.fetch(config.logChannel);
      if (!channel?.isTextBased()) {
        logger.error("[DigestService] Canal de log invalide");
        return;
      }

      await (channel as TextChannel).send({
        content: "📊 **Rapport automatique**",
        embeds: [embed]
      });

      logger.info("[DigestService] Digest envoyé avec succès");
    } catch (error) {
      logger.error(`[DigestService] Erreur envoi digest: ${error}`);
    }
  }

  /**
   * Envoie le digest quotidien
   */
  private async sendDailyDigest(): Promise<void> {
    logger.info("[DigestService] Génération du digest quotidien...");
    const embed = await this.generateDailyDigest();
    await this.sendDigest(embed);
  }

  /**
   * Envoie le digest hebdomadaire
   */
  private async sendWeeklyDigest(): Promise<void> {
    logger.info("[DigestService] Génération du digest hebdomadaire...");
    const embed = await this.generateWeeklyDigest();
    await this.sendDigest(embed);
  }

  /**
   * Démarre le service de digest
   */
  start(): void {
    if (this.dailyInterval || this.weeklyInterval) {
      logger.warn("[DigestService] Service déjà démarré");
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
      this.sendDailyDigest().catch(error => 
        logger.error(`[DigestService] Erreur digest quotidien: ${error}`)
      );
    }, 24 * 60 * 60 * 1000); // Toutes les 24h

    // Premier envoi après le délai initial
    setTimeout(() => {
      this.sendDailyDigest().catch(error => 
        logger.error(`[DigestService] Erreur digest quotidien initial: ${error}`)
      );
    }, dailyDelay);

    // Digest hebdomadaire le lundi à 9h00
    const weeklyTime = new Date(dailyTime);
    while (weeklyTime.getDay() !== 1) { // 1 = lundi
      weeklyTime.setDate(weeklyTime.getDate() + 1);
    }

    const weeklyDelay = weeklyTime.getTime() - now.getTime();
    this.weeklyInterval = setInterval(() => {
      this.sendWeeklyDigest().catch(error => 
        logger.error(`[DigestService] Erreur digest hebdomadaire: ${error}`)
      );
    }, 7 * 24 * 60 * 60 * 1000); // Toutes les semaines

    setTimeout(() => {
      this.sendWeeklyDigest().catch(error => 
        logger.error(`[DigestService] Erreur digest hebdomadaire initial: ${error}`)
      );
    }, weeklyDelay);

    logger.info("[DigestService] Service démarré - Quotidien: 9h00, Hebdomadaire: Lundi 9h00");
  }

  /**
   * Arrête le service de digest
   */
  stop(): void {
    if (this.dailyInterval) {
      clearInterval(this.dailyInterval);
      this.dailyInterval = null;
    }
    if (this.weeklyInterval) {
      clearInterval(this.weeklyInterval);
      this.weeklyInterval = null;
    }
    logger.info("[DigestService] Service arrêté");
  }

  /**
   * Envoie un digest manuel (pour test)
   */
  async sendManualDigest(type: 'daily' | 'weekly'): Promise<void> {
    if (type === 'daily') {
      await this.sendDailyDigest();
    } else {
      await this.sendWeeklyDigest();
    }
  }
}

export default DigestService;
