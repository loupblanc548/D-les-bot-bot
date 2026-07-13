import { EmbedBuilder, ColorResolvable } from "discord.js";
import { isValidEmbedImageUrl } from "../utils/image-helpers.js";

export interface RichEmbedSpec {
  title?: string;
  description?: string;
  color?: string;
  thumbnail?: string;
  image?: string;
  url?: string;
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
  if (spec.thumbnail && isValidEmbedImageUrl(spec.thumbnail)) embed.setThumbnail(spec.thumbnail);
  if (spec.image && isValidEmbedImageUrl(spec.image)) embed.setImage(spec.image);
  if (spec.url) embed.setURL(spec.url);
  if (spec.fields) {
    for (const f of spec.fields.slice(0, 25)) {
      embed.addFields({
        name: f.name.slice(0, 256),
        value: f.value.slice(0, 1024),
        inline: f.inline ?? false,
      });
    }
  }
  if (spec.footer)
    embed.setFooter({ text: spec.footer.text.slice(0, 2048), iconURL: spec.footer.iconUrl });
  if (spec.author)
    embed.setAuthor({
      name: spec.author.name.slice(0, 256),
      iconURL: spec.author.iconUrl,
      url: spec.author.url,
    });
  if (spec.timestamp) embed.setTimestamp();
  return embed;
}

export function buildAnalyticsEmbed(data: {
  guildName: string;
  members: number;
  activeMembers: number;
  messages: number;
  commands: number;
  modActions: number;
  trend?: string;
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
  target: string;
  type: string;
  riskScore: number;
  riskReasons: string[];
  shodan?: string;
  dns?: string;
  whois?: string;
}): EmbedBuilder {
  const color = data.riskScore > 50 ? "#ff4444" : data.riskScore > 20 ? "#ffaa00" : "#44ff44";
  return buildRichEmbed({
    title: `🔍 OSINT Scan — ${data.target}`,
    color,
    timestamp: true,
    fields: [
      { name: "Type", value: data.type, inline: true },
      { name: "Risk Score", value: `${data.riskScore}/100`, inline: true },
      {
        name: "Risk Reasons",
        value: data.riskReasons.length > 0 ? data.riskReasons.join(", ") : "Aucun risque détecté",
        inline: false,
      },
      ...(data.shodan
        ? [{ name: "Shodan", value: data.shodan.slice(0, 1024), inline: false }]
        : []),
      ...(data.dns ? [{ name: "DNS", value: data.dns.slice(0, 1024), inline: false }] : []),
      ...(data.whois ? [{ name: "WHOIS", value: data.whois.slice(0, 1024), inline: false }] : []),
    ],
    footer: { text: "OSINT Toolkit" },
  });
}

export function buildSocialEmbed(data: {
  platform: string;
  username: string;
  title?: string;
  description?: string;
  stats: { label: string; value: string }[];
  url?: string;
  thumbnail?: string;
}): EmbedBuilder {
  return buildRichEmbed({
    title: `${data.platform} — @${data.username}`,
    description: data.description?.slice(0, 4096),
    color: "#1DA1F2",
    url: data.url,
    thumbnail: data.thumbnail,
    timestamp: true,
    fields: data.stats.slice(0, 12).map((s) => ({ name: s.label, value: s.value, inline: true })),
    footer: { text: `${data.platform} API` },
  });
}

export function buildSearchResultsEmbed(data: {
  query: string;
  platform: string;
  results: { title: string; url: string; snippet: string }[];
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
    fields:
      fields.length > 0
        ? fields
        : [{ name: "Aucun résultat", value: "Pas de résultats trouvés", inline: false }],
    footer: { text: `${data.results.length} résultats` },
  });
}

export function buildHealthEmbed(data: {
  uptime: number;
  memory: { rss: number; heapUsed: number; heapTotal: number };
  guilds: number;
  users: number;
  commands: number;
  errors: number;
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
      {
        name: "📦 Heap",
        value: `${memMB(data.memory.heapUsed)}/${memMB(data.memory.heapTotal)}`,
        inline: true,
      },
      { name: "🏠 Guilds", value: `${data.guilds}`, inline: true },
      { name: "👥 Users", value: `${data.users}`, inline: true },
      { name: "⚙️ Commands (24h)", value: `${data.commands}`, inline: true },
      { name: "❌ Errors (24h)", value: `${data.errors}`, inline: true },
    ],
    footer: { text: "Health Monitor" },
  });
}

// ═══ ADVANCED EMBED TEMPLATES ═══

export function buildComparisonEmbed(data: {
  title: string;
  columns: string[];
  rows: string[][];
  color?: string;
  footer?: string;
}): EmbedBuilder {
  const fields = data.columns.map((col, i) => {
    const values = data.rows.map((row) => row[i] ?? "—").join("\n");
    return { name: col, value: values.slice(0, 1024), inline: true };
  });
  return buildRichEmbed({
    title: data.title,
    color: data.color || "#5865F2",
    fields,
    timestamp: true,
    footer: { text: data.footer || "Comparison Table" },
  });
}

export function buildProgressEmbed(data: {
  title: string;
  items: { label: string; current: number; max: number; unit?: string }[];
  color?: string;
}): EmbedBuilder {
  const bar = (cur: number, max: number) => {
    const pct = max > 0 ? Math.min(Math.round((cur / max) * 10), 10) : 0;
    return "█".repeat(pct) + "░".repeat(10 - pct);
  };
  const fields = data.items.map((item) => ({
    name: item.label,
    value: `${bar(item.current, item.max)} ${item.current}/${item.max}${item.unit || ""}`,
    inline: false,
  }));
  return buildRichEmbed({
    title: data.title,
    color: data.color || "#00d4aa",
    fields,
    timestamp: true,
    footer: { text: "Progress Dashboard" },
  });
}

