/**
 * securityIntegration.ts — Intégration automatique des modules de sécurité
 *
 * Connecte threatIntel, autoDefense, alertDispatcher, aiLogAnalyzer,
 * googleCloudServices aux événements existants du bot.
 *
 * C'est le "cerveau" qui déclenche automatiquement les bons modules
 * quand quelque chose se passe sur le serveur.
 */

import { Client, Message, GuildMember, TextChannel } from "discord.js";
import logger from "../utils/logger.js";
import { scanURL } from "./threatIntel.js";
import {
  checkAutoQuarantine,
  isWhitelisted,
  startEscalation,
  cancelEscalation,
} from "./autoDefense.js";
import { dispatchAlert, createAlertPayload, updateChannelConfig } from "./alertDispatcher.js";
import { ingestLog, startContinuousAnalysis, stopContinuousAnalysis } from "./aiLogAnalyzer.js";
import {
  analyzeImage,
  analyzeText,
  checkYouTubeVideoSafety,
  isGoogleCloudConfigured,
} from "./googleCloudServices.js";
import { recordSecurityEvent } from "./socExtension.js";

// ─── État global ─────────────────────────────────────────────────────────────

let integrationEnabled = true;
let imageModerationEnabled = true;
let sentimentAnalysisEnabled = true;
let youtubeCheckEnabled = true;
let logAnalysisEnabled = true;

// ─── Configuration ───────────────────────────────────────────────────────────

export interface IntegrationConfig {
  enabled: boolean;
  imageModeration: boolean;
  sentimentAnalysis: boolean;
  youtubeCheck: boolean;
  logAnalysis: boolean;
  alertChannelId?: string;
  alertRoleId?: string;
}

export function getIntegrationConfig(): IntegrationConfig {
  return {
    enabled: integrationEnabled,
    imageModeration: imageModerationEnabled,
    sentimentAnalysis: sentimentAnalysisEnabled,
    youtubeCheck: youtubeCheckEnabled,
    logAnalysis: logAnalysisEnabled,
  };
}

export function updateIntegrationConfig(updates: Partial<IntegrationConfig>): IntegrationConfig {
  if (updates.enabled !== undefined) integrationEnabled = updates.enabled;
  if (updates.imageModeration !== undefined) imageModerationEnabled = updates.imageModeration;
  if (updates.sentimentAnalysis !== undefined) sentimentAnalysisEnabled = updates.sentimentAnalysis;
  if (updates.youtubeCheck !== undefined) youtubeCheckEnabled = updates.youtubeCheck;
  if (updates.logAnalysis !== undefined) logAnalysisEnabled = updates.logAnalysis;

  if (updates.alertChannelId || updates.alertRoleId) {
    updateChannelConfig({
      discordChannelId: updates.alertChannelId,
      discordRoleId: updates.alertRoleId,
    });
  }

  logger.info(`[SecurityIntegration] Config updated: enabled=${integrationEnabled}`);
  return getIntegrationConfig();
}

// ─── 1. Anti-Phishing étendu avec Threat Intelligence ────────────────────────

/**
 * Vérifie un URL suspect via toutes les sources de threat intelligence.
 * Appelé automatiquement par l'anti-phishing quand un lien suspect est détecté.
 */
export async function checkURLWithThreatIntel(
  client: Client,
  url: string,
  guildId: string,
  userId: string,
  userTag: string,
): Promise<boolean> {
  if (!integrationEnabled) return false;

  try {
    const scanResult = await scanURL(url);

    if (scanResult.overallMalicious) {
      // Alerte multi-canal
      await dispatchAlert(
        client,
        createAlertPayload(
          "🚨 URL malveillante détectée",
          `URL: ${url}\nUtilisateur: ${userTag} (${userId})\nConfiance: ${scanResult.overallConfidence}%\nSources: ${scanResult.results.map((r) => r.source).join(", ")}`,
          scanResult.overallConfidence > 70 ? "CRITICAL" : "HIGH",
          guildId,
          "ThreatIntel",
          { url, userId, scanResult },
        ),
      );

      recordSecurityEvent({
        guildId,
        type: "THREAT_INTEL_URL",
        severity: scanResult.overallConfidence > 70 ? "CRITICAL" : "HIGH",
        source: "ThreatIntel",
        message: `URL malveillante: ${url} (${scanResult.overallConfidence}%) par ${userTag}`,
        relatedUserId: userId,
        metadata: { url, confidence: scanResult.overallConfidence },
      });

      logger.warn(
        `[SecurityIntegration] URL malveillante: ${url} (${scanResult.overallConfidence}%)`,
      );
      return true;
    }

    return false;
  } catch (error) {
    logger.warn(
      `[SecurityIntegration] URL check error: ${error instanceof Error ? error.message : String(error)}`,
    );
    return false;
  }
}

