import { ChatInputCommandInteraction, Client, TextChannel, EmbedBuilder, ChannelType, MessageFlags } from "discord.js";
import logger from "../utils/logger.js";
import { config } from "../config.js";
import { isValidEmbedImageUrl, FALLBACK_EMBED_IMAGE } from "../utils/image-helpers.js";

const FALLBACK = FALLBACK_EMBED_IMAGE;

interface BrokenMessage {
  messageId: string;
  channelId: string;
  embed: EmbedBuilder;
  content: string | null;
}

function isBrokenImageUrl(url: string | null | undefined): boolean {
  if (!url || url === "") return true;
  if (url === "none" || url === "undefined" || url === "null") return true;
  if (/\.ico(\?|#|$)/i.test(url)) return true;
  if (!/^https?:\/\//i.test(url)) return true;
  if (!/\.(png|jpe?g|gif|webp)(\?|#|$)/i.test(url)) return true;
  return false;
}

function getNotificationChannelIds(): string[] {
  const ids: string[] = [];
  const envKeys: (keyof typeof config)[] = [
    "steamEpicChannel",
    "playstationChannel",
    "xboxChannel",
    "nintendoChannel",
    "fortniteChannel",
    "instantGamingChannel",
    "twitterChannel",
    "gamingBlogChannel",
    "freeGamesChannel",
    "dedicatedChannel",
    "dealsChannel",
    "boutiqueChannel",
  ];
  for (const key of envKeys) {
    const val = config[key];
    if (typeof val === "string" && val.trim().length > 0) {
      ids.push(val.trim());
    }
  }
  return [...new Set(ids)];
}

export async function handleCommand(interaction: ChatInputCommandInteraction, client: Client): Promise<void> {
  await interaction.deferReply({ flags: [MessageFlags.Ephemeral] });

  const targetChannel = interaction.options.getChannel("salon");
  const limit = interaction.options.getInteger("limite") ?? 100;

  let channelIds: string[];
  if (targetChannel) {
    channelIds = [targetChannel.id];
  } else {
    channelIds = getNotificationChannelIds();
  }

  if (channelIds.length === 0) {
    await interaction.editReply("❌ Aucun salon de notification configuré. Spécifiez un salon avec l'option `salon`.");
    return;
  }

  await interaction.editReply(`🔍 Scan de ${channelIds.length} salon(s) — ${limit} messages par salon...`);

  let totalScanned = 0;
  let totalBroken = 0;
  let totalFixed = 0;
  let totalErrors = 0;

  for (const channelId of channelIds) {
    try {
      const channel = await client.channels.fetch(channelId);
      if (!channel || channel.type !== ChannelType.GuildText) {
        logger.warn(`[FixBrokenImages] Salon ${channelId} non textuel ou introuvable — ignoré`);
        continue;
      }

      const textChannel = channel as TextChannel;
      const messages = await textChannel.messages.fetch({ limit });

      for (const [msgId, msg] of messages) {
        totalScanned++;

        if (msg.embeds.length === 0) continue;

        let hasBrokenImage = false;
        let brokenEmbedIndex = -1;

        for (let i = 0; i < msg.embeds.length; i++) {
          const embed = msg.embeds[i];
          if (embed.image) {
            if (isBrokenImageUrl(embed.image.url)) {
              hasBrokenImage = true;
              brokenEmbedIndex = i;
              break;
            }
          }
        }

        if (!hasBrokenImage) continue;

        totalBroken++;

        try {
          const originalEmbed = msg.embeds[brokenEmbedIndex];
          const rebuiltEmbed = EmbedBuilder.from(originalEmbed);

          const imageUrl = originalEmbed.image?.url;
          if (isBrokenImageUrl(imageUrl)) {
            const embedTitle = originalEmbed.title || "";
            const embedUrl = originalEmbed.url || "";
            let newImageUrl: string | null = null;

            if (embedUrl && embedUrl.includes("youtube.com") || embedUrl?.includes("youtu.be")) {
              const match = embedUrl?.match(/(?:youtube\.com\/watch\?(?:.*[?&])?v=|youtu\.be\/|youtube\.com\/embed\/)([a-zA-Z0-9_-]{11})/);
              if (match) {
                newImageUrl = `https://img.youtube.com/vi/${match[1]}/hqdefault.jpg`;
              }
            }

            if (!newImageUrl) {
              newImageUrl = FALLBACK;
            }

            rebuiltEmbed.setImage(newImageUrl);
          }

          await msg.delete();
          await textChannel.send({
            embeds: [rebuiltEmbed],
            content: msg.content || undefined,
          });

          totalFixed++;
          logger.info(`[FixBrokenImages] Corrigé: ${msgId} dans #${textChannel.name}`);
          await new Promise((resolve) => setTimeout(resolve, 500));
        } catch (fixErr) {
          totalErrors++;
          logger.error(`[FixBrokenImages] Erreur correction ${msgId}: ${fixErr instanceof Error ? fixErr.message : String(fixErr)}`);
        }
      }

      logger.info(`[FixBrokenImages] Salon #${textChannel.name} scanné: ${messages.size} messages`);
    } catch (chanErr) {
      totalErrors++;
      logger.error(`[FixBrokenImages] Erreur salon ${channelId}: ${chanErr instanceof Error ? chanErr.message : String(chanErr)}`);
    }
  }

  const resultEmbed = new EmbedBuilder()
    .setTitle("🔧 Nettoyage d'images brisées — Rapport")
    .setColor(0x00ff00)
    .addFields(
      { name: "Salons scannés", value: `${channelIds.length}`, inline: true },
      { name: "Messages scannés", value: `${totalScanned}`, inline: true },
      { name: "Images brisées", value: `${totalBroken}`, inline: true },
      { name: "Corrigés", value: `${totalFixed}`, inline: true },
      { name: "Erreurs", value: `${totalErrors}`, inline: true },
    )
    .setTimestamp();

  await interaction.editReply({ content: null, embeds: [resultEmbed] });
}
