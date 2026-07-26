/**
 * humanBehavior.ts — Rend le bot plus humain dans ses réponses.
 *
 * 1. Split multi-message : une longue réponse → 2-3 messages courts
 * 2. Réactions emoji spontanées : parfois réagir au lieu de répondre
 * 4. Fautes de frappe occasionnelles : subtil, ~5% des messages
 * 5. Réponses ultra-courtes pour messages simples
 */

import type { Message, TextChannel } from "discord.js";

// ─── 2. Réactions emoji spontanées ───────────────────────────────────────────

const SPONTANOUS_REACTIONS = ["😂", "💀", "🔥", "✅", "👍", "💯", "🤣", "🙄", "😮", "😢"];

const SIMPLE_MESSAGE_PATTERNS = [
  /^(ok|k|ouais|oui|non|no|np|cool|nice|gg|wp|ez|rip|wtf|mdr|lol|xd|vrai|faux|maybe|peut[- ]être|bof|ouf)\b/i,
  /^(salut|coucou|hello|hey|yo|bonjour|bonsoir|hi|wesh|cc)\b/i,
  /^(merci|thanks|thx|cimer|merci beaucoup)\b/i,
  /^(d'accord|oké|oke|okkk|ouais ok|ça marche|pas de souci|no problem)\b/i,
  /^(vraiment|sérieux|franchement|n'importe quoi|c'est ouf|c'est fou)\b/i,
];

const EMOJI_FOR_SIMPLE: Record<string, string[]> = {
  mdr: ["😂", "🤣", "💀"],
  lol: ["😂", "🤣", "💀"],
  xd: ["😂", "🤣"],
  gg: ["🎉", "🔥", "👍"],
  wp: ["👏", "👍"],
  ez: ["😎", "💀"],
  rip: ["💀", "😢", "🪦"],
  wtf: ["😱", "💀", "🙄"],
  ok: ["👍", "✅"],
  ouais: ["👍", "💯"],
  oui: ["✅", "👍"],
  non: ["❌", "🙄"],
  cool: ["😎", "🔥"],
  nice: ["🔥", "👍", "💯"],
  vrai: ["💯", "✅"],
  salut: ["👋", "🫡"],
  bonjour: ["👋", "🫡"],
  bonsoir: ["👋", "🌙"],
  yo: ["👋", "🤙"],
  hey: ["👋"],
  merci: ["🙏", "👍", "❤️"],
  thanks: ["🙏", "👍"],
  thx: ["🙏", "👍"],
};

/**
 * Détermine si un message est "simple" (court, pas une question, pas une demande complexe).
 * Si oui, retourne l'emoji à réagir au lieu d'une réponse complète.
 */
export function getSpontaneousReaction(content: string): string | null {
  const trimmed = content.trim().toLowerCase();

  // Trop long → pas une réaction simple
  if (trimmed.length > 60) return null;

  // Contient une question → l'IA doit répondre
  if (trimmed.includes("?") || trimmed.includes("comment") || trimmed.includes("pourquoi"))
    return null;

  // Contient une @mention → l'IA doit répondre
  if (trimmed.includes("@")) return null;

  // 40% de chance de réagir au lieu de répondre pour les messages simples
  if (Math.random() > 0.4) return null;

  // Check les patterns simples
  for (const pattern of SIMPLE_MESSAGE_PATTERNS) {
    if (pattern.test(trimmed)) {
      // Cherche un emoji spécifique pour ce mot
      const firstWord = trimmed.split(/\s+/)[0];
      const specificEmojis = EMOJI_FOR_SIMPLE[firstWord];
      if (specificEmojis && specificEmojis.length > 0) {
        return specificEmojis[Math.floor(Math.random() * specificEmojis.length)];
      }
      // Emoji aléatoire
      return SPONTANOUS_REACTIONS[Math.floor(Math.random() * SPONTANOUS_REACTIONS.length)];
    }
  }

  return null;
}

// ─── 4. Fautes de frappe occasionnelles ──────────────────────────────────────

/**
 * Ajoute une faute de frappe subtile avec ~5% de probabilité.
 * - Double une lettre ("salut" → "sallut")
 * - Omet une lettre ("salut" → "saut")
 * - Inverse deux lettres ("salut" → "slaut")
 */
export function maybeAddTypo(text: string): string {
  if (Math.random() > 0.05) return text; // 95% pas de faute

  // Ne pas faire de faute sur du code, des URLs, ou des commandes
  if (text.includes("```") || text.includes("http") || text.startsWith("/")) return text;

  const words = text.split(/(\s+)/); // garde les espaces
  // Choisit un mot assez long (4+ lettres) au hasard
  const candidates = words.filter((w) => w.length >= 4 && /^[a-zA-Zà-ÿ]+$/.test(w));
  if (candidates.length === 0) return text;

  const targetWord = candidates[Math.floor(Math.random() * candidates.length)];
  const typoType = Math.floor(Math.random() * 3);

  let typoWord = targetWord;

  if (typoType === 0 && targetWord.length >= 4) {
    // Doubler une lettre
    const pos = 1 + Math.floor(Math.random() * (targetWord.length - 2));
    typoWord = targetWord.slice(0, pos) + targetWord[pos] + targetWord.slice(pos);
  } else if (typoType === 1 && targetWord.length >= 5) {
    // Omettre une lettre (pas la première ni la dernière)
    const pos = 1 + Math.floor(Math.random() * (targetWord.length - 2));
    typoWord = targetWord.slice(0, pos) + targetWord.slice(pos + 1);
  } else if (typoType === 2 && targetWord.length >= 5) {
    // Inverser deux lettres adjacentes
    const pos = 1 + Math.floor(Math.random() * (targetWord.length - 3));
    typoWord =
      targetWord.slice(0, pos) + targetWord[pos + 1] + targetWord[pos] + targetWord.slice(pos + 2);
  }

  return text.replace(targetWord, typoWord);
}

// ─── 1. Split multi-message ──────────────────────────────────────────────────

/**
 * Découpe une réponse longue en plusieurs messages courts, comme un humain.
 * Split sur les points, virgules, ou retours à la ligne si la réponse est > 200 chars.
 *
 * @returns Tableau de messages à envoyer séquentiellement
 */
export function splitIntoMessages(text: string): string[] {
  // Si court, un seul message
  if (text.length <= 1900) return [text];

  const MAX_CHUNK = 1900;
  const result: string[] = [];

  // 1. Split sur les paragraphes (double newline)
  const paragraphs = text.split(/\n\s*\n/).filter((p) => p.trim().length > 0);

  let current = "";
  for (const para of paragraphs) {
    // Si le paragraphe seul dépasse la limite, on le découpe par lignes
    if (para.length > MAX_CHUNK) {
      // Flush current chunk first
      if (current.trim()) {
        result.push(current.trim());
        current = "";
      }
      // Split par lignes
      const lines = para.split("\n");
      let lineChunk = "";
      for (const line of lines) {
        if (lineChunk.length + line.length + 1 > MAX_CHUNK) {
          if (lineChunk) result.push(lineChunk.trim());
          // Si une seule ligne dépasse la limite, la couper brutalement
          if (line.length > MAX_CHUNK) {
            for (let i = 0; i < line.length; i += MAX_CHUNK) {
              result.push(line.slice(i, i + MAX_CHUNK));
            }
            lineChunk = "";
          } else {
            lineChunk = line;
          }
        } else {
          lineChunk = lineChunk ? lineChunk + "\n" + line : line;
        }
      }
      if (lineChunk.trim()) {
        current = lineChunk;
      }
    } else if (current.length + para.length + 2 > MAX_CHUNK) {
      // Le paragraphe ne rentre pas dans le chunk courant → flush et nouveau chunk
      if (current.trim()) result.push(current.trim());
      current = para;
    } else {
      current = current ? current + "\n\n" + para : para;
    }
  }
  if (current.trim()) result.push(current.trim());

  return result.length > 0 ? result : [text.slice(0, 1900)];
}

/**
 * Envoie plusieurs messages séquentiellement avec un petit délai entre chaque,
 * comme un humain qui tape message par message.
 */
export async function sendMultiMessage(
  channel: TextChannel,
  text: string,
  replyTo?: Message,
): Promise<Message[]> {
  const messages = splitIntoMessages(text);
  const sentMessages: Message[] = [];

  if (messages.length === 1) {
    const finalText = maybeAddTypo(messages[0]).slice(0, 2000);
    if (replyTo) {
      const sent = await replyTo.reply({
        content: finalText,
        allowedMentions: { repliedUser: false },
      });
      sentMessages.push(sent);
    } else {
      const sent = await channel.send({ content: finalText });
      sentMessages.push(sent);
    }
    return sentMessages;
  }

  for (let i = 0; i < messages.length; i++) {
    const msgText = maybeAddTypo(messages[i]).slice(0, 2000);
    if (i === 0 && replyTo) {
      const sent = await replyTo.reply({
        content: msgText,
        allowedMentions: { repliedUser: false },
      });
      sentMessages.push(sent);
    } else {
      await sleep(1000 + Math.random() * 2000);
      await channel.sendTyping().catch(() => {});
      await sleep(500 + Math.random() * 1000);
      const sent = await channel.send({ content: msgText });
      sentMessages.push(sent);
    }
  }
  return sentMessages;
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

// ─── 5. Réponses ultra-courtes ───────────────────────────────────────────────

/**
 * Pour les messages très simples (salut, ok, merci, mdr),
 * retourne une réponse ultra-courte au lieu de faire appel à l'IA.
 */
const ULTRA_SHORT_REPLIES: Record<string, string[]> = {
  salut: ["yo", "salut", "hey", "cc"],
  bonjour: ["yo", "salut", "hello"],
  bonsoir: ["soir", "yo", "salut"],
  coucou: ["cc", "hey", "coucou"],
  hello: ["yo", "hello", "salut"],
  hey: ["hey", "yo", "salut"],
  yo: ["yo", "hey", "cc"],
  wesh: ["wesh", "yo", "ça va"],
  cc: ["cc", "hey", "salut"],
  merci: ["de rien", "pas de souci", "👍"],
  thanks: ["de rien", "pas de souci"],
  thx: ["de rien", "np"],
  ok: ["ok", "👍", "nickel"],
  ouais: ["ouais", "👍", "ok"],
  cool: ["ouais grave", "nicel", "🔥"],
  nice: ["nicel", "🔥", "grave"],
  gg: ["gg wp", "🔥", "bien joué"],
  mdr: ["😂", "mdrr", "💀"],
  lol: ["😂", "lol", "💀"],
  xd: ["😂", "xd", "💀"],
};

export function getUltraShortReply(content: string): string | null {
  const trimmed = content.trim().toLowerCase();
  // Seulement si le message est très court (1-2 mots, < 30 chars)
  if (trimmed.length > 30) return null;
  if (trimmed.includes("?") || trimmed.includes("@")) return null;

  const firstWord = trimmed.split(/\s+/)[0];
  const replies = ULTRA_SHORT_REPLIES[firstWord];

  if (replies && Math.random() < 0.6) {
    return replies[Math.floor(Math.random() * replies.length)];
  }

  return null;
}
