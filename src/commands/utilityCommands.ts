/**
 * utilityCommands.ts — Commandes utilitaires et gaming
 *
 * /qr-code               — Génère un QR code pour une URL
 * /wishlist-stats        — Stats de ta wishlist (nb jeux, drops, valeur)
 * /free-game-reminder    — Rappel pour le prochain jeu gratuit annoncé
 * /fortnite-shop-preview — Aperçu de la boutique Fortnite du jour
 * /epic-calendar         — Calendrier des jeux gratuits Epic annoncés
 */

import {
  ChatInputCommandInteraction,
  SlashCommandBuilder,
  EmbedBuilder,
  MessageFlags,
  AttachmentBuilder,
} from "discord.js";
import logger from "../utils/logger.js";
import prisma from "../prisma.js";

const FOOTER = { text: "Utility • Gaming Tools" };

// ─── Définitions des commandes ───────────────────────────────────────────────

export const commands = [
  new SlashCommandBuilder()
    .setName("qr-code")
    .setDescription("Génère un QR code pour une URL")
    .addStringOption((opt) =>
      opt.setName("url").setDescription("L'URL à encoder").setRequired(true),
    )
    .addIntegerOption((opt) =>
      opt
        .setName("taille")
        .setDescription("Taille en pixels (défaut: 300, max: 1000)")
        .setRequired(false)
        .setMinValue(100)
        .setMaxValue(1000),
    )
    .toJSON(),

  new SlashCommandBuilder()
    .setName("wishlist-stats")
    .setDescription("Statistiques de ta wishlist de jeux")
    .addUserOption((opt) =>
      opt
        .setName("utilisateur")
        .setDescription("Voir la wishlist d'un autre utilisateur")
        .setRequired(false),
    )
    .toJSON(),

  new SlashCommandBuilder()
    .setName("free-game-reminder")
    .setDescription("Affiche les prochains jeux gratuits annoncés (Epic, Steam, etc.)")
    .toJSON(),

  new SlashCommandBuilder()
    .setName("fortnite-shop-preview")
    .setDescription("Aperçu des derniers items trackés dans la boutique Fortnite")
    .toJSON(),

  new SlashCommandBuilder()
    .setName("epic-calendar")
    .setDescription("Calendrier des jeux gratuits Epic Games récents et à venir")
    .toJSON(),
];

// ─── Handler principal ───────────────────────────────────────────────────────

export async function handleCommand(interaction: ChatInputCommandInteraction): Promise<void> {
  try {
    switch (interaction.commandName) {
      case "qr-code":
        await handleQrCode(interaction);
        break;
      case "wishlist-stats":
        await handleWishlistStats(interaction);
        break;
      case "free-game-reminder":
        await handleFreeGameReminder(interaction);
        break;
      case "fortnite-shop-preview":
        await handleFortniteShopPreview(interaction);
        break;
      case "epic-calendar":
        await handleEpicCalendar(interaction);
        break;
    }
  } catch (error) {
    logger.error(
      `[Utility] Erreur ${interaction.commandName}: ${error instanceof Error ? error.message : String(error)}`,
    );
    try {
      if (interaction.deferred || interaction.replied) {
        await interaction.editReply({ content: `❌ Erreur : ${String(error).slice(0, 150)}` });
      } else {
        await interaction.reply({
          content: `❌ Erreur : ${String(error).slice(0, 150)}`,
          flags: [MessageFlags.Ephemeral],
        });
      }
    } catch {}
  }
}

// ─── /qr-code ────────────────────────────────────────────────────────────────

