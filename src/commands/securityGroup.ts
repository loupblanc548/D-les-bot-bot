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

    // ── Group: osint (23 subs) ──
    .addSubcommandGroup((grp) =>
      grp
        .setName("osint")
        .setDescription("Scan OSINT (IP, domaine, email, réseaux)")
        .addSubcommand((sc) =>
          sc.setName("scan").setDescription("Scan rapide 35+ plateformes")
            .addStringOption((o) => o.setName("pseudo").setDescription("Pseudo").setRequired(true)),
        )
        .addSubcommand((sc) =>
          sc.setName("dns").setDescription("Résolution DNS")
            .addStringOption((o) => o.setName("domaine").setDescription("Domaine").setRequired(true)),
        )
        .addSubcommand((sc) =>
          sc.setName("whois").setDescription("WHOIS complet")
            .addStringOption((o) => o.setName("domaine").setDescription("Domaine").setRequired(true)),
        )
        .addSubcommand((sc) =>
          sc.setName("port-scan").setDescription("Scan de ports")
            .addStringOption((o) => o.setName("host").setDescription("Hôte/IP").setRequired(true)),
        )
        .addSubcommand((sc) =>
          sc.setName("ssl-check").setDescription("Certificat SSL")
            .addStringOption((o) => o.setName("domaine").setDescription("Domaine").setRequired(true)),
        )
        .addSubcommand((sc) =>
          sc.setName("breach").setDescription("Data breach check")
            .addStringOption((o) => o.setName("email").setDescription("Email").setRequired(true)),
        )
        .addSubcommand((sc) =>
          sc.setName("sherlock").setDescription("Sherlock 480+ sites")
            .addStringOption((o) => o.setName("pseudo").setDescription("Pseudo").setRequired(true)),
        )
        .addSubcommand((sc) =>
          sc.setName("maigret").setDescription("Maigret 2500+ sites")
            .addStringOption((o) => o.setName("pseudo").setDescription("Pseudo").setRequired(true)),
        )
        .addSubcommand((sc) =>
          sc.setName("tech-detect").setDescription("Détection technologies")
            .addStringOption((o) => o.setName("url").setDescription("URL").setRequired(true)),
        )
        .addSubcommand((sc) =>
          sc.setName("email").setDescription("Holehe 120+ sites")
            .addStringOption((o) => o.setName("email").setDescription("Email").setRequired(true)),
        )
        .addSubcommand((sc) =>
          sc.setName("phone").setDescription("PhoneInfoga")
            .addStringOption((o) => o.setName("numero").setDescription("Numéro").setRequired(true)),
        )
        .addSubcommand((sc) =>
          sc.setName("domain").setDescription("Scan complet domaine")
            .addStringOption((o) => o.setName("domaine").setDescription("Domaine").setRequired(true)),
        )
        .addSubcommand((sc) =>
          sc.setName("crawl").setDescription("Photon crawler")
            .addStringOption((o) => o.setName("url").setDescription("URL").setRequired(true)),
        )
        .addSubcommand((sc) =>
          sc.setName("social").setDescription("socialscan")
            .addStringOption((o) => o.setName("query").setDescription("Pseudo/email").setRequired(true)),
        )
        .addSubcommand((sc) =>
          sc.setName("harvester").setDescription("theHarvester")
            .addStringOption((o) => o.setName("domaine").setDescription("Domaine").setRequired(true)),
        )
        .addSubcommand((sc) =>
          sc.setName("wmn").setDescription("WhatsMyName 600+")
            .addStringOption((o) => o.setName("pseudo").setDescription("Pseudo").setRequired(true)),
        )
        .addSubcommand((sc) =>
          sc.setName("exif").setDescription("Extraction EXIF")
            .addStringOption((o) => o.setName("url").setDescription("URL image").setRequired(true)),
        )
        .addSubcommand((sc) =>
          sc.setName("cms").setDescription("CMSeeK")
            .addStringOption((o) => o.setName("url").setDescription("URL").setRequired(true)),
        )
        .addSubcommand((sc) =>
          sc.setName("insta-deep").setDescription("Osintgram")
            .addStringOption((o) => o.setName("pseudo").setDescription("Pseudo IG").setRequired(true)),
        )
        .addSubcommand((sc) =>
          sc.setName("headers").setDescription("HTTP headers")
            .addStringOption((o) => o.setName("url").setDescription("URL").setRequired(true)),
        )
        .addSubcommand((sc) =>
          sc.setName("metadata").setDescription("Métadonnées URL")
            .addStringOption((o) => o.setName("url").setDescription("URL").setRequired(true)),
        )
        .addSubcommand((sc) =>
          sc.setName("username-gen").setDescription("Générateur pseudos")
            .addStringOption((o) => o.setName("mots").setDescription("Mots-clés").setRequired(true)),
        )
        .addSubcommand((sc) =>
          sc.setName("instagram").setDescription("Instaloader")
            .addStringOption((o) => o.setName("pseudo").setDescription("Pseudo IG").setRequired(true)),
        ),
    )

    // ── Group: threat (14 subs) ──
    .addSubcommandGroup((grp) =>
      grp
        .setName("threat")
        .setDescription("Analyse de menaces et intelligence")
        .addSubcommand((sc) =>
          sc.setName("check-alt").setDescription("Comptes récemment créés")
            .addIntegerOption((o) => o.setName("heures").setDescription("Âge max (h)").setRequired(false).setMinValue(1).setMaxValue(720)),
        )
        .addSubcommand((sc) =>
          sc.setName("linkcheck").setDescription("Lien suspect?")
            .addStringOption((o) => o.setName("url").setDescription("URL").setRequired(true)),
        )
        .addSubcommand((sc) => sc.setName("threatreport").setDescription("Rapport de menace"))
        .addSubcommand((sc) => sc.setName("intel").setDescription("Analyse globale serveur"))
        .addSubcommand((sc) => sc.setName("privacy").setDescription("Audit vie privée"))
        .addSubcommand((sc) => sc.setName("network").setDescription("Analyse réseau"))
        .addSubcommand((sc) =>
          sc.setName("alt-link").setDescription("Liens alternatifs utilisateur")
            .addUserOption((o) => o.setName("cible").setDescription("Utilisateur").setRequired(true)),
        )
        .addSubcommand((sc) =>
          sc.setName("ban-log").setDescription("Journal des bannissements")
            .addUserOption((o) => o.setName("cible").setDescription("Utilisateur").setRequired(false)),
        )
        .addSubcommand((sc) =>
          sc.setName("behavior-timeline").setDescription("Timeline comportementale")
            .addUserOption((o) => o.setName("cible").setDescription("Utilisateur").setRequired(true)),
        )
        .addSubcommand((sc) =>
          sc.setName("namehistory").setDescription("Historique pseudos")
            .addUserOption((o) => o.setName("utilisateur").setDescription("Utilisateur").setRequired(true)),
        )
        .addSubcommand((sc) =>
          sc.setName("avatarhistory").setDescription("Historique avatars")
            .addUserOption((o) => o.setName("utilisateur").setDescription("Utilisateur").setRequired(true)),
        )
        .addSubcommand((sc) =>
          sc.setName("alert-rules").setDescription("Règles d'alerte auto")
            .addStringOption((o) => o.setName("action").setDescription("Action").setRequired(true)
              .addChoices({ name: "Lister", value: "list" }, { name: "Ajouter", value: "add" }, { name: "Supprimer", value: "remove" })),
        )
        .addSubcommand((sc) =>
          sc.setName("blacklist").setDescription("Liste noire (Owner)")
            .addStringOption((o) => o.setName("action").setDescription("Action").setRequired(true)
              .addChoices({ name: "Ajouter", value: "add" }, { name: "Retirer", value: "remove" }))
            .addStringOption((o) => o.setName("cible").setDescription("Type").setRequired(true)
              .addChoices({ name: "Utilisateur", value: "user" }, { name: "Serveur", value: "guild" }))
            .addStringOption((o) => o.setName("id").setDescription("ID Discord").setRequired(true)),
        )
        .addSubcommand((sc) =>
          sc.setName("role-mass").setDescription("Rôle massif")
            .addStringOption((o) => o.setName("action").setDescription("Action").setRequired(true)
              .addChoices({ name: "Ajouter", value: "add" }, { name: "Retirer", value: "remove" }))
            .addRoleOption((o) => o.setName("rôle").setDescription("Rôle").setRequired(true)),
        ),
    )

    // ── Group: config (11 subs) ──
    .addSubcommandGroup((grp) =>
      grp
        .setName("config")
        .setDescription("Configuration sécurité")
        .addSubcommand((sc) =>
          sc.setName("antiraid").setDescription("Mode anti-raid")
            .addStringOption((o) => o.setName("action").setDescription("Action").setRequired(true)
              .addChoices({ name: "Activer", value: "on" }, { name: "Désactiver", value: "off" }, { name: "Statut", value: "status" }))
            .addIntegerOption((o) => o.setName("seuil_heures").setDescription("Âge max (h)").setRequired(false).setMinValue(1).setMaxValue(168)),
        )
        .addSubcommand((sc) =>
          sc.setName("verif").setDescription("Panneau vérification")
            .addRoleOption((o) => o.setName("role").setDescription("Rôle").setRequired(true)),
        )
        .addSubcommand((sc) =>
          sc.setName("word-filter").setDescription("Filtre mots interdits")
            .addStringOption((o) => o.setName("action").setDescription("Action").setRequired(true)
              .addChoices(
                { name: "📋 Lister", value: "list" }, { name: "➕ Ajouter", value: "add" },
                { name: "➖ Supprimer", value: "remove" }, { name: "🔧 Toggle", value: "toggle" },
                { name: "⚙️ Action", value: "setaction" }, { name: "📝 Message", value: "setmsg" },
                { name: "📊 Config", value: "view" }, { name: "🧹 Clear", value: "clear" },
              ))
            .addStringOption((o) => o.setName("mot").setDescription("Mot").setRequired(false))
            .addStringOption((o) => o.setName("mode").setDescription("Mode").setRequired(false)
              .addChoices(
                { name: "Supprimer", value: "delete" }, { name: "Avertir", value: "warn" },
                { name: "Timeout", value: "timeout" }, { name: "Expulser", value: "kick" },
                { name: "Bannir", value: "ban" },
              )),
        )
        .addSubcommand((sc) =>
          sc.setName("automod-config").setDescription("Config automod")
            .addStringOption((o) => o.setName("action").setDescription("Action").setRequired(true))
            .addStringOption((o) => o.setName("filtre").setDescription("Filtre").setRequired(false)),
        )
        .addSubcommand((sc) => sc.setName("automod-status").setDescription("Statut automod"))
        .addSubcommand((sc) => sc.setName("auto-report").setDescription("Rapport automatique"))
        .addSubcommand((sc) =>
          sc.setName("captcha-config").setDescription("Config captcha")
            .addStringOption((o) => o.setName("action").setDescription("Action").setRequired(true)),
        )
        .addSubcommand((sc) =>
          sc.setName("anti-bot").setDescription("Détection bots")
            .addStringOption((o) => o.setName("action").setDescription("on/off").setRequired(true)
              .addChoices({ name: "Activer", value: "on" }, { name: "Désactiver", value: "off" })),
        )
        .addSubcommand((sc) =>
          sc.setName("logging-config").setDescription("Config logs")
            .addStringOption((o) => o.setName("event").setDescription("Event").setRequired(true))
            .addChannelOption((o) => o.setName("salon").setDescription("Salon").setRequired(false)),
        )
        .addSubcommand((sc) =>
          sc.setName("whitelist-domain").setDescription("Domaine whitelist")
            .addStringOption((o) => o.setName("domaine").setDescription("Domaine").setRequired(true)),
        )
        .addSubcommand((sc) => sc.setName("audit-export").setDescription("Export audit JSON")),
    )

    // ── Group: defense (6 subs) ──
    .addSubcommandGroup((grp) =>
      grp
        .setName("defense")
        .setDescription("Défense active")
        .addSubcommand((sc) => sc.setName("nuke").setDescription("Clone+supprime salon (anti-spam)"))
        .addSubcommand((sc) => sc.setName("raid-shield").setDescription("Bouclier anti-raid"))
        .addSubcommand((sc) =>
          sc.setName("raid-mode").setDescription("Mode raid (verrouillage)")
            .addIntegerOption((o) => o.setName("duree").setDescription("Minutes").setRequired(false).setMinValue(1).setMaxValue(1440)),
        )
        .addSubcommand((sc) =>
          sc.setName("lockdown-server").setDescription("Verrouillage serveur")
            .addStringOption((o) => o.setName("raison").setDescription("Raison").setRequired(false)),
        )
        .addSubcommand((sc) =>
          sc.setName("invite-block").setDescription("Bloque invitations Discord")
            .addStringOption((o) => o.setName("action").setDescription("on/off").setRequired(true)
              .addChoices({ name: "Activer", value: "on" }, { name: "Désactiver", value: "off" })),
        )
        .addSubcommand((sc) => sc.setName("autodefense").setDescription("Auto-défense serveur")),
    )
    .toJSON(),
];

