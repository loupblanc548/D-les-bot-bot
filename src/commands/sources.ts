import logger from "../utils/logger.js";
import { ChatInputCommandInteraction, SlashCommandBuilder, EmbedBuilder } from "discord.js";
import prisma from "../prisma.js";
import { resolveYouTubeChannelId } from "../services/youtube.js";
import { requireAdmin } from "../services/permissions.js";

export const commands: ReturnType<SlashCommandBuilder["toJSON"]>[] = [];

export async function handleAddSource(interaction: ChatInputCommandInteraction) {
  if (!(await requireAdmin(interaction))) return;
  await interaction.deferReply({ ephemeral: true });
  try {
    const rawHandle = interaction.options.getString("handle", true);
    let type = interaction.options.getString("type", true);
    const channel = interaction.options.getChannel("salon");
    const guildId = interaction.guildId!;
    const targetChannelId = channel?.id || interaction.channelId;
    const handle = rawHandle.startsWith("@") ? rawHandle : "@" + rawHandle;
    let urlOrHandle = handle;
    if (type === "YOUTUBE" || type === "YOUTUBE_ONLY") {
      const resolvedId = await resolveYouTubeChannelId(handle);
      if (!resolvedId) {
        const embedErreur = new EmbedBuilder()
          .setTitle("Chaîne YouTube introuvable")
          .setDescription(
            "Impossible de résoudre la chaîne **" +
              handle +
              "**.\n" +
              "Vérifie que le handle est correct (ex: `@MrBeast`) ou utilise un ID de chaîne (format `UC...`).",
          )
          .setColor(0xff3344)
          .setTimestamp();
        await interaction.editReply({ embeds: [embedErreur] });
        return;
      }
      urlOrHandle = resolvedId;
      if (type === "YOUTUBE_ONLY") type = "YOUTUBE";
    }
    try {
      await prisma.source.create({
        data: { guildId, channelId: targetChannelId, type, urlOrHandle, lastProcessedId: null },
      });
    } catch (err: unknown) {
      if ((err as any)?.code === "P2002") {
        await interaction.editReply({
          content:
            "**" + handle + "** est déjà enregistré comme source (" + type + ") dans ce salon.",
        });
        return;
      }
      throw err;
    }
    const embed = new EmbedBuilder()
      .setTitle("Source ajoutée")
      .setDescription(
        "La source [" +
          type +
          "] pour **[" +
          handle +
          "]** a bien été ajoutée.\n" +
          "Les notifications seront envoyées dans <#" +
          targetChannelId +
          ">.",
      )
      .setColor(0x53fc18)
      .setTimestamp();
    await interaction.editReply({ embeds: [embed] });
  } catch (error) {
    logger.error("[CRASH COMMANDE ADDSOURCE]:", error);
    try {
      await interaction.editReply({ content: "Impossible d'ajouter cette source." });
    } catch {
      try {
        await interaction.followUp({
          content: "Impossible d'ajouter cette source.",
          ephemeral: true,
        });
      } catch {}
    }
  }
}

export async function handleRemoveSource(interaction: ChatInputCommandInteraction) {
  if (!(await requireAdmin(interaction))) return;
  await interaction.deferReply({ ephemeral: true });
  try {
    const rawHandle = interaction.options.getString("handle", true);
    const guildId = interaction.guildId!;
    const handle = rawHandle.replace("@", "");
    const source = await prisma.source.findFirst({
      where: { guildId, OR: [{ urlOrHandle: handle }, { urlOrHandle: "@" + handle }] },
    });
    if (!source) {
      await interaction.editReply({
        content: "@" + handle + " n'est pas dans les sources de ce serveur",
      });
      return;
    }
    await prisma.source.delete({ where: { id: source.id } });
    await interaction.editReply({ content: "@" + handle + " supprimé des sources" });
  } catch (error) {
    logger.error("[CRASH COMMANDE REMOVESOURCE]:", error);
    try {
      await interaction.editReply({ content: "Impossible de supprimer cette source." });
    } catch {
      try {
        await interaction.followUp({
          content: "Impossible de supprimer cette source.",
          ephemeral: true,
        });
      } catch {}
    }
  }
}

export async function handleListSources(interaction: ChatInputCommandInteraction) {
  await interaction.deferReply({ ephemeral: true });
  try {
    const guildId = interaction.guildId!;
    const sources = await prisma.source.findMany({ where: { guildId } });
    const youtubeSources = sources.filter((s) => s.type === "YOUTUBE");
    const twitterSources = sources.filter((s) => s.type === "TWITTER");
    const otherSources = sources.filter((s) => s.type !== "YOUTUBE" && s.type !== "TWITTER");
    const embed = new EmbedBuilder()
      .setTitle("Sources surveillées")
      .setColor(0x2f3136)
      .setTimestamp();
    if (youtubeSources.length > 0) {
      embed.addFields({
        name: "YouTube",
        value: youtubeSources
          .map((s) => (s.urlOrHandle.startsWith("UC") ? "`" + s.urlOrHandle + "`" : s.urlOrHandle))
          .join("\n"),
        inline: true,
      });
    }
    if (twitterSources.length > 0) {
      embed.addFields({
        name: "Twitter/X",
        value: twitterSources.map((s) => s.urlOrHandle).join("\n"),
        inline: true,
      });
    }
    if (otherSources.length > 0) {
      embed.addFields({
        name: "Autres",
        value: otherSources.map((s) => s.type + ": " + s.urlOrHandle).join("\n"),
        inline: true,
      });
    }
    if (sources.length === 0) {
      embed.setDescription("Aucune source configurée. Utilise `/addsource` pour en ajouter.");
    }
    await interaction.editReply({ embeds: [embed] });
  } catch (error) {
    logger.error("[CRASH COMMANDE LISTSOURCES]:", error);
    try {
      await interaction.editReply({ content: "Impossible de lister les sources." });
    } catch {
      try {
        await interaction.followUp({
          content: "Impossible de lister les sources.",
          ephemeral: true,
        });
      } catch {}
    }
  }
}

export async function handleCommand(_interaction: ChatInputCommandInteraction): Promise<void> {
  // Commandes migrées vers admin.ts (add-source, remove-source, list-sources)
}
