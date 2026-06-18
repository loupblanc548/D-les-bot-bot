import { SlashCommandBuilder, ChatInputCommandInteraction, EmbedBuilder, Client } from "discord.js";
import Parser from "rss-parser";
import logger from "../utils/logger.js";
import { requireAdmin } from "../services/permissions.js";

// ─────────────────────────────────────────────────────────────────────────────
// /maintenance — Commandes de maintenance technique (admin only)
// Sous-commandes:
//   - test-rss <url> [max] : teste instantanément un flux RSS et son extraction
//     d'images (regex Steam header, fallback RAWG, fallback favicon). Affiche
//     pour chaque item la stratégie d'image qui sera utilisée en production
//     avant de l'ajouter pour de bon dans les sources surveillées.
// ─────────────────────────────────────────────────────────────────────────────

export const data = new SlashCommandBuilder()
  .setName("maintenance")
  .setDescription("Commandes de maintenance technique (admin only)")
  .addSubcommand((sub) =>
    sub
      .setName("test-rss")
      .setDescription(
        "Test instantané d'un flux RSS + extraction d'images avant de l'ajouter en production",
      )
      .addStringOption((opt) =>
        opt.setName("url").setDescription("URL complète du flux RSS à tester").setRequired(true),
      )
      .addIntegerOption((opt) =>
        opt
          .setName("max")
          .setDescription("Nombre d'items à tester (défaut 5, max 10)")
          .setMinValue(1)
          .setMaxValue(10)
          .setRequired(false),
      ),
  );

export const commands = [data];

export async function execute(
  interaction: ChatInputCommandInteraction,
  _client: Client,
): Promise<void> {
  const sub = interaction.options.getSubcommand();
  switch (sub) {
    case "test-rss":
      await handleTestRss(interaction);
      break;
    default:
      await interaction.reply({
        content: "❌ Sous-commande inconnue.",
        ephemeral: true,
      });
  }
}

export async function handleCommand(
  interaction: ChatInputCommandInteraction,
  _client?: Client,
): Promise<void> {
  await requireAdmin(interaction);
  const sub = interaction.options.getSubcommand();
  if (sub === "test-rss") await handleTestRss(interaction);
}

// ─────────────────────────────────────────────────────────────────────────────
// Image extraction — miroir de la stratégie utilisée par instantGamingTracker
// pour que le test reflète exactement ce qui se passera en prod.
// ─────────────────────────────────────────────────────────────────────────────

const STEAM_APP_RE = /https?:\/\/store\.steampowered\.com\/app\/(\d+)/i;

function steamHeaderImage(url: string): string | null {
  const m = url.match(STEAM_APP_RE);
  return m && m[1]
    ? `https://shared.akamai.steamstatic.com/store_item_assets/steam/apps/${m[1]}/header.jpg`
    : null;
}

async function rawgImageByTitle(title: string): Promise<string | null> {
  const key = process.env.RAWG_API_KEY;
  if (!key || key.startsWith("votre_") || key === "") return null;
  const safe = encodeURIComponent(title.slice(0, 80));
  const url = `https://api.rawg.io/api/games?search=${safe}&key=${key}&page_size=1`;
  try {
    const res = await fetch(url, { signal: AbortSignal.timeout(8_000) });
    if (!res.ok) return null;
    const json = (await res.json()) as {
      results?: Array<{ background_image?: string }>;
    };
    return json.results?.[0]?.background_image ?? null;
  } catch (err) {
    logger.warn(
      `[test-rss] RAWG lookup failed: title=${title} err=${err instanceof Error ? err.message : String(err)}`,
    );
    return null;
  }
}

type ImageStrategy = "steam" | "rawg" | "rss-enclosure" | "favicon" | "missing";

function extractEnclosureImage(item: Parser.Item): string | null {
  const enc = item.enclosure;
  if (!enc) return null;
  if (typeof enc === "string") return enc || null;
  return (enc as { url?: string }).url ?? null;
}

