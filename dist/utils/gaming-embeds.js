/**
 * gaming-embeds.ts
 *
 * Générateurs d'Embeds modulaires pour les notifications automatiques
 * de bons plans et sorties de jeux. Une fonction par plateforme,
 * chaque plateforme ayant son identité visuelle propre.
 *
 * Usage : import { embedEpicGames, embedSteam, ... } from "../utils/gaming-embeds.js";
 */
import { EmbedBuilder } from "discord.js";
// ── Footer commun ─────────────────────────────────────────────────────────
const GAMING_FOOTER = { text: "Alerte Bons Plans • Surveillance Gaming" };
const SEPARATOR = "\n────────────────────────────────";
export function embedEpicGames(game) {
    const embed = new EmbedBuilder()
        .setTitle("🎁 JEU GRATUIT EPIC GAMES • " + game.name)
        .setColor(0x00f0ff)
        .setFooter(GAMING_FOOTER)
        .setTimestamp();
    if (game.description) {
        embed.setDescription(game.description.slice(0, 1024) + SEPARATOR);
    }
    else {
        embed.setDescription(SEPARATOR);
    }
    embed.addFields({
        name: "💰 Prix",
        value: "~~" + game.originalPrice + "~~ ➔ **GRATUIT**",
        inline: true,
    }, {
        name: "⏰ Date limite",
        value: game.endDate,
        inline: true,
    });
    if (game.imageUrl) {
        embed.setImage(game.imageUrl);
    }
    if (game.linkUrl) {
        embed.setURL(game.linkUrl);
    }
    return embed;
}
export function embedSteam(game) {
    const offerLabels = {
        free: "🆓 100% Gratuit (À garder à vie)",
        discount: "🔥 Offre Spéciale (-" + (game.discountPercent || 0) + "%)",
        special: "🔥 Offre Spéciale",
    };
    const embed = new EmbedBuilder()
        .setTitle("🔥 PROMO OU JEU GRATUIT STEAM • " + game.name)
        .setColor(0x1b2838)
        .setURL(game.steamAppUrl)
        .setFooter(GAMING_FOOTER)
        .setTimestamp();
    let description = offerLabels[game.offerType] + "\n";
    if (game.description) {
        description += "\n" + game.description.slice(0, 900);
    }
    description += SEPARATOR;
    embed.setDescription(description);
    if (game.imageUrl) {
        embed.setImage(game.imageUrl);
    }
    return embed;
}
export function embedPlayStation(game) {
    const tierLabels = {
        Essential: "[PS Plus Essential]",
        Extra: "[PS Plus Extra]",
        Premium: "[PS Plus Premium]",
        Soldes: "[Soldes PSN]",
        Promo: "[Promo PSN]",
    };
    const embed = new EmbedBuilder()
        .setTitle("🎮 AJOUTS PLAYSTATION PLUS / PROMO • " + game.name)
        .setColor(0x003087)
        .setFooter(GAMING_FOOTER)
        .setTimestamp();
    if (game.description) {
        embed.setDescription(game.description.slice(0, 1024) + SEPARATOR);
    }
    else {
        embed.setDescription(SEPARATOR);
    }
    embed.addFields({
        name: "🎮 Plateforme",
        value: game.platforms.join(" / "),
        inline: true,
    }, {
        name: "🏷️ Offre",
        value: tierLabels[game.tier],
        inline: true,
    });
    if (game.imageUrl) {
        embed.setImage(game.imageUrl);
    }
    if (game.linkUrl) {
        embed.setURL(game.linkUrl);
    }
    return embed;
}
export function embedXbox(game) {
    const embed = new EmbedBuilder()
        .setTitle("🟩 ENTRÉE XBOX GAME PASS / PROMO • " + game.name)
        .setColor(0x107c10)
        .setFooter(GAMING_FOOTER)
        .setTimestamp();
    let description = "";
    if (game.status) {
        description += "• " + game.status + "\n";
    }
    if (game.rating) {
        description += "• 🌟 " + game.rating + "\n";
    }
    if (game.description) {
        description += "\n" + game.description.slice(0, 800);
    }
    if (description) {
        description += SEPARATOR;
        embed.setDescription(description);
    }
    embed.addFields({
        name: "💻 Disponible sur",
        value: game.availability.map((a) => "• " + a).join("\n"),
        inline: false,
    });
    if (game.imageUrl) {
        embed.setImage(game.imageUrl);
    }
    if (game.linkUrl) {
        embed.setURL(game.linkUrl);
    }
    return embed;
}
export function embedInstantGaming(game) {
    const embed = new EmbedBuilder()
        .setTitle("💥 VENTE FLASH / BAISSE DE PRIX • " + game.name)
        .setColor(0xff5400)
        .setFooter(GAMING_FOOTER)
        .setTimestamp();
    embed.setDescription(SEPARATOR);
    embed.addFields({
        name: "💸 Prix Instant G.",
        value: "**" + game.instantPrice + "**",
        inline: true,
    }, {
        name: "📉 Réduction",
        value: game.reduction + (game.storePrice ? " vs " + game.storePrice : ""),
        inline: true,
    });
    if (game.buyUrl) {
        embed.addFields({
            name: "🛒 Acheter",
            value: "[🛒 Acheter la clé](" + game.buyUrl + ")",
            inline: false,
        });
    }
    if (game.imageUrl) {
        embed.setImage(game.imageUrl);
    }
    return embed;
}
// Implementation
export function embedGamingNotification(platform, data) {
    switch (platform) {
        case "epic":
            return embedEpicGames(data);
        case "steam":
            return embedSteam(data);
        case "playstation":
            return embedPlayStation(data);
        case "xbox":
            return embedXbox(data);
        case "instantgaming":
            return embedInstantGaming(data);
        default:
            throw new Error("Plateforme inconnue : " + platform);
    }
}
//# sourceMappingURL=gaming-embeds.js.map