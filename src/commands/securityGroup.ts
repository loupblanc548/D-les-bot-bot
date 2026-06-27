import {
  ChatInputCommandInteraction,
  SlashCommandBuilder,
  PermissionFlagsBits,
  Client,
} from "discord.js";
import { handleCommand as handleSecurityCore } from "./security/core.js";
import { handleCommand as handleExtraCmd } from "./extraCommands.js";

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
    .toJSON(),
];

export async function handleCommand(interaction: ChatInputCommandInteraction, client: Client) {
  const action = interaction.options.getSubcommand();
  Object.defineProperty(interaction, "commandName", { value: action, writable: true });

  // Les commandes alt-link, ban-log, behavior-timeline, alert-rules sont dans extraCommands
  const extraCmds = ["alt-link", "ban-log", "behavior-timeline", "alert-rules"];
  if (extraCmds.includes(action)) {
    await handleExtraCmd(interaction, client);
  } else {
    await handleSecurityCore(interaction, client);
  }
}
