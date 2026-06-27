import logger from "../utils/logger.js";
import {
  Client,
  Message,
  PartialMessage,
  OmitPartialGroupDMChannel,
  GuildMember,
  TextChannel,
  EmbedBuilder,
} from "discord.js";
import { createLog } from "../services/logs.js";
import { recordSecurityEvent } from "../services/risk-engine.js";
import { isAntiPhishingActive, checkSuspiciousLinksDetailed } from "../commands/security.js";
import { isAiChatEnabled, chatWithHistory } from "../services/aichat.js";
import { analyzeToxicity } from "../services/ai-moderation.js";
import prisma from "../prisma.js";
import { withCache } from "../utils/redis-enhance.js";
import { translateAutoToFrench } from "../utils/translator.js";
import { addMessageToConversation } from "../services/aiMemory.js";
import {
  touchConversation,
  checkExpiredConversations,
  buildConversationContext,
} from "../services/aiConversation.js";
import { checkRateLimit } from "../services/rateLimiter.js";
import {
  checkMessage as checkWordFilter,
  enforceFilter as enforceWordFilter,
} from "../services/wordFilter.js";
import { enforceServerRules } from "../services/serverRules.js";

// ─── Constantes ──────────────────────────────────────────────────────────────

const aichatCooldown = new Map<string, number>();
const AICHAT_COOLDOWN_MS = 5_000;

const SPAM_THRESHOLD = 5;
const SPAM_WINDOW_MS = 3_000;
const SPAM_MUTE_MS = 5 * 60 * 1000;

// ─── Relances humoristiques quand @mention sans message ──────────────────────

const HELPDIVER_EMPTY_MENTION_REPLIES = [
  "🫡 **John Helldiver** à l'écoute, soldat ! Ta mission ? Pose ta question, je suis prêt à déployer la puissance de la Super-Terre pour toi !",
  "🎖️ Soldat ! Tu m'as appelé ? La démocratie a besoin de savoir ce que tu veux — balance ta question !",
  "🦅 **Présent pour la Super-Terre !** Dis-moi tout, camarade. Traduction, info gaming, soutien tactique… je gère !",
  "💪 **John Helldiver en renfort !** Pas de question = pas de victoire, soldat. Qu'est-ce que je peux faire pour toi ?",
];

function getRandomHelldiverReply(): string {
  return HELPDIVER_EMPTY_MENTION_REPLIES[
    Math.floor(Math.random() * HELPDIVER_EMPTY_MENTION_REPLIES.length)
  ];
}

// ─── Cleanup périodique ─────────────────────────────────────────────────────

let mapCleanupInterval: NodeJS.Timeout | null = null;
let conversationCleanupInterval: NodeJS.Timeout | null = null;

export function startMapCleanup() {
  if (mapCleanupInterval) return;
  mapCleanupInterval = setInterval(() => {
    const now = Date.now();
    for (const [userId, timestamp] of aichatCooldown) {
      if (now - timestamp > 3600000) {
        aichatCooldown.delete(userId);
      }
    }
  }, 300000);

  // Vérifier les conversations IA expirées toutes les 2 minutes
  if (!conversationCleanupInterval) {
    conversationCleanupInterval = setInterval(() => {
      checkExpiredConversations().catch((err) =>
        logger.error("[MessageEvents] Erreur cleanup conversations:", err),
      );
    }, 120000);
  }
}

export function stopMapCleanup() {
  if (mapCleanupInterval) {
    clearInterval(mapCleanupInterval);
    mapCleanupInterval = null;
  }
  if (conversationCleanupInterval) {
    clearInterval(conversationCleanupInterval);
    conversationCleanupInterval = null;
  }
}

// ─── Types ───────────────────────────────────────────────────────────────────

type MessageType = OmitPartialGroupDMChannel<Message<boolean> | PartialMessage>;

// =============================================================================
// HANDLER PRINCIPAL
// =============================================================================