// ─── Handler ───────────────────────────────────────────────────────────

export async function handleCommand(interaction: ChatInputCommandInteraction, client: Client) {
  const group = interaction.options.getSubcommandGroup();
  const action = interaction.options.getSubcommand();

  // Word filter géré localement
  if (action === "word-filter") {
    await handleWordFilter(interaction);
    return;
  }

  Object.defineProperty(interaction, "commandName", { value: action, writable: true });

  if (action === "raid-shield") {
    await handleModPro(interaction);
    return;
  }

  // OSINT group → delegate to osint.ts
  if (group === "osint") {
    Object.defineProperty(interaction, "commandName", { value: "osint", writable: true });
    const { handleCommand: handleOsint } = await import("./osint.js");
    await handleOsint(interaction);
    return;
  }

  // Extra commands
  const extraCmds = ["alt-link", "ban-log", "behavior-timeline", "alert-rules"];
  if (extraCmds.includes(action)) {
    await handleExtraCmd(interaction, client);
    return;
  }

  // Security core
  const existingSecSubs = ["nuke", "check-alt", "blacklist", "role-mass", "antiraid", "verif", "namehistory", "avatarhistory", "linkcheck"];
  if (existingSecSubs.includes(action)) {
    await handleSecurityCore(interaction, client);
  } else {
    await handleSecurityExtra(interaction, client);
  }
}

