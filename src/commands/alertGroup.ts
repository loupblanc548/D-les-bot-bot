import { ChatInputCommandInteraction, SlashCommandBuilder, PermissionFlagsBits } from "discord.js";
import { handleCommand as handleAlertcenter } from "./alertcenter.js";
import { handleCommand as handleAdvanced } from "./advanced.js";

export const commands = [
  new SlashCommandBuilder()
    .setName("alert")
    .setDescription("Système d'alertes (centre, config, alertes groupées)")
    .setDefaultMemberPermissions(PermissionFlagsBits.ModerateMembers)
    // alertcenter subcommands
    .addSubcommand((sc) => sc.setName("pending").setDescription("Voir les alertes en attente"))
    .addSubcommand((sc) => sc.setName("history").setDescription("Voir l'historique des alertes"))
    .addSubcommand((sc) =>
      sc
        .setName("user")
        .setDescription("Voir les alertes d'un utilisateur")
        .addUserOption((o) => o.setName("cible").setDescription("L'utilisateur").setRequired(true)),
    )
    // alertconfig subcommands
    .addSubcommand((sc) =>
      sc
        .setName("channel")
        .setDescription("Définir le salon des alertes")
        .addChannelOption((o) =>
          o.setName("salon").setDescription("Salon de réception des alertes").setRequired(true),
        ),
    )
    .addSubcommand((sc) =>
      sc
        .setName("threshold")
        .setDescription("Définir le seuil de score pour les alertes")
        .addIntegerOption((o) =>
          o
            .setName("score")
            .setDescription("Score minimum (défaut: 30)")
            .setRequired(true)
            .setMinValue(10)
            .setMaxValue(100),
        ),
    )
    .addSubcommand((sc) =>
      sc
        .setName("owner_notify")
        .setDescription("Activer/désactiver les notifications propriétaires")
        .addBooleanOption((o) =>
          o.setName("actif").setDescription("Activer ou désactiver").setRequired(true),
        ),
    )
    .addSubcommand((sc) =>
      sc
        .setName("reset")
        .setDescription("Réinitialiser les alertes d'un utilisateur")
        .addUserOption((o) => o.setName("cible").setDescription("L'utilisateur").setRequired(true)),
    )
    .addSubcommand((sc) => sc.setName("view").setDescription("Voir la configuration actuelle"))
    // smart-alerts
    .addSubcommand((sc) =>
      sc
        .setName("smart")
        .setDescription("Gère les alertes groupées intelligentes")
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
            .setName("intervalle")
            .setDescription("Intervalle en secondes (défaut: 10)")
            .setRequired(false)
            .setMinValue(1)
            .setMaxValue(300),
        ),
    )
    .toJSON(),
];

// Subcommands that map to alertcenter (commandName = alertcenter)
const ALERTCENTER_SUBS = ["pending", "history", "user"];
// Subcommands that map to alertconfig (commandName = alertconfig)
const ALERTCONFIG_SUBS = ["channel", "threshold", "owner_notify", "reset", "view"];

export async function handleCommand(interaction: ChatInputCommandInteraction, client: unknown) {
  const action = interaction.options.getSubcommand();

  if (ALERTCENTER_SUBS.includes(action)) {
    Object.defineProperty(interaction, "commandName", { value: "alertcenter", writable: true });
    await handleAlertcenter(interaction);
  } else if (ALERTCONFIG_SUBS.includes(action)) {
    Object.defineProperty(interaction, "commandName", { value: "alertconfig", writable: true });
    await handleAlertcenter(interaction);
  } else if (action === "smart") {
    Object.defineProperty(interaction, "commandName", { value: "smart-alerts", writable: true });
    await handleAdvanced(interaction, client as import("discord.js").Client);
  }
}
