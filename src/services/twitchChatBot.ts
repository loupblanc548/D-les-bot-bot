import { EventEmitter } from "events";
import WebSocket from "ws";
import logger from "../utils/logger.js";

const TWITCH_OAUTH_TOKEN = process.env.TWITCH_OAUTH_TOKEN || "";

export const TWITCH_STANDBY = true;

export interface TwitchChatMessage {
  channel: string; username: string; message: string; displayName: string;
  badges: string[]; bits: number; isMod: boolean; isSub: boolean; isBroadcaster: boolean; timestamp: Date;
}

type CommandHandler = (msg: TwitchChatMessage, args: string[]) => void | Promise<void>;

export class TwitchChatBot extends EventEmitter {
  private ws: WebSocket | null = null;
  private channels: string[];
  private prefix: string;
  private autoReconnect: boolean;
  private commands: Map<string, CommandHandler> = new Map();
  private connected = false;

  constructor(opts: { channels: string[]; commandPrefix?: string; autoReconnect?: boolean }) {
    super();
    this.channels = opts.channels.map((c) => c.toLowerCase().replace("#", ""));
    this.prefix = opts.commandPrefix || "!";
    this.autoReconnect = opts.autoReconnect ?? true;
  }

  command(name: string, handler: CommandHandler): this { this.commands.set(name.toLowerCase(), handler); return this; }

  connect(): void {
    if (!TWITCH_OAUTH_TOKEN) { logger.warn("[TwitchChatBot] No TWITCH_OAUTH_TOKEN"); return; }
    this.ws = new WebSocket("wss://irc-ws.chat.twitch.tv:443");
    this.ws.on("open", () => {
      this.sendRaw(`CAP REQ :twitch.tv/tags twitch.tv/commands`);
      this.sendRaw(`PASS oauth:${TWITCH_OAUTH_TOKEN}`);
      this.sendRaw(`NICK justinfan${Math.floor(Math.random() * 99999)}`);
      for (const ch of this.channels) this.sendRaw(`JOIN #${ch}`);
      this.connected = true; this.emit("connected");
      logger.info(`[TwitchChatBot] Connected to ${this.channels.length} channels`);
    });
    this.ws.on("message", (data: WebSocket.RawData) => this.handleMessage(data.toString()));
    this.ws.on("close", () => { this.connected = false; this.emit("disconnected"); if (this.autoReconnect) setTimeout(() => this.connect(), 5000); });
    this.ws.on("error", (err) => logger.error(`[TwitchChatBot] WS error: ${err.message}`));
  }

  disconnect(): void { this.autoReconnect = false; this.ws?.close(); this.ws = null; this.connected = false; }
  sendMessage(channel: string, message: string): void {
    if (!this.connected || !this.ws) return;
    const ch = channel.startsWith("#") ? channel : `#${channel}`;
    this.sendRaw(`PRIVMSG ${ch} :${message.slice(0, 500)}`);
  }
  private sendRaw(data: string): void { if (this.ws?.readyState === WebSocket.OPEN) this.ws.send(`${data}\r\n`); }

  private handleMessage(raw: string): void {
    for (const line of raw.split("\r\n").filter(Boolean)) {
      if (line.startsWith("PING")) { this.sendRaw("PONG :" + line.split(":")[1]); continue; }
      if (line.includes("PRIVMSG")) { const msg = this.parsePrivMsg(line); if (msg) { this.emit("message", msg); this.handleCommand(msg); } }
    }
  }

  private parsePrivMsg(line: string): TwitchChatMessage | null {
    try {
      const tagMatch = line.match(/@([^ ]+) /); const tags: Record<string, string> = {};
      if (tagMatch) for (const pair of tagMatch[1].split(";")) { const [k, v] = pair.split("="); const safeKey = String(k || "").replace(/[^a-zA-Z0-9_-]/g, ""); const safeVal = String(v || ""); tags[safeKey] = safeVal; }
      const userMatch = line.match(/:([^!]+)!/); const chMatch = line.match(/PRIVMSG #([^ :]+)/); const msgMatch = line.match(/PRIVMSG #[^ ]+ :(.+)$/);
      if (!userMatch || !chMatch || !msgMatch) return null;
      const badges = (tags.badges || "").split(",").filter(Boolean);
      return {
        channel: chMatch[1], username: userMatch[1], message: msgMatch[1],
        displayName: tags["display-name"] || userMatch[1], badges, bits: Number(tags.bits || 0),
        isMod: badges.includes("moderator"), isSub: badges.includes("subscriber") || badges.includes("founder"),
        isBroadcaster: badges.includes("broadcaster"), timestamp: new Date(Number(tags["tmi-sent-ts"] || Date.now())),
      };
    } catch { return null; }
  }

  private handleCommand(msg: TwitchChatMessage): void {
    if (!msg.message.startsWith(this.prefix)) return;
    const parts = msg.message.slice(this.prefix.length).split(" ");
    const handler = this.commands.get(parts[0].toLowerCase());
    if (handler) {
      if (typeof handler !== "function") { logger.warn(`[TwitchChatBot] Invalid handler for ${parts[0]}`); return; }
      Promise.resolve(handler(msg, parts.slice(1))).catch((err) => logger.error(`[TwitchChatBot] Cmd error: ${err instanceof Error ? err.message : String(err)}`));
    }
  }

  isConnected(): boolean { return this.connected; }
  getChannels(): string[] { return [...this.channels]; }
}

let botInstance: TwitchChatBot | null = null;
export function getTwitchChatBot(): TwitchChatBot | null {
  if (!botInstance && TWITCH_OAUTH_TOKEN) {
    const channels = (process.env.TWITCH_CHAT_CHANNELS || "").split(",").filter(Boolean);
    if (channels.length === 0) return null;
    botInstance = new TwitchChatBot({ channels });
  }
  return botInstance;
}
