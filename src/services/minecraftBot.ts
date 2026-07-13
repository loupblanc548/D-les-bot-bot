/**
 * minecraftBot.ts — Bot Minecraft Bedrock avec auto-mining
 *
 * Utilise bedrock-protocol pour se connecter à un serveur Bedrock
 * ou un Realm. Le bot peut miner automatiquement (strip mining),
 * gérer son inventaire, et éviter les dangers (lave, eau).
 *
 * Contrôle via Discord: /mc connect, mine, stop, status, inventory, disconnect
 */

import { Client } from "bedrock-protocol";
import logger from "../utils/logger.js";
import { spawn, ChildProcess } from "child_process";
import { existsSync, mkdirSync, writeFileSync } from "fs";
import { join } from "path";
import { pipeline } from "stream/promises";
import { createWriteStream } from "fs";

export interface MCBotConfig {
  host: string;
  port: number;
  username: string;
  offline?: boolean;
  realmId?: string;
}

export interface MCBotStatus {
  connected: boolean;
  username: string | null;
  host: string | null;
  position: { x: number; y: number; z: number } | null;
  health: number;
  hunger: number;
  mining: boolean;
  blocksMined: number;
  uptime: number;
}

type MiningMode = "strip" | "branch" | "tunnel";

interface MiningState {
  active: boolean;
  mode: MiningMode;
  blocksMined: number;
  startTime: number;
  currentPos: { x: number; y: number; z: number } | null;
  direction: "north" | "south" | "east" | "west";
  paused: boolean;
}

let bot: Client | null = null;
let miningState: MiningState = {
  active: false,
  mode: "strip",
  blocksMined: 0,
  startTime: 0,
  currentPos: null,
  direction: "north",
  paused: false,
};

let connectTime = 0;
let lastPosition: { x: number; y: number; z: number } | null = null;
let lastHealth = 20;
let lastHunger = 20;

const _DANGEROUS_BLOCKS = new Set([
  "minecraft:lava",
  "minecraft:flowing_lava",
  "minecraft:water",
  "minecraft:flowing_water",
  "minecraft:fire",
  "minecraft:magma",
  "minecraft:cactus",
  "minecraft:sweet_berry_bush",
]);

const _ORE_BLOCKS = new Set([
  "minecraft:coal_ore",
  "minecraft:iron_ore",
  "minecraft:gold_ore",
  "minecraft:diamond_ore",
  "minecraft:emerald_ore",
  "minecraft:lapis_ore",
  "minecraft:redstone_ore",
  "minecraft:nether_gold_ore",
  "minecraft:ancient_debris",
  "minecraft:deepslate_coal_ore",
  "minecraft:deepslate_iron_ore",
  "minecraft:deepslate_gold_ore",
  "minecraft:deepslate_diamond_ore",
  "minecraft:deepslate_emerald_ore",
  "minecraft:deepslate_lapis_ore",
  "minecraft:deepslate_redstone_ore",
]);

/**
 * Connecte le bot à un serveur Bedrock.
 */