async function handleQrCode(interaction: ChatInputCommandInteraction): Promise<void> {
  const url = interaction.options.getString("url", true);
  const size = interaction.options.getInteger("taille") || 300;

  // Valider l'URL
  try {
    new URL(url);
  } catch {
    await interaction.reply({
      content: "❌ URL invalide. Exemple : `https://example.com`",
      flags: [MessageFlags.Ephemeral],
    });
    return;
  }

  await interaction.deferReply();

  try {
    // Utiliser l'API publique goqr.me (gratuite, sans clé)
    const qrUrl = `https://api.qrserver.com/v1/create-qr-code/?size=${size}x${size}&data=${encodeURIComponent(url)}&bgcolor=ffffff&color=000000&margin=10`;

    const response = await fetch(qrUrl);
    if (!response.ok) {
      throw new Error(`API QR code responded ${response.status}`);
    }

    const buffer = Buffer.from(await response.arrayBuffer());
    const attachment = new AttachmentBuilder(buffer, { name: "qrcode.png" });

    const embed = new EmbedBuilder()
      .setTitle("📱 QR Code généré")
      .setColor(0x5865f2)
      .setDescription(`URL encodée : ${url}`)
      .setImage("attachment://qrcode.png")
      .addFields({ name: "Taille", value: `${size}×${size}px`, inline: true })
      .setFooter(FOOTER)
      .setTimestamp();

    await interaction.editReply({ embeds: [embed], files: [attachment] });
    logger.info(`[Utility] QR code généré par ${interaction.user.tag}: ${url}`);
  } catch (error) {
    logger.error(
      `[Utility] QR code error: ${error instanceof Error ? error.message : String(error)}`,
    );
    await interaction.editReply({
      content: "❌ Impossible de générer le QR code. Le service est peut-être indisponible.",
    });
  }
}

// ─── /wishlist-stats ─────────────────────────────────────────────────────────

async function handleWishlistStats(interaction: ChatInputCommandInteraction): Promise<void> {
  await interaction.deferReply({ flags: [MessageFlags.Ephemeral] });

  const targetUser = interaction.options.getUser("utilisateur") ?? interaction.user;
  const guildId = interaction.guildId;

  // Récupérer les items de la wishlist
  const wishlistItems = await prisma.wishlist.findMany({
    where: {
      userId: targetUser.id,
      ...(guildId ? { guildId } : {}),
    },
    orderBy: { createdAt: "desc" },
  });

  if (wishlistItems.length === 0) {
    await interaction.editReply({
      content: `⚠️ Aucun item dans la wishlist de ${targetUser.tag}.`,
    });
    return;
  }

  // Stats par plateforme
  const platformCounts = new Map<string, number>();
  for (const item of wishlistItems) {
    platformCounts.set(item.platform, (platformCounts.get(item.platform) ?? 0) + 1);
  }

  // Items notifiés récemment (drops de prix)
  const notifiedCount = wishlistItems.filter((item) => item.lastNotifiedAt !== null).length;

  // Notifié dans les 7 derniers jours
  const weekAgo = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000);
  const recentDrops = wishlistItems.filter(
    (item) => item.lastNotifiedAt && item.lastNotifiedAt >= weekAgo,
  ).length;

  const platformText = [...platformCounts.entries()]
    .map(([platform, count]) => `**${platform}**: ${count}`)
    .join(" | ");

  const embed = new EmbedBuilder()
    .setTitle(`📊 Stats Wishlist — ${targetUser.tag}`)
    .setColor(0x57f287)
    .setThumbnail(targetUser.displayAvatarURL())
    .addFields(
      { name: "📦 Total items", value: `${wishlistItems.length}`, inline: true },
      { name: "🔔 Notifications reçues", value: `${notifiedCount}`, inline: true },
      { name: "📉 Drops récents (7j)", value: `${recentDrops}`, inline: true },
      { name: "🎮 Plateformes", value: platformText, inline: false },
    )
    .setFooter(FOOTER)
    .setTimestamp();

  // Top 5 items récents
  const recentItems = wishlistItems.slice(0, 5);
  if (recentItems.length > 0) {
    const itemsText = recentItems.map((item) => `• ${item.itemName} (${item.platform})`).join("\n");
    embed.addFields({
      name: "📋 Derniers items ajoutés",
      value: itemsText.slice(0, 1024),
      inline: false,
    });
  }

  await interaction.editReply({ embeds: [embed] });
  logger.info(
    `[Utility] wishlist-stats: ${targetUser.tag} (${wishlistItems.length} items) par ${interaction.user.tag}`,
  );
}

