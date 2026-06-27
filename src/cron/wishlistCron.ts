import cron from "node-cron";
import { Client, EmbedBuilder } from "discord.js";
import prisma from "../prisma.js";
import logger from "../utils/logger.js";
import { fetchFreeGames } from "../services/epicgames.js";
import { fetchShop } from "../services/fortnite-api.js";

const FOOTER = { text: "Wishlist Alert • Notifications automatiques" };

// Vérifie les offres gratuites Epic Games et compare avec les wishlists
async function checkEpicFreeGames(client: Client): Promise<void> {
  try {
    const freeGames = await fetchFreeGames(client);
    if (!freeGames || freeGames.length === 0) return;

    const epicWishlists = await prisma.wishlist.findMany({
      where: { platform: "epic" },
    });
    if (epicWishlists.length === 0) return;

    for (const game of freeGames) {
      const gameNameLower = game.title.toLowerCase();
      const matches = epicWishlists.filter(
        (w) =>
          w.itemName === gameNameLower ||
          w.itemName.includes(gameNameLower) ||
          gameNameLower.includes(w.itemName),
      );

      for (const match of matches) {
        const alreadyNotified =
          match.lastNotifiedAt && Date.now() - match.lastNotifiedAt.getTime() < 24 * 60 * 60 * 1000;
        if (alreadyNotified) continue;

        const pref = await prisma.userPreference.findUnique({ where: { userId: match.userId } });
        if (pref?.wishlistDm === false) continue;

        const user = await client.users.fetch(match.userId).catch(() => null);
        if (!user) continue;

        const embed = new EmbedBuilder()
          .setTitle("🎯 JEU GRATUIT — Epic Games")
          .setDescription(`**${game.title}** est actuellement **GRATUIT** sur l'Epic Games Store !`)
          .setColor(0x00ff00)
          .setFooter(FOOTER)
          .setTimestamp();

        if (game.imageUrl) embed.setImage(game.imageUrl);
        if (game.url) {
          embed.addFields({
            name: "🔗 Lien",
            value: `[Réclamer le jeu](${game.url})`,
            inline: false,
          });
        }

        await user.send({ embeds: [embed] }).catch(() => {
          logger.warn(`[WishlistCron] Impossible de DM ${match.userId}`);
        });

        await prisma.wishlist.update({
          where: { id: match.id },
          data: { lastNotifiedAt: new Date() },
        });
        logger.info(`[WishlistCron] Notif Epic envoyée à ${match.userId} pour ${game.title}`);
      }
    }
  } catch (err) {
    logger.error("[WishlistCron] Erreur Epic free games:", String(err));
  }
}

// Vérifie les réductions Instant Gaming pour tous les jeux en wishlist (toutes plateformes)
async function checkInstantGamingDeals(_client: Client): Promise<void> {
  try {
    const allWishlists = await prisma.wishlist.findMany({
      where: { platform: { not: "fortnite" } },
    });
    if (allWishlists.length === 0) return;

    // Utilise l'API Instant Gaming existante via checkInstantGamingNews
    // On ne peut pas chercher par nom directement, donc on log pour suivi
    logger.info(`[WishlistCron] ${allWishlists.length} jeux en wishlist non-Fortnite à surveiller`);
    // TODO: Implémenter une recherche par nom quand l'API le permettra
  } catch (err) {
    logger.error("[WishlistCron] Erreur InstantGaming:", String(err));
  }
}

// Vérifie la boutique Fortnite pour les items en wishlist
async function checkFortniteShop(client: Client): Promise<void> {
  try {
    const shop = await fetchShop();
    if (!shop) return;

    const fortniteWishlists = await prisma.wishlist.findMany({
      where: { platform: "fortnite" },
    });
    if (fortniteWishlists.length === 0) return;

    const allShopItems = [
      ...shop.featured,
      ...shop.daily,
      ...shop.specialFeatured,
      ...shop.specialDaily,
    ];
    const shopMap = new Map<
      string,
      { displayName: string; price: number; rarity: string; icon: string }
    >();
    for (const entry of allShopItems) {
      for (const name of entry.allNames) {
        if (!shopMap.has(name)) {
          shopMap.set(name, {
            displayName: entry.displayName,
            price: entry.price,
            rarity: entry.rarity,
            icon: entry.icon,
          });
        }
      }
    }

    for (const wish of fortniteWishlists) {
      const matched = shopMap.get(wish.itemName);
      if (!matched) continue;

      const alreadyNotified =
        wish.lastNotifiedAt && Date.now() - wish.lastNotifiedAt!.getTime() < 24 * 60 * 60 * 1000;
      if (alreadyNotified) continue;

      const pref = await prisma.userPreference.findUnique({ where: { userId: wish.userId } });
      if (pref?.wishlistDm === false) continue;

      const user = await client.users.fetch(wish.userId).catch(() => null);
      if (!user) continue;

      const priceStr = matched.price > 0 ? `${matched.price} V-Bucks` : "Gratuit";
      const embed = new EmbedBuilder()
        .setTitle("🎮 Item disponible — Boutique Fortnite")
        .setDescription(
          `**${matched.displayName}** est maintenant dans la boutique !\nRareté: ${matched.rarity}\nPrix: **${priceStr}**`,
        )
        .setColor(0x9b59b6)
        .setFooter(FOOTER)
        .setTimestamp();

      if (matched.icon) embed.setThumbnail(matched.icon);

      await user.send({ embeds: [embed] }).catch(() => {
        logger.warn(`[WishlistCron] Impossible de DM ${wish.userId}`);
      });

      await prisma.wishlist.update({
        where: { id: wish.id },
        data: { lastNotifiedAt: new Date() },
      });
      logger.info(
        `[WishlistCron] Notif Fortnite envoyée à ${wish.userId} pour ${matched.displayName}`,
      );
    }
  } catch (err) {
    logger.error("[WishlistCron] Erreur Fortnite shop:", String(err));
  }
}

export function startWishlistCron(client: Client): void {
  // Vérifie les jeux gratuits Epic Games toutes les 2 heures
  cron.schedule("0 */2 * * *", () => {
    logger.info("[WishlistCron] Vérification Epic Games free games...");
    void checkEpicFreeGames(client);
  });

  // Vérifie les réductions Instant Gaming toutes les 4 heures
  cron.schedule("0 */4 * * *", () => {
    logger.info("[WishlistCron] Vérification réductions Instant Gaming...");
    void checkInstantGamingDeals(client);
  });

  // Vérifie la boutique Fortnite toutes les 3 heures
  cron.schedule("0 */3 * * *", () => {
    logger.info("[WishlistCron] Vérification boutique Fortnite...");
    void checkFortniteShop(client);
  });

  logger.info(
    "[WishlistCron] Tâches cron wishlist démarrées (Epic 2h, InstantGaming 4h, Fortnite 3h)",
  );
}
