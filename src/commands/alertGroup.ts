import {
  ChatInputCommandInteraction,
  SlashCommandBuilder,
  PermissionFlagsBits,
  Client,
} from "discord.js";
import { handleCommand as handleAlertcenter } from "./alertcenter.js";
import { handleCommand as handleAdvanced } from "./advanced.js";
import { handleCommand as handleSecurityAudit } from "./security-audit.js";
import { handleCommand as handleModPro } from "./moderationPro.js";
import { handleCommand as handleExtraCmd } from "./extraCommands.js";

import { handleAlertExtra } from "./stubHandlers.js";

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
    .addSubcommand((sc) =>
      sc.setName("security-audit").setDescription("Audit sécurité des sanctions"),
    )
    .addSubcommand((sc) =>
      sc
        .setName("riskscore")
        .setDescription("Score de risque d'un utilisateur")
        .addUserOption((o) =>
          o.setName("cible").setDescription("L'utilisateur").setRequired(false),
        ),
    )
    .addSubcommand((sc) =>
      sc.setName("riskyusers").setDescription("Liste des utilisateurs à risque"),
    )
    .addSubcommand((sc) => sc.setName("spam-analysis").setDescription("Analyse de spam"))
    .addSubcommand((sc) => sc.setName("auto-report").setDescription("Rapport automatique"))
    .addSubcommand((sc) => sc.setName("viral-alert").setDescription("Alerte virale"))
    .addSubcommand((sc) =>
      sc
        .setName("alert-rules")
        .setDescription("Règles d'alerte personnalisées (admin)")
        .addStringOption((o) => o.setName("action").setDescription("Action").setRequired(true)),
    )
    // ─── Nouvelles sous-commandes alert ───
    .addSubcommand((sc) => sc.setName("alert-test").setDescription("Teste le système d'alerte"))
    .addSubcommand((sc) => sc.setName("alert-export").setDescription("Exporte les alertes en JSON"))
    .addSubcommand((sc) =>
      sc
        .setName("alert-whitelist")
        .setDescription("Whiteliste un utilisateur (plus d'alertes)")
        .addUserOption((o) => o.setName("cible").setDescription("L'utilisateur").setRequired(true)),
    )
    .addSubcommand((sc) =>
      sc
        .setName("alert-digest")
        .setDescription("Configure un digest périodique d'alertes")
        .addStringOption((o) =>
          o
            .setName("frequence")
            .setDescription("Fréquence (hourly/daily/weekly)")
            .setRequired(true),
        )
        .addChannelOption((o) =>
          o.setName("salon").setDescription("Salon de réception").setRequired(false),
        ),
    )
    .addSubcommand((sc) =>
      sc
        .setName("alert-ack")
        .setDescription("Acquitter une alerte spécifique")
        .addStringOption((o) => o.setName("id").setDescription("ID de l'alerte").setRequired(true)),
    )
    .addSubcommand((sc) =>
      sc
        .setName("alert-escalate")
        .setDescription("Escalader une alerte aux admins (DM)")
        .addStringOption((o) => o.setName("id").setDescription("ID de l'alerte").setRequired(true)),
    )
    .toJSON(),
];

// Subcommands that map to alertcenter (commandName = alertcenter)
const ALERTCENTER_SUBS = ["pending", "history", "user", "riskscore", "riskyusers"];
// Subcommands that map to alertconfig (commandName = alertconfig)
const ALERTCONFIG_SUBS = ["channel", "threshold", "owner_notify", "reset", "view"];
// Subcommands that map to advanced
const ADVANCED_SUBS = ["smart", "auto-report", "viral-alert"];

export async function handleCommand(interaction: ChatInputCommandInteraction, client: unknown) {
  const dc = client as Client;
  const action = interaction.options.getSubcommand();

  if (ALERTCENTER_SUBS.includes(action)) {
    Object.defineProperty(interaction, "commandName", {
      value: action === "riskscore" || action === "riskyusers" ? action : "alertcenter",
      writable: true,
    });
    await handleAlertcenter(interaction);
  } else if (ALERTCONFIG_SUBS.includes(action)) {
    Object.defineProperty(interaction, "commandName", { value: "alertconfig", writable: true });
    await handleAlertcenter(interaction);
  } else if (ADVANCED_SUBS.includes(action)) {
    const mapped = action === "smart" ? "smart-alerts" : action;
    Object.defineProperty(interaction, "commandName", { value: mapped, writable: true });
    await handleAdvanced(interaction, dc);
  } else if (action === "security-audit") {
    Object.defineProperty(interaction, "commandName", { value: "security-audit", writable: true });
    await handleSecurityAudit(interaction);
  } else if (action === "spam-analysis") {
    Object.defineProperty(interaction, "commandName", { value: "spam-analysis", writable: true });
    await handleModPro(interaction);
  } else if (action === "alert-rules") {
    Object.defineProperty(interaction, "commandName", { value: "alert-rules", writable: true });
    await handleExtraCmd(interaction, dc);
  } else {
    await handleAlertExtra(interaction, dc);
  }
}