export function handleMessageEvents(client: Client) {
  // ── messageUpdate: Pin/Unpin logging ──────────────────────────────────
  client.on("messageUpdate", async (oldMessage: MessageType, newMessage: MessageType) => {
    try {
      if (!("pinned" in oldMessage) || !("pinned" in newMessage)) return;
      if (!("author" in newMessage)) return;

      const author = newMessage.author;
      if (!author) return;

      if (!oldMessage.pinned && newMessage.pinned) {
        await createLog({
          type: "message_pin",
          action: `Message de ${author.tag} epingle`,
          userId: author.id,
          targetId: newMessage.id,
        });
      } else if (oldMessage.pinned && !newMessage.pinned) {
        await createLog({
          type: "message_unpin",
          action: `Message de ${author.tag} desepingle`,
          userId: author.id,
          targetId: newMessage.id,
        });
      }
    } catch (error) {
      logger.error("[MessageEvents] Erreur messageUpdate:", error);
    }
  });

  // ── Anti-spam tracker ─────────────────────────────────────────────────
  const spamTracker = new Map<string, { count: number; firstSeen: number; warned: boolean }>();

  // ===========================================================================
  // messageCreate — INTERCEPTEUR INTELLIGENT
  // ===========================================================================

  client.on("messageCreate", async (message) => {
    try {
      if (!message.guild || message.author.bot) return;

      // ── FILTRE DE MOTS INTERDITS (avant tout le reste) ─────────────
      const matchedWord = await checkWordFilter(message);
      if (matchedWord) {
        await enforceWordFilter(message, matchedWord);
        return;
      }

      // ── RÈGLEMENT DU SERVEUR (publicité, mentions, etc.) ───────────
      const ruleViolated = await enforceServerRules(message);
      if (ruleViolated) return;

      const isMentioningBot = message.mentions.has(client.user!);

      // ═══════════════════════════════════════════════════════════════════
      // PROTECTION MUTUELLE : Un message NE PEUT PAS déclencher
      // le chat IA ET la traduction automatique simultanément.
      // ═══════════════════════════════════════════════════════════════════

      // ── BRANCHEMENT 1 : MODE CHAT IA (@mention du bot) ────────────────
      if (isMentioningBot) {
        await handleAiChatMention(message, client);
        return; // ← PROTECTION MUTUELLE : on sort immédiatement
      }

      // ── BRANCHEMENT 2 : MODE TRADUCTION AUTOMATIQUE (pas de @mention) ─
      await handleAutoTranslation(message);

      // ── Les modules suivants (AIChat contextuel, AI Mod, Anti-Phishing,
      //     Anti-Spam) continuent normalement APRÈS les deux branches ────

      await handleContextualAiChat(message, client);
      await handleSecurityModules(message, spamTracker);
    } catch (error) {
      logger.error("[MessageEvents] Erreur messageCreate:", error);
    }
  });
}

// =============================================================================
// BRANCHEMENT 1 : CHAT IA PAR @MENTION
// =============================================================================

