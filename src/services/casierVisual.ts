import { EmbedBuilder, type Client, type Message } from "discord.js";
import logger from "../utils/logger.js";
import {
  casierAccentColor,
  casierTypeColor,
  emojiCasierType,
  formatCasierDiscordTime,
  formatDurationSeconds,
  formatModeratorCell,
  labelCasierType,
  summarizeCasierTypes,
  type CasierItem,
} from "./casierQuery.js";

const postedForMessage = new Set<string>();

export const CASIER_ENTRIES_PER_PAGE = 8;

export function resolveCasierNames(
  client: Client | null | undefined,
  guildId: string,
  items: CasierItem[],
  extra?: Record<string, string>,
): Map<string, string> {
  const names = new Map<string, string>(Object.entries(extra ?? {}));
  const guild = client?.guilds.cache.get(guildId);
  const ids = new Set<string>();
  for (const item of items) {
    if (item.userId) ids.add(item.userId);
    if (item.moderatorId) ids.add(item.moderatorId);
  }
  for (const id of ids) {
    if (names.has(id)) continue;
    if (id === "AI_AGENT") {
      names.set(id, "John");
      continue;
    }
    const member = guild?.members.cache.get(id);
    const user = client?.users.cache.get(id);
    names.set(id, member?.displayName || user?.globalName || user?.username || id);
  }
  return names;
}

export function paginateCasierItems(
  items: CasierItem[],
  size = CASIER_ENTRIES_PER_PAGE,
): CasierItem[][] {
  if (items.length === 0) return [[]];
  const pages: CasierItem[][] = [];
  for (let i = 0; i < items.length; i += size) {
    pages.push(items.slice(i, i + size));
  }
  return pages;
}

function mentionMember(userId: string | null | undefined): string {
  if (!userId || userId === "UNKNOWN") return "—";
  if (userId === "AI_AGENT") return "John";
  if (/^\d{17,19}$/.test(userId)) return `<@${userId}>`;
  return userId;
}

function reasonText(reason: string | null | undefined): string {
  const text = (reason || "").replace(/\s+/g, " ").trim();
  return text || "Aucune raison";
}

export function buildCasierEntryEmbed(item: CasierItem, withUser: boolean): EmbedBuilder {
  const embed = new EmbedBuilder()
    .setColor(casierTypeColor(item.type))
    .setTitle(`${emojiCasierType(item.type)}  ${labelCasierType(item.type)}`)
    .setDescription(`**Raison**\n${reasonText(item.reason).slice(0, 3900)}`);

  const fields = [{ name: "Date", value: formatCasierDiscordTime(item.date), inline: true }];
  if (withUser) {
    fields.push({ name: "Membre", value: mentionMember(item.userId), inline: true });
  }
  fields.push(
    { name: "Durée", value: formatDurationSeconds(item.duration) ?? "—", inline: true },
    { name: "Par", value: formatModeratorCell(item.moderatorId), inline: true },
  );
  return embed.addFields(fields);
}

export function buildCasierLayoutEmbeds(opts: {
  title: string;
  items: CasierItem[];
  catalog?: CasierItem[];
  withUser: boolean;
  page?: number;
  pageCount?: number;
  thumbnail?: string;
  extraFields?: { name: string; value: string; inline?: boolean }[];
}): EmbedBuilder[] {
  const catalog = opts.catalog ?? opts.items;
  const count = catalog.length;
  const countBit = count === 0 ? "aucune entrée" : `${count} entrée${count > 1 ? "s" : ""}`;
  const types = count > 0 ? ` · ${summarizeCasierTypes(catalog)}` : "";
  const pageBit =
    opts.pageCount && opts.pageCount > 1 ? ` · page ${opts.page ?? 1}/${opts.pageCount}` : "";

  const header = new EmbedBuilder()
    .setColor(casierAccentColor(catalog))
    .setTitle(opts.title)
    .setDescription(`**${countBit}**${types}`)
    .setFooter({ text: `Casier judiciaire${pageBit}` })
    .setTimestamp();
  if (opts.thumbnail) header.setThumbnail(opts.thumbnail);
  if (opts.extraFields?.length) header.addFields(opts.extraFields);

  return [header, ...opts.items.map((item) => buildCasierEntryEmbed(item, opts.withUser))];
}

async function postCasierEmbedsViaRest(
  client: Client,
  channelId: string,
  embeds: EmbedBuilder[],
): Promise<void> {
  const token = client.token;
  if (!token) throw new Error("discord token missing");
  const res = await fetch(`https://discord.com/api/v10/channels/${channelId}/messages`, {
    method: "POST",
    headers: {
      Authorization: `Bot ${token}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({ embeds: embeds.map((embed) => embed.toJSON()) }),
    signal: AbortSignal.timeout(20_000),
    redirect: "manual",
  });
  if (!res.ok) {
    const body = await res.text().catch(() => "");
    throw new Error(`post ${res.status} ${body.slice(0, 240)}`);
  }
}

export async function presentCasierFromTool(
  ctx: { client: Client; message?: Message; guildId: string; channelId?: string },
  opts: {
    title: string;
    items: CasierItem[];
    withUser: boolean;
    extraNames?: Record<string, string>;
  },
): Promise<void> {
  await sendCasierTableToMessage(ctx.message, {
    title: opts.title,
    items: opts.items,
    withUser: opts.withUser,
    guildId: ctx.guildId,
    client: ctx.client,
    channelId: ctx.channelId ?? ctx.message?.channelId,
  });
}

export async function sendCasierTableToMessage(
  message: Message | undefined,
  opts: {
    title: string;
    items: CasierItem[];
    withUser: boolean;
    guildId: string;
    names?: Map<string, string>;
    client?: Client;
    channelId?: string;
  },
): Promise<boolean> {
  if (!message || opts.items.length === 0) return false;
  const key = message.id;
  if (postedForMessage.has(key)) return true;
  postedForMessage.add(key);
  if (postedForMessage.size > 200) {
    const first = postedForMessage.values().next().value as string | undefined;
    if (first) postedForMessage.delete(first);
  }

  try {
    const pages = paginateCasierItems(opts.items);
    const embeds = buildCasierLayoutEmbeds({
      title: opts.title,
      items: pages[0],
      catalog: opts.items,
      withUser: opts.withUser,
      page: 1,
      pageCount: pages.length,
    });
    const client = opts.client ?? message.client;
    const channelId = opts.channelId ?? message.channelId;
    if (!channelId) throw new Error("no channel id");
    await postCasierEmbedsViaRest(client, channelId, embeds);
    return true;
  } catch (err) {
    logger.error(
      `[Casier] fiche Discord: ${err instanceof Error ? err.stack || err.message : String(err)}`,
    );
    postedForMessage.delete(key);
    return false;
  }
}
