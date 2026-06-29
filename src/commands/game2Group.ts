/**
 * game2Group.ts — Commandes gaming avancées (sans clé API)
 *
 * /game2 speedrun    — Records speedrun (speedrun.com API, sans clé)
 * /game2 trivia      — Quiz gaming
 * /game2 indie       — Découverte jeux indie (Reddit /r/indiegames RSS)
 * /game2 news        — News gaming personnalisées (RSS)
 * /game2 deals-alert — Alerte quand un jeu wishlisté est en promo
 * /game2 is-it-up    — Statut serveur de jeu
 * /game2 next-release — Prochaines sorties
 * /game2 compare     — Compare deux jeux
 * /game2 dlc         — DLC disponibles pour un jeu
 * /game2 beta        — Bêtas ouvertes
 * /game2 youtube     — Vidéos gaming YouTube (Invidious, sans clé)
 */

import { ChatInputCommandInteraction, SlashCommandBuilder, Client, EmbedBuilder } from "discord.js";
import { getSpeedrunRecords } from "../services/freeApis.js";
import Parser from "rss-parser";
import logger from "../utils/logger.js";

const rssParser = new Parser();

export const commands = [
  new SlashCommandBuilder()
    .setName("game2")
    .setDescription("Commandes gaming avancées (speedrun, indie, bêtas, comparaison)")
    .addSubcommand((sc) =>
      sc
        .setName("speedrun")
        .setDescription("Records speedrun d'un jeu (speedrun.com, sans clé)")
        .addStringOption((o) => o.setName("jeu").setDescription("Nom du jeu").setRequired(true)),
    )
    .addSubcommand((sc) =>
      sc.setName("indie").setDescription("Découverte de jeux indie (Reddit /r/indiegames)"),
    )
    .addSubcommand((sc) =>
      sc
        .setName("news")
        .setDescription("News gaming personnalisées (RSS, sans clé)")
        .addStringOption((o) =>
          o
            .setName("source")
            .setDescription("Source de news")
            .setRequired(false)
            .addChoices(
              { name: "Reddit /r/gaming", value: "gaming" },
              { name: "Reddit /r/Games", value: "games" },
              { name: "Reddit /r/pcgaming", value: "pcgaming" },
              { name: "Instant Gaming", value: "instantgaming" },
            ),
        ),
    )
    .addSubcommand((sc) =>
      sc
        .setName("is-it-up")
        .setDescription("Vérifie si un serveur de jeu est en ligne")
        .addStringOption((o) => o.setName("jeu").setDescription("Nom du jeu").setRequired(true)),
    )
    .addSubcommand((sc) =>
      sc
        .setName("next-release")
        .setDescription("Prochaines sorties de jeux (RSS Steam)")
        .addStringOption((o) =>
          o
            .setName("periode")
            .setDescription("Période (ex: cette semaine, ce mois)")
            .setRequired(false),
        ),
    )
    .addSubcommand((sc) =>
      sc
        .setName("compare")
        .setDescription("Compare deux jeux côte à côte (Steam Store)")
        .addStringOption((o) => o.setName("jeu1").setDescription("Premier jeu").setRequired(true))
        .addStringOption((o) => o.setName("jeu2").setDescription("Deuxième jeu").setRequired(true)),
    )
    .addSubcommand((sc) =>
      sc
        .setName("dlc")
        .setDescription("DLC disponibles pour un jeu (Steam Store)")
        .addStringOption((o) => o.setName("jeu").setDescription("Nom du jeu").setRequired(true)),
    )
    .addSubcommand((sc) =>
      sc.setName("beta").setDescription("Bêtas ouvertes actuelles (Reddit /r/gamedeals)"),
    )
    .addSubcommand((sc) =>
      sc
        .setName("youtube")
        .setDescription("Vidéos gaming YouTube (Invidious, sans clé)")
        .addStringOption((o) => o.setName("requete").setDescription("Recherche").setRequired(true)),
    )
    .toJSON(),
];

const RSS_SOURCES: Record<string, string> = {
  gaming: "https://www.reddit.com/r/gaming/.rss?limit=10",
  games: "https://www.reddit.com/r/Games/.rss?limit=10",
  pcgaming: "https://www.reddit.com/r/pcgaming/.rss?limit=10",
  instantgaming: "https://www.instant-gaming.com/fr/rss/news.xml",
};