// ─── 2. Auto-Defense sur guildMemberAdd ──────────────────────────────────────

/**
 * Vérifie automatiquement un nouveau membre via GeoBlock et Auto-Quarantine.
 * Appelé automatiquement sur guildMemberAdd.
 */
export async function checkNewMember(client: Client, member: GuildMember): Promise<void> {
  if (!integrationEnabled || isWhitelisted(member.id)) return;

  try {
    // GeoBlock — nécessite le pays d'origine (non disponible directement dans Discord)
    // Le bot peut utiliser l'IP si disponible via d'autres moyens, sinon skip
    // Pour l'instant, on check juste la quarantaine basée sur le profil

    // Auto-Quarantine basée sur l'âge du compte
    const accountAgeHours = (Date.now() - member.user.createdTimestamp) / (1000 * 60 * 60);
    const accountAgeDays = accountAgeHours / 24;

    const profile = {
      riskLevel: accountAgeHours < 24 ? "ELEVE" : accountAgeDays < 7 ? "MOYEN" : "FAIBLE",
      totalSanctions: 0,
      suspiciousFlags: accountAgeHours < 24 ? ["NEW_ACCOUNT"] : [],
      accountAgeHours,
    };

    const quarantined = await checkAutoQuarantine(member, profile);

    if (quarantined) {
      await dispatchAlert(
        client,
        createAlertPayload(
          "🔒 Auto-Quarantine déclenchée",
          `Membre: ${member.user.tag} (${member.id})\nRaison: Profil à risque (compte de ${Math.round(accountAgeHours)}h)`,
          "HIGH",
          member.guild.id,
          "AutoDefense",
          { userId: member.id, profile },
        ),
      );
    }
  } catch (error) {
    logger.warn(
      `[SecurityIntegration] Member check error: ${error instanceof Error ? error.message : String(error)}`,
    );
  }
}

// ─── 3. Modération d'images via Google Vision ────────────────────────────────

/**
 * Analyse automatiquement les images partagées sur le serveur.
 * Détecte le contenu inapproprié (adulte, violence, racy) via SafeSearch.
 */
export async function checkImageSafety(client: Client, message: Message): Promise<void> {
  if (!integrationEnabled || !imageModerationEnabled || !isGoogleCloudConfigured()) return;
  if (!message.guild || message.author.bot) return;

  // Récupérer les URLs d'images dans le message
  const imageUrls: string[] = [];

  // Attachements
  for (const attachment of message.attachments.values()) {
    if (attachment.contentType?.startsWith("image/")) {
      imageUrls.push(attachment.url);
    }
  }

  // Embeds avec images
  for (const embed of message.embeds) {
    if (embed.image?.url) imageUrls.push(embed.image.url);
    if (embed.thumbnail?.url) imageUrls.push(embed.thumbnail.url);
  }

  if (imageUrls.length === 0) return;

  for (const imageUrl of imageUrls) {
    try {
      const result = await analyzeImage(imageUrl);

      if (result.isUnsafe) {
        await message.delete().catch(() => {});

        const alert = await (message.channel as TextChannel).send({
          content: `⚠️ ${message.author} image supprimée (contenu inapproprié détecté par Google Vision)`,
        });
        setTimeout(() => alert.delete().catch(() => {}), 10000);

        recordSecurityEvent({
          guildId: message.guild.id,
          type: "IMAGE_MODERATION",
          severity: "HIGH",
          source: "GoogleVision",
          message: `Image inappropriée: ${message.author.tag} — ${result.safeSearch?.adult ?? "?"}`,
          relatedUserId: message.author.id,
          metadata: { imageUrl, safeSearch: result.safeSearch },
        });

        await dispatchAlert(
          client,
          createAlertPayload(
            "🖼️ Image inappropriée détectée",
            `Utilisateur: ${message.author.tag} (${message.author.id})\nSafeSearch: adult=${result.safeSearch?.adult}, violence=${result.safeSearch?.violence}, racy=${result.safeSearch?.racy}`,
            "HIGH",
            message.guild.id,
            "GoogleVision",
            { userId: message.author.id, imageUrl },
          ),
        );

        logger.warn(`[SecurityIntegration] Image unsafe: ${message.author.tag}`);
        return;
      }
    } catch (error) {
      logger.debug(
        `[SecurityIntegration] Image check error: ${error instanceof Error ? error.message : String(error)}`,
      );
    }
  }
}