// ─── /free-game-reminder ─────────────────────────────────────────────────────

async function handleFreeGameReminder(interaction: ChatInputCommandInteraction): Promise<void> {
  await interaction.deferReply();

  // Récupérer les jeux gratuits récents depuis ProcessedFreeGames
  const recentFreeGames = await prisma.processedFreeGames.findMany({
    orderBy: { processedAt: "desc" },
    take: 10,
  });

  // Récupérer les deals Epic récents
  const epicDeals = await prisma.epicDeal.findMany({
    where: { notified: true },
    orderBy: { createdAt: "desc" },
    take: 5,
  });

  // Deals Instant Gaming
  const igDeals = await prisma.instantGamingDeal.findMany({
    where: { notified: true },
    orderBy: { createdAt: "desc" },
    take: 5,
  });

  if (recentFreeGames.length === 0 && epicDeals.length === 0 && igDeals.length === 0) {
    await interaction.editReply({
      content: "⚠️ Aucun jeu gratuit ou deal récent trouvé dans l'historique.",
    });
    return;
  }

  const embed = new EmbedBuilder()
    .setTitle("🎮 Rappel — Jeux Gratuits & Deals")
    .setColor(0xe67e22)
    .setDescription("Voici les derniers jeux gratuits et deals notifiés récemment.")
    .setFooter(FOOTER)
    .setTimestamp();

  if (recentFreeGames.length > 0) {
    const freeGamesText = recentFreeGames
      .slice(0, 5)
      .map((game) => {
        const date = `<t:${Math.floor(game.processedAt.getTime() / 1000)}:R>`;
        return `• ${game.title || "Jeu gratuit"} — ${date}`;
      })
      .join("\n");
    embed.addFields({
      name: "🆓 Jeux gratuits récents",
      value: freeGamesText.slice(0, 1024),
      inline: false,
    });
  }

  if (epicDeals.length > 0) {
    const epicText = epicDeals
      .map((deal) => {
        const date = `<t:${Math.floor(deal.createdAt.getTime() / 1000)}:R>`;
        return `• ${deal.title} — ${deal.price ?? "Gratuit"} ${date}`;
      })
      .join("\n");
    embed.addFields({
      name: "🎮 Epic Games",
      value: epicText.slice(0, 1024),
      inline: false,
    });
  }

  if (igDeals.length > 0) {
    const igText = igDeals
      .map((deal) => {
        const date = `<t:${Math.floor(deal.createdAt.getTime() / 1000)}:R>`;
        const discount = deal.discount ? ` (-${deal.discount}%)` : "";
        return `• ${deal.title} — ${deal.price ?? "?"}${discount} ${date}`;
      })
      .join("\n");
    embed.addFields({
      name: "⚡ Instant Gaming",
      value: igText.slice(0, 1024),
      inline: false,
    });
  }

  await interaction.editReply({ embeds: [embed] });
  logger.info(`[Utility] free-game-reminder par ${interaction.user.tag}`);
}

// ─── /fortnite-shop-preview ──────────────────────────────────────────────────

