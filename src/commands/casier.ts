import logger from "../utils/logger";
import {
  MessageFlags,
  SlashCommandBuilder,
  ChatInputCommandInteraction,
  EmbedBuilder,
  ActionRowBuilder,
  ButtonBuilder,
  ButtonStyle,
  ComponentType,
} from "discord.js";
import prisma from "../prisma";
import { requireMod, requireAdmin } from "../services/permissions";

const FOOTER = { text: "Système de Surveillance • v1.1.0" };

export const commands = [
  new SlashCommandBuilder()
    .setName("casier")
    .setDescription("Affiche le casier judiciaire d'un membre")
    .addUserOption((option) =>
      option.setName("cible").setDescription("Le membre à consulter").setRequired(true)
    )
    .toJSON(),
  new SlashCommandBuilder()
    .setName("casier-clear")
    .setDescription("Supprime une sanction ou tout le casier (admin)")
    .addIntegerOption((option) =>
      option.setName("id").setDescription("ID de la sanction").setRequired(false)
    )
    .addUserOption((option) =>
      option.setName("membre").setDescription("Membre à effacer").setRequired(false)
    )
    .toJSON(),
];

export interface CasierEntry {
  section: "warn" | "mute" | "kick" | "ban_sanction" | "ban";
  isHeader: boolean;
  headerLine: string;
  line: string;
}


interface SanctionRow {
  reason?: string | null;
  createdAt: Date;
  moderatorId?: string | null;
  duration?: number | null;
}

interface LogRow {
  action?: string | null;
  details?: string | null;
  createdAt: Date | string;
}

