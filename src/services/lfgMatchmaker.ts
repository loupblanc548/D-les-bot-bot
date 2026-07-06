import { Client, TextChannel, EmbedBuilder, ChannelType, VoiceChannel } from "discord.js";
import logger from "../utils/logger.js";
import prisma from "../prisma.js";

interface LFGRequest {
  userId: string;
  username: string;
  game: string;
  platform: string;
  rank: string;
  maxPlayers: number;
  createdAt: number;
  channelId: string;
}

const activeRequests: Map<string, LFGRequest> = new Map();
const REQUEST_TIMEOUT_MS = 30 * 60 * 1000;

export async function createLFGRequest(
  client: Client,
  userId: string,
  username: string,
  game: string,
  platform: string,
  rank: string,
  maxPlayers: number,
  channelId: string,
): Promise<void> {
  const req: LFGRequest = {
    userId,
    username,
    game,
    platform,
    rank,
    maxPlayers,
    createdAt: Date.now(),
    channelId,
  };

  activeRequests.set(userId, req);

  const matches = findMatches(req);
  if (matches.length > 0) {
    await createLFGSession(client, req, matches);
  } else {
    const channel = client.channels.cache.get(channelId) as TextChannel;
    if (channel?.isTextBased()) {
      const embed = new EmbedBuilder()
        .setTitle(`🎮 LFG — ${game}`)
        .setDescription(`**${username}** cherche ${maxPlayers - 1} joueur(s) pour **${game}**\n**Plateforme:** ${platform}\n**Rang:** ${rank}`)
        .setColor(0x00ff00)
        .setFooter({ text: "Surveillance System • LFG Matchmaker — En attente de joueurs" })
        .setTimestamp();

      await channel.send({ embeds: [embed], content: `Rejoignez la partie avec /lfg join ${userId}` });
    }
  }

  setTimeout(() => {
    if (activeRequests.has(userId)) {
      activeRequests.delete(userId);
    }
  }, REQUEST_TIMEOUT_MS);
}

function findMatches(req: LFGRequest): LFGRequest[] {
  const matches: LFGRequest[] = [];
  for (const [id, other] of activeRequests) {
    if (id === req.userId) continue;
    if (other.game.toLowerCase() !== req.game.toLowerCase()) continue;
    if (other.platform.toLowerCase() !== req.platform.toLowerCase()) continue;
    matches.push(other);
    if (matches.length >= req.maxPlayers - 1) break;
  }
  return matches;
}

async function createLFGSession(client: Client, host: LFGRequest, matches: LFGRequest[]): Promise<void> {
  const guild = client.guilds.cache.first();
  if (!guild) return;

  const voiceChannel = await guild.channels.create({
    name: `🎮 ${host.game} — LFG`,
    type: ChannelType.GuildVoice,
    userLimit: host.maxPlayers,
  }).catch(() => null);

  const channel = client.channels.cache.get(host.channelId) as TextChannel;
  if (channel?.isTextBased()) {
    const playerList = [host.username, ...matches.map((m) => m.username)];
    const embed = new EmbedBuilder()
      .setTitle(`🎮 Groupe LFG trouvé — ${host.game}`)
      .setDescription(`**Joueurs:** ${playerList.join(", ")}\n**Plateforme:** ${host.platform}\n**Rang:** ${host.rank}`)
      .setColor(0x00ff00)
      .addFields({ name: "Salon vocal", value: voiceChannel ? `<#${voiceChannel.id}>` : "Création échouée", inline: false })
      .setFooter({ text: "Surveillance System • LFG Matchmaker — Bon jeu !" })
      .setTimestamp();

    await channel.send({ embeds: [embed], content: playerList.map((u) => `@${u}`).join(" ") });
  }

  for (const req of [host, ...matches]) {
    activeRequests.delete(req.userId);
  }

  setTimeout(async () => {
    if (voiceChannel) {
      await voiceChannel.delete().catch(() => {});
    }
  }, REQUEST_TIMEOUT_MS);

  logger.info(`[LFG] Session créée pour ${host.game} — ${playerList(host, matches)} joueur(s)`);
}

function playerList(host: LFGRequest, matches: LFGRequest[]): number {
  return 1 + matches.length;
}

export function startLFGMatchmaker(client: Client): void {
  logger.info("[LFG] Matchmaker intelligent activé");
}
