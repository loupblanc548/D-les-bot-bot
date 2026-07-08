/**
 * gameServerStatus.ts — Query game server status (Minecraft, Rust, Ark, etc.)
 *
 * Uses the mcping.io API for Minecraft and bgmpatterson API for other games.
 * Returns player count, max players, server info, and online status.
 */

import { EmbedBuilder } from "discord.js";
import logger from "../utils/logger.js";

export interface GameServerInfo {
  host: string;
  port: number;
  game: GameType;
  online: boolean;
  players: { online: number; max: number };
  version?: string;
  motd?: string;
  ping?: number;
  playersList?: string[];
  icon?: string;
}

export type GameType = "minecraft" | "rust" | "ark" | "csgo" | "valheim" | "fivem" | "other";

const GAME_LABELS: Record<GameType, string> = {
  minecraft: "Minecraft",
  rust: "Rust",
  ark: "ARK: Survival Evolved",
  csgo: "CS:GO / CS2",
  valheim: "Valheim",
  fivem: "FiveM (GTA V)",
  other: "Game Server",
};

const GAME_COLORS: Record<GameType, number> = {
  minecraft: 0x44a828,
  rust: 0xce422a,
  ark: 0xe6c040,
  csgo: 0x1a5276,
  valheim: 0x5d6d7e,
  fivem: 0xf39c12,
  other: 0x5865f2,
};

// ─── Query Minecraft server ───────────────────────────────────────────

export async function queryMinecraft(host: string, port = 25565): Promise<GameServerInfo> {
  try {
    const url = `https://api.mcping.io/v1/${host}:${port}`;
    const res = await fetch(url, {
      signal: AbortSignal.timeout(10_000),
      headers: { "User-Agent": "DiscordBot/1.0" },
    });

    if (!res.ok) {
      return { host, port, game: "minecraft", online: false, players: { online: 0, max: 0 } };
    }

    const data = await res.json() as {
      online: boolean;
      players?: { online: number; max: number; sample?: { name: string }[] };
      version?: string;
      motd?: { clean?: string[] } | string;
      icon?: string;
    };

    const motd = Array.isArray((data.motd as { clean?: string[] })?.clean)
      ? (data.motd as { clean: string[] }).clean.join("\n")
      : typeof data.motd === "string"
        ? data.motd
        : undefined;

    return {
      host,
      port,
      game: "minecraft",
      online: data.online ?? false,
      players: {
        online: data.players?.online ?? 0,
        max: data.players?.max ?? 0,
      },
      version: data.version,
      motd,
      playersList: data.players?.sample?.map((p) => p.name),
      icon: data.icon,
    };
  } catch (error) {
    logger.debug(`[GameServer] Minecraft query failed: ${String(error)}`);
    return { host, port, game: "minecraft", online: false, players: { online: 0, max: 0 } };
  }
}

// ─── Query Source engine servers (CS:GO, Rust, Ark, etc.) ────────────

export async function querySourceServer(host: string, port: number, game: GameType): Promise<GameServerInfo> {
  try {
    // Use battlemetrics or direct query
    const url = `https://api.battlemetrics.com/servers?filter[game]=${game}&filter[search]=${encodeURIComponent(host)}&page[size]=1`;
    const res = await fetch(url, {
      signal: AbortSignal.timeout(10_000),
      headers: { "User-Agent": "DiscordBot/1.0" },
    });

    if (!res.ok) {
      return { host, port, game, online: false, players: { online: 0, max: 0 } };
    }

    const data = await res.json() as {
      data?: {
        attributes?: {
          name?: string;
          status?: string;
          players?: number;
          maxPlayers?: number;
          details?: { motd?: string; rust_description?: string };
        }
      }[];
    };

    const server = data.data?.[0]?.attributes;
    if (!server) {
      return { host, port, game, online: false, players: { online: 0, max: 0 } };
    }

    return {
      host,
      port,
      game,
      online: server.status === "online",
      players: {
        online: server.players ?? 0,
        max: server.maxPlayers ?? 0,
      },
      motd: server.name,
    };
  } catch (error) {
    logger.debug(`[GameServer] Source query failed: ${String(error)}`);
    return { host, port, game, online: false, players: { online: 0, max: 0 } };
  }
}

// ─── Query FiveM server ───────────────────────────────────────────────