// ─── 4. Analyse de sentiment via Google Natural Language ─────────────────────

/**
 * Analyse le sentiment d'un message pour détecter la toxicité.
 * Complète l'AI-Mod existant avec l'API Google.
 */
export async function checkMessageSentiment(client: Client, message: Message): Promise<void> {
  if (!integrationEnabled || !sentimentAnalysisEnabled || !isGoogleCloudConfigured()) return;
  if (!message.guild || message.author.bot) return;
  if (message.content.length < 20 || message.content.length > 5000) return;

  // Skip si l'auteur est modérateur/admin
  if ("member" in message && message.member?.permissions.has("ModerateMembers")) return;

  try {
    const result = await analyzeText(message.content);

    if (result.isToxic && result.toxicityScore > 0.7) {
      recordSecurityEvent({
        guildId: message.guild.id,
        type: "TOXIC_MESSAGE",
        severity: "MEDIUM",
        source: "GoogleNaturalLanguage",
        message: `Message toxique: ${message.author.tag} (score: ${result.toxicityScore.toFixed(2)})`,
        relatedUserId: message.author.id,
        metadata: { toxicityScore: result.toxicityScore, sentiment: result.sentiment },
      });

      // Pas de suppression automatique — l'AI-Mod existant s'en charge
      // On enregistre juste l'événement pour le SOC
      logger.info(
        `[SecurityIntegration] Sentiment toxique: ${message.author.tag} (${result.toxicityScore.toFixed(2)})`,
      );
    }
  } catch (error) {
    logger.debug(
      `[SecurityIntegration] Sentiment check error: ${error instanceof Error ? error.message : String(error)}`,
    );
  }
}

// ─── 5. Vérification YouTube ─────────────────────────────────────────────────

/**
 * Vérifie automatiquement les liens YouTube partagés pour détecter les scams.
 */
export async function checkYouTubeLink(client: Client, message: Message): Promise<void> {
  if (!integrationEnabled || !youtubeCheckEnabled || !isGoogleCloudConfigured()) return;
  if (!message.guild || message.author.bot) return;

  // Extraire les IDs de vidéos YouTube du message
  const youtubeRegex =
    /(?:youtube\.com\/watch\?v=|youtu\.be\/|youtube\.com\/embed\/)([a-zA-Z0-9_-]{11})/g;
  const matches = [...message.content.matchAll(youtubeRegex)];

  for (const match of matches) {
    const videoId = match[1];
    try {
      const safety = await checkYouTubeVideoSafety(videoId);

      if (safety.isSuspicious && safety.video) {
        recordSecurityEvent({
          guildId: message.guild.id,
          type: "YOUTUBE_SCAM",
          severity: "MEDIUM",
          source: "YouTubeCheck",
          message: `Vidéo YouTube suspecte: ${safety.video.title} — ${safety.reasons.join(", ")}`,
          relatedUserId: message.author.id,
          metadata: { videoId, reasons: safety.reasons },
        });

        // Alerte discrète (pas de suppression)
        await dispatchAlert(
          client,
          createAlertPayload(
            "🎬 Vidéo YouTube suspecte",
            `Utilisateur: ${message.author.tag}\nVidéo: ${safety.video.title}\nRaisons: ${safety.reasons.join(", ")}`,
            "MEDIUM",
            message.guild.id,
            "YouTubeCheck",
            { videoId, userId: message.author.id },
          ),
        );

        logger.warn(`[SecurityIntegration] YouTube suspect: ${safety.video.title}`);
      }
    } catch (error) {
      logger.debug(
        `[SecurityIntegration] YouTube check error: ${error instanceof Error ? error.message : String(error)}`,
      );
    }
  }
}