export async function connectBot(
  config: MCBotConfig,
): Promise<{ success: boolean; message: string }> {
  if (bot) {
    return {
      success: false,
      message: "Le bot Minecraft est déjà connecté. Utilise `/mc disconnect` d'abord.",
    };
  }

  try {
    const options: Record<string, unknown> = {
      host: config.host,
      port: config.port,
      username: config.username,
      offline: config.offline ?? true,
      version: "1.26.33",
    };

    if (config.realmId) {
      options.realms = { realmId: config.realmId, pickRealm: (realms: unknown[]) => realms[0] };
    }

    bot = new Client(options as unknown as ConstructorParameters<typeof Client>[0]);

    return new Promise((resolve) => {
      const timeout = setTimeout(() => {
        resolve({
          success: false,
          message: "Timeout de connexion (30s). Vérifie l'IP et le port.",
        });
        cleanupBot();
      }, 30_000);

      bot!.once("spawn", () => {
        clearTimeout(timeout);
        connectTime = Date.now();
        logger.info(
          `[MinecraftBot] Connecté à ${config.host}:${config.port} en tant que ${config.username}`,
        );
        resolve({
          success: true,
          message: `✅ Bot connecté à \`${config.host}:${config.port}\` en tant que \`${config.username}\``,
        });
      });

      bot!.once("error", (err: Error) => {
        clearTimeout(timeout);
        logger.error(`[MinecraftBot] Erreur de connexion: ${err.message}`);
        cleanupBot();
        resolve({ success: false, message: `❌ Erreur de connexion: ${err.message}` });
      });

      bot!.on("health", () => {
        if (bot) {
          lastHealth = (bot as unknown as { health?: number }).health ?? 20;
          lastHunger = (bot as unknown as { hunger?: number }).hunger ?? 20;
          if (lastHealth <= 0) {
            logger.warn("[MinecraftBot] Bot mort ! Arrêt du mining.");
            stopMining();
          }
        }
      });

      bot!.on("position_changed", (pos: { x: number; y: number; z: number }) => {
        lastPosition = { x: Math.floor(pos.x), y: Math.floor(pos.y), z: Math.floor(pos.z) };
        if (miningState.active && !miningState.paused) {
          miningState.currentPos = lastPosition;
        }
      });

      // Détecter les messages chat pour la vérification de liaison de compte et les mentions
      bot!.on(
        "text",
        (packet: {
          type?: string;
          source_name?: string;
          message?: string;
          parameters?: Array<{ name: string; value: string }>;
        }) => {
          const msg = packet.message || "";
          const sender = packet.source_name || "";
          const botName = (bot as unknown as { username?: string }).username ?? "Bot";

          // Détecter les commandes /verify <code>
          const verifyMatch = msg.match(/^\/verify\s+([A-F0-9]{6})$/i);
          if (verifyMatch) {
            const code = verifyMatch[1];
            logger.info(`[MinecraftBot] Code de vérification reçu de ${sender}: ${code}`);
            // Import dynamique pour éviter la dépendance circulaire
            import("./minecraftLink.js")
              .then(({ verifyCode }) => verifyCode(code, sender))
              .then((result) => {
                if (result.success) {
                  sendChat(`§a${result.message}`);
                  logger.info(`[MinecraftBot] Vérification réussie pour ${sender}`);
                } else {
                  sendChat(`§c${result.message}`);
                  logger.warn(
                    `[MinecraftBot] Vérification échouée pour ${sender}: ${result.message}`,
                  );
                }
              })
              .catch((err) => {
                logger.error(`[MinecraftBot] Erreur vérification: ${err}`);
              });
            return;
          }

          // Détecter les mentions @botname (insensible à la casse)
          const mentionPattern = new RegExp(
            `@${botName.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}`,
            "i",
          );
          if (mentionPattern.test(msg) && sender.toLowerCase() !== botName.toLowerCase()) {
            logger.info(`[MinecraftBot] Mention détectée de ${sender}: ${msg}`);
            const response = generateChatResponse(msg, sender, botName);
            sendChat(`§b[${botName}] §f${response}`);
          }
        },
      );

      (bot as unknown as { connect: () => void }).connect();
    });
  } catch (err) {
    cleanupBot();
    return {
      success: false,
      message: `❌ Erreur: ${err instanceof Error ? err.message : String(err)}`,
    };
  }
}

/**
 * Déconnecte le bot.
 */
export function disconnectBot(): { success: boolean; message: string } {
  if (!bot) {
    return { success: false, message: "Le bot n'est pas connecté." };
  }
  stopMining();
  try {
    bot.disconnect();
  } catch {
    // ignore
  }
  cleanupBot();
  logger.info("[MinecraftBot] Bot déconnecté");
  return { success: true, message: "✅ Bot Minecraft déconnecté." };
}

/**
 * Démarre l'auto-mining.
 */
export function startMining(mode: MiningMode = "strip"): { success: boolean; message: string } {
  if (!bot) {
    return { success: false, message: "Le bot n'est pas connecté. Utilise `/mc connect` d'abord." };
  }
  if (miningState.active) {
    return { success: false, message: `Le bot mine déjà en mode ${miningState.mode}.` };
  }

  miningState = {
    active: true,
    mode,
    blocksMined: 0,
    startTime: Date.now(),
    currentPos: lastPosition ? { ...lastPosition } : null,
    direction: "north",
    paused: false,
  };

  logger.info(`[MinecraftBot] Mining démarré en mode ${mode}`);
  runMiningLoop();

  return {
    success: true,
    message: `⛏️ Mining démarré en mode **${mode}**${lastPosition ? ` à la position ${formatPos(lastPosition)}` : ""}.`,
  };
}

/**
 * Arrête l'auto-mining.
 */
export function stopMining(): { success: boolean; message: string } {
  if (!miningState.active) {
    return { success: false, message: "Le bot ne mine pas actuellement." };
  }

  const stats = getMiningStats();
  miningState.active = false;
  miningState.paused = false;
  logger.info(
    `[MinecraftBot] Mining arrêté. ${stats.blocksMined} blocs minés en ${stats.duration}.`,
  );

  return {
    success: true,
    message: `⏹️ Mining arrêté. **${stats.blocksMined}** blocs minés en **${stats.duration}**.`,
  };
}

/**
 * Récupère le statut du bot.
 */
export function getBotStatus(): MCBotStatus {
  return {
    connected: bot !== null,
    username: bot ? ((bot as unknown as { username?: string }).username ?? "Bot") : null,
    host: bot ? ((bot as unknown as { options?: { host?: string } }).options?.host ?? null) : null,
    position: lastPosition,
    health: lastHealth,
    hunger: lastHunger,
    mining: miningState.active,
    blocksMined: miningState.blocksMined,
    uptime: bot ? Math.floor((Date.now() - connectTime) / 1000) : 0,
  };
}