// ─── Word Filter handler ──────────────────────────────────────────────
async function handleWordFilter(interaction: ChatInputCommandInteraction): Promise<void> {
  const subAction = interaction.options.getString("action", true);
  const guildId = interaction.guildId!;

  await interaction.deferReply({ ephemeral: true });

  try {
    switch (subAction) {
      case "list": {
        const entries = await prisma.wordFilterEntry.findMany({ where: { guildId }, orderBy: { word: "asc" } });
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
          embed.setDescription("Aucun mot. Utilise `/security config word-filter` action **Ajouter**.");
        }
        await interaction.editReply({ embeds: [embed] });
        break;
      }
      case "add": {
        const word = interaction.options.getString("mot", true)?.trim().toLowerCase();
        if (!word || word.length < 2) { await interaction.editReply({ content: "❌ Min 2 caractères." }); return; }
        await prisma.wordFilterEntry.upsert({ where: { guildId_word: { guildId, word } }, update: {}, create: { guildId, word } });
        invalidateWordFilterCache(guildId);
        await interaction.editReply({ content: `✅ Mot **"${word}"** ajouté.` });
        break;
      }
      case "remove": {
        const word = interaction.options.getString("mot", true)?.trim().toLowerCase();
        if (!word) { await interaction.editReply({ content: "❌ Spécifie le mot." }); return; }
        await prisma.wordFilterEntry.deleteMany({ where: { guildId, word } });
        invalidateWordFilterCache(guildId);
        await interaction.editReply({ content: `✅ Mot **"${word}"** retiré.` });
        break;
      }
      case "toggle": {
        const config = await prisma.wordFilterConfig.upsert({ where: { guildId }, update: { enabled: { set: true } }, create: { guildId, enabled: true } });
        const newEnabled = !config.enabled;
        await prisma.wordFilterConfig.update({ where: { guildId }, data: { enabled: newEnabled } });
        invalidateWordFilterCache(guildId);
        await interaction.editReply({ content: newEnabled ? "✅ Filtre **activé**." : "❌ Filtre **désactivé**." });
        break;
      }
      case "setaction": {
        const mode = interaction.options.getString("mode", true);
        await prisma.wordFilterConfig.upsert({ where: { guildId }, update: { action: mode }, create: { guildId, action: mode, enabled: true } });
        invalidateWordFilterCache(guildId);
        await interaction.editReply({ content: `✅ Action: **${mode}**.` });
        break;
      }
      case "setmsg": {
        const msg = interaction.options.getString("mot", true);
        await prisma.wordFilterConfig.upsert({ where: { guildId }, update: { warnMessage: msg }, create: { guildId, warnMessage: msg, enabled: true } });
        invalidateWordFilterCache(guildId);
        await interaction.editReply({ content: "✅ Message mis à jour." });
        break;
      }
      case "view": {
        const config = await prisma.wordFilterConfig.findUnique({ where: { guildId } });
        const count = await prisma.wordFilterEntry.count({ where: { guildId } });
        const embed = new EmbedBuilder()
          .setTitle("⚙️ Config filtre de mots").setColor(0x2f3136)
          .addFields(
            { name: "Statut", value: config?.enabled ? "✅ Activé" : "❌ Désactivé" },
            { name: "Action", value: config?.action || "delete" },
            { name: "Message", value: config?.warnMessage || "(défaut)" },
            { name: "Salon log", value: config?.logChannel ? `<#${config.logChannel}>` : "N/A" },
            { name: "Mots", value: `${count}` },
          );
        await interaction.editReply({ embeds: [embed] });
        break;
      }
      case "clear": {
        await prisma.wordFilterEntry.deleteMany({ where: { guildId } });
        invalidateWordFilterCache(guildId);
        await interaction.editReply({ content: "✅ Filtre vidé." });
        break;
      }
    }
  } catch (error) {
    logger.error("[WordFilter] Erreur:", error);
    try { await interaction.editReply({ content: "❌ Erreur." }); } catch {}
  }
}
