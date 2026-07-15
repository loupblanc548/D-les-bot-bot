/**
 * aiAvatarDetector.ts — Détection de contenu généré par IA
 *
 * Utilise l'API Sightengine (gratuit, 2000 req/mois) pour détecter si
 * un média est généré par IA. Envoie un signalement dans le salon dédié.
 *
 * Déclenché sur:
 *  - guildMemberAdd (nouveau membre avec avatar)
 *  - guildMemberUpdate (changement d'avatar)
 *  - messageCreate (images, vidéos partagées dans les messages)
 */

import {
  Client,
  GuildMember,
  PartialGuildMember,
  EmbedBuilder,
  TextChannel,
  Message,
} from "discord.js";
import logger from "../utils/logger.js";
import { config } from "../config.js";

const SIGNALEMENT_CHANNEL_ID = "1520866527753011220";

// Sightengine API (free tier: 2000 requests/month)
const SIGHTENGINE_API_URL = "https://api.sightengine.com/1.0/check.json";
const SIGHTENGINE_MODELS = "gen_ai";

// Cooldown to avoid duplicate alerts for the same user
const recentAlerts = new Map<string, number>();
const ALERT_COOLDOWN_MS = 60 * 60 * 1000; // 1h per user (avatar)
const MEDIA_ALERT_COOLDOWN_MS = 30 * 60 * 1000; // 30min per user (media)

interface AIDetectionResult {
  isAIGenerated: boolean;
  confidence: number; // 0-1
  details?: Record<string, number>;
}

/**
 * Analyse un média via Sightengine pour détecter s'il est généré par IA.
 */
async function detectAIMedia(
  mediaUrl: string,
  mediaType: "image" | "video" | "audio",
): Promise<AIDetectionResult | null> {
  const apiKey = process.env.SIGHTENGINE_API_KEY;
  const apiUser = process.env.SIGHTENGINE_API_USER;

  // If no Sightengine credentials, try HuggingFace fallback
  if (!apiKey || !apiUser) {
    return await detectViaHuggingFace(mediaUrl);
  }

  try {
    // Sightengine: gen_ai for images, gen_ai-video for videos
    const models = mediaType === "video" ? "gen_ai-video" : SIGHTENGINE_MODELS;
    const apiUrl =
      mediaType === "video"
        ? "https://api.sightengine.com/1.0/video/check.json"
        : SIGHTENGINE_API_URL;

    const params = new URLSearchParams({
      url: mediaUrl,
      models,
      api_user: apiUser,
      api_secret: apiKey,
    });

    const response = await fetch(`${apiUrl}?${params}`, {
      signal: AbortSignal.timeout(10000),
    });

    if (!response.ok) {
      logger.warn(`[AIAvatarDetector] Sightengine API error: ${response.status}`);
      return null;
    }

    const data = (await response.json()) as {
      type?: { ai_generated?: number };
      frames?: Array<{ type?: { ai_generated?: number } }>;
    };

    // For videos, check frames; for images, check type directly
    let aiScore: number;
    if (mediaType === "video" && data.frames?.length) {
      // Take the max AI score across frames
      aiScore = Math.max(...data.frames.map((f) => f.type?.ai_generated ?? 0));
    } else {
      aiScore = data.type?.ai_generated ?? 0;
    }

    return {
      isAIGenerated: aiScore > 0.5,
      confidence: aiScore,
      details: { ai_generated: aiScore },
    };
  } catch (err) {
    logger.warn(
      `[AIAvatarDetector] Sightengine request failed: ${err instanceof Error ? err.message : String(err)}`,
    );
    return null;
  }
}

/**
 * Fallback: HuggingFace Inference API for AI image detection.
 */