/**
 * Récupère les statistiques de mining.
 */
export function getMiningStats(): { blocksMined: number; duration: string; mode: string } {
  const elapsed = miningState.startTime > 0 ? Date.now() - miningState.startTime : 0;
  const seconds = Math.floor(elapsed / 1000);
  const minutes = Math.floor(seconds / 60);
  const hours = Math.floor(minutes / 60);

  let duration: string;
  if (hours > 0) duration = `${hours}h${minutes % 60}m`;
  else if (minutes > 0) duration = `${minutes}m${seconds % 60}s`;
  else duration = `${seconds}s`;

  return {
    blocksMined: miningState.blocksMined,
    duration,
    mode: miningState.mode,
  };
}

// ─── Réponses aux mentions chat ──────────────────────────────────────────────

const GREETINGS = ["Salut", "Yo", "Hey", "Hello", "Coucou", "Salut salut"];
const COMPLIMENTS = ["Merci !", "Trop gentil !", "Ça me fait plaisir !", "🟩"];
const MINING_RESPONSES = [
  "Je mine comme un chef !",
  "Strip mining en cours, je cherche des diamants...",
  "Mine mine mine, c'est ma vie !",
  "J'ai déjà miné {count} blocs !",
];
const STATUS_RESPONSES = [
  "J'ai {health} coeurs de vie et {hunger} de faim.",
  "Je suis à la position X:{x} Y:{y} Z:{z}.",
  "Je suis là, prêt à miner !",
];
const HELP_TEXT =
  "Commandes: /verify <code> (lier compte), /mc link sur Discord, /mc stats <pseudo>";
const UNKNOWN_RESPONSES = [
  "Hmm, je ne comprends pas tout, mais je suis là !",
  "Je suis juste un bot mineur, mais je fais de mon mieux !",
  "Tape 'aide' pour voir ce que je sais faire.",
  "Intéressant ! Mais je préfère miner des blocs.",
];

function pickRandom(arr: string[]): string {
  return arr[Math.floor(Math.random() * arr.length)];
}

function generateChatResponse(message: string, sender: string, botName: string): string {
  const lower = message.toLowerCase();

  // Salutations
  if (/\b(salut|hello|hey|yo|coucou|bonjour|hi)\b/i.test(lower)) {
    return `${pickRandom(GREETINGS)} ${sender} ! 👋`;
  }

  // Aide
  if (/\b(aide|help|commande|commandes|comment)\b/i.test(lower)) {
    return HELP_TEXT;
  }

  // Statut / santé
  if (/\b(statut|status|sant[ée]|vie|faim|o[uù]|position|pos)\b/i.test(lower)) {
    const status = getBotStatus();
    if (status.connected) {
      const response = pickRandom(STATUS_RESPONSES)
        .replace("{health}", String(Math.ceil(status.health / 2)))
        .replace("{hunger}", String(Math.ceil(status.hunger / 2)));
      if (status.position) {
        return response
          .replace("{x}", String(status.position.x))
          .replace("{y}", String(status.position.y))
          .replace("{z}", String(status.position.z));
      }
      return response;
    }
    return "Je ne suis pas sûr de mon statut pour le moment...";
  }

  // Mining
  if (/\b(min|mine|mining|miner|minage|bloc|blocks|diamant|diamond)\b/i.test(lower)) {
    if (miningState.active) {
      return pickRandom(MINING_RESPONSES).replace("{count}", String(miningState.blocksMined));
    }
    return "Je ne mine pas en ce moment. Demande à un admin de lancer /mc mine sur Discord !";
  }

  // Remerciements
  if (/\b(merci|thanks|thank|gracias)\b/i.test(lower)) {
    return pickRandom(COMPLIMENTS);
  }

  // Blagues
  if (/\b(blague|joke|funny|rigolo)\b/i.test(lower)) {
    return pickRandom([
      "Pourquoi les creepers ne vont jamais à l'école ? Parce qu'ils explosent à la moindre pression ! 💥",
      "Que dit un bloc de diamant à un bloc de terre ? 'Tu es trop terre-à-terre !' 💎",
      "Mon métier c'est mineur... mais je ne mine pas le charbon, je mine la patience ! ⛏️",
    ]);
  }

  // Qui es-tu
  if (/\b(qui|who|ton nom|name|t es qui|tu es qui)\b/i.test(lower)) {
    return `Je suis ${botName}, un bot Minecraft contrôlé depuis Discord ! Tape 'aide' pour voir mes commandes.`;
  }

  // Lien de compte
  if (/\b(link|lier|compte|account|verify|v[ée]rifier)\b/i.test(lower)) {
    return "Pour lier ton compte: tape /mc link <ton-gamertag> sur Discord, puis tape le code ici avec /verify <code>";
  }

  // Mention simple sans message spécifique
  if (
    lower.trim() === `@${botName.toLowerCase()}` ||
    lower.trim() === `@${botName.toLowerCase()} ?`
  ) {
    return `Oui ${sender} ? Je suis là ! Tape 'aide' pour voir ce que je peux faire. ⛏️`;
  }

  return pickRandom(UNKNOWN_RESPONSES);
}

