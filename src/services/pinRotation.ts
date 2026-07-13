import { Client, TextChannel, Message, Collection } from "discord.js";
import logger from "../utils/logger.js";
import { safeInterval } from "../utils/safe-interval.js";

const MAX_PINS = 3;
const CHECK_INTERVAL_MS = parseInt(process.env.PIN_ROTATION_INTERVAL_MS || "3600000", 10); // 1h
let rotationInterval: NodeJS.Timeout | null = null;

async function rotatePins(client: Client): Promise<void> {
  for (const guild of client.guilds.cache.values()) {
    try {
      const channels = guild.channels.cache.filter((c) => c.isTextBased()) as Map<
        string,
        TextChannel
      >;
      for (const [, channel] of channels) {
        const pinned = (await channel.messages.fetchPins().catch(() => null)) as Collection<
          string,
          Message<true>
        > | null;
        if (!pinned || pinned.size <= MAX_PINS) continue;

        const sorted = [...pinned.values()].sort((a, b) => a.createdTimestamp - b.createdTimestamp);
        const toUnpin = sorted.slice(0, sorted.length - MAX_PINS);

        for (const msg of toUnpin) {
          try {
            await msg.unpin();
            logger.info(
              `[PinRotation] Dépinglé: "${msg.content.substring(0, 50)}" dans #${channel.name}`,
            );
          } catch {}
        }
      }
    } catch (err) {
      logger.debug(
        `[PinRotation] Erreur guild ${guild.name}: ${err instanceof Error ? err.message : String(err)}`,
      );
    }
  }
}

export function startPinRotation(client: Client): void {
  if (rotationInterval) return;
  logger.info(
    `[PinRotation] Rotation des messages épinglés activée (max ${MAX_PINS} par salon, intervalle: 6h)`,
  );
  rotationInterval = safeInterval("PinRotation", () => rotatePins(client), CHECK_INTERVAL_MS);
}

export function stopPinRotation(): void {
  if (rotationInterval) {
    clearInterval(rotationInterval);
    rotationInterval = null;
  }
}
