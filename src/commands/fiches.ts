/**
 * /fiches — Cartes Discord par domaine (même chrome que le casier).
 */

import { SlashCommandBuilder, type ChatInputCommandInteraction } from "discord.js";
import { FICHE_DOMAINS, resolveDomainFiche } from "../services/domainFiches.js";

export const commands = [
  new SlashCommandBuilder()
    .setName("fiches")
    .setDescription("Fiches Discord par domaine (sécurité, gaming, retail…)")
    .addStringOption((option) =>
      option
        .setName("domaine")
        .setDescription("Domaine (vide = index)")
        .setRequired(false)
        .addChoices(...FICHE_DOMAINS.map((domain) => ({ name: domain.name, value: domain.id }))),
    )
    .addStringOption((option) =>
      option
        .setName("sujet")
        .setDescription("hibp, ssl, steam, digest, sante, nasa, multi…")
        .setRequired(false),
    )
    .addStringOption((option) =>
      option.setName("cible").setDescription("E-mail, hôte, URL, ville, jeu…").setRequired(false),
    )
    .addUserOption((option) =>
      option
        .setName("membre")
        .setDescription("Membre (signaux / mémoire / appel)")
        .setRequired(false),
    )
    .toJSON(),
];

export async function handleCommand(interaction: ChatInputCommandInteraction): Promise<void> {
  await interaction.deferReply();
  try {
    const { embeds } = await resolveDomainFiche({
      domain: interaction.options.getString("domaine") || undefined,
      sujet: interaction.options.getString("sujet") || undefined,
      query: interaction.options.getString("cible") || undefined,
      userId: interaction.options.getUser("membre")?.id,
      guildId: interaction.guildId ?? undefined,
      client: interaction.client,
    });
    await interaction.editReply({ embeds: embeds.slice(0, 10) });
  } catch (err) {
    await interaction.editReply({
      content:
        `Impossible d'afficher la fiche : ${err instanceof Error ? err.message : String(err)}`.slice(
          0,
          1800,
        ),
    });
  }
}
