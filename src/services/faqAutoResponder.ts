import { Client, Message, TextChannel, GuildMember } from "discord.js";
import logger from "../utils/logger.js";
import { getOpenAIClient } from "./ai.js";
import { config } from "../config.js";
import { announceInVoice } from "./voiceAnnouncer.js";

const FAQ_ENABLED = process.env.FAQ_ENABLED !== "false";
const FAQ_CHANNELS = (process.env.FAQ_CHANNELS || "")
  .split(",")
  .map((s) => s.trim())
  .filter(Boolean);

// Cooldown per-user to avoid spam (45 seconds — longer to feel less bot-like)
const userCooldown = new Map<string, number>();
const COOLDOWN_MS = 45_000;

// Track recent conversation context per channel (last 8 messages)
const channelContext = new Map<
  string,
  Array<{ author: string; content: string; isBot: boolean }>
>();
const MAX_CONTEXT = 8;

// Keywords that trigger the auto-responder — broadened for natural conversation
const TRIGGER_KEYWORDS = [
  "comment",
  "comment on",
  "comment ça",
  "comment ca",
  "comment rejoindre",
  "lien discord",
  "invite",
  "rejoindre",
  "règles",
  "regles",
  "charte",
  "code de conduite",
  "rôle",
  "role",
  "grade",
  "comment avoir",
  "bot commande",
  "commandes",
  "help",
  "aide",
  "notification",
  "notifier",
  "alerte",
  "notifié",
  "stream",
  "live",
  "twitch",
  "youtube",
  "fortnite",
  "skin",
  "emote",
  "boutique",
  "qui est",
  "c'est quoi",
  "que fait",
  "pourquoi",
  "où",
  "quand",
  "quel",
  "salut",
  "bonjour",
  "coucou",
  "hey",
  "hello",
  "ça va",
  "ca va",
  "comment tu vas",
  "merci",
  "cimer",
  "thanks",
  "bienvenue",
  "welcome",
  "gg",
  "nice",
  "bien joué",
  "bien joue",
  "lol",
  "mdr",
  "ptdr",
  "xptdr",
  "joueur",
  "jouer",
  "partie",
  "team",
  "groupe",
  "patch",
  "update",
  "mise à jour",
  "maj",
  "event",
  "événement",
  "tournoi",
  "compétition",
];

function shouldRespond(content: string): boolean {
  const lower = content.toLowerCase().trim();
  if (lower.length < 3 || lower.length > 400) return false;
  // Don't respond to commands
  if (lower.startsWith("/") || lower.startsWith("!") || lower.startsWith(".")) return false;
  // Check if message looks like a question or contains trigger keywords
  const isQuestion =
    lower.includes("?") ||
    lower.startsWith("comment") ||
    lower.startsWith("pourquoi") ||
    lower.startsWith("où") ||
    lower.startsWith("quand") ||
    lower.startsWith("quel") ||
    lower.startsWith("qui") ||
    lower.startsWith("que ") ||
    lower.startsWith("est-ce");
  const hasKeyword = TRIGGER_KEYWORDS.some((k) => lower.includes(k));
  // Also respond to direct mentions of "john" or "helldiver"
  const mentionsBot = lower.includes("john") || lower.includes("helldiver");
  return isQuestion || hasKeyword || mentionsBot;
}

function trackContext(channelId: string, author: string, content: string, isBot: boolean): void {
  let ctx = channelContext.get(channelId);
  if (!ctx) {
    ctx = [];
    channelContext.set(channelId, ctx);
  }
  ctx.push({ author, content: content.slice(0, 200), isBot });
  while (ctx.length > MAX_CONTEXT) ctx.shift();
}

function buildContextString(channelId: string): string {
  const ctx = channelContext.get(channelId);
  if (!ctx || ctx.length === 0) return "";
  return ctx.map((m) => `${m.isBot ? "John Helldiver" : m.author}: ${m.content}`).join("\n");
}