export async function queryFiveM(host: string, port = 30120): Promise<GameServerInfo> {
  try {
    const url = `http://${host}:${port}/players.json`;
    const res = await fetch(url, {
      signal: AbortSignal.timeout(10_000),
      headers: { "User-Agent": "DiscordBot/1.0" },
    });

    if (!res.ok) {
      return { host, port, game: "fivem", online: false, players: { online: 0, max: 0 } };
    }

    const players = (await res.json()) as unknown[];
    const dynamicUrl = `http://${host}:${port}/dynamic.json`;
    const dynRes = await fetch(dynamicUrl, { signal: AbortSignal.timeout(10_000) }).catch(() => null);
    let maxPlayers = 0;
    if (dynRes?.ok) {
      const dynData = await dynRes.json() as { sv_maxclients?: number };
      maxPlayers = dynData.sv_maxclients ?? 0;
    }

    return {
      host,
      port,
      game: "fivem",
      online: true,
      players: { online: players.length, max: maxPlayers },
    };
  } catch {
    return { host, port, game: "fivem", online: false, players: { online: 0, max: 0 } };
  }
}

// ─── Universal query ──────────────────────────────────────────────────

export async function queryServer(host: string, port: number, game: GameType): Promise<GameServerInfo> {
  switch (game) {
    case "minecraft":
      return queryMinecraft(host, port || 25565);
    case "fivem":
      return queryFiveM(host, port || 30120);
    case "rust":
    case "ark":
    case "csgo":
    case "valheim":
    case "other":
      return querySourceServer(host, port, game);
    default:
      return { host, port, game, online: false, players: { online: 0, max: 0 } };
  }
}

// ─── Build embed ──────────────────────────────────────────────────────

export function buildServerEmbed(info: GameServerInfo): EmbedBuilder {
  const statusText = info.online ? "🟢 En ligne" : "🔴 Hors ligne";
  const color = info.online ? GAME_COLORS[info.game] : 0xe74c3c;

  const embed = new EmbedBuilder()
    .setTitle(`🎮 ${GAME_LABELS[info.game]} — ${info.host}:${info.port}`)
    .setColor(color)
    .addFields(
      { name: "Status", value: statusText, inline: true },
      { name: "Joueurs", value: info.online ? `${info.players.online}/${info.players.max}` : "N/A", inline: true },
      { name: "Adresse", value: `\`${info.host}:${info.port}\``, inline: true },
    )
    .setTimestamp();

  if (info.version) {
    embed.addFields({ name: "Version", value: info.version, inline: true });
  }

  if (info.motd) {
    embed.setDescription(info.motd.slice(0, 2048));
  }

  if (info.playersList && info.playersList.length > 0) {
    const list = info.playersList.slice(0, 20).join(", ");
    embed.addFields({
      name: `Joueurs connectés (${info.playersList.length})`,
      value: list.slice(0, 1024),
      inline: false,
    });
  }

  if (info.icon) {
    embed.setThumbnail(`attachment://server-icon.png`);
  }

  return embed;
}

// ─── Watch server (periodic monitoring) ───────────────────────────────

export interface ServerWatch {
  id: string;
  guildId: string;
  channelId: string;
  host: string;
  port: number;
  game: GameType;
  lastOnline: boolean;
  lastPlayerCount: number;
}

const watchedServers = new Map<string, ServerWatch>();

export function addServerWatch(guildId: string, channelId: string, host: string, port: number, game: GameType): string {
  const id = `watch_${Date.now()}_${Math.random().toString(36).slice(2, 6)}`;
  watchedServers.set(id, {
    id, guildId, channelId, host, port, game,
    lastOnline: false, lastPlayerCount: 0,
  });
  logger.info(`[GameServer] Watching ${host}:${port} (${game}) in ${channelId}`);
  return id;
}

export function removeServerWatch(id: string): boolean {
  return watchedServers.delete(id);
}

export function listServerWatches(guildId: string): ServerWatch[] {
  return Array.from(watchedServers.values()).filter((w) => w.guildId === guildId);
}

export async function checkWatchedServers(
  notifyCallback: (channelId: string, embed: EmbedBuilder) => Promise<void>,
): Promise<void> {
  for (const [id, watch] of watchedServers) {
    const info = await queryServer(watch.host, watch.port, watch.game);

    // Status change
    if (info.online !== watch.lastOnline) {
      const embed = buildServerEmbed(info);
      embed.setTitle(`${info.online ? "✅" : "❌"} Serveur ${info.online ? "devenu en ligne" : "est hors ligne"}`);
      await notifyCallback(watch.channelId, embed).catch(() => {});
      watch.lastOnline = info.online;
    }

    watch.lastPlayerCount = info.players.online;
  }
}
