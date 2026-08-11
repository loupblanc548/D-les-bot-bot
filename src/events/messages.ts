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
import { analyzeImageWithGemini, chatWithGemini, isGeminiAvailable } from "../services/gemini.js";
import {
  isLocalLlmAvailable,
  chatWithLocalLlm,
  checkLocalLlmAvailability,
} from "../services/localLlm.js";
import { isNvidiaNimAvailable, chatWithNvidiaNim } from "../services/nvidiaNim.js";
import { isGroqAvailable, chatWithGroq } from "../services/groq.js";
import { sendImagesFromResponse } from "../utils/imageSender.js";
import { getCachedResponse, setCachedResponse } from "../utils/aiResponseCache.js";
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
import { getNextAvailableModel } from "../services/modelRotation.js";

// ─── Constantes ──────────────────────────────────────────────────────────────

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
    "🫡 **John Helldiver** à l'écoute, soldat ! Ta mission ? Pose ta question, je suis prêt à déployer la puissance de la Super-Terre pour toi !",
    "🎖️ Soldat ! Tu m'as appelé ? La démocratie a besoin de savoir ce que tu veux — balance ta question !",
    "🦅 **Présent pour la Super-Terre !** Dis-moi tout, camarade. Traduction, info gaming, soutien tactique… je gère !",
    "💪 **John Helldiver en renfort !** Pas de question = pas de victoire, soldat. Qu'est-ce que je peux faire pour toi ?",
  ],
  en: [
    "🫡 **John Helldiver** reporting in, soldier! What's your mission? Ask your question, I'm ready to deploy Super Earth's firepower for you!",
    "🎖️ Soldier! You called? Democracy needs to know what you want — drop your question!",
    "🦅 **Present for Super Earth!** Tell me everything, comrade. Translation, gaming intel, tactical support… I've got it!",
    "💪 **John Helldiver reinforcements!** No question = no victory, soldier. What can I do for you?",
  ],
  de: [
    "🫡 **John Helldiver** hört zu, Soldat! Was ist deine Mission? Stell deine Frage, ich bin bereit, die Macht von Super-Erde für dich einzusetzen!",
    "🎖️ Soldat! Du hast gerufen? Die Demokratie muss wissen, was du willst — stell deine Frage!",
    "🦅 **Für Super-Erde bereit!** Sag mir alles, Kamerad. Übersetzung, Gaming-Infos, taktische Unterstützung… ich mach das!",
    "💪 **John Helldiver als Verstärkung!** Keine Frage = kein Sieg, Soldat. Was kann ich für dich tun?",
  ],
  es: [
    "🫡 **John Helldiver** al habla, ¡soldado! ¿Cuál es tu misión? Haz tu pregunta, ¡estoy listo para desplegar el poder de la Super-Tierra para ti!",
    "🎖️ ¡Soldado! ¿Me llamaste? La democracia necesita saber qué quieres — ¡suelta tu pregunta!",
    "🦅 **¡Presente para la Super-Tierra!** Dímelo todo, camarada. Traducción, info de gaming, apoyo táctico… ¡yo lo manejo!",
    "💪 **¡John Helldiver de refuerzo!** Sin pregunta = sin victoria, soldado. ¿Qué puedo hacer por ti?",
  ],
  pt: [
    "🫡 **John Helldiver** à escuta, soldado! Qual é a sua missão? Faça sua pergunta, estou pronto para implantar o poder da Super-Terra para você!",
    "🎖️ Soldado! Você me chamou? A democracia precisa saber o que você quer — faça sua pergunta!",
    "🦅 **Presente para a Super-Terra!** Diga tudo, camarada. Tradução, info de gaming, suporte tático… eu cuido disso!",
    "💪 **John Helldiver como reforço!** Sem pergunta = sem vitória, soldado. O que posso fazer por você?",
  ],
  it: [
    "🫡 **John Helldiver** in ascolto, soldato! Qual è la tua missione? Fai la tua domanda, sono pronto a schierare la potenza della Super-Terra per te!",
    "🎖️ Soldato! Mi hai chiamato? La democrazia ha bisogno di sapere cosa vuoi — fai la tua domanda!",
    "🦅 **Presente per la Super-Terra!** Dimmi tutto, compagno. Traduzione, info gaming, supporto tattico… ci penso io!",
    "💪 **John Helldiver come rinforzo!** Nessuna domanda = nessuna vittoria, soldato. Cosa posso fare per te?",
  ],
  nl: [
    "🫡 **John Helldiver** luistert, soldaat! Wat is je missie? Stel je vraag, ik ben klaar om de kracht van Super-Earde voor je in te zetten!",
    "🎖️ Soldaat! Je riep me? De democratie moet weten wat je wilt — stel je vraag!",
    "🦅 **Present voor Super-Earde!** Vertel me alles, kameraad. Vertaling, gaming-info, tactische steun… ik regel het!",
    "💪 **John Helldiver als versterking!** Geen vraag = geen overwinning, soldaat. Wat kan ik voor je doen?",
  ],
  sv: [
    "🫡 **John Helldiver** lyssnar, soldat! Vad är ditt uppdrag? Ställ din fråga, jag är redo att utplacera Super-Jordens kraft för dig!",
    "🎖️ Soldat! Kallade du på mig? Demokratin behöver veta vad du vill — ställ din fråga!",
    "🦅 **Redo för Super-Jorden!** Berätta allt, kamrat. Översättning, gaming-info, taktiskt stöd… jag fixar det!",
    "💪 **John Helldiver som förstärkning!** Ingen fråga = ingen seger, soldat. Vad kan jag göra för dig?",
  ],
  no: [
    "🫡 **John Helldiver** lytter, soldat! Hva er ditt oppdrag? Still ditt spørsmål, jeg er klar til å distribuere Super-Jordens kraft for deg!",
    "🎖️ Soldat! Kalte du meg? Demokratiet trenger å vite hva du vil — still ditt spørsmål!",
    "🦅 **Til stede for Super-Jorden!** Fortell meg alt, kamerat. Oversettelse, gaming-info, taktisk støtte… jeg fikser det!",
    "💪 **John Helldiver som forsterkning!** Ingen spørsmål = ingen seier, soldat. Hva kan jeg gjøre for deg?",
  ],
  cs: [
    "🫡 **John Helldiver** naslouchá, vojáku! Jaká je tvá mise? Polož svou otázku, jsem připraven nasadit sílu Super-Země pro tebe!",
    "🎖️ Vojáku! Volal jsi mě? Demokracie potřebuje vědět, co chceš — polož svou otázku!",
    "🦅 **Přítomen pro Super-Zemi!** Řekni mi všechno, soudruhu. Překlad, herní info, taktická podpora… to zvládnu!",
    "💪 **John Helldiver jako posila!** Žádná otázka = žádné vítězství, vojáku. Co mohu pro tebe udělat?",
  ],
  pl: [
    "🫡 **John Helldiver** słucha, żołnierzu! Jaka jest twoja misja? Zadaj pytanie, jestem gotów do rozmieszczenia sił Super-Ziemi dla ciebie!",
    "🎖️ Żołnierzu! Wzywałeś mnie? Demokracja musi wiedzieć, czego chcesz — zadaj pytanie!",
    "🦅 **Gotów dla Super-Ziemi!** Powiedz mi wszystko, towarzyszu. Tłumaczenie, info gamingowe, wsparcie taktyczne… zajmę się tym!",
    "💪 **John Helldiver jako wsparcie!** Brak pytania = brak zwycięstwa, żołnierzu. Co mogę dla ciebie zrobić?",
  ],
  tr: [
    "🫡 **John Helldiver** dinliyor, asker! Görevin ne? Sorunu sor, Süper Dünya'nın gücünü senin için kullanmaya hazırım!",
    "🎖️ Asker! Beni mi çağırdın? Demokrasi ne istediğini bilmeli — sorunu sor!",
    "🦅 **Süper Dünya için hazırım!** Bana her şeyi anlat, yoldaş. Çeviri, oyun bilgisi, taktik destek… ben hallederim!",
    "💪 **John Helldiver takviye olarak!** Soru yok = zafer yok, asker. Senin için ne yapabilirim?",
  ],
  ru: [
    "🫡 **Джон Хеллдайвер** на связи, солдат! Какова твоя миссия? Задавай вопрос, я готов применить мощь Супер-Земли для тебя!",
    "🎖️ Солдат! Ты звал меня? Демократии нужно знать, чего ты хочешь — задавай вопрос!",
    "🦅 **Готов служить Супер-Земле!** Расскажи мне всё, товарищ. Перевод, игровая информация, тактическая поддержка… я всё улажу!",
    "💪 **Джон Хеллдайвер в качестве подкрепления!** Нет вопроса = нет победы, солдат. Что я могу для тебя сделать?",
  ],
  ja: [
    "🫡 **ジョン・ヘルダイバー**が聞いています、兵士！ミッションは何ですか？質問してください、スーパーアースの力をあなたのために展開する準備ができています！",
    "🎖️ 兵士！呼びましたか？民主主義はあなたが何を望んでいるかを知る必要があります — 質問してください！",
    "🦅 **スーパーアースのために！** 全部教えてください、同志。翻訳、ゲーム情報、戦術サポート…私がやります！",
    "💪 **ジョン・ヘルダイバーが増援として！** 質問なし＝勝利なし、兵士。何ができますか？",
  ],
  zh: [
    "🫡 **约翰·地狱潜者**在听，士兵！你的任务是什么？提问吧，我准备为你部署超级地球的力量！",
    "🎖️ 士兵！你叫我？民主需要知道你想要什么 — 提问吧！",
    "🦅 **为超级地球效劳！** 告诉我一切，同志。翻译、游戏信息、战术支援…我来处理！",
    "💪 **约翰·地狱潜者作为增援！** 没问题 = 没胜利，士兵。我能为你做什么？",
  ],
  ar: [
    "🫡 **جون هيلدايفر** يستمع، أيها الجندي! ما مهمتك؟ اطرح سؤالك، أنا مستعد لنشر قوة الأرض العظمى من أجلك!",
    "🎖️ أيها الجندي! هل ناديتني؟ الديمقراطية بحاجة لمعرفة ما تريد — اطرح سؤالك!",
    "🦅 **حاضر من أجل الأرض العظمى!** أخبرني بكل شيء، يا رفيق. ترجمة، معلومات الألعاب، دعم تكتيكي… أنا أتولى الأمر!",
    "💪 **جون هيلدايفر كتعزيزات!** لا سؤال = لا نصر، أيها الجندي. ماذا يمكنني أن أفعل لك؟",
  ],
  ko: [
    "🫡 **존 헬다이버**가 듣고 있습니다, 병사! 임무가 무엇입니까? 질문하세요, 슈퍼어스의 힘을 당신을 위해 배치할 준비가 되어 있습니다!",
    "🎖️ 병사! 나를 불렀나요? 민주주의는 당신이 원하는 것을 알아야 합니다 — 질문하세요!",
    "🦅 **슈퍼어스를 위해!** 모든 것을 말해주세요, 동지. 번역, 게임 정보, 전술 지원… 제가 처리합니다!",
    "💪 **존 헬다이버가 증원으로!** 질문 없음 = 승리 없음, 병사. 무엇을 도와드릴까요?",
  ],
};