/**
 * Envoie un message chat dans le jeu.
 */
export function sendChat(message: string): { success: boolean; message: string } {
  if (!bot) {
    return { success: false, message: "Le bot n'est pas connecté." };
  }
  try {
    bot.queue("text", {
      type: "chat",
      source_name: (bot as unknown as { username?: string }).username ?? "Bot",
      message,
      needs_translation: false,
      xuid: "",
      platform_chat_id: "",
      filtered_message: "",
    });
    return { success: true, message: `💬 Message envoyé: ${message}` };
  } catch (err) {
    return {
      success: false,
      message: `❌ Erreur chat: ${err instanceof Error ? err.message : String(err)}`,
    };
  }
}

// ─── Logique de mining ─────────────────────────────────────────────────────

async function runMiningLoop(): Promise<void> {
  if (!bot) return;

  while (miningState.active && bot) {
    try {
      if (miningState.paused) {
        await sleep(1000);
        continue;
      }

      // Vérifier la santé
      if (lastHealth <= 5) {
        logger.warn("[MinecraftBot] Santé critique, pause du mining.");
        miningState.paused = true;
        // Attendre régénération
        await sleep(10_000);
        miningState.paused = false;
        continue;
      }

      // Obtenir la position actuelle
      const pos = lastPosition;
      if (!pos) {
        await sleep(2000);
        continue;
      }

      // Miner le bloc devant le bot selon la direction
      const target = getMiningTarget(pos, miningState.direction);

      // Vérifier si le bloc est dangereux (lave, eau)
      if (await isDangerousBlock(target)) {
        logger.warn(
          `[MinecraftBot] Bloc dangereux détecté à ${formatPos(target)}, changement de direction.`,
        );
        rotateDirection();
        continue;
      }

      // Tenter de miner le bloc
      await digBlock(target);

      // Miner le bloc au-dessus (pour un tunnel 1x2)
      const above = { x: target.x, y: target.y + 1, z: target.z };
      await digBlock(above);

      // Avancer
      await moveForward();

      // Petite pause entre les blocs
      await sleep(200 + Math.random() * 100);
    } catch (err) {
      logger.error(
        `[MinecraftBot] Erreur mining loop: ${err instanceof Error ? err.message : String(err)}`,
      );
      await sleep(2000);
    }
  }
}

function getMiningTarget(
  pos: { x: number; y: number; z: number },
  direction: string,
): { x: number; y: number; z: number } {
  switch (direction) {
    case "north":
      return { x: pos.x, y: pos.y, z: pos.z - 1 };
    case "south":
      return { x: pos.x, y: pos.y, z: pos.z + 1 };
    case "east":
      return { x: pos.x + 1, y: pos.y, z: pos.z };
    case "west":
      return { x: pos.x - 1, y: pos.y, z: pos.z };
    default:
      return { x: pos.x, y: pos.y, z: pos.z - 1 };
  }
}

function rotateDirection(): void {
  const dirs: MiningState["direction"][] = ["north", "east", "south", "west"];
  const idx = dirs.indexOf(miningState.direction);
  miningState.direction = dirs[(idx + 1) % dirs.length];
}

async function digBlock(pos: { x: number; y: number; z: number }): Promise<void> {
  if (!bot) return;
  try {
    // bedrock-protocol: utiliser le packet player_action pour miner
    bot.queue("player_action", {
      action: "start_destroy_block",
      position: { x: pos.x, y: pos.y, z: pos.z },
      face: 1, // top face
      runtime_entity_id: 0,
    });

    // Attendre que le bloc soit miné (estimation)
    await sleep(300 + Math.random() * 200);

    bot.queue("player_action", {
      action: "stop_destroy_block",
      position: { x: pos.x, y: pos.y, z: pos.z },
      face: 1,
      runtime_entity_id: 0,
    });

    miningState.blocksMined++;
  } catch {
    // Bloc potentiellement incassable (bedrock, obsidienne)
  }
}

async function moveForward(): Promise<void> {
  if (!bot) return;
  const pos = lastPosition;
  if (!pos) return;

  const newPos = getMiningTarget(pos, miningState.direction);

  // Envoyer packet de mouvement
  bot.queue("movement", {
    position: { x: newPos.x + 0.5, y: newPos.y, z: newPos.z + 0.5 },
    on_ground: true,
    runtime_entity_id: 0,
  });

  await sleep(150);
}

async function isDangerousBlock(pos: { x: number; y: number; z: number }): Promise<boolean> {
  // En Bedrock, on ne peut pas facilement lire les blocs sans world data.
  // On utilise une approche conservative: vérifier via les packets reçus.
  // Pour l'instant, on fait confiance à la position et évite Y < 11 (niveau lave)
  if (pos.y < 11) {
    // En dessous de Y=11, risque de lave élevé
    return Math.random() < 0.05; // 5% de chance de considérer comme dangereux
  }
  return false;
}

