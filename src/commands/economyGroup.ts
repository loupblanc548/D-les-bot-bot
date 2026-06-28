/**
 * economyGroup.ts — Économie & niveaux (sous-commandes)
 */
import { ChatInputCommandInteraction, SlashCommandBuilder, Client } from "discord.js";
import { handleEconomy } from "./stubHandlers.js";

export const commands = [
  new SlashCommandBuilder()
    .setName("economy")
    .setDescription("Économie, crédits et système de niveaux")
    .addSubcommand((sc) =>
      sc
        .setName("balance")
        .setDescription("Ton solde de crédits")
        .addUserOption((o) => o.setName("cible").setDescription("Voir le solde d'un autre").setRequired(false)),
    )
    .addSubcommand((sc) => sc.setName("daily").setDescription("Récompense quotidienne"))
    .addSubcommand((sc) => sc.setName("weekly").setDescription("Récompense hebdomadaire"))
    .addSubcommand((sc) => sc.setName("work").setDescription("Travaille pour gagner des crédits"))
    .addSubcommand((sc) =>
      sc
        .setName("gamble")
        .setDescription("Parie tes crédits")
        .addIntegerOption((o) => o.setName("montant").setDescription("Montant à parier").setRequired(true).setMinValue(1)),
    )
    .addSubcommand((sc) => sc.setName("shop").setDescription("Boutique du serveur"))
    .addSubcommand((sc) =>
      sc
        .setName("buy")
        .setDescription("Achète un item")
        .addStringOption((o) => o.setName("item").setDescription("Nom de l'item").setRequired(true)),
    )
    .addSubcommand((sc) =>
      sc
        .setName("sell")
        .setDescription("Vends un item")
        .addStringOption((o) => o.setName("item").setDescription("Nom de l'item").setRequired(true)),
    )
    .addSubcommand((sc) => sc.setName("inventory").setDescription("Ton inventaire"))
    .addSubcommand((sc) =>
      sc
        .setName("transfer")
        .setDescription("Donne des crédits à un membre")
        .addUserOption((o) => o.setName("cible").setDescription("Destinataire").setRequired(true))
        .addIntegerOption((o) => o.setName("montant").setDescription("Montant").setRequired(true).setMinValue(1)),
    )
    .addSubcommand((sc) => sc.setName("leaderboard").setDescription("Classement des plus riches"))
    .addSubcommand((sc) => sc.setName("level").setDescription("Ton niveau et XP"))
    .addSubcommand((sc) =>
      sc
        .setName("rank")
        .setDescription("Ton rang")
        .addUserOption((o) => o.setName("cible").setDescription("Voir le rang d'un autre").setRequired(false)),
    )
    .addSubcommand((sc) => sc.setName("rank-card").setDescription("Carte de rang personnalisée"))
    .addSubcommand((sc) =>
      sc
        .setName("xp-config")
        .setDescription("Configuration du système XP (admin)"),
    )
    .toJSON(),
];

export async function handleCommand(interaction: ChatInputCommandInteraction, client: Client): Promise<void> {
  await handleEconomy(interaction, client);
}