// ─── 6. Ingestion automatique des logs ───────────────────────────────────────

/**
 * Ingest les logs du bot dans l'AI Log Analyzer.
 * Appelé automatiquement par le logger.
 */
export function ingestBotLog(level: string, source: string, message: string): void {
  if (!integrationEnabled || !logAnalysisEnabled) return;
  ingestLog(level as any, source, message);
}

// ─── 7. Escalade automatique d'incident ──────────────────────────────────────

/**
 * Démarre une escalade automatique pour un incident critique.
 */
export async function autoEscalateIncident(
  client: Client,
  guildId: string,
  incidentId: string,
  description: string,
): Promise<void> {
  if (!integrationEnabled) return;

  startEscalation(guildId, incidentId, async (level, action) => {
    await dispatchAlert(
      client,
      createAlertPayload(
        `🔴 Escalade ${level}`,
        `Incident: ${description}\nAction: ${action}\nNiveau: ${level}`,
        level === "OWNER" ? "CRITICAL" : "HIGH",
        guildId,
        "AutoDefense",
        { incidentId, level, action },
      ),
    );
  });

  logger.warn(`[SecurityIntegration] Auto-escalation started: ${incidentId}`);
}

/**
 * Annule une escalade (incident résolu).
 */
export function resolveIncident(guildId: string, incidentId: string): void {
  cancelEscalation(guildId, incidentId);
  logger.info(`[SecurityIntegration] Incident resolved: ${incidentId}`);
}

// ─── 8. Démarrage / Arrêt ────────────────────────────────────────────────────

/**
 * Démarre toutes les intégrations de sécurité.
 * Appelé au démarrage du bot.
 */
export function startSecurityIntegration(_client: Client): void {
  if (logAnalysisEnabled) {
    startContinuousAnalysis();
  }

  // Ingest les logs globaux
  const originalLog = console.log;
  console.log = (...args: unknown[]) => {
    originalLog(...args);
    ingestBotLog("info", "console", args.join(" "));
  };

  const originalError = console.error;
  console.error = (...args: unknown[]) => {
    originalError(...args);
    ingestBotLog("error", "console", args.join(" "));
  };

  logger.info("[SecurityIntegration] ✅ Toutes les intégrations de sécurité sont actives");
  logger.info(
    `[SecurityIntegration] Image moderation: ${imageModerationEnabled}, Sentiment: ${sentimentAnalysisEnabled}, YouTube: ${youtubeCheckEnabled}, Log analysis: ${logAnalysisEnabled}`,
  );
}

/**
 * Arrête toutes les intégrations.
 */
export function stopSecurityIntegration(): void {
  stopContinuousAnalysis();
  logger.info("[SecurityIntegration] Intégrations arrêtées");
}

// ─── 9. Handler principal pour messageCreate ─────────────────────────────────

/**
 * Handler unifié à appeler dans messageCreate.
 * Déclenche automatiquement tous les modules de sécurité pertinents.
 */
export async function handleSecurityIntegration(client: Client, message: Message): Promise<void> {
  if (!integrationEnabled || !message.guild || message.author.bot) return;

  // Parallèle pour ne pas bloquer
  const promises: Promise<void>[] = [];

  // Modération d'images
  if (imageModerationEnabled && isGoogleCloudConfigured()) {
    promises.push(checkImageSafety(client, message));
  }

  // Analyse de sentiment
  if (sentimentAnalysisEnabled && isGoogleCloudConfigured()) {
    promises.push(checkMessageSentiment(client, message));
  }

  // Vérification YouTube
  if (youtubeCheckEnabled && isGoogleCloudConfigured()) {
    promises.push(checkYouTubeLink(client, message));
  }

  await Promise.allSettled(promises);
}

// ─── 10. Handler pour guildMemberAdd ─────────────────────────────────────────

/**
 * Handler unifié à appeler dans guildMemberAdd.
 */
export async function handleMemberSecurityIntegration(
  client: Client,
  member: GuildMember,
): Promise<void> {
  if (!integrationEnabled) return;
  await checkNewMember(client, member);
}