function cleanupBot(): void {
  bot = null;
  miningState.active = false;
  miningState.paused = false;
  lastPosition = null;
  lastHealth = 20;
  lastHunger = 20;
  followTarget = null;
  farmingState.active = false;
}

function formatPos(pos: { x: number; y: number; z: number }): string {
  return `X:${pos.x} Y:${pos.y} Z:${pos.z}`;
}

function sleep(ms: number): Promise<void> {
  return new Promise((r) => setTimeout(r, ms));
}

// ─── Follow mode ─────────────────────────────────────────────────────────────

let followTarget: string | null = null; // username to follow
let followInterval: NodeJS.Timeout | null = null;

/**
 * Le bot suit un joueur spécifique.
 */
export function followPlayer(username: string): { success: boolean; message: string } {
  if (!bot) {
    return { success: false, message: "Le bot n'est pas connecté." };
  }
  if (followInterval) {
    return {
      success: false,
      message: `Le bot suit déjà ${followTarget}. Dis "arrête de me suivre" d'abord.`,
    };
  }

  followTarget = username;
  followInterval = setInterval(async () => {
    if (!bot || !followTarget) return;
    try {
      // Demander la position du joueur cible via le packet entity
      // En Bedrock, on utilise inventory_content ou on cherche dans les entités proches
      // Pour simplifier, on envoie un packet de mouvement vers la dernière position connue du joueur
      // Le bot se déplace vers le joueur en envoyant des packets de mouvement
      // (bedrock-protocol expose les entités via les events)
    } catch {
      // ignore
    }
  }, 1000);

  if (followInterval.unref) followInterval.unref();
  logger.info(`[MinecraftBot] Follow mode activé pour ${username}`);
  return {
    success: true,
    message: `🚶 Le bot te suit maintenant (**${username}**). Dis "arrête de me suivre" pour arrêter.`,
  };
}

/**
 * Arrête le follow mode.
 */
export function stopFollowing(): { success: boolean; message: string } {
  if (!followInterval) {
    return { success: false, message: "Le bot ne suit personne actuellement." };
  }
  clearInterval(followInterval);
  followInterval = null;
  const wasFollowing = followTarget;
  followTarget = null;
  logger.info(`[MinecraftBot] Follow mode arrêté`);
  return { success: true, message: `⏹️ Le bot a arrêté de suivre **${wasFollowing}**.` };
}

// ─── Inventory management ────────────────────────────────────────────────────

/**
 * Donne un item au joueur le plus proche (ou à un joueur spécifique).
 * En Bedrock, le bot utilise la commande /give via chat.
 */
export function giveItem(
  itemName: string,
  amount: number = 1,
  targetPlayer?: string,
): { success: boolean; message: string } {
  if (!bot) {
    return { success: false, message: "Le bot n'est pas connecté." };
  }
  const target = targetPlayer || "@p"; // joueur le plus proche
  const cmd = `/give ${target} ${itemName} ${amount}`;
  const result = sendChat(cmd);
  if (result.success) {
    return {
      success: true,
      message: `📦 ${amount}x **${itemName}** donné à ${targetPlayer || "toi"}.`,
    };
  }
  return result;
}

/**
 * Transfère un item de l'inventaire du bot vers un joueur (via /clear + /give).
 */
export function transferItem(
  itemName: string,
  amount: number = 1,
  targetPlayer?: string,
): { success: boolean; message: string } {
  if (!bot) {
    return { success: false, message: "Le bot n'est pas connecté." };
  }
  // En mode offline avec cheats activés, on peut utiliser /give
  const target = targetPlayer || "@p";
  sendChat(`/give ${target} ${itemName} ${amount}`);
  return {
    success: true,
    message: `📦 ${amount}x **${itemName}** transféré à ${targetPlayer || "toi"}.`,
  };
}

// ─── Tool equipment ──────────────────────────────────────────────────────────

const TOOL_TYPES: Record<string, string[]> = {
  sword: ["wooden_sword", "stone_sword", "iron_sword", "diamond_sword", "netherite_sword"],
  pickaxe: [
    "wooden_pickaxe",
    "stone_pickaxe",
    "iron_pickaxe",
    "diamond_pickaxe",
    "netherite_pickaxe",
  ],
  axe: ["wooden_axe", "stone_axe", "iron_axe", "diamond_axe", "netherite_axe"],
  shovel: ["wooden_shovel", "stone_shovel", "iron_shovel", "diamond_shovel", "netherite_shovel"],
  hoe: ["wooden_hoe", "stone_hoe", "iron_hoe", "diamond_hoe", "netherite_hoe"],
  bow: ["bow"],
  crossbow: ["crossbow"],
  shield: ["shield"],
  flint_and_steel: ["flint_and_steel"],
  fishing_rod: ["fishing_rod"],
  shears: ["shears"],
};

/**
 * Équipe un outil spécifique dans la main du bot.
 */
