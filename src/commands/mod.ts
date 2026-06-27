import {
  ChatInputCommandInteraction,
  SlashCommandBuilder,
  PermissionFlagsBits,
  Client,
} from "discord.js";
import { handleCommand as handleModeration } from "./moderation.js";

export const commands = [
  new SlashCommandBuilder()
    .setName("mod")
    .setDescription("Commandes de modération (ban, kick, mute, warn, clear, etc.)")
    .setDefaultMemberPermissions(PermissionFlagsBits.ModerateMembers)
    // ── Sanctions ──
    .addSubcommand((sc) =>
      sc
        .setName("warn")
        .setDescription("Avertir un membre")
        .addUserOption((o) =>
          o.setName("cible").setDescription("Le membre à avertir").setRequired(true),
        )
        .addStringOption((o) =>
          o.setName("raison").setDescription("Raison de l'avertissement").setRequired(false),
        ),
    )
    .addSubcommand((sc) =>
      sc
        .setName("mute")
        .setDescription("Rendre muet un membre (timeout Discord, longue durée)")
        .addUserOption((o) =>
          o.setName("cible").setDescription("Le membre à mute").setRequired(true),
        )
        .addIntegerOption((o) =>
          o
            .setName("duree")
            .setDescription("Durée en minutes (max 40320 = 28 jours)")
            .setRequired(true)
            .setMinValue(1)
            .setMaxValue(40320),
        )
        .addStringOption((o) =>
          o.setName("raison").setDescription("Raison du mute").setRequired(false),
        ),
    )
    .addSubcommand((sc) =>
      sc
        .setName("unmute")
        .setDescription("Retirer le timeout d'un membre")
        .addUserOption((o) =>
          o.setName("cible").setDescription("Le membre à unmute").setRequired(true),
        ),
    )
    .addSubcommand((sc) =>
      sc
        .setName("kick")
        .setDescription("Expulser un membre du serveur")
        .addUserOption((o) =>
          o.setName("cible").setDescription("Le membre à expulser").setRequired(true),
        )
        .addStringOption((o) =>
          o.setName("raison").setDescription("Raison de l'expulsion").setRequired(false),
        ),
    )
    .addSubcommand((sc) =>
      sc
        .setName("ban")
        .setDescription("Bannir un membre du serveur")
        .addUserOption((o) =>
          o.setName("cible").setDescription("Le membre à bannir").setRequired(true),
        )
        .addIntegerOption((o) =>
          o
            .setName("jours")
            .setDescription("Jours de messages à supprimer (1-7, défaut: 7)")
            .setRequired(false)
            .setMinValue(1)
            .setMaxValue(7),
        )
        .addStringOption((o) =>
          o.setName("raison").setDescription("Raison du bannissement").setRequired(false),
        ),
    )
    .addSubcommand((sc) =>
      sc
        .setName("timeout")
        .setDescription("Mettre un membre en timeout (court terme, secondes)")
        .addUserOption((o) =>
          o.setName("cible").setDescription("Le membre à timeout").setRequired(true),
        )
        .addIntegerOption((o) =>
          o
            .setName("duree")
            .setDescription("Durée en secondes (max 3600 = 1h)")
            .setRequired(true)
            .setMinValue(1)
            .setMaxValue(3600),
        ),
    )
    // ── Salon ──
    .addSubcommand((sc) =>
      sc
        .setName("clear")
        .setDescription("Supprimer un lot de messages dans le salon")
        .addIntegerOption((o) =>
          o
            .setName("nombre")
            .setDescription("Nombre de messages à supprimer (1-100)")
            .setRequired(true)
            .setMinValue(1)
            .setMaxValue(100),
        ),
    )
    .addSubcommand((sc) => sc.setName("unlock").setDescription("Déverrouiller le salon"))
    .addSubcommand((sc) =>
      sc
        .setName("purge")
        .setDescription("Supprime les messages d'un utilisateur")
        .addUserOption((o) =>
          o.setName("cible").setDescription("L'utilisateur cible").setRequired(true),
        )
        .addIntegerOption((o) =>
          o
            .setName("nombre")
            .setDescription("Nombre de messages à supprimer (1-100)")
            .setRequired(true)
            .setMinValue(1)
            .setMaxValue(100),
        ),
    )
    // ── Utilitaires ──
    .addSubcommand((sc) =>
      sc
        .setName("history")
        .setDescription("Affiche l'historique des messages récents d'un utilisateur")
        .addUserOption((o) =>
          o.setName("cible").setDescription("L'utilisateur cible").setRequired(true),
        )
        .addIntegerOption((o) =>
          o
            .setName("nombre")
            .setDescription("Nombre de messages à afficher (1-50)")
            .setRequired(false)
            .setMinValue(1)
            .setMaxValue(50),
        ),
    )
    .toJSON(),
];

export async function handleCommand(interaction: ChatInputCommandInteraction, client: Client) {
  const action = interaction.options.getSubcommand();
  // Override commandName so the existing handler routes correctly
  Object.defineProperty(interaction, "commandName", { value: action, writable: true });
  await handleModeration(interaction, client);
}
