import axios from "axios";
import WebSocket from "ws";
import { EventEmitter } from "events";
import logger from "../utils/logger.js";

const LAVALINK_HOST = process.env.LAVALINK_HOST || "localhost";
const LAVALINK_PORT = process.env.LAVALINK_PORT || "2333";
const LAVALINK_PASSWORD = process.env.LAVALINK_PASSWORD || "youshallnotpass";
const LAVALINK_USERID = process.env.LAVALINK_USER_ID || "";

export interface LavalinkTrack { track: string; info: { title: string; author: string; length: number; uri: string; isStream: boolean; }; }

export class LavalinkClient extends EventEmitter {
  private ws: WebSocket | null = null;
  private connected = false;

  connect(): void {
    if (!LAVALINK_USERID) { logger.warn("[Lavalink] No LAVALINK_USER_ID"); return; }
    this.ws = new WebSocket(`ws://${LAVALINK_HOST}:${LAVALINK_PORT}/v3/websocket`, {
      headers: { Authorization: LAVALINK_PASSWORD, "User-Id": LAVALINK_USERID, "Client-Name": "discord-bot/1.0" },
    });
    this.ws.on("open", () => { this.connected = true; this.emit("connected"); logger.info("[Lavalink] Connected"); });
    this.ws.on("message", (data: WebSocket.RawData) => { try { this.emit("message", JSON.parse(data.toString())); } catch { /* skip */ } });
    this.ws.on("close", () => { this.connected = false; this.emit("disconnected"); setTimeout(() => this.connect(), 5000); });
    this.ws.on("error", (err) => logger.error(`[Lavalink] WS error: ${err.message}`));
  }

  async loadTrack(identifier: string): Promise<LavalinkTrack[]> {
    try {
      const res = await axios.get(`http://${LAVALINK_HOST}:${LAVALINK_PORT}/v3/loadtracks`, { params: { identifier }, headers: { Authorization: LAVALINK_PASSWORD }, timeout: 10000 });
      const d = res.data;
      if (d.loadType === "track") return [d.data];
      if (d.loadType === "playlist") return d.data?.tracks || [];
      if (d.loadType === "search") return d.data || [];
      return [];
    } catch (err) { logger.error(`[Lavalink] loadTrack error: ${err instanceof Error ? err.message : String(err)}`); return []; }
  }

  async updatePlayer(guildId: string, opts: { track?: string; paused?: boolean; volume?: number; position?: number }): Promise<void> {
    try {
      const body: Record<string, unknown> = {};
      if (opts.track !== undefined) body.encodedTrack = opts.track;
      if (opts.paused !== undefined) body.paused = opts.paused;
      if (opts.volume !== undefined) body.volume = opts.volume;
      if (opts.position !== undefined) body.position = opts.position;
      await axios.patch(`http://${LAVALINK_HOST}:${LAVALINK_PORT}/v3/sessions/${LAVALINK_USERID}/players/${guildId}`, body, { headers: { Authorization: LAVALINK_PASSWORD }, timeout: 5000 });
    } catch (err) { logger.error(`[Lavalink] updatePlayer error: ${err instanceof Error ? err.message : String(err)}`); }
  }

  async stop(guildId: string): Promise<void> {
    try { await axios.delete(`http://${LAVALINK_HOST}:${LAVALINK_PORT}/v3/sessions/${LAVALINK_USERID}/players/${guildId}`, { headers: { Authorization: LAVALINK_PASSWORD }, timeout: 5000 }); } catch (err) { logger.error(`[Lavalink] stop error: ${err instanceof Error ? err.message : String(err)}`); }
  }

  isConnected(): boolean { return this.connected; }
}

let instance: LavalinkClient | null = null;
export function getLavalink(): LavalinkClient | null { if (!instance && LAVALINK_USERID) instance = new LavalinkClient(); return instance; }
export function isLavalinkConfigured(): boolean { return !!LAVALINK_USERID; }
