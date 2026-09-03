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
import { analyzeToxicity } from "../services/ai-moderation.js";
import { sendSecurityAlert, checkMessageSpam } from "../services/reportChannel.js";
import prisma from "../prisma.js";
import { withCache } from "../utils/redis-enhance.js";
import { translateAutoToFrench } from "../utils/translator.js";
import { sendMultiMessage } from "../utils/humanBehavior.js";
import { addMessageToConversation } from "../services/aiMemory.js";
import { handleAgentMessageScan } from "../services/agentBrain.js";
import { handlePersonalityMessage } from "../services/personalityEngine.js";
import { runAgentLoop, extractAndSaveMemory } from "../services/agentLoop.js";
import { saveQA } from "../services/obsidianMemory.js";
import { isTesterBot } from "../utils/testerBots.js";
import {
  isJohnPinged,
  recordIncomingPing,
  mentionAwarenessBlock,
  isSendableChannel,
} from "../services/mentionInbox.js";
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
import { isErrorResponse, isCannedFallback } from "../services/responseClassifier.js";
import {
  recoverChatReply,
  resolveIncomingQuestion,
  clearPendingQuestion,
} from "../services/chatResponder.js";
import { isPresencePing, needsAgentLoop } from "../services/agentIntent.js";
import {
  buildPersonalitySystemPrompt,
  getPersonalityTemperature,
} from "../infrastructure/middleware/personalityMiddleware.js";
import { sendImagesFromResponse } from "../utils/imageSender.js";
import { setCachedResponse } from "../utils/aiResponseCache.js";
import { detectLanguage, type SupportedLang } from "../utils/languageDetector.js";
import { simulateStreamEdit } from "../services/streamingResponse.js";
import { scheduleSilentRecover } from "../services/silentRecover.js";
import { isDeepResearchRequest, runDeepResearch } from "../services/deepResearch.js";
import { sendArtifacts } from "../services/artifacts.js";
import { touchConversation, checkExpiredConversations } from "../services/aiConversation.js";
import {
  checkMessage as checkWordFilter,
  enforceFilter as enforceWordFilter,
} from "../services/wordFilter.js";
import {
  checkMessage as checkAutoMod,
  isMemberExempt as isAutoModExempt,
  executeAction as executeAutoModAction,
  DEFAULT_RULES as DEFAULT_AUTOMOD_RULES,
} from "../services/autoMod.js";
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

// ─── Constantes ──────────────────────────────────────────────────────────────

// ─── Détecteur de réponses génériques du LLM local (qwen2.5:3b) ──────────────
// Le 3B donne parfois des réponses passe-partout qu'il ne faut pas cacher
const GENERIC_LOCAL_PATTERNS = [
  "je peux fournir des informations",
  "je peux vous aider",
  "qu'est-ce que tu veux savoir",
  "je suis là pour t'aider",
  "n'hésite pas à demander",
  "que puis-je faire pour toi",
  "i can provide information",
  "how can i help you",
  "what would you like to know",
];
function isGenericLocalResponse(response: string): boolean {
  const lower = response.toLowerCase().trim();
  if (lower.length < 200) {
    return GENERIC_LOCAL_PATTERNS.some((p) => lower.includes(p));
  }
  return false;
}

const SPAM_THRESHOLD = 5;
const SPAM_WINDOW_MS = 3_000;
const SPAM_MUTE_MS = 5 * 60 * 1000;

// ─── Anti-spam pour messages d'erreur (30s par utilisateur) ──────────────────
const errorSpamGuard = new Map<string, number>();
const ERROR_SPAM_RETENTION_MS = 5 * 60 * 1000; // 5min retention

// Periodic cleanup of errorSpamGuard to prevent memory leak
setInterval(
  () => {
    const now = Date.now();
    for (const [userId, ts] of errorSpamGuard.entries()) {
      if (now - ts > ERROR_SPAM_RETENTION_MS) errorSpamGuard.delete(userId);
    }
  },
  60 * 60 * 1000,
).unref?.(); // every hour

// ─── Relances humoristiques quand @mention sans message ──────────────────────

const HELPDIVER_EMPTY_MENTION_REPLIES: Record<string, string[]> = {
  fr: [
    "Ouais, je t'écoute — cuisine, code, devoirs, actus, Discord, ce que tu veux.",
    "John ici. Pose ta question, je gère.",
    "Présent. Dis-moi ce dont tu as besoin.",
    "Je suis là. Quoi de neuf ?",
  ],
  en: [
    "Yeah, I'm here — cooking, code, homework, news, Discord, whatever you need.",
    "John here. Ask away.",
    "Present. What do you need?",
    "I'm listening. What's up?",
  ],
  de: [
    "Ja, ich höre zu — Kochen, Code, Hausaufgaben, News, Discord, was du willst.",
    "John hier. Frag einfach.",
  ],
  es: [
    "Sí, te escucho — cocina, código, deberes, noticias, Discord, lo que sea.",
    "John aquí. Pregunta lo que quieras.",
  ],
  pt: [
    "Sim, estou aqui — cozinha, código, deveres, notícias, Discord, o que você quiser.",
    "John aqui. Manda a pergunta.",
  ],
  it: [
    "Sì, ti ascolto — cucina, codice, compiti, news, Discord, quello che vuoi.",
    "John qui. Chiedi pure.",
  ],
  nl: [
    "Ja, ik luister — koken, code, huiswerk, nieuws, Discord, whatever.",
    "John hier. Stel je vraag.",
  ],
  sv: [
    "Ja, jag lyssnar — matlagning, kod, läxor, nyheter, Discord, vad du vill.",
    "John här. Fråga på.",
  ],
  no: ["Ja, jeg hører — mat, kode, lekser, nyheter, Discord, hva du vil.", "John her. Spør i vei."],
  cs: ["Jo, poslouchám — vaření, kód, úkoly, zprávy, Discord, cokoliv.", "John tady. Ptej se."],
  pl: ["Tak, słucham — gotowanie, kod, zadania, newsy, Discord, cokolwiek.", "John tutaj. Pytaj."],
  tr: [
    "Evet, dinliyorum — yemek, kod, ödev, haber, Discord, ne istersen.",
    "John burada. Sorunu sor.",
  ],
  ru: ["Да, я здесь — готовка, код, учёба, новости, Discord, что угодно.", "Это Джон. Спрашивай."],
  ja: ["いるよ。料理でもコードでも宿題でも、何でも聞いて。", "ジョンだ。どうぞ。"],
  zh: ["在的。做饭、代码、作业、新闻、Discord，随便问。", "我是 John。说吧。"],
  ar: ["نعم، أسمعك — طبخ، برمجة، واجبات، أخبار، ديسكورد، أي شيء.", "جون هنا. اسأل."],
  ko: ["응, 듣고 있어 — 요리, 코드, 숙제, 뉴스, 디스코드, 뭐든.", "존이야. 물어봐."],
};

function getRandomHelldiverReply(lang: SupportedLang = "fr"): string {
  const replies = HELPDIVER_EMPTY_MENTION_REPLIES[lang] || HELPDIVER_EMPTY_MENTION_REPLIES.fr;
  return replies[Math.floor(Math.random() * replies.length)];
}

// Detect image/video attachments reliably — Discord often leaves contentType null
const IMAGE_EXTENSIONS = /\.(png|jpe?g|gif|webp|bmp|tiff?|heic|heif|avif|svg)$/i;
const VIDEO_EXTENSIONS = /\.(mp4|webm|mov|avi|mkv|wmv|flv|m4v)$/i;

