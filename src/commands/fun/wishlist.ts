import logger from "../../utils/logger.js";
import {
  MessageFlags,
  ChatInputCommandInteraction,
  SlashCommandBuilder,
  EmbedBuilder,
  AutocompleteInteraction,
} from "discord.js";
import prisma from "../../prisma.js";
import { validateCosmeticName } from "../../services/fortnite-cosmetics.js";
import { fetchShop } from "../../services/fortnite-api.js";

const FOOTER = { text: "Wishlist Multi-Plateforme • v5.0.0" };

const PLATFORMS = [
  { name: "Fortnite", value: "fortnite", emoji: "🎮" },
  { name: "PlayStation", value: "playstation", emoji: " PlayStation" },
  { name: "Xbox", value: "xbox", emoji: "📦" },
  { name: "Nintendo", value: "nintendo", emoji: "🍄" },
  { name: "Steam", value: "steam", emoji: "💨" },
  { name: "Epic Games", value: "epic", emoji: "🎯" },
] as const;

export const commands = [
  new SlashCommandBuilder()
    .setName("wishlist")
    .setDescription("Gère ta wishlist multi-plateforme — notifs de réductions")
    .addStringOption((option) =>
      option
        .setName("action")
        .setDescription("Action à effectuer")
        .setRequired(true)
        .addChoices(
          { name: "➕ Ajouter un jeu", value: "add" },
          { name: "➖ Retirer un jeu", value: "remove" },
          { name: "📋 Voir ma liste", value: "list" },
          { name: "🔔 Notifications DM ON/OFF", value: "notify" },
        ),
    )
    .addStringOption((option) =>
      option
        .setName("plateforme")
        .setDescription("Plateforme du jeu")
        .setRequired(false)
        .addChoices(...PLATFORMS.map((p) => ({ name: `${p.emoji} ${p.name}`, value: p.value }))),
    )
    .addStringOption((option) =>
      option
        .setName("nom")
        .setDescription("Nom du jeu ou objet (add/remove)")
        .setRequired(false)
        .setAutocomplete(true),
    )
    .toJSON(),
];

export async function handleCommand(interaction: ChatInputCommandInteraction) {
  const action = interaction.options.getString("action", true);
  const userId = interaction.user.id;
  const platform = interaction.options.getString("plateforme") || "fortnite";
  const guildId = interaction.guildId;

  // ─── Validation du champ 'nom' selon l'action ─────────────────────
  if (action === "add" || action === "remove") {
    const rawName = interaction.options.getString("nom");
    if (!rawName || rawName.trim() === "") {
      await interaction.reply({
        content: "❌ Vous devez spécifier le nom du jeu pour cette action !",
        flags: [MessageFlags.Ephemeral],
      });
      return;
    }
  }

  try {
    // ─── ADD ──────────────────────────────────────────────
    if (action === "add") {
      const rawName = interaction.options.getString("nom");

      if (!rawName) {
        await interaction.reply({
          content: '❌ Donne le nom du jeu (option "nom") à ajouter.',
          flags: [MessageFlags.Ephemeral],
        });
        logger.info("⚠️ [Wishlist] Commande /add sans nom fourni par", userId);
        return;
      }

      const itemName = rawName.trim().toLowerCase();
      if (!itemName) {
        await interaction.reply({
          content: "❌ Le nom du jeu ne peut pas être vide.",
          flags: [MessageFlags.Ephemeral],
        });
        return;
      }

      // Validation cosmétique uniquement pour Fortnite
      if (platform === "fortnite") {
        logger.info("🔍 [Wishlist] Validation du cosmetic :", itemName);
        const isValid = await validateCosmeticName(itemName);
        if (!isValid) {
          await interaction.reply({
            content:
              '❌ "' +
              itemName +
              "\" n'est pas un item Fortnite valide. Vérifie l'orthographe ou utilise l'autocomplétion.",
            flags: [MessageFlags.Ephemeral],
          });
          logger.info("❌ [Wishlist] Cosmetic invalide :", itemName);
          return;
        }
      }

      const existing = await prisma.wishlist.findFirst({
        where: { userId, itemName, platform },
      });
      if (existing) {
        await interaction.reply({
          content: `⚠️ "${itemName}" est déjà dans ta wishlist ${platform}.`,
          flags: [MessageFlags.Ephemeral],
        });
        logger.info("⚠️ [Wishlist] Doublon détecté :", userId, "->", itemName, platform);
        return;
      }

      await prisma.wishlist.create({
        data: { userId, itemName, platform, gameName: rawName.trim(), guildId: guildId || null },
      });
      logger.info("✅ [Wishlist] ID", userId, "a ajouté :", itemName, "sur", platform);
      await interaction.reply({
        content: `✅ "${rawName.trim()}" ajouté à ta wishlist **${platform}** !\n🔔 Tu recevras une notification dès qu'une réduction ou une offre gratuite sera détectée.`,
        flags: [MessageFlags.Ephemeral],
      });

      // ─── REMOVE ───────────────────────────────────────────
    } else if (action === "remove") {
      const rawName = interaction.options.getString("nom");

      if (!rawName) {
        await interaction.reply({
          content: "❌ Donne le nom du jeu à retirer.",
          flags: [MessageFlags.Ephemeral],
        });
        return;
      }

      const itemName = rawName.trim().toLowerCase();
      if (!itemName) {
        await interaction.reply({
          content: "❌ Le nom du jeu ne peut pas être vide.",
          flags: [MessageFlags.Ephemeral],
        });
        return;
      }

      logger.info("🗑️ [Wishlist] Tentative de suppression :", userId, "->", itemName, platform);
      const deleted = await prisma.wishlist.deleteMany({
        where: { userId, itemName, platform },
      });

      if (deleted.count === 0) {
        await interaction.reply({
          content: `❌ "${itemName}" n'est pas dans ta wishlist ${platform}.`,
          flags: [MessageFlags.Ephemeral],
        });
        return;
      }

      logger.info("✅ [Wishlist] ID", userId, "a retiré :", itemName, platform);
      await interaction.reply({
        content: `✅ "${rawName.trim()}" retiré de ta wishlist **${platform}**.`,
        flags: [MessageFlags.Ephemeral],
      });

      // ─── LIST (enrichi avec la boutique du jour pour Fortnite) ──
    } else if (action === "list") {
      await interaction.deferReply({ flags: [MessageFlags.Ephemeral] });

      logger.info("📋 [Wishlist] Consultation de la liste pour", userId);
      const items = await prisma.wishlist.findMany({
        where: { userId },
        orderBy: { createdAt: "desc" },
      });
      logger.info("📊 [Wishlist] Liste de", userId, ":", items.length, "jeu(x)");

      if (items.length === 0) {
        await interaction.editReply({
          content: "📄 Ta wishlist est vide. Ajoute des jeux avec `/wishlist add` !",
        });
        return;
      }

      // Grouper par plateforme
      const byPlatform = new Map<string, typeof items>();
      for (const item of items) {
        const arr = byPlatform.get(item.platform) || [];
        arr.push(item);
        byPlatform.set(item.platform, arr);
      }

      // Récupérer la boutique Fortnite pour croiser
      let shopMap: Map<
        string,
        { rarity: string; price: number; icon: string; displayName: string }
      > | null = null;
      try {
        const shop = await fetchShop();
        if (shop) {
          const allShopItems = [
            ...shop.featured,
            ...shop.daily,
            ...shop.specialFeatured,
            ...shop.specialDaily,
          ];
          shopMap = new Map();
          for (const entry of allShopItems) {
            for (const name of entry.allNames) {
              if (!shopMap.has(name)) {
                shopMap.set(name, {
                  rarity: entry.rarity,
                  price: entry.price,
                  icon: entry.icon,
                  displayName: entry.displayName,
                });
              }
            }
          }
        }
      } catch (err) {
        logger.error("[Wishlist] Erreur:", String(err));
      }

      const fields: { name: string; value: string }[] = [];
      let availableCount = 0;

      for (const [plat, platItems] of byPlatform) {
        const lines: string[] = [];
        for (let i = 0; i < platItems.length; i++) {
          const wish = platItems[i];
          const displayName = wish.gameName || wish.itemName;

          if (plat === "fortnite" && shopMap) {
            const matched = shopMap.get(wish.itemName);
            if (matched) {
              availableCount++;
              const priceStr = matched.price > 0 ? matched.price + " V-Bucks" : "Gratuit";
              lines.push(
                `${i + 1}. 🟢 **${matched.displayName}** — ${matched.rarity || "?"} | ${priceStr}`,
              );
            } else {
              lines.push(`${i + 1}. ⚪ ${displayName}`);
            }
          } else {
            lines.push(`${i + 1}. ⚪ ${displayName}`);
          }
        }
        const platInfo = PLATFORMS.find((p) => p.value === plat);
        fields.push({
          name: `${platInfo?.emoji || "🎮"} ${platInfo?.name || plat} (${platItems.length})`,
          value: lines.join("\n") || "Aucun jeu",
        });
      }

      const embed = new EmbedBuilder()
        .setTitle("🎒 Wishlist de " + interaction.user.displayName)
        .setDescription(
          (availableCount > 0
            ? `🟢 **${availableCount} objet(s) dispo aujourd'hui sur Fortnite !**\n`
            : "") + `**${items.length} jeu(x)** sur ${byPlatform.size} plateforme(s)`,
        )
        .setColor(0x9b59b6)
        .setFooter(FOOTER)
        .setTimestamp()
        .addFields(fields.slice(0, 25));

      await interaction.editReply({ embeds: [embed] });

      // ─── NOTIFY (toggle DM) ───────────────────────────────
    } else if (action === "notify") {
      const pref = await prisma.userPreference.findUnique({ where: { userId } });
      const current = pref?.wishlistDm ?? true;
      const newValue = !current;

      await prisma.userPreference.upsert({
        where: { userId },
        update: { wishlistDm: newValue },
        create: { userId, wishlistDm: newValue },
      });

      const status = newValue ? "✅ activées" : "❌ désactivées";
      logger.info("🔔 [Wishlist] Notifications DM", status, "pour", userId);
      await interaction.reply({
        content: `🔔 Notifications DM **${status}** pour ta wishlist multi-plateforme.`,
        flags: [MessageFlags.Ephemeral],
      });
    }
  } catch (error) {
    logger.error("💥 [CRASH WISHLIST] Erreur :", error);
    try {
      if (interaction.deferred) {
        await interaction.editReply({ content: "❌ Une erreur interne est survenue." });
      } else {
        await interaction.reply({
          content: "❌ Une erreur interne est survenue.",
          flags: [MessageFlags.Ephemeral],
        });
      }
    } catch (err) {
      logger.error("[Wishlist] Erreur reply:", String(err));
    }
  }
}

