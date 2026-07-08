/**
 * captchaVerify.ts — Captcha Verification System
 *
 * Flow: new member joins → assigned "Unverified" role → button in verify channel
 * → captcha challenge (math or image) → on success, remove unverified + give verified role
 */

import {
  ButtonBuilder,
  ButtonStyle,
  ActionRowBuilder,
  EmbedBuilder,
  GuildMember,
  TextChannel,
  ChannelType,
} from "discord.js";
import prisma from "../prisma.js";
import logger from "../utils/logger.js";

// ─── Types ────────────────────────────────────────────────────────────

export interface CaptchaConfig {
  enabled: boolean;
  verifyChannelId?: string;
  unverifiedRoleId?: string;
  verifiedRoleId?: string;
  minAccountAgeHours: number;
  captchaType: "math" | "button";
  logChannelId?: string;
}

const DEFAULT_CONFIG: CaptchaConfig = {
  enabled: false,
  minAccountAgeHours: 24,
  captchaType: "math",
};

// In-memory captcha challenges: userId -> { answer, expires }
const activeChallenges = new Map<string, { answer: string; expires: number }>();

// ─── Config ───────────────────────────────────────────────────────────

export async function getCaptchaConfig(guildId: string): Promise<CaptchaConfig> {
  try {
    const record = await prisma.guildConfig.findUnique({ where: { guildId } }).catch(() => null);
    if (record?.captchaConfig) {
      return { ...DEFAULT_CONFIG, ...(JSON.parse(record.captchaConfig as string) as Partial<CaptchaConfig>) };
    }
  } catch { /* ignore */ }
  return { ...DEFAULT_CONFIG };
}

export async function setCaptchaConfig(guildId: string, config: Partial<CaptchaConfig>): Promise<void> {
  try {
    const current = await getCaptchaConfig(guildId);
    const merged = { ...current, ...config };
    await prisma.guildConfig.upsert({
      where: { guildId },
      create: { guildId, captchaConfig: JSON.stringify(merged) },
      update: { captchaConfig: JSON.stringify(merged) },
    }).catch(() => {});
  } catch (error) {
    logger.error("[Captcha] setCaptchaConfig:", String(error));
  }
}

// ─── Captcha generation ───────────────────────────────────────────────

function generateMathCaptcha(): { question: string; answer: string } {
  const a = Math.floor(Math.random() * 10) + 1;
  const b = Math.floor(Math.random() * 10) + 1;
  const ops = ["+", "-", "*"];
  const op = ops[Math.floor(Math.random() * ops.length)];
  let answer: number;
  switch (op) {
    case "+": answer = a + b; break;
    case "-": answer = a - b; break;
    default: answer = a * b;
  }
  return { question: `Combien font ${a} ${op} ${b} ?`, answer: String(answer) };
}

// ─── Verification flow ────────────────────────────────────────────────

