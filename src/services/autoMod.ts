/**
 * autoMod.ts — Auto-modération configurable
 *
 * Détecte et agit sur: mots interdits, spam, caps, liens, invites Discord
 * Seuils configurables par serveur via Prisma.
 */

import type { Message, GuildMember } from "discord.js";
import logger from "../utils/logger.js";

export type AutoModAction = "warn" | "delete" | "mute" | "kick";

export interface AutoModRule {
  enabled: boolean;
  bannedWords: string[];
  spamThreshold: number;
  spamWindowMs: number;
  capsThreshold: number;
  capsMinLength: number;
  blockLinks: boolean;
  blockInvites: boolean;
  allowedLinkDomains: string[];
  action: AutoModAction;
  exemptRoles: string[];
}

export const DEFAULT_RULES: AutoModRule = {
  enabled: true,
  bannedWords: [],
  spamThreshold: 5,
  spamWindowMs: 5000,
  capsThreshold: 70,
  capsMinLength: 10,
  blockLinks: false,
  blockInvites: true,
  allowedLinkDomains: [],
  action: "delete",
  exemptRoles: [],
};

interface ViolationResult {
  violated: boolean;
  reason: string;
  action: AutoModAction;
}

const messageTimestamps = new Map<string, number[]>();

export function checkMessage(message: Message, rules: AutoModRule): ViolationResult {
  if (!rules.enabled) return { violated: false, reason: "", action: "warn" };

  const content = message.content;
  if (!content || content.length === 0) return { violated: false, reason: "", action: "warn" };

  // Banned words
  const lower = content.toLowerCase();
  for (const word of rules.bannedWords) {
    if (lower.includes(word.toLowerCase())) {
      return { violated: true, reason: `Mot interdit détecté: "${word}"`, action: rules.action };
    }
  }

  // Discord invites
  if (rules.blockInvites && /discord\.(gg|com\/invite)\//i.test(content)) {
    return { violated: true, reason: "Invite Discord détecté", action: rules.action };
  }

  // Links
  if (rules.blockLinks) {
    const urlMatch = content.match(/https?:\/\/([^\s/]+)/g);
    if (urlMatch) {
      const hasDisallowed = urlMatch.some((url) => {
        const domain = new URL(url).hostname;
        return !rules.allowedLinkDomains.some((allowed) => domain.endsWith(allowed));
      });
      if (hasDisallowed) {
        return { violated: true, reason: "Lien non autorisé", action: rules.action };
      }
    }
  }

  // Caps
  if (content.length >= rules.capsMinLength) {
    const capsRatio =
      (content.replace(/[^A-Za-z]/g, "").match(/[A-Z]/g)?.length ?? 0) /
      Math.max(1, content.replace(/[^A-Za-z]/g, "").length);
    if (capsRatio * 100 >= rules.capsThreshold) {
      return { violated: true, reason: "Excès de majuscules", action: rules.action };
    }
  }

  // Spam
  const key = `${message.guildId}:${message.author.id}`;
  const now = Date.now();
  const timestamps = (messageTimestamps.get(key) ?? []).filter((t) => now - t < rules.spamWindowMs);
  timestamps.push(now);
  messageTimestamps.set(key, timestamps);
  if (timestamps.length > rules.spamThreshold) {
    return { violated: true, reason: "Spam détecté", action: rules.action };
  }

  return { violated: false, reason: "", action: "warn" };
}

export function isMemberExempt(member: GuildMember, rules: AutoModRule): boolean {
  if (member.permissions.has("Administrator")) return true;
  return rules.exemptRoles.some((roleId) => member.roles.cache.has(roleId));
}

export async function executeAction(
  message: Message,
  action: AutoModAction,
  reason: string,
): Promise<void> {
  try {
    switch (action) {
      case "delete":
        await message.delete();
        break;
      case "warn":
        await message.reply(`⚠️ ${reason}`);
        break;
      case "mute":
        if (message.member) {
          await message.member.timeout(60_000, reason);
        }
        break;
      case "kick":
        if (message.member) {
          await message.member.kick(reason);
        }
        break;
    }
  } catch (err) {
    logger.warn(
      `[AutoMod] Action ${action} failed: ${err instanceof Error ? err.message : String(err)}`,
    );
  }
}

// Cleanup stale spam tracking entries periodically
setInterval(() => {
  const now = Date.now();
  for (const [key, timestamps] of messageTimestamps.entries()) {
    const recent = timestamps.filter((t) => now - t < 60_000);
    if (recent.length === 0) messageTimestamps.delete(key);
    else messageTimestamps.set(key, recent);
  }
}, 300_000).unref?.();
