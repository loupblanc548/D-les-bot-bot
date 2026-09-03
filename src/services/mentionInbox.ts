/**
 * Inbox of @John pings from every Discord channel (text, threads, news, voice text, DMs).
 */
import { writeFileSync, readFileSync, existsSync } from "node:fs";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { Client, Message, type ThreadChannel } from "discord.js";
import logger from "../utils/logger.js";

export interface MentionPing {
  at: string;
  userId: string;
  userTag: string;
  channelId: string;
  channelName: string;
  guildId: string | null;
  guildName: string | null;
  content: string;
  url: string;
  replied: boolean;
}

const MAX_PINGS = 40;
const STORE_FILE = join(tmpdir(), "john-mention-inbox.json");

let pings: MentionPing[] = loadPings();

function loadPings(): MentionPing[] {
  try {
    if (!existsSync(STORE_FILE)) return [];
    const parsed = JSON.parse(readFileSync(STORE_FILE, "utf-8")) as MentionPing[];
    return Array.isArray(parsed) ? parsed.slice(0, MAX_PINGS) : [];
  } catch {
    return [];
  }
}

function persist(): void {
  try {
    writeFileSync(STORE_FILE, JSON.stringify(pings.slice(0, MAX_PINGS)));
  } catch {
    /* ignore */
  }
}

function channelNameOf(message: Message): string {
  const ch = message.channel;
  if ("name" in ch && typeof ch.name === "string" && ch.name) return ch.name;
  if (!message.guild) return "MP";
  return message.channelId;
}

export function isJohnPinged(message: Message, botId: string): boolean {
  if (!botId || message.author.id === botId) return false;
  if (message.mentions.users.has(botId)) return true;
  if (message.mentions.repliedUser?.id === botId) return true;
  if (message.content.includes(`<@${botId}>`) || message.content.includes(`<@!${botId}>`)) {
    return true;
  }
  return false;
}

export function recordIncomingPing(message: Message): MentionPing {
  const ping: MentionPing = {
    at: new Date(message.createdTimestamp || Date.now()).toISOString(),
    userId: message.author.id,
    userTag: message.author.tag || message.author.username,
    channelId: message.channelId,
    channelName: channelNameOf(message),
    guildId: message.guildId ?? null,
    guildName: message.guild?.name ?? (message.guildId ? null : "MP"),
    content: (message.content || "")
      .replace(/<@!?\d+>/g, "")
      .trim()
      .slice(0, 280),
    url: message.url,
    replied: message.mentions.repliedUser?.id === message.client.user?.id,
  };
  pings = [ping, ...pings.filter((p) => p.url !== ping.url)].slice(0, MAX_PINGS);
  persist();
  logger.info(`[Mentions] ping de ${ping.userTag} dans #${ping.channelName} (${ping.channelId})`);
  return ping;
}

export function listRecentMentions(limit = 15): MentionPing[] {
  return pings.slice(0, Math.max(1, Math.min(limit, MAX_PINGS)));
}

export function mentionAwarenessBlock(): string {
  const recent = listRecentMentions(8);
  if (recent.length === 0) {
    return (
      "\n\n## PINGS DISCORD\n" +
      "Tu reçois les @mentions dans TOUS les salons (texte, fils, annonces, vocal texte, MP), pas seulement le salon actuel.\n"
    );
  }
  const lines = recent.map((m) => {
    const where = m.guildId ? `#${m.channelName}` : "MP";
    const body = m.content || "(sans texte)";
    return `- ${m.userTag} dans ${where}: ${body}`;
  });
  return (
    "\n\n## PINGS DISCORD (tous les salons)\n" +
    "On t'a mentionné récemment, y compris hors de ce salon :\n" +
    lines.join("\n") +
    "\nSi on te demande qui t'a ping / dans quel salon, réponds avec ça (ou getRecentMentions).\n"
  );
}

async function joinThread(thread: ThreadChannel): Promise<void> {
  if (!thread.joinable || thread.joined) return;
  await thread.join().catch(() => undefined);
}

export function attachMentionInbox(client: Client): void {
  client.on("threadCreate", (thread) => {
    void joinThread(thread);
  });

  client.on("ready", () => {
    void (async () => {
      for (const guild of client.guilds.cache.values()) {
        const active = await guild.channels.fetchActiveThreads().catch(() => null);
        if (!active) continue;
        for (const thread of active.threads.values()) {
          await joinThread(thread);
        }
      }
      logger.info("[Mentions] à l'écoute des pings dans tous les salons / fils");
    })();
  });
}

export function isSendableChannel(message: Message): boolean {
  const ch = message.channel;
  if (!ch.isTextBased()) return false;
  return typeof (ch as { send?: unknown }).send === "function";
}