function getRandomHelldiverReply(lang: SupportedLang = "fr"): string {
  const replies = HELPDIVER_EMPTY_MENTION_REPLIES[lang] || HELPDIVER_EMPTY_MENTION_REPLIES.fr;
  return replies[Math.floor(Math.random() * replies.length)];
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
        // ── Exception: le bot peut se mentionner lui-même dans le salon
        //    d'alertes revendeurs pour déclencher Quent (via /track-retailer) ──
        const isRetailerChannel = message.channelId === "1532189747500421152";
        const isSelfMention = message.mentions.has(client.user!);
        if (isRetailerChannel && isSelfMention) {
          // Traiter comme une mention normale → handleAiChatMention
          await handleAiChatMention(message, client);
          return;
        }
        return;
      }

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

      // ── BRANCHEMENT 0 : @bot parle texte:"..." → TTS vocal ───────────
      if (isMentioningBot) {
        const handled = await handleVoiceCommand(message, client);
        if (handled) return;
      }

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
  } catch {}

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
  adapterCreator: unknown;
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
  } catch {}

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
  } catch {}

  // 3. Microsoft Edge TTS (voix neuronales Azure gratuites)
  try {
    const edgeBuffer = await generateEdgeTTS(text.slice(0, 3000), lang, voiceGender);
    if (edgeBuffer && edgeBuffer.length > 1000) {
      logger.info(`[VoiceCmd] TTS via Microsoft Edge TTS (neural, lang: ${lang})`);
      return edgeBuffer;
    }
  } catch {}

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
  } catch {}

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
      } catch {}
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

