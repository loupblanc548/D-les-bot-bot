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
import {
  checkMessageMediaForAI,
  checkMessageLinksForSecurity,
} from "../services/aiAvatarDetector.js";
import {
  joinVoiceChannelById,
  isInVoiceChannel,
  speakResponseInVoice,
} from "../services/voiceAgent.js";
import {
  AgentStatusIndicator,
  addFeedbackReactions,
  trackConversation,
  suggestThread,
} from "../services/agentFeedback.js";
import { analyzeImageWithGemini, isGeminiAvailable } from "../services/gemini.js";
import { detectLanguage, type SupportedLang } from "../utils/languageDetector.js";
import { simulateStreamEdit } from "../services/streamingResponse.js";
import { isDeepResearchRequest, runDeepResearch } from "../services/deepResearch.js";
import { isCapabilityQuery, generateCapabilitiesEmbed } from "../services/capabilitiesGenerator.js";
import { sendArtifacts } from "../services/artifacts.js";
import {
  touchConversation,
  checkExpiredConversations,
  buildConversationContext,
} from "../services/aiConversation.js";
import {
  checkMessage as checkWordFilter,
  enforceFilter as enforceWordFilter,
} from "../services/wordFilter.js";
import { checkMessage as checkAutoMod, isMemberExempt as isAutoModExempt, executeAction as executeAutoModAction, DEFAULT_RULES as DEFAULT_AUTOMOD_RULES } from "../services/autoMod.js";
import { checkMessageSimilarity as checkRaidSimilarity } from "../services/antiRaid.js";
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
import { getNextAvailableModel } from "../services/modelRotation.js";

// ─── Constantes ──────────────────────────────────────────────────────────────

const SPAM_THRESHOLD = 5;
const SPAM_WINDOW_MS = 3_000;
const SPAM_MUTE_MS = 5 * 60 * 1000;

// ─── Anti-spam pour messages d'erreur (30s par utilisateur) ──────────────────
const errorSpamGuard = new Map<string, number>();
const ERROR_SPAM_RETENTION_MS = 5 * 60 * 1000; // 5min retention

// Periodic cleanup of errorSpamGuard to prevent memory leak
setInterval(() => {
  const now = Date.now();
  for (const [userId, ts] of errorSpamGuard.entries()) {
    if (now - ts > ERROR_SPAM_RETENTION_MS) errorSpamGuard.delete(userId);
  }
}, 60 * 60 * 1000).unref?.(); // every hour

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

// Detect image/video attachments reliably — Discord often leaves contentType null
const IMAGE_EXTENSIONS = /\.(png|jpe?g|gif|webp|bmp|tiff?|heic|heif|avif|svg)$/i;
const VIDEO_EXTENSIONS = /\.(mp4|webm|mov|avi|mkv|wmv|flv|m4v)$/i;

function isImageAttachment(a: { contentType?: string | null; url: string }): boolean {
  if (a.contentType?.startsWith("image/")) return true;
  return IMAGE_EXTENSIONS.test(a.url);
}

function isMediaAttachment(a: { contentType?: string | null; url: string }): boolean {
  if (a.contentType?.startsWith("image/") || a.contentType?.startsWith("video/")) return true;
  return IMAGE_EXTENSIONS.test(a.url) || VIDEO_EXTENSIONS.test(a.url);
}