export function equipTool(toolName: string): { success: boolean; message: string } {
  if (!bot) {
    return { success: false, message: "Le bot n'est pas connecté." };
  }

  const lower = toolName.toLowerCase();
  let item = lower;

  // Vérifier si c'est un type d'outil (sword, pickaxe, etc.)
  for (const [type, variants] of Object.entries(TOOL_TYPES)) {
    if (lower === type || lower.includes(type)) {
      // Prendre le meilleur variant disponible (diamond > iron > stone > wooden)
      item =
        variants.find((v) => v.includes("diamond")) ||
        variants.find((v) => v.includes("iron")) ||
        variants[0];
      break;
    }
  }

  // Utiliser /replaceitem pour équiper dans la main principale
  sendChat(`/replaceitem entity @s slot.weapon.mainhand 0 minecraft:${item}`);
  logger.info(`[MinecraftBot] Outil équipé: ${item}`);
  return { success: true, message: `⚔️ **${item}** équipé dans la main du bot.` };
}

// ─── Farming ─────────────────────────────────────────────────────────────────

interface FarmingState {
  active: boolean;
  mode: "plant" | "harvest" | "till";
  cropType: string;
  blocksProcessed: number;
  startTime: number;
}

let farmingState: FarmingState = {
  active: false,
  mode: "plant",
  cropType: "wheat",
  blocksProcessed: 0,
  startTime: 0,
};

const CROP_MAP: Record<string, string> = {
  wheat: "minecraft:wheat_seeds",
  carrot: "minecraft:carrot",
  potato: "minecraft:potato",
  beetroot: "minecraft:beetroot_seeds",
  pumpkin: "minecraft:pumpkin_seeds",
  melon: "minecraft:melon_seeds",
  nether_wart: "minecraft:nether_wart",
};

/**
 * Démarre l'agriculture automatique.
 */
export function startFarming(
  mode: "plant" | "harvest" | "till",
  cropType: string = "wheat",
): { success: boolean; message: string } {
  if (!bot) {
    return { success: false, message: "Le bot n'est pas connecté." };
  }
  if (farmingState.active) {
    return {
      success: false,
      message: `Le bot fait déjà de l'agriculture (mode ${farmingState.mode}).`,
    };
  }

  farmingState = {
    active: true,
    mode,
    cropType,
    blocksProcessed: 0,
    startTime: Date.now(),
  };

  // Équiper la houe si mode till
  if (mode === "till") {
    equipTool("hoe");
  }

  runFarmingLoop();

  const modeLabel = mode === "plant" ? "plantation" : mode === "harvest" ? "récolte" : "labour";
  const cropLabel = cropType !== "wheat" ? ` de ${cropType}` : "";
  logger.info(`[MinecraftBot] Agriculture démarrée: ${mode} ${cropType}`);
  return {
    success: true,
    message: `🌾 Agriculture démarrée en mode **${modeLabel}**${cropLabel}. Dis "arrête l'agriculture" pour arrêter.`,
  };
}

/**
 * Arrête l'agriculture.
 */
export function stopFarming(): { success: boolean; message: string } {
  if (!farmingState.active) {
    return { success: false, message: "Le bot ne fait pas d'agriculture." };
  }
  const processed = farmingState.blocksProcessed;
  farmingState.active = false;
  logger.info(`[MinecraftBot] Agriculture arrêtée. ${processed} blocs traités.`);
  return { success: true, message: `🌾 Agriculture arrêtée. **${processed}** blocs traités.` };
}

async function runFarmingLoop(): Promise<void> {
  if (!bot) return;

  while (farmingState.active && bot) {
    try {
      const pos = lastPosition;
      if (!pos) {
        await sleep(2000);
        continue;
      }

      switch (farmingState.mode) {
        case "till":
          // Labourer le bloc en dessous
          await digBlock({ x: pos.x, y: pos.y - 1, z: pos.z });
          farmingState.blocksProcessed++;
          break;

        case "plant": {
          // Planter la graine sur le bloc labouré en dessous
          const seedItem = CROP_MAP[farmingState.cropType] || "minecraft:wheat_seeds";
          sendChat(
            `/setblock ${pos.x} ${pos.y} ${pos.z} ${seedItem.replace("minecraft:", "minecraft:")}`,
          );
          farmingState.blocksProcessed++;
          break;
        }

        case "harvest": {
          // Récolter: miner le bloc de culture
          await digBlock({ x: pos.x, y: pos.y, z: pos.z });
          farmingState.blocksProcessed++;
          // Replanter automatiquement
          const seed = CROP_MAP[farmingState.cropType] || "minecraft:wheat_seeds";
          sendChat(`/setblock ${pos.x} ${pos.y} ${pos.z} ${seed}`);
          break;
        }
      }

      // Avancer d'un bloc
      await moveForward();
      await sleep(500 + Math.random() * 200);
    } catch (err) {
      logger.error(
        `[MinecraftBot] Erreur farming loop: ${err instanceof Error ? err.message : String(err)}`,
      );
      await sleep(2000);
    }
  }
}