async function handleAiChatMention(
  message: OmitPartialGroupDMChannel<Message<boolean>>,
  client: Client,
): Promise<void> {
  const statusIndicator = new AgentStatusIndicator(message.channel as TextChannel);
  let userLang: SupportedLang = "fr";
  try {
    // Nettoyer le message : retirer la mention du bot
    const cleanedContent = message.content
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
      const langDetection = detectLanguage(message.content || "");
      await message.reply({
        content: getRandomHelldiverReply(langDetection.lang),
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

    // ── Détection de langue pour réponse multilingue ──
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

    // ── Récupérer le message auquel on répond (reply/rebase context) ──
    // Note: embedImageUrls declared here so reply context can add referenced images
    const embedImageUrls: string[] = [];
    let replyContext = "";
    if (message.reference?.messageId) {
      try {
        const referencedMsg = await message.channel.messages
          .fetch(message.reference.messageId)
          .catch(() => null);
        if (referencedMsg) {
          const refAuthor = referencedMsg.author?.username || "Unknown";
          const refContent = referencedMsg.content?.trim() || "";
          const refAttachments = [...referencedMsg.attachments.values()];
          const refEmbeds = referencedMsg.embeds;

          if (refContent) {
            replyContext = `[REPLY CONTEXT] The user is replying to a message from ${refAuthor}:\n"${refContent.slice(0, 1000)}"\nUse this context to understand what they're referring to.`;
            logger.info(`[AIChat] Reply context: replying to ${refAuthor} (${refContent.length} chars)`);
          }

          // Also include referenced message images for vision analysis
          if (refAttachments.length > 0) {
            const refImageUrls = refAttachments.filter(isImageAttachment).map((a) => a.url);
            if (refImageUrls.length > 0) {
              replyContext += `\n[Referenced message has ${refImageUrls.length} image(s): ${refImageUrls.join(", ")}]`;
              // Add to image processing pipeline
              for (const url of refImageUrls.slice(0, 2)) {
                if (!embedImageUrls.includes(url)) embedImageUrls.push(url);
              }
            }
          }

          // Include embed info from referenced message
          for (const embed of refEmbeds) {
            if (embed.image?.url && !embedImageUrls.includes(embed.image.url)) {
              embedImageUrls.push(embed.image.url);
            }
            if (embed.thumbnail?.url && !embedImageUrls.includes(embed.thumbnail.url)) {
              embedImageUrls.push(embed.thumbnail.url);
            }
          }
        }
      } catch (err) {
        logger.debug(`[AIChat] Could not fetch referenced message: ${err}`);
      }
    }

    // ── Récupérer les rôles/rangs du serveur pour le contexte ──
    let rolesContext = "";
    if (message.guild) {
      try {
        // User's own roles
        const member = await message.guild.members.fetch(message.author.id).catch(() => null);
        const userRoles = member?.roles.cache
          .filter((r) => r.name !== "@everyone")
          .map((r) => r.name)
          .join(", ") || "";

        // All server roles (top 20)
        const roles = message.guild.roles.cache
          .sorted((a, b) => b.position - a.position)
          .filter((r) => r.name !== "@everyone")
          .slice(0, 20)
          .map((r) => `${r.name} (id:${r.id}, members:${r.members.size})`)
          .join("\n");
        if (roles) {
          rolesContext = `[SERVER ROLES] Available roles on this server:\n${roles}`;
          if (userRoles) {
            rolesContext += `\n\n[USER ROLES] ${message.author.username} has these roles: ${userRoles}`;
          }
          rolesContext += `\nThe user may ask about these roles. You can interact with them using the available tools (getServerRoles, addRole, removeRole).`;
        }
      } catch {
        // Roles not available — skip
      }
    }

    // ── Construire le contenu enrichi avec tous les contextes ──
    let enrichedContent = `${langInstruction}`;
    if (replyContext) enrichedContent += `\n\n${replyContext}`;
    if (rolesContext) enrichedContent += `\n\n${rolesContext}`;
    enrichedContent += `\n\n${effectiveContent}`;
    const imageAttachments = [...message.attachments.values()].filter(isImageAttachment);

    // Also check embeds for image URLs (when user posts a direct image link)
    // embedImageUrls was declared earlier (before reply context block)
    for (const embed of message.embeds) {
      if (embed.image?.url) embedImageUrls.push(embed.image.url);
      if (embed.thumbnail?.url) embedImageUrls.push(embed.thumbnail.url);
    }

    if (imageAttachments.length > 0 || embedImageUrls.length > 0) {
      logger.info(
        `[AIChat] Images detected: ${imageAttachments.length} attachments + ${embedImageUrls.length} embeds — Gemini available: ${isGeminiAvailable()}`,
      );

      // Always pass image URLs to the agent so it can use analyzeImageGemini tool as fallback
      const allImageUrls = [
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
          for (const imgUrl of allImageUrls) {
            enrichedContent += `\n\n[Image jointe: ${imgUrl}]\n(La description visuelle automatique a échoué. Utilise l'outil analyzeImageGemini avec imageUrl=${imgUrl} pour analyser cette image.)`;
          }
        }
      } else {
        // Gemini not available — pass image URLs to the agent so it can use analyzeImageGemini tool
        for (const imgUrl of allImageUrls) {
          enrichedContent += `\n\n[Image jointe: ${imgUrl}]\n(Utilise l'outil analyzeImageGemini avec imageUrl=${imgUrl} pour analyser cette image.)`;
        }
        logger.info(
          `[AIChat] ${allImageUrls.length} image(s) jointe(s) — Gemini non configuré, URLs passées à l'agent`,
        );
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

    // ── Cache sémantique: vérifier si on a déjà une réponse récente ──
    const cached = getCachedResponse(enrichedContent, message.author.id, "guild");
    if (cached) {
      logger.info(`[AIChat] Cache hit — réponse instantanée (skip API)`);
      void statusIndicator.cleanup();
      if (cached.length <= 1900) {
        await message
          .reply({ content: cached, allowedMentions: { repliedUser: false } })
          .catch(() => {});
      } else {
        await message
          .reply({ content: cached.slice(0, 1900), allowedMentions: { repliedUser: false } })
          .catch(() => {});
      }
      return;
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
    const isErrorResponse =
      !aiResponse ||
      aiResponse.includes("Le serveur IA a rencontré un problème") ||
      aiResponse.includes("Problème de communication avec le serveur IA") ||
      aiResponse.includes("Le serveur IA est sous forte charge") ||
      aiResponse.includes("CIRCUIT BREAKER ACTIVATED") ||
      aiResponse.includes("Circuit breaker activated");

    if (isErrorResponse) {
      logger.warn(`[AIChat] AgentLoop a retourné une erreur, fallback en cours`);

      // ── Fallback 1 (priorité absolue): Groq (70B, free, 24/7, ultra-fast) ──
      if (isGroqAvailable()) {
        try {
          const groqReply = await chatWithGroq({
            systemPrompt: config.aiSystemPrompt + "\n\nTu es John Helldiver, réponds en français par défaut, sois concis et naturel.",
            userMessage: enrichedContent,
            maxTokens: 800,
          });
          if (groqReply && groqReply.length > 2) {
            aiResponse = groqReply;
            logger.info(`[AIChat] Fallback Groq réussi (${groqReply.length} chars) — 70B gratuit`);
          }
        } catch (groqErr) {
          logger.error(`[AIChat] Groq fallback échoué: ${groqErr instanceof Error ? groqErr.message : String(groqErr)}`);
        }
      }

      // ── Fallback 2: LLM local (Ollama sur VPS/Colab) — gratuit, pas de quota ──
      if (
        (!aiResponse || aiResponse.includes("Le serveur IA a rencontré un problème") || aiResponse.includes("CIRCUIT BREAKER ACTIVATED")) &&
        isLocalLlmAvailable()
      ) {
        try {
          const localReply = await chatWithLocalLlm([
            {
              role: "system",
              content:
                config.aiSystemPrompt +
                "\n\nTu es John Helldiver, réponds en français par défaut, sois concis et naturel.",
            },
            { role: "user", content: enrichedContent },
          ]);
          if (localReply && localReply.length > 2) {
            aiResponse = localReply;
            logger.info(
              `[AIChat] Fallback LLM local réussi (${localReply.length} chars) — API économisée`,
            );
          }
        } catch (localErr) {
          logger.error(
            `[AIChat] LLM local fallback échoué: ${localErr instanceof Error ? localErr.message : String(localErr)}`,
          );
        }
      }

      // ── Fallback 3: Gemini (free, quota séparé) ──
      if (
        (!aiResponse ||
          aiResponse.includes("Le serveur IA a rencontré un problème") ||
          aiResponse.includes("CIRCUIT BREAKER ACTIVATED")) &&
        isGeminiAvailable()
      ) {
        logger.warn(`[AIChat] Fallback: Gemini`);
        try {
          const geminiReply = await chatWithGemini(
            config.aiSystemPrompt +
              "\n\nTu es John Helldiver, réponds en français par défaut, sois concis et naturel.",
            enrichedContent,
            800,
          );
          if (geminiReply) {
            aiResponse = geminiReply;
            logger.info(`[AIChat] Fallback Gemini réussi`);
          }
        } catch (geminiErr) {
          logger.error(
            `[AIChat] Gemini fallback échoué: ${geminiErr instanceof Error ? geminiErr.message : String(geminiErr)}`,
          );
        }
      }

      // ── Fallback 4: NVIDIA NIM (free, modèles puissants) ──
      if (
        (!aiResponse ||
          aiResponse.includes("Le serveur IA a rencontré un problème") ||
          aiResponse.includes("CIRCUIT BREAKER ACTIVATED")) &&
        isNvidiaNimAvailable()
      ) {
        logger.warn(`[AIChat] Fallback: NVIDIA NIM`);
        try {
          const nvidiaReply = await chatWithNvidiaNim(
            config.aiSystemPrompt +
              "\n\nTu es John Helldiver, réponds en français par défaut, sois concis et naturel.",
            enrichedContent,
            800,
          );
          if (nvidiaReply) {
            aiResponse = nvidiaReply;
            logger.info(`[AIChat] Fallback NVIDIA NIM réussi`);
          }
        } catch (nvidiaErr) {
          logger.error(
            `[AIChat] NVIDIA NIM fallback échoué: ${nvidiaErr instanceof Error ? nvidiaErr.message : String(nvidiaErr)}`,
          );
        }
      }

      // ── Fallback 4 (dernier recours): OpenRouter (API payante) ──
      if (
        !aiResponse ||
        aiResponse.includes("Le serveur IA a rencontré un problème") ||
        aiResponse.includes("CIRCUIT BREAKER ACTIVATED") ||
        aiResponse.includes("Circuit breaker activated")
      ) {
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
          logger.error(
            `[AIChat] Fallback aussi échoué: ${fallbackErr instanceof Error ? fallbackErr.message : String(fallbackErr)}`,
          );
        }
      }
    }

    // ── Si toujours vide ou erreur, message par défaut ──
    if (
      !aiResponse ||
      aiResponse.includes("Le serveur IA a rencontré un problème") ||
      aiResponse.includes("CIRCUIT BREAKER ACTIVATED")
    ) {
      aiResponse =
        "⚠️ Tous les modèles IA sont temporairement indisponibles (quota/cooldown). Réessaie dans 1-2 minutes, soldat.";
    }

    // ── Stocker la réponse dans le cache sémantique ──
    if (aiResponse && !aiResponse.includes("⚠️")) {
      setCachedResponse(enrichedContent, aiResponse, message.author.id);
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
      void extractAndSaveMemory(message.author.id, effectiveContent, aiResponse).catch(() => {});

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
      const errMsg = error instanceof Error ? error.message : String(error);
      const isOverload = /429|rate.limit|overload|timeout|503/i.test(errMsg);
      const errorFallbackMsgs: Record<string, { overload: string; error: string }> = {
        fr: {
          overload:
            "🦅 *Static* — Le relais orbital est saturé. Réessaie dans quelques secondes, soldat.",
          error: "🦅 *Static* — Problème de transmission. Le QG est notifié. Réessaie.",
        },
        en: {
          overload: "🦅 *Static* — Orbital relay saturated. Try again in a few seconds, soldier.",
          error: "🦅 *Static* — Transmission problem. HQ has been notified. Try again.",
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

    // ── Récupérer le message auquel on répond en DM aussi ──
    let dmReplyContext = "";
    if (message.reference?.messageId) {
      try {
        const refMsg = await message.channel.messages
          .fetch(message.reference.messageId)
          .catch(() => null);
        if (refMsg) {
          const refAuthor = refMsg.author?.username || "Unknown";
          const refContent = refMsg.content?.trim() || "";
          if (refContent) {
            dmReplyContext = `[REPLY CONTEXT] The user is replying to a message from ${refAuthor}:\n"${refContent.slice(0, 1000)}"\nUse this context to understand what they're referring to.\n\n`;
            logger.info(`[DM] Reply context: replying to ${refAuthor} (${refContent.length} chars)`);
          }
        }
      } catch {
        // Can't fetch — skip
      }
    }

    // ── Vision auto: analyser les images jointes en DM aussi ──
    let dmEnrichedContent = dmReplyContext + effectiveDmContent;
    const dmImageAttachments = [...message.attachments.values()].filter(isImageAttachment);

    // Also check embeds for image URLs in DM
    const dmEmbedImageUrls: string[] = [];
    for (const embed of message.embeds) {
      if (embed.image?.url) dmEmbedImageUrls.push(embed.image.url);
      if (embed.thumbnail?.url) dmEmbedImageUrls.push(embed.thumbnail.url);
    }

    if (dmImageAttachments.length > 0 || dmEmbedImageUrls.length > 0) {
      const dmAllImageUrls = [
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
          for (const imgUrl of dmAllImageUrls) {
            dmEnrichedContent += `\n\n[Image jointe: ${imgUrl}]\n(La description visuelle automatique a échoué. Utilise l'outil analyzeImageGemini avec imageUrl=${imgUrl} pour analyser cette image.)`;
          }
        }
      } else {
        // Gemini not available — pass image URLs to the agent
        for (const imgUrl of dmAllImageUrls) {
          dmEnrichedContent += `\n\n[Image jointe: ${imgUrl}]\n(Utilise l'outil analyzeImageGemini avec imageUrl=${imgUrl} pour analyser cette image.)`;
        }
        logger.info(
          `[DM] ${dmAllImageUrls.length} image(s) jointe(s) — Gemini non configuré, URLs passées à l'agent`,
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

    // ── Cache sémantique (DM): vérifier si on a déjà une réponse récente ──
    const dmCached = getCachedResponse(dmEnrichedContent, message.author.id, "dm");
    if (dmCached) {
      logger.info(`[DM] Cache hit — réponse instantanée (skip API)`);
      void dmStatusIndicator.cleanup();
      if (dmCached.length <= 1900) {
        await message
          .reply({ content: dmCached, allowedMentions: { repliedUser: false } })
          .catch(() => {});
      } else {
        await message
          .reply({ content: dmCached.slice(0, 1900), allowedMentions: { repliedUser: false } })
          .catch(() => {});
      }
      return;
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
    const dmIsErrorResponse =
      !aiResponse ||
      aiResponse.includes("Le serveur IA a rencontré un problème") ||
      aiResponse.includes("Problème de communication avec le serveur IA") ||
      aiResponse.includes("Le serveur IA est sous forte charge") ||
      aiResponse.includes("CIRCUIT BREAKER ACTIVATED") ||
      aiResponse.includes("Circuit breaker activated");

    if (dmIsErrorResponse) {
      logger.warn(`[DM] AgentLoop a retourné une erreur, fallback en cours`);

      // ── Fallback 1 (priorité absolue): Groq (70B, free, 24/7, ultra-fast) ──
      if (isGroqAvailable()) {
        try {
          const groqReply = await chatWithGroq({
            systemPrompt: config.aiSystemPrompt + "\n\nTu es John Helldiver, réponds en français par défaut, sois concis et naturel.",
            userMessage: dmEnrichedContent,
            maxTokens: 800,
          });
          if (groqReply && groqReply.length > 2) {
            aiResponse = groqReply;
            logger.info(`[DM] Fallback Groq réussi (${groqReply.length} chars) — 70B gratuit`);
          }
        } catch (groqErr) {
          logger.error(`[DM] Groq fallback échoué: ${groqErr instanceof Error ? groqErr.message : String(groqErr)}`);
        }
      }

      // ── Fallback 2: LLM local (Ollama sur VPS/Colab) — gratuit, pas de quota ──
      if (
        (!aiResponse || aiResponse.includes("Le serveur IA a rencontré un problème") || aiResponse.includes("CIRCUIT BREAKER ACTIVATED")) &&
        isLocalLlmAvailable()
      ) {
        try {
          const localReply = await chatWithLocalLlm([
            {
              role: "system",
              content:
                config.aiSystemPrompt +
                "\n\nTu es John Helldiver, réponds en français par défaut, sois concis et naturel.",
            },
            { role: "user", content: dmEnrichedContent },
          ]);
          if (localReply && localReply.length > 2) {
            aiResponse = localReply;
            logger.info(
              `[DM] Fallback LLM local réussi (${localReply.length} chars) — API économisée`,
            );
          }
        } catch (localErr) {
          logger.error(
            `[DM] LLM local fallback échoué: ${localErr instanceof Error ? localErr.message : String(localErr)}`,
          );
        }
      }

      // ── Fallback 3: Gemini (free, quota séparé) ──
      if (
        (!aiResponse ||
          aiResponse.includes("Le serveur IA a rencontré un problème") ||
          aiResponse.includes("CIRCUIT BREAKER ACTIVATED")) &&
        isGeminiAvailable()
      ) {
        logger.warn(`[DM] Fallback: Gemini`);
        try {
          const geminiReply = await chatWithGemini(
            config.aiSystemPrompt +
              "\n\nTu es John Helldiver, réponds en français par défaut, sois concis et naturel.",
            dmEnrichedContent,
            800,
          );
          if (geminiReply) {
            aiResponse = geminiReply;
            logger.info(`[DM] Fallback Gemini réussi`);
          }
        } catch (geminiErr) {
          logger.error(
            `[DM] Gemini fallback échoué: ${geminiErr instanceof Error ? geminiErr.message : String(geminiErr)}`,
          );
        }
      }

      // ── Fallback 4: NVIDIA NIM (free, modèles puissants) ──
      if (
        (!aiResponse ||
          aiResponse.includes("Le serveur IA a rencontré un problème") ||
          aiResponse.includes("CIRCUIT BREAKER ACTIVATED")) &&
        isNvidiaNimAvailable()
      ) {
        logger.warn(`[DM] Fallback: NVIDIA NIM`);
        try {
          const nvidiaReply = await chatWithNvidiaNim(
            config.aiSystemPrompt +
              "\n\nTu es John Helldiver, réponds en français par défaut, sois concis et naturel.",
            dmEnrichedContent,
            800,
          );
          if (nvidiaReply) {
            aiResponse = nvidiaReply;
            logger.info(`[DM] Fallback NVIDIA NIM réussi`);
          }
        } catch (nvidiaErr) {
          logger.error(
            `[DM] NVIDIA NIM fallback échoué: ${nvidiaErr instanceof Error ? nvidiaErr.message : String(nvidiaErr)}`,
          );
        }
      }

      // ── Fallback 4 (dernier recours): OpenRouter (API payante) ──
      if (
        !aiResponse ||
        aiResponse.includes("Le serveur IA a rencontré un problème") ||
        aiResponse.includes("CIRCUIT BREAKER ACTIVATED") ||
        aiResponse.includes("Circuit breaker activated")
      ) {
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
          logger.error(
            `[DM] Fallback aussi échoué: ${fallbackErr instanceof Error ? fallbackErr.message : String(fallbackErr)}`,
          );
        }
      }
    }

    // ── Si toujours vide ou erreur, message par défaut ──
    if (
      !aiResponse ||
      aiResponse.includes("Le serveur IA a rencontré un problème") ||
      aiResponse.includes("CIRCUIT BREAKER ACTIVATED")
    ) {
      aiResponse =
        "⚠️ Tous les modèles IA sont temporairement indisponibles (quota/cooldown). Réessaie dans 1-2 minutes, soldat.";
    }

    // ── Stocker la réponse dans le cache sémantique ──
    if (aiResponse && !aiResponse.includes("⚠️")) {
      setCachedResponse(dmEnrichedContent, aiResponse, message.author.id);
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
