/* eslint-disable @typescript-eslint/ban-ts-comment */
// @ts-nocheck
// src/commands/rssTest.ts
/**
 * /rss-test \u2014 commande owner-only de debug.
 * Force un tick imm\u00e9diat du tracker RSS X / Twitter et affiche un r\u00e9cap.
 */
import {
  SlashCommandBuilder,
  EmbedBuilder,
  MessageFlags,
  type ChatInputCommandInteraction,
  type Client,
} from "discord.js";
import { getRssTwitterTracker, type FeedStats, type TickResult } from "../rssTwitterTracker.js";

const OWNER_ID = process.env.BOT_OWNER_ID ?? "620589482185457674";

export const commands = [
  new SlashCommandBuilder()
    .setName("rss-test")
    .setDescription("Force un tick imm\u00e9diat du tracker RSS X / Twitter (owner only).")
    .setDefaultMemberPermissions(0)
    .toJSON(),
];

export async function handleCommand(
  interaction: ChatInputCommandInteraction,
  client: Client,
): Promise<void> {
  void client;
  if (interaction.user.id !== OWNER_ID) {
    await interaction.reply({
      content: "\ud83d\udd12 Commande r\u00e9serv\u00e9e au propri\u00e9taire du bot.",
      flags: MessageFlags.Ephemeral,
    });
    return;
  }

  await interaction.deferReply({ flags: MessageFlags.Ephemeral });

  const tracker = getRssTwitterTracker();
  if (!tracker) {
    await interaction.editReply({
      embeds: [
        new EmbedBuilder()
          .setColor(0xe74c3c)
          .setTitle("\u274c Tracker non initialis\u00e9")
          .setDescription(
            "Aucune instance de `RssTwitterTracker` n'a \u00e9t\u00e9 trouv\u00e9e sur `globalThis.__rssTwitterTracker`.\n\n" +
              "V\u00e9rifie que `startRssTwitterTracker(client)` est appel\u00e9 dans `src/startup.ts`, " +
              "et que `RSS_TWITTER_FEEDS` + `DATABASE_URL` sont d\u00e9finis dans l\u2019environnement.",
          ),
      ],
    });
    return;
  }

  let result: TickResult;
  try {
    result = await tracker.tick();
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    await interaction.editReply({
      embeds: [
        new EmbedBuilder()
          .setColor(0xe74c3c)
          .setTitle("\u274c \u00c9chec du tick")
          .setDescription("```" + msg.slice(0, 1800) + "```"),
      ],
    });
    return;
  }

  await safeEditReply(interaction, { embeds: [buildRecapEmbed(result)] });
}

function buildRecapEmbed(r: TickResult): EmbedBuilder {
  const { total, feeds, feedsFailed, durationMs, startedAt, perFeed } = r;

  let color: number;
  if (feedsFailed.length > 0) color = 0xe67e22;
  else if (total.errors > 0) color = 0xf1c40f;
  else if (total.posts > 0) color = 0x2ecc71;
  else color = 0x95a5a6;

  const lines: string[] = [
    `**Feeds trait\u00e9s**  : \`${feeds - feedsFailed.length}\` / \`${feeds}\``,
    `**Items lus**     : \`${total.items}\``,
    `**Posts envoy\u00e9s**: \`${total.posts}\``,
    `**Doublons**      : \`${total.duplicates}\``,
    `**Erreurs**       : \`${total.errors}\``,
    `**Dur\u00e9e**        : \`${durationMs}\` ms`,
  ];
  if (feedsFailed.length > 0) {
    lines.push("");
    lines.push("\u26a0\ufe0f **Feeds en \u00e9chec** :");
    for (const url of feedsFailed) lines.push(`\u2022 \`${url}\``);
  }

  const perFeedLines: string[] = [];
  for (const [url, fs] of Object.entries(perFeed) as [string, FeedStats][]) {
    const short = url.length > 50 ? url.slice(0, 47) + "\u2026" : url;
    const routes = Object.entries(fs.byRule)
      .map(([rule, n]) => `${rule}=${n}`)
      .join(", ");
    perFeedLines.push(
      `\u2022 \`${short}\` \u2014 posts: **${fs.posts}**, dup: ${fs.duplicates}, err: ${fs.errors}, items: ${fs.items}${routes ? ` (${routes})` : ""}`,
    );
  }
  const description =
    lines.join("\n") +
    (perFeedLines.length ? "\n\n**D\u00e9tail par flux**\n" + perFeedLines.join("\n") : "");

  return new EmbedBuilder()
    .setColor(color)
    .setTitle("\ud83e\uddea /rss-test \u2014 r\u00e9cap")
    .setDescription(description.slice(0, 4000))
    .setTimestamp(startedAt)
    .setFooter({ text: "tick forc\u00e9 par owner" });
}

async function safeEditReply(
  interaction: ChatInputCommandInteraction,
  opts: { content?: string; embeds?: EmbedBuilder[] },
): Promise<void> {
  try {
    await interaction.editReply(opts);
  } catch (err) {
    console.error("[rssTest] editReply failed:", err instanceof Error ? err.message : err);
  }
}
