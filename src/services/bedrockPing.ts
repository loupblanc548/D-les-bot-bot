/**
 * bedrockPing.ts — Direct UDP Bedrock/MCPE server ping (RakNet protocol)
 *
 * Bedrock Edition uses UDP (not TCP like Java Edition).
 * This implements the RakNet Unconnected Ping to get:
 * - MOTD, online/max players, protocol version, gamemode
 *
 * Also supports Realm invite code resolution via community APIs.
 */

import dgram from "dgram";
import logger from "../utils/logger.js";

// RakNet magic bytes
const RAKNET_MAGIC = Buffer.from([
  0x00, 0xFF, 0xFF, 0x00, 0xFE, 0xFE, 0xFE, 0xFE,
  0xFD, 0xFD, 0xFD, 0xFD, 0x12, 0x34, 0x56, 0x78,
]);

interface BedrockServerInfo {
  motd: string;
  protocol: string;
  version: string;
  onlinePlayers: number;
  maxPlayers: number;
  serverId: string;
  gamemode: string;
  port: number;
}

/**
 * Build a RakNet Unconnected Ping packet.
 */
function buildPingPacket(): Buffer {
  const buf = Buffer.alloc(33);
  let offset = 0;
  buf.writeUInt8(0x01, offset++); // ID_UNCONNECTED_PING
  buf.writeBigInt64BE(BigInt(Date.now()), offset); offset += 8; // timestamp
  RAKNET_MAGIC.copy(buf, offset); offset += 16; // magic
  buf.writeBigInt64BE(0n, offset); // client GUID
  return buf;
}

/**
 * Parse a RakNet Unconnected Pong response.
 */
function parsePongResponse(buf: Buffer): BedrockServerInfo | null {
  let offset = 0;
  const packetId = buf.readUInt8(offset++);
  if (packetId !== 0x1C) return null; // ID_UNCONNECTED_PONG

  offset += 8; // timestamp (skip)
  offset += 16; // magic (skip)
  offset += 8; // server GUID (skip)

  // Reply string length (2 bytes, little-endian)
  const replyLen = buf.readUInt16LE(offset);
  offset += 2;

  const reply = buf.subarray(offset, offset + replyLen).toString("utf8");

  // MCPE;MOTD;Protocol;Version;Online;Max;ServerID;ServerName;Gamemode;GamemodeNum;Port;Port
  const parts = reply.split(";");
  if (parts.length < 6) return null;

  return {
    motd: parts[1] || "Unknown",
    protocol: parts[2] || "?",
    version: parts[3] || "?",
    onlinePlayers: parseInt(parts[4]) || 0,
    maxPlayers: parseInt(parts[5]) || 0,
    serverId: parts[6] || "?",
    gamemode: parts[8] || "Unknown",
    port: parseInt(parts[10]) || 0,
  };
}

/**
 * Ping a Bedrock server via UDP (RakNet protocol).
 * Timeout in ms (default 5000).
 */
export function pingBedrockServer(
  host: string,
  port: number = 19132,
  timeoutMs: number = 5000,
): Promise<BedrockServerInfo | null> {
  return new Promise((resolve) => {
    const socket = dgram.createSocket("udp4");
    const pingPacket = buildPingPacket();
    let resolved = false;

    const cleanup = () => {
      if (!resolved) {
        resolved = true;
        resolve(null);
      }
      try { socket.close(); } catch { /* already closed */ }
    };

    socket.on("message", (msg) => {
      if (resolved) return;
      resolved = true;
      const info = parsePongResponse(msg);
      if (info) {
        logger.info(`[BedrockPing] ✅ ${host}:${port} — ${info.motd} (${info.onlinePlayers}/${info.maxPlayers})`);
      }
      try { socket.close(); } catch { /* */ }
      resolve(info);
    });

    socket.on("error", (err) => {
      logger.debug(`[BedrockPing] UDP error for ${host}:${port}: ${err.message}`);
      cleanup();
    });

    socket.on("close", () => {
      if (!resolved) cleanup();
    });

    // Send ping
    socket.send(pingPacket, port, host, (err) => {
      if (err) {
        logger.debug(`[BedrockPing] Send error for ${host}:${port}: ${err.message}`);
        cleanup();
      }
    });

    // Timeout
    setTimeout(cleanup, timeoutMs);
  });
}

/**
 * Resolve a Bedrock Realm invite code to a connectable address.
 *
 * Bedrock Realms use Mojang's proxy system. The invite code
 * can sometimes be resolved via community APIs.
 *
 * Approaches:
 * 1. Try <code>.bedrock.minecraft.net as hostname
 * 2. Try mcsrvstat.us bedrock API
 * 3. Fall back to guiding the user
 */
