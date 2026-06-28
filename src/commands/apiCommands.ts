/**
 * apiCommands.ts — Commandes slash utilisant les APIs externes
 *
 * /steam-deals    — Deals Steam en temps réel (CheapShark, pas de clé)
 * /price-history  — Historique de prix d'un jeu Steam (CheapShark)
 * /game-info      — Info sur un jeu (Steam Store, sans clé)
 * /yt-search      — Recherche YouTube (RSS + Invidious, sans clé)
 * /spotify-search — Recherche Spotify (clé requise)
 * /gaming-news    — Actus gaming (RSS feeds, sans clé)
 * /screenshot     — Capture d'écran d'une URL (Playwright, sans clé)
 * /lastfm         — Top tracks Last.fm (clé requise)
 * /api-status     — Statut des APIs externes
 */

import {
  ChatInputCommandInteraction,
  SlashCommandBuilder,
  EmbedBuilder,
  MessageFlags,
  AttachmentBuilder,
} from "discord.js";
import logger from "../utils/logger.js";
import {
  getSteamDeals,
  getPriceHistory,
  searchGame,
  searchYouTube,
  searchSpotify,
  getGamingNews,
  takeScreenshot,
  getLastfmTopTracks,
  getApiStatus,
} from "../services/externalApis.js";

const FOOTER = { text: "External API • Powered by free tier" };

// ─── Définitions ─────────────────────────────────────────────────────────────

export const commands = [
  new SlashCommandBuilder()
    .setName("steam-deals")
    .setDescription("Affiche les meilleurs deals Steam en temps réel")
    .addIntegerOption((o) =>
      o
        .setName("nombre")
        .setDescription("Nombre de deals (défaut: 10)")
        .setMinValue(1)
        .setMaxValue(25)
        .setRequired(false),
    )
    .toJSON(),

  new SlashCommandBuilder()
    .setName("price-history")
    .setDescription("Historique de prix d'un jeu Steam (via App ID)")
    .addIntegerOption((o) =>
      o.setName("appid").setDescription("Steam App ID du jeu").setRequired(true),
    )
    .toJSON(),

  new SlashCommandBuilder()
    .setName("game-info")
    .setDescription("Informations sur un jeu (RAWG)")
    .addStringOption((o) =>
      o.setName("jeu").setDescription("Nom du jeu à rechercher").setRequired(true),
    )
    .toJSON(),

  new SlashCommandBuilder()
    .setName("yt-search")
    .setDescription("Recherche une vidéo YouTube")
    .addStringOption((o) =>
      o.setName("requete").setDescription("Termes de recherche").setRequired(true),
    )
    .toJSON(),

  new SlashCommandBuilder()
    .setName("spotify-search")
    .setDescription("Recherche un morceau sur Spotify")
    .addStringOption((o) =>
      o.setName("requete").setDescription("Titre ou artiste").setRequired(true),
    )
    .toJSON(),

  new SlashCommandBuilder()
    .setName("gaming-news")
    .setDescription("Dernières actus gaming en français")
    .toJSON(),

  new SlashCommandBuilder()
    .setName("screenshot")
    .setDescription("Capture d'écran d'une URL")
    .addStringOption((o) => o.setName("url").setDescription("L'URL à capturer").setRequired(true))
    .toJSON(),

  new SlashCommandBuilder()
    .setName("lastfm")
    .setDescription("Top tracks d'un utilisateur Last.fm")
    .addStringOption((o) =>
      o.setName("utilisateur").setDescription("Nom d'utilisateur Last.fm").setRequired(true),
    )
    .toJSON(),

  new SlashCommandBuilder()
    .setName("api-status")
    .setDescription("Affiche le statut des APIs externes configurées")
    .toJSON(),
];

// ─── Handler ─────────────────────────────────────────────────────────────────

export async function handleCommand(interaction: ChatInputCommandInteraction): Promise<void> {
  try {
    switch (interaction.commandName) {
      case "steam-deals":
        await handleSteamDeals(interaction);
        break;
      case "price-history":
        await handlePriceHistory(interaction);
        break;
      case "game-info":
        await handleGameInfo(interaction);
        break;
      case "yt-search":
        await handleYtSearch(interaction);
        break;
      case "spotify-search":
        await handleSpotifySearch(interaction);
        break;
      case "gaming-news":
        await handleGamingNews(interaction);
        break;
      case "screenshot":
        await handleScreenshot(interaction);
        break;
      case "lastfm":
        await handleLastfm(interaction);
        break;
      case "api-status":
        await handleApiStatus(interaction);
        break;
    }
  } catch (error) {
    logger.error(
      `[ApiCmd] ${interaction.commandName}: ${error instanceof Error ? error.message : String(error)}`,
    );
    try {
      if (interaction.deferred || interaction.replied) {
        await interaction.editReply({ content: `❌ Erreur: ${String(error).slice(0, 150)}` });
      } else {
        await interaction.reply({
          content: `❌ Erreur: ${String(error).slice(0, 150)}`,
          flags: [MessageFlags.Ephemeral],
        });
      }
    } catch {}
  }
}