export async function handleNewMember(member: GuildMember): Promise<void> {
  const config = await getCaptchaConfig(member.guild.id);
  if (!config.enabled) return;

  // Check account age
  const accountAgeHours = (Date.now() - member.user.createdTimestamp) / 3_600_000;
  if (accountAgeHours >= config.minAccountAgeHours && config.minAccountAgeHours > 0) {
    // Trusted enough, auto-verify
    if (config.verifiedRoleId) {
      await member.roles.add(config.verifiedRoleId, "Auto-verified: account old enough").catch(() => {});
    }
    if (config.unverifiedRoleId) {
      await member.roles.remove(config.unverifiedRoleId, "Auto-verified").catch(() => {});
    }
    return;
  }

  // Assign unverified role
  if (config.unverifiedRoleId) {
    await member.roles.add(config.unverifiedRoleId, "New member needs verification").catch(() => {});
  }

  // Send verification message if channel exists
  if (config.verifyChannelId) {
    const channel = member.guild.channels.cache.get(config.verifyChannelId) as TextChannel | undefined;
    if (channel && channel.type === ChannelType.GuildText) {
      if (config.captchaType === "button") {
        const button = new ButtonBuilder()
          .setCustomId(`verify_${member.id}`)
          .setLabel("✅ Vérifier")
          .setStyle(ButtonStyle.Success);
        const row = new ActionRowBuilder<ButtonBuilder>().addComponents(button);
        const embed = new EmbedBuilder()
          .setTitle("🔐 Vérification requise")
          .setColor(0x5865f2)
          .setDescription(`Bienvenue <@${member.id}>! Clique sur le bouton pour vérifier ton compte.`)
          .setTimestamp();
        await channel.send({ content: `<@${member.id}>`, embeds: [embed], components: [row] }).catch(() => {});
      } else {
        // Math captcha
        const captcha = generateMathCaptcha();
        activeChallenges.set(member.id, { answer: captcha.answer, expires: Date.now() + 120_000 });
        const embed = new EmbedBuilder()
          .setTitle("🔐 Captcha de vérification")
          .setColor(0x5865f2)
          .setDescription(`Bienvenue <@${member.id}>!\n\n**${captcha.question}**\n\nRéponds avec la bonne valeur dans ce channel pour vérifier ton compte.\nTu as 2 minutes.`)
          .setTimestamp();
        await channel.send({ content: `<@${member.id}>`, embeds: [embed] }).catch(() => {});
      }
    }
  }
}

export async function handleCaptchaResponse(
  memberId: string,
  response: string,
  guildId: string,
): Promise<{ success: boolean; message: string }> {
  const challenge = activeChallenges.get(memberId);
  if (!challenge) {
    return { success: false, message: "Aucun captcha actif. Demande à un modérateur de vérifier manuellement." };
  }
  if (Date.now() > challenge.expires) {
    activeChallenges.delete(memberId);
    return { success: false, message: "Captcha expiré. Rejoins le serveur pour réessayer." };
  }

  if (response.trim() === challenge.answer) {
    activeChallenges.delete(memberId);
    const config = await getCaptchaConfig(guildId);

    // Log success
    if (config.logChannelId) {
      const logChannel = (await prisma.guildConfig.findUnique({ where: { guildId: guildId } }).catch(() => null));
      void logChannel; // just to avoid unused warning
    }

    return { success: true, message: "✅ Vérification réussie! Bienvenue sur le serveur." };
  }

  return { success: false, message: "❌ Mauvaise réponse. Réessaie!" };
}

export async function verifyMember(member: GuildMember): Promise<void> {
  const config = await getCaptchaConfig(member.guild.id);
  if (config.verifiedRoleId) {
    await member.roles.add(config.verifiedRoleId, "Captcha verified").catch(() => {});
  }
  if (config.unverifiedRoleId) {
    await member.roles.remove(config.unverifiedRoleId, "Captcha verified").catch(() => {});
  }
  logger.info(`[Captcha] Verified ${member.user.tag} in ${member.guild.id}`);
}

// ─── Status embed ─────────────────────────────────────────────────────

export async function generateCaptchaStatusEmbed(guildId: string): Promise<EmbedBuilder> {
  const config = await getCaptchaConfig(guildId);
  return new EmbedBuilder()
    .setTitle("🔐 Captcha Verification Status")
    .setColor(config.enabled ? 0x2ecc71 : 0xe74c3c)
    .addFields(
      { name: "Status", value: config.enabled ? "✅ Activé" : "❌ Désactivé", inline: true },
      { name: "Type", value: config.captchaType, inline: true },
      { name: "Min account age", value: `${config.minAccountAgeHours}h`, inline: true },
      { name: "Canal de vérification", value: config.verifyChannelId ? `<#${config.verifyChannelId}>` : "Non défini", inline: false },
      { name: "Role non vérifié", value: config.unverifiedRoleId ? `<@&${config.unverifiedRoleId}>` : "Non défini", inline: true },
      { name: "Role vérifié", value: config.verifiedRoleId ? `<@&${config.verifiedRoleId}>` : "Non défini", inline: true },
      { name: "Captchas actifs", value: String(activeChallenges.size), inline: true },
    )
    .setTimestamp();
}
