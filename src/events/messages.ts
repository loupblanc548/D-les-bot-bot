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
import { config } from "../config.js";
import { createLog } from "../services/logs.js";
import { recordSecurityEvent } from "../services/risk-engine.js";
import { isAntiPhishingActive, checkSuspiciousLinksDetailed } from "../commands/security.js";
import { chatWithHistory } from "../services/aichat.js";
import { analyzeToxicity } from "../services/ai-moderation.js";
import { sendSecurityAlert, checkMessageSpam } from "../services/reportChannel.js";
import prisma from "../prisma.js";
import { withCache } from "../utils/redis-enhance.js";
import { translateAutoToFrench } from "../utils/translator.js";
import { simulateHumanTyping } from "../utils/humanTyping.js";
import { sendMultiMessage } from "../utils/humanBehavior.js";
import { addMessageToConversation } from "../services/aiMemory.js";
import { handleAgentMessageScan } from "../services/agentBrain.js";
import { handlePersonalityMessage } from "../services/personalityEngine.js";
import { runAgentLoop, extractAndSaveMemory } from "../services/agentLoop.js";
import { checkMessageMediaForAI } from "../services/aiAvatarDetector.js";
import {
  touchConversation,
  checkExpiredConversations,
  buildConversationContext,
} from "../services/aiConversation.js";
import {
  checkMessage as checkWordFilter,
  enforceFilter as enforceWordFilter,
} from "../services/wordFilter.js";
import { enforceServerRules } from "../services/serverRules.js";
import { processAutoReact } from "../services/autoReact.js";
import { addXp } from "../services/xpService.js";
import { handleSecurityIntegration } from "../services/securityIntegration.js";
import { shouldBlock as checkAbuseFilter } from "../services/abuseFilter.js";
import { recordMessage as recordSpamMessage, analyzeSpam } from "../services/spamDetector.js";
import {
  analyzeToxicity as analyzePerspectiveToxicity,
  isPerspectiveConfigured,
} from "../services/perspectiveApi.js";

// ─── Constantes ──────────────────────────────────────────────────────────────

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

let conversationCleanupInterval: NodeJS.Timeout | null = null;

export function startMapCleanup() {
  // Vérifier les conversations IA expirées toutes les 2 minutes
  if (!conversationCleanupInterval) {
    conversationCleanupInterval = setInterval(() => {
      checkExpiredConversations().catch((err) =>
        logger.error("[MessageEvents] Erreur cleanup conversations:", err),
      );
    }, 120000);
    if (conversationCleanupInterval.unref) conversationCleanupInterval.unref();
  }
}