// ─── Handlers individuels ────────────────────────────────────────────────────

async function handleSteamDeals(interaction: ChatInputCommandInteraction): Promise<void> {
  await interaction.deferReply();
  const count = interaction.options.getInteger("nombre") ?? 10;
  const deals = await getSteamDeals(count);

  if (deals.length === 0) {
    await interaction.editReply({ content: "❌ Impossible de récupérer les deals Steam." });
    return;
  }

  const embed = new EmbedBuilder()
    .setTitle("💰 Deals Steam en temps réel")
    .setColor(0x1b2838)
    .setDescription(`${deals.length} deal(s) trouvés via CheapShark`)
    .setFooter(FOOTER)
    .setTimestamp();

  const dealText = deals
    .map((d, i) => {
      const discount = d.discount > 0 ? ` **-${d.discount}%**` : "";
      const rating = d.steamRating ? ` | ${d.steamRating}` : "";
      return `${i + 1}. **${d.title}**\n   ~~${d.normalPrice}€~~ → **${d.salePrice}€**${discount}${rating}\n   [Voir](${d.url})`;
    })
    .join("\n");

  embed.addFields({ name: "📋 Deals", value: dealText.slice(0, 4096), inline: false });
  await interaction.editReply({ embeds: [embed] });
}

async function handlePriceHistory(interaction: ChatInputCommandInteraction): Promise<void> {
  await interaction.deferReply();
  const appId = interaction.options.getInteger("appid", true);
  const history = await getPriceHistory(appId);

  if (history.length === 0) {
    await interaction.editReply({ content: "❌ Aucun historique de prix trouvé pour cet App ID." });
    return;
  }

  const lowest = Math.min(...history.map((h) => h.price));
  const highest = Math.max(...history.map((h) => h.price));
  const current = history[history.length - 1]?.price ?? 0;

  const embed = new EmbedBuilder()
    .setTitle(`📈 Historique de prix — App ${appId}`)
    .setColor(0x1b2838)
    .addFields(
      { name: "💵 Prix actuel", value: `${current}€`, inline: true },
      { name: "📉 Prix le plus bas", value: `${lowest}€`, inline: true },
      { name: "📈 Prix le plus haut", value: `${highest}€`, inline: true },
    )
    .setFooter(FOOTER)
    .setTimestamp();

  await interaction.editReply({ embeds: [embed] });
}

async function handleGameInfo(interaction: ChatInputCommandInteraction): Promise<void> {
  await interaction.deferReply();
  const query = interaction.options.getString("jeu", true);
  const games = await searchGame(query);

  if (games.length === 0) {
    await interaction.editReply({
      content: "❌ Aucun jeu trouvé. (API RAWG non configurée ou jeu introuvable)",
    });
    return;
  }

  const game = games[0];
  const embed = new EmbedBuilder()
    .setTitle(`🎮 ${game.name}`)
    .setColor(0x5865f2)
    .addFields(
      { name: "📅 Sortie", value: game.released ?? "N/A", inline: true },
      { name: "⭐ Note", value: `${game.rating}/5`, inline: true },
      { name: "🎯 Genres", value: game.genres.join(", ") || "N/A", inline: true },
      {
        name: "💻 Plateformes",
        value: game.platforms.join(", ").slice(0, 1024) || "N/A",
        inline: false,
      },
    )
    .setFooter(FOOTER)
    .setTimestamp();

  if (game.backgroundImage) {
    embed.setImage(game.backgroundImage);
  }
  if (game.description) {
    embed.setDescription(game.description.slice(0, 300));
  }

  await interaction.editReply({ embeds: [embed] });
}

async function handleYtSearch(interaction: ChatInputCommandInteraction): Promise<void> {
  await interaction.deferReply();
  const query = interaction.options.getString("requete", true);
  const videos = await searchYouTube(query, 5);

  if (videos.length === 0) {
    await interaction.editReply({
      content: "❌ Aucune vidéo trouvée. (YouTube Data API non configurée)",
    });
    return;
  }

  const embed = new EmbedBuilder()
    .setTitle("🔍 Résultats YouTube")
    .setColor(0xff0000)
    .setFooter(FOOTER)
    .setTimestamp();

  const videoText = videos
    .map((v, i) => `${i + 1}. **${v.title}**\n   ${v.channel} — [Regarder](${v.url})`)
    .join("\n");

  embed.setDescription(videoText.slice(0, 4096));
  await interaction.editReply({ embeds: [embed] });
}