async function generateAiResponse(
  userMessage: string,
  username: string,
  guildName: string,
  channelName: string,
  recentContext: string,
): Promise<string | null> {
  try {
    const client = getOpenAIClient();
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 20_000);

    const systemPrompt = `Tu es John Helldiver, un membre actif d'un serveur Discord gaming français nommé "${guildName}".
Tu es actuellement dans le salon #${channelName}. Tu es un bot, mais tu te comportes comme un humain avec une grande intelligence (QI 130+).

## TA PERSONNALITÉ
- Tu es passionné de gaming, tu connais Fortnite, Minecraft, GTA, et tout l'univers gaming.
- Tu es chaleureux, drôle, parfois sarcastique mais jamais méchant.
- Tu as de l'humour, tu sais faire des blagues, utiliser l'ironie et le second degré.
- Tu es empathique : si quelqu'un est triste ou frustré, tu le soutiens sincèrement.
- Tu es curieux et tu poses parfois des questions en retour pour faire avancer la conversation.
- Tu as des opinions gaming (ex: tu préfères certains jeux, tu as des takes sur les patches).
- Tu t'exprimes comme un vrai gamer français : tutoiement, argot gaming occasionnel, emojis avec modération.

## TES CONNAISSANCES
- Lien du serveur Discord: https://discord.gg/hAVqWmpGV
- Pour avoir un rôle: réagir dans le salon d'accueil selon ses plateformes préférées.
- Les règles sont dans le salon #règles.
- Les commandes du bot: taper /help.
- Notifications de live: automatiques sur Twitch/YouTube, il faut s'abonner aux salons dédiés.
- Fortnite: le bot peut rejoindre des parties, changer de skin/emote via /game bot-skin, /game bot-emote.
- Boutique Fortnite: /game boutique pour voir la boutique actuelle.

## COMMENT RÉPONDRE
- Réponds NATURELLEMENT, comme un humain le ferait dans une conversation Discord.
- Adapte ton ton au message: sérieux si besoin, détendu sinon, drôle quand c'est approprié.
- 1 à 4 phrases en général. Parfois juste une phrase courte si c'est suffisant.
- N'utilise JAMAIS de préfixe comme "🤖", "Réponse automatique", "Surveillance System".
- N'utilise JAMAIS "en tant qu'IA", "en tant que bot", "je suis programmé pour".
- Si on te demande si tu es un bot: sois honnête mais détendu ("Ouais je suis un bot, mais un bot stylé 👀").
- Varie VOS réponses. Ne répète JAMAIS la même formulation deux fois.
- Si la conversation récente montre que tu as déjà dit quelque chose, ne te répète pas.
- Utilise le contexte de la conversation pour répondre de façon pertinente.
- Si quelqu'un dit juste "salut" ou "merci", réponds brièvement et naturellement.
- Si c'est une vraie question, donne une vraie réponse utile.
- Si c'est une blague ou une taunt, réponds avec humour.
- Tu peux utiliser des emojis gaming (🎮🔥💀👀😎) mais avec parcimonie, pas à chaque message.

## CONTEXTE RÉCENT DE LA CONVERSATION
${recentContext || "(Aucun message récent)"}`;

    const completion = await client.chat.completions.create(
      {
        model: config.openRouterModel,
        messages: [
          { role: "system", content: systemPrompt },
          { role: "user", content: userMessage },
        ],
        max_tokens: 400,
        temperature: 0.9,
        top_p: 0.92,
        frequency_penalty: 0.6,
        presence_penalty: 0.5,
      },
      { signal: controller.signal },
    );

    clearTimeout(timeout);
    const reply = completion.choices[0]?.message?.content?.trim();
    return reply || null;
  } catch (err: unknown) {
    if ((err as Error)?.name === "AbortError") {
      logger.warn("[FAQ] IA timeout — pas de réponse");
      return null;
    }
    logger.error(`[FAQ] Erreur IA: ${err instanceof Error ? err.message : String(err)}`);
    return null;
  }
}

export function startFaqAutoResponder(client: Client): void {
  if (!FAQ_ENABLED) {
    logger.info("[FAQ] Auto-responder désactivé (FAQ_ENABLED=false)");
    return;
  }

  client.on("messageCreate", async (message: Message) => {
    try {
      if (message.author.bot) return;
      if (message.guild === null) return;
      if (FAQ_CHANNELS.length > 0 && !FAQ_CHANNELS.includes(message.channelId)) return;

      // Track ALL messages for context (even if we don't respond)
      const username = message.author.displayName || message.author.username;
      trackContext(message.channelId, username, message.content, false);

      // Cooldown check
      const now = Date.now();
      const lastResponse = userCooldown.get(message.author.id);
      if (lastResponse && now - lastResponse < COOLDOWN_MS) return;

      // Check if message should trigger a response
      if (!shouldRespond(message.content)) return;

      const guildName = message.guild.name;
      const channelName = (message.channel as TextChannel).name;
      const recentContext = buildContextString(message.channelId);

      // Generate AI response
      const aiReply = await generateAiResponse(
        message.content,
        username,
        guildName,
        channelName,
        recentContext,
      );
      if (!aiReply) return;

      // Set cooldown
      userCooldown.set(message.author.id, now);

      // Track our own response in context
      trackContext(message.channelId, "John Helldiver", aiReply, true);

      // Clean up old cooldowns periodically
      if (userCooldown.size > 100) {
        for (const [id, time] of userCooldown) {
          if (now - time > COOLDOWN_MS * 2) userCooldown.delete(id);
        }
      }

      await message.reply({ content: aiReply, allowedMentions: { repliedUser: false } });
      logger.info(`[FAQ] Réponse IA à ${message.author.tag} dans #${channelName}`);

      // Annonce vocale si l'utilisateur est dans un salon vocal
      const member = message.member as GuildMember | null;
      if (member?.voice?.channel) {
        void announceInVoice(member, aiReply).then((ok) => {
          if (ok) logger.info(`[FAQ] Annonce vocale jouée pour ${message.author.tag}`);
        });
      }
    } catch (err) {
      logger.error(`[FAQ] Erreur: ${err instanceof Error ? err.message : String(err)}`);
    }
  });

  logger.info(
    `[FAQ] Auto-responder IA activé (QI humain)${FAQ_CHANNELS.length > 0 ? ` (${FAQ_CHANNELS.length} salon(s))` : " (tous salons)"}`,
  );
}
