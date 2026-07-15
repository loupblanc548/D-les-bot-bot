import {
  ChatInputCommandInteraction,
  SlashCommandBuilder,
  PermissionFlagsBits,
  Client,
  EmbedBuilder,
} from "discord.js";
import { handleCommand as handleSecurityCore } from "./security/core.js";
import { handleCommand as handleExtraCmd } from "./extraCommands.js";
import { handleCommand as handleModPro } from "./moderationPro.js";
import prisma from "../prisma.js";
import logger from "../utils/logger.js";
import { invalidateCache as invalidateWordFilterCache } from "../services/wordFilter.js";
import { handleSecurityExtra } from "./stubHandlers.js";

export const commands = [
  new SlashCommandBuilder()
    .setName("security")
    .setDescription("Sécurité (OSINT, threat, config, defense)")
    .setDefaultMemberPermissions(PermissionFlagsBits.ModerateMembers)

    // ── Group: osint (essentiel) ──
    .addSubcommandGroup((grp) =>
      grp
        .setName("osint")
        .setDescription("Scan OSINT")
        .addSubcommand((sc) =>
          sc
            .setName("scan")
            .setDescription("Scan rapide 35+ plateformes")
            .addStringOption((o) => o.setName("pseudo").setDescription("Pseudo").setRequired(true)),
        )
        .addSubcommand((sc) =>
          sc
            .setName("dns")
            .setDescription("Résolution DNS")
            .addStringOption((o) =>
              o.setName("domaine").setDescription("Domaine").setRequired(true),
            ),
        )
        .addSubcommand((sc) =>
          sc
            .setName("whois")
            .setDescription("WHOIS complet")
            .addStringOption((o) =>
              o.setName("domaine").setDescription("Domaine").setRequired(true),
            ),
        )
        .addSubcommand((sc) =>
          sc
            .setName("breach")
            .setDescription("Data breach check")
            .addStringOption((o) => o.setName("email").setDescription("Email").setRequired(true)),
        )
        .addSubcommand((sc) =>
          sc
            .setName("phone")
            .setDescription("PhoneInfoga")
            .addStringOption((o) => o.setName("numero").setDescription("Numéro").setRequired(true)),
        ),
    )

    // ── Group: threat (essentiel) ──
    .addSubcommandGroup((grp) =>
      grp
        .setName("threat")
        .setDescription("Analyse de menaces")
        .addSubcommand((sc) =>
          sc
            .setName("linkcheck")
            .setDescription("Lien suspect?")
            .addStringOption((o) => o.setName("url").setDescription("URL").setRequired(true)),
        )
        .addSubcommand((sc) => sc.setName("intel").setDescription("Analyse globale serveur"))
        .addSubcommand((sc) =>
          sc
            .setName("namehistory")
            .setDescription("Historique pseudos")
            .addUserOption((o) =>
              o.setName("utilisateur").setDescription("Utilisateur").setRequired(true),
            ),
        ),
    )

    // ── Group: config (essentiel) ──
    .addSubcommandGroup((grp) =>
      grp
        .setName("config")
        .setDescription("Configuration sécurité")
        .addSubcommand((sc) =>
          sc
            .setName("antiraid")
            .setDescription("Mode anti-raid")
            .addStringOption((o) =>
              o
                .setName("action")
                .setDescription("Action")
                .setRequired(true)
                .addChoices(
                  { name: "Activer", value: "on" },
                  { name: "Désactiver", value: "off" },
                  { name: "Statut", value: "status" },
                ),
            ),
        )
        .addSubcommand((sc) =>
          sc
            .setName("word-filter")
            .setDescription("Filtre mots interdits")
            .addStringOption((o) =>
              o
                .setName("action")
                .setDescription("Action")
                .setRequired(true)
                .addChoices(
                  { name: "Lister", value: "list" },
                  { name: "Ajouter", value: "add" },
                  { name: "Supprimer", value: "remove" },
                  { name: "Toggle", value: "toggle" },
                ),
            )
            .addStringOption((o) => o.setName("mot").setDescription("Mot").setRequired(false)),
        ),
    )

    // ── Group: defense (essentiel) ──
    .addSubcommandGroup((grp) =>
      grp
        .setName("defense")
        .setDescription("Défense active")
        .addSubcommand((sc) => sc.setName("raid-shield").setDescription("Bouclier anti-raid"))
        .addSubcommand((sc) =>
          sc
            .setName("lockdown-server")
            .setDescription("Verrouillage serveur")
            .addStringOption((o) =>
              o.setName("raison").setDescription("Raison").setRequired(false),
            ),
        ),
    )
    .toJSON(),
];