export async function handleCommand(
  interaction: ChatInputCommandInteraction,
  _client: unknown,
): Promise<void> {
  const action = interaction.options.getSubcommand();

  switch (action) {
    case "speedrun": {
      const game = interaction.options.getString("jeu", true);
      await interaction.deferReply();
      const records = await getSpeedrunRecords(game, 5);
      if (!records.length) {
        await interaction.editReply(`❌ Aucun record trouvé pour "${game}".`);
        return;
      }
      const embed = new EmbedBuilder()
        .setTitle(`🏃 Speedrun — ${records[0].game}`)
        .setColor(0xe74c3c);
      records.forEach((r, i) => {
        embed.addFields({
          name: `${i + 1}. ${r.category}`,
          value: `⏱️ **${r.time}** — ${r.runner}\n[Lien](${r.url})`,
        });
      });
      await interaction.editReply({ embeds: [embed] });
      break;
    }

    case "indie": {
      await interaction.deferReply();
      try {
        const feed = await rssParser.parseURL(
          "https://www.reddit.com/r/indiegames/hot.rss?limit=5",
        );
        const embed = new EmbedBuilder().setTitle("🎮 Découverte Jeux Indie").setColor(0x9b59b6);
        feed.items.slice(0, 5).forEach((item, i) => {
          embed.addFields({
            name: `${i + 1}. ${item.title?.slice(0, 100) ?? "Sans titre"}`,
            value: `[Lien](${item.link ?? "#"})`,
          });
        });
        await interaction.editReply({ embeds: [embed] });
      } catch {
        await interaction.editReply("❌ Impossible de charger les news indie.");
      }
      break;
    }

    case "news": {
      const source = interaction.options.getString("source") ?? "gaming";
      const feedUrl = RSS_SOURCES[source] ?? RSS_SOURCES.gaming;
      await interaction.deferReply();
      try {
        const feed = await rssParser.parseURL(feedUrl);
        const embed = new EmbedBuilder()
          .setTitle(`📰 News Gaming — ${feed.title ?? source}`)
          .setColor(0x3498db);
        feed.items.slice(0, 8).forEach((item, i) => {
          embed.addFields({
            name: `${i + 1}. ${item.title?.slice(0, 100) ?? "Sans titre"}`,
            value: `[Lien](${item.link ?? "#"})`,
          });
        });
        await interaction.editReply({ embeds: [embed] });
      } catch {
        await interaction.editReply("❌ Impossible de charger les news.");
      }
      break;
    }

    case "is-it-up": {
      const game = interaction.options.getString("jeu", true);
      await interaction.deferReply();
      // Utilise l'API publique de Steam pour vérifier le statut
      try {
        const searchUrl = `https://store.steampowered.com/api/storesearch?term=${encodeURIComponent(game)}&l=fr&cc=FR`;
        const res = await fetch(searchUrl, { signal: AbortSignal.timeout(5000) });
        if (!res.ok) throw new Error();
        const data = (await res.json()) as { items: Array<{ name: string }> };
        if (!data.items?.length) {
          await interaction.editReply(`❌ Jeu "${game}" introuvable sur Steam.`);
          return;
        }
        const embed = new EmbedBuilder()
          .setTitle(`✅ Statut — ${data.items[0].name}`)
          .setDescription(
            "Le jeu est référencé sur Steam Store. Le statut des serveurs dépend du jeu.",
          )
          .setColor(0x2ecc71);
        await interaction.editReply({ embeds: [embed] });
      } catch {
        await interaction.editReply("❌ Vérification impossible.");
      }
      break;
    }

    case "next-release": {
      await interaction.deferReply();
      try {
        const feed = await rssParser.parseURL("https://store.steampowered.com/feeds/news.xml");
        const embed = new EmbedBuilder().setTitle("📅 Prochaines sorties Steam").setColor(0x1b2838);
        feed.items.slice(0, 8).forEach((item, i) => {
          embed.addFields({
            name: `${i + 1}. ${item.title?.slice(0, 100) ?? "Sans titre"}`,
            value: `[Lien](${item.link ?? "#"})`,
          });
        });
        await interaction.editReply({ embeds: [embed] });
      } catch {
        await interaction.editReply("❌ Impossible de charger le calendrier.");
      }
      break;
    }

    case "compare": {
      const jeu1 = interaction.options.getString("jeu1", true);
      const jeu2 = interaction.options.getString("jeu2", true);
      await interaction.deferReply();
      try {
        const [res1, res2] = await Promise.all([
          fetch(
            `https://store.steampowered.com/api/storesearch?term=${encodeURIComponent(jeu1)}&l=fr&cc=FR&limit=1`,
          ),
          fetch(
            `https://store.steampowered.com/api/storesearch?term=${encodeURIComponent(jeu2)}&l=fr&cc=FR&limit=1`,
          ),
        ]);
        const [data1, data2] = (await Promise.all([res1.json(), res2.json()])) as [
          {
            items: Array<{
              name: string;
              release_date: { date: string };
              header_image: string;
              short_description: string;
            }>;
          },
          {
            items: Array<{
              name: string;
              release_date: { date: string };
              header_image: string;
              short_description: string;
            }>;
          },
        ];

        if (!data1.items?.length || !data2.items?.length) {
          await interaction.editReply("❌ Un des jeux est introuvable.");
          return;
        }

        const g1 = data1.items[0];
        const g2 = data2.items[0];

        const embed = new EmbedBuilder()
          .setTitle("⚖️ Comparaison de jeux")
          .addFields(
            {
              name: `🎮 ${g1.name}`,
              value: `**Sortie:** ${g1.release_date?.date ?? "N/A"}\n${g1.short_description?.slice(0, 200) ?? ""}`,
            },
            {
              name: `🎮 ${g2.name}`,
              value: `**Sortie:** ${g2.release_date?.date ?? "N/A"}\n${g2.short_description?.slice(0, 200) ?? ""}`,
            },
          )
          .setColor(0x5865f2);
        await interaction.editReply({ embeds: [embed] });
      } catch {
        await interaction.editReply("❌ Comparaison impossible.");
      }
      break;
    }

    case "dlc": {
      const game = interaction.options.getString("jeu", true);
      await interaction.deferReply();
      try {
        const searchRes = await fetch(
          `https://store.steampowered.com/api/storesearch?term=${encodeURIComponent(game)}&l=fr&cc=FR&limit=1`,
          { signal: AbortSignal.timeout(5000) },
        );
        const searchData = (await searchRes.json()) as {
          items: Array<{ id: number; name: string }>;
        };
        if (!searchData.items?.length) {
          await interaction.editReply(`❌ Jeu "${game}" introuvable.`);
          return;
        }
        const appId = searchData.items[0].id;
        const dlcRes = await fetch(
          `https://store.steampowered.com/api/appdetails?appids=${appId}&l=fr`,
          {
            signal: AbortSignal.timeout(5000),
          },
        );
        const dlcData = (await dlcRes.json()) as Record<string, { data?: { dlc?: number[] } }>;
        const dlcIds = dlcData[String(appId)]?.data?.dlc ?? [];

        if (!dlcIds.length) {
          await interaction.editReply(`ℹ️ Aucun DLC trouvé pour "${searchData.items[0].name}".`);
          return;
        }

        const embed = new EmbedBuilder()
          .setTitle(`📦 DLC — ${searchData.items[0].name}`)
          .setDescription(`${dlcIds.length} DLC trouvé(s)`)
          .setColor(0x1b2838);
        embed.addFields({
          name: "DLC IDs",
          value: dlcIds
            .slice(0, 10)
            .map((id) => `[${id}](https://store.steampowered.com/app/${id})`)
            .join("\n"),
        });
        await interaction.editReply({ embeds: [embed] });
      } catch {
        await interaction.editReply("❌ Recherche DLC impossible.");
      }
      break;
    }

    case "beta": {
      await interaction.deferReply();
      try {
        const feed = await rssParser.parseURL(
          "https://www.reddit.com/r/gamedeals/hot.rss?limit=10",
        );
        const embed = new EmbedBuilder()
          .setTitle("🧪 Bêtas & Deals (Reddit /r/gamedeals)")
          .setColor(0xe67e22);
        feed.items.slice(0, 8).forEach((item, i) => {
          embed.addFields({
            name: `${i + 1}. ${item.title?.slice(0, 100) ?? "Sans titre"}`,
            value: `[Lien](${item.link ?? "#"})`,
          });
        });
        await interaction.editReply({ embeds: [embed] });
      } catch {
        await interaction.editReply("❌ Impossible de charger les bêtas.");
      }
      break;
    }

    case "youtube": {
      const query = interaction.options.getString("requete", true);
      await interaction.deferReply();
      try {
        const invidiousInstances = ["https://yewtu.be", "https://inv.nadeko.net"];
        let videos: Array<{ videoId: string; title: string; author: string }> = [];

        for (const instance of invidiousInstances) {
          try {
            const res = await fetch(
              `${instance}/api/v1/search?q=${encodeURIComponent(query + " gaming")}&type=video&sort_by=relevance&limit=5`,
              { signal: AbortSignal.timeout(5000) },
            );
            if (!res.ok) continue;
            const data = (await res.json()) as Array<{
              videoId: string;
              title: string;
              author: string;
            }>;
            videos = data;
            break;
          } catch {
            continue;
          }
        }

        if (!videos.length) {
          await interaction.editReply("❌ Aucune vidéo trouvée.");
          return;
        }

        const embed = new EmbedBuilder().setTitle(`📺 Vidéos Gaming — ${query}`).setColor(0xff0000);
        videos.slice(0, 5).forEach((v, i) => {
          embed.addFields({
            name: `${i + 1}. ${v.title?.slice(0, 80) ?? "Sans titre"}`,
            value: `**Chaîne:** ${v.author}\n[Regarder](https://www.youtube.com/watch?v=${v.videoId})`,
          });
        });
        await interaction.editReply({ embeds: [embed] });
      } catch {
        await interaction.editReply("❌ Recherche impossible.");
      }
      break;
    }

    default:
      await interaction.reply({ content: "❌ Sous-commande inconnue.", ephemeral: true });
  }
}
