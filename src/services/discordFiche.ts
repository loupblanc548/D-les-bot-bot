/**
 * discordFiche.ts — Cartes Discord natives (REST JSON, pas de PNG).
 */

import { EmbedBuilder, type Client, type Message } from "discord.js";
import logger from "../utils/logger.js";

export const FICHE_COLOR = 0x3ba55d;
export const FICHE_MAX_EMBEDS = 10;

const postedForMessage = new Set<string>();

export interface FicheField {
  name: string;
  value: string;
  inline?: boolean;
}

export interface FicheCard {
  title: string;
  description?: string;
  fields: FicheField[];
  color?: number;
  url?: string;
  thumbnail?: string;
  image?: string;
}

export function clipField(value: string, max = 1024): string {
  const text = (value || "—").trim() || "—";
  return text.length <= max ? text : `${text.slice(0, max - 1)}…`;
}

export function buildHeaderEmbed(opts: {
  title: string;
  description: string;
  footer?: string;
  color?: number;
  thumbnail?: string;
}): EmbedBuilder {
  const embed = new EmbedBuilder()
    .setColor(opts.color ?? FICHE_COLOR)
    .setTitle(opts.title)
    .setDescription(opts.description.slice(0, 4096))
    .setFooter({ text: opts.footer ?? "Fiche Discord · pas de tableau markdown" })
    .setTimestamp();
  if (opts.thumbnail) embed.setThumbnail(opts.thumbnail);
  return embed;
}

export function buildCardEmbed(card: FicheCard): EmbedBuilder {
  const embed = new EmbedBuilder()
    .setColor(card.color ?? 0x2ecc71)
    .setTitle(card.title.slice(0, 256));
  if (card.description) embed.setDescription(card.description.slice(0, 4096));
  if (card.fields.length) {
    embed.addFields(
      card.fields.map((field) => ({
        name: field.name.slice(0, 256),
        value: clipField(field.value),
        inline: field.inline ?? false,
      })),
    );
  }
  if (card.url) embed.setURL(card.url);
  if (card.thumbnail) embed.setThumbnail(card.thumbnail);
  if (card.image) embed.setImage(card.image);
  return embed;
}

export function buildFicheEmbeds(opts: {
  title: string;
  description: string;
  footer?: string;
  color?: number;
  thumbnail?: string;
  cards: FicheCard[];
}): EmbedBuilder[] {
  const header = buildHeaderEmbed({
    title: opts.title,
    description: opts.description,
    footer: opts.footer,
    color: opts.color,
    thumbnail: opts.thumbnail,
  });
  const cards = opts.cards.slice(0, FICHE_MAX_EMBEDS - 1).map(buildCardEmbed);
  return [header, ...cards];
}

export async function postFichesViaRest(
  client: Client,
  channelId: string,
  embeds: EmbedBuilder[],
): Promise<void> {
  const token = client.token;
  if (!token) throw new Error("discord token missing");
  const payload = embeds.slice(0, FICHE_MAX_EMBEDS).map((embed) => embed.toJSON());
  const res = await fetch(`https://discord.com/api/v10/channels/${channelId}/messages`, {
    method: "POST",
    headers: {
      Authorization: `Bot ${token}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({ embeds: payload }),
    signal: AbortSignal.timeout(20_000),
    redirect: "manual",
  });
  if (!res.ok) {
    const body = await res.text().catch(() => "");
    throw new Error(`post ${res.status} ${body.slice(0, 240)}`);
  }
}

export async function presentFichesFromTool(
  ctx: { client: Client; message?: Message; channelId?: string },
  embeds: EmbedBuilder[],
): Promise<boolean> {
  const channelId = ctx.channelId ?? ctx.message?.channelId;
  if (!channelId || embeds.length === 0) return false;
  const key = ctx.message?.id;
  if (key) {
    if (postedForMessage.has(key)) return true;
    postedForMessage.add(key);
    if (postedForMessage.size > 200) {
      const first = postedForMessage.values().next().value as string | undefined;
      if (first) postedForMessage.delete(first);
    }
  }
  try {
    await postFichesViaRest(ctx.client, channelId, embeds);
    return true;
  } catch (err) {
    logger.error(`[Fiche] post: ${err instanceof Error ? err.stack || err.message : String(err)}`);
    return false;
  }
}
