import { MessageEmbed } from "discord.js";

interface RSSItem {
  title: string;
  description: string;
  link: string;
  pubDate?: string;
  guid?: string;
  author?: string;
  category?: string;
}

export function createEpicEmbed(item: RSSItem): MessageEmbed {
  const cleanDescription = cleanHTML(item.description).substring(0, 250);

  return new MessageEmbed()
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

export function createSteamEmbed(item: RSSItem): MessageEmbed {
  const cleanDescription = cleanHTML(item.description).substring(0, 250);

  return new MessageEmbed()
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

export function createPlayStationEmbed(item: RSSItem): MessageEmbed {
  const cleanDescription = cleanHTML(item.description);
  const timestamp = item.pubDate ? Math.floor(new Date(item.pubDate).getTime() / 1000) : Math.floor(Date.now() / 1000);

  return new MessageEmbed()
    .setAuthor({ name: "📡 TRANSMISSION ENTRANTE // INTEL PLAYSTATION" })
    .setColor("#003087")
    .setTitle(`➢ ${item.title}`)
    .setDescription(`> ${cleanDescription}\n\n📅 Publication: <t:${timestamp}:R>`)
    .setURL(item.link)
    .setTimestamp(item.pubDate ? new Date(item.pubDate) : new Date());
}

export function createXboxEmbed(item: RSSItem): MessageEmbed {
  const cleanDescription = cleanHTML(item.description);

  return new MessageEmbed()
    .setAuthor({ name: "🟢 SYSTEM_LOG // SÉCURITÉ XBOX" })
    .setColor("#107C10")
    .setTitle(item.title)
    .setDescription(`▪️ ${cleanDescription}\n\n─────────────────────\n🔗 ${item.link}`)
    .setURL(item.link)
    .setTimestamp(item.pubDate ? new Date(item.pubDate) : new Date());
}

export function createNintendoEmbed(item: RSSItem): MessageEmbed {
  const cleanDescription = cleanHTML(item.description).substring(0, 200);

  return new MessageEmbed()
    .setAuthor({ name: "🚨 ALERTE LARGAGE // ARCHIVES NINTENDO" })
    .setColor("#E60012")
    .setTitle(item.title)
    .setDescription(`*${cleanDescription}*`)
    .setURL(item.link)
    .setTimestamp(item.pubDate ? new Date(item.pubDate) : new Date());
}

function cleanHTML(text: string): string {
  return text
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