export async function handleCommand(interaction: ChatInputCommandInteraction, client: Client) {
  const group = interaction.options.getSubcommandGroup();
  const action = interaction.options.getSubcommand();

  if (action === "word-filter") {
    await handleWordFilter(interaction);
    return;
  }

  Object.defineProperty(interaction, "commandName", { value: action, writable: true });

  if (action === "raid-shield") {
    await handleModPro(interaction);
    return;
  }

  if (group === "osint") {
    Object.defineProperty(interaction, "commandName", { value: "osint", writable: true });
    const { handleCommand: handleOsint } = await import("./osint.js");
    await handleOsint(interaction);
    return;
  }

  const existingSecSubs = ["antiraid", "namehistory", "linkcheck", "lockdown-server"];
  if (existingSecSubs.includes(action)) {
    await handleSecurityCore(interaction, client);
  } else {
    await handleSecurityExtra(interaction, client);
  }
}

async function handleWordFilter(interaction: ChatInputCommandInteraction): Promise<void> {
  const subAction = interaction.options.getString("action", true);
  const guildId = interaction.guildId!;

  await interaction.deferReply({ ephemeral: true });

  try {
    switch (subAction) {
      case "list": {
        const entries = await prisma.wordFilterEntry.findMany({
          where: { guildId },
          orderBy: { word: "asc" },
        });
        const config = await prisma.wordFilterConfig.findUnique({ where: { guildId } });
        const embed = new EmbedBuilder()
          .setTitle("📋 Filtre de mots interdits")
          .setColor(0x2f3136)
          .addFields(
            { name: "Statut", value: config?.enabled ? "✅ Activé" : "❌ Désactivé", inline: true },
            { name: "Action", value: config?.action || "delete", inline: true },
            { name: "Mots", value: `${entries.length}`, inline: true },
          );
        if (entries.length > 0) {
          const words = entries.map((e) => `\`${e.word}\``).join(", ");
          embed.setDescription(words.length > 4000 ? words.slice(0, 4000) + "..." : words);
        } else {
          embed.setDescription(
            "Aucun mot. Utilise `/security config word-filter` action **Ajouter**.",
          );
        }
        await interaction.editReply({ embeds: [embed] });
        break;
      }
      case "add": {
        const word = interaction.options.getString("mot", true)?.trim().toLowerCase();
        if (!word || word.length < 2) {
          await interaction.editReply({ content: "❌ Min 2 caractères." });
          return;
        }
        await prisma.wordFilterEntry.upsert({
          where: { guildId_word: { guildId, word } },
          update: {},
          create: { guildId, word },
        });
        invalidateWordFilterCache(guildId);
        await interaction.editReply({ content: `✅ Mot **"${word}"** ajouté.` });
        break;
      }
      case "remove": {
        const word = interaction.options.getString("mot", true)?.trim().toLowerCase();
        if (!word) {
          await interaction.editReply({ content: "❌ Spécifie le mot." });
          return;
        }
        await prisma.wordFilterEntry.deleteMany({ where: { guildId, word } });
        invalidateWordFilterCache(guildId);
        await interaction.editReply({ content: `✅ Mot **"${word}"** retiré.` });
        break;
      }
      case "toggle": {
        const config = await prisma.wordFilterConfig.upsert({
          where: { guildId },
          update: { enabled: { set: true } },
          create: { guildId, enabled: true },
        });
        const newEnabled = !config.enabled;
        await prisma.wordFilterConfig.update({ where: { guildId }, data: { enabled: newEnabled } });
        invalidateWordFilterCache(guildId);
        await interaction.editReply({
          content: newEnabled ? "✅ Filtre **activé**." : "❌ Filtre **désactivé**.",
        });
        break;
      }
    }
  } catch (error) {
    logger.error("[WordFilter] Erreur:", error);
    try {
      await interaction.editReply({ content: "❌ Erreur." });
    } catch {}
  }
}
