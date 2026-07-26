/**
 * gatekeeper.ts — Vérification gateway pour nouveaux membres
 *
 * Place les nouveaux membres dans un rôle "unverified" jusqu'à ce qu'ils
 * passent une vérification (captcha simple via bouton).
 */

import type { Guild, GuildMember, ButtonInteraction, TextChannel } from "discord.js";
import { ActionRowBuilder, ButtonBuilder, ButtonStyle, EmbedBuilder } from "discord.js";
import logger from "../utils/logger.js";

const UNVERIFIED_ROLE_NAME = "Non vérifié";
const VERIFIED_ROLE_NAME = "Vérifié";

export interface GatekeeperConfig {
  enabled: boolean;
  channelId: string;
  unverifiedRoleId: string;
  verifiedRoleId: string;
  welcomeMessage: string;
}

export async function setupGatekeeper(guild: Guild, config: GatekeeperConfig): Promise<void> {
  if (!config.enabled) return;

  // Ensure roles exist
  let unverifiedRole = guild.roles.cache.find((r) => r.name === UNVERIFIED_ROLE_NAME);
  if (!unverifiedRole) {
    unverifiedRole = await guild.roles.create({
      name: UNVERIFIED_ROLE_NAME,
      permissions: [],
      mentionable: false,
      reason: "Gatekeeper setup",
    });
  }

  let verifiedRole = guild.roles.cache.find((r) => r.name === VERIFIED_ROLE_NAME);
  if (!verifiedRole) {
    verifiedRole = await guild.roles.create({
      name: VERIFIED_ROLE_NAME,
      permissions: [],
      mentionable: false,
      reason: "Gatekeeper setup",
    });
  }

  logger.info(`[Gatekeeper] Roles ready: ${unverifiedRole.name}, ${verifiedRole.name}`);
}

export async function onMemberJoin(member: GuildMember, config: GatekeeperConfig): Promise<void> {
  if (!config.enabled) return;

  try {
    await member.roles.add(config.unverifiedRoleId, "Gatekeeper: nouveau membre non vérifié");

    const channel = member.guild.channels.cache.get(config.channelId) as TextChannel | undefined;
    if (channel) {
      const embed = new EmbedBuilder()
        .setTitle("Vérification requise")
        .setDescription(config.welcomeMessage || `Bienvenue ${member.user.tag}! Clique sur le bouton ci-dessous pour vérifier ton compte.`)
        .setColor(0x5865f2)
        .setThumbnail(member.user.displayAvatarURL());

      const row = new ActionRowBuilder<ButtonBuilder>().addComponents(
        new ButtonBuilder()
          .setCustomId(`gatekeeper_verify_${member.id}`)
          .setLabel("✅ Vérifier")
          .setStyle(ButtonStyle.Success),
      );

      await channel.send({ embeds: [embed], components: [row] });
    }
  } catch (err) {
    logger.warn(`[Gatekeeper] onMemberJoin failed: ${err instanceof Error ? err.message : String(err)}`);
  }
}

export async function handleVerifyButton(
  interaction: ButtonInteraction,
  config: GatekeeperConfig,
): Promise<void> {
  const userId = interaction.customId.replace("gatekeeper_verify_", "");
  if (interaction.user.id !== userId) {
    await interaction.reply({ content: "Ce bouton n'est pas pour toi!", ephemeral: true });
    return;
  }

  const member = await interaction.guild?.members.fetch(userId).catch(() => null);
  if (!member) return;

  try {
    await member.roles.remove(config.unverifiedRoleId, "Gatekeeper: vérifié");
    await member.roles.add(config.verifiedRoleId, "Gatekeeper: vérifié");
    await interaction.update({
      content: `✅ ${member.user.tag} a été vérifié!`,
      embeds: [],
      components: [],
    });
    logger.info(`[Gatekeeper] ${member.user.tag} verified in ${interaction.guildId}`);
  } catch (err) {
    logger.warn(`[Gatekeeper] Verify failed: ${err instanceof Error ? err.message : String(err)}`);
    await interaction.reply({ content: "Erreur lors de la vérification", ephemeral: true });
  }
}
