import cron from "node-cron";
import { Client, EmbedBuilder, TextChannel, ChannelType } from "discord.js";
import prisma from "../prisma.js";
import logger from "../utils/logger.js";
import { fetchFreeGames } from "../services/epicgames.js";
import { fetchShop } from "../services/fortnite-api.js";
import { config } from "../config.js";

const FOOTER = { text: "Wishlist Alert • Notifications automatiques" };

// Map plateforme wishlist → salon Discord configuré
// Epic/Steam: pas d'envoi salon (déjà géré par freeGamesCron et dealsCron)
const PLATFORM_CHANNELS: Record<string, string> = {
  fortnite: config.fortniteChannel,
  playstation: config.playstationChannel,
  xbox: config.xboxChannel,
  nintendo: config.nintendoChannel,
};

// Locks anti-concurrence : un seul run simultané par fonction
const runningChecks = {
  epic: false,
  fortnite: false,
  instantGaming: false,
};

async function sendToPlatformChannel(
  client: Client,
  platform: string,
  embed: EmbedBuilder,
): Promise<void> {
  const channelId = PLATFORM_CHANNELS[platform];
  if (!channelId) {
    logger.warn(`[WishlistCron] Aucun salon configuré pour la plateforme "${platform}"`);
    return;
  }
  const channel = await client.channels.fetch(channelId).catch(() => null);
  if (!channel || channel.type !== ChannelType.GuildText) {
    logger.warn(`[WishlistCron] Salon ${channelId} inaccessible ou non textuel pour "${platform}"`);
    return;
  }
  await (channel as TextChannel).send({ embeds: [embed] }).catch((err) => {
    logger.error(`[WishlistCron] Erreur envoi salon ${channelId}:`, String(err));
  });
}

// Vérifie les offres gratuites Epic Games et compare avec les wishlists
// N'envoie PAS dans le salon (freeGamesCron le fait déjà) — DM uniquement
async function checkEpicFreeGames(client: Client): Promise<void> {
  if (runningChecks.epic) {
    logger.warn("[WishlistCron] checkEpicFreeGames déjà en cours, skip");
    return;
  }
  runningChecks.epic = true;
  try {
    const freeGames = await fetchFreeGames(client);
    if (!freeGames || freeGames.length === 0) return;

    const epicWishlists = await prisma.wishlist.findMany({
      where: { platform: "epic" },
    });
    if (epicWishlists.length === 0) return;

    // Déduplication : un jeu gratuit notifié à un utilisateur ne le sera pas à nouveau < 24h
    // Le lastNotifiedAt est mis à jour AVANT l'envoi pour éviter les race conditions
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

        // Marquer comme notifié AVANT l'envoi (anti race condition)
        await prisma.wishlist.update({
          where: { id: match.id },
          data: { lastNotifiedAt: new Date() },
        });

        // DM uniquement — freeGamesCron gère déjà le salon
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
        logger.info(`[WishlistCron] Notif DM Epic envoyée à ${match.userId} pour ${game.title}`);
      }
    }
  } catch (err) {
    logger.error("[WishlistCron] Erreur Epic free games:", String(err));
  } finally {
    runningChecks.epic = false;
  }
}

// Vérifie les réductions Instant Gaming pour tous les jeux en wishlist (toutes plateformes)
async function checkInstantGamingDeals(_client: Client): Promise<void> {
  if (runningChecks.instantGaming) {
    logger.warn("[WishlistCron] checkInstantGamingDeals déjà en cours, skip");
    return;
  }
  runningChecks.instantGaming = true;
  try {
    const allWishlists = await prisma.wishlist.findMany({
      where: { platform: { not: "fortnite" } },
    });
    if (allWishlists.length === 0) return;

    logger.info(`[WishlistCron] ${allWishlists.length} jeux en wishlist non-Fortnite à surveiller`);
    // TODO: Implémenter une recherche par nom quand l'API le permettra
  } catch (err) {
    logger.error("[WishlistCron] Erreur InstantGaming:", String(err));
  } finally {
    runningChecks.instantGaming = false;
  }
}

// Vérifie la boutique Fortnite pour les items en wishlist
// Envoie dans le salon Fortnite (une seule fois par item) + DM à chaque utilisateur
async function checkFortniteShop(client: Client): Promise<void> {
  if (runningChecks.fortnite) {
    logger.warn("[WishlistCron] checkFortniteShop déjà en cours, skip");
    return;
  }
  runningChecks.fortnite = true;
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

    // Déduplication salon : un seul embed par item dans le salon, même si N utilisateurs l'ont
    const salonNotifiedItems = new Set<string>();

    for (const wish of fortniteWishlists) {
      const matched = shopMap.get(wish.itemName);
      if (!matched) continue;

      const alreadyNotified =
        wish.lastNotifiedAt && Date.now() - wish.lastNotifiedAt!.getTime() < 24 * 60 * 60 * 1000;
      if (alreadyNotified) continue;

      // Marquer comme notifié AVANT l'envoi (anti race condition)
      await prisma.wishlist.update({
        where: { id: wish.id },
        data: { lastNotifiedAt: new Date() },
      });

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

      // 1. Envoi dans le salon Fortnite — une seule fois par item
      if (!salonNotifiedItems.has(wish.itemName)) {
        salonNotifiedItems.add(wish.itemName);
        await sendToPlatformChannel(client, "fortnite", embed);
      }

      // 2. Envoi en DM si activé
      const pref = await prisma.userPreference.findUnique({ where: { userId: wish.userId } });
      if (pref?.wishlistDm !== false) {
        const user = await client.users.fetch(wish.userId).catch(() => null);
        if (user) {
          await user.send({ embeds: [embed] }).catch(() => {
            logger.warn(`[WishlistCron] Impossible de DM ${wish.userId}`);
          });
        }
      }
      logger.info(
        `[WishlistCron] Notif Fortnite envoyée à ${wish.userId} pour ${matched.displayName}`,
      );
    }
  } catch (err) {
    logger.error("[WishlistCron] Erreur Fortnite shop:", String(err));
  } finally {
    runningChecks.fortnite = false;
  }
}

export function startWishlistCron(client: Client): void {
  // Vérifie les jeux gratuits Epic Games toutes les 2 heures (DM uniquement)
  cron.schedule("0 */2 * * *", () => {
    logger.info("[WishlistCron] Vérification Epic Games free games...");
    void checkEpicFreeGames(client);
  });

  // Vérifie les réductions Instant Gaming toutes les 4 heures
  cron.schedule("0 */4 * * *", () => {
    logger.info("[WishlistCron] Vérification réductions Instant Gaming...");
    void checkInstantGamingDeals(client);
  });

  // Vérifie la boutique Fortnite toutes les 3 heures (salon + DM)
  cron.schedule("0 */3 * * *", () => {
    logger.info("[WishlistCron] Vérification boutique Fortnite...");
    void checkFortniteShop(client);
  });

  logger.info(
    "[WishlistCron] Tâches cron wishlist démarrées (Epic 2h DM-only, InstantGaming 4h, Fortnite 3h salon+DM)",
  );
}