async function resolveImage(
  url: string,
  title: string,
): Promise<{ src: string; strategy: ImageStrategy }> {
  const steam = steamHeaderImage(url);
  if (steam) return { src: steam, strategy: "steam" };
  const rawg = await rawgImageByTitle(title);
  if (rawg) return { src: rawg, strategy: "rawg" };
  try {
    const host = new URL(url).hostname;
    return {
      src: `https://www.google.com/s2/favicons?domain=${host}&sz=128`,
      strategy: "favicon",
    };
  } catch {
    return { src: "", strategy: "missing" };
  }
}

function strategyEmoji(s: ImageStrategy): string {
  switch (s) {
    case "steam":
      return "🟦";
    case "rawg":
      return "🎮";
    case "rss-enclosure":
      return "📥";
    case "favicon":
      return "🌐";
    case "missing":
      return "❌";
  }
}

// ─────────────────────────────────────────────────────────────────────────────
// Handler principal
// ─────────────────────────────────────────────────────────────────────────────

async function handleTestRss(interaction: ChatInputCommandInteraction): Promise<void> {
  const rawUrl = interaction.options.getString("url", true);
  const max = interaction.options.getInteger("max") ?? 5;

  // Validation d'URL stricte
  let parsedUrl: URL;
  try {
    parsedUrl = new URL(rawUrl);
    if (!/^https?:$/.test(parsedUrl.protocol)) {
      await interaction.reply({
        content: "❌ L'URL doit utiliser le protocole `http://` ou `https://`.",
        ephemeral: true,
      });
      return;
    }
  } catch {
    await interaction.reply({ content: "❌ URL invalide.", ephemeral: true });
    return;
  }

  await interaction.deferReply({ ephemeral: true });
  const startedAt = Date.now();

  // 1. Parse RSS
  const parser = new Parser({
    timeout: 15_000,
    headers: { "User-Agent": "JohnHelldiver-TestRSS/1.0 (+maintenance)" },
  });

  let items: Parser.Item[] = [];
  let feedTitle = "(sans titre)";
  let parseError: string | null = null;
  try {
    const feed = await parser.parseURL(rawUrl);
    feedTitle = feed.title ?? "(sans titre)";
    items = feed.items ?? [];
  } catch (err) {
    parseError = err instanceof Error ? err.message : String(err);
    logger.warn(`[test-rss] parseURL failed: url=${rawUrl} err=${parseError}`);
  }

  if (parseError) {
    const embed = new EmbedBuilder()
      .setTitle("🧪 Test RSS — Échec de parsing")
      .setColor(0xed4245)
      .setDescription(`Impossible de parser le flux :\n\`${rawUrl}\``)
      .addFields({
        name: "Erreur",
        value: `\`\`\`${parseError.slice(0, 900)}\`\`\``,
        inline: false,
      })
      .setFooter({ text: "John Helldiver • Maintenance • test-rss" })
      .setTimestamp();
    await interaction.editReply({ embeds: [embed] });
    return;
  }

  // 2. Test d'extraction sur `max` items
  const tested = items.slice(0, max);
  const results: Array<{
    title: string;
    link: string;
    image: string;
    strategy: ImageStrategy;
    pubDate: string;
  }> = [];

  let steam = 0,
    rawg = 0,
    favicon = 0,
    enclosure = 0,
    missing = 0;

  for (const item of tested) {
    const title = item.title ?? "(sans titre)";
    const link = item.link ?? "";

    if (!link) {
      missing++;
      results.push({
        title,
        link: "(aucun lien)",
        image: "",
        strategy: "missing",
        pubDate: item.pubDate ?? "-",
      });
      continue;
    }

    // Priorité 1 : enclosure RSS (déjà fourni par le flux)
    const enclosureImg = extractEnclosureImage(item);
    if (enclosureImg) {
      enclosure++;
      results.push({
        title,
        link,
        image: enclosureImg,
        strategy: "rss-enclosure",
        pubDate: item.pubDate ?? "-",
      });
      continue;
    }

    // Priorité 2/3/4 : Steam regex, RAWG fallback, favicon fallback
    const { src, strategy } = await resolveImage(link, title);
    if (strategy === "steam") steam++;
    else if (strategy === "rawg") rawg++;
    else if (strategy === "favicon") favicon++;
    else missing++;

    results.push({
      title,
      link,
      image: src,
      strategy,
      pubDate: item.pubDate ?? "-",
    });
  }

  const totalInFeed = items.length;
  const elapsed = Date.now() - startedAt;
  const idealCount = steam + rawg + enclosure;
  const degradedCount = favicon + missing;
  const allGood = tested.length > 0 && degradedCount === 0;

  // 3. Construction de l'embed de réponse
  const embed = new EmbedBuilder()
    .setTitle(`🧪 Test RSS — ${feedTitle}`)
    .setURL(rawUrl)
    .setColor(allGood ? 0x57f287 : degradedCount === tested.length ? 0xed4245 : 0xfee75c)
    .setDescription(
      [
        `**URL testée** : ${rawUrl}`,
        `**Hostname** : \`${parsedUrl.hostname}\``,
        `**Items dans le flux** : ${totalInFeed}`,
        `**Items testés** : ${tested.length} (max param)`,
        `**Durée totale** : ${elapsed} ms`,
      ].join("\n"),
    )
    .addFields(
      {
        name: "📊 Répartition des stratégies d'image",
        value: [
          `🟦 \`steam-header\`     : **${steam}**`,
          `📥 \`rss-enclosure\`    : **${enclosure}**`,
          `🎮 \`rawg-fallback\`    : **${rawg}**`,
          `🌐 \`favicon-fallback\` : **${favicon}** ${favicon > 0 ? "_(à améliorer)_" : ""}`,
          `❌ \`missing\`          : **${missing}** ${missing > 0 ? "_(à corriger)_" : ""}`,
        ].join("\n"),
        inline: false,
      },
      {
        name: "🎯 Verdict",
        value: allGood
          ? "✅ Toutes les images seront correctement extraites en prod. Tu peux ajouter ce flux !"
          : idealCount === 0
            ? "⚠️ Aucune image idéale trouvée. Le flux ne desservira que des favicons (visuel pauvre)."
            : `✅ ${idealCount}/${tested.length} items OK. ⚠️ ${degradedCount} items dégradés — accepteables si tu es OK avec un fallback visuel.`,
        inline: false,
      },
    );

  // Détail par item (max 8 dans l'embed)
  if (results.length > 0) {
    embed.addFields(
      ...results.slice(0, 8).map((r) => ({
        name: `${strategyEmoji(r.strategy)} ${r.title.slice(0, 90)}${r.title.length > 90 ? "…" : ""}`,
        value: [
          `**Stratégie** : \`${r.strategy}\``,
          `**Lien** : ${r.link === "(aucun lien)" ? "_aucun_" : `[${r.link.slice(0, 80)}${r.link.length > 80 ? "…" : ""}](${r.link})`}`,
          `**Image** : ${r.image ? `[aperçu](${r.image})` : "_aucune_"}`,
          `**Date** : ${r.pubDate && r.pubDate !== "-" ? new Date(r.pubDate).toISOString().slice(0, 10) : "_inconnue_"}`,
        ].join("\n"),
        inline: false,
      })),
    );
    if (results.length > 8) {
      embed.addFields({
        name: "…",
        value: `${results.length - 8} item(s) supplémentaire(s) non affichés (limite embed Discord).`,
        inline: false,
      });
    }
  }

  embed
    .setFooter({
      text: `John Helldiver • Maintenance • ${tested.length}/${totalInFeed} items testés`,
    })
    .setTimestamp();

  await interaction.editReply({ embeds: [embed] });

  logger.info(
    `[test-rss] complete: url=${rawUrl} items=${totalInFeed} tested=${tested.length} steam=${steam} rawg=${rawg} favicon=${favicon} enclosure=${enclosure} missing=${missing} elapsedMs=${elapsed}`,
  );
}
