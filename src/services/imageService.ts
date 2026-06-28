/**
 * imageService.ts — Génération d'images avec @napi-rs/canvas
 *
 * - Images de bienvenue/départ
 * - Cartes de rang (rank cards)
 * - Avatars arrondis
 */

import { createCanvas, loadImage, SKRSContext2D } from "@napi-rs/canvas";
import { GuildMember } from "discord.js";
import logger from "../utils/logger.js";

const WIDTH = 934;
const HEIGHT = 282;
const AVATAR_SIZE = 200;

export async function generateWelcomeImage(
  member: GuildMember,
  options?: { title?: string; subtitle?: string; backgroundUrl?: string },
): Promise<Buffer> {
  try {
    const canvas = createCanvas(WIDTH, HEIGHT);
    const ctx = canvas.getContext("2d");

    // Fond
    if (options?.backgroundUrl) {
      try {
        const bg = await loadImage(options.backgroundUrl);
        ctx.drawImage(bg, 0, 0, WIDTH, HEIGHT);
      } catch {
        drawGradientBg(ctx);
      }
    } else {
      drawGradientBg(ctx);
    }

    // Overlay sombre
    ctx.fillStyle = "rgba(0, 0, 0, 0.5)";
    ctx.fillRect(0, 0, WIDTH, HEIGHT);

    // Avatar
    const avatarUrl = member.user.displayAvatarURL({ extension: "png", size: 256 });
    try {
      const avatar = await loadImage(avatarUrl);
      const avatarX = 50;
      const avatarY = (HEIGHT - AVATAR_SIZE) / 2;

      ctx.save();
      ctx.beginPath();
      ctx.arc(avatarX + AVATAR_SIZE / 2, avatarY + AVATAR_SIZE / 2, AVATAR_SIZE / 2, 0, Math.PI * 2);
      ctx.closePath();
      ctx.clip();
      ctx.drawImage(avatar, avatarX, avatarY, AVATAR_SIZE, AVATAR_SIZE);
      ctx.restore();

      // Bordure avatar
      ctx.strokeStyle = "#5865f2";
      ctx.lineWidth = 5;
      ctx.beginPath();
      ctx.arc(avatarX + AVATAR_SIZE / 2, avatarY + AVATAR_SIZE / 2, AVATAR_SIZE / 2, 0, Math.PI * 2);
      ctx.closePath();
      ctx.stroke();
    } catch {
      // ignore avatar errors
    }

    // Texte
    const title = options?.title || `Bienvenue ${member.user.username} !`;
    const subtitle = options?.subtitle || `Tu es le membre #${member.guild.memberCount} sur ${member.guild.name}`;

    ctx.fillStyle = "#ffffff";
    ctx.font = "bold 36px Sans";
    ctx.textAlign = "left";
    ctx.fillText(truncate(ctx, title, WIDTH - AVATAR_SIZE - 100), 300, 110);

    ctx.fillStyle = "#b9bbbe";
    ctx.font = "24px Sans";
    ctx.fillText(truncate(ctx, subtitle, WIDTH - AVATAR_SIZE - 100), 300, 160);

    return canvas.toBuffer("image/png");
  } catch (error) {
    logger.error("[ImageService] Welcome image error:", error);
    return generateFallbackImage("Bienvenue !");
  }
}

export async function generateGoodbyeImage(
  member: GuildMember,
  options?: { title?: string; subtitle?: string },
): Promise<Buffer> {
  try {
    const canvas = createCanvas(WIDTH, HEIGHT);
    const ctx = canvas.getContext("2d");

    drawGradientBg(ctx, true);

    ctx.fillStyle = "rgba(0, 0, 0, 0.5)";
    ctx.fillRect(0, 0, WIDTH, HEIGHT);

    const avatarUrl = member.user.displayAvatarURL({ extension: "png", size: 256 });
    try {
      const avatar = await loadImage(avatarUrl);
      const avatarX = 50;
      const avatarY = (HEIGHT - AVATAR_SIZE) / 2;

      ctx.save();
      ctx.beginPath();
      ctx.arc(avatarX + AVATAR_SIZE / 2, avatarY + AVATAR_SIZE / 2, AVATAR_SIZE / 2, 0, Math.PI * 2);
      ctx.closePath();
      ctx.clip();
      ctx.drawImage(avatar, avatarX, avatarY, AVATAR_SIZE, AVATAR_SIZE);
      ctx.restore();

      ctx.strokeStyle = "#ed4245";
      ctx.lineWidth = 5;
      ctx.beginPath();
      ctx.arc(avatarX + AVATAR_SIZE / 2, avatarY + AVATAR_SIZE / 2, AVATAR_SIZE / 2, 0, Math.PI * 2);
      ctx.closePath();
      ctx.stroke();
    } catch {
      // ignore
    }

    const title = options?.title || `Au revoir ${member.user.username} !`;
    const subtitle = options?.subtitle || `Nous sommes maintenant ${member.guild.memberCount} membres`;

    ctx.fillStyle = "#ffffff";
    ctx.font = "bold 36px Sans";
    ctx.textAlign = "left";
    ctx.fillText(truncate(ctx, title, WIDTH - AVATAR_SIZE - 100), 300, 110);

    ctx.fillStyle = "#b9bbbe";
    ctx.font = "24px Sans";
    ctx.fillText(truncate(ctx, subtitle, WIDTH - AVATAR_SIZE - 100), 300, 160);

    return canvas.toBuffer("image/png");
  } catch (error) {
    logger.error("[ImageService] Goodbye image error:", error);
    return generateFallbackImage("Au revoir !");
  }
}