export async function resolveRealmAddress(
  inviteCode: string,
): Promise<{ host: string; port: number; method: string } | null> {
  const code = inviteCode.trim().replace(/-/g, "");

  // Method 1: Try direct realm hostname
  // Some realms resolve via <code>.bedrock.minecraft.net
  const realmHost = `${code}.bedrock.minecraft.net`;
  try {
    const info = await pingBedrockServer(realmHost, 19132, 4000);
    if (info) {
      return { host: realmHost, port: 19132, method: "direct-realm-hostname" };
    }
  } catch { /* try next */ }

  // Method 2: Try mcsrvstat.us bedrock endpoint
  try {
    const res = await fetch(`https://api.mcsrvstat.us/bedrock/${realmHost}`, {
      signal: AbortSignal.timeout(5000),
    });
    const data = await res.json() as { online?: boolean; hostname?: string; port?: number };
    if (data.online) {
      return {
        host: data.hostname || realmHost,
        port: data.port || 19132,
        method: "mcsrvstat-bedrock",
      };
    }
  } catch { /* try next */ }

  // Method 3: Try with port 19133 (alternate Bedrock port)
  try {
    const info = await pingBedrockServer(realmHost, 19133, 4000);
    if (info) {
      return { host: realmHost, port: 19133, method: "alternate-port" };
    }
  } catch { /* */ }

  return null;
}

/**
 * Full Bedrock server status check.
 * Supports both direct IP:port and Realm invite codes.
 */
export async function getBedrockServerStatus(
  address: string,
): Promise<string> {
  // Parse address — could be "host:port", "host", or a Realm invite code
  let host: string;
  let port: number = 19132;
  let isRealm = false;

  if (address.includes(":")) {
    const [h, p] = address.split(":");
    host = h;
    port = parseInt(p) || 19132;
  } else if (address.length <= 12 && /^[A-Z0-9]+$/i.test(address) && !address.includes(".")) {
    // Looks like a Realm invite code (short alphanumeric, no dots)
    isRealm = true;
    host = address;
  } else {
    host = address;
  }

  // If it's a Realm invite code, try to resolve it
  if (isRealm) {
    logger.info(`[BedrockPing] 🏰 Resolving Realm invite code: ${address}`);
    const resolved = await resolveRealmAddress(address);
    if (!resolved) {
      return `🏰 Realm "${address}" — Impossible de résoudre l'adresse.\n` +
        `Les Realms Bedrock utilisent le proxy Mojang (IP cachée).\n` +
        `**Solutions pour trouver l'IP:**\n` +
        `1. Dans Minecraft, rejoins le Realm\n` +
        `2. Va dans Paramètres > Informations du serveur\n` +
        `3. Note l'IP et le port affichés\n` +
        `4. Relance la commande avec l'IP:port directe\n\n` +
        `Ou utilise le code d'invitation directement dans Minecraft: Bedrock Edition.`;
    }

    host = resolved.host;
    port = resolved.port;
    logger.info(`[BedrockPing] 🏰 Realm résolu: ${host}:${port} (${resolved.method})`);
  }

  // Direct UDP ping
  const info = await pingBedrockServer(host, port);

  if (!info) {
    // Fallback: try mcsrvstat.us bedrock API
    try {
      const res = await fetch(`https://api.mcsrvstat.us/bedrock/${host}:${port}`, {
        signal: AbortSignal.timeout(5000),
      });
      const data = await res.json() as {
        online?: boolean;
        players?: { online: number; max: number };
        version?: string;
        motd?: { clean: string[] };
      };
      if (data.online) {
        const motd = data.motd?.clean?.join(" ") || "N/A";
        return `🟢 **Serveur Bedrock ${host}:${port}**\n` +
          `**MOTD:** ${motd}\n` +
          `**Joueurs:** ${data.players?.online}/${data.players?.max}\n` +
          `**Version:** ${data.version || "N/A"}`;
      }
    } catch { /* */ }

    return `🔴 Serveur Bedrock ${host}:${port} — Hors ligne ou injoignable (UDP ping échoué)`;
  }

  return `🟢 **Serveur Bedrock ${host}:${port}**${isRealm ? " (Realm)" : ""}\n` +
    `**MOTD:** ${info.motd}\n` +
    `**Joueurs:** ${info.onlinePlayers}/${info.maxPlayers}\n` +
    `**Version:** ${info.version} (protocol ${info.protocol})\n` +
    `**Gamemode:** ${info.gamemode}`;
}
