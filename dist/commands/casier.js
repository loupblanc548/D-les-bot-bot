"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.commands = void 0;
exports.buildEntries = buildEntries;
exports.chunkEntries = chunkEntries;
exports.buildNavRow = buildNavRow;
exports.handleCasierClear = handleCasierClear;
exports.handleCommand = handleCommand;
const logger_1 = __importDefault(require("../utils/logger"));
const discord_js_1 = require("discord.js");
const prisma_1 = __importDefault(require("../prisma"));
const permissions_1 = require("../services/permissions");
const FOOTER = { text: "Système de Surveillance • v1.1.0" };
exports.commands = [
    new discord_js_1.SlashCommandBuilder()
        .setName("casier")
        .setDescription("Affiche le casier judiciaire d'un membre")
        .addUserOption((option) => option.setName("cible").setDescription("Le membre à consulter").setRequired(true))
        .toJSON(),
    new discord_js_1.SlashCommandBuilder()
        .setName("casier-clear")
        .setDescription("Supprime une sanction ou tout le casier (admin)")
        .addIntegerOption((option) => option.setName("id").setDescription("ID de la sanction").setRequired(false))
        .addUserOption((option) => option.setName("membre").setDescription("Membre à effacer").setRequired(false))
        .toJSON(),
];
function buildEntries(warnings, mutes, kicks, banSanctions, bans) {
    const entries = [];
    const hdr = (s, l) => ({
        section: s, isHeader: true, headerLine: l, line: l,
    });
    if (warnings.length) {
        entries.push(hdr("warn", "⚠️ **Avertissements (" + warnings.length + ")**"));
        warnings.forEach((w, i) => entries.push({
            section: "warn", isHeader: false, headerLine: entries[entries.length - 1].headerLine,
            line: "├ **#" + (i + 1) + "** • " + w.reason + "\n└ ⮕ <t:" + Math.floor(w.createdAt.getTime() / 1000) + ":d> • Mod: <@" + w.moderatorId + ">",
        }));
    }
    if (mutes.length) {
        entries.push(hdr("mute", "⏳ **Exclusions temporaires (" + mutes.length + ")**"));
        mutes.forEach((m, i) => {
            const endTime = new Date(m.createdAt.getTime() + (m.duration || 0) * 1000);
            entries.push({
                section: "mute", isHeader: false, headerLine: entries[entries.length - 1].headerLine,
                line: "├ **#" + (i + 1) + "** • <t:" + Math.floor(m.createdAt.getTime() / 1000) + ":d> → <t:" + Math.floor(endTime.getTime() / 1000) + ":d> (" + Math.round((m.duration || 0) / 60) + " min)\n└ • Mod: <@" + m.moderatorId + ">",
            });
        });
    }
    if (kicks.length) {
        entries.push(hdr("kick", "👢 **Expulsions (" + kicks.length + ")**"));
        kicks.forEach((k, i) => entries.push({
            section: "kick", isHeader: false, headerLine: entries[entries.length - 1].headerLine,
            line: "├ **#" + (i + 1) + "** • " + (k.reason || "Aucune raison") + "\n└ ⮕ <t:" + Math.floor(k.createdAt.getTime() / 1000) + ":d> • Mod: <@" + k.moderatorId + ">",
        }));
    }
    if (banSanctions.length) {
        entries.push(hdr("ban_sanction", "🔨 **Bannissements (" + banSanctions.length + ")**"));
        banSanctions.forEach((bs, i) => entries.push({
            section: "ban_sanction", isHeader: false, headerLine: entries[entries.length - 1].headerLine,
            line: "├ **#" + (i + 1) + "** • " + (bs.reason || "Aucune raison") + "\n└ ⮕ <t:" + Math.floor(bs.createdAt.getTime() / 1000) + ":d> • Mod: <@" + bs.moderatorId + ">",
        }));
    }
    if (bans.length) {
        entries.push(hdr("ban", "🔨 **Bannissements logs (" + bans.length + ")**"));
        bans.forEach((b, i) => entries.push({
            section: "ban", isHeader: false, headerLine: entries[entries.length - 1].headerLine,
            line: "├ **#" + (i + 1) + "** • " + (b.action || b.details || "Banni") + "\n└ ⮕ <t:" + Math.floor(new Date(b.createdAt).getTime() / 1000) + ":d>",
        }));
    }
    return entries;
}
function chunkEntries(entries, maxChars) {
    const pages = [];
    let current = "", lastHeader = "";
    for (const e of entries) {
        if (e.isHeader)
            lastHeader = e.headerLine;
        const sep = current ? "\n\n" : "";
        const prefix = (!current && !e.isHeader && lastHeader) ? lastHeader + "\n" : "";
        const candidate = current + sep + prefix + e.line;
        if (candidate.length > maxChars && current) {
            pages.push(current);
            current = (!e.isHeader && lastHeader) ? lastHeader + "\n" + e.line : e.line;
        }
        else {
            current = candidate;
        }
    }
    if (current || !pages.length)
        pages.push(current);
    return pages;
}
function buildNavRow(page, total) {
    return new discord_js_1.ActionRowBuilder().addComponents(new discord_js_1.ButtonBuilder().setCustomId("casier_prev").setLabel("◀️").setStyle(discord_js_1.ButtonStyle.Secondary).setDisabled(page === 0), new discord_js_1.ButtonBuilder().setCustomId("casier_page").setLabel("Page " + (page + 1) + " / " + total).setStyle(discord_js_1.ButtonStyle.Secondary).setDisabled(true), new discord_js_1.ButtonBuilder().setCustomId("casier_next").setLabel("▶️").setStyle(discord_js_1.ButtonStyle.Secondary).setDisabled(page === total - 1));
}
async function handleCasierClear(interaction) {
    const sanctionId = interaction.options.getInteger("id");
    const membre = interaction.options.getUser("membre");
    if (!sanctionId && !membre) {
        await interaction.reply({ content: "❌ Fournis un ID de sanction OU un membre.", flags: [discord_js_1.MessageFlags.Ephemeral] });
        return;
    }
    if (sanctionId) {
        const s = await prisma_1.default.sanction.findUnique({ where: { id: sanctionId } });
        if (!s) {
            await interaction.reply({ content: "❌ Sanction introuvable.", flags: [discord_js_1.MessageFlags.Ephemeral] });
            return;
        }
        await prisma_1.default.sanction.delete({ where: { id: sanctionId } });
        await interaction.reply({ content: "✅ Sanction #" + sanctionId + " (" + s.type + ") supprimée.", flags: [discord_js_1.MessageFlags.Ephemeral] });
    }
    else if (membre) {
        const d = await prisma_1.default.sanction.deleteMany({ where: { userId: membre.id, guildId: interaction.guildId } });
        await interaction.reply({ content: "✅ " + d.count + " sanction(s) supprimée(s) pour " + membre.tag + ".", flags: [discord_js_1.MessageFlags.Ephemeral] });
    }
}
async function handleCommand(interaction) {
    if (interaction.commandName === "casier-clear") {
        if (!(await (0, permissions_1.requireAdmin)(interaction)))
            return;
        await handleCasierClear(interaction);
        return;
    }
    if (!(await (0, permissions_1.requireMod)(interaction)))
        return;
    const cible = interaction.options.getUser("cible", true);
    const guildId = interaction.guildId;
    if (!guildId) {
        await interaction.reply({ content: "❌ Commande utilisable seulement sur un serveur.", flags: [discord_js_1.MessageFlags.Ephemeral] });
        return;
    }
    await interaction.deferReply();
    try {
        logger_1.default.info("🔍 [Casier] Recherche sanctions pour ID:", cible.id, "| Tag:", cible.tag);
        const warnings = await prisma_1.default.sanction.findMany({ where: { userId: cible.id, guildId, type: "WARN" }, orderBy: { createdAt: "desc" } });
        logger_1.default.info("📊 [Casier] WARN:", warnings.length);
        const mutes = await prisma_1.default.sanction.findMany({ where: { userId: cible.id, guildId, type: "TIMEOUT" }, orderBy: { createdAt: "desc" } });
        logger_1.default.info("📊 [Casier] TIMEOUT:", mutes.length);
        const kicks = await prisma_1.default.sanction.findMany({ where: { userId: cible.id, guildId, type: "KICK" }, orderBy: { createdAt: "desc" } });
        logger_1.default.info("📊 [Casier] KICK:", kicks.length);
        const banSanctions = await prisma_1.default.sanction.findMany({ where: { userId: cible.id, guildId, type: "BAN" }, orderBy: { createdAt: "desc" } });
        logger_1.default.info("📊 [Casier] BAN:", banSanctions.length);
        const bans = await prisma_1.default.log.findMany({ where: { type: "ban", OR: [{ userId: cible.id }, { targetId: cible.id }] }, orderBy: { createdAt: "desc" } });
        logger_1.default.info("📊 [Casier] BAN logs:", bans.length);
        const total = warnings.length + mutes.length + kicks.length + banSanctions.length + bans.length;
        logger_1.default.info("📊 [Casier] Total sanctions:", total);
        const vierge = total === 0;
        const baseEmbed = () => new discord_js_1.EmbedBuilder()
            .setTitle("🗂️ Casier Judiciaire • " + cible.username)
            .setColor(vierge ? 0x2ecc71 : 0xff3344)
            .setFooter(FOOTER).setTimestamp();
        if (vierge) {
            const embed = baseEmbed()
                .setDescription(`🛡️ **Ce membre a un casier vierge.**
Aucun historique de sanction.`)
                .addFields({ name: "👤 Membre", value: cible.tag, inline: true }, { name: "🔍 ID", value: cible.id, inline: true });
            await interaction.editReply({ embeds: [embed] });
            return;
        }
        const entries = buildEntries(warnings, mutes, kicks, banSanctions, bans);
        const pages = chunkEntries(entries, 3800);
        const embeds = pages.map(p => baseEmbed().setDescription(p).addFields({ name: "👤 Membre", value: cible.tag, inline: true }, { name: "🔍 ID", value: cible.id, inline: true }, { name: "📋 Total", value: total + " sanction(s)", inline: true }));
        if (pages.length === 1) {
            await interaction.editReply({ embeds: [embeds[0]] });
            return;
        }
        let page = 0;
        const reply = await interaction.editReply({ embeds: [embeds[0]], components: [buildNavRow(0, pages.length)] });
        const collector = reply.createMessageComponentCollector({ componentType: discord_js_1.ComponentType.Button, time: 120_000 });
        collector.on("collect", async (btn) => {
            if (btn.user.id !== interaction.user.id) {
                await btn.reply({ content: "❌ Seul l'auteur peut naviguer.", flags: [discord_js_1.MessageFlags.Ephemeral] });
                return;
            }
            page = btn.customId === "casier_prev" ? Math.max(0, page - 1) : Math.min(pages.length - 1, page + 1);
            await btn.update({ embeds: [embeds[page]], components: [buildNavRow(page, pages.length)] });
        });
        collector.on("end", async () => {
            const row = buildNavRow(page, pages.length);
            row.components.forEach(b => b.setDisabled(true));
            await reply.edit({ components: [row] }).catch(() => { });
        });
    }
    catch (error) {
        logger_1.default.error("[CRASH CASIER]", error);
        try {
            await interaction.editReply({ content: "❌ Erreur interne. L'erreur a été logguée dans la console." });
        }
        catch {
            await interaction.followUp({ content: "❌ Erreur interne.", flags: [discord_js_1.MessageFlags.Ephemeral] });
        }
    }
}
//# sourceMappingURL=casier.js.map