"use strict";
var __createBinding = (this && this.__createBinding) || (Object.create ? (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    var desc = Object.getOwnPropertyDescriptor(m, k);
    if (!desc || ("get" in desc ? !m.__esModule : desc.writable || desc.configurable)) {
      desc = { enumerable: true, get: function() { return m[k]; } };
    }
    Object.defineProperty(o, k2, desc);
}) : (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    o[k2] = m[k];
}));
var __setModuleDefault = (this && this.__setModuleDefault) || (Object.create ? (function(o, v) {
    Object.defineProperty(o, "default", { enumerable: true, value: v });
}) : function(o, v) {
    o["default"] = v;
});
var __importStar = (this && this.__importStar) || (function () {
    var ownKeys = function(o) {
        ownKeys = Object.getOwnPropertyNames || function (o) {
            var ar = [];
            for (var k in o) if (Object.prototype.hasOwnProperty.call(o, k)) ar[ar.length] = k;
            return ar;
        };
        return ownKeys(o);
    };
    return function (mod) {
        if (mod && mod.__esModule) return mod;
        var result = {};
        if (mod != null) for (var k = ownKeys(mod), i = 0; i < k.length; i++) if (k[i] !== "default") __createBinding(result, mod, k[i]);
        __setModuleDefault(result, mod);
        return result;
    };
})();
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.commands = void 0;
exports.handleCommand = handleCommand;
exports.handleAutocomplete = handleAutocomplete;
const logger_1 = __importDefault(require("../../utils/logger"));
const discord_js_1 = require("discord.js");
const prisma_1 = __importDefault(require("../../prisma"));
const fortnite_cosmetics_1 = require("../../services/fortnite-cosmetics");
const fortnite_api_1 = require("../../services/fortnite-api");
const FOOTER = { text: "Wishlist Fortnite \u2022 v4.0.0" };
exports.commands = [
    new discord_js_1.SlashCommandBuilder()
        .setName("wishlist")
        .setDescription("G\u00e8re ta wishlist Fortnite")
        .addStringOption((option) => option.setName("action").setDescription("Action \u00e0 effectuer").setRequired(true)
        .addChoices({ name: "\u2795 Ajouter un objet", value: "add" }, { name: "\u2796 Retirer un objet", value: "remove" }, { name: "\ud83d\udccb Voir ma liste", value: "list" }, { name: "\ud83d\udd14 Notifications DM ON/OFF", value: "notify" }))
        .addStringOption((option) => option.setName("nom").setDescription("Nom de l'objet (add/remove)").setRequired(false).setAutocomplete(true))
        .toJSON(),
];
async function handleCommand(interaction) {
    const action = interaction.options.getString("action", true);
    const userId = interaction.user.id;
    try {
        // ─── ADD ──────────────────────────────────────────────
        if (action === "add") {
            const rawName = interaction.options.getString("nom");
            if (!rawName) {
                await interaction.reply({
                    content: "\u274c Donne le nom de l'objet (option \"nom\") \u00e0 ajouter.",
                    flags: [discord_js_1.MessageFlags.Ephemeral],
                });
                logger_1.default.info("\u26a0\ufe0f [Wishlist] Commande /add sans nom fourni par", userId);
                return;
            }
            const itemName = rawName.trim().toLowerCase();
            if (!itemName) {
                await interaction.reply({
                    content: "\u274c Le nom de l'objet ne peut pas \u00eatre vide.",
                    flags: [discord_js_1.MessageFlags.Ephemeral],
                });
                return;
            }
            logger_1.default.info("\ud83d\udd0d [Wishlist] Validation du cosmetic :", itemName);
            const isValid = await (0, fortnite_cosmetics_1.validateCosmeticName)(itemName);
            if (!isValid) {
                await interaction.reply({
                    content: "\u274c \"" + itemName + "\" n'est pas un item Fortnite valide. V\u00e9rifie l'orthographe ou utilise l'autocompl\u00e9tion.",
                    flags: [discord_js_1.MessageFlags.Ephemeral],
                });
                logger_1.default.info("\u274c [Wishlist] Cosmetic invalide :", itemName);
                return;
            }
            const existing = await prisma_1.default.wishlist.findUnique({
                where: { userId_itemName: { userId, itemName } },
            });
            if (existing) {
                await interaction.reply({
                    content: "\u26a0\ufe0f \"" + itemName + "\" est d\u00e9j\u00e0 dans ta wishlist.",
                    flags: [discord_js_1.MessageFlags.Ephemeral],
                });
                logger_1.default.info("\u26a0\ufe0f [Wishlist] Doublon d\u00e9tect\u00e9 :", userId, "->", itemName);
                return;
            }
            await prisma_1.default.wishlist.create({ data: { userId, itemName } });
            logger_1.default.info("\u2705 [Wishlist] ID", userId, "a ajout\u00e9 l'objet :", itemName);
            await interaction.reply({
                content: "\u2705 \"" + itemName + "\" ajout\u00e9 \u00e0 ta wishlist !",
                flags: [discord_js_1.MessageFlags.Ephemeral],
            });
            // ─── REMOVE ───────────────────────────────────────────
        }
        else if (action === "remove") {
            const rawName = interaction.options.getString("nom");
            if (!rawName) {
                await interaction.reply({
                    content: "\u274c Donne le nom de l'objet \u00e0 retirer.",
                    flags: [discord_js_1.MessageFlags.Ephemeral],
                });
                return;
            }
            const itemName = rawName.trim().toLowerCase();
            if (!itemName) {
                await interaction.reply({
                    content: "\u274c Le nom de l'objet ne peut pas \u00eatre vide.",
                    flags: [discord_js_1.MessageFlags.Ephemeral],
                });
                return;
            }
            logger_1.default.info("\ud83d\uddd1\ufe0f [Wishlist] Tentative de suppression :", userId, "->", itemName);
            const deleted = await prisma_1.default.wishlist.deleteMany({ where: { userId, itemName } });
            if (deleted.count === 0) {
                await interaction.reply({
                    content: "\u274c \"" + itemName + "\" n'est pas dans ta wishlist.",
                    flags: [discord_js_1.MessageFlags.Ephemeral],
                });
                logger_1.default.info("\u26a0\ufe0f [Wishlist] Suppression \u00e9chou\u00e9e (non trouv\u00e9) :", userId, "->", itemName);
                return;
            }
            logger_1.default.info("\u2705 [Wishlist] ID", userId, "a retir\u00e9 l'objet :", itemName);
            await interaction.reply({
                content: "\u2705 \"" + itemName + "\" retir\u00e9 de ta wishlist.",
                flags: [discord_js_1.MessageFlags.Ephemeral],
            });
            // ─── LIST (enrichi avec la boutique du jour) ──────────
        }
        else if (action === "list") {
            await interaction.deferReply({ flags: [discord_js_1.MessageFlags.Ephemeral] });
            logger_1.default.info("\ud83d\udccb [Wishlist] Consultation de la liste pour", userId);
            const items = await prisma_1.default.wishlist.findMany({
                where: { userId },
                orderBy: { createdAt: "desc" },
            });
            logger_1.default.info("\ud83d\udcca [Wishlist] Liste de", userId, ":", items.length, "objet(s)");
            if (items.length === 0) {
                await interaction.editReply({ content: "\ud83d\udcc4 Ta wishlist est vide. Ajoute des objets avec `/wishlist add` !" });
                return;
            }
            // R\u00e9cup\u00e9rer la boutique du jour pour croiser les disponibilit\u00e9s
            let shopMap = null;
            try {
                const shop = await (0, fortnite_api_1.fetchShop)();
                if (shop) {
                    const allShopItems = [...shop.featured, ...shop.daily, ...shop.specialFeatured, ...shop.specialDaily];
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
            }
            catch {
                // Shop indisponible \u2014 on affiche sans d\u00e9tails
            }
            // Construire la description avec statut de disponibilit\u00e9
            const lines = [];
            let availableCount = 0;
            for (let i = 0; i < items.length; i++) {
                const wish = items[i];
                const matched = shopMap?.get(wish.itemName);
                if (matched) {
                    availableCount++;
                    const priceStr = matched.price > 0 ? matched.price + " V-Bucks" : "Gratuit";
                    lines.push((i + 1) + ". \ud83d\udfe2 **" + matched.displayName + "** \u2014 " +
                        (matched.rarity || "?") + " | " + priceStr);
                }
                else {
                    lines.push((i + 1) + ". \u26aa " + wish.itemName);
                }
            }
            const embed = new discord_js_1.EmbedBuilder()
                .setTitle("\ud83c\udf92 Wishlist de " + interaction.user.displayName)
                .setDescription((shopMap
                ? "\ud83d\udfe2 **" + availableCount + "/" + items.length + " dispo aujourd'hui !**\n"
                : "\ud83d\udce6 Boutique inaccessible \u2014 liste simple :\n") +
                "\n" + lines.join("\n"))
                .setColor(0x9b59b6)
                .setFooter(FOOTER)
                .setTimestamp();
            // Ajouter le thumbnail du premier item dispo si pr\u00e9sent
            if (shopMap) {
                const firstAvailable = items.find(w => shopMap.has(w.itemName));
                if (firstAvailable) {
                    const info = shopMap.get(firstAvailable.itemName);
                    if (info.icon)
                        embed.setThumbnail(info.icon);
                }
            }
            await interaction.editReply({ embeds: [embed] });
            // ─── NOTIFY (toggle DM) ───────────────────────────────
        }
        else if (action === "notify") {
            const pref = await prisma_1.default.userPreference.findUnique({ where: { userId } });
            const current = pref?.wishlistDm ?? true; // par d\u00e9faut : activ\u00e9
            const newValue = !current;
            await prisma_1.default.userPreference.upsert({
                where: { userId },
                update: { wishlistDm: newValue },
                create: { userId, wishlistDm: newValue },
            });
            const status = newValue ? "\u2705 activ\u00e9es" : "\u274c d\u00e9sactiv\u00e9es";
            logger_1.default.info("\ud83d\udd14 [Wishlist] Notifications DM", status, "pour", userId);
            await interaction.reply({
                content: "\ud83d\udd14 Notifications DM **" + status + "** pour ta wishlist Fortnite.",
                flags: [discord_js_1.MessageFlags.Ephemeral],
            });
        }
    }
    catch (error) {
        logger_1.default.error("\ud83d\udca5 [CRASH WISHLIST] Erreur Prisma d\u00e9tect\u00e9e dans la commande :", error);
        try {
            if (interaction.deferred) {
                await interaction.editReply({ content: "\u274c Une erreur interne est survenue." });
            }
            else {
                await interaction.reply({
                    content: "\u274c Une erreur interne est survenue. L'erreur a \u00e9t\u00e9 loggu\u00e9e dans la console.",
                    flags: [discord_js_1.MessageFlags.Ephemeral],
                });
            }
        }
        catch {
            await interaction.followUp({
                content: "\u274c Une erreur interne est survenue.",
                flags: [discord_js_1.MessageFlags.Ephemeral],
            }).catch(() => { });
        }
    }
}
// ─── Autocompl\u00e9tion (boutique du jour avec fallback cosm\u00e9tiques) ───
async function handleAutocomplete(interaction) {
    if (interaction.commandName !== "wishlist")
        return;
    const focused = interaction.options.getFocused(true);
    if (focused.name !== "nom")
        return;
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
        const suggestions = [];
        // 1. Chercher dans la boutique du jour (15 min cache, rapide)
        try {
            const shop = await (0, fortnite_api_1.fetchShop)();
            if (shop) {
                const allItems = [...shop.featured, ...shop.daily, ...shop.specialFeatured, ...shop.specialDaily];
                const seen = new Set();
                for (const item of allItems) {
                    for (const name of item.allNames) {
                        if (!seen.has(name) && name.includes(query)) {
                            suggestions.push(name);
                            seen.add(name);
                        }
                    }
                }
            }
        }
        catch {
            // Shop down \u2014 fallback ci-dessous
        }
        // 2. Fallback : chercher dans la BDD cosm\u00e9tiques si la boutique est vide
        if (suggestions.length === 0) {
            const { searchCosmetics } = await Promise.resolve().then(() => __importStar(require("../../services/fortnite-cosmetics")));
            const fallback = await searchCosmetics(query, 25);
            suggestions.push(...fallback);
        }
        await interaction.respond(suggestions.slice(0, 25).map((name) => ({ name, value: name })));
    }
    catch (error) {
        logger_1.default.error("\ud83d\udca5 [Wishlist] Erreur autocomplete :", error);
        await interaction.respond([]);
    }
}
//# sourceMappingURL=wishlist.js.map