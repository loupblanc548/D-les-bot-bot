import { EmbedBuilder, ColorResolvable } from "discord.js";

export interface RichEmbedSpec {
  title?: string; description?: string; color?: string;
  thumbnail?: string; image?: string; url?: string;
  fields?: { name: string; value: string; inline?: boolean }[];
  footer?: { text: string; iconUrl?: string };
  author?: { name: string; iconUrl?: string; url?: string };
  timestamp?: boolean;
}

export function buildRichEmbed(spec: RichEmbedSpec): EmbedBuilder {
  const embed = new EmbedBuilder();
  if (spec.title) embed.setTitle(spec.title.slice(0, 256));
  if (spec.description) embed.setDescription(spec.description.slice(0, 4096));
  if (spec.color) embed.setColor(spec.color as ColorResolvable);
  else embed.setColor("#0099ff");
  if (spec.thumbnail) embed.setThumbnail(spec.thumbnail);
  if (spec.image) embed.setImage(spec.image);
  if (spec.url) embed.setURL(spec.url);
  if (spec.fields) {
    for (const f of spec.fields.slice(0, 25)) {
      embed.addFields({ name: f.name.slice(0, 256), value: f.value.slice(0, 1024), inline: f.inline ?? false });
    }
  }
  if (spec.footer) embed.setFooter({ text: spec.footer.text.slice(0, 2048), iconURL: spec.footer.iconUrl });
  if (spec.author) embed.setAuthor({ name: spec.author.name.slice(0, 256), iconURL: spec.author.iconUrl, url: spec.author.url });
  if (spec.timestamp) embed.setTimestamp();
  return embed;
}

export function buildAnalyticsEmbed(data: {
  guildName: string; members: number; activeMembers: number;
  messages: number; commands: number; modActions: number; trend?: string;
}): EmbedBuilder {
  return buildRichEmbed({
    title: `📊 Analytics — ${data.guildName}`,
    color: "#5865F2",
    timestamp: true,
    fields: [
      { name: "👥 Membres", value: `${data.members}`, inline: true },
      { name: "🟢 Actifs (7j)", value: `${data.activeMembers}`, inline: true },
      { name: "💬 Messages (7j)", value: `${data.messages}`, inline: true },
      { name: "⚙️ Commandes", value: `${data.commands}`, inline: true },
      { name: "🔨 Modération", value: `${data.modActions}`, inline: true },
      { name: "📈 Tendance", value: data.trend || "Stable", inline: true },
    ],
    footer: { text: "Analytics Dashboard" },
  });
}

export function buildOsintEmbed(data: {
  target: string; type: string; riskScore: number; riskReasons: string[];
  shodan?: string; dns?: string; whois?: string;
}): EmbedBuilder {
  const color = data.riskScore > 50 ? "#ff4444" : data.riskScore > 20 ? "#ffaa00" : "#44ff44";
  return buildRichEmbed({
    title: `🔍 OSINT Scan — ${data.target}`,
    color,
    timestamp: true,
    fields: [
      { name: "Type", value: data.type, inline: true },
      { name: "Risk Score", value: `${data.riskScore}/100`, inline: true },
      { name: "Risk Reasons", value: data.riskReasons.length > 0 ? data.riskReasons.join(", ") : "Aucun risque détecté", inline: false },
      ...(data.shodan ? [{ name: "Shodan", value: data.shodan.slice(0, 1024), inline: false }] : []),
      ...(data.dns ? [{ name: "DNS", value: data.dns.slice(0, 1024), inline: false }] : []),
      ...(data.whois ? [{ name: "WHOIS", value: data.whois.slice(0, 1024), inline: false }] : []),
    ],
    footer: { text: "OSINT Toolkit" },
  });
}

export function buildSocialEmbed(data: {
  platform: string; username: string; title?: string; description?: string;
  stats: { label: string; value: string }[]; url?: string; thumbnail?: string;
}): EmbedBuilder {
  return buildRichEmbed({
    title: `${data.platform} — @${data.username}`,
    description: data.description?.slice(0, 4096),
    color: "#1DA1F2",
    url: data.url,
    thumbnail: data.thumbnail,
    timestamp: true,
    fields: data.stats.slice(0, 12).map(s => ({ name: s.label, value: s.value, inline: true })),
    footer: { text: `${data.platform} API` },
  });
}

export function buildSearchResultsEmbed(data: {
  query: string; platform: string; results: { title: string; url: string; snippet: string }[];
}): EmbedBuilder {
  const fields = data.results.slice(0, 10).map((r, i) => ({
    name: `${i + 1}. ${r.title.slice(0, 100)}`,
    value: `${r.snippet.slice(0, 200)}\n[🔗 Lien](${r.url})`,
    inline: false,
  }));
  return buildRichEmbed({
    title: `🔎 Recherche ${data.platform} — "${data.query}"`,
    color: "#5865F2",
    timestamp: true,
    fields: fields.length > 0 ? fields : [{ name: "Aucun résultat", value: "Pas de résultats trouvés", inline: false }],
    footer: { text: `${data.results.length} résultats` },
  });
}

export function buildHealthEmbed(data: {
  uptime: number; memory: { rss: number; heapUsed: number; heapTotal: number };
  guilds: number; users: number; commands: number; errors: number;
}): EmbedBuilder {
  const uptimeStr = `${Math.floor(data.uptime / 3600)}h ${Math.floor((data.uptime % 3600) / 60)}m`;
  const memMB = (b: number) => `${Math.round(b / 1024 / 1024)}MB`;
  return buildRichEmbed({
    title: "🤖 Bot Health Monitor",
    color: data.errors > 10 ? "#ff4444" : "#44ff44",
    timestamp: true,
    fields: [
      { name: "⏱️ Uptime", value: uptimeStr, inline: true },
      { name: "💾 RSS", value: memMB(data.memory.rss), inline: true },
      { name: "📦 Heap", value: `${memMB(data.memory.heapUsed)}/${memMB(data.memory.heapTotal)}`, inline: true },
      { name: "🏠 Guilds", value: `${data.guilds}`, inline: true },
      { name: "👥 Users", value: `${data.users}`, inline: true },
      { name: "⚙️ Commands (24h)", value: `${data.commands}`, inline: true },
      { name: "❌ Errors (24h)", value: `${data.errors}`, inline: true },
    ],
    footer: { text: "Health Monitor" },
  });
}
