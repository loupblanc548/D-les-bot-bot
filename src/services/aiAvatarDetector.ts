/**
 * aiAvatarDetector.ts — Détection de photos de profil générées par IA
 *
 * Utilise l'API Sightengine (gratuit, 2000 req/mois) pour détecter si
 * un avatar est généré par IA. Envoie un signalement dans le salon dédié.
 *
 * Déclenché sur:
 *  - guildMemberAdd (nouveau membre avec avatar)
 *  - guildMemberUpdate (changement d'avatar)
 */

import { Client, GuildMember, PartialGuildMember, EmbedBuilder, TextChannel } from "discord.js";
import logger from "../utils/logger.js";
import { config } from "../config.js";

const SIGNALEMENT_CHANNEL_ID = "1520866527753011220";

// Sightengine API (free tier: 2000 requests/month)
const SIGHTENGINE_API_URL = "https://api.sightengine.com/1.0/check.json";
const SIGHTENGINE_MODELS = "gen_ai";

// Cooldown to avoid duplicate alerts for the same user
const recentAlerts = new Map<string, number>();
const ALERT_COOLDOWN_MS = 60 * 60 * 1000; // 1h per user

interface AIDetectionResult {
  isAIGenerated: boolean;
  confidence: number; // 0-1
  details?: Record<string, number>;
}

/**
 * Analyse une image via Sightengine pour détecter si elle est générée par IA.
 */
async function detectAIAvatar(imageUrl: string): Promise<AIDetectionResult | null> {
  const apiKey = process.env.SIGHTENGINE_API_KEY;
  const apiUser = process.env.SIGHTENGINE_API_USER;

  // If no Sightengine credentials, try HuggingFace fallback
  if (!apiKey || !apiUser) {
    return await detectViaHuggingFace(imageUrl);
  }

  try {
    const params = new URLSearchParams({
      url: imageUrl,
      models: SIGHTENGINE_MODELS,
      api_user: apiUser,
      api_secret: apiKey,
    });

    const response = await fetch(`${SIGHTENGINE_API_URL}?${params}`, {
      signal: AbortSignal.timeout(10000),
    });

    if (!response.ok) {
      logger.warn(`[AIAvatarDetector] Sightengine API error: ${response.status}`);
      return null;
    }

    const data = (await response.json()) as {
      type?: { ai_generated?: number };
    };

    const aiScore = data.type?.ai_generated ?? 0;
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
async function detectViaHuggingFace(imageUrl: string): Promise<AIDetectionResult | null> {
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
        body: JSON.stringify({ inputs: imageUrl }),
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

    const result = await detectAIAvatar(avatarUrl);
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