async function handleFortniteShopPreview(interaction: ChatInputCommandInteraction): Promise<void> {
  await interaction.deferReply();

  // Récupérer les items Fortnite trackés dans la wishlist
  const fortniteItems = await prisma.wishlist.findMany({
    where: { platform: "fortnite" },
    orderBy: { createdAt: "desc" },
    take: 25,
  });

  if (fortniteItems.length === 0) {
    await interaction.editReply({
      content:
        "⚠️ Aucun item Fortnite tracké pour le moment. Utilise les commandes de tracking pour en ajouter.",
    });
    return;
  }

  // Grouper par utilisateur
  const userGroups = new Map<string, string[]>();
  for (const item of fortniteItems) {
    const userItems = userGroups.get(item.userId) ?? [];
    userItems.push(item.itemName);
    userGroups.set(item.userId, userItems);
  }

  const embed = new EmbedBuilder()
    .setTitle("🛒 Boutique Fortnite — Items Trackés")
    .setColor(0x9b59b6)
    .setDescription(
      `${fortniteItems.length} item(s) Fortnite suivis par ${userGroups.size} utilisateur(s)`,
    )
    .setFooter(FOOTER)
    .setTimestamp();

  // Top 10 items les plus récents
  const recentItems = fortniteItems.slice(0, 10);
  const itemsText = recentItems
    .map((item) => {
      const notified = item.lastNotifiedAt ? " ✅" : "";
      return `• ${item.itemName}${notified}`;
    })
    .join("\n");

  embed.addFields({
    name: "📋 Items récents",
    value: itemsText.slice(0, 1024),
    inline: false,
  });

  // Stats
  const notifiedCount = fortniteItems.filter((item) => item.lastNotifiedAt !== null).length;
  embed.addFields(
    { name: "📦 Total", value: `${fortniteItems.length}`, inline: true },
    { name: "🔔 Notifiés", value: `${notifiedCount}`, inline: true },
    { name: "👥 Utilisateurs", value: `${userGroups.size}`, inline: true },
  );

  await interaction.editReply({ embeds: [embed] });
  logger.info(`[Utility] fortnite-shop-preview par ${interaction.user.tag}`);
}

// ─── /epic-calendar ──────────────────────────────────────────────────────────

async function handleEpicCalendar(interaction: ChatInputCommandInteraction): Promise<void> {
  await interaction.deferReply();

  // Récupérer tous les deals Epic
  const epicDeals = await prisma.epicDeal.findMany({
    orderBy: { createdAt: "desc" },
    take: 20,
  });

  if (epicDeals.length === 0) {
    await interaction.editReply({
      content:
        "⚠️ Aucun deal Epic Games dans l'historique. Les deals apparaîtront ici une fois détectés par le bot.",
    });
    return;
  }

  // Séparer en actifs (endDate > now) et passés
  const now = new Date();
  const active = epicDeals.filter((deal) => deal.endDate && deal.endDate > now);
  const expired = epicDeals.filter((deal) => !deal.endDate || deal.endDate <= now);

  const embed = new EmbedBuilder()
    .setTitle("📅 Calendrier Epic Games")
    .setColor(0x5865f2)
    .setDescription(`${active.length} deal(s) actif(s) • ${expired.length} expiré(s)`)
    .setFooter(FOOTER)
    .setTimestamp();

  // Deals actifs
  if (active.length > 0) {
    const activeText = active
      .slice(0, 10)
      .map((deal) => {
        const end = deal.endDate
          ? `<t:${Math.floor(deal.endDate.getTime() / 1000)}:R>`
          : "Date inconnue";
        return `🟢 **${deal.title}**\n   Prix: ${deal.price ?? "Gratuit"} • Expire: ${end}`;
      })
      .join("\n");
    embed.addFields({
      name: "🟢 Deals actifs",
      value: activeText.slice(0, 1024),
      inline: false,
    });
  }

  // Deals expirés récents
  if (expired.length > 0) {
    const expiredText = expired
      .slice(0, 5)
      .map((deal) => {
        const date = `<t:${Math.floor(deal.createdAt.getTime() / 1000)}:R>`;
        return `⚫ ${deal.title} — ${deal.price ?? "Gratuit"} ${date}`;
      })
      .join("\n");
    embed.addFields({
      name: "⚫ Récemment expirés",
      value: expiredText.slice(0, 1024),
      inline: false,
    });
  }

  await interaction.editReply({ embeds: [embed] });
  logger.info(
    `[Utility] epic-calendar par ${interaction.user.tag}: ${active.length} actifs, ${expired.length} expirés`,
  );
}
