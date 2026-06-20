import logger from "../utils/logger.js";
import { MessageFlags, SlashCommandBuilder, EmbedBuilder, } from "discord.js";
import { config } from "../config.js";
import { getPsnProfile, getPsnRecentGames, getPsnDeals, isValidPsnId, } from "../services/psn.js";
const FOOTER = { text: "Système de Surveillance • PSN" };
const PSN_COLOR = 0x003087; // Bleu PlayStation
const PLUS_TIERS = {
    0: "Aucun",
    1: "PlayStation Plus Essential",
    2: "PlayStation Plus Extra",
    3: "PlayStation Plus Premium",
};
export const commands = [
    new SlashCommandBuilder()
        .setName("psn")
        .setDescription("Informations PlayStation Network")
        .addSubcommand((sub) => sub
        .setName("profile")
        .setDescription("Voir le profil PSN d'un joueur")
        .addStringOption((o) => o
        .setName("pseudo")
        .setDescription("Pseudo PSN")
        .setRequired(true)))
        .addSubcommand((sub) => sub
        .setName("trophies")
        .setDescription("Voir les trophées d'un joueur PSN")
        .addStringOption((o) => o
        .setName("pseudo")
        .setDescription("Pseudo PSN")
        .setRequired(true)))
        .addSubcommand((sub) => sub
        .setName("games")
        .setDescription("Voir les derniers jeux joués sur PSN")
        .addStringOption((o) => o
        .setName("pseudo")
        .setDescription("Pseudo PSN")
        .setRequired(true)))
        .addSubcommand((sub) => sub
        .setName("deals")
        .setDescription("Voir les promos PlayStation Store"))
        .addSubcommand((sub) => sub
        .setName("connect")
        .setDescription("Lier ton compte Discord à un pseudo PSN")
        .addStringOption((o) => o
        .setName("pseudo")
        .setDescription("Ton pseudo PSN")
        .setRequired(true)))
        .toJSON(),
];
export async function handleCommand(interaction) {
    try {
        if (!config.psnNpssoToken) {
            await interaction.reply({
                embeds: [
                    new EmbedBuilder()
                        .setColor(0xff3344)
                        .setDescription("❌ PSN non configuré. Ajoute `PSN_NPSSO_TOKEN` dans le `.env`."),
                ],
                flags: [MessageFlags.Ephemeral],
            });
            return;
        }
        const subcommand = interaction.options.getSubcommand();
        switch (subcommand) {
            case "profile":
                await handleProfile(interaction);
                break;
            case "trophies":
                await handleTrophies(interaction);
                break;
            case "games":
                await handleGames(interaction);
                break;
            case "deals":
                await handleDeals(interaction);
                break;
            case "connect":
                await handleConnect(interaction);
                break;
        }
    }
    catch (err) {
        logger.error("[PSN] Erreur:", err);
        const errorEmbed = new EmbedBuilder()
            .setColor(0xff3344)
            .setDescription("Une erreur est survenue.");
        try {
            if (interaction.replied || interaction.deferred) {
                await interaction.editReply({ embeds: [errorEmbed] });
            }
            else {
                await interaction.reply({
                    embeds: [errorEmbed],
                    flags: [MessageFlags.Ephemeral],
                });
            }
        }
        catch { /* ignore */ }
    }
}
// ===== /psn profile =====
async function handleProfile(interaction) {
    const username = interaction.options.getString("pseudo", true);
    if (!isValidPsnId(username)) {
        await interaction.reply({
            embeds: [
                new EmbedBuilder()
                    .setColor(0xffaa00)
                    .setDescription("⚠️ Pseudo PSN invalide (3-16 caractères, lettres/chiffres/tirets)."),
            ],
            flags: [MessageFlags.Ephemeral],
        });
        return;
    }
    await interaction.deferReply();
    const profile = await getPsnProfile(username);
    if (!profile) {
        await interaction.editReply({
            embeds: [
                new EmbedBuilder()
                    .setColor(0xff3344)
                    .setDescription(`❌ Profil "${username}" introuvable sur le PSN.`),
            ],
        });
        return;
    }
    const embed = buildProfileEmbed(profile);
    await interaction.editReply({ embeds: [embed] });
}
// ===== /psn trophies =====
async function handleTrophies(interaction) {
    const username = interaction.options.getString("pseudo", true);
    if (!isValidPsnId(username)) {
        await interaction.reply({
            embeds: [
                new EmbedBuilder()
                    .setColor(0xffaa00)
                    .setDescription("⚠️ Pseudo PSN invalide."),
            ],
            flags: [MessageFlags.Ephemeral],
        });
        return;
    }
    await interaction.deferReply();
    const profile = await getPsnProfile(username);
    if (!profile) {
        await interaction.editReply({
            embeds: [
                new EmbedBuilder()
                    .setColor(0xff3344)
                    .setDescription(`❌ Profil "${username}" introuvable.`),
            ],
        });
        return;
    }
    const ts = profile.trophySummary;
    const embed = new EmbedBuilder()
        .setColor(PSN_COLOR)
        .setTitle(`🏆 Trophées de ${profile.onlineId}`)
        .setThumbnail(profile.avatarUrl)
        .setDescription(`**Niveau:** ${ts.level} (${ts.progress}%)\n\n` +
        `🪙 **Platine:** ${ts.platinum}\n` +
        `🥇 **Or:** ${ts.gold}\n` +
        `🥈 **Argent:** ${ts.silver}\n` +
        `🥉 **Bronze:** ${ts.bronze}\n` +
        `📊 **Total:** ${ts.total}`)
        .setFooter(FOOTER)
        .setTimestamp();
    await interaction.editReply({ embeds: [embed] });
}
// ===== /psn games =====
async function handleGames(interaction) {
    const username = interaction.options.getString("pseudo", true);
    if (!isValidPsnId(username)) {
        await interaction.reply({
            embeds: [
                new EmbedBuilder()
                    .setColor(0xffaa00)
                    .setDescription("⚠️ Pseudo PSN invalide."),
            ],
            flags: [MessageFlags.Ephemeral],
        });
        return;
    }
    await interaction.deferReply();
    const games = await getPsnRecentGames(username, 10);
    if (games.length === 0) {
        await interaction.editReply({
            embeds: [
                new EmbedBuilder()
                    .setColor(0xffaa00)
                    .setDescription(`❌ Aucun jeu trouvé pour "${username}" ou profil introuvable.`),
            ],
        });
        return;
    }
    const embed = buildGamesEmbed(username, games);
    await interaction.editReply({ embeds: [embed] });
}
// ===== /psn connect =====
async function handleConnect(interaction) {
    const username = interaction.options.getString("pseudo", true);
    if (!isValidPsnId(username)) {
        await interaction.reply({
            embeds: [
                new EmbedBuilder()
                    .setColor(0xffaa00)
                    .setDescription("⚠️ Pseudo PSN invalide."),
            ],
            flags: [MessageFlags.Ephemeral],
        });
        return;
    }
    await interaction.deferReply({ flags: [MessageFlags.Ephemeral] });
    // Vérifier que le profil existe
    const profile = await getPsnProfile(username);
    if (!profile) {
        await interaction.editReply({
            embeds: [
                new EmbedBuilder()
                    .setColor(0xff3344)
                    .setDescription(`❌ Profil "${username}" introuvable. Vérifie le pseudo.`),
            ],
        });
        return;
    }
    // Stocker le lien dans la DB via le même modèle que Steam
    const prisma = (await import("../prisma.js")).default;
    await prisma.steamProfile.upsert({
        where: { userId: interaction.user.id },
        update: { steamId: `psn:${username}` },
        create: {
            userId: interaction.user.id,
            steamId: `psn:${username}`,
        },
    });
    await interaction.editReply({
        embeds: [
            new EmbedBuilder()
                .setColor(0x57f287)
                .setTitle("✅ Compte PSN lié")
                .setDescription(`Ton compte Discord est lié au PSN **${profile.onlineId}**.\n` +
                `Niveau trophées: **${profile.trophySummary.level}** • ${profile.trophySummary.total} trophées`)
                .setThumbnail(profile.avatarUrl)
                .setFooter(FOOTER),
        ],
    });
}
// ===== /psn deals =====
async function handleDeals(interaction) {
    await interaction.deferReply();
    const deals = await getPsnDeals(8);
    if (deals.length === 0) {
        await interaction.editReply({
            embeds: [
                new EmbedBuilder()
                    .setColor(0xffaa00)
                    .setDescription("❌ Aucune promo trouvee ou service indisponible."),
            ],
        });
        return;
    }
    const description = deals
        .map((d, i) => `**${i + 1}. ${d.title}**\n` +
        ` ~~${d.originalPrice}~~ → **${d.discountedPrice}** (-${d.discountPercent}%)\n` +
        ` 📅 Fin: ${d.endDate}\n`)
        .join("\n");
    const embed = new EmbedBuilder()
        .setColor(PSN_COLOR)
        .setTitle("🛒 Promos PlayStation Store")
        .setDescription(description)
        .setFooter({ ...FOOTER, text: FOOTER.text + " • Source: psprices.com" })
        .setTimestamp();
    await interaction.editReply({ embeds: [embed] });
}
// ===== Helpers =====
function buildProfileEmbed(profile) {
    const tier = PLUS_TIERS[profile.plusTier] || "Aucun";
    return new EmbedBuilder()
        .setColor(PSN_COLOR)
        .setTitle(`🎮 Profil PSN: ${profile.onlineId}`)
        .setThumbnail(profile.avatarUrl)
        .addFields({ name: "🏆 Niveau trophées", value: `${profile.trophySummary.level}`, inline: true }, { name: "📊 Total trophées", value: `${profile.trophySummary.total}`, inline: true }, { name: "⭐ Abonnement", value: tier, inline: true }, {
        name: "🪙 Platine / 🥇 Or / 🥈 Argent / 🥉 Bronze",
        value: `${profile.trophySummary.platinum} / ${profile.trophySummary.gold} / ${profile.trophySummary.silver} / ${profile.trophySummary.bronze}`,
        inline: false,
    })
        .setFooter(FOOTER)
        .setTimestamp();
}
function buildGamesEmbed(username, games) {
    const top5 = games.slice(0, 5);
    const description = top5
        .map((g, i) => {
        const trophyStr = `🪙${g.trophyCount.platinum} 🥇${g.trophyCount.gold} ` +
            `🥈${g.trophyCount.silver} 🥉${g.trophyCount.bronze}`;
        return `**${i + 1}. ${g.titleName}**\n` +
            ` 📱 ${g.platform} | ${trophyStr}\n` +
            ` 📊 Progression: ${g.progress}%\n`;
    })
        .join("\n");
    return new EmbedBuilder()
        .setColor(PSN_COLOR)
        .setTitle(`🎮 Derniers jeux de ${username}`)
        .setDescription(description || "Aucun jeu récent.")
        .setFooter({ ...FOOTER, text: FOOTER.text + ` • ${games.length} jeux trouvés` })
        .setTimestamp();
}
//# sourceMappingURL=psn.js.map