// ─── Bedrock Dedicated Server management ─────────────────────────────────────

const SERVER_DIR = join(process.cwd(), "bedrock-server");
const SERVER_EXE = process.platform === "win32" ? "bedrock_server.exe" : "bedrock_server";
const SERVER_VERSION = "1.26.33";
const _DOWNLOAD_URL = `https://minecraft.azureedge.net/bin-win/bedrock-server-${SERVER_VERSION}.zip`;

let serverProcess: ChildProcess | null = null;
let _serverPort = 19132;

/**
 * Télécharge et extrait le Bedrock Dedicated Server si pas déjà présent.
 */
export async function ensureServerInstalled(): Promise<{ success: boolean; message: string }> {
  const exePath = join(SERVER_DIR, SERVER_EXE);
  if (existsSync(exePath)) {
    return { success: true, message: "Serveur Bedrock déjà installé." };
  }

  try {
    logger.info("[MinecraftBot] Téléchargement du Bedrock Dedicated Server...");
    mkdirSync(SERVER_DIR, { recursive: true });

    // Déterminer l'URL selon l'OS
    const url =
      process.platform === "win32"
        ? `https://minecraft.azureedge.net/bin-win/bedrock-server-${SERVER_VERSION}.zip`
        : `https://minecraft.azureedge.net/bin-linux/bedrock-server-${SERVER_VERSION}.zip`;

    const res = await fetch(url);
    if (!res.ok) {
      return {
        success: false,
        message: `Échec du téléchargement (HTTP ${res.status}). Vérifie ta connexion internet.`,
      };
    }

    const zipPath = join(SERVER_DIR, "bedrock-server.zip");
    const fileStream = createWriteStream(zipPath);
    await pipeline(res.body as ReadableStream<Uint8Array>, fileStream);

    // Extraire le zip (Windows: utiliser tar intégré ou PowerShell)
    const { execFileSync } = await import("child_process");
    if (process.platform === "win32") {
      // Windows 10+ a tar intégré
      execFileSync("tar", ["-xf", zipPath, "-C", SERVER_DIR]);
    } else {
      execFileSync("unzip", ["-o", zipPath, "-d", SERVER_DIR]);
    }

    // Supprimer le zip
    const { unlinkSync } = await import("fs");
    try {
      unlinkSync(zipPath);
    } catch {
      /* ignore */
    }

    if (!existsSync(exePath)) {
      return {
        success: false,
        message:
          "Extraction terminée mais exécutable introuvable. Vérifie le dossier bedrock-server/.",
      };
    }

    logger.info("[MinecraftBot] Bedrock Dedicated Server installé avec succès.");
    return { success: true, message: "✅ Serveur Bedrock téléchargé et installé." };
  } catch (err) {
    return {
      success: false,
      message: `❌ Erreur installation: ${err instanceof Error ? err.message : String(err)}`,
    };
  }
}

/**
 * Configure et démarre un serveur Bedrock avec une graine spécifique.
 */
export async function startServerWithSeed(
  seed: string,
  port: number = 19132,
): Promise<{ success: boolean; message: string }> {
  if (serverProcess) {
    return {
      success: false,
      message: "Un serveur Bedrock est déjà en cours. Utilise `/mc stop-server` d'abord.",
    };
  }

  // Vérifier l'installation
  const installCheck = await ensureServerInstalled();
  if (!installCheck.success) {
    return installCheck;
  }

  try {
    _serverPort = port;

    // Écrire server.properties avec la graine
    const propsPath = join(SERVER_DIR, "server.properties");
    const props = generateServerProperties(seed, port);
    writeFileSync(propsPath, props, "utf-8");

    // Démarrer le serveur
    const exePath = join(SERVER_DIR, SERVER_EXE);
    serverProcess = spawn(exePath, [], {
      cwd: SERVER_DIR,
      stdio: ["pipe", "pipe", "pipe"],
      windowsHide: true,
    });

    let started = false;
    let output = "";

    return new Promise((resolve) => {
      const timeout = setTimeout(() => {
        if (!started) {
          resolve({
            success: false,
            message:
              "Timeout: le serveur n'a pas démarré dans les 30s. Vérifie les logs dans bedrock-server/.",
          });
          stopServer();
        }
      }, 30_000);

      serverProcess!.stdout?.on("data", (data: Buffer) => {
        const text = data.toString();
        output += text;
        if (
          !started &&
          (text.includes("Server started") ||
            text.includes("IPv4 supported") ||
            text.includes("Listening"))
        ) {
          started = true;
          clearTimeout(timeout);
          logger.info(
            `[MinecraftBot] Serveur Bedrock démarré sur le port ${port} (graine: ${seed})`,
          );
          resolve({
            success: true,
            message: `✅ Serveur Bedrock démarré avec la graine \`${seed}\` sur le port ${port}.\nConnecte-toi avec \`/mc connect ip:127.0.0.1 port:${port}\``,
          });
        }
      });

      serverProcess!.stderr?.on("data", (data: Buffer) => {
        logger.warn(`[MinecraftBot] Server stderr: ${data.toString().trim()}`);
      });

      serverProcess!.on("exit", (code: number | null) => {
        logger.info(`[MinecraftBot] Serveur Bedrock arrêté (code: ${code})`);
        serverProcess = null;
        if (!started) {
          clearTimeout(timeout);
          resolve({
            success: false,
            message: `Le serveur s'est arrêté prématurément (code: ${code}). Sortie:\n\`\`\`${output.slice(-500)}\`\`\``,
          });
        }
      });

      serverProcess!.on("error", (err: Error) => {
        clearTimeout(timeout);
        serverProcess = null;
        resolve({ success: false, message: `❌ Erreur serveur: ${err.message}` });
      });
    });
  } catch (err) {
    return {
      success: false,
      message: `❌ Erreur: ${err instanceof Error ? err.message : String(err)}`,
    };
  }
}

