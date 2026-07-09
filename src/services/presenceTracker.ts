import { Client, TextChannel, EmbedBuilder, Presence } from "discord.js";
import logger from "../utils/logger.js";
import { safeInterval } from "../utils/safe-interval.js";
import { config } from "../config.js";

const CHECK_INTERVAL_MS = parseInt(process.env.PRESENCE_TRACKER_INTERVAL_MS || "3600000", 10); // 1h
let presenceInterval: NodeJS.Timeout | null = null;

const PLATFORM_CHANNELS: Record<string, { channelId: string; keywords: string[]; label: string; color: number }> = {
  steam: { channelId: config.steamEpicChannel, keywords: ["steam", "csgo", "cs2", "dota", "tf2", "garry", "pubg", "apex", "elden ring", "cyberpunk"], label: "Steam/Epic", color: 0x1b2838 },
  playstation: { channelId: config.playstationChannel, keywords: ["playstation", "ps5", "ps4", "spider-man", "god of war", "horizon", "demon souls", "bloodborne"], label: "PlayStation", color: 0x003791 },
  xbox: { channelId: config.xboxChannel, keywords: ["xbox", "halo", "forza", "fable", "sea of thieves", "game pass"], label: "Xbox", color: 0x107c10 },
  nintendo: { channelId: config.nintendoChannel, keywords: ["nintendo", "switch", "mario", "zelda", "pokemon", "smash", "metroid", "splatoon"], label: "Nintendo", color: 0xe60012 },
  fortnite: { channelId: config.fortniteChannel, keywords: ["fortnite", "battle royale"], label: "Fortnite", color: 0x9147ff },
};

function classifyGame(gameName: string): string | null {
  const lower = gameName.toLowerCase();
  for (const [platform, cfg] of Object.entries(PLATFORM_CHANNELS)) {
    if (cfg.keywords.some((kw) => lower.includes(kw))) return platform;
  }
  return null;
}

async function checkRichPresence(client: Client): Promise<void> {
  const gameStats = new Map<string, { count: number; players: string[] }>();

  for (const guild of client.guilds.cache.values()) {
    try {
      const members = await guild.members.fetch({ withPresences: true, limit: 200 });
      for (const [, member] of members) {
        if (member.user.bot) continue;
        const presence = member.presence;
        if (!presence) continue;

        for (const activity of presence.activities ?? []) {
          if (activity.type !== 0) continue;
          const gameName = activity.name;
          if (!gameName) continue;

          const existing = gameStats.get(gameName) ?? { count: 0, players: [] };
          existing.count++;
          if (existing.players.length < 10) existing.players.push(member.user.username);
          gameStats.set(gameName, existing);
        }
      }
    } catch {}
  }

  const platformGroups = new Map<string, { game: string; count: number; players: string[] }[]>();
  for (const [gameName, stats] of gameStats) {
    const platform = classifyGame(gameName);
    if (!platform) continue;
    const group = platformGroups.get(platform) ?? [];
    group.push({ game: gameName, count: stats.count, players: stats.players });
    platformGroups.set(platform, group);
  }

  for (const [platform, games] of platformGroups) {
    const cfg = PLATFORM_CHANNELS[platform];
    if (!cfg?.channelId) continue;

    const channel = client.channels.cache.get(cfg.channelId) as TextChannel;
    if (!channel?.isTextBased()) continue;

    const sortedGames = games.sort((a, b) => b.count - a.count).slice(0, 10);

    const embed = new EmbedBuilder()
      .setTitle(`🎮 Jeux en cours — ${cfg.label}`)
      .setColor(cfg.color)
      .setDescription("Stats basées sur la Rich Presence Discord des membres")
      .setFooter({ text: `Surveillance System • Rich Presence Tracker • ${cfg.label}` })
      .setTimestamp();

    for (const g of sortedGames) {
      embed.addFields({
        name: g.game,
        value: `**${g.count} joueur(s)** — ${g.players.join(", ")}`,
        inline: false,
      });
    }

    try {
      await channel.send({ embeds: [embed] });
      logger.info(`[PresenceTracker] Stats envoyées pour ${cfg.label} — ${sortedGames.length} jeu(x)`);
    } catch (err) {
      logger.error(`[PresenceTracker] Erreur envoi: ${err instanceof Error ? err.message : String(err)}`);
    }
  }
}

export function startPresenceTracker(client: Client): void {
  if (presenceInterval) return;
  logger.info("[PresenceTracker] Tracking Rich Presence activé (intervalle: 6h) — routing par plateforme");
  presenceInterval = safeInterval("PresenceTracker", () => checkRichPresence(client), CHECK_INTERVAL_MS);
}

export function stopPresenceTracker(): void {
  if (presenceInterval) {
    clearInterval(presenceInterval);
    presenceInterval = null;
  }
}