export function buildLeaderboardEmbed(data: {
  title: string;
  entries: { rank: number; name: string; score: number; extra?: string }[];
  color?: string;
  unit?: string;
}): EmbedBuilder {
  const medals = ["🥇", "🥈", "🥉"];
  const fields = data.entries.slice(0, 10).map((e) => ({
    name: `${medals[e.rank - 1] || `#${e.rank}`} ${e.name}`,
    value: `${e.score}${data.unit || ""}${e.extra ? ` — ${e.extra}` : ""}`,
    inline: false,
  }));
  return buildRichEmbed({
    title: `🏆 ${data.title}`,
    color: data.color || "#ffd700",
    fields,
    timestamp: true,
    footer: { text: `Leaderboard — ${data.entries.length} participants` },
  });
}

export function buildTimelineEmbed(data: {
  title: string;
  events: { time: string; title: string; description?: string }[];
  color?: string;
}): EmbedBuilder {
  const fields = data.events.slice(0, 12).map((e) => ({
    name: `🕐 ${e.time} — ${e.title}`,
    value: (e.description || "—").slice(0, 500),
    inline: false,
  }));
  return buildRichEmbed({
    title: data.title,
    color: data.color || "#7289da",
    fields,
    timestamp: true,
    footer: { text: "Timeline" },
  });
}

export function buildStatCardsEmbed(data: {
  title: string;
  cards: { icon: string; label: string; value: string; trend?: string }[];
  color?: string;
}): EmbedBuilder {
  const fields = data.cards.slice(0, 12).map((c) => ({
    name: `${c.icon} ${c.label}`,
    value: `${c.value}${c.trend ? `\n${c.trend}` : ""}`,
    inline: true,
  }));
  return buildRichEmbed({
    title: data.title,
    color: data.color || "#5865F2",
    fields,
    timestamp: true,
    footer: { text: "Stats Dashboard" },
  });
}

export function buildInfoCardEmbed(data: {
  title: string;
  description: string;
  fields?: { name: string; value: string }[];
  thumbnail?: string;
  color?: string;
  url?: string;
}): EmbedBuilder {
  return buildRichEmbed({
    title: `ℹ️ ${data.title}`,
    description: data.description,
    color: data.color || "#3498db",
    thumbnail: data.thumbnail,
    url: data.url,
    fields: data.fields,
    timestamp: true,
    footer: { text: "Info Card" },
  });
}

export function buildWarningEmbed(data: {
  title: string;
  description: string;
  fields?: { name: string; value: string }[];
}): EmbedBuilder {
  return buildRichEmbed({
    title: `⚠️ ${data.title}`,
    description: data.description,
    color: "#ff8800",
    fields: data.fields,
    timestamp: true,
    footer: { text: "Warning" },
  });
}

export function buildSuccessEmbed(data: {
  title: string;
  description: string;
  fields?: { name: string; value: string }[];
}): EmbedBuilder {
  return buildRichEmbed({
    title: `✅ ${data.title}`,
    description: data.description,
    color: "#2ecc71",
    fields: data.fields,
    timestamp: true,
    footer: { text: "Success" },
  });
}

export function buildErrorEmbed(data: {
  title: string;
  description: string;
  fields?: { name: string; value: string }[];
}): EmbedBuilder {
  return buildRichEmbed({
    title: `❌ ${data.title}`,
    description: data.description,
    color: "#e74c3c",
    fields: data.fields,
    timestamp: true,
    footer: { text: "Error" },
  });
}

export function buildTranslationEmbed(data: {
  original: string;
  translated: string;
  sourceLang: string;
  targetLang: string;
  provider: string;
}): EmbedBuilder {
  const langNames: Record<string, string> = {
    fr: "Français",
    en: "English",
    es: "Español",
    de: "Deutsch",
    it: "Italiano",
    pt: "Português",
    ru: "Русский",
    ja: "日本語",
    zh: "中文",
    ar: "العربية",
  };
  return buildRichEmbed({
    title: "🌐 Traduction automatique",
    color: "#00b4d8",
    fields: [
      {
        name: `Original (${langNames[data.sourceLang] || data.sourceLang})`,
        value: data.original.slice(0, 1024),
        inline: false,
      },
      {
        name: `Traduction (${langNames[data.targetLang] || data.targetLang})`,
        value: data.translated.slice(0, 1024),
        inline: false,
      },
      { name: "Provider", value: data.provider, inline: true },
    ],
    timestamp: true,
    footer: { text: "Auto-Translation" },
  });
}

export function buildSearchCardEmbed(data: {
  query: string;
  platform: string;
  results: { title: string; url: string; snippet?: string; score?: number }[];
}): EmbedBuilder {
  const fields = data.results.slice(0, 8).map((r, i) => ({
    name: `${i + 1}. ${r.title.slice(0, 120)}`,
    value: `${r.snippet ? r.snippet.slice(0, 200) + "\n" : ""}[🔗 Ouvrir](${r.url})${r.score ? ` | Score: ${r.score}` : ""}`,
    inline: false,
  }));
  return buildRichEmbed({
    title: `🔎 ${data.platform} — "${data.query}"`,
    color: "#5865F2",
    fields,
    timestamp: true,
    footer: { text: `${data.results.length} résultats trouvés` },
  });
}