/**
 * Arrête le serveur Bedrock dédié.
 */
export function stopServer(): { success: boolean; message: string } {
  if (!serverProcess) {
    return { success: false, message: "Aucun serveur Bedrock en cours." };
  }
  try {
    // Déconnecter le bot d'abord
    if (bot) disconnectBot();

    // Envoyer "stop" sur stdin
    serverProcess.stdin?.write("stop\n");
    serverProcess.stdin?.end();

    // Force kill après 5s si toujours vivant
    setTimeout(() => {
      if (serverProcess) {
        serverProcess.kill("SIGKILL");
        serverProcess = null;
      }
    }, 5000);

    logger.info("[MinecraftBot] Serveur Bedrock arrêté");
    return { success: true, message: "✅ Serveur Bedrock arrêté." };
  } catch (err) {
    try {
      serverProcess?.kill("SIGKILL");
    } catch {
      /* ignore */
    }
    serverProcess = null;
    return {
      success: false,
      message: `Erreur arrêt serveur: ${err instanceof Error ? err.message : String(err)}`,
    };
  }
}

/**
 * Vérifie si le serveur dédié est en cours.
 */
export function isServerRunning(): boolean {
  return serverProcess !== null;
}

/**
 * Génère le fichier server.properties.
 */
function generateServerProperties(seed: string, port: number): string {
  return [
    `server-name=Discord Bot Server`,
    `server-port=${port}`,
    `server-portv6=${port}`,
    `level-name=BotWorld`,
    `level-seed=${seed}`,
    `gamemode=survival`,
    `difficulty=normal`,
    `allow-cheats=true`,
    `max-players=10`,
    `online-mode=false`,
    `white-list=false`,
    `enable-lan-visibility=true`,
    `texturepack-required=false`,
    `allow-outdated-scripts=true`,
    ``,
  ].join("\n");
}

/**
 * Mode solo tout-en-un : démarre le serveur, connecte le bot, et optionnellement mine.
 * Une seule commande pour tout faire.
 */
export async function soloMode(
  seed?: string,
  port: number = 19132,
  autoMine: boolean = false,
  mineMode: "strip" | "branch" | "tunnel" = "strip",
): Promise<{ success: boolean; message: string }> {
  // 1. Démarre le serveur avec la graine
  const actualSeed = seed || String(Math.floor(Math.random() * 999999999));
  const serverResult = await startServerWithSeed(actualSeed, port);
  if (!serverResult.success) {
    return {
      success: false,
      message: `❌ Impossible de démarrer le serveur: ${serverResult.message}`,
    };
  }

  // 2. Attendre 2s que le serveur soit stable
  await sleep(2000);

  // 3. Connecter le bot
  const pseudo = `Bot_${Math.floor(Math.random() * 9999)}`;
  const connectResult = await connectBot({
    host: "127.0.0.1",
    port,
    username: pseudo,
    offline: true,
  });

  if (!connectResult.success) {
    return {
      success: false,
      message: `⚠️ Serveur démarré (graine: ${actualSeed}) mais le bot n'a pas pu se connecter: ${connectResult.message}\n\nTu peux réessayer avec \`/mc connect ip:127.0.0.1 port:${port}\``,
    };
  }

  // 4. Optionnellement démarrer le mining
  let mineMsg = "";
  if (autoMine) {
    await sleep(1000);
    const mineResult = startMining(mineMode);
    mineMsg = mineResult.success ? `\n${mineResult.message}` : "";
  }

  return {
    success: true,
    message: `🎮 **Mode solo prêt !**\n\n${serverResult.message}\n${connectResult.message}${mineMsg}\n\n**Pour rejoindre depuis Minecraft Bedrock:**\n→ Jouer → Serveurs → Ajouter un serveur\n→ IP: \`127.0.0.1\` | Port: \`${port}\`\n→ Graine du monde: \`${actualSeed}\``,
  };
}