export function stopMapCleanup() {
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
      if (message.author.bot) return;

      // ── DM (Message Privé) → l'agent IA répond directement ──
      if (!message.guild) {
        await handleDMMessage(message, client);
        return;
      }

      // ── Détection spam proactive ──────────────────────────────────
      void checkMessageSpam(
        client,
        message.author.id,
        message.guild.id,
        message.channel.id,
        message.content,
      );

      // ── Enregistrement pour le spam detector ML ───────────────────
      recordSpamMessage(message.author.id, message.content, message.channel.id);

      // ── Abuse Filter : patterns malveillants (scam, IP logger, raid...) ──
      if (!("member" in message) || !message.member) return;
      const abuseMember = message.member as GuildMember;
      if (
        !abuseMember.permissions.has("Administrator") &&
        !abuseMember.permissions.has("ModerateMembers")
      ) {
        const abuseResult = checkAbuseFilter(message.content);
        if (abuseResult.block) {
          try {
            await message.delete();
            const abuseAlert = await message.channel.send({
              content: `⚠️ ${message.author} message supprimé: **${abuseResult.reason}**`,
            });
            setTimeout(() => abuseAlert.delete().catch(() => {}), 8000);

            if (abuseResult.action === "ban" && message.guild) {
              await message.guild.members
                .ban(message.author, { reason: `AbuseFilter: ${abuseResult.reason}` })
                .catch(() => {});
            } else if (abuseResult.action === "timeout" && abuseMember.moderatable) {
              await abuseMember
                .timeout(5 * 60 * 1000, `AbuseFilter: ${abuseResult.reason}`)
                .catch(() => {});
            }

            await recordSecurityEvent(message.author.id, message.guild.id, "ANTI_SPAM").catch(
              () => {},
            );
            await createLog({
              type: "automod",
              action: `AbuseFilter (${abuseResult.action}) par ${message.author.tag}: ${abuseResult.reason}`,
              userId: message.author.id,
              details: message.content.slice(0, 200),
            });
            logger.info(
              `[AbuseFilter] ${message.author.tag}: ${abuseResult.reason} → ${abuseResult.action}`,
            );
            await sendSecurityAlert(client, {
              type: "ABUSE_FILTER",
              userId: message.author.id,
              userTag: message.author.tag,
              guildId: message.guild.id,
              reason: `AbuseFilter: ${abuseResult.reason}`,
              details: abuseResult.action,
              messageContent: message.content.slice(0, 500),
              messageUrl: message.url,
            }).catch(() => {});
            return;
          } catch (err) {
            logger.error("[AbuseFilter] Erreur:", err);
          }
        }

        // ── Spam Detector ML : analyse heuristique ──────────────────
        const spamResult = analyzeSpam(message.author.id, message.channel.id);
        if (spamResult.isSpam) {
          try {
            await message.delete();
            if (abuseMember.moderatable) {
              await abuseMember.timeout(10 * 60 * 1000, `SpamDetector: score ${spamResult.score}`);
            }
            const spamAlert = await message.channel.send({
              content: `🚫 ${message.author} timeout automatique (spam détecté: score ${spamResult.score})`,
            });
            setTimeout(() => spamAlert.delete().catch(() => {}), 10000);
            await recordSecurityEvent(message.author.id, message.guild.id, "ANTI_SPAM").catch(
              () => {},
            );
            await createLog({
              type: "automod",
              action: `SpamDetector par ${message.author.tag}: score ${spamResult.score} (${spamResult.reasons.join(", ")})`,
              userId: message.author.id,
              details: message.content.slice(0, 200),
            });
            logger.info(
              `[SpamDetector] ${message.author.tag}: score ${spamResult.score} — ${spamResult.reasons.join(", ")}`,
            );
            await sendSecurityAlert(client, {
              type: "SPAM_DETECTOR",
              userId: message.author.id,
              userTag: message.author.tag,
              guildId: message.guild.id,
              reason: `Spam ML: score ${spamResult.score}`,
              details: spamResult.reasons.join(", "),
              messageContent: message.content.slice(0, 500),
              messageUrl: message.url,
            }).catch(() => {});
            return;
          } catch (err) {
            logger.error("[SpamDetector] Erreur:", err);
          }
        }
      }

      // ── Salon de rapports manuels : ping auto ──────────────────────
      if (message.channel.id === "1515767173740757112" && !message.author.bot) {
        const REPORT_ROLE_ID = "1402362014264983762";
        try {
          await message.reply({
            content: `<@&${REPORT_ROLE_ID}> 📢 Nouveau rapport manuel de <@${message.author.id}>`,
            allowedMentions: { roles: [REPORT_ROLE_ID] },
          });
        } catch {
          // Fallback: send in channel directly
          try {
            await (message.channel as TextChannel).send({
              content: `<@&${REPORT_ROLE_ID}> 📢 Nouveau rapport manuel de <@${message.author.id}>`,
              allowedMentions: { roles: [REPORT_ROLE_ID] },
            });
          } catch {}
        }
      }

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
      await handleSecurityModules(message, spamTracker, client);

      // ── Security Integration: threatIntel, Google Vision, YouTube check, sentiment ──
      handleSecurityIntegration(client, message).catch(() => {});

      // ── Détection de médias générés par IA (images, vidéos) ──
      void checkMessageMediaForAI(client, message).catch(() => {});

      // ── Auto-react (après sécurité, non bloquant) ──
      await processAutoReact(message);

      // ── XP gain (après tous les modules, non bloquant) ──
      const xpResult = await addXp(message.author.id, message.guildId!);
      if (xpResult.leveledUp) {
        try {
          const channel = message.channel as TextChannel;
          await channel.send({
            content: `🎉 ${message.author.toString()} a atteint le **niveau ${xpResult.newLevel}** !`,
          });
        } catch {
          // ignore send errors
        }
      }
    } catch (error) {
      logger.error("[MessageEvents] Erreur messageCreate:", error);
    }

    // ── Agent IA autonome — scan de messages proactif ───────────────
    try {
      await handleAgentMessageScan(client, message);
    } catch (agentErr) {
      logger.warn(
        `[MessageEvents] AgentBrain: ${agentErr instanceof Error ? agentErr.message : String(agentErr)}`,
      );
    }

    // ── Moteur de personnalité — réponses autonomes de John Helldiver ──
    try {
      await handlePersonalityMessage(client, message);
    } catch (personalityErr) {
      logger.debug(
        `[MessageEvents] Personality: ${personalityErr instanceof Error ? personalityErr.message : String(personalityErr)}`,
      );
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

    // ── TOUS les messages vont à l'IA, peu importe le contenu ou la langue ──
    // Plus de courts-circuits (reactions, ultra-short replies, natural actions)
    // L'IA gère toutes les langues et tous les types de messages.

    // Déclencher l'indicateur de frappe réaliste
    await simulateHumanTyping(message.channel as TextChannel, cleanedContent.length);

    // ── Vérifier les conversations expirées avant de continuer ──
    await checkExpiredConversations();

    // ── Rate limiting DÉSACTIVÉ — bot débridé ──

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

    // ── AGENT LOOP : Think → Act → Observe → Respond ──
    // L'IA reçoit les tools, réfléchit, exécute des actions si nécessaire,
    // puis synthétise sa réponse finale.
    let aiResponse: string;
    try {
      aiResponse = await runAgentLoop(message as Message, cleanedContent);
    } catch (loopError) {
      // Fallback : si l'agent loop échoue (ex: modèle sans function calling),
      // on retombe sur le simple fetch OpenRouter
      logger.warn(
        `[AIChat] AgentLoop échoué, fallback simple: ${loopError instanceof Error ? loopError.message : String(loopError)}`,
      );
      const fallbackResponse = await fetch("https://openrouter.ai/api/v1/chat/completions", {
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
      if (!fallbackResponse.ok)
        throw new Error(`OpenRouter HTTP error: ${fallbackResponse.status}`, { cause: loopError });
      const fallbackData = (await fallbackResponse.json()) as {
        choices: Array<{ message: { content: string } }>;
      };
      aiResponse = fallbackData.choices?.[0]?.message?.content || "*(silence)*";
    }

    if (aiResponse) {
      if (aiResponse.length > 2000) aiResponse = aiResponse.slice(0, 1997) + "...";

      // ── Envoyer en plusieurs messages si la réponse est longue ──
      await sendMultiMessage(message.channel as TextChannel, aiResponse, message as Message);

      // ── Sauvegarder la réponse dans la conversation ──
      await addMessageToConversation(
        message.author.id,
        "assistant",
        aiResponse,
        message.guildId || undefined,
      );

      // ── Maintenir la conversation active ──
      touchConversation(message.author.id);

      // ── Extraire et sauvegarder les faits importants en mémoire long-terme ──
      void extractAndSaveMemory(message.author.id, cleanedContent, aiResponse).catch(() => {});

      logger.info(`[AIChat] Agent IA -> ${message.author.tag}`);
    } else {
      throw new Error("Agent loop: réponse vide");
    }
  } catch (error) {
    logger.error(`[AIChat] Erreur: ${error instanceof Error ? error.message : String(error)}`);
    // Ne pas spammer l'utilisateur avec une erreur à chaque fois — 1 chance sur 3
    if (Math.random() < 0.33) {
      await message.reply({
        content: "\u{1f985} *Static* - Communications brouill\u00e9es ! R\u00e9essaie.",
        allowedMentions: { repliedUser: false },
      });
    }
  }
}

// ── Handler pour les Messages Privés (DM) ───────────────────────────────────

async function handleDMMessage(
  message: OmitPartialGroupDMChannel<Message<boolean>>,
  _client: Client,
): Promise<void> {
  try {
    const content = message.content.trim();
    if (!content) return;

    // ── Rate limiting DÉSACTIVÉ — bot débridé ──

    const apiKey = process.env.OPENROUTER_API_KEY;
    if (!apiKey) {
      await message.reply({
        content: "Circuits non configurés ! OPENROUTER_API_KEY manquant. 🦉",
        allowedMentions: { repliedUser: false },
      });
      return;
    }

    // Indicateur de frappe réaliste
    await simulateHumanTyping(message.channel as TextChannel, content.length);

    // Lancer l'agent loop (Think → Act → Observe → Respond)
    // En DM, guildId est vide — les tools Discord seront limités mais les tools web/APIs fonctionnent
    let aiResponse: string;
    try {
      aiResponse = await runAgentLoop(message as Message, content);
    } catch (loopError) {
      // Fallback simple fetch si l'agent loop échoue
      logger.warn(
        `[DM] AgentLoop échoué, fallback: ${loopError instanceof Error ? loopError.message : String(loopError)}`,
      );
      const fallbackResponse = await fetch("https://openrouter.ai/api/v1/chat/completions", {
        method: "POST",
        headers: {
          Authorization: `Bearer ${apiKey}`,
          "Content-Type": "application/json",
          "HTTP-Referer": "https://discord-bot.com",
          "X-Title": "John Helldiver - Discord Bot",
        },
        body: JSON.stringify({
          model: process.env.OPENROUTER_MODEL || "nvidia/nemotron-3-ultra-550b-a55b:free",
          messages: [
            {
              role: "system",
              content:
                config.aiSystemPrompt +
                "\n\nIMPORTANT: Tu réponds dans la langue du message que tu reçois. " +
                "Adapte-toi à n'importe quelle langue du monde. " +
                "\n\nTu es John Helldiver, réponds en français par défaut, sois concis et naturel.",
            },
            { role: "user", content: `${message.author.username}: ${content}` },
          ],
          max_tokens: 500,
          temperature: 0.7,
        }),
        signal: AbortSignal.timeout(15000),
      });
      if (!fallbackResponse.ok)
        throw new Error(`OpenRouter HTTP error: ${fallbackResponse.status}`, { cause: loopError });
      const fallbackData = (await fallbackResponse.json()) as {
        choices: Array<{ message: { content: string } }>;
      };
      aiResponse = fallbackData.choices?.[0]?.message?.content || "*(silence)*";
    }

    if (aiResponse) {
      if (aiResponse.length > 2000) aiResponse = aiResponse.slice(0, 1997) + "...";

      // ── Envoyer en plusieurs messages si la réponse est longue ──
      await sendMultiMessage(message.channel as TextChannel, aiResponse, message as Message);

      // Sauvegarder en mémoire conversation + extraire faits long-terme
      void extractAndSaveMemory(message.author.id, content, aiResponse).catch(() => {});

      logger.info(`[DM] Agent IA -> ${message.author.tag}`);
    }
  } catch (error) {
    logger.error(`[DM] Erreur: ${error instanceof Error ? error.message : String(error)}`);
    if (Math.random() < 0.33) {
      await message.reply({
        content: "🦉 *Static* - Communications brouillées ! Réessaie.",
        allowedMentions: { repliedUser: false },
      });
    }
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
    // ── AI Chat activé PARTOUT — plus besoin d'activer le salon ──
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

    // ── Cooldown DÉSACTIVÉ — bot débridé ──

    // ── TOUS les messages vont à l'IA, peu importe le contenu ou la langue ──
    await simulateHumanTyping(message.channel as TextChannel, cleanedContent.length);
    const reply = await chatWithHistory(
      message.channelId,
      cleanedContent,
      message.author.username,
      message.guildId || undefined,
    );
    await sendMultiMessage(
      message.channel as TextChannel,
      reply.slice(0, 2000),
      message as Message,
    );
  } catch (err) {
    logger.error("[AIChat] Erreur contextuelle:", err);
  }
}

async function handleSecurityModules(
  message: OmitPartialGroupDMChannel<Message<boolean>>,
  spamTracker: Map<string, { count: number; firstSeen: number; warned: boolean }>,
  client: Client,
): Promise<void> {
  if (!("member" in message) || !message.member) return;
  const member = message.member as GuildMember;
  if (member.permissions.has("Administrator") || member.permissions.has("ModerateMembers")) return;

  if (message.content.length > 10 && message.content.length < 1500) {
    if (!message.guild) return;

    // ── Perspective API (Google) : toxicité en complément de l'IA ──
    if (isPerspectiveConfigured()) {
      const perspectiveResult = await analyzePerspectiveToxicity(message.content).catch(() => null);
      if (
        perspectiveResult &&
        (perspectiveResult.recommendedAction === "remove" ||
          perspectiveResult.recommendedAction === "timeout")
      ) {
        try {
          await message.delete();
          const pAlert = await message.channel.send({
            content: `⚠️ ${message.author} message supprimé (toxicité: ${Math.round(perspectiveResult.overallScore * 100)}%)`,
          });
          setTimeout(() => pAlert.delete().catch(() => {}), 8000);
          if (perspectiveResult.recommendedAction === "timeout" && member.moderatable) {
            await member.timeout(
              5 * 60 * 1000,
              `Perspective API: toxicité ${perspectiveResult.overallScore}`,
            );
          }
          await recordSecurityEvent(message.author.id, message.guild.id, "AI_MODERATION").catch(
            () => {},
          );
          logger.info(
            `[Perspective] ${message.author.tag}: toxicité ${Math.round(perspectiveResult.overallScore * 100)}% → ${perspectiveResult.recommendedAction}`,
          );
          await sendSecurityAlert(client, {
            type: "PERSPECTIVE_MOD",
            userId: message.author.id,
            userTag: message.author.tag,
            guildId: message.guild.id,
            reason: `Perspective API: toxicité ${Math.round(perspectiveResult.overallScore * 100)}%`,
            details: `Action: ${perspectiveResult.recommendedAction}`,
            messageContent: message.content.slice(0, 500),
            messageUrl: message.url,
          }).catch(() => {});
          return;
        } catch (err) {
          logger.error("[Perspective] Erreur:", err);
        }
      }
    }

    // ── AI Moderation (OpenRouter) ────────────────────────────────
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
                await sendSecurityAlert(client, {
                  type: "AI_MODERATION",
                  userId: message.author.id,
                  userTag: message.author.tag,
                  guildId: message.guild!.id,
                  reason: `Message supprimé par IA: ${result.category} (${Math.round(result.confidence * 100)}%)`,
                  details: result.explanation,
                  messageContent: message.content.slice(0, 500),
                  messageUrl: message.url,
                }).catch(() => {});
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
        await sendSecurityAlert(client, {
          type: "ANTI_PHISHING",
          userId: message.author.id,
          userTag: message.author.tag,
          guildId: message.guild!.id,
          reason: `Lien suspect détecté: ${suspicious[0]}`,
          details: suspicious.join(", "),
          messageContent: message.content.slice(0, 500),
          messageUrl: message.url,
        }).catch(() => {});
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
        await sendSecurityAlert(client, {
          type: "ANTI_SPAM",
          userId: message.author.id,
          userTag: message.author.tag,
          guildId: message.guild!.id,
          reason: `Spam détecté: ${entry.count} messages en ${SPAM_WINDOW_MS / 1000}s`,
          messageContent: message.content.slice(0, 500),
          messageUrl: message.url,
        }).catch(() => {});
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