// Multilingual Gemini image analysis prompts
const GEMINI_VISION_PROMPTS: Record<SupportedLang, { withQuestion: string; withoutQuestion: string }> = {
  fr: {
    withQuestion: `L'utilisateur pose cette question: "{q}". Analyse l'image en détail pour répondre à cette question. Décris ce que tu vois (contexte, texte visible, détails pertinents) en lien avec la question. Sois concis (max 200 mots).`,
    withoutQuestion: "Décris cette image en détail: que voit-on, quel contexte, quel texte est visible? Sois concis (max 200 mots).",
  },
  en: {
    withQuestion: `The user asks: "{q}". Analyze the image in detail to answer this question. Describe what you see (context, visible text, relevant details) in relation to the question. Be concise (max 200 words).`,
    withoutQuestion: "Describe this image in detail: what do you see, what context, what text is visible? Be concise (max 200 words).",
  },
  de: {
    withQuestion: `Der Nutzer fragt: "{q}". Analysiere das Bild im Detail, um die Frage zu beantworten. Beschreibe, was du siehst (Kontext, sichtbarer Text, relevante Details) im Zusammenhang mit der Frage. Sei prägnant (max 200 Wörter).`,
    withoutQuestion: "Beschreibe dieses Bild im Detail: Was sieht man, welcher Kontext, welcher Text ist sichtbar? Sei prägnant (max 200 Wörter).",
  },
  es: {
    withQuestion: `El usuario pregunta: "{q}". Analiza la imagen en detalle para responder a esta pregunta. Describe lo que ves (contexto, texto visible, detalles relevantes) en relación con la pregunta. Sé conciso (máx 200 palabras).`,
    withoutQuestion: "Describe esta imagen en detalle: ¿qué se ve, qué contexto, qué texto es visible? Sé conciso (máx 200 palabras).",
  },
  pt: {
    withQuestion: `O usuário pergunta: "{q}". Analisa a imagem em detalhe para responder a esta pergunta. Descreve o que vês (contexto, texto visível, detalhes relevantes) em relação à pergunta. Sé conciso (máx 200 palavras).`,
    withoutQuestion: "Descreve esta imagem em detalhe: o que se vê, que contexto, que texto é visível? Sé conciso (máx 200 palavras).",
  },
  it: {
    withQuestion: `L'utente chiede: "{q}". Analizza l'immagine in dettaglio per rispondere a questa domanda. Descrivi ciò che vedi (contesto, testo visibile, dettagli pertinenti) in relazione alla domanda. Sii conciso (max 200 parole).`,
    withoutQuestion: "Descrivi questa immagine in dettaglio: cosa si vede, quale contesto, quale testo è visibile? Sii conciso (max 200 parole).",
  },
  nl: {
    withQuestion: `De gebruiker vraagt: "{q}". Analyseer de afbeelding in detail om deze vraag te beantwoorden. Beschrijf wat je ziet (context, zichtbare tekst, relevante details) in relatie tot de vraag. Wees beknopt (max 200 woorden).`,
    withoutQuestion: "Beschrijf deze afbeelding in detail: wat zie je, welke context, welke tekst is zichtbaar? Wees beknopt (max 200 woorden).",
  },
  sv: {
    withQuestion: `Användaren frågar: "{q}". Analysera bilden i detalj för att svara på frågan. Beskriv vad du ser (kontext, synlig text, relevanta detaljer) i relation till frågan. Var koncis (max 200 ord).`,
    withoutQuestion: "Beskriv denna bild i detalj: vad ser man, vilken kontext, vilken text är synlig? Var koncis (max 200 ord).",
  },
  no: {
    withQuestion: `Brukeren spør: "{q}". Analyser bildet i detalj for å svare på spørsmålet. Beskriv hva du ser (kontekst, synlig tekst, relevante detaljer) i relasjon til spørsmålet. Vær kortfattet (maks 200 ord).`,
    withoutQuestion: "Beskriv dette bildet i detalj: hva ser man, hvilken kontekst, hvilken tekst er synlig? Vær kortfattet (maks 200 ord).",
  },
  cs: {
    withQuestion: `Uživatel se ptá: "{q}". Analyzujte obrázek podrobně, abyste odpověděli na tuto otázku. Popište, co vidíte (kontext, viditelný text, relevantní detaily) ve vztahu k otázce. Buďte struční (max 200 slov).`,
    withoutQuestion: "Popište tento obrázek podrobně: co je vidět, jaký kontext, jaký text je viditelný? Buďte struční (max 200 slov).",
  },
  pl: {
    withQuestion: `Użytkownik pyta: "{q}". Przeanalizuj obraz szczegółowo, aby odpowiedzieć na to pytanie. Opisz, co widzisz (kontekst, widoczny tekst, istotne szczegóły) w odniesieniu do pytania. Bądź zwięzły (max 200 słów).`,
    withoutQuestion: "Opisz ten obraz szczegółowo: co widać, jaki kontekst, jaki tekst jest widoczny? Bądź zwięzły (max 200 słów).",
  },
  tr: {
    withQuestion: `Kullanıcı soruyor: "{q}". Bu soruyu yanıtlamak için resmi detaylı olarak analiz et. Soruyla ilgili olarak gördüğünü (bağlam, görünür metin, ilgili detaylar) açıkla. Kısa ol (maks 200 kelime).`,
    withoutQuestion: "Bu resmi detaylı olarak açıkla: ne görüyorsun, hangi bağlam, hangi metin görünür? Kısa ol (maks 200 kelime).",
  },
  ru: {
    withQuestion: `Пользователь спрашивает: "{q}". Проанализируйте изображение подробно, чтобы ответить на этот вопрос. Опишите, что вы видите (контекст, видимый текст, релевантные детали) в связи с вопросом. Будьте кратки (макс 200 слов).`,
    withoutQuestion: "Опишите это изображение подробно: что видно, какой контекст, какой текст виден? Будьте кратки (макс 200 слов).",
  },
  ja: {
    withQuestion: `ユーザーの質問: "{q}"。この質問に答えるために画像を詳細に分析してください。質問に関連して見えるもの（コンテキスト、表示されているテキスト、関連する詳細）を説明してください。簡潔に（最大200語）。`,
    withoutQuestion: "この画像を詳細に説明してください：何が見えますか、どのようなコンテキスト、どのようなテキストが表示されていますか？簡潔に（最大200語）。",
  },
  zh: {
    withQuestion: `用户问："{q}"。详细分析图像以回答这个问题。描述你看到的（上下文、可见文本、相关细节）与问题的关系。简洁（最多200字）。`,
    withoutQuestion: "详细描述这张图片：看到了什么，什么上下文，什么文本可见？简洁（最多200字）。",
  },
  ar: {
    withQuestion: `يسأل المستخدم: "{q}". حلل الصورة بالتفصيل للإجابة على هذا السؤال. صف ما تراه (السياق، النص المرئي، التفاصيل ذات الصلة) فيما يتعلق بالسؤال. كن موجزاً (بحد أقصى 200 كلمة).`,
    withoutQuestion: "صف هذه الصورة بالتفصيل: ماذا يرى، ما السياق، ما النص المرئي؟ كن موجزاً (بحد أقصى 200 كلمة).",
  },
  ko: {
    withQuestion: `사용자가 질문합니다: "{q}". 이 질문에 답하기 위해 이미지를 자세히 분석하세요. 질문과 관련하여 보이는 것(문맥, 보이는 텍스트, 관련 세부사항)을 설명하세요. 간결하게 (최대 200단어).`,
    withoutQuestion: "이 이미지를 자세히 설명하세요: 무엇이 보이나요, 어떤 문맥, 어떤 텍스트가 보이나요? 간결하게 (최대 200단어).",
  },
};