async function handleSpotifySearch(interaction: ChatInputCommandInteraction): Promise<void> {
  await interaction.deferReply();
  const query = interaction.options.getString("requete", true);
  const tracks = await searchSpotify(query, 5);

  if (tracks.length === 0) {
    await interaction.editReply({
      content: "❌ Aucun morceau trouvé. (Spotify API non configurée)",
    });
    return;
  }

  const embed = new EmbedBuilder()
    .setTitle("🎵 Résultats Spotify")
    .setColor(0x1db954)
    .setFooter(FOOTER)
    .setTimestamp();

  const trackText = tracks
    .map(
      (t, i) =>
        `${i + 1}. **${t.name}** — ${t.artist}\n   [Écouter](${t.url})${t.preview ? " | [Preview](" + t.preview + ")" : ""}`,
    )
    .join("\n");

  embed.setDescription(trackText.slice(0, 4096));

  if (tracks[0]?.image) {
    embed.setThumbnail(tracks[0].image);
  }

  await interaction.editReply({ embeds: [embed] });
}

async function handleGamingNews(interaction: ChatInputCommandInteraction): Promise<void> {
  await interaction.deferReply();
  const articles = await getGamingNews(5);

  if (articles.length === 0) {
    await interaction.editReply({ content: "❌ Aucun article trouvé. (NewsAPI non configurée)" });
    return;
  }

  const embed = new EmbedBuilder()
    .setTitle("📰 Actus Gaming")
    .setColor(0xfee75c)
    .setFooter(FOOTER)
    .setTimestamp();

  const newsText = articles
    .map(
      (a, i) =>
        `${i + 1}. **${a.title}**\n   ${a.source} — <t:${Math.floor(new Date(a.publishedAt).getTime() / 1000)}:R>\n   [Lire](${a.url})`,
    )
    .join("\n");

  embed.setDescription(newsText.slice(0, 4096));

  if (articles[0]?.imageUrl) {
    embed.setImage(articles[0].imageUrl);
  }

  await interaction.editReply({ embeds: [embed] });
}

async function handleScreenshot(interaction: ChatInputCommandInteraction): Promise<void> {
  await interaction.deferReply();
  const url = interaction.options.getString("url", true);

  try {
    new URL(url);
  } catch {
    await interaction.editReply({ content: "❌ URL invalide." });
    return;
  }

  const buffer = await takeScreenshot(url);
  if (!buffer) {
    await interaction.editReply({
      content: "❌ Capture impossible. (Playwright non disponible)",
    });
    return;
  }

  const attachment = new AttachmentBuilder(buffer, { name: "screenshot.png" });
  const embed = new EmbedBuilder()
    .setTitle("📸 Capture d'écran")
    .setColor(0x5865f2)
    .setDescription(`URL: ${url}`)
    .setImage("attachment://screenshot.png")
    .setFooter(FOOTER)
    .setTimestamp();

  await interaction.editReply({ embeds: [embed], files: [attachment] });
}

async function handleLastfm(interaction: ChatInputCommandInteraction): Promise<void> {
  await interaction.deferReply();
  const username = interaction.options.getString("utilisateur", true);
  const tracks = await getLastfmTopTracks(username, 5);

  if (tracks.length === 0) {
    await interaction.editReply({
      content: "❌ Aucun morceau trouvé. (Last.fm API non configurée ou utilisateur introuvable)",
    });
    return;
  }

  const embed = new EmbedBuilder()
    .setTitle(`🎵 Top Tracks — ${username}`)
    .setColor(0xd51007)
    .setFooter(FOOTER)
    .setTimestamp();

  const trackText = tracks
    .map(
      (t, i) => `${i + 1}. **${t.name}** — ${t.artist} (${t.playCount} plays)\n   [Voir](${t.url})`,
    )
    .join("\n");

  embed.setDescription(trackText.slice(0, 4096));
  await interaction.editReply({ embeds: [embed] });
}

async function handleApiStatus(interaction: ChatInputCommandInteraction): Promise<void> {
  const status = getApiStatus();

  const embed = new EmbedBuilder()
    .setTitle("🔌 Statut des APIs externes")
    .setColor(0x5865f2)
    .setFooter(FOOTER)
    .setTimestamp();

  const statusText = Object.entries(status)
    .map(
      ([api, enabled]) =>
        `${enabled ? "✅" : "❌"} **${api}** — ${enabled ? "Configuré" : "Non configuré"}`,
    )
    .join("\n");

  embed.setDescription(statusText);
  await interaction.reply({ embeds: [embed], flags: [MessageFlags.Ephemeral] });
}
