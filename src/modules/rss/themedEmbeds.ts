import { EmbedBuilder, AttachmentBuilder } from "discord.js";
import { getBlogImage, resolveImageUrl, createImageAttachment, isValidEmbedImageUrl } from "../../utils/image-helpers.js";

interface RSSItem {
  title: string;
  description: string;
  link: string;
  pubDate?: string;
  guid?: string;
  author?: string;
  category?: string;
}

const PLAYSTATION_BLOG_BASE = "https://blog.playstation.com";

export function createEpicEmbed(item: RSSItem): EmbedBuilder {
  const cleanDescription = cleanHTML(item.description).substring(0, 250);

  return new EmbedBuilder()
    .setAuthor({ name: "📦 LARGAGE TACTIQUE DE JEU GRATUIT" })
    .setColor("#00AAFF")
    .addFields(
      { name: "🏷️ PROD", value: `**${item.title}**`, inline: true },
      { name: "💰 VALEUR", value: "~~19.99 €~~ ➔ **GRATUIT**", inline: true },
      { name: "🏢 RECRUTEUR", value: item.author || "Epic Games", inline: true },
    )
    .setDescription(cleanDescription)
    .setURL(item.link)
    .setTimestamp(item.pubDate ? new Date(item.pubDate) : new Date());
}

export function createSteamEmbed(item: RSSItem): EmbedBuilder {
  const cleanDescription = cleanHTML(item.description).substring(0, 250);

  return new EmbedBuilder()
    .setAuthor({ name: "📦 LARGAGE TACTIQUE DE JEU GRATUIT" })
    .setColor("#1b2838")
    .addFields(
      { name: "🏷️ PROD", value: `**${item.title}**`, inline: true },
      { name: "💰 VALEUR", value: "~~29.99 €~~ ➔ **GRATUIT**", inline: true },
      { name: "🏢 RECRUTEUR", value: item.author || "Valve", inline: true },
    )
    .setDescription(cleanDescription)
    .setURL(item.link)
    .setTimestamp(item.pubDate ? new Date(item.pubDate) : new Date());
}

export async function createPlayStationEmbed(item: RSSItem): Promise<{ embed: EmbedBuilder; files?: AttachmentBuilder[] }> {
  const cleanDescription = cleanHTML(item.description);
  const timestamp = item.pubDate ? Math.floor(new Date(item.pubDate).getTime() / 1000) : Math.floor(Date.now() / 1000);

  const embed = new EmbedBuilder()
    .setAuthor({ name: "📡 TRANSMISSION ENTRANTE // INTEL PLAYSTATION" })
    .setColor("#003087")
    .setTitle(`➢ ${item.title}`)
    .setDescription(`> ${cleanDescription}\n\n📅 Publication: <t:${timestamp}:R>`)
    .setURL(item.link)
    .setTimestamp(item.pubDate ? new Date(item.pubDate) : new Date());

  // Fetch image from the article page (handles og:image, lazy-loading, relative URLs)
  let imageUrl: string | null = null;
  try {
    imageUrl = await getBlogImage(item.link);
  } catch {
    // Image fetch is optional
  }

  if (imageUrl) {
    // Resolve relative URLs against PlayStation blog base
    imageUrl = resolveImageUrl(imageUrl, PLAYSTATION_BLOG_BASE);

    if (isValidEmbedImageUrl(imageUrl)) {
      // Try setting the image URL directly first
      embed.setImage(imageUrl);

      // Anti-hotlinking fallback: download image as buffer and attach locally
      // This handles Cloudflare/403 blocks where Discord can't fetch the image
      try {
        const attachmentResult = await createImageAttachment(imageUrl);
        if (attachmentResult) {
          // Use attachment://filename as image URL so Discord uses the local file
          embed.setImage(`attachment://${attachmentResult.filename}`);
          return { embed, files: [attachmentResult.attachment] };
        }
      } catch {
        // If download fails, keep the remote URL — Discord may still be able to fetch it
      }
    }
  }

  return { embed };
}

export function createXboxEmbed(item: RSSItem): EmbedBuilder {
  const cleanDescription = cleanHTML(item.description);

  return new EmbedBuilder()
    .setAuthor({ name: "🟢 SYSTEM_LOG // SÉCURITÉ XBOX" })
    .setColor("#107C10")
    .setTitle(item.title)
    .setDescription(`▪️ ${cleanDescription}\n\n─────────────────────\n🔗 ${item.link}`)
    .setURL(item.link)
    .setTimestamp(item.pubDate ? new Date(item.pubDate) : new Date());
}

export function createNintendoEmbed(item: RSSItem): EmbedBuilder {
  const cleanDescription = cleanHTML(item.description).substring(0, 200);

  return new EmbedBuilder()
    .setAuthor({ name: "🚨 ALERTE LARGAGE // ARCHIVES NINTENDO" })
    .setColor("#E60012")
    .setTitle(item.title)
    .setDescription(`*${cleanDescription}*`)
    .setURL(item.link)
    .setTimestamp(item.pubDate ? new Date(item.pubDate) : new Date());
}

function cleanHTML(text: string): string {
  return text
    // Remove <table>...</table> blocks entirely (price/currency tables from Fanatical etc.)
    .replace(/<table[\s\S]*?<\/table>/gi, "")
    // Remove other known noisy blocks
    .replace(/<style[\s\S]*?<\/style>/gi, "")
    .replace(/<script[\s\S]*?<\/script>/gi, "")
    // Strip remaining HTML tags
    .replace(/<[^>]*>/g, "")
    .replace(/&nbsp;/g, " ")
    .replace(/&amp;/g, "&")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    .replace(/\s+/g, " ")
    .trim();
}