function buildGeminiVisionPrompt(question: string, lang: SupportedLang): string {
  const prompts = GEMINI_VISION_PROMPTS[lang] || GEMINI_VISION_PROMPTS.en;
  const q = question.trim();
  if (q) {
    return prompts.withQuestion.replace("{q}", q.slice(0, 500));
  }
  return prompts.withoutQuestion;
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

      // ── Auto-modération (mots interdits, caps, liens, invites) ──
      if (message.member) {
        if (!isAutoModExempt(message.member, DEFAULT_AUTOMOD_RULES)) {
          const autoModResult = checkAutoMod(message, DEFAULT_AUTOMOD_RULES);
          if (autoModResult.violated) {
            await executeAutoModAction(message, autoModResult.action, autoModResult.reason);
            logger.info(`[AutoMod] ${message.author.tag}: ${autoModResult.reason}`);
          }
        }
      }

      // ── Anti-raid: similarité de messages ─────────────────────────
      const raidAlert = checkRaidSimilarity(message);
      if (raidAlert) {
        logger.warn(`[AntiRaid] ${raidAlert.type}: ${raidAlert.detail} — ${message.author.tag}`);
      }

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

      // ── Analyse de sécurité des liens (VirusTotal, Safe Browsing, PhishTank) ──
      void checkMessageLinksForSecurity(client, message).catch(() => {});

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
  const statusIndicator = new AgentStatusIndicator(message.channel as TextChannel);
  try {
    // Nettoyer le message : retirer la mention du bot
    const cleanedContent = message.content
      .replace(new RegExp(`<@!?${client.user!.id}>`, "g"), "")
      .trim();

    // Si le message est vide après nettoyage → vérifier s'il y a des images jointes
    const allAttachments = [...message.attachments.values()];
    const hasAttachments = allAttachments.some(isMediaAttachment);
    if (allAttachments.length > 0) {
      logger.info(`[AIChat] Attachments: ${allAttachments.length} — types: ${allAttachments.map(a => `ct=${a.contentType || "null"} url=${a.url.slice(-30)}`).join(" | ")}`);
    }
    if (!cleanedContent && !hasAttachments) {
      await message.reply({
        content: getRandomHelldiverReply(),
        allowedMentions: { repliedUser: false },
      });
      return;
    }
    // Si on a des attachments mais pas de texte, utiliser un prompt par défaut
    const effectiveContent = cleanedContent || "Analyse cette image et dis-moi ce que tu vois.";

    // ── Détection "que peux-tu faire ?" → affiche le tableau des capacités ──
    if (isCapabilityQuery(cleanedContent)) {
      const embed = generateCapabilitiesEmbed();
      await message.reply({ embeds: [embed], allowedMentions: { repliedUser: false } });
      return;
    }

    // ── TOUS les messages vont à l'IA, peu importe le contenu ou la langue ──
    // Plus de courts-circuits (reactions, ultra-short replies, natural actions)
    // L'IA gère toutes les langues et tous les types de messages.

    // Déclencher l'indicateur de frappe réaliste
    await simulateHumanTyping(message.channel as TextChannel, effectiveContent.length);

    // ── Vérifier les conversations expirées avant de continuer ──
    await checkExpiredConversations();

    // ── Rate limiting géré par runAgentLoop (cooldown 3s par user) ──

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
      effectiveContent,
      message.author.username,
    );

    // ── Marquer la conversation comme active ──
    touchConversation(message.author.id);

    // ── Ajouter le message utilisateur à la mémoire de conversation ──
    await addMessageToConversation(
      message.author.id,
      "user",
      effectiveContent,
      message.guildId || undefined,
    );

    // ── Vision auto: analyser les images jointes avec Gemini ──
    let enrichedContent = effectiveContent;
    const imageAttachments = [...message.attachments.values()].filter(isImageAttachment);

    // Also check embeds for image URLs (when user posts a direct image link)
    const embedImageUrls: string[] = [];
    for (const embed of message.embeds) {
      if (embed.image?.url) embedImageUrls.push(embed.image.url);
      if (embed.thumbnail?.url) embedImageUrls.push(embed.thumbnail.url);
    }

    if (imageAttachments.length > 0 || embedImageUrls.length > 0) {
      logger.info(`[AIChat] Images detected: ${imageAttachments.length} attachments + ${embedImageUrls.length} embeds — Gemini available: ${isGeminiAvailable()}`);

      // Always pass image URLs to the agent so it can use analyzeImageGemini tool as fallback
      const allImageUrls = [
        ...imageAttachments.slice(0, 3).map(a => a.url),
        ...embedImageUrls.slice(0, 2),
      ];

      if (isGeminiAvailable()) {
        // Detect user language for multilingual image analysis
        const userQuestion = cleanedContent.trim();
        const langDetection = detectLanguage(userQuestion || effectiveContent);
        const geminiPrompt = buildGeminiVisionPrompt(userQuestion, langDetection.lang);

        let geminiSuccess = false;
        for (const img of imageAttachments.slice(0, 3)) {
          try {
            const description = await analyzeImageWithGemini(
              img.url,
              geminiPrompt,
            );
            if (description) {
              enrichedContent += `\n\n[Image jointe: ${img.url}]\nDescription visuelle: ${description}`;
              geminiSuccess = true;
              logger.info(`[AIChat] Vision auto: image analysée (${description.length} chars, lang=${langDetection.lang}) — question: "${userQuestion.slice(0, 50)}"`);
            }
          } catch (err) {
            logger.error(`[AIChat] Vision auto échouée: ${err instanceof Error ? err.message : String(err)}`);
          }
        }

        // Also analyze embed images (URLs posted by user that Discord auto-embeds)
        for (const imgUrl of embedImageUrls.slice(0, 2)) {
          try {
            const description = await analyzeImageWithGemini(imgUrl, geminiPrompt);
            if (description) {
              enrichedContent += `\n\n[Image jointe: ${imgUrl}]\nDescription visuelle: ${description}`;
              geminiSuccess = true;
              logger.info(`[AIChat] Vision auto (embed): image analysée (${description.length} chars)`);
            }
          } catch (err) {
            logger.error(`[AIChat] Vision auto (embed) échouée: ${err instanceof Error ? err.message : String(err)}`);
          }
        }

        // If Gemini failed (e.g. 403), still pass URLs to agent so it can try analyzeImageGemini tool
        if (!geminiSuccess) {
          logger.warn(`[AIChat] Gemini Vision échoué — passage des URLs à l'agent pour fallback`);
          for (const imgUrl of allImageUrls) {
            enrichedContent += `\n\n[Image jointe: ${imgUrl}]\n(La description visuelle automatique a échoué. Utilise l'outil analyzeImageGemini avec imageUrl=${imgUrl} pour analyser cette image.)`;
          }
        }
      } else {
        // Gemini not available — pass image URLs to the agent so it can use analyzeImageGemini tool
        for (const imgUrl of allImageUrls) {
          enrichedContent += `\n\n[Image jointe: ${imgUrl}]\n(Utilise l'outil analyzeImageGemini avec imageUrl=${imgUrl} pour analyser cette image.)`;
        }
        logger.info(`[AIChat] ${allImageUrls.length} image(s) jointe(s) — Gemini non configuré, URLs passées à l'agent`);
      }
    }

    // ── Indicateur d'activité: sendTyping avant l'agent loop ──
    const channel = message.channel as TextChannel;
    await channel.sendTyping().catch(() => {});

    // ── Suivi de conversation pour suggestion de thread ──
    const convTracker = trackConversation(message.author.id, message.channel.id);
    if (convTracker.shouldSuggestThread && message.guildId) {
      await suggestThread(message as Message);
    }

    // ── DEEP RESEARCH: si la requête demande une recherche approfondie ──
    if (isDeepResearchRequest(enrichedContent)) {
      const researchDone = await runDeepResearch(message as Message, enrichedContent);
      if (researchDone) {
        void statusIndicator.cleanup();
        return;
      }
      // Si le deep research échoue, on continue vers l'agent loop
    }

    // ── AGENT LOOP : Think → Act → Observe → Respond ──
    // L'IA reçoit les tools, réfléchit, exécute des actions si nécessaire,
    // puis synthétise sa réponse finale.
    let aiResponse: string;
    try {
      aiResponse = await runAgentLoop(message as Message, enrichedContent, (toolName, iter) => {
        void statusIndicator.onToolCall(toolName, iter);
      });
    } catch (loopError) {
      // Fallback : si l'agent loop échoue (ex: modèle sans function calling),
      // on retombe sur le simple fetch OpenRouter
      logger.warn(
        `[AIChat] AgentLoop échoué, fallback simple: ${loopError instanceof Error ? loopError.message : String(loopError)}`,
      );
      aiResponse = "";
    }

    // ── Si l'agent loop a retourné un message d'erreur connu, fallback avec modèle gratuit ──
    const isErrorResponse = !aiResponse ||
      aiResponse.includes("Le serveur IA a rencontré un problème") ||
      aiResponse.includes("Problème de communication avec le serveur IA") ||
      aiResponse.includes("Le serveur IA est sous forte charge") ||
      aiResponse.includes("CIRCUIT BREAKER ACTIVATED") ||
      aiResponse.includes("Circuit breaker activated");

    if (isErrorResponse) {
      logger.warn(`[AIChat] AgentLoop a retourné une erreur, fallback modèle gratuit`);
      try {
        const fallbackModel = getNextAvailableModel() || "openrouter/auto";
        const fallbackResponse = await fetch("https://openrouter.ai/api/v1/chat/completions", {
          method: "POST",
          headers: {
            Authorization: `Bearer ${apiKey}`,
            "Content-Type": "application/json",
            "HTTP-Referer": "https://discord-bot.com",
            "X-Title": "John Helldiver - Discord Bot",
          },
          body: JSON.stringify({
            model: fallbackModel,
            messages,
            max_tokens: 500,
            temperature: 0.7,
          }),
          signal: AbortSignal.timeout(15000),
        });
        if (fallbackResponse.ok) {
          const fallbackData = (await fallbackResponse.json()) as {
            choices: Array<{ message: { content: string } }>;
          };
          aiResponse = fallbackData.choices?.[0]?.message?.content || "*(silence)*";
          logger.info(`[AIChat] Fallback réussi avec ${fallbackModel}`);
        }
      } catch (fallbackErr) {
        logger.error(`[AIChat] Fallback aussi échoué: ${fallbackErr instanceof Error ? fallbackErr.message : String(fallbackErr)}`);
      }
    }

    // ── Si toujours vide ou erreur, message par défaut ──
    if (!aiResponse || aiResponse.includes("Le serveur IA a rencontré un problème") || aiResponse.includes("CIRCUIT BREAKER ACTIVATED")) {
      aiResponse = "⚠️ Tous les modèles IA sont temporairement indisponibles (quota/cooldown). Réessaie dans 1-2 minutes, soldat.";
    }

    if (aiResponse) {
      if (aiResponse.length > 2000) aiResponse = aiResponse.slice(0, 1997) + "...";

      // ── Streaming simulé pour les réponses courtes, multi-message sinon ──
      let sentMessages: Message[] | null = null;
      if (aiResponse.length <= 1900) {
        try {
          const streamMsg = await (message as Message).reply("💭 ...");
          await simulateStreamEdit(streamMsg, aiResponse);
          sentMessages = [streamMsg];
        } catch {
          sentMessages = await sendMultiMessage(
            message.channel as TextChannel,
            aiResponse,
            message as Message,
          );
        }
      } else {
        sentMessages = await sendMultiMessage(
          message.channel as TextChannel,
          aiResponse,
          message as Message,
        );
      }

      // ── Ajouter réactions feedback (👍/👎) sur le dernier message ──
      if (sentMessages && sentMessages.length > 0) {
        await addFeedbackReactions(sentMessages[sentMessages.length - 1]);
      }

      // ── Artifacts: détecter et envoyer des fichiers si la réponse contient du code substantiel ──
      void sendArtifacts(message as Message, aiResponse).catch(() => {});

      // ── Réponse vocale: sur demande explicite (parle-moi, en vocal, TTS, à voix haute, etc.) ──
      const voiceKeywords = /(?:en vocal|à voix haute|à voix|dis-le moi|parle-moi|parle le|speak it|say it|voice response|read it aloud|tts|tds|en voix|lis-le|récite|récite-le|à l'oral|orally)/i;
      if (
        message.guildId &&
        message.member?.voice?.channelId &&
        voiceKeywords.test(effectiveContent)
      ) {
        const detectedLang = effectiveContent.match(/[àâçéèêëîïôûùüÿœæ]/i) ? "fr" : "en";
        if (!isInVoiceChannel(message.guildId)) {
          await joinVoiceChannelById(client, message.guildId, message.member.voice.channelId).catch(() => {});
        }
        void speakResponseInVoice(
          message.client,
          message.guildId,
          message.author.id,
          aiResponse,
          detectedLang,
          true, // bypassOptIn — l'utilisateur a explicitement demandé le vocal
        ).catch(() => {});
      }

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
      void extractAndSaveMemory(message.author.id, effectiveContent, aiResponse).catch(() => {});

      // ── Nettoyer l'indicateur de statut ──
      void statusIndicator.cleanup();

      logger.info(`[AIChat] Agent IA -> ${message.author.tag}`);
    } else {
      throw new Error("Agent loop: réponse vide");
    }
  } catch (error) {
    logger.error(`[AIChat] Erreur: ${error instanceof Error ? error.message : String(error)}`);
    // Ensure status indicator is cleaned up on error
    void statusIndicator.cleanup();
    // Anti-spam: 1 message d'erreur max par utilisateur sur 30s
    const now = Date.now();
    const lastErr = errorSpamGuard.get(message.author.id) || 0;
    if (now - lastErr > 30_000) {
      errorSpamGuard.set(message.author.id, now);
      const errMsg = error instanceof Error ? error.message : String(error);
      const isOverload = /429|rate.limit|overload|timeout|503/i.test(errMsg);
      const userMsg = isOverload
        ? "🦅 *Static* — Le relais orbital est saturé. Réessaie dans quelques secondes, soldat."
        : "🦅 *Static* — Problème de transmission. Le QG est notifié. Réessaie.";
      await message.reply({
        content: userMsg,
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
  const dmStatusIndicator = new AgentStatusIndicator(message.channel as TextChannel);
  try {
    const content = message.content.trim();
    const hasDmAttachments = [...message.attachments.values()].some(isMediaAttachment);
    if (!content && !hasDmAttachments) return;
    const effectiveDmContent = content || "Analyse cette image et dis-moi ce que tu vois.";

    // ── Rate limiting géré par runAgentLoop (cooldown 3s par user) ──

    const apiKey = process.env.OPENROUTER_API_KEY;
    if (!apiKey) {
      await message.reply({
        content: "Circuits non configurés ! OPENROUTER_API_KEY manquant. 🦉",
        allowedMentions: { repliedUser: false },
      });
      return;
    }

    // Indicateur de frappe réaliste
    await simulateHumanTyping(message.channel as TextChannel, effectiveDmContent.length);

    // ── Indicateur d'activité: sendTyping avant l'agent loop ──
    const dmChannel = message.channel as TextChannel;
    await dmChannel.sendTyping().catch(() => {});

    // ── Vision auto: analyser les images jointes en DM aussi ──
    let dmEnrichedContent = effectiveDmContent;
    const dmImageAttachments = [...message.attachments.values()].filter(isImageAttachment);

    // Also check embeds for image URLs in DM
    const dmEmbedImageUrls: string[] = [];
    for (const embed of message.embeds) {
      if (embed.image?.url) dmEmbedImageUrls.push(embed.image.url);
      if (embed.thumbnail?.url) dmEmbedImageUrls.push(embed.thumbnail.url);
    }

    if (dmImageAttachments.length > 0 || dmEmbedImageUrls.length > 0) {
      const dmAllImageUrls = [
        ...dmImageAttachments.slice(0, 3).map(a => a.url),
        ...dmEmbedImageUrls.slice(0, 2),
      ];

      if (isGeminiAvailable()) {
        const dmUserQuestion = content.trim();
        const dmLangDetection = detectLanguage(dmUserQuestion || effectiveDmContent);
        const dmGeminiPrompt = buildGeminiVisionPrompt(dmUserQuestion, dmLangDetection.lang);

        let dmGeminiSuccess = false;
        for (const img of dmImageAttachments.slice(0, 3)) {
          try {
            const description = await analyzeImageWithGemini(
              img.url,
              dmGeminiPrompt,
            );
            if (description) {
              dmEnrichedContent += `\n\n[Image jointe: ${img.url}]\nDescription visuelle: ${description}`;
              dmGeminiSuccess = true;
              logger.info(`[DM] Vision auto: image analysée (${description.length} chars, lang=${dmLangDetection.lang}) — question: "${dmUserQuestion.slice(0, 50)}"`);
            }
          } catch (err) {
            logger.error(`[DM] Vision auto échouée: ${err instanceof Error ? err.message : String(err)}`);
          }
        }

        // Also analyze embed images in DM
        for (const imgUrl of dmEmbedImageUrls.slice(0, 2)) {
          try {
            const description = await analyzeImageWithGemini(imgUrl, dmGeminiPrompt);
            if (description) {
              dmEnrichedContent += `\n\n[Image jointe: ${imgUrl}]\nDescription visuelle: ${description}`;
              dmGeminiSuccess = true;
              logger.info(`[DM] Vision auto (embed): image analysée (${description.length} chars)`);
            }
          } catch (err) {
            logger.error(`[DM] Vision auto (embed) échouée: ${err instanceof Error ? err.message : String(err)}`);
          }
        }

        if (!dmGeminiSuccess) {
          logger.warn(`[DM] Gemini Vision échoué — passage des URLs à l'agent pour fallback`);
          for (const imgUrl of dmAllImageUrls) {
            dmEnrichedContent += `\n\n[Image jointe: ${imgUrl}]\n(La description visuelle automatique a échoué. Utilise l'outil analyzeImageGemini avec imageUrl=${imgUrl} pour analyser cette image.)`;
          }
        }
      } else {
        // Gemini not available — pass image URLs to the agent
        for (const imgUrl of dmAllImageUrls) {
          dmEnrichedContent += `\n\n[Image jointe: ${imgUrl}]\n(Utilise l'outil analyzeImageGemini avec imageUrl=${imgUrl} pour analyser cette image.)`;
        }
        logger.info(`[DM] ${dmAllImageUrls.length} image(s) jointe(s) — Gemini non configuré, URLs passées à l'agent`);
      }
    }

    // ── DEEP RESEARCH (DM): si la requête demande une recherche approfondie ──
    if (isDeepResearchRequest(dmEnrichedContent)) {
      const researchDone = await runDeepResearch(message as Message, dmEnrichedContent);
      if (researchDone) {
        void dmStatusIndicator.cleanup();
        return;
      }
    }

    // Lancer l'agent loop (Think → Act → Observe → Respond)
    // En DM, guildId est vide — les tools Discord seront limités mais les tools web/APIs fonctionnent
    let aiResponse: string;
    try {
      aiResponse = await runAgentLoop(message as Message, dmEnrichedContent, (toolName, iter) => {
        void dmStatusIndicator.onToolCall(toolName, iter);
      });
    } catch (loopError) {
      logger.warn(
        `[DM] AgentLoop échoué, fallback: ${loopError instanceof Error ? loopError.message : String(loopError)}`,
      );
      aiResponse = "";
    }

    // ── Si l'agent loop a retourné une erreur, fallback avec modèle gratuit ──
    const dmIsErrorResponse = !aiResponse ||
      aiResponse.includes("Le serveur IA a rencontré un problème") ||
      aiResponse.includes("Problème de communication avec le serveur IA") ||
      aiResponse.includes("Le serveur IA est sous forte charge") ||
      aiResponse.includes("CIRCUIT BREAKER ACTIVATED") ||
      aiResponse.includes("Circuit breaker activated");

    if (dmIsErrorResponse) {
      logger.warn(`[DM] AgentLoop a retourné une erreur, fallback modèle gratuit`);
      try {
        const dmFallbackModel = getNextAvailableModel() || "openrouter/auto";
        const fallbackResponse = await fetch("https://openrouter.ai/api/v1/chat/completions", {
          method: "POST",
          headers: {
            Authorization: `Bearer ${apiKey}`,
            "Content-Type": "application/json",
            "HTTP-Referer": "https://discord-bot.com",
            "X-Title": "John Helldiver - Discord Bot",
          },
          body: JSON.stringify({
            model: dmFallbackModel,
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
        if (fallbackResponse.ok) {
          const fallbackData = (await fallbackResponse.json()) as {
            choices: Array<{ message: { content: string } }>;
          };
          aiResponse = fallbackData.choices?.[0]?.message?.content || "*(silence)*";
          logger.info(`[DM] Fallback réussi avec ${dmFallbackModel}`);
        }
      } catch (fallbackErr) {
        logger.error(`[DM] Fallback aussi échoué: ${fallbackErr instanceof Error ? fallbackErr.message : String(fallbackErr)}`);
      }
    }

    // ── Si toujours vide ou erreur, message par défaut ──
    if (!aiResponse || aiResponse.includes("Le serveur IA a rencontré un problème") || aiResponse.includes("CIRCUIT BREAKER ACTIVATED")) {
      aiResponse = "⚠️ Tous les modèles IA sont temporairement indisponibles (quota/cooldown). Réessaie dans 1-2 minutes, soldat.";
    }

    if (aiResponse) {
      if (aiResponse.length > 2000) aiResponse = aiResponse.slice(0, 1997) + "...";

      // ── Streaming simulé pour les réponses courtes, multi-message sinon ──
      let dmSentMessages: Message[] | null = null;
      if (aiResponse.length <= 1900) {
        try {
          const streamMsg = await (message as Message).reply("💭 ...");
          await simulateStreamEdit(streamMsg, aiResponse);
          dmSentMessages = [streamMsg];
        } catch {
          dmSentMessages = await sendMultiMessage(
            message.channel as TextChannel,
            aiResponse,
            message as Message,
          );
        }
      } else {
        dmSentMessages = await sendMultiMessage(
          message.channel as TextChannel,
          aiResponse,
          message as Message,
        );
      }

      // ── Ajouter réactions feedback (👍/👎) sur le dernier message ──
      if (dmSentMessages && dmSentMessages.length > 0) {
        await addFeedbackReactions(dmSentMessages[dmSentMessages.length - 1]);
      }

      // ── Artifacts: détecter et envoyer des fichiers si la réponse contient du code substantiel ──
      void sendArtifacts(message as Message, aiResponse).catch(() => {});

      // ── Réponse vocale (DM): sur demande explicite ──
      const dmVoiceKeywords = /(?:en vocal|à voix haute|à voix|dis-le moi|parle-moi|parle le|speak it|say it|voice response|read it aloud|tts|tds|en voix|lis-le|récite|à l'oral)/i;
      if (
        message.guildId &&
        message.member?.voice?.channelId &&
        dmVoiceKeywords.test(content)
      ) {
        const detectedLang = content.match(/[àâçéèêëîïôûùüÿœæ]/i) ? "fr" : "en";
        if (!isInVoiceChannel(message.guildId)) {
          await joinVoiceChannelById(message.client, message.guildId, message.member.voice.channelId).catch(() => {});
        }
        void speakResponseInVoice(
          message.client,
          message.guildId,
          message.author.id,
          aiResponse,
          detectedLang,
          true, // bypassOptIn — l'utilisateur a explicitement demandé le vocal
        ).catch(() => {});
      }

      // Sauvegarder en mémoire conversation + extraire faits long-terme
      void extractAndSaveMemory(message.author.id, effectiveDmContent, aiResponse).catch(() => {});

      // ── Nettoyer l'indicateur de statut ──
      void dmStatusIndicator.cleanup();

      logger.info(`[DM] Agent IA -> ${message.author.tag}`);
    }
  } catch (error) {
    logger.error(`[DM] Erreur: ${error instanceof Error ? error.message : String(error)}`);
    void dmStatusIndicator.cleanup();
    // Anti-spam: 1 message d'erreur max par utilisateur sur 30s
    const now = Date.now();
    const lastErr = errorSpamGuard.get(message.author.id) || 0;
    if (now - lastErr > 30_000) {
      errorSpamGuard.set(message.author.id, now);
      const errMsg = error instanceof Error ? error.message : String(error);
      const isOverload = /429|rate.limit|overload|timeout|503/i.test(errMsg);
      const userMsg = isOverload
        ? "🦉 *Static* — Le relais orbital est saturé. Réessaie dans quelques secondes, soldat."
        : "🦉 *Static* — Problème de transmission. Le QG est notifié. Réessaie.";
      await message.reply({
        content: userMsg,
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

    // ── Détection "que peux-tu faire ?" → affiche le tableau des capacités ──
    if (isCapabilityQuery(cleanedContent)) {
      const embed = generateCapabilitiesEmbed();
      await message.reply({ embeds: [embed], allowedMentions: { repliedUser: false } });
      return;
    }

    // ── Cooldown géré par runAgentLoop (3s par user) ──

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
  // Deterministic cleanup: purge entries older than 2x spam window
  const cleanupNow = Date.now();
  for (const [k, v] of spamTracker) {
    if (cleanupNow - v.firstSeen > SPAM_WINDOW_MS * 2) spamTracker.delete(k);
  }
}
