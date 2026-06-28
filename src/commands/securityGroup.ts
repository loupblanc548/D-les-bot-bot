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
    .setDescription("Commandes de sécurité (nuke, check-alt, blacklist, antiraid, verif, etc.)")
    .setDefaultMemberPermissions(PermissionFlagsBits.ModerateMembers)
    .addSubcommand((sc) =>
      sc
        .setName("nuke")
        .setDescription("Clone le salon actuel et supprime l'ancien pour effacer le spam"),
    )
    .addSubcommand((sc) =>
      sc
        .setName("check-alt")
        .setDescription("Liste les comptes récemment créés ayant rejoint le serveur")
        .addIntegerOption((o) =>
          o
            .setName("heures")
            .setDescription("Âge max du compte en heures (défaut: 24h)")
            .setRequired(false)
            .setMinValue(1)
            .setMaxValue(720),
        ),
    )
    .addSubcommand((sc) =>
      sc
        .setName("blacklist")
        .setDescription("Ajoute ou retire un utilisateur/serveur de la liste noire (Owner)")
        .addStringOption((o) =>
          o
            .setName("action")
            .setDescription("Ajouter ou retirer")
            .setRequired(true)
            .addChoices({ name: "Ajouter", value: "add" }, { name: "Retirer", value: "remove" }),
        )
        .addStringOption((o) =>
          o
            .setName("cible")
            .setDescription("Type de cible")
            .setRequired(true)
            .addChoices(
              { name: "Utilisateur", value: "user" },
              { name: "Serveur", value: "guild" },
            ),
        )
        .addStringOption((o) =>
          o.setName("id").setDescription("ID Discord de la cible").setRequired(true),
        ),
    )
    .addSubcommand((sc) =>
      sc
        .setName("role-mass")
        .setDescription("Ajoute ou retire un rôle à tous les membres du serveur")
        .addStringOption((o) =>
          o
            .setName("action")
            .setDescription("Ajouter ou retirer le rôle")
            .setRequired(true)
            .addChoices({ name: "Ajouter", value: "add" }, { name: "Retirer", value: "remove" }),
        )
        .addRoleOption((o) => o.setName("rôle").setDescription("Le rôle cible").setRequired(true)),
    )
    .addSubcommand((sc) =>
      sc
        .setName("antiraid")
        .setDescription("Active/désactive le mode anti-raid")
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
        )
        .addIntegerOption((o) =>
          o
            .setName("seuil_heures")
            .setDescription("Âge max du compte en heures (défaut: 24)")
            .setRequired(false)
            .setMinValue(1)
            .setMaxValue(168),
        ),
    )
    .addSubcommand((sc) =>
      sc
        .setName("verif")
        .setDescription("Crée un panneau de vérification par bouton")
        .addRoleOption((o) =>
          o.setName("role").setDescription("Rôle à donner après vérification").setRequired(true),
        ),
    )
    .addSubcommand((sc) =>
      sc
        .setName("namehistory")
        .setDescription("Affiche l'historique des changements de pseudo d'un utilisateur")
        .addUserOption((o) =>
          o.setName("utilisateur").setDescription("Utilisateur cible").setRequired(true),
        ),
    )
    .addSubcommand((sc) =>
      sc
        .setName("avatarhistory")
        .setDescription("Affiche l'historique des changements d'avatar d'un utilisateur")
        .addUserOption((o) =>
          o.setName("utilisateur").setDescription("Utilisateur cible").setRequired(true),
        ),
    )
    .addSubcommand((sc) =>
      sc
        .setName("linkcheck")
        .setDescription("Vérifie si un lien est suspect (phishing, malware, etc.)")
        .addStringOption((o) =>
          o.setName("url").setDescription("URL à vérifier").setRequired(true),
        ),
    )
    .addSubcommand((sc) =>
      sc
        .setName("alt-link")
        .setDescription("Vérifie les liens alternatifs d'un utilisateur")
        .addUserOption((o) =>
          o.setName("cible").setDescription("Utilisateur à vérifier").setRequired(true),
        ),
    )
    .addSubcommand((sc) =>
      sc
        .setName("ban-log")
        .setDescription("Affiche le journal des bannissements")
        .addUserOption((o) =>
          o.setName("cible").setDescription("Utilisateur cible").setRequired(false),
        ),
    )
    .addSubcommand((sc) =>
      sc
        .setName("behavior-timeline")
        .setDescription("Affiche la timeline comportementale d'un utilisateur")
        .addUserOption((o) =>
          o.setName("cible").setDescription("Utilisateur cible").setRequired(true),
        ),
    )
    .addSubcommand((sc) =>
      sc
        .setName("alert-rules")
        .setDescription("Gère les règles d'alerte automatiques (admin)")
        .addStringOption((o) =>
          o
            .setName("action")
            .setDescription("Action")
            .setRequired(true)
            .addChoices(
              { name: "Lister", value: "list" },
              { name: "Ajouter", value: "add" },
              { name: "Supprimer", value: "remove" },
            ),
        ),
    )
    // ─── Word Filter ───
    .addSubcommand((sc) =>
      sc
        .setName("word-filter")
        .setDescription("Gère le filtre de mots interdits automatique")
        .addStringOption((o) =>
          o
            .setName("action")
            .setDescription("Action à effectuer")
            .setRequired(true)
            .addChoices(
              { name: "📋 Lister les mots", value: "list" },
              { name: "➕ Ajouter un mot", value: "add" },
              { name: "➖ Supprimer un mot", value: "remove" },
              { name: "🔧 Activer/Désactiver", value: "toggle" },
              { name: "⚙️ Définir l'action (delete/timeout/kick/ban)", value: "setaction" },
              { name: "📝 Définir le message d'avertissement", value: "setmsg" },
              { name: "📊 Voir la configuration", value: "view" },
              { name: "🧹 Tout effacer", value: "clear" },
            ),
        )
        .addStringOption((o) =>
          o.setName("mot").setDescription("Mot à ajouter/supprimer").setRequired(false),
        )
        .addStringOption((o) =>
          o
            .setName("mode")
            .setDescription("Action du filtre")
            .setRequired(false)
            .addChoices(
              { name: "Supprimer le message", value: "delete" },
              { name: "Avertir + supprimer", value: "warn" },
              { name: "Timeout 10min", value: "timeout" },
              { name: "Expulser", value: "kick" },
              { name: "Bannir", value: "ban" },
            ),
        ),
    )
    .addSubcommand((sc) =>
      sc.setName("raid-shield").setDescription("Bouclier anti-raid (comptes récents)"),
    )
    // ─── Nouvelles sous-commandes sécurité ───
    .addSubcommand((sc) =>
      sc
        .setName("raid-mode")
        .setDescription("Active le mode raid (verrouillage total temporaire)")
        .addIntegerOption((o) => o.setName("duree").setDescription("Durée en minutes").setRequired(false).setMinValue(1).setMaxValue(1440)),
    )
    .addSubcommand((sc) =>
      sc
        .setName("lockdown-server")
        .setDescription("Verrouille le serveur entier (anti-raid)")
        .addStringOption((o) => o.setName("raison").setDescription("Raison").setRequired(false)),
    )
    .addSubcommand((sc) =>
      sc
        .setName("automod-config")
        .setDescription("Configure l'automod (liens, invites, spam)")
        .addStringOption((o) => o.setName("action").setDescription("Action").setRequired(true))
        .addStringOption((o) => o.setName("filtre").setDescription("Filtre à configurer").setRequired(false)),
    )
    .addSubcommand((sc) => sc.setName("automod-status").setDescription("Statut de l'automod"))
    .addSubcommand((sc) =>
      sc
        .setName("invite-block")
        .setDescription("Bloque les invitations Discord dans les messages")
        .addStringOption((o) => o.setName("action").setDescription("on/off").setRequired(true).addChoices({name:"Activer",value:"on"},{name:"Désactiver",value:"off"})),
    )
    .addSubcommand((sc) =>
      sc
        .setName("captcha-config")
        .setDescription("Configuration du captcha à l'arrivée")
        .addStringOption((o) => o.setName("action").setDescription("Action").setRequired(true)),
    )
    .addSubcommand((sc) =>
      sc
        .setName("anti-bot")
        .setDescription("Active la détection auto des bots")
        .addStringOption((o) => o.setName("action").setDescription("on/off").setRequired(true).addChoices({name:"Activer",value:"on"},{name:"Désactiver",value:"off"})),
    )
    .addSubcommand((sc) =>
      sc
        .setName("logging-config")
        .setDescription("Configure quels events sont loggés")
        .addStringOption((o) => o.setName("event").setDescription("Type d'event").setRequired(true))
        .addChannelOption((o) => o.setName("salon").setDescription("Salon de log").setRequired(false)),
    )
    .addSubcommand((sc) => sc.setName("audit-export").setDescription("Exporte l'audit de sécurité en JSON"))
    .addSubcommand((sc) =>
      sc
        .setName("whitelist-domain")
        .setDescription("Whiteliste un domaine pour le linkcheck")
        .addStringOption((o) => o.setName("domaine").setDescription("Le domaine").setRequired(true)),
    )
    .toJSON(),
];

