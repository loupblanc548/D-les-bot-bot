import { Client, TextChannel, EmbedBuilder } from "discord.js";
import logger from "../utils/logger.js";
import { safeInterval } from "../utils/safe-interval.js";
import prisma from "../prisma.js";

const CHECK_INTERVAL_MS = 6 * 60 * 60 * 1000;
let roleInterval: NodeJS.Timeout | null = null;

const CREATOR_ROLE_CONFIG: Record<string, { roleName: string; minFollowers: number }> = {
  youtube: { roleName: "Créateur YouTube", minFollowers: 1000 },
  twitch: { roleName: "Créateur Twitch", minFollowers: 500 },
};

async function checkYouTubeSubscribers(channelId: string): Promise<number> {
  try {
    const apiKey = process.env.YOUTUBE_API_KEY;
    if (!apiKey) return 0;
    const res = await fetch(
      `https://www.googleapis.com/youtube/v3/channels?part=statistics&id=${channelId}&key=${apiKey}`,
    );
    if (!res.ok) return 0;
    const data = await res.json() as any;
    return parseInt(data.items?.[0]?.statistics?.subscriberCount ?? "0");
  } catch {
    return 0;
  }
}

async function checkTwitchFollowers(username: string): Promise<number> {
  try {
    const clientId = process.env.TWITCH_CLIENT_ID;
    const clientSecret = process.env.TWITCH_CLIENT_SECRET;
    if (!clientId || !clientSecret) return 0;

    const tokenRes = await fetch(
      `https://id.twitch.tv/oauth2/token?client_id=${clientId}&client_secret=${clientSecret}&grant_type=client_credentials`,
      { method: "POST" },
    );
    if (!tokenRes.ok) return 0;
    const tokenData = await tokenRes.json() as any;

    const userRes = await fetch(`https://api.twitch.tv/helix/users?login=${username}`, {
      headers: { "Client-ID": clientId, Authorization: `Bearer ${tokenData.access_token}` },
    });
    if (!userRes.ok) return 0;
    const userData = await userRes.json() as any;
    const userId = userData.data?.[0]?.id;
    if (!userId) return 0;

    const followRes = await fetch(`https://api.twitch.tv/helix/channels/followers?broadcaster_id=${userId}`, {
      headers: { "Client-ID": clientId, Authorization: `Bearer ${tokenData.access_token}` },
    });
    if (!followRes.ok) return 0;
    const followData = await followRes.json() as any;
    return followData.total ?? 0;
  } catch {
    return 0;
  }
}

async function checkCreatorRoles(client: Client): Promise<void> {
  const creators = (process.env.TRACKED_CREATORS || "")
    .split(",")
    .map((s) => s.trim())
    .filter(Boolean);

  for (const creatorStr of creators) {
    const [platform, identifier, discordId] = creatorStr.split(":");
    if (!platform || !identifier || !discordId) continue;

    const config = CREATOR_ROLE_CONFIG[platform.toLowerCase()];
    if (!config) continue;

    let followers = 0;
    if (platform.toLowerCase() === "youtube") {
      followers = await checkYouTubeSubscribers(identifier);
    } else if (platform.toLowerCase() === "twitch") {
      followers = await checkTwitchFollowers(identifier);
    }

    if (followers < config.minFollowers) continue;

    for (const guild of client.guilds.cache.values()) {
      const member = await guild.members.fetch(discordId).catch(() => null);
      if (!member) continue;

      const role = guild.roles.cache.find((r) => r.name === config.roleName);
      if (role && !member.roles.cache.has(role.id)) {
        await member.roles.add(role);
        logger.info(`[CreatorRoles] ${member.user.tag} → rôle ${config.roleName} (${followers} followers)`);

        try {
          const dm = await member.createDM();
          await dm.send(`🎉 Félicitations ! Tu as reçu le rôle **${config.roleName}** sur **${guild.name}** car tu as ${followers} followers !`);
        } catch {}
      }
    }
  }
}

export function startCreatorRoleSync(client: Client): void {
  if (roleInterval) return;
  if (!process.env.TRACKED_CREATORS) {
    logger.info("[CreatorRoles] Service désactivé (TRACKED_CREATORS vide)");
    return;
  }
  logger.info("[CreatorRoles] Sync rôles créateur activé (intervalle: 6h)");
  roleInterval = safeInterval("CreatorRoleSync", () => checkCreatorRoles(client), CHECK_INTERVAL_MS);
}

export function stopCreatorRoleSync(): void {
  if (roleInterval) {
    clearInterval(roleInterval);
    roleInterval = null;
  }
}
