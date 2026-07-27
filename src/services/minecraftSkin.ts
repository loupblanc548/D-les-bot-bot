/**
 * minecraftSkin.ts — Custom skin support for the Minecraft bot
 *
 * Bedrock Edition sends skin data in the login packet.
 * bedrock-protocol supports options.skinData to override the default Steve skin.
 *
 * This module:
 * 1. Loads a PNG skin file (64x64 or 128x128)
 * 2. Converts it to Bedrock skin format (base64 texture + geometry)
 * 3. Returns the skinData object to pass to the Client options
 *
 * Skin PNG format:
 * - 64x64 pixels (classic) or 128x128 (HD)
 * - Layout follows the standard Minecraft skin format
 * - PNG with alpha channel
 */

import { readFileSync, existsSync } from "node:fs";
import logger from "../utils/logger.js";

const DEFAULT_SKIN_PATH = "/opt/bot/assets/bot-skin.png";

// Default geometry for a standard 64x64 skin
// This is the "steve.json" geometry that bedrock-protocol uses by default
const DEFAULT_GEOMETRY = {
  SkinId: "custom_bot_skin",
  SkinResourcePatch: "",
  SkinGeometryData: "",
  AnimatedImageData: [],
  SkinAnimationData: "",
  CapeId: "",
  FullSkinId: "custom_bot_skin_full",
  ArmSize: "classic",
  SkinColor: "#000000",
  PersonaPieces: [],
  PieceTintColors: [],
  TrustedSkin: false,
};

/**
 * Load a custom skin from a PNG file and convert it to Bedrock format.
 * @param skinPath Path to the PNG skin file (64x64 or 128x128)
 * @returns skinData object for bedrock-protocol Client options, or null if failed
 */
export function loadCustomSkin(skinPath: string = DEFAULT_SKIN_PATH): Record<string, unknown> | null {
  if (!existsSync(skinPath)) {
    logger.info(`[MinecraftSkin] Pas de skin personnalisé trouvé (${skinPath}) — utilisation du skin par défaut (Steve)`);
    return null;
  }

  try {
    const skinBuffer = readFileSync(skinPath);

    // Validate it's a PNG
    if (skinBuffer.length < 8 || skinBuffer.subarray(0, 4).toString("hex") !== "89504e47") {
      logger.warn(`[MinecraftSkin] Le fichier ${skinPath} n'est pas un PNG valide`);
      return null;
    }

    // Convert to base64 — this is the texture data
    const skinBase64 = skinBuffer.toString("base64");

    // Build the skinData object that bedrock-protocol expects
    const skinData = {
      ...DEFAULT_GEOMETRY,
      SkinData: skinBase64,
      // Keep the default Steve geometry (64x64 layout)
      // The geometry data is already set by bedrock-protocol from steveGeometry.json
      // We only override the texture
      SkinId: `custom_bot_${Date.now()}`,
      FullSkinId: `custom_bot_${Date.now()}_full`,
    };

    logger.info(`[MinecraftSkin] ✅ Skin personnalisé chargé (${skinBuffer.length} bytes, ${skinBase64.length} chars base64)`);
    return skinData;
  } catch (err) {
    logger.warn(
      `[MinecraftSkin] Erreur chargement skin: ${err instanceof Error ? err.message : String(err)}`,
    );
    return null;
  }
}

/**
 * Check if a custom skin file exists.
 */
export function hasCustomSkin(skinPath: string = DEFAULT_SKIN_PATH): boolean {
  return existsSync(skinPath);
}