async function detectViaHuggingFace(mediaUrl: string): Promise<AIDetectionResult | null> {
  if (!config.hfApiKey) return null;

  try {
    // Use Organika/sdxl-detector model for AI-generated image detection
    const response = await fetch(
      "https://api-inference.huggingface.co/models/Organika/sdxl-detector",
      {
        method: "POST",
        headers: {
          Authorization: `Bearer ${config.hfApiKey}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({ inputs: mediaUrl }),
        signal: AbortSignal.timeout(15000),
      },
    );

    if (!response.ok) {
      logger.debug(`[AIAvatarDetector] HF API status: ${response.status}`);
      return null;
    }

    const data = (await response.json()) as Array<{ label: string; score: number }>;
    if (!Array.isArray(data)) return null;

    const aiResult = data.find(
      (d) => d.label === "ai" || d.label === "artificial" || d.label === "fake",
    );
    const score = aiResult?.score ?? 0;

    return {
      isAIGenerated: score > 0.6,
      confidence: score,
      details: Object.fromEntries(data.map((d) => [d.label, d.score])),
    };
  } catch (err) {
    logger.debug(
      `[AIAvatarDetector] HF fallback failed: ${err instanceof Error ? err.message : String(err)}`,
    );
    return null;
  }
}

/**
 * Envoie un signalement dans le salon dédié.
 */
async function sendSignalement(
  client: Client,
  member: GuildMember,
  result: AIDetectionResult,
  isNewMember: boolean,
): Promise<void> {
  try {
    const channel = await client.channels.fetch(SIGNALEMENT_CHANNEL_ID).catch(() => null);
    if (!channel?.isTextBased()) {
      logger.warn(
        `[AIAvatarDetector] Salon de signalement introuvable (${SIGNALEMENT_CHANNEL_ID})`,
      );
      return;
    }

    const confidencePercent = Math.round(result.confidence * 100);
    const embed = new EmbedBuilder()
      .setTitle("🤖 Photo de profil potentiellement générée par IA")
      .setColor(0xff6b6b)
      .setThumbnail(member.user.displayAvatarURL({ size: 256 }))
      .setDescription(
        `**${member.user.tag}** (${member.user.id})` +
          (isNewMember ? " — *Nouveau membre*" : " — *Changement d'avatar*") +
          `\n\n📊 **Confiance: ${confidencePercent}%**` +
          `\n🖼️ Avatar: [Voir](${member.user.displayAvatarURL({ size: 512 })})`,
      )
      .addFields(
        { name: "Utilisateur", value: `<@${member.user.id}>`, inline: true },
        { name: "Serveur", value: member.guild.name, inline: true },
        {
          name: "Compte créé",
          value: `<t:${Math.floor(member.user.createdTimestamp / 1000)}:R>`,
          inline: true,
        },
      )
      .setFooter({ text: "Détection automatique • Shadow Broker Intelligence" })
      .setTimestamp();

    await (channel as TextChannel).send({
      content: `⚠️ Signalement: avatar potentiellement IA détecté pour <@${member.user.id}>`,
      embeds: [embed],
    });

    logger.info(
      `[AIAvatarDetector] Signalement envoyé pour ${member.user.tag} (confiance: ${confidencePercent}%)`,
    );
  } catch (err) {
    logger.error(
      `[AIAvatarDetector] Erreur envoi signalement: ${err instanceof Error ? err.message : String(err)}`,
    );
  }
}

/**
 * Vérifie l'avatar d'un membre et envoie un signalement si généré par IA.
 */
export async function checkAvatarForAI(
  client: Client,
  member: GuildMember | PartialGuildMember,
  isNewMember = false,
): Promise<void> {
  try {
    // Skip bots
    if (member.user?.bot) return;

    // Skip if no custom avatar
    if (!member.user?.avatar) return;

    // Cooldown check
    const now = Date.now();
    const lastAlert = recentAlerts.get(member.id) ?? 0;
    if (now - lastAlert < ALERT_COOLDOWN_MS) return;

    const avatarUrl = member.user.displayAvatarURL({ size: 512, extension: "png" });

    const result = await detectAIMedia(avatarUrl, "image");
    if (!result) {
      logger.debug(
        `[AIAvatarDetector] Pas de résultat pour ${member.user.tag} (API indisponible?)`,
      );
      return;
    }

    if (result.isAIGenerated) {
      recentAlerts.set(member.id, now);
      const fullMember =
        member instanceof GuildMember
          ? member
          : await member.guild.members.fetch(member.id).catch(() => null);
      if (fullMember) {
        await sendSignalement(client, fullMember, result, isNewMember);
      }
    } else {
      logger.debug(
        `[AIAvatarDetector] ${member.user.tag}: avatar non-IA (confiance: ${Math.round(result.confidence * 100)}%)`,
      );
    }
  } catch (err) {
    logger.error(`[AIAvatarDetector] Erreur: ${err instanceof Error ? err.message : String(err)}`);
  }
}

/**
 * Extrait les URLs de médias (images, vidéos, audio) d'un message.
 * Inclut les pièces jointes, les embeds, et les liens média dans le texte.
 */
function extractMediaUrls(
  message: Message,
): Array<{ url: string; type: "image" | "video" | "audio" }> {
  const media: Array<{ url: string; type: "image" | "video" | "audio" }> = [];
  const seen = new Set<string>();

  function addUrl(url: string, type: "image" | "video" | "audio") {
    if (seen.has(url)) return;
    seen.add(url);
    media.push({ url, type });
  }

  // 1. Pièces jointes
  for (const attachment of message.attachments.values()) {
    const ct = attachment.contentType ?? "";
    if (ct.startsWith("image/")) {
      addUrl(attachment.url, "image");
    } else if (ct.startsWith("video/")) {
      addUrl(attachment.url, "video");
    } else if (ct.startsWith("audio/")) {
      addUrl(attachment.url, "audio");
    }
  }

  // 2. Embeds
  for (const embed of message.embeds) {
    if (embed.image?.url) addUrl(embed.image.url, "image");
    if (embed.thumbnail?.url && embed.image?.url !== embed.thumbnail.url) {
      addUrl(embed.thumbnail.url, "image");
    }
    if (embed.video?.url) addUrl(embed.video.url, "video");
  }

  // 3. Liens média dans le texte du message (images/vidéos directes)
  const urlRegex =
    /https?:\/\/[^\s<>"']+\.(png|jpe?g|gif|webp|bmp|svg|mp4|webm|mov|avi|mkv)(\?[^\s]*)?/gi;
  const textUrls = message.content.match(urlRegex) || [];
  for (const url of textUrls) {
    const ext = url
      .match(/\.(png|jpe?g|gif|webp|bmp|svg|mp4|webm|mov|avi|mkv)/i)?.[1]
      ?.toLowerCase();
    if (!ext) continue;
    const isVideo = ["mp4", "webm", "mov", "avi", "mkv"].includes(ext);
    addUrl(url, isVideo ? "video" : "image");
  }

  return media;
}

/**
 * Extrait tous les liens (non-média) d'un message pour analyse de sécurité.
 */
export function extractLinksFromMessage(content: string): string[] {
  const urlRegex = /https?:\/\/[^\s<>"']+/gi;
  const mediaExts = /\.(png|jpe?g|gif|webp|bmp|svg|mp4|webm|mov|avi|mkv)(\?|$)/i;
  const urls = content.match(urlRegex) || [];
  return urls.filter((u) => !mediaExts.test(u));
}

/**
 * Envoie un signalement pour un lien dangereux détecté.
 */
async function sendLinkSecurityAlert(
  client: Client,
  message: Message,
  url: string,
  scanResult: {
    overallMalicious: boolean;
    overallConfidence: number;
    results: Array<{ source: string; malicious: boolean; confidence: number; details: string }>;
  },
): Promise<void> {
  try {
    const channel = await client.channels.fetch(SIGNALEMENT_CHANNEL_ID).catch(() => null);
    if (!channel?.isTextBased()) return;

    const embed = new EmbedBuilder()
      .setTitle("🚨 Lien potentiellement dangereux détecté")
      .setColor(0xff0000)
      .setThumbnail(message.author.displayAvatarURL({ size: 128 }))
      .setDescription(
        `**${message.author.tag}** (${message.author.id})\n` +
          `📍 Salon: <#${message.channelId}>\n` +
          `🔗 **URL:** ${url.slice(0, 200)}\n` +
          `📊 **Confiance: ${scanResult.overallConfidence}%**`,
      )
      .addFields(
        { name: "Utilisateur", value: `<@${message.author.id}>`, inline: true },
        { name: "Message", value: `[Aller au message](${message.url})`, inline: true },
        {
          name: "Sources",
          value:
            scanResult.results
              .map(
                (r) =>
                  `**${r.source}**: ${r.malicious ? "⚠️" : "✅"} (${r.confidence}%) — ${r.details.slice(0, 100)}`,
              )
              .join("\n")
              .slice(0, 1024) || "Aucune",
          inline: false,
        },
      )
      .setFooter({ text: "Sécurité automatique • Threat Intelligence" })
      .setTimestamp();

    await (channel as TextChannel).send({
      content: `🚨 Lien dangereux détecté par <@${message.author.id}>`,
      embeds: [embed],
    });

    logger.info(
      `[AIAvatarDetector] Signalement lien dangereux envoyé pour ${message.author.tag} (confiance: ${scanResult.overallConfidence}%)`,
    );
  } catch (err) {
    logger.error(
      `[AIAvatarDetector] Erreur envoi signalement lien: ${err instanceof Error ? err.message : String(err)}`,
    );
  }
}

/**
 * Scanne les liens d'un message pour la sécurité (VirusTotal, Safe Browsing, PhishTank).
 */
export async function checkMessageLinksForSecurity(
  client: Client,
  message: Message,
): Promise<void> {
  try {
    if (message.author.bot) return;
    if (!message.guild) return;

    const links = extractLinksFromMessage(message.content);
    if (links.length === 0) return;

    // Cooldown per user for link security alerts
    const now = Date.now();
    const cooldownKey = `link_sec_${message.author.id}`;
    const lastAlert = recentAlerts.get(cooldownKey) ?? 0;
    if (now - lastAlert < MEDIA_ALERT_COOLDOWN_MS) return;

    const { scanURL } = await import("./threatIntel.js");

    for (const url of links) {
      try {
        const result = await scanURL(url);
        if (result.overallMalicious) {
          recentAlerts.set(cooldownKey, now);
          await sendLinkSecurityAlert(client, message, url, result);
          break;
        }
      } catch {
        // Non-critique — skip cette URL
      }
    }
  } catch (err) {
    logger.error(
      `[AIAvatarDetector] Erreur scan liens sécurité: ${err instanceof Error ? err.message : String(err)}`,
    );
  }
}

/**
 * Envoie un signalement pour un média IA détecté dans un message.
 */
async function sendMediaSignalement(
  client: Client,
  message: Message,
  mediaType: "image" | "video" | "audio",
  mediaUrl: string,
  result: AIDetectionResult,
): Promise<void> {
  try {
    const channel = await client.channels.fetch(SIGNALEMENT_CHANNEL_ID).catch(() => null);
    if (!channel?.isTextBased()) return;

    const confidencePercent = Math.round(result.confidence * 100);
    const typeLabel =
      mediaType === "image" ? "🖼️ Image" : mediaType === "video" ? "🎬 Vidéo" : "🎵 Audio";
    const member = message.member;
    const avatarUrl = message.author.displayAvatarURL({ size: 128 });

    const embed = new EmbedBuilder()
      .setTitle(`🤖 ${typeLabel} potentiellement générée par IA`)
      .setColor(0xff6b6b)
      .setThumbnail(avatarUrl)
      .setDescription(
        `**${message.author.tag}** (${message.author.id})\n` +
          `📍 Salon: <#${message.channelId}>\n` +
          `📊 **Confiance: ${confidencePercent}%**\n` +
          `🔗 [Voir le média](${mediaUrl})`,
      )
      .addFields(
        { name: "Utilisateur", value: `<@${message.author.id}>`, inline: true },
        { name: "Type", value: mediaType, inline: true },
        {
          name: "Message",
          value: `[Aller au message](${message.url})`,
          inline: true,
        },
      )
      .setFooter({ text: "Détection automatique • Shadow Broker Intelligence" })
      .setTimestamp();

    await (channel as TextChannel).send({
      content: `⚠️ Signalement: ${mediaType} IA détecté pour <@${message.author.id}>`,
      embeds: [embed],
    });

    logger.info(
      `[AIAvatarDetector] Signalement média envoyé pour ${message.author.tag} (${mediaType}, confiance: ${confidencePercent}%)`,
    );
  } catch (err) {
    logger.error(
      `[AIAvatarDetector] Erreur envoi signalement média: ${err instanceof Error ? err.message : String(err)}`,
    );
  }
}

/**
 * Scanne les médias (images, vidéos, audio) d'un message pour détecter l'IA.
 */
export async function checkMessageMediaForAI(client: Client, message: Message): Promise<void> {
  try {
    if (message.author.bot) return;
    if (!message.guild) return;

    const mediaUrls = extractMediaUrls(message);
    if (mediaUrls.length === 0) return;

    // Cooldown per user for media alerts
    const now = Date.now();
    const cooldownKey = `media_${message.author.id}`;
    const lastAlert = recentAlerts.get(cooldownKey) ?? 0;
    if (now - lastAlert < MEDIA_ALERT_COOLDOWN_MS) return;

    for (const media of mediaUrls) {
      // Audio: Sightengine doesn't support audio AI detection, skip
      if (media.type === "audio") continue;

      const result = await detectAIMedia(media.url, media.type);
      if (!result) continue;

      if (result.isAIGenerated) {
        recentAlerts.set(cooldownKey, now);
        await sendMediaSignalement(client, message, media.type, media.url, result);
        break; // One alert per message is enough
      }
    }
  } catch (err) {
    logger.error(
      `[AIAvatarDetector] Erreur scan média: ${err instanceof Error ? err.message : String(err)}`,
    );
  }
}
