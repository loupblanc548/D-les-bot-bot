import { Client, EmbedBuilder, TextChannel } from "discord.js";
import { createClient } from "redis";

const redis = createClient({
  url: process.env.REDIS_URL || "redis://localhost:6379",
});

redis.on("error", (err: Error) => console.error("[Redis] Error:", err));
redis.connect().catch((err) => console.error("[Redis] Connect error:", err));

const EPIC_API_URL = "https://store-site-backend-static.ak.epicgames.com/freeGamesPromotions";
const CHECK_INTERVAL = 15 * 60 * 1000; // 15 minutes
const EPIC_POSTED_KEY_PREFIX = "epic:posted:";
const EPIC_TTL = 7 * 24 * 60 * 60; // 7 days

interface EpicGame {
  id: string;
  title: string;
  description: string;
  url: string;
  image: string;
  startDate: string;
  endDate: string;
}

export function startEpicGamesAggregator(client: Client): void {
  console.log("[EpicGames] Starting Epic Games aggregator");

  setInterval(async () => {
    await checkEpicGames(client);
  }, CHECK_INTERVAL);

  checkEpicGames(client);
}

async function checkEpicGames(client: Client): Promise<void> {
  try {
    const response = await fetch(EPIC_API_URL);
    if (!response.ok) {
      throw new Error(`Epic API error: ${response.status}`);
    }

    const data = await response.json();
    const games = parseEpicGames(data);

    for (const game of games) {
      await processGame(client, game);
    }
  } catch (error) {
    console.error("[EpicGames] Error:", error);
  }
}

function parseEpicGames(data: any): EpicGame[] {
  const games: EpicGame[] = [];

  if (!data?.data?.Catalog?.catalogOffer?.offers) {
    return games;
  }

  for (const offer of data.data.Catalog.catalogOffer.offers) {
    try {
      const promotions = offer.promotions?.promotionalOffers;
      if (!promotions || promotions.length === 0) continue;

      const promotionalOffer = promotions[0]?.promotionalOffers?.[0];
      if (!promotionalOffer) continue;

      const startDate = promotionalOffer.startDate;
      const endDate = promotionalOffer.endDate;

      const now = new Date();
      const start = new Date(startDate);
      const end = new Date(endDate);

      if (now < start || now > end) continue;

      const product = offer.catalogNs?.mappings?.[0]?.pageSlug || "";
      const title = offer.title || "Sans titre";
      const description = offer.description || "Sans description";
      const url = `https://store.epicgames.com/p/${product}`;
      const image = offer.keyImages?.[0]?.url || "";

      games.push({
        id: offer.id,
        title,
        description,
        url,
        image,
        startDate,
        endDate,
      });
    } catch (error) {
      console.error("[EpicGames] Error parsing offer:", error);
    }
  }

  return games;
}

async function processGame(client: Client, game: EpicGame): Promise<void> {
  try {
    const postedKey = `${EPIC_POSTED_KEY_PREFIX}${game.id}`;
    const isPosted = await redis.get(postedKey);

    if (isPosted) {
      return;
    }

    const channelId = process.env.EPIC_GAMES_CHANNEL_ID;
    if (!channelId) {
      console.error("[EpicGames] EPIC_GAMES_CHANNEL_ID not defined");
      return;
    }

    const channel = await client.channels.fetch(channelId);
    if (!channel || !(channel instanceof TextChannel)) {
      console.error(`[EpicGames] Invalid channel: ${channelId}`);
      return;
    }

    const embed = new EmbedBuilder()
      .setTitle("🎮 EPIC GAMES - GRATUIT")
      .setDescription(game.title)
      .addFields(
        { name: "📝 Description", value: game.description.substring(0, 300) },
        { name: "📅 Disponible du", value: formatDate(game.startDate) },
        { name: "📅 Jusqu'au", value: formatDate(game.endDate) },
        { name: "🔗 Lien", value: game.url },
      )
      .setImage(game.image)
      .setColor(0x00d4ff)
      .setFooter({ text: "John Helldiver • Super Earth Command" })
      .setTimestamp();

    await channel.send({ embeds: [embed] });

    await redis.set(postedKey, "1", { EX: EPIC_TTL });

    console.log(`[EpicGames] Posted new free game: ${game.title}`);
  } catch (error) {
    console.error(`[EpicGames] Error processing game ${game.title}:`, error);
  }
}

function formatDate(dateString: string): string {
  const date = new Date(dateString);
  return date.toLocaleDateString("fr-FR", {
    day: "2-digit",
    month: "2-digit",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  });
}