async function handleAiChatMention(
  message: OmitPartialGroupDMChannel<Message<boolean>>,
  client: Client,
): Promise<void> {
  try {
    // Nettoyer le message : retirer la mention du bot
    const cleanedContent = message.content
      .replace(new RegExp(`<@!?${client.user!.id}>`, "g"), "")
      .trim();

    // Si le message est vide après nettoyage → relance humoristique John Helldiver
    if (!cleanedContent) {
      await message.reply({
        content: getRandomHelldiverReply(),
        allowedMentions: { repliedUser: false },
      });
      return;
    }

    // Déclencher l'indicateur de frappe
    await message.channel.sendTyping();

    // ── Vérifier les conversations expirées avant de continuer ──
    await checkExpiredConversations();

    // ── Vérifier le rate limiting ──
    const rateLimitCheck = checkRateLimit(
      message.author.id,
      "ai_chat",
      message.guildId || undefined,
    );
    if (!rateLimitCheck.allowed) {
      const _resetTime = new Date(rateLimitCheck.resetTime).toLocaleTimeString("fr-FR");
      await message.reply({
        allowedMentions: { repliedUser: false },
      });
      return;
    }

    const apiKey = process.env.OPENROUTER_API_KEY;
    if (!apiKey) {
      await message.reply({
        content:
          "\u26a0\ufe0f Circuits non configur\u00e9s ! Configure OPENROUTER_API_KEY. \u{1f985}",
        allowedMentions: { repliedUser: false },
      });
      return;
    }

    // ── Construire le contexte : faits long-terme + historique conversation ──
    const messages = await buildConversationContext(
      message.author.id,
      cleanedContent,
      message.author.username,
    );

    // ── Marquer la conversation comme active ──
    touchConversation(message.author.id);

    // ── Ajouter le message utilisateur à la mémoire de conversation ──
    await addMessageToConversation(
      message.author.id,
      "user",
      cleanedContent,
      message.guildId || undefined,
    );

    const response = await fetch("https://openrouter.ai/api/v1/chat/completions", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${apiKey}`,
        "Content-Type": "application/json",
        "HTTP-Referer": "https://discord-bot.com",
        "X-Title": "John Helldiver - Discord Bot",
      },
      body: JSON.stringify({
        model: process.env.OPENROUTER_MODEL || "nvidia/nemotron-3-ultra-550b-a55b:free",
        messages,
        max_tokens: 500,
        temperature: 0.7,
      }),
      signal: AbortSignal.timeout(15000),
    });

    if (!response.ok) throw new Error(`OpenRouter HTTP error: ${response.status}`);
    const data = (await response.json()) as { choices: Array<{ message: { content: string } }> };

    if (data.choices?.[0]?.message?.content) {
      let aiResponse = data.choices[0].message.content.trim();
      if (aiResponse.length > 2000) aiResponse = aiResponse.slice(0, 1997) + "...";
      await message.reply({ content: aiResponse, allowedMentions: { repliedUser: false } });

      // ── Sauvegarder la réponse dans la conversation ──
      await addMessageToConversation(
        message.author.id,
        "assistant",
        aiResponse,
        message.guildId || undefined,
      );

      // ── Maintenir la conversation active ──
      touchConversation(message.author.id);

      logger.info(`[AIChat] IA -> ${message.author.tag}`);
    } else {
      throw new Error("OpenRouter response invalid");
    }
  } catch (error) {
    logger.error(`[AIChat] Erreur: ${error instanceof Error ? error.message : String(error)}`);
    await message.reply({
      content: "\u{1f985} *Static* - Communications brouill\u00e9es ! R\u00e9essaie.",
      allowedMentions: { repliedUser: false },
    });
  }
}

async function handleAutoTranslation(
  message: OmitPartialGroupDMChannel<Message<boolean>>,
): Promise<void> {
  try {
    const content = message.content.trim();
    const wordCount = content.split(/\s+/).filter((w) => w.length > 0).length;
    const hasOnlyEmojis = /^[\p{Emoji}\s]+$/u.test(content);
    const hasOnlyMentions = /^<@!?[\d]+>(\s*<@!?[\d]+>)*$/u.test(content);
    const hasOnlyUrls = /^https?:\/\/[^\s]+$/u.test(content);

    if (content.length < 15 || wordCount < 3 || hasOnlyEmojis || hasOnlyMentions || hasOnlyUrls)
      return;

    const translationResult = await translateAutoToFrench(content);

    if (
      translationResult &&
      translationResult.detectedLanguage !== "fr" &&
      translationResult.translatedText !== content
    ) {
      const translationEmbed = new EmbedBuilder()
        .setColor(0x3498db)
        .setAuthor({
          name: `Traduction automatique (${translationResult.detectedLanguage})`,
          iconURL: message.author.displayAvatarURL(),
        })
        .setDescription(`> ${translationResult.translatedText.slice(0, 1900)}`)
        .setFooter({ text: `Message original de ${message.author.username}` })
        .setTimestamp();
      await message.reply({ embeds: [translationEmbed], allowedMentions: { repliedUser: false } });
      logger.debug(`[AutoTranslate] ${message.author.tag}: ${translationResult.detectedLanguage}`);
    }
  } catch (error) {
    logger.debug(
      `[AutoTranslate] Erreur: ${error instanceof Error ? error.message : String(error)}`,
    );
  }
}

async function handleContextualAiChat(
  message: OmitPartialGroupDMChannel<Message<boolean>>,
  client: Client,
): Promise<void> {
  try {
    if (!isAiChatEnabled(message.channel.id)) return;
    if (!message.mentions.has(client.user!)) return;

    let cleanedContent = message.content.replace(new RegExp(`<@!?${client.user!.id}>`, "g"), "");
    message.mentions.users.forEach((user) => {
      if (user.id !== client.user!.id) {
        cleanedContent = cleanedContent.replace(
          new RegExp(`<@!?${user.id}>`, "g"),
          `@${user.username}`,
        );
      }
    });

    cleanedContent = cleanedContent.trim();
    if (!cleanedContent) return;

    const lastUsed = aichatCooldown.get(message.author.id) || 0;
    if (Date.now() - lastUsed < AICHAT_COOLDOWN_MS) {
      await message.react("\u23f3").catch(() => {});
      return;
    }
    aichatCooldown.set(message.author.id, Date.now());

    await message.channel.sendTyping();
    const reply = await chatWithHistory(
      message.channelId,
      cleanedContent,
      message.author.username,
      message.guildId || undefined,
    );
    await message.reply({ content: reply.slice(0, 2000), allowedMentions: { repliedUser: false } });
  } catch (err) {
    logger.error("[AIChat] Erreur contextuelle:", err);
  }
}

async function handleSecurityModules(
  message: OmitPartialGroupDMChannel<Message<boolean>>,
  spamTracker: Map<string, { count: number; firstSeen: number; warned: boolean }>,
): Promise<void> {
  if (!("member" in message) || !message.member) return;
  const member = message.member as GuildMember;
  if (member.permissions.has("Administrator") || member.permissions.has("ModerateMembers")) return;

  if (message.content.length > 10 && message.content.length < 1500) {
    if (!message.guild) return;
    withCache(`guild:${message.guild.id}:config`, 30, () =>
      prisma.guildConfig.findUnique({ where: { guildId: message.guild!.id } }),
    )
      .then((gc) => {
        if (!gc?.aiModerationEnabled) return;
        analyzeToxicity(message.content)
          .then(async (result) => {
            if (result.isToxic && result.confidence > 0.8) {
              try {
                await message.delete();
                const alert = await message.channel.send({
                  content: `\u26a0\ufe0f ${message.author} message supprim\u00e9 par IA: **${result.category}** (${Math.round(result.confidence * 100)}%)`,
                });
                setTimeout(() => alert.delete().catch(() => {}), 8000);
                await recordSecurityEvent(
                  message.author.id,
                  message.guild!.id,
                  "AI_MODERATION",
                ).catch(() => {});
                logger.info(`\u{1f916} [AI-Mod] ${message.author.tag}: ${result.category}`);
              } catch (err) {
                logger.error("[AI-Mod] Erreur:", err);
              }
            }
          })
          .catch(() => {});
      })
      .catch(() => {});
  }

  if (await isAntiPhishingActive(message.guild!.id)) {
    const suspicious = checkSuspiciousLinksDetailed(message.content);
    if (suspicious.length > 0) {
      logger.info(
        `\u{1f6e1}\ufe0f [Anti-Phishing] ${suspicious.length} lien(s) suspect(s) de ${message.author.tag}`,
      );
      try {
        await message.delete();
        const alert = await message.channel.send({
          content: `\u26a0\ufe0f ${message.author} message supprim\u00e9 (lien suspect).`,
        });
        setTimeout(() => alert.delete().catch(() => {}), 10000);
        await recordSecurityEvent(message.author.id, message.guild!.id, "ANTI_PHISHING").catch(
          () => {},
        );
        await createLog({
          type: "antiphishing",
          action: `Lien suspect: ${suspicious[0]} de ${message.author.tag}`,
          userId: message.author.id,
          details: message.content.slice(0, 500),
        });
        return;
      } catch (err) {
        logger.error("[Anti-Phishing] Erreur:", err);
      }
    }
  }

  const now = Date.now();
  const key = `${message.guild!.id}_${message.author.id}`;
  const entry = spamTracker.get(key);
  if (!entry || now - entry.firstSeen > SPAM_WINDOW_MS) {
    spamTracker.set(key, { count: 1, firstSeen: now, warned: false });
  } else {
    entry.count++;
    if (entry.count >= SPAM_THRESHOLD && !entry.warned) {
      entry.warned = true;
      try {
        logger.info(`\u{1f6ab} [Anti-Spam] ${entry.count} msg de ${message.author.tag}`);
        await member.timeout(SPAM_MUTE_MS, "Anti-spam");
        const recentMessages = await message.channel.messages.fetch({ limit: 20 });
        const spamMessages = recentMessages.filter((m) => m.author.id === message.author.id);
        if (spamMessages.size > 0) {
          try {
            await (message.channel as TextChannel).bulkDelete(spamMessages, true);
          } catch (_) {}
        }
        await recordSecurityEvent(message.author.id, message.guild!.id, "ANTI_SPAM").catch(
          () => {},
        );
      } catch (err) {
        logger.error("[Anti-Spam] Erreur:", err);
      }
    }
  }
  if (Math.random() < 0.01) {
    for (const [k, v] of spamTracker) {
      if (now - v.firstSeen > SPAM_WINDOW_MS * 2) spamTracker.delete(k);
    }
  }
}
