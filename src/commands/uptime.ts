import {
  SlashCommandBuilder,
  EmbedBuilder,
  ChatInputCommandInteraction,
} from "discord.js";
import logger from "../utils/logger.js";

export const commands = [
  new SlashCommandBuilder()
    .setName("uptime")
    .setDescription("Affiche les statistiques d\u2019ex\u00e9cution du bot")
    .toJSON(),
];

function formatDuration(totalSeconds: number): string {
  const s = Math.max(0, Math.floor(totalSeconds));
  const days = Math.floor(s / 86400);
  const hours = Math.floor((s % 86400) / 3600);
  const minutes = Math.floor((s % 3600) / 60);
  const seconds = s % 60;
  const parts: string[] = [];
  if (days) parts.push(`${days}j`);
  if (hours) parts.push(`${hours}h`);
  if (minutes) parts.push(`${minutes}m`);
  parts.push(`${seconds}s`);
  return parts.join(" ");
}

export async function handleCommand(
  interaction: ChatInputCommandInteraction,
): Promise<void> {
  const client = interaction.client;
  const mem = process.memoryUsage();
  const rssMb = (mem.rss / 1024 / 1024).toFixed(1);
  const heapMb = (mem.heapUsed / 1024 / 1024).toFixed(1);

  const embed = new EmbedBuilder()
    .setTitle("\ud83d\udcca Bot Uptime")
    .setColor(0x2b82d9)
    .addFields(
      { name: "\u23f1\ufe0f Uptime", value: formatDuration(process.uptime()), inline: true },
      { name: "\ud83c\uddfa Node", value: process.version, inline: true },
      { name: "\ud83c\udfaf Guilds", value: `${client.guilds.cache.size}`, inline: true },
      { name: "\ud83d\udc65 Utilisateurs", value: `${client.users.cache.size}`, inline: true },
      { name: "\ud83d\udce1 WS", value: `${client.ws.ping.toFixed(0)} ms`, inline: true },
      { name: "\ud83d\udcbe RSS", value: `${rssMb} MB`, inline: true },
      { name: "\ud83d\udce6 Heap", value: `${heapMb} MB`, inline: true },
      { name: "\ud83e\udde0 PID", value: `${process.pid}`, inline: true },
    )
    .setTimestamp(new Date());

  logger.info("event", { cmd: "uptime", user: interaction.user.id, guild: interaction.guildId },
    "/uptime invoked",
  );
  await interaction.reply({ embeds: [embed], ephemeral: true });
}