export async function handleCommand(interaction: ChatInputCommandInteraction, client: Client) {
  const action = interaction.options.getSubcommand();

  // ─── Word Filter (géré localement) ───
  if (action === "word-filter") {
    await handleWordFilter(interaction);
    return;
  }

  Object.defineProperty(interaction, "commandName", { value: action, writable: true });

  if (action === "raid-shield") {
    await handleModPro(interaction);
    return;
  }

  // Les commandes alt-link, ban-log, behavior-timeline, alert-rules sont dans extraCommands
  const extraCmds = ["alt-link", "ban-log", "behavior-timeline", "alert-rules"];
  if (extraCmds.includes(action)) {
    await handleExtraCmd(interaction, client);
  } else {
    // Try existing security core, then stub for new ones
    const existingSecSubs = ["nuke","check-alt","blacklist","role-mass","antiraid","verif","namehistory","avatarhistory","linkcheck"];
    if (existingSecSubs.includes(action)) {
      await handleSecurityCore(interaction, client);
    } else {
      await handleSecurityExtra(interaction, client);
    }
  }
}

// ─── Handler du filtre de mots interdits ─────────────────────────────
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
            { name: "Mots configurés", value: `${entries.length}`, inline: true },
          );

        if (entries.length > 0) {
          const words = entries.map((e) => `\`${e.word}\``).join(", ");
          embed.setDescription(words.length > 4000 ? words.slice(0, 4000) + "..." : words);
        } else {
          embed.setDescription(
            "Aucun mot configuré. Utilise `/security word-filter` avec l'action **Ajouter**.",
          );
        }

        await interaction.editReply({ embeds: [embed] });
        break;
      }

      case "add": {
        const word = interaction.options.getString("mot", true)?.trim().toLowerCase();
        if (!word || word.length < 2) {
          await interaction.editReply({ content: "❌ Le mot doit faire au moins 2 caractères." });
          return;
        }
        await prisma.wordFilterEntry.upsert({
          where: { guildId_word: { guildId, word } },
          update: {},
          create: { guildId, word },
        });
        invalidateWordFilterCache(guildId);
        await interaction.editReply({ content: `✅ Mot **"${word}"** ajouté au filtre.` });
        break;
      }

      case "remove": {
        const word = interaction.options.getString("mot", true)?.trim().toLowerCase();
        if (!word) {
          await interaction.editReply({ content: "❌ Spécifie le mot à supprimer." });
          return;
        }
        await prisma.wordFilterEntry.deleteMany({ where: { guildId, word } });
        invalidateWordFilterCache(guildId);
        await interaction.editReply({ content: `✅ Mot **"${word}"** retiré du filtre.` });
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
          content: newEnabled
            ? "✅ Filtre de mots interdits **activé**."
            : "❌ Filtre de mots interdits **désactivé**.",
        });
        break;
      }

      case "setaction": {
        const mode = interaction.options.getString("mode", true);
        await prisma.wordFilterConfig.upsert({
          where: { guildId },
          update: { action: mode },
          create: { guildId, action: mode, enabled: true },
        });
        invalidateWordFilterCache(guildId);
        await interaction.editReply({
          content: `✅ Action du filtre définie sur **${mode}**.`,
        });
        break;
      }

      case "setmsg": {
        const msg = interaction.options.getString("mot", true);
        await prisma.wordFilterConfig.upsert({
          where: { guildId },
          update: { warnMessage: msg },
          create: { guildId, warnMessage: msg, enabled: true },
        });
        invalidateWordFilterCache(guildId);
        await interaction.editReply({ content: `✅ Message d'avertissement mis à jour.` });
        break;
      }

      case "view": {
        const config = await prisma.wordFilterConfig.findUnique({ where: { guildId } });
        const count = await prisma.wordFilterEntry.count({ where: { guildId } });

        const embed = new EmbedBuilder()
          .setTitle("⚙️ Configuration du filtre de mots")
          .setColor(0x2f3136)
          .addFields(
            { name: "Statut", value: config?.enabled ? "✅ Activé" : "❌ Désactivé" },
            { name: "Action", value: config?.action || "delete" },
            { name: "Message d'avertissement", value: config?.warnMessage || "(défaut)" },
            {
              name: "Salon de log",
              value: config?.logChannel ? `<#${config.logChannel}>` : "Non configuré",
            },
            { name: "Mots configurés", value: `${count}` },
          );

        await interaction.editReply({ embeds: [embed] });
        break;
      }

      case "clear": {
        await prisma.wordFilterEntry.deleteMany({ where: { guildId } });
        invalidateWordFilterCache(guildId);
        await interaction.editReply({ content: "✅ Tous les mots ont été supprimés du filtre." });
        break;
      }
    }
  } catch (error) {
    logger.error("[WordFilter] Erreur commande:", error);
    try {
      await interaction.editReply({ content: "❌ Une erreur est survenue." });
    } catch {}
  }
}