function attachmentPath(url: string): string {
  return url.split(/[?#]/, 1)[0] || url;
}

function isImageAttachment(a: { contentType?: string | null; url: string }): boolean {
  if (a.contentType?.startsWith("image/")) return true;
  return IMAGE_EXTENSIONS.test(attachmentPath(a.url));
}

function isMediaAttachment(a: { contentType?: string | null; url: string }): boolean {
  if (a.contentType?.startsWith("image/") || a.contentType?.startsWith("video/")) return true;
  const path = attachmentPath(a.url);
  return IMAGE_EXTENSIONS.test(path) || VIDEO_EXTENSIONS.test(path);
}

// Multilingual Gemini image analysis prompts
const GEMINI_VISION_PROMPTS: Record<
  SupportedLang,
  { withQuestion: string; withoutQuestion: string }
> = {
  fr: {
    withQuestion: `L'utilisateur pose cette question: "{q}". Analyse l'image en détail pour répondre à cette question. Décris ce que tu vois (contexte, texte visible, détails pertinents) en lien avec la question. Sois concis (max 200 mots).`,
    withoutQuestion:
      "Décris cette image en détail: que voit-on, quel contexte, quel texte est visible? Sois concis (max 200 mots).",
  },
  en: {
    withQuestion: `The user asks: "{q}". Analyze the image in detail to answer this question. Describe what you see (context, visible text, relevant details) in relation to the question. Be concise (max 200 words).`,
    withoutQuestion:
      "Describe this image in detail: what do you see, what context, what text is visible? Be concise (max 200 words).",
  },
  de: {
    withQuestion: `Der Nutzer fragt: "{q}". Analysiere das Bild im Detail, um die Frage zu beantworten. Beschreibe, was du siehst (Kontext, sichtbarer Text, relevante Details) im Zusammenhang mit der Frage. Sei prägnant (max 200 Wörter).`,
    withoutQuestion:
      "Beschreibe dieses Bild im Detail: Was sieht man, welcher Kontext, welcher Text ist sichtbar? Sei prägnant (max 200 Wörter).",
  },
  es: {
    withQuestion: `El usuario pregunta: "{q}". Analiza la imagen en detalle para responder a esta pregunta. Describe lo que ves (contexto, texto visible, detalles relevantes) en relación con la pregunta. Sé conciso (máx 200 palabras).`,
    withoutQuestion:
      "Describe esta imagen en detalle: ¿qué se ve, qué contexto, qué texto es visible? Sé conciso (máx 200 palabras).",
  },
  pt: {
    withQuestion: `O usuário pergunta: "{q}". Analisa a imagem em detalhe para responder a esta pergunta. Descreve o que vês (contexto, texto visível, detalhes relevantes) em relação à pergunta. Sé conciso (máx 200 palavras).`,
    withoutQuestion:
      "Descreve esta imagem em detalhe: o que se vê, que contexto, que texto é visível? Sé conciso (máx 200 palavras).",
  },
  it: {
    withQuestion: `L'utente chiede: "{q}". Analizza l'immagine in dettaglio per rispondere a questa domanda. Descrivi ciò che vedi (contesto, testo visibile, dettagli pertinenti) in relazione alla domanda. Sii conciso (max 200 parole).`,
    withoutQuestion:
      "Descrivi questa immagine in dettaglio: cosa si vede, quale contesto, quale testo è visibile? Sii conciso (max 200 parole).",
  },
  nl: {
    withQuestion: `De gebruiker vraagt: "{q}". Analyseer de afbeelding in detail om deze vraag te beantwoorden. Beschrijf wat je ziet (context, zichtbare tekst, relevante details) in relatie tot de vraag. Wees beknopt (max 200 woorden).`,
    withoutQuestion:
      "Beschrijf deze afbeelding in detail: wat zie je, welke context, welke tekst is zichtbaar? Wees beknopt (max 200 woorden).",
  },
  sv: {
    withQuestion: `Användaren frågar: "{q}". Analysera bilden i detalj för att svara på frågan. Beskriv vad du ser (kontext, synlig text, relevanta detaljer) i relation till frågan. Var koncis (max 200 ord).`,
    withoutQuestion:
      "Beskriv denna bild i detalj: vad ser man, vilken kontext, vilken text är synlig? Var koncis (max 200 ord).",
  },
  no: {
    withQuestion: `Brukeren spør: "{q}". Analyser bildet i detalj for å svare på spørsmålet. Beskriv hva du ser (kontekst, synlig tekst, relevante detaljer) i relasjon til spørsmålet. Vær kortfattet (maks 200 ord).`,
    withoutQuestion:
      "Beskriv dette bildet i detalj: hva ser man, hvilken kontekst, hvilken tekst er synlig? Vær kortfattet (maks 200 ord).",
  },
  cs: {
    withQuestion: `Uživatel se ptá: "{q}". Analyzujte obrázek podrobně, abyste odpověděli na tuto otázku. Popište, co vidíte (kontext, viditelný text, relevantní detaily) ve vztahu k otázce. Buďte struční (max 200 slov).`,
    withoutQuestion:
      "Popište tento obrázek podrobně: co je vidět, jaký kontext, jaký text je viditelný? Buďte struční (max 200 slov).",
  },
  pl: {
    withQuestion: `Użytkownik pyta: "{q}". Przeanalizuj obraz szczegółowo, aby odpowiedzieć na to pytanie. Opisz, co widzisz (kontekst, widoczny tekst, istotne szczegóły) w odniesieniu do pytania. Bądź zwięzły (max 200 słów).`,
    withoutQuestion:
      "Opisz ten obraz szczegółowo: co widać, jaki kontekst, jaki tekst jest widoczny? Bądź zwięzły (max 200 słów).",
  },
  tr: {
    withQuestion: `Kullanıcı soruyor: "{q}". Bu soruyu yanıtlamak için resmi detaylı olarak analiz et. Soruyla ilgili olarak gördüğünü (bağlam, görünür metin, ilgili detaylar) açıkla. Kısa ol (maks 200 kelime).`,
    withoutQuestion:
      "Bu resmi detaylı olarak açıkla: ne görüyorsun, hangi bağlam, hangi metin görünür? Kısa ol (maks 200 kelime).",
  },
  ru: {
    withQuestion: `Пользователь спрашивает: "{q}". Проанализируйте изображение подробно, чтобы ответить на этот вопрос. Опишите, что вы видите (контекст, видимый текст, релевантные детали) в связи с вопросом. Будьте кратки (макс 200 слов).`,
    withoutQuestion:
      "Опишите это изображение подробно: что видно, какой контекст, какой текст виден? Будьте кратки (макс 200 слов).",
  },
  ja: {
    withQuestion: `ユーザーの質問: "{q}"。この質問に答えるために画像を詳細に分析してください。質問に関連して見えるもの（コンテキスト、表示されているテキスト、関連する詳細）を説明してください。簡潔に（最大200語）。`,
    withoutQuestion:
      "この画像を詳細に説明してください：何が見えますか、どのようなコンテキスト、どのようなテキストが表示されていますか？簡潔に（最大200語）。",
  },
  zh: {
    withQuestion: `用户问："{q}"。详细分析图像以回答这个问题。描述你看到的（上下文、可见文本、相关细节）与问题的关系。简洁（最多200字）。`,
    withoutQuestion: "详细描述这张图片：看到了什么，什么上下文，什么文本可见？简洁（最多200字）。",
  },
  ar: {
    withQuestion: `يسأل المستخدم: "{q}". حلل الصورة بالتفصيل للإجابة على هذا السؤال. صف ما تراه (السياق، النص المرئي، التفاصيل ذات الصلة) فيما يتعلق بالسؤال. كن موجزاً (بحد أقصى 200 كلمة).`,
    withoutQuestion:
      "صف هذه الصورة بالتفصيل: ماذا يرى، ما السياق، ما النص المرئي؟ كن موجزاً (بحد أقصى 200 كلمة).",
  },
  ko: {
    withQuestion: `사용자가 질문합니다: "{q}". 이 질문에 답하기 위해 이미지를 자세히 분석하세요. 질문과 관련하여 보이는 것(문맥, 보이는 텍스트, 관련 세부사항)을 설명하세요. 간결하게 (최대 200단어).`,
    withoutQuestion:
      "이 이미지를 자세히 설명하세요: 무엇이 보이나요, 어떤 문맥, 어떤 텍스트가 보이나요? 간결하게 (최대 200단어).",
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
      if (message.author.bot) {
        const isSelfMention = client.user ? isJohnPinged(message, client.user.id) : false;
        const isRetailerChannel =
          Boolean(config.retailerChannel) && message.channelId === config.retailerChannel;
        // Tester bot (« encore un test ») may @John so we can drive live checks.
        if (isSelfMention && (isTesterBot(message.author.id) || isRetailerChannel)) {
          recordIncomingPing(message);
          await handleAiChatMention(message, client);
          return;
        }
        return;
      }

      if (client.user && isJohnPinged(message, client.user.id)) {
        recordIncomingPing(message);
      }

      // ── DM (Message Privé) → l'agent IA répond directement ──
      if (!message.guild) {
        await handleDMMessage(message, client);
        return;
      }

      // ── Ping John : n'importe quel salon (texte, fil, annonce, vocal) ──
      if (client.user && isJohnPinged(message, client.user.id)) {
        const handled = await handleVoiceCommand(message, client);
        if (handled) return;
        await handleAiChatMention(message, client);
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
      if (
        config.manualReportChannel &&
        message.channel.id === config.manualReportChannel &&
        !message.author.bot
      ) {
        const reportRoleId = config.reportRoleId;
        try {
          await message.reply({
            content: reportRoleId
              ? `<@&${reportRoleId}> 📢 Nouveau rapport manuel de <@${message.author.id}>`
              : `📢 Nouveau rapport manuel de <@${message.author.id}>`,
            allowedMentions: reportRoleId ? { roles: [reportRoleId] } : undefined,
          });
        } catch {
          // Fallback: send in channel directly
          try {
            await (message.channel as TextChannel).send({
              content: reportRoleId
                ? `<@&${reportRoleId}> 📢 Nouveau rapport manuel de <@${message.author.id}>`
                : `📢 Nouveau rapport manuel de <@${message.author.id}>`,
              allowedMentions: reportRoleId ? { roles: [reportRoleId] } : undefined,
            });
          } catch {
            logger.error("[Silent catch]");
          }
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

      // Les @pings John sont déjà traités en tête de handler (tous salons).

      // ── MODE TRADUCTION AUTOMATIQUE (pas de @mention) ─
      await handleAutoTranslation(message);

      // ── Les modules de sécurité continuent après la traduction ────────
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
          logger.error("[Silent catch]");
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
// BRANCHEMENT 0 : COMMANDE VOCALE PAR @MENTION — @bot parle texte:"..." langue:fr
// =============================================================================

async function handleVoiceCommand(
  message: OmitPartialGroupDMChannel<Message<boolean>>,
  client: Client,
): Promise<boolean> {
  // Nettoyer la mention du bot du contenu
  const content = message.content.replace(new RegExp(`<@!?${client.user!.id}>`, "g"), "").trim();

  // Le message doit commencer par "parle" (insensible à la casse)
  if (!/^parle\b/i.test(content)) return false;

  // ── Parser ultra-flexible ──────────────────────────────────────
  // Accepte tous ces formats:
  //   @bot parle Bonjour tout le monde                    → texte libre, défaut fr
  //   @bot parle "Bonjour tout le monde"                  → guillemets
  //   @bot parle 'Bonjour'                                → apostrophes
  //   @bot parle Bonjour :Français                        → :langue à la fin
  //   @bot parle "Bonjour" :fr                            → :code à la fin
  //   @bot parle :Français "Bonjour"                      → langue d'abord
  //   @bot parle :fr Bonjour tout le monde                → langue d'abord, texte libre
  //   @bot parle texte:"Bonjour" langue:Français          → format explicite (compat)
  //   @bot parle langue:English texte:"Hello"             → format explicite inversé
  //   @bot parle Bonjour tout le monde langue:Français    → langue: à la fin
  //
  // Stratégie:
  //   1. Retirer "parle" du début
  //   2. Extraire la langue (marqueur :xxx ou langue:xxx)
  //   3. Le reste = texte (retirer guillemets/apostrophes si entourent tout)

  let rest = content.replace(/^parle\s*/i, "").trim();

  // ── Étape 0: Détecter "reste" → bot reste connecté ──
  const shouldStay = /\breste\b/i.test(rest);
  rest = rest.replace(/\breste\b/i, "").trim();

  // ── Étape 0b: Extraire voix:homme/femme ──
  let voiceGender: "homme" | "femme" = "homme";
  const voiceMatch = rest.match(/voix\s*:\s*(homme|femme|male|female|fille|garcon|garçon|m|f)/i);
  if (voiceMatch) {
    const v = voiceMatch[1].toLowerCase();
    if (["femme", "female", "fille", "f"].includes(v)) voiceGender = "femme";
    rest = rest.replace(/voix\s*:\s*\S+/i, "").trim();
  }

  if (!rest) {
    await message.reply({
      content:
        '🗣️ **Usage:** `@John Helldiver parle Bonjour tout le monde :Français`\n\nÉcris ce que tu veux que je dise après `parle`. La langue est optionnelle. Ajoute `reste` pour que je reste connecté. Ajoute `voix:femme` ou `voix:homme` pour changer de voix.\n\n**Exemples:**\n`@John Helldiver parle Bonjour tout le monde`\n`@John Helldiver parle "Hello world" :English`\n`@John Helldiver parle reste "Bonjour" :Français`\n`@John Helldiver parle "Bonjour" voix:femme :Français`\n`@John Helldiver parle :Français Bonjour à tous`\n\n**Langues:** Français, English, Español, Deutsch, Italiano, Português, 日本語, 한국어, 中文, Русский, العربية, हिन्दी, Nederlands, Polski, Türkçe, Svenska, Norsk, Dansk, Suomi, Čeština, Ελληνικά, עברית, Magyar, Română, ไทย, Tiếng Việt, Bahasa Indonesia, Українська, Català, Български, Hrvatski, தமிழ், తెలుగు, मराठी, ગુજરાતી, ಕನ್ನಡ, বাংলা, Slovenčina, Slovenščina, Eesti, Latviešu, Lietuvių, Српски, Afrikaans, Kiswahili, Filipino',
      allowedMentions: { repliedUser: false },
    });
    return true;
  }

  // ── Étape 1: Extraire la langue ──
  // Pattern A: langue:xxx ou langue :xxx (n'importe où dans le message)
  // Pattern B: :xxx à la fin du message (marqueur court)
  // Pattern C: :xxx au début du message (langue d'abord)
  let lang = "fr"; // défaut
  let textRaw = rest;

  // D'abord essayer "langue:xxx" ou "langue :xxx"
  const langExplicit = rest.match(/langue\s*:\s*(\S+)/i);
  if (langExplicit) {
    lang = langExplicit[1];
    textRaw = rest.replace(/langue\s*:\s*\S+/i, "").trim();
  } else {
    // Essayer ":xxx" — soit au début, soit à la fin
    // Au début: :Français texte...
    const langStart = rest.match(/^:(\S+)\s+(.+)/i);
    if (langStart) {
      lang = langStart[1];
      textRaw = langStart[2].trim();
    } else {
      // À la fin: texte... :Français
      const langEnd = rest.match(/^(.+?)\s+:(\S+)$/i);
      if (langEnd) {
        textRaw = langEnd[1].trim();
        lang = langEnd[2];
      }
      // Sinon: pas de langue spécifiée, tout est du texte
    }
  }

  // ── Étape 2: Nettoyer le texte ──
  // Retirer "texte:" si présent (format explicite)
  textRaw = textRaw.replace(/^texte\s*:\s*/i, "").trim();

  // Retirer les guillemets/apostrophes qui entourent tout le texte
  if (/^".+"$/.test(textRaw)) {
    textRaw = textRaw.slice(1, -1);
  } else if (/^'[^']+'$/.test(textRaw)) {
    textRaw = textRaw.slice(1, -1);
  } else if (/^«.+»$/.test(textRaw)) {
    textRaw = textRaw.slice(1, -1); // guillemets français « »
  } else if (/^\(.+\)$/.test(textRaw)) {
    textRaw = textRaw.slice(1, -1); // parenthèses
  }

  const text = textRaw.trim();
  if (!text || text.length > 3000) {
    await message.reply({
      content: "❌ Le texte doit faire entre 1 et 3000 caractères.",
      allowedMentions: { repliedUser: false },
    });
    return true;
  }

  // ── Étape 3: Résoudre la langue ──
  const langMap: Record<string, string> = {
    // Français
    fr: "fr",
    français: "fr",
    francais: "fr",
    french: "fr",
    // Anglais
    en: "en",
    english: "en",
    anglais: "en",
    // Espagnol
    es: "es",
    español: "es",
    espagnol: "es",
    spanish: "es",
    espanol: "es",
    // Allemand
    de: "de",
    deutsch: "de",
    allemand: "de",
    german: "de",
    // Italien
    it: "it",
    italiano: "it",
    italien: "it",
    italian: "it",
    // Portugais
    pt: "pt",
    português: "pt",
    portugais: "pt",
    portuguese: "pt",
    portugues: "pt",
    ptbr: "pt",
    br: "pt",
    bresilien: "pt",
    brésilien: "pt",
    // Japonais
    ja: "ja",
    日本語: "ja",
    japonais: "ja",
    japanese: "ja",
    // Coréen
    ko: "ko",
    한국어: "ko",
    coréen: "ko",
    korean: "ko",
    coreen: "ko",
    // Chinois
    zh: "zh",
    中文: "zh",
    chinois: "zh",
    chinese: "zh",
    // Russe
    ru: "ru",
    русский: "ru",
    russe: "ru",
    russian: "ru",
    // Arabe
    ar: "ar",
    العربية: "ar",
    arabe: "ar",
    arabic: "ar",
    // Hindi
    hi: "hi",
    हिन्दी: "hi",
    hindi: "hi",
    indien: "hi",
    // Néerlandais
    nl: "nl",
    nederlands: "nl",
    néerlandais: "nl",
    dutch: "nl",
    neerlandais: "nl",
    // Polonais
    pl: "pl",
    polski: "pl",
    polonais: "pl",
    polish: "pl",
    // Turc
    tr: "tr",
    türkçe: "tr",
    turc: "tr",
    turkish: "tr",
    turkce: "tr",
    // Suédois
    sv: "sv",
    svenska: "sv",
    suédois: "sv",
    swedish: "sv",
    suedois: "sv",
    // Norvégien
    nb: "nb",
    norsk: "nb",
    norvégien: "nb",
    norwegian: "nb",
    norvegien: "nb",
    // Danois
    da: "da",
    dansk: "da",
    danois: "da",
    danish: "da",
    // Finlandais
    fi: "fi",
    suomi: "fi",
    finnois: "fi",
    finnish: "fi",
    // Tchèque
    cs: "cs",
    čeština: "cs",
    tchèque: "cs",
    czech: "cs",
    tcheque: "cs",
    // Grec
    el: "el",
    ελληνικά: "el",
    grec: "el",
    greek: "el",
    // Hébreu
    he: "he",
    עברית: "he",
    hébreu: "he",
    hebrew: "he",
    hebregu: "he",
    // Hongrois
    hu: "hu",
    magyar: "hu",
    hongrois: "hu",
    hungarian: "hu",
    // Roumain
    ro: "ro",
    română: "ro",
    roumain: "ro",
    romanian: "ro",
    romana: "ro",
    // Thai
    th: "th",
    ไทย: "th",
    thaï: "th",
    thai: "th",
    thailandais: "th",
    // Vietnamien
    vi: "vi",
    vietnamien: "vi",
    vietnamese: "vi",
    // Indonésien
    id: "id",
    indonesien: "id",
    indonésien: "id",
    indonesian: "id",
    // Ukrainien
    uk: "uk",
    українська: "uk",
    ukrainien: "uk",
    ukrainian: "uk",
    // Catalan
    ca: "ca",
    català: "ca",
    catalan: "ca",
    // Bulgare
    bg: "bg",
    български: "bg",
    bulgare: "bg",
    bulgarian: "bg",
    // Croate
    hr: "hr",
    hrvatski: "hr",
    croate: "hr",
    croatian: "hr",
    // Malayalam
    ml: "ml",
    മലയാളം: "ml",
    malayalam: "ml",
    // Tamoul
    ta: "ta",
    தமிழ்: "ta",
    tamoul: "ta",
    tamil: "ta",
    // Telugu
    te: "te",
    తెలుగు: "te",
    telugu: "te",
    // Marathi
    mr: "mr",
    मराठी: "mr",
    marathi: "mr",
    // Gujarati
    gu: "gu",
    ગુજરાતી: "gu",
    gujarati: "gu",
    // Kannada
    kn: "kn",
    ಕನ್ನಡ: "kn",
    kannada: "kn",
    // Bengali
    bn: "bn",
    বাংলা: "bn",
    bengali: "bn",
    // Slovaque
    sk: "sk",
    slovenčina: "sk",
    slovaque: "sk",
    slovak: "sk",
    // Slovène
    sl: "sl",
    slovenščina: "sl",
    slovène: "sl",
    slovenian: "sl",
    slovene: "sl",
    // Estonien
    et: "et",
    eesti: "et",
    estonien: "et",
    estonian: "et",
    // Letton
    lv: "lv",
    latviešu: "lv",
    letton: "lv",
    latvian: "lv",
    // Lituanien
    lt: "lt",
    lietuvių: "lt",
    lituanien: "lt",
    lithuanian: "lt",
    // Serbe
    sr: "sr",
    српски: "sr",
    serbe: "sr",
    serbian: "sr",
    // Afrikaans
    af: "af",
    afrikaans: "af",
    // Swahili
    sw: "sw",
    kiswahili: "sw",
    swahili: "sw",
    // Filipinois/Tagalog
    fil: "fil",
    filipino: "fil",
    tagalog: "fil",
    philippin: "fil",
  };
  const langRaw = lang
    .toLowerCase()
    .replace(/[éèê]/g, "e")
    .replace(/[:'"«»]/g, "");
  const resolvedLang = langMap[langRaw] || langMap[langRaw.slice(0, 2)] || "fr";

  // Vérifier que l'utilisateur est dans un salon vocal
  const member = message.member as GuildMember | null;
  const voiceChannel = member?.voice?.channel;
  if (!voiceChannel) {
    await message.reply({
      content: "❌ Tu dois être dans un salon vocal pour que je puisse parler.",
      allowedMentions: { repliedUser: false },
    });
    return true;
  }

  // Réaction pour indiquer que ça travaille
  try {
    await message.react("🗣️");
  } catch {
    logger.error("[Silent catch]");
  }

  // ── Ajouter à la file d'attente TTS ──
  const guildId = message.guildId!;
  enqueueTTS(guildId, {
    text,
    lang: resolvedLang,
    voiceGender,
    voiceChannelId: voiceChannel.id,
    guildId,
    adapterCreator: message.guild!.voiceAdapterCreator,
    shouldStay,
    authorTag: message.author.tag,
    channelName: voiceChannel.name,
  });

  return true;
}

// ─── File d'attente TTS par guilde ───────────────────────────────────────────

interface TTSQueueItem {
  text: string;
  lang: string;
  voiceGender: "homme" | "femme";
  voiceChannelId: string;
  guildId: string;
  adapterCreator: any;
  shouldStay: boolean;
  authorTag: string;
  channelName: string;
}

const ttsQueues = new Map<string, TTSQueueItem[]>();
const ttsPlaying = new Set<string>();
const stayConnected = new Set<string>();

async function enqueueTTS(guildId: string, item: TTSQueueItem): Promise<void> {
  const queue = ttsQueues.get(guildId) || [];
  queue.push(item);
  ttsQueues.set(guildId, queue);
  logger.info(`[TTSQueue] ${guildId}: ${queue.length} message(s) en attente`);
  void processTTSQueue(guildId);
}

async function processTTSQueue(guildId: string): Promise<void> {
  if (ttsPlaying.has(guildId)) return;
  const queue = ttsQueues.get(guildId);
  if (!queue || queue.length === 0) return;

  const item = queue.shift()!;
  ttsPlaying.add(guildId);

  try {
    const audioBuffer = await generateVoiceTTS(item.text, item.lang, item.voiceGender);
    if (!audioBuffer) {
      logger.warn(`[TTSQueue] Échec génération TTS pour ${guildId}`);
      return;
    }

    const {
      joinVoiceChannel,
      getVoiceConnection,
      createAudioPlayer,
      createAudioResource,
      AudioPlayerStatus,
      NoSubscriberBehavior,
    } = await import("@discordjs/voice");
    const { Readable } = await import("node:stream");

    const existing = getVoiceConnection(guildId);
    if (existing && existing.joinConfig.channelId !== item.voiceChannelId) {
      existing.destroy();
    }

    let connection = getVoiceConnection(guildId);
    if (!connection) {
      connection = joinVoiceChannel({
        channelId: item.voiceChannelId,
        guildId,
        adapterCreator:
          item.adapterCreator as import("@discordjs/voice").DiscordGatewayAdapterCreator,
        selfMute: false,
        selfDeaf: false,
      });
    }

    const player = createAudioPlayer({
      behaviors: { noSubscriber: NoSubscriberBehavior.Play },
    });

    const stream = Readable.from(audioBuffer);
    const resource = createAudioResource(stream);
    connection.subscribe(player);
    player.play(resource);

    logger.info(
      `[TTSQueue] ${item.authorTag} dit "${item.text.slice(0, 50)}..." en ${item.lang} (${item.voiceGender}) dans #${item.channelName}`,
    );

    await new Promise<void>((resolve) => {
      player.once(AudioPlayerStatus.Idle, () => resolve());
      player.on("error", () => resolve());
      setTimeout(() => resolve(), 60_000);
    });
  } catch (error) {
    logger.error("[TTSQueue] Erreur:", error);
  } finally {
    ttsPlaying.delete(guildId);

    if (item.shouldStay) {
      stayConnected.add(guildId);
    }

    const nextQueue = ttsQueues.get(guildId);
    if (nextQueue && nextQueue.length > 0) {
      void processTTSQueue(guildId);
    } else if (!stayConnected.has(guildId)) {
      setTimeout(() => {
        import("@discordjs/voice").then(({ getVoiceConnection }) => {
          const conn = getVoiceConnection(guildId);
          if (conn) {
            conn.destroy();
            logger.info(`[TTSQueue] ${guildId} déconnexion auto (file vide)`);
          }
        });
      }, 5_000);
    }
  }
}

/**
 * Pipeline TTS neuronal — même ordre que voiceAgent.ts
 */
async function generateVoiceTTS(
  text: string,
  lang: string,
  voiceGender: "homme" | "femme" = "homme",
): Promise<Buffer | null> {
  // 1. Piper TTS local
  try {
    const { generateLocalTTS, isPiperAvailable } = await import("../services/localTts.js");
    if (isPiperAvailable()) {
      const buf = await generateLocalTTS(text, lang);
      if (buf && buf.length > 1000) {
        logger.info(`[VoiceCmd] TTS via Piper local (lang: ${lang})`);
        return buf;
      }
    }
  } catch {
    logger.error("[Silent catch]");
  }

  // 2. ElevenLabs
  try {
    const { generateElevenLabsTTS, isElevenLabsConfigured } =
      await import("../services/elevenLabsTts.js");
    if (isElevenLabsConfigured()) {
      const result = await generateElevenLabsTTS(text.slice(0, 500));
      if (result?.audioUrl?.startsWith("data:audio/mpeg;base64,")) {
        logger.info("[VoiceCmd] TTS via ElevenLabs (neural premium)");
        return Buffer.from(result.audioUrl.split(",")[1], "base64");
      }
    }
  } catch {
    logger.error("[Silent catch]");
  }

  // 3. Microsoft Edge TTS (voix neuronales Azure gratuites)
  try {
    const edgeBuffer = await generateEdgeTTS(text.slice(0, 3000), lang, voiceGender);
    if (edgeBuffer && edgeBuffer.length > 1000) {
      logger.info(`[VoiceCmd] TTS via Microsoft Edge TTS (neural, lang: ${lang})`);
      return edgeBuffer;
    }
  } catch {
    logger.error("[Silent catch]");
  }

  // 4. StreamElements / Amazon Polly
  try {
    const voiceMap: Record<string, string> = {
      fr: "Mathieu",
      en: "Brian",
      es: "Enrique",
      de: "Hans",
      it: "Giorgio",
      pt: "Ricardo",
      ja: "Takumi",
      ko: "Minho",
      zh: "Zhiyu",
      ru: "Maxim",
      nl: "Ruben",
      pl: "Jacek",
      tr: "Filiz",
      sv: "Astrid",
      da: "Naja",
      fi: "Salli",
      cs: "Eliska",
      el: "Lucretia",
      he: "Hanna",
      hu: "Gabor",
      ro: "Carmen",
      th: "Patchara",
      vi: "Hien",
      id: "Andika",
      uk: "Ostap",
      bg: "Petar",
      hr: "Srecko",
      ta: "SaiSenthil",
      te: "SaiPrasad",
      mr: "SaiNishant",
      gu: "SaiKiran",
      kn: "SaiKavya",
      bn: "SaiSourav",
      sk: "Viktor",
      sl: "Tina",
      et: "Eva",
      lv: "Nils",
      lt: "Leonas",
      sr: "Stefan",
      af: "Ruben",
      sw: "Daudi",
    };
    const voice = voiceMap[lang] || "Brian";
    const seUrl = `https://api.streamelements.com/kappa/v2/speech?voice=${encodeURIComponent(voice)}&text=${encodeURIComponent(text.slice(0, 500))}`;
    const seRes = await fetch(seUrl, {
      signal: AbortSignal.timeout(10_000),
      headers: { "User-Agent": "DiscordBot/1.0" },
    });
    if (seRes.ok) {
      const seBuffer = Buffer.from(await seRes.arrayBuffer());
      if (seBuffer.length > 1000) {
        logger.info(`[VoiceCmd] TTS via StreamElements/Polly (voix: ${voice})`);
        return seBuffer;
      }
    }
  } catch {
    logger.error("[Silent catch]");
  }

  // 5. Fallback: Google Translate TTS
  try {
    const url = `https://translate.google.com/translate_tts?ie=UTF-8&q=${encodeURIComponent(text.slice(0, 500))}&tl=${lang}&client=tw-ob`;
    const res = await fetch(url, {
      headers: {
        "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36",
        Referer: "https://translate.google.com/",
      },
      signal: AbortSignal.timeout(10_000),
    });
    if (!res.ok) return null;
    logger.info("[VoiceCmd] TTS via Google Translate (fallback)");
    return Buffer.from(await res.arrayBuffer());
  } catch (err) {
    logger.error("[VoiceCmd] Erreur TTS:", err);
    return null;
  }
}

async function generateEdgeTTS(
  text: string,
  lang: string,
  voiceGender: "homme" | "femme" = "homme",
): Promise<Buffer | null> {
  const { WebSocket } = await import("ws");

  const maleVoices: Record<string, string> = {
    fr: "fr-FR-HenriNeural",
    en: "en-US-AndrewMultilingualNeural",
    es: "es-ES-AlvaroNeural",
    de: "de-DE-ConradNeural",
    it: "it-IT-DiegoNeural",
    pt: "pt-BR-AntonioNeural",
    ja: "ja-JP-KeitaNeural",
    ko: "ko-KR-InJoonNeural",
    zh: "zh-CN-XiaoxiaoNeural",
    ru: "ru-RU-DmitryNeural",
    nl: "nl-NL-MaartenNeural",
    ar: "ar-SA-HamedNeural",
    hi: "hi-IN-MadhurNeural",
    pl: "pl-PL-MarekNeural",
    tr: "tr-TR-EmirNeural",
    sv: "sv-SE-MattiasNeural",
    nb: "nb-NO-FinnNeural",
    da: "da-DK-JeppeNeural",
    fi: "fi-FI-HarriNeural",
    cs: "cs-CZ-AntoninNeural",
    el: "el-GR-NestorasNeural",
    he: "he-IL-AvriNeural",
    hu: "hu-HU-TamasNeural",
    ro: "ro-RO-EmilNeural",
    th: "th-TH-NiwatNeural",
    vi: "vi-VN-HoaiMyNeural",
    id: "id-ID-ArdiNeural",
    uk: "uk-UA-OstapNeural",
    ca: "ca-ES-EnricNeural",
    bg: "bg-BG-BorislavNeural",
    hr: "hr-HR-SreckoNeural",
    ml: "ml-IN-MidhunNeural",
    ta: "ta-IN-ValluvarNeural",
    te: "te-IN-MohanNeural",
    mr: "mr-IN-AarohiNeural",
    gu: "gu-IN-NiranjanNeural",
    kn: "kn-IN-GaganNeural",
    bn: "bn-IN-BashkarNeural",
    sk: "sk-SK-LukasNeural",
    sl: "sl-SI-RokNeural",
    et: "et-EE-KertNeural",
    lv: "lv-LV-NilsNeural",
    lt: "lt-LT-LeonasNeural",
    sr: "sr-RS-NicholasNeural",
    af: "af-ZA-WillemNeural",
    sw: "sw-TZ-DaudiNeural",
    fil: "fil-PH-AngeloNeural",
  };

  const femaleVoices: Record<string, string> = {
    fr: "fr-FR-DeniseNeural",
    en: "en-US-AvaMultilingualNeural",
    es: "es-ES-ElviraNeural",
    de: "de-DE-KatjaNeural",
    it: "it-IT-ElsaNeural",
    pt: "pt-BR-FranciscaNeural",
    ja: "ja-JP-NanamiNeural",
    ko: "ko-KR-SunHiNeural",
    zh: "zh-CN-XiaoyiNeural",
    ru: "ru-RU-SvetlanaNeural",
    nl: "nl-NL-FennaNeural",
    ar: "ar-SA-ZariyahNeural",
    hi: "hi-IN-SwaraNeural",
    pl: "pl-PL-ZofiaNeural",
    tr: "tr-TR-EmelNeural",
    sv: "sv-SE-SofieNeural",
    nb: "nb-NO-IselinNeural",
    da: "da-DK-TineNeural",
    fi: "fi-FI-NooraNeural",
    cs: "cs-CZ-VlastaNeural",
    el: "el-GR-AthinaNeural",
    he: "he-IL-HilaNeural",
    hu: "hu-HU-NoemiNeural",
    ro: "ro-RO-AlinaNeural",
    th: "th-TH-PremwadeeNeural",
    vi: "vi-VN-NhiWinneNeural",
    id: "id-ID-GadisNeural",
    uk: "uk-UA-PolinaNeural",
    ca: "ca-ES-JoanaNeural",
    bg: "bg-BG-KalinaNeural",
    hr: "hr-HR-GabrijelaNeural",
  };

  const voiceMap = voiceGender === "femme" ? femaleVoices : maleVoices;

  const voice = voiceMap[lang] || "en-US-AndrewMultilingualNeural";
  const SSML = `<speak version='1.0' xmlns='http://www.w3.org/2001/10/synthesis' xml:lang='${lang}'><voice name='${voice}'>${text.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;")}</voice></speak>`;

  return new Promise<Buffer | null>((resolve) => {
    const chunks: Buffer[] = [];
    let resolved = false;

    const finish = (result: Buffer | null) => {
      if (resolved) return;
      resolved = true;
      try {
        ws.close();
      } catch {
        logger.error("[Silent catch]");
      }
      resolve(result);
    };

    const ws = new WebSocket(
      "wss://speech.platform.bing.com/consumer/speech/synthesize/readaloud/edge/v1",
      {
        headers: {
          "User-Agent": "Mozilla/5.0",
          Origin: "chrome-extension://jdiccldimpdaibmpdkjnbmckianbfold",
        },
      },
    );

    const timeout = setTimeout(() => finish(null), 10_000);

    ws.on("open", () => {
      ws.send(
        `Content-Type:application/json; charset=utf-8\r\nPath:speech.config\r\n\r\n${JSON.stringify({ context: { synthesis: { audio: { outputFormat: "audio-24khz-48kbitrate-mono-mp3" } } } })}`,
      );
      ws.send(
        `Content-Type:application/ssml+xml\r\nX-Timestamp:${new Date().toISOString()}\r\nPath:ssml\r\n\r\n${SSML}`,
      );
    });

    ws.on("message", (data: Buffer) => {
      const str = data.toString();
      if (str.includes("Path:audio")) {
        const idx = str.indexOf("\r\n\r\n");
        if (idx !== -1) {
          const audioData = data.subarray(idx + 4);
          if (audioData.length > 0) chunks.push(audioData);
        }
      }
      if (str.includes("Path:turn.end")) {
        clearTimeout(timeout);
        const combined = Buffer.concat(chunks);
        finish(combined.length > 100 ? combined : null);
      }
    });

    ws.on("error", () => {
      clearTimeout(timeout);
      finish(null);
    });

    ws.on("close", () => {
      clearTimeout(timeout);
      if (chunks.length > 0) {
        const combined = Buffer.concat(chunks);
        finish(combined.length > 100 ? combined : null);
      } else {
        finish(null);
      }
    });
  });
}

// =============================================================================
// BRANCHEMENT 1 : CHAT IA PAR @MENTION
// =============================================================================

function discordChatPrompt(): string {
  return buildPersonalitySystemPrompt(config.aiSystemPrompt) + mentionAwarenessBlock();
}

async function retryInsteadOfGo(
  message: Message,
  question: string,
  statusIndicator: AgentStatusIndicator,
): Promise<void> {
  void statusIndicator.cleanup();
  const placeholder = await message
    .reply({ content: "💭 Un instant, je relance…", allowedMentions: { repliedUser: false } })
    .catch(() => null);
  if (!placeholder) return;
  scheduleSilentRecover({
    userId: message.author.id,
    question,
    placeholder,
    systemPrompt: discordChatPrompt(),
    guildId: message.guildId ?? undefined,
  });
}

function markTalkingOnline(client: Client): void {
  const user = client.user;
  if (!user) return;
  void Promise.resolve(
    user.setPresence({
      status: "online",
      activities: [{ name: "Surveille les Helldivers", type: 3 }],
    }),
  ).catch(() => undefined);
}

async function handleAiChatMention(
  message: OmitPartialGroupDMChannel<Message<boolean>>,
  client: Client,
): Promise<void> {
  markTalkingOnline(client);
  if (!isSendableChannel(message)) {
    logger.warn(`[AIChat] Ping reçu mais salon non textuel: ${message.channelId}`);
    return;
  }
  const statusIndicator = new AgentStatusIndicator(message.channel as TextChannel);
  let userLang: SupportedLang = "fr";
  try {
    // Nettoyer le message : retirer la mention du bot
    let cleanedContent = message.content
      .replace(new RegExp(`<@!?${client.user!.id}>`, "g"), "")
      .trim();

    // Si le message est vide après nettoyage → vérifier s'il y a des images jointes
    const allAttachments = [...message.attachments.values()];
    const hasAttachments = allAttachments.some(isMediaAttachment);
    if (allAttachments.length > 0) {
      logger.info(
        `[AIChat] Attachments: ${allAttachments.length} — types: ${allAttachments.map((a) => `ct=${a.contentType || "null"} url=${a.url.slice(-30)}`).join(" | ")}`,
      );
    }
    if (!cleanedContent && !hasAttachments) {
      const pendingRetry = resolveIncomingQuestion(message.author.id, "", false);
      if (!pendingRetry) {
        const langDetection = detectLanguage(message.content || "");
        await message.reply({
          content: getRandomHelldiverReply(langDetection.lang),
          allowedMentions: { repliedUser: false },
        });
        return;
      }
      logger.info(
        `[AIChat] Empty mention — retrying last unanswered question for ${message.author.id}`,
      );
      cleanedContent = pendingRetry;
    } else {
      const original = cleanedContent;
      cleanedContent = resolveIncomingQuestion(message.author.id, cleanedContent, hasAttachments);
      if (cleanedContent && cleanedContent !== original) {
        logger.info(`[AIChat] Retry cue — replaying last unanswered question`);
      }
    }
    const effectiveContent = cleanedContent || "Analyse cette image et dis-moi ce que tu vois.";

    // « tu es là » → une vraie phrase via le chat, pas un embed / une commande.
    if (isPresencePing(cleanedContent) && !hasAttachments) {
      try {
        const { respondChat } = await import("../services/chatResponder.js");
        const result = await respondChat(cleanedContent || "tu es là ?", [], {
          systemPrompt: discordChatPrompt(),
          temperature: getPersonalityTemperature(),
          userId: message.author.id,
          guildId: message.guildId ?? undefined,
          maxTokens: 200,
          deadlineMs: 12_000,
        });
        const text = result.content?.trim() ?? "";
        if (
          text &&
          result.provider !== "fallback" &&
          !isErrorResponse(text) &&
          !isCannedFallback(text)
        ) {
          await message.reply({ content: text, allowedMentions: { repliedUser: false } });
          return;
        }
      } catch {
        // fallback local
      }
      await message.reply({
        content: "Oui, je suis là.",
        allowedMentions: { repliedUser: false },
      });
      return;
    }

    // ── TOUS les messages vont à l'IA, peu importe le contenu ou la langue ──
    // Plus de courts-circuits (reactions, ultra-short replies, natural actions)
    // L'IA gère toutes les langues et tous les types de messages.

    // ── Détection de langue (rapide, synchrone) ──
    const userLangDetection = detectLanguage(effectiveContent);
    userLang = userLangDetection.lang;
    const langNames: Record<SupportedLang, string> = {
      fr: "français",
      en: "English",
      de: "Deutsch",
      es: "español",
      pt: "português",
      it: "italiano",
      nl: "Nederlands",
      sv: "svenska",
      no: "norsk",
      cs: "čeština",
      pl: "polski",
      tr: "Türkçe",
      ru: "русский",
      ja: "日本語",
      zh: "中文",
      ar: "العربية",
      ko: "한국어",
    };
    const langInstruction = `[LANGUAGE INSTRUCTION] The user is writing in ${langNames[userLang] || "English"}. You MUST respond in ${langNames[userLang] || "English"}. Always reply in the same language as the user's message. If the user mixes languages, respond in the dominant one.`;

    let enrichedContent = `${langInstruction}\n\n${effectiveContent}`;

    // ── Vérifier les images jointes (rapide, synchrone) ──
    const imageAttachments = [...message.attachments.values()].filter(isImageAttachment);
    let imageUrls: string[] = [];
    const embedImageUrls: string[] = [];
    for (const embed of message.embeds) {
      if (embed.image?.url) embedImageUrls.push(embed.image.url);
      if (embed.thumbnail?.url) embedImageUrls.push(embed.thumbnail.url);
    }

    // ── CACHE DÉSACTIVÉ — le bot doit réfléchir à chaque message, pas rejouer des réponses pré-construites ──

    // ── Trivial fast path (réponses instantanées sans API) ──
    if (imageAttachments.length === 0 && embedImageUrls.length === 0) {
      const { getTrivialResponse } = await import("../services/trivialFastPath.js");
      const trivial = getTrivialResponse(effectiveContent, message.author.id);
      if (trivial) {
        await message
          .reply({ content: trivial, allowedMentions: { repliedUser: false } })
          .catch(() => {});
        return;
      }
    }

    // ── Indicateur de frappe minimal (non-bloquant) ──
    if (message.channel.isTextBased() && "sendTyping" in message.channel) {
      (message.channel as TextChannel).sendTyping().catch(() => {});
    }

    // ── Pré-traitement en arrière-plan (non-bloquant) ──
    touchConversation(message.author.id);
    void addMessageToConversation(
      message.author.id,
      "user",
      effectiveContent,
      message.guildId || undefined,
    ).catch(() => {});

    if (imageAttachments.length > 0 || embedImageUrls.length > 0) {
      logger.info(
        `[AIChat] Images detected: ${imageAttachments.length} attachments + ${embedImageUrls.length} embeds — Gemini available: ${isGeminiAvailable()}`,
      );

      // Always pass image URLs to the agent so it can use analyzeImageGemini tool as fallback
      imageUrls = [
        ...imageAttachments.slice(0, 3).map((a) => a.url),
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
            const description = await analyzeImageWithGemini(img.url, geminiPrompt);
            if (description) {
              enrichedContent += `\n\n[Image jointe: ${img.url}]\nDescription visuelle: ${description}`;
              geminiSuccess = true;
              logger.info(
                `[AIChat] Vision auto: image analysée (${description.length} chars, lang=${langDetection.lang}) — question: "${userQuestion.slice(0, 50)}"`,
              );
            }
          } catch (err) {
            logger.error(
              `[AIChat] Vision auto échouée: ${err instanceof Error ? err.message : String(err)}`,
            );
          }
        }

        // Also analyze embed images (URLs posted by user that Discord auto-embeds)
        for (const imgUrl of embedImageUrls.slice(0, 2)) {
          try {
            const description = await analyzeImageWithGemini(imgUrl, geminiPrompt);
            if (description) {
              enrichedContent += `\n\n[Image jointe: ${imgUrl}]\nDescription visuelle: ${description}`;
              geminiSuccess = true;
              logger.info(
                `[AIChat] Vision auto (embed): image analysée (${description.length} chars)`,
              );
            }
          } catch (err) {
            logger.error(
              `[AIChat] Vision auto (embed) échouée: ${err instanceof Error ? err.message : String(err)}`,
            );
          }
        }

        // If Gemini failed (e.g. 403), still pass URLs to agent so it can try analyzeImageGemini tool
        if (!geminiSuccess) {
          logger.warn(`[AIChat] Gemini Vision échoué — passage des URLs à l'agent pour fallback`);
          for (const imgUrl of imageUrls) {
            enrichedContent += `\n\n[Image jointe: ${imgUrl}]\n(La description visuelle automatique a échoué. Utilise l'outil analyzeImageGemini avec imageUrl=${imgUrl} pour analyser cette image.)`;
          }
        }
      } else {
        // Gemini not available — pass image URLs to the agent so it can use analyzeImageGemini tool
        for (const imgUrl of imageUrls) {
          enrichedContent += `\n\n[Image jointe: ${imgUrl}]\n(Utilise l'outil analyzeImageGemini avec imageUrl=${imgUrl} pour analyser cette image.)`;
        }
        logger.info(
          `[AIChat] ${imageUrls.length} image(s) jointe(s) — Gemini non configuré, URLs passées à l'agent`,
        );
      }
    }

    // ── Suivi de conversation pour suggestion de thread (non-bloquant) ──
    const convTracker = trackConversation(message.author.id, message.channel.id);
    if (convTracker.shouldSuggestThread && message.guildId) {
      void suggestThread(message as Message).catch(() => {});
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

    // ── FAST PATH: bavardage court sans vraie question → skip agent loop ──
    // Les questions / tâches (code, cuisine, devoirs, recherche…) passent par l'agent.
    const isComplexOrTool = needsAgentLoop(enrichedContent) || imageUrls.length > 0;
    let skipAgentDueToOutage = false;

    if (!isComplexOrTool) {
      // Chat simple → réponse rapide via le gateway (multi-providers, pas de message d'erreur)
      try {
        const { respondChat } = await import("../services/chatResponder.js");
        const streamMsg = await (message as Message).reply("💭 ...");
        const result = await respondChat(enrichedContent, [], {
          systemPrompt: discordChatPrompt(),
          temperature: getPersonalityTemperature(),
          userId: message.author.id,
          guildId: message.guildId ?? undefined,
          maxTokens: 1500,
          deadlineMs: 15_000,
        });
        const fastText = result.content?.trim() ?? "";
        const fastUsable =
          Boolean(fastText) &&
          result.provider !== "fallback" &&
          !isErrorResponse(fastText) &&
          !isCannedFallback(fastText);
        if (fastUsable) {
          clearPendingQuestion(message.author.id);
          await simulateStreamEdit(streamMsg, fastText);
          logger.info(
            `[AIChat] ⚡ Fast-path réussi via ${result.provider} (${fastText.length} chars, ${result.latencyMs}ms)`,
          );
          return;
        }
        // Total outage: skip the agent loop so recover can give local-llm a fresh budget.
        if (result.provider === "fallback") {
          skipAgentDueToOutage = true;
        }
        // Hallucination ou vide: supprimer le placeholder et continuer vers l'agent loop
        await streamMsg.delete().catch(() => {});
      } catch (fastErr) {
        logger.warn(
          `[AIChat] Fast-path échoué, fallback agent loop: ${fastErr instanceof Error ? fastErr.message : String(fastErr)}`,
        );
      }
    }

    // ── AGENT LOOP : Think → Act → Observe → Respond ──
    // L'IA reçoit les tools, réfléchit, exécute des actions si nécessaire,
    // puis synthétise sa réponse finale.
    let aiResponse = "";
    if (!skipAgentDueToOutage) {
      try {
        aiResponse = await runAgentLoop(
          message as Message,
          enrichedContent,
          (toolName, iter) => {
            void statusIndicator.onToolCall(toolName, iter);
          },
          undefined,
          imageUrls,
        );
      } catch (loopError) {
        logger.warn(
          `[AIChat] AgentLoop échoué, fallback via aiGateway: ${loopError instanceof Error ? loopError.message : String(loopError)}`,
        );
        aiResponse = "";
      }
    } else {
      logger.warn("[AIChat] Providers down on fast-path — skip agent loop, recover immediately");
    }

    // ── Si l'agent loop a échoué ou retourné une erreur, retry multi-provider ──
    if (!aiResponse || isErrorResponse(aiResponse)) {
      logger.warn(`[AIChat] AgentLoop a retourné une erreur ou vide, recovery multi-provider`);
      aiResponse = await recoverChatReply(aiResponse, enrichedContent, {
        systemPrompt: discordChatPrompt(),
        userId: message.author.id,
        guildId: message.guildId ?? undefined,
        maxTokens: 1500,
        deadlineMs: 20_000,
      });
    } else {
      clearPendingQuestion(message.author.id);
    }

    // ── Stocker la réponse dans le cache sémantique (jamais les replis canned) ──
    // Ne pas cacher les réponses génériques du LLM local (qwen2.5:3b)
    if (
      aiResponse &&
      !aiResponse.includes("⚠️") &&
      !isGenericLocalResponse(aiResponse) &&
      !isErrorResponse(aiResponse) &&
      !isCannedFallback(aiResponse)
    ) {
      void setCachedResponse(enrichedContent, aiResponse, message.author.id);
    }

    if (isCannedFallback(aiResponse) || !aiResponse.trim()) {
      await retryInsteadOfGo(message as Message, enrichedContent, statusIndicator);
      return;
    }

    if (aiResponse) {
      // ── Extract and send images as Discord attachments ──
      aiResponse = await sendImagesFromResponse(message.channel as TextChannel, aiResponse);
      if (!aiResponse || aiResponse.trim().length === 0) return;

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

      // ── Réponse vocale automatique: si l'utilisateur est dans un vocal, parler à voix haute ──
      if (message.guildId && message.member?.voice?.channelId) {
        // Détecter la langue depuis le message de l'utilisateur
        const detectedLang =
          userLang === "fr" ? "fr" : userLang === "en" ? "en" : (userLang as string);
        // Utiliser la file d'attente TTS pour parler
        const voiceChannel = message.member.voice.channel;
        if (voiceChannel) {
          enqueueTTS(message.guildId, {
            text: aiResponse.slice(0, 3000), // limiter pour TTS
            lang: detectedLang,
            voiceGender: "homme",
            voiceChannelId: voiceChannel.id,
            guildId: message.guildId,
            adapterCreator: message.guild!.voiceAdapterCreator,
            shouldStay: false,
            authorTag: `${message.author.tag} (IA auto)`,
            channelName: voiceChannel.name,
          });
          logger.info(
            `[AIChat] Réponse vocale auto pour ${message.author.tag} dans #${voiceChannel.name}`,
          );
        }
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
      void extractAndSaveMemory(
        message.author.id,
        effectiveContent,
        aiResponse,
        message.author.username,
      ).catch(() => {});

      // ── Sauvegarder la Q&A dans Obsidian (mémoire long-terme par tiroirs) ──
      void saveQA(effectiveContent, aiResponse).catch(() => {});

      // ── Nettoyer l'indicateur de statut ──
      void statusIndicator.cleanup();

      logger.info(`[AIChat] Agent IA -> ${message.author.tag}`);
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
      // Dernier recours: tenter une vraie réponse via le responder garanti
      // plutôt que d'afficher un message d'erreur statique.
      try {
        const { respondChat } = await import("../services/chatResponder.js");
        const rescue = await respondChat(message.content, [], {
          userId: message.author.id,
          guildId: message.guildId ?? undefined,
          maxTokens: 400,
          deadlineMs: 12_000,
        });
        if (rescue.content && rescue.provider !== "fallback") {
          await message.reply({
            content: rescue.content.slice(0, 1900),
            allowedMentions: { repliedUser: false },
          });
          return;
        }
      } catch {
        // continue vers le message statique
      }
      const errMsg = error instanceof Error ? error.message : String(error);
      const isOverload = /429|rate.limit|overload|timeout|503/i.test(errMsg);
      const errorFallbackMsgs: Record<string, { overload: string; error: string }> = {
        fr: {
          overload: "Les canaux sont saturés. Réessaie dans quelques secondes.",
          error: "Petit souci de transmission. Réessaie dans un instant.",
        },
        en: {
          overload: "Channels are saturated. Try again in a few seconds.",
          error: "Transmission glitch. Try again in a moment.",
        },
        de: {
          overload:
            "🦅 *Rauschen* — Orbitalrelais überlastet. Versuche es in ein paar Sekunden erneut, Soldat.",
          error:
            "🦅 *Rauschen* — Übertragungsproblem. HQ wurde benachrichtigt. Versuche es erneut.",
        },
        es: {
          overload: "🦅 *Estática* — Relé orbital saturado. Inténtalo en unos segundos, soldado.",
          error:
            "🦅 *Estática* — Problema de transmisión. El CG ha sido notificado. Inténtalo de nuevo.",
        },
        pt: {
          overload:
            "🦅 *Estática* — Relé orbital saturado. Tente novamente em alguns segundos, soldado.",
          error: "🦅 *Estática* — Problema de transmissão. O QG foi notificado. Tente novamente.",
        },
        it: {
          overload:
            "🦅 *Statico* — Ripetitore orbitale saturo. Riprova tra qualche secondo, soldato.",
          error: "🦅 *Statico* — Problema di trasmissione. Il QG è stato avvisato. Riprova.",
        },
        nl: {
          overload:
            "🦅 *Storing* — Orbitale relay verzadigd. Probeer over een paar seconden opnieuw, soldaat.",
          error: "🦅 *Storing* — Transmissieprobleem. HQ is op de hoogte. Probeer opnieuw.",
        },
        ru: {
          overload:
            "🦅 *Помехи* — Орбитальный реле перегружен. Попробуйте через несколько секунд, солдат.",
          error: "🦅 *Помехи* — Проблема передачи. Штаб уведомлён. Попробуйте снова.",
        },
        ja: {
          overload: "🦅 *ザザッ* — 軌道リレーが飽和しています。数秒後に再試行してください、兵士。",
          error: "🦅 *ザザッ* — 通信障害。司令部に通知されました。再試行してください。",
        },
        zh: {
          overload: "🦅 *滋滋* — 轨道中继饱和。几秒钟后重试，士兵。",
          error: "🦅 *滋滋* — 传输问题。总部已通知。请重试。",
        },
        ar: {
          overload:
            "🦅 *تشويش* — المرحلة المدارية مشبعة. حاول مرة أخرى بعد بضع ثوانٍ، أيها الجندي.",
          error: "🦅 *تشويش* — مشكلة في الإرسال. تم إبلاغ القيادة. حاول مرة أخرى.",
        },
        ko: {
          overload: "🦅 *지직* — 궤도 중계기 포화. 몇 초 후에 다시 시도하세요, 병사.",
          error: "🦅 *지직* — 전송 문제. 본부에 통보되었습니다. 다시 시도하세요.",
        },
        tr: {
          overload: "🦅 *Cızırtı* — Yörüngsel röle doygun. Birkaç saniye sonra tekrar dene, asker.",
          error: "🦅 *Cızırtı* — İletişim sorunu. Karargah bilgilendirildi. Tekrar dene.",
        },
        sv: {
          overload: "🦅 *Brus* — Omloppsrelä mättat. Försök om några sekunder, soldat.",
          error: "🦅 *Brus* — Överföringsproblem. HQ har underrättats. Försök igen.",
        },
        pl: {
          overload:
            "🦅 *Szum* — Przekaźnik orbitalny nasycony. Spróbuj za kilka sekund, żołnierzu.",
          error: "🦅 *Szum* — Problem z transmisją. Kwatera główna powiadomiona. Spróbuj ponownie.",
        },
        cs: {
          overload: "🦅 *Šum* — Orbitální relé nasyceno. Zkuste to za pár sekund, vojáku.",
          error: "🦅 *Šum* — Problém s přenosem. Velitelství bylo informováno. Zkuste to znovu.",
        },
        no: {
          overload: "🦅 *Støy* — Bane-relé mettet. Prøv igjen om noen sekunder, soldat.",
          error: "🦅 *Støy* — Overføringsproblem. HQ er varslet. Prøv igjen.",
        },
      };
      const fbLang = userLang || "fr";
      const fbMsgs = errorFallbackMsgs[fbLang] || errorFallbackMsgs.fr;
      const userMsg = isOverload ? fbMsgs.overload : fbMsgs.error;
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
    const contentRaw = message.content.trim();
    const hasDmAttachments = [...message.attachments.values()].some(isMediaAttachment);
    const content = resolveIncomingQuestion(message.author.id, contentRaw, hasDmAttachments);
    if (content && content !== contentRaw) {
      logger.info(`[DM] Retry cue — replaying last unanswered question`);
    }
    if (!content && !hasDmAttachments) return;
    const effectiveDmContent = content || "Analyse cette image et dis-moi ce que tu vois.";

    // ── Rate limiting géré par runAgentLoop (cooldown 3s par user) ──

    // Les DMs peuvent être traités par Ollama ou les providers disponibles
    // sans rendre OpenRouter obligatoire.

    // ── Vision auto: analyser les images jointes en DM aussi ──
    let dmEnrichedContent = effectiveDmContent;
    const dmImageAttachments = [...message.attachments.values()].filter(isImageAttachment);
    let dmImageUrls: string[] = [];

    // Also check embeds for image URLs in DM
    const dmEmbedImageUrls: string[] = [];
    for (const embed of message.embeds) {
      if (embed.image?.url) dmEmbedImageUrls.push(embed.image.url);
      if (embed.thumbnail?.url) dmEmbedImageUrls.push(embed.thumbnail.url);
    }

    // ── CACHE DÉSACTIVÉ — le bot doit réfléchir à chaque message ──

    // ── Trivial fast path (DM) ──
    if (dmImageAttachments.length === 0 && dmEmbedImageUrls.length === 0) {
      const { getTrivialResponse } = await import("../services/trivialFastPath.js");
      const trivial = getTrivialResponse(effectiveDmContent, message.author.id);
      if (trivial) {
        await message
          .reply({ content: trivial, allowedMentions: { repliedUser: false } })
          .catch(() => {});
        return;
      }
    }

    // ── Indicateur de frappe minimal (non-bloquant) ──
    if (message.channel.isTextBased() && "sendTyping" in message.channel) {
      (message.channel as TextChannel).sendTyping().catch(() => {});
    }

    if (dmImageAttachments.length > 0 || dmEmbedImageUrls.length > 0) {
      dmImageUrls = [
        ...dmImageAttachments.slice(0, 3).map((a) => a.url),
        ...dmEmbedImageUrls.slice(0, 2),
      ];

      if (isGeminiAvailable()) {
        const dmUserQuestion = content.trim();
        const dmLangDetection = detectLanguage(dmUserQuestion || effectiveDmContent);
        const dmGeminiPrompt = buildGeminiVisionPrompt(dmUserQuestion, dmLangDetection.lang);

        let dmGeminiSuccess = false;
        for (const img of dmImageAttachments.slice(0, 3)) {
          try {
            const description = await analyzeImageWithGemini(img.url, dmGeminiPrompt);
            if (description) {
              dmEnrichedContent += `\n\n[Image jointe: ${img.url}]\nDescription visuelle: ${description}`;
              dmGeminiSuccess = true;
              logger.info(
                `[DM] Vision auto: image analysée (${description.length} chars, lang=${dmLangDetection.lang}) — question: "${dmUserQuestion.slice(0, 50)}"`,
              );
            }
          } catch (err) {
            logger.error(
              `[DM] Vision auto échouée: ${err instanceof Error ? err.message : String(err)}`,
            );
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
            logger.error(
              `[DM] Vision auto (embed) échouée: ${err instanceof Error ? err.message : String(err)}`,
            );
          }
        }

        if (!dmGeminiSuccess) {
          logger.warn(`[DM] Gemini Vision échoué — passage des URLs à l'agent pour fallback`);
          for (const imgUrl of dmImageUrls) {
            dmEnrichedContent += `\n\n[Image jointe: ${imgUrl}]\n(La description visuelle automatique a échoué. Utilise l'outil analyzeImageGemini avec imageUrl=${imgUrl} pour analyser cette image.)`;
          }
        }
      } else {
        // Gemini not available — pass image URLs to the agent
        for (const imgUrl of dmImageUrls) {
          dmEnrichedContent += `\n\n[Image jointe: ${imgUrl}]\n(Utilise l'outil analyzeImageGemini avec imageUrl=${imgUrl} pour analyser cette image.)`;
        }
        logger.info(
          `[DM] ${dmImageUrls.length} image(s) jointe(s) — Gemini non configuré, URLs passées à l'agent`,
        );
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
      aiResponse = await runAgentLoop(
        message as Message,
        dmEnrichedContent,
        (toolName, iter) => {
          void dmStatusIndicator.onToolCall(toolName, iter);
        },
        undefined,
        dmImageUrls,
      );
    } catch (loopError) {
      logger.warn(
        `[DM] AgentLoop échoué, fallback via aiGateway: ${loopError instanceof Error ? loopError.message : String(loopError)}`,
      );
      aiResponse = "";
    }

    // ── Si l'agent loop a échoué ou retourné une erreur, retry multi-provider ──
    if (!aiResponse || isErrorResponse(aiResponse)) {
      logger.warn(`[DM] AgentLoop a retourné une erreur ou vide, recovery multi-provider`);
      aiResponse = await recoverChatReply(aiResponse, dmEnrichedContent, {
        systemPrompt: discordChatPrompt(),
        userId: message.author.id,
        guildId: message.guildId ?? undefined,
        maxTokens: 1500,
        deadlineMs: 20_000,
      });
    } else {
      clearPendingQuestion(message.author.id);
    }

    // ── Stocker la réponse dans le cache sémantique (jamais les replis canned) ──
    if (
      aiResponse &&
      !aiResponse.includes("⚠️") &&
      !isErrorResponse(aiResponse) &&
      !isCannedFallback(aiResponse)
    ) {
      void setCachedResponse(dmEnrichedContent, aiResponse, message.author.id);
    }

    if (isCannedFallback(aiResponse) || !aiResponse.trim()) {
      await retryInsteadOfGo(message as Message, dmEnrichedContent, dmStatusIndicator);
      return;
    }

    if (aiResponse) {
      // ── Extract and send images as Discord attachments ──
      aiResponse = await sendImagesFromResponse(message.channel as TextChannel, aiResponse);
      if (!aiResponse || aiResponse.trim().length === 0) return;

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
      const dmVoiceKeywords =
        /(?:en vocal|à voix haute|à voix|dis-le moi|parle-moi|parle le|parle sa|parle ça|speak it|say it|voice response|read it aloud|tts|tds|en voix|lis-le|lis le|lis sa|lis ça|lie sa|lie ça|lie le|récite|récite le|à l'oral|dit le|dit sa|dit ça|read it|say it out|dans le vocal|dans la voix)/i;
      if (message.guildId && message.member?.voice?.channelId && dmVoiceKeywords.test(content)) {
        const detectedLang = content.match(/[àâçéèêëîïôûùüÿœæ]/i) ? "fr" : "en";
        if (!isInVoiceChannel(message.guildId)) {
          await joinVoiceChannelById(
            message.client,
            message.guildId,
            message.member.voice.channelId,
          ).catch(() => {});
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
      void extractAndSaveMemory(
        message.author.id,
        effectiveDmContent,
        aiResponse,
        message.author.username,
      ).catch(() => {});

      // ── Sauvegarder la Q&A dans Obsidian (mémoire long-terme par tiroirs) ──
      void saveQA(effectiveDmContent, aiResponse).catch(() => {});

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
      // Dernier recours: vraie réponse via le responder garanti
      try {
        const { respondChat } = await import("../services/chatResponder.js");
        const rescue = await respondChat(message.content, [], {
          userId: message.author.id,
          maxTokens: 400,
          deadlineMs: 12_000,
        });
        if (rescue.content && rescue.provider !== "fallback") {
          await message.reply({
            content: rescue.content.slice(0, 1900),
            allowedMentions: { repliedUser: false },
          });
          return;
        }
      } catch {
        // continue vers le message statique
      }
      const errMsg = error instanceof Error ? error.message : String(error);
      const isOverload = /429|rate.limit|overload|timeout|503/i.test(errMsg);
      const userMsg = isOverload
        ? "Les canaux sont saturés. Réessaie dans quelques secondes."
        : "Petit souci de transmission. Réessaie dans un instant.";
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
      const perspectiveResult = await analyzePerspectiveToxicity(message.content).catch(
        (): null => null,
      );
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
          setTimeout((): void => {
            void pAlert.delete().catch((): void => {});
          }, 8000);
          if (perspectiveResult.recommendedAction === "timeout" && member.moderatable) {
            await member.timeout(
              5 * 60 * 1000,
              `Perspective API: toxicité ${perspectiveResult.overallScore}`,
            );
          }
          await recordSecurityEvent(message.author.id, message.guild.id, "AI_MODERATION").catch(
            (): void => {},
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
          } catch (_) {
            logger.error("[Silent catch]", _);
          }
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
