/**
 * autoThread.ts — Création automatique de threads sur certains canaux
 */
import { Client, Events, TextChannel, ForumChannel, ChannelType, SlashCommandBuilder, ChatInputCommandInteraction, MessageFlags } from "discord.js";
import prisma from "../prisma.js";
import logger from "../utils/logger.js";

export const commands = [
  new SlashCommandBuilder()
    .setName("autothread")
    .setDescription("Configure la création automatique de threads sur un salon")
    .addSubcommand((sub) =>
      sub.setName("enable").setDescription("Active l'auto-thread sur ce salon")
        .addChannelOption((o) => o.setName("salon").setDescription("Le salon concerné").addChannelTypes(ChannelType.GuildText).setRequired(true))
        .addStringOption((o) => o.setName("format").setDescription("Format du titre (ex: {author} - {date})").setRequired(false)),
    )
    .addSubcommand((sub) =>
      sub.setName("disable").setDescription("Désactive l'auto-thread sur ce salon")
        .addChannelOption((o) => o.setName("salon").setDescription("Le salon concerné").addChannelTypes(ChannelType.GuildText).setRequired(true)),
    )
    .addSubcommand((sub) =>
      sub.setName("list").setDescription("Liste les salons avec auto-thread activé"),
    )
    .toJSON(),
];

export async function handleCommand(interaction: ChatInputCommandInteraction): Promise<void> {
  if (interaction.commandName !== "autothread") return;
  if (!interaction.guildId) return;

  const sub = interaction.options.getSubcommand();

  if (sub === "enable") {
    const channel = interaction.options.getChannel("salon", true);
    const format = interaction.options.getString("format") || "{author} - {date}";

    try {
      await prisma.$executeRaw`CREATE TABLE IF NOT EXISTS auto_thread_config (guildId TEXT, channelId TEXT, format TEXT, PRIMARY KEY (guildId, channelId))`;
      await prisma.$executeRaw`INSERT OR REPLACE INTO auto_thread_config (guildId, channelId, format) VALUES (${interaction.guildId}, ${channel.id}, ${format})`;
    } catch (err) {
      logger.error(`[AutoThread] DB error: ${err instanceof Error ? err.message : String(err)}`);
    }

    logger.info(`[AutoThread] Activé sur #${channel.name} (${channel.id})`);
    await interaction.reply({ content: `✅ Auto-thread activé sur <#${channel.id}> avec le format: \`${format}\``, flags: [MessageFlags.Ephemeral] });
  }

  if (sub === "disable") {
    const channel = interaction.options.getChannel("salon", true);
    try {
      await prisma.$executeRaw`DELETE FROM auto_thread_config WHERE guildId = ${interaction.guildId} AND channelId = ${channel.id}`;
    } catch {}
    logger.info(`[AutoThread] Désactivé sur #${channel.name}`);
    await interaction.reply({ content: `✅ Auto-thread désactivé sur <#${channel.id}>`, flags: [MessageFlags.Ephemeral] });
  }

  if (sub === "list") {
    let channels: { channelId: string; format: string }[] = [];
    try {
      channels = await prisma.$queryRaw`SELECT channelId, format FROM auto_thread_config WHERE guildId = ${interaction.guildId}` as any;
    } catch {
      // Table doesn't exist yet
    }

    if (channels.length === 0) {
      await interaction.reply({ content: "Aucun salon avec auto-thread activé.", flags: [MessageFlags.Ephemeral] });
      return;
    }

    const list = channels.map((c) => `- <#${c.channelId}> — Format: \`${c.format}\``).join("\n");
    await interaction.reply({ content: `**Salons avec auto-thread:**\n${list}`, flags: [MessageFlags.Ephemeral] });
  }
}

export function attachAutoThread(client: Client): void {
  client.on(Events.MessageCreate, async (message) => {
    if (message.author.bot || !message.guildId || message.channel.type !== ChannelType.GuildText) return;

    let config: { format: string } | null = null;
    try {
      const results = await prisma.$queryRaw`SELECT format FROM auto_thread_config WHERE guildId = ${message.guildId} AND channelId = ${message.channelId}` as any[];
      if (results.length > 0) config = results[0];
    } catch {
      return; // Table doesn't exist
    }

    if (!config) return;

    const format = config.format
      .replace("{author}", message.author.username)
      .replace("{date}", new Date().toLocaleDateString("fr-FR"))
      .replace("{content}", message.content.substring(0, 50));

    try {
      await message.startThread({ name: format.substring(0, 100), autoArchiveDuration: 1440 });
    } catch (err) {
      logger.error(`[AutoThread] Erreur création thread: ${err instanceof Error ? err.message : String(err)}`);
    }
  });

  logger.info("[AutoThread] Listener attaché");
}