export async function generateRankCard(opts: {
  username: string;
  avatarUrl: string;
  level: number;
  xp: number;
  xpNeeded: number;
  rank: number;
  color?: string;
}): Promise<Buffer> {
  try {
    const canvas = createCanvas(934, 282);
    const ctx = canvas.getContext("2d");

    // Fond
    drawGradientBg(ctx);
    ctx.fillStyle = "rgba(0, 0, 0, 0.7)";
    ctx.fillRect(0, 0, 934, 282);

    // Avatar
    const avatar = await loadImage(opts.avatarUrl);
    const avatarX = 50;
    const avatarY = 41;

    ctx.save();
    ctx.beginPath();
    ctx.arc(avatarX + 100, avatarY + 100, 100, 0, Math.PI * 2);
    ctx.closePath();
    ctx.clip();
    ctx.drawImage(avatar, avatarX, avatarY, 200, 200);
    ctx.restore();

    ctx.strokeStyle = opts.color || "#5865f2";
    ctx.lineWidth = 5;
    ctx.beginPath();
    ctx.arc(avatarX + 100, avatarY + 100, 100, 0, Math.PI * 2);
    ctx.closePath();
    ctx.stroke();

    // Username
    ctx.fillStyle = "#ffffff";
    ctx.font = "bold 32px Sans";
    ctx.textAlign = "left";
    ctx.fillText(truncate(ctx, opts.username, 400), 300, 100);

    // Stats
    ctx.fillStyle = "#b9bbbe";
    ctx.font = "22px Sans";
    ctx.fillText(`Niveau ${opts.level}  •  Rang #${opts.rank}`, 300, 135);

    // Barre XP
    const barX = 300;
    const barY = 170;
    const barWidth = 580;
    const barHeight = 30;

    // Fond de la barre
    ctx.fillStyle = "#4f545c";
    ctx.beginPath();
    ctx.roundRect(barX, barY, barWidth, barHeight, 15);
    ctx.fill();

    // Progression
    const progress = Math.min(1, opts.xp / opts.xpNeeded);
    const fillWidth = Math.max(barHeight, barWidth * progress);

    ctx.fillStyle = opts.color || "#5865f2";
    ctx.beginPath();
    ctx.roundRect(barX, barY, fillWidth, barHeight, 15);
    ctx.fill();

    // Texte XP
    ctx.fillStyle = "#ffffff";
    ctx.font = "18px Sans";
    ctx.textAlign = "center";
    ctx.fillText(`${opts.xp} / ${opts.xpNeeded} XP`, barX + barWidth / 2, barY + barHeight + 25);

    return canvas.toBuffer("image/png");
  } catch (error) {
    logger.error("[ImageService] Rank card error:", error);
    return generateFallbackImage("Rank Card");
  }
}

// ─── Helpers ─────────────────────────────────────────────────────────────────

function drawGradientBg(ctx: SKRSContext2D, dark = false) {
  const gradient = ctx.createLinearGradient(0, 0, WIDTH, HEIGHT);
  if (dark) {
    gradient.addColorStop(0, "#2d2d3f");
    gradient.addColorStop(1, "#1a1a2e");
  } else {
    gradient.addColorStop(0, "#5865f2");
    gradient.addColorStop(1, "#3b44a8");
  }
  ctx.fillStyle = gradient;
  ctx.fillRect(0, 0, WIDTH, HEIGHT);
}

function truncate(ctx: SKRSContext2D, text: string, maxWidth: number): string {
  if (ctx.measureText(text).width <= maxWidth) return text;
  let truncated = text;
  while (ctx.measureText(truncated + "...").width > maxWidth && truncated.length > 0) {
    truncated = truncated.slice(0, -1);
  }
  return truncated + "...";
}

function generateFallbackImage(text: string): Buffer {
  const canvas = createCanvas(400, 100);
  const ctx = canvas.getContext("2d");
  ctx.fillStyle = "#5865f2";
  ctx.fillRect(0, 0, 400, 100);
  ctx.fillStyle = "#ffffff";
  ctx.font = "bold 24px Sans";
  ctx.textAlign = "center";
  ctx.fillText(text, 200, 55);
  return canvas.toBuffer("image/png");
}
