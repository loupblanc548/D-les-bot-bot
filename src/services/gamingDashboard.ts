import { EmbedBuilder, Client } from "discord.js";
import logger from "../utils/logger.js";
import { getPlayerSummaries } from "./steam.js";
import { getPlayer, getPlayerRank } from "./valorant.js";
import prisma from "../prisma.js";

export interface GamingDashboardData {
  valorant: { name: string; rank: string; rr: number; level: number } | null;
  steam: { persona: string; level: number; games: number } | null;
  trackedGames: number; recentDeals: number; freeGames: number;
}

export async function buildGamingDashboard(discordId: string): Promise<GamingDashboardData> {
  const steamLink = await prisma.userSteamLink.findFirst({ where: { discordId } }).catch(() => null);
  const [valorantData, steamData, trackedCount, dealsCount, freeCount] = await Promise.all([
    getValorantData(discordId),
    steamLink ? getSteamData(steamLink.steamId) : Promise.resolve(null),
    prisma.trackedGame.count(),
    prisma.processedDeal.count({ where: { createdAt: { gte: new Date(Date.now() - 7 * 86400000) } } }),
    prisma.processedFreeGames.count(),
  ]);
  return { valorant: valorantData, steam: steamData, trackedGames: trackedCount, recentDeals: dealsCount, freeGames: freeCount };
}

async function getValorantData(discordId: string): Promise<GamingDashboardData["valorant"]> {
  try {
    const name = process.env[`VALORANT_NAME_${discordId}`] || "";
    const tag = process.env[`VALORANT_TAG_${discordId}`] || "";
    if (!name || !tag) return null;
    const [player, rank] = await Promise.all([getPlayer(name, tag), getPlayerRank(name, tag)]);
    if (!player) return null;
    return { name: `${player.gameName}#${player.tagLine}`, rank: rank?.rank || "Unranked", rr: rank?.rr || 0, level: player.accountLevel };
  } catch { return null; }
}

async function getSteamData(steamId: string): Promise<GamingDashboardData["steam"]> {
  try {
    const players = await getPlayerSummaries([steamId]);
    const p = players[0]; if (!p) return null;
    return { persona: p.personaname || "Unknown", level: p.player_level || 0, games: p.game_count || 0 };
  } catch { return null; }
}

export function buildDashboardEmbed(data: GamingDashboardData): EmbedBuilder {
  const embed = new EmbedBuilder().setTitle("🎮 Dashboard Gaming").setColor("#5865F2").setTimestamp();
  if (data.valorant) embed.addFields({ name: "🔴 Valorant", value: `**${data.valorant.name}**\nRank: ${data.valorant.rank}\nRR: ${data.valorant.rr}\nNiveau: ${data.valorant.level}`, inline: true });
  if (data.steam) embed.addFields({ name: "🔵 Steam", value: `**${data.steam.persona}**\nNiveau: ${data.steam.level}\nJeux: ${data.steam.games}`, inline: true });
  embed.addFields({ name: "📊 Stats Serveur", value: `Jeux suivis: ${data.trackedGames}\nDeals (7j): ${data.recentDeals}\nJeux gratuits: ${data.freeGames}`, inline: false });
  return embed;
}

export async function sendLiveDashboard(client: Client, channelId: string, discordId: string): Promise<void> {
  try {
    const channel = client.channels.cache.get(channelId);
    if (!channel?.isTextBased()) return;
    const data = await buildGamingDashboard(discordId);
    await (channel as { send: (opts: { embeds: EmbedBuilder[] }) => Promise<unknown> }).send({ embeds: [buildDashboardEmbed(data)] });
  } catch (err) { logger.error(`[GamingDashboard] Error: ${err instanceof Error ? err.message : String(err)}`); }
}
