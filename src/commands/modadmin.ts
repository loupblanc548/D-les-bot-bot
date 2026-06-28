/**
 * modadmin.ts — Commandes /modadmin (administration & modération avancée)
 *
 * Subcommands (17) :
 *  /modadmin mass-move <destination>     — Déplace tous les membres vocaux
 *  /modadmin voice-kick <cible>          — Expulse un membre du vocal
 *  /modadmin unban <id>                  — Révoque un ban
 *  /modadmin ban-all <ids>               — Ban en masse depuis liste d'IDs
 *  /modadmin mass-unban                  — Révoque tous les bans
 *  /modadmin mute-list                   — Liste des membres mute
 *  /modadmin warn-list <cible>           — Liste les warns d'un membre
 *  /modadmin warn-remove <id>            — Supprime un warn
 *  /modadmin warn-reset <cible>          — Réinitialise les warns
 *  /modadmin lockdown [raison]           — Verrouille tous les salons
 *  /modadmin unlock-all                  — Déverrouille tous les salons
 *  /modadmin dehoist                     — Retire les caractères spéciaux des pseudos
 *  /modadmin nickname-force <cible>      — Force un pseudo
 *  /modadmin nickname-reset <cible>      — Réinitialise un pseudo
 *  /modadmin inrole <rôle>               — Liste les membres d'un rôle
 *  /modadmin role-all <rôle>             — Donne un rôle à tous
 *  /modadmin role-remove-all <rôle>      — Retire un rôle à tous
 */

import {
  ChatInputCommandInteraction,
  SlashCommandBuilder,
  PermissionFlagsBits,
  Client,
} from "discord.js";
import { handleCommand as handleModPro } from "./moderationPro.js";
import { handleModExtra as handleModStub } from "./stubHandlers.js";

export const commands = [
  new SlashCommandBuilder()
    .setName("modadmin")
    .setDescription("🔧 Administration & modération avancée")
    .setDefaultMemberPermissions(PermissionFlagsBits.ManageGuild)
    .addSubcommand((sc) =>
      sc
        .setName("mass-move")
        .setDescription("Déplace tous les membres vocaux vers un autre salon")
        .addChannelOption((o) =>
          o.setName("destination").setDescription("Salon vocal de destination").setRequired(true),
        ),
    )
    .addSubcommand((sc) =>
      sc
        .setName("voice-kick")
        .setDescription("Expulse un membre du vocal")
        .addUserOption((o) => o.setName("cible").setDescription("Le membre").setRequired(true)),
    )
    .addSubcommand((sc) =>
      sc
        .setName("unban")
        .setDescription("Révoque un ban")
        .addStringOption((o) => o.setName("id").setDescription("ID Discord").setRequired(true))
        .addStringOption((o) => o.setName("raison").setDescription("Raison").setRequired(false)),
    )
    .addSubcommand((sc) =>
      sc
        .setName("ban-all")
        .setDescription("Ban en masse depuis une liste d'IDs")
        .addStringOption((o) =>
          o.setName("ids").setDescription("IDs séparés par virgule/espace").setRequired(true),
        )
        .addStringOption((o) => o.setName("raison").setDescription("Raison").setRequired(false)),
    )
    .addSubcommand((sc) =>
      sc.setName("mass-unban").setDescription("Révoque tous les bans du serveur"),
    )
    .addSubcommand((sc) =>
      sc.setName("mute-list").setDescription("Liste des membres actuellement mute"),
    )
    .addSubcommand((sc) =>
      sc
        .setName("warn-list")
        .setDescription("Liste les warns d'un membre")
        .addUserOption((o) => o.setName("cible").setDescription("Le membre").setRequired(true)),
    )
    .addSubcommand((sc) =>
      sc
        .setName("warn-remove")
        .setDescription("Supprime un warn spécifique")
        .addIntegerOption((o) => o.setName("id").setDescription("ID du warn").setRequired(true)),
    )
    .addSubcommand((sc) =>
      sc
        .setName("warn-reset")
        .setDescription("Réinitialise tous les warns d'un membre")
        .addUserOption((o) => o.setName("cible").setDescription("Le membre").setRequired(true)),
    )
    .addSubcommand((sc) =>
      sc
        .setName("lockdown")
        .setDescription("Verrouille tous les salons du serveur")
        .addStringOption((o) => o.setName("raison").setDescription("Raison").setRequired(false)),
    )
    .addSubcommand((sc) =>
      sc.setName("unlock-all").setDescription("Déverrouille tous les salons"),
    )
    .addSubcommand((sc) =>
      sc.setName("dehoist").setDescription("Retire les caractères spéciaux des pseudos"),
    )
    .addSubcommand((sc) =>
      sc
        .setName("nickname-force")
        .setDescription("Force un pseudo à un membre")
        .addUserOption((o) => o.setName("cible").setDescription("Le membre").setRequired(true))
        .addStringOption((o) => o.setName("pseudo").setDescription("Nouveau pseudo").setRequired(true)),
    )
    .addSubcommand((sc) =>
      sc
        .setName("nickname-reset")
        .setDescription("Réinitialise le pseudo d'un membre")
        .addUserOption((o) => o.setName("cible").setDescription("Le membre").setRequired(true)),
    )
    .addSubcommand((sc) =>
      sc
        .setName("inrole")
        .setDescription("Liste les membres ayant un rôle")
        .addRoleOption((o) => o.setName("rôle").setDescription("Le rôle").setRequired(true)),
    )
    .addSubcommand((sc) =>
      sc
        .setName("role-all")
        .setDescription("Donne un rôle à tous les membres")
        .addRoleOption((o) => o.setName("rôle").setDescription("Le rôle").setRequired(true)),
    )
    .addSubcommand((sc) =>
      sc
        .setName("role-remove-all")
        .setDescription("Retire un rôle à tous les membres")
        .addRoleOption((o) => o.setName("rôle").setDescription("Le rôle").setRequired(true)),
    )
    .toJSON(),
];

export async function handleCommand(interaction: ChatInputCommandInteraction, client: Client) {
  const action = interaction.options.getSubcommand();
  Object.defineProperty(interaction, "commandName", { value: action, writable: true });

  if (action === "mass-move" || action === "voice-kick") {
    await handleModPro(interaction);
  } else {
    await handleModStub(interaction, client);
  }
}