export function buildEntries(
  warnings: SanctionRow[], mutes: SanctionRow[], kicks: SanctionRow[], banSanctions: SanctionRow[], bans: LogRow[]
): CasierEntry[] {
  const entries: CasierEntry[] = [];
  const hdr = (s: string, l: string): CasierEntry => ({
    section: s as CasierEntry["section"], isHeader: true, headerLine: l, line: l,
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

export function chunkEntries(entries: CasierEntry[], maxChars: number): string[] {
  const pages: string[] = [];
  let current = "", lastHeader = "";
  for (const e of entries) {
    if (e.isHeader) lastHeader = e.headerLine;
    const sep = current ? "\n\n" : "";
    const prefix = (!current && !e.isHeader && lastHeader) ? lastHeader + "\n" : "";
    const candidate = current + sep + prefix + e.line;
    if (candidate.length > maxChars && current) {
      pages.push(current);
      current = (!e.isHeader && lastHeader) ? lastHeader + "\n" + e.line : e.line;
    } else { current = candidate; }
  }
  if (current || !pages.length) pages.push(current);
  return pages;
}

export function buildNavRow(page: number, total: number): ActionRowBuilder<ButtonBuilder> {
  return new ActionRowBuilder<ButtonBuilder>().addComponents(
    new ButtonBuilder().setCustomId("casier_prev").setLabel("◀️").setStyle(ButtonStyle.Secondary).setDisabled(page === 0),
    new ButtonBuilder().setCustomId("casier_page").setLabel("Page " + (page + 1) + " / " + total).setStyle(ButtonStyle.Secondary).setDisabled(true),
    new ButtonBuilder().setCustomId("casier_next").setLabel("▶️").setStyle(ButtonStyle.Secondary).setDisabled(page === total - 1)
  );
}

export async function handleCasierClear(interaction: ChatInputCommandInteraction) {
  const sanctionId = interaction.options.getInteger("id");
  const membre = interaction.options.getUser("membre");
  if (!sanctionId && !membre) {
    await interaction.reply({ content: "❌ Fournis un ID de sanction OU un membre.", flags: [MessageFlags.Ephemeral] });
    return;
  }
  if (sanctionId) {
    const s = await prisma.sanction.findUnique({ where: { id: sanctionId } });
    if (!s) { await interaction.reply({ content: "❌ Sanction introuvable.", flags: [MessageFlags.Ephemeral] }); return; }
    await prisma.sanction.delete({ where: { id: sanctionId } });
    await interaction.reply({ content: "✅ Sanction #" + sanctionId + " (" + s.type + ") supprimée.", flags: [MessageFlags.Ephemeral] });
  } else if (membre) {
    const d = await prisma.sanction.deleteMany({ where: { userId: membre.id, guildId: interaction.guildId! } });
    await interaction.reply({ content: "✅ " + d.count + " sanction(s) supprimée(s) pour " + membre.tag + ".", flags: [MessageFlags.Ephemeral] });
  }
}

export async function handleCommand(interaction: ChatInputCommandInteraction) {
  if (interaction.commandName === "casier-clear") {
    if (!(await requireAdmin(interaction))) return;
    await handleCasierClear(interaction);
    return;
  }

  if (!(await requireMod(interaction))) return;

  const cible = interaction.options.getUser("cible", true);
  const guildId = interaction.guildId;
  if (!guildId) {
    await interaction.reply({ content: "❌ Commande utilisable seulement sur un serveur.", flags: [MessageFlags.Ephemeral] });
    return;
  }

  await interaction.deferReply();

  try {
    logger.info("🔍 [Casier] Recherche sanctions pour ID:", cible.id, "| Tag:", cible.tag);

    const warnings = await prisma.sanction.findMany({ where: { userId: cible.id, guildId, type: "WARN" }, orderBy: { createdAt: "desc" } });
    logger.info("📊 [Casier] WARN:", warnings.length);

    const mutes = await prisma.sanction.findMany({ where: { userId: cible.id, guildId, type: "TIMEOUT" }, orderBy: { createdAt: "desc" } });
    logger.info("📊 [Casier] TIMEOUT:", mutes.length);

    const kicks = await prisma.sanction.findMany({ where: { userId: cible.id, guildId, type: "KICK" }, orderBy: { createdAt: "desc" } });
    logger.info("📊 [Casier] KICK:", kicks.length);

    const banSanctions = await prisma.sanction.findMany({ where: { userId: cible.id, guildId, type: "BAN" }, orderBy: { createdAt: "desc" } });
    logger.info("📊 [Casier] BAN:", banSanctions.length);

    const bans = await prisma.log.findMany({ where: { type: "ban", OR: [{ userId: cible.id }, { targetId: cible.id }] }, orderBy: { createdAt: "desc" } });
    logger.info("📊 [Casier] BAN logs:", bans.length);

    const total = warnings.length + mutes.length + kicks.length + banSanctions.length + bans.length;
    logger.info("📊 [Casier] Total sanctions:", total);

    const vierge = total === 0;
    const baseEmbed = () => new EmbedBuilder()
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
    const embeds = pages.map(p => baseEmbed().setDescription(p).addFields(
      { name: "👤 Membre", value: cible.tag, inline: true },
      { name: "🔍 ID", value: cible.id, inline: true },
      { name: "📋 Total", value: total + " sanction(s)", inline: true }
    ));

    if (pages.length === 1) { await interaction.editReply({ embeds: [embeds[0]] }); return; }

    let page = 0;
    const reply = await interaction.editReply({ embeds: [embeds[0]], components: [buildNavRow(0, pages.length)] });
    const collector = reply.createMessageComponentCollector({ componentType: ComponentType.Button, time: 120_000 });

    collector.on("collect", async (btn) => {
      if (btn.user.id !== interaction.user.id) {
        await btn.reply({ content: "❌ Seul l'auteur peut naviguer.", flags: [MessageFlags.Ephemeral] });
        return;
      }
      page = btn.customId === "casier_prev" ? Math.max(0, page - 1) : Math.min(pages.length - 1, page + 1);
      await btn.update({ embeds: [embeds[page]], components: [buildNavRow(page, pages.length)] });
    });

    collector.on("end", async () => {
      const row = buildNavRow(page, pages.length);
      row.components.forEach(b => b.setDisabled(true));
      await reply.edit({ components: [row] }).catch((err) => { logger.error("[Casier] Erreur edit reply:", String(err)) });
    });

  } catch (error) {
    logger.error("[CRASH CASIER]", error);
    try { await interaction.editReply({ content: "❌ Erreur interne. L'erreur a été logguée dans la console." }); }
    catch { await interaction.followUp({ content: "❌ Erreur interne.", flags: [MessageFlags.Ephemeral] }); }
  }
}
