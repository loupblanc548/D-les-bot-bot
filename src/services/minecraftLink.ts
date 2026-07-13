/**
 * minecraftLink.ts — Liaison compte Minecraft ↔ Discord
 *
 * Système de vérification en 2 étapes :
 * 1. L'utilisateur tape /mc link <gamertag> sur Discord → génère un code
 * 2. L'utilisateur tape /verify <code> dans le chat Minecraft → valide la liaison
 *
 * Stats via l'API PlayerDB (gratuite, sans clé API).
 */

import { randomBytes } from "crypto";
import prisma from "../prisma.js";
import logger from "../utils/logger.js";

const VERIFY_CODE_EXPIRY_MINUTES = 10;
const PLAYERDB_API = "https://playerdb.co/api/player";

export interface MinecraftLinkResult {
  success: boolean;
  message: string;
  code?: string;
}

export interface MinecraftPlayerStats {
  username: string;
  uuid: string;
  platform: "java" | "bedrock";
  avatarUrl: string;
  skinUrl: string;
  nameHistory?: Array<{ name: string; changedToAt?: number }>;
}

/**
 * Génère un code de vérification aléatoire à 6 caractères.
 */
function generateCode(): string {
  return randomBytes(3).toString("hex").toUpperCase();
}

/**
 * Démarre la liaison d'un compte Minecraft.
 * L'utilisateur doit ensuite taper le code dans le chat Minecraft.
 */
export async function startLink(
  discordUserId: string,
  gamertag: string,
): Promise<MinecraftLinkResult> {
  const normalizedGamertag = gamertag.trim();
  if (normalizedGamertag.length < 3 || normalizedGamertag.length > 16) {
    return { success: false, message: "Le gamertag doit faire entre 3 et 16 caractères." };
  }

  // Vérifier si l'utilisateur a déjà un compte lié
  const existing = await prisma.minecraftProfile.findUnique({
    where: { userId: discordUserId },
  });

  if (existing?.verified) {
    return {
      success: false,
      message: `Tu as déjà un compte Minecraft lié : **${existing.gamertag}**. Utilise \`/mc unlink\` pour le détacher d'abord.`,
    };
  }

  const code = generateCode();
  const expires = new Date(Date.now() + VERIFY_CODE_EXPIRY_MINUTES * 60 * 1000);

  if (existing) {
    await prisma.minecraftProfile.update({
      where: { userId: discordUserId },
      data: {
        gamertag: normalizedGamertag,
        verifyCode: code,
        verifyExpires: expires,
        verified: false,
      },
    });
  } else {
    await prisma.minecraftProfile.create({
      data: {
        userId: discordUserId,
        gamertag: normalizedGamertag,
        verifyCode: code,
        verifyExpires: expires,
      },
    });
  }

  logger.info(
    `[MCLink] Liaison démarrée pour ${discordUserId} → ${normalizedGamertag}, code ${code}`,
  );

  return {
    success: true,
    message: `Liaison démarrée pour **${normalizedGamertag}**.`,
    code,
  };
}

/**
 * Vérifie un code saisi dans le chat Minecraft.
 * Appelé par le bot Minecraft quand il voit "/verify <code>" dans le chat.
 */
export async function verifyCode(
  code: string,
  minecraftUsername: string,
): Promise<MinecraftLinkResult> {
  const normalizedCode = code.trim().toUpperCase();

  const profile = await prisma.minecraftProfile.findFirst({
    where: {
      verifyCode: normalizedCode,
      verifyExpires: { gt: new Date() },
    },
  });

  if (!profile) {
    return { success: false, message: "Code de vérification invalide ou expiré." };
  }

  // Vérifier que le gamertag correspond (insensible à la casse)
  if (profile.gamertag.toLowerCase() !== minecraftUsername.toLowerCase()) {
    return {
      success: false,
      message: `Le gamertag ne correspond pas. Attendu: ${profile.gamertag}, reçu: ${minecraftUsername}`,
    };
  }

  // Tenter de récupérer l'UUID via l'API
  let uuid: string | null = null;
  try {
    const stats = await fetchPlayerStats(minecraftUsername);
    if (stats) {
      uuid = stats.uuid;
    }
  } catch {
    // Pas grave si l'API ne répond pas — on valide quand même
  }

  await prisma.minecraftProfile.update({
    where: { userId: profile.userId },
    data: {
      verified: true,
      verifyCode: null,
      verifyExpires: null,
      uuid,
    },
  });

  logger.info(`[MCLink] Compte vérifié: ${minecraftUsername} → Discord ${profile.userId}`);

  return {
    success: true,
    message: `✅ Compte Minecraft **${minecraftUsername}** vérifié et lié à ton Discord !`,
  };
}

/**
 * Supprime la liaison Minecraft d'un utilisateur Discord.
 */
export async function unlink(discordUserId: string): Promise<MinecraftLinkResult> {
  const profile = await prisma.minecraftProfile.findUnique({
    where: { userId: discordUserId },
  });

  if (!profile) {
    return { success: false, message: "Tu n'as pas de compte Minecraft lié." };
  }

  await prisma.minecraftProfile.delete({
    where: { userId: discordUserId },
  });

  logger.info(`[MCLink] Liaison supprimée pour ${discordUserId}`);
  return { success: true, message: `Compte Minecraft **${profile.gamertag}** détaché.` };
}

/**
 * Récupère le profil Minecraft lié d'un utilisateur Discord.
 */
export async function getLinkedProfile(discordUserId: string) {
  return prisma.minecraftProfile.findUnique({
    where: { userId: discordUserId },
  });
}

/**
 * Récupère les stats d'un joueur Minecraft via l'API PlayerDB.
 * Supporte Java et Bedrock (préfixer avec "." pour Bedrock).
 */
export async function fetchPlayerStats(username: string): Promise<MinecraftPlayerStats | null> {
  const isBedrock = username.startsWith(".");
  const platform = isBedrock ? "bedrock" : "java";
  const cleanUsername = isBedrock ? username.slice(1) : username;

  try {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 10_000);

    const response = await fetch(
      `${PLAYERDB_API}/${platform}/${encodeURIComponent(cleanUsername)}`,
      { signal: controller.signal },
    );
    clearTimeout(timeout);

    if (!response.ok) {
      logger.warn(`[MCLink] PlayerDB API returned ${response.status} for ${username}`);
      return null;
    }

    const data = (await response.json()) as {
      code?: string;
      data?: {
        player?: {
          username?: string;
          id?: string;
          raw_id?: string;
          meta?: {
            name_history?: Array<{ name: string; changedToAt?: number }>;
          };
        };
      };
    };

    if (data.code !== "player.found" || !data.data?.player) {
      return null;
    }

    const player = data.data.player;
    const playerId = player.raw_id || player.id || "";

    return {
      username: player.username || cleanUsername,
      uuid: playerId,
      platform,
      avatarUrl: `https://crafatar.com/avatars/${playerId}?size=128&overlay`,
      skinUrl: `https://crafatar.com/renders/body/${playerId}?size=256&overlay`,
      nameHistory: player.meta?.name_history,
    };
  } catch (error) {
    logger.warn(
      `[MCLink] Erreur fetchPlayerStats: ${error instanceof Error ? error.message : String(error)}`,
    );
    return null;
  }
}

/**
 * Vérifie si un utilisateur a un compte Minecraft vérifié.
 */
export async function isVerified(discordUserId: string): Promise<boolean> {
  const profile = await prisma.minecraftProfile.findUnique({
    where: { userId: discordUserId },
  });
  return profile?.verified ?? false;
}