// ─── Autocompl\u00e9tion (boutique du jour avec fallback cosm\u00e9tiques) ───

export async function handleAutocomplete(interaction: AutocompleteInteraction) {
  if (interaction.commandName !== "wishlist") return;

  const focused = interaction.options.getFocused(true);
  if (focused.name !== "nom") return;

  const focusedValue = focused.value;
  if (!focusedValue) {
    await interaction.respond([]);
    return;
  }

  const query = focusedValue.toLowerCase().trim();
  if (!query) {
    await interaction.respond([]);
    return;
  }

  try {
    const suggestions: string[] = [];

    // 1. Chercher dans la boutique du jour (15 min cache, rapide)
    try {
      const shop = await fetchShop();
      if (shop) {
        const allItems = [
          ...shop.featured,
          ...shop.daily,
          ...shop.specialFeatured,
          ...shop.specialDaily,
        ];
        const seen = new Set<string>();
        for (const item of allItems) {
          for (const name of item.allNames) {
            if (!seen.has(name) && name.includes(query)) {
              suggestions.push(name);
              seen.add(name);
            }
          }
        }
      }
    } catch (err) {
      logger.error("[Wishlist] Erreur:", String(err));
    }

    // 2. Fallback : chercher dans la BDD cosmétiques si la boutique est vide
    if (suggestions.length === 0) {
      const { searchCosmetics } = await import("../../services/fortnite-cosmetics.js");
      const fallback = await searchCosmetics(query, 25);
      suggestions.push(...fallback);
    }

    await interaction.respond(suggestions.slice(0, 25).map((name) => ({ name, value: name })));
  } catch (error) {
    logger.error("\ud83d\udca5 [Wishlist] Erreur autocomplete :", error);
    await interaction.respond([]);
  }
}
