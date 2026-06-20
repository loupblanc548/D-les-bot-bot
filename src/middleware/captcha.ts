import logger from "../utils/logger.js";
import { GuildMember, MessageFlags } from "discord.js";
import prisma from "../prisma.js";

const CAPTCHA_TIMEOUT = 5 * 60 * 1000;

export async function verifyCaptcha(member: GuildMember): Promise<boolean> {
  try {
    const existingVerification = await prisma.captchaVerification.findUnique({
      where: { userId: member.id },
    });

    if (existingVerification && existingVerification.verified) {
      return true;
    }

    const code = generateCaptchaCode();
    const expiresAt = new Date(Date.now() + CAPTCHA_TIMEOUT);

    await prisma.captchaVerification.upsert({
      where: { userId: member.id },
      update: { code, expiresAt, verified: false, attempts: 0 },
      create: {
        userId: member.id,
        guildId: member.guild.id,
        code,
        expiresAt,
        verified: false,
        attempts: 0,
      },
    });

    await member.send({
      content: `🔐 Vérification requise\n\nPour accéder au serveur, veuillez répondre avec ce code: **${code}**\n\nCe code expire dans 5 minutes.`,
    });

    logger.info(`[Captcha] Verification sent to ${member.id}`);
    return false;
  } catch (error) {
    logger.error("[Captcha] Error:", error);
    return false;
  }
}

export async function checkCaptchaAnswer(userId: string, answer: string): Promise<boolean> {
  try {
    const verification = await prisma.captchaVerification.findUnique({
      where: { userId },
    });

    if (!verification) {
      return false;
    }

    if (verification.verified) {
      return true;
    }

    if (new Date() > verification.expiresAt) {
      await prisma.captchaVerification.delete({ where: { userId } });
      return false;
    }

    if (verification.attempts >= 3) {
      await prisma.captchaVerification.delete({ where: { userId } });
      return false;
    }

    if (answer === verification.code) {
      await prisma.captchaVerification.update({
        where: { userId },
        data: { verified: true },
      });
      return true;
    }

    await prisma.captchaVerification.update({
      where: { userId },
      data: { attempts: { increment: 1 } },
    });

    return false;
  } catch (error) {
    logger.error("[Captcha] Error checking answer:", error);
    return false;
  }
}

function generateCaptchaCode(): string {
  const chars = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789";
  let code = "";
  for (let i = 0; i < 6; i++) {
    code += chars.charAt(Math.floor(Math.random() * chars.length));
  }
  return code;
}
