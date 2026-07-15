/**
 * debugGroup.ts — Commandes /debug (debug & hotreload, admin only)
 *
 * Subcommands (8) :
 *  /debug status       — Statut complet du bot
 *  /debug services     — État des services externes
 *  /debug database     — Test connexion DB
 *  /debug memory       — Utilisation mémoire
 *  /debug reload       — Recharge commandes et config
 *  /debug maintenance  — Mode maintenance
 *  /debug auto         — Auto-reload
 *  /debug hotreload-status — Statut du hot reload
 */

import {
  ChatInputCommandInteraction,
  SlashCommandBuilder,
  PermissionFlagsBits,
  Client,
} from "discord.js";
import { execute as executeDebug } from "./debug.js";
import { execute as executeHotreload } from "./hotreload.js";
import { registerCommands } from "../commandRouter.js";

export const commands = [
  new SlashCommandBuilder()
    .setName("debug")
    .setDescription("🔧 Debug & hotreload (admin uniquement)")
    .setDefaultMemberPermissions(PermissionFlagsBits.Administrator)
    .addSubcommand((sc) => sc.setName("status").setDescription("Debug: statut complet du bot"))
    .addSubcommand((sc) =>
      sc.setName("services").setDescription("Debug: état des services externes"),
    )
    .addSubcommand((sc) => sc.setName("database").setDescription("Debug: test connexion DB"))
    .addSubcommand((sc) => sc.setName("memory").setDescription("Debug: utilisation mémoire"))
    .addSubcommand((sc) =>
      sc.setName("reload").setDescription("Hotreload: recharge commandes et config"),
    )
    .addSubcommand((sc) =>
      sc
        .setName("maintenance")
        .setDescription("Hotreload: mode maintenance")
        .addBooleanOption((o) =>
          o.setName("enable").setDescription("Activer ou non").setRequired(true),
        ),
    )
    .addSubcommand((sc) =>
      sc
        .setName("auto")
        .setDescription("Hotreload: auto-reload")
        .addBooleanOption((o) =>
          o.setName("enable").setDescription("Activer ou non").setRequired(true),
        ),
    )
    .addSubcommand((sc) =>
      sc.setName("hotreload-status").setDescription("Hotreload: statut du hot reload"),
    )
    .addSubcommand((sc) =>
      sc
        .setName("register")
        .setDescription("Force l'enregistrement des commandes slash sur Discord"),
    )
    .toJSON(),
];

const DEBUG_SUBS = ["status", "services", "database", "memory"];
const HOTRELOAD_SUBS = ["reload", "maintenance", "auto", "hotreload-status"];

export async function handleCommand(interaction: ChatInputCommandInteraction, client: unknown) {
  const dc = client as Client;
  const action = interaction.options.getSubcommand();

  if (action === "register") {
    await interaction.editReply({ content: "⏳ Enregistrement des commandes sur Discord..." });
    try {
      await registerCommands();
      await interaction.editReply({ content: "✅ Commandes enregistrées avec succès !" });
    } catch (err) {
      await interaction.editReply({
        content: `❌ Erreur: ${err instanceof Error ? err.message : String(err)}`,
      });
    }
    return;
  }

  if (DEBUG_SUBS.includes(action)) {
    await executeDebug(interaction, dc);
  } else if (HOTRELOAD_SUBS.includes(action)) {
    const sub = action === "hotreload-status" ? "status" : action;
    const patched = patchSubcommand(interaction, sub);
    await executeHotreload(patched, dc);
  }
}

function patchSubcommand(
  interaction: ChatInputCommandInteraction,
  sub: string,
): ChatInputCommandInteraction {
  const _origGetSubcommand = interaction.options.getSubcommand.bind(interaction.options);
  interaction.options.getSubcommand = (() => sub) as typeof interaction.options.getSubcommand;
  return interaction;
}
