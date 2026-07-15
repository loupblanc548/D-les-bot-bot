/**
 * commandRouter.ts — Routeur de commandes slash
 *
 * Extrait de index.ts pour réduire sa complexité.
 * Contient : buildCommandRouter, applyCommandMiddleware, registerCommands
 */

import { REST, Routes, Interaction, ChatInputCommandInteraction, Client } from "discord.js";
import { config } from "./config.js";
import logger from "./utils/logger.js";
import {
  createLoggingMiddleware,
  createRateLimitMiddleware,
  createPermissionGuardMiddleware,
  withMiddleware,
} from "./middleware/index.js";

// ── Dynamic File-Based Router ──
import { buildAllCommands, dispatchInteraction } from "./commands/router/index.js";

import { handleSelectMenu as handleMainSelectMenu } from "./commands/main.js";

// ─── Group Commands (used in allCommands + buildCommandRouter) ───
import { commands as osintCommands, handleCommand as handleOsint } from "./commands/osint.js";
import { commands as modGroupCommands, handleCommand as handleModGroup } from "./commands/mod.js";
import {
  commands as modAdminCommands,
  handleCommand as handleModAdmin,
} from "./commands/modadmin.js";
import {
  commands as securityGroupCommands,
  handleCommand as handleSecurityGroup,
} from "./commands/securityGroup.js";
import {
  commands as sourcesGroupCommands,
  handleCommand as handleSourcesGroup,
} from "./commands/sourcesGroup.js";
import {
  commands as casierGroupCommands,
  handleCommand as handleCasierGroup,
} from "./commands/casierGroup.js";
import {
  commands as alertGroupCommands,
  handleCommand as handleAlertGroup,
} from "./commands/alertGroup.js";
import { commands as aiGroupCommands, handleCommand as handleAiGroup } from "./commands/aiGroup.js";
import { commands as botGroupCommands } from "./commands/botGroup.js";
import {
  commands as adminGroupCommands,
  handleCommand as handleAdminGroup,
} from "./commands/adminGroup.js";
import {
  commands as gameGroupCommands,
  fnbotCommands,
  handleCommand as handleGameGroup,
  handleFnbotCommand,
} from "./commands/gameGroup.js";
import { commands as minecraftGroupCommands } from "./commands/minecraftGroup.js";
import {
  commands as ticketGroupCommands,
  handleCommand as handleTicketGroup,
} from "./commands/ticketGroup.js";
import {
  commands as autoThreadCommands,
  handleCommand as handleAutoThread,
} from "./commands/autoThread.js";
import {
  commands as customCmdCommands,
  handleCommand as handleCustomCmd,
} from "./commands/customCommands.js";
import {
  commands as manageGroupCommands,
  handleCommand as handleManageGroup,
} from "./commands/manageGroup.js";
import { commands as helpCommands, handleCommand as handleHelp } from "./commands/helpSystem.js";
import { contextMenuCommands, handleContextMenu } from "./commands/contextMenus.js";

export type CmdHandler = (interaction: Interaction, client: Client) => Promise<void>;
export const commandRouter: Record<string, CmdHandler> = {};

const commandMiddlewares = [
  createLoggingMiddleware(),
  createPermissionGuardMiddleware(),
  // Rate limiting DÉSACTIVÉ — bot débridé
  // createRateLimitMiddleware(),
];

const REMOVED_COMMANDS = new Set([
  "lockdown",
  "dashboard",
  "userinfo",
  "reverse",
  "poll",
  "reminder",
  "lfg",
  "lfg-list",
  "playtime",
  "game-recommend",
  "metacritic",
  "game-trivia",
  "rank",
  "leaderboard",
  "level-config",
  "birthday-set",
  "birthday-list",
  "avatar",
  "role-info",
  "channel-info",
  "color",
  "dice",
  "coinflip",
  "8ball",
  "rps",
  "wordle",
  "guess-game",
  "emoji-quiz",
  "ai-profile",
  "ai-config",
  "ai-channel-summary",
  "ai-suggest",
  "ai-mood",
  "riskscore",
  "riskyusers",
  "lock",
  "slowmode",
  "dictee",
  "timer",
  "hangman",
  // ─── Anciennes commandes regroupées en subcommands ───
  "warn",
  "mute",
  "unmute",
  "kick",
  "ban",
  "timeout",
  "clear",
  "unlock",
  "purge",
  "history",
  "nuke",
  "check-alt",
  "blacklist",
  "role-mass",
  "antiraid",
  "verif",
  "namehistory",
  "avatarhistory",
  "linkcheck",
  "alt-link",
  "ban-log",
  "behavior-timeline",
  "alert-rules",
  "add-source",
  "remove-source",
  "list-sources",
  "pause-source",
  "reddit-track",
  "rss-custom",
  "track-game",
  "untrack-game",
  "list-tracked",
  "casier-clear",
  "alertcenter",
  "alertconfig",
  "smart-alerts",
  "chat",
  "mention",
  "aichat",
  "smartpoll",
  "ai-translate-custom",
  "giveaway",
  // ─── Commandes supprimées (nettoyage) ───
  "qr-code",
  "screenshot",
  "spotify-search",
  "yt-search",
  "lastfm",
  "timer",
  "play",
  "stop",
  "pause",
  "resume",
  "skip",
  "previous",
  "shuffle",
  "loop",
  "seek",
  "volume",
  "queue-status",
  "nowplaying",
  "reaction-roles",
  "welcome-config",
  "goodbye-config",
  "poll",
  "reminder",
  "lfg",
  "lfg-list",
  "retrospective",
  "retro-config",
  "memory-profile",
  "dictee",
  "hangman",
  "quiz",
  "debate",
  "two-truths",
  "fortune",
  "compliment",
  "roast",
  "pickup-line",
  "vibe-check",
  "therapy",
  "timecapsule",
  // ─── Commandes IA supprimées (regroupées en sous-commandes /ai) ───
  "ai-profile",
  "ai-suggest",
  "ai-mood",
  "ai-fun",
  "ai-channel-summary",
  "ai-translate-custom",
  "aichat",
  "smartpoll",
  "mention",
  "chat",
  "translate-auto",
  "summarize",
  "explain",
  // ─── Commandes regroupées en sous-commandes (vague 2) ───
  "start",
  "help",
  "restart",
  "status",
  "uptime",
  "userinfo",
  "server-info",
  "dashboard",
  "debug",
  "hotreload",
  "broadcast",
  "dm",
  "deletehistory",
  "maintenance",
  "clean-duplicates",
  "backup",
  "permission-audit",
  "guild-config",
  "cooldown-config",
  "channel-routing",
  "purge-content",
  "api-status",
  "bot-health",
  "healthz",
  "create-workflow",
  "list-workflows",
  "toggle-workflow",
  "alertcenter",
  "alertconfig",
  "alert-rules",
  "security-audit",
  "riskscore",
  "riskyusers",
  "spam-analysis",
  "auto-report",
  "viral-alert",
  "trend-report",
  "report",
  "ban",
  "kick",
  "mute",
  "unmute",
  "warn",
  "clear",
  "timeout",
  "unlock",
  "lock",
  "slowmode",
  "softban",
  "tempban",
  "purge",
  "purgeuser",
  "snipe",
  "mass-move",
  "voice-kick",
  "raid-shield",
  "ban-log",
  "behavior-timeline",
  "alt-link",
  "namehistory",
  "avatarhistory",
  "linkcheck",
  "source-stats",
  "rss-test",
  "scraper-status",
  "search-notifications",
  "test-freegames",
  "test-rss",
  "game-status",
  "game-info",
  "free-games",
  "free-game-reminder",
  "patch_notes",
  "deal",
  "deals-history",
  "price-compare",
  "price-history",
  "price-track",
  "release-calendar",
  "gaming-news",
  "epic-calendar",
  "steam",
  "steam-deals",
  "wishlist",
  "wishlist-stats",
  "wishlist-notify",
  "boutique",
  // fortnite-wishlist & fortnite-shop-preview are KEPT (not removed)
  "xbox",
  "twitch",
  "psn",
  "track-game",
  "untrack-game",
  "list-tracked",
  "ticket-setup",
  "self-role",
  "profile",
  "embed-builder",
  "say",
  "vocal",
  "mp3",
  "tts",
  "recherche",
  "audio-effects",
  "radio-stop",
  "track",
  // ─── Phase 1: Additional deprecated commands ───
  "fun",
  "trivia",
  "joke",
  "advice",
  "quote",
  "meme",
  "dog",
  "number-fact",
  "shop",
  "echo-tds",
  "password-gen",
  "username-gen",
  "base64",
  "hex",
  "bio",
  "badge",
  "badges",
  "level",
  "xp-config",
  "social",
  "instagram",
  "insta-deep",
  "server-boost",
  "member-count",
  "roles",
  "birthday-config",
  "giveaway-list",
  "giveaway-reroll",
  "community",
  "tools",
  "music",
  "game2",
]);

export const allCommands = [
  // ── 15 Slash Commands (Phase 1 architecture) ──
  ...modGroupCommands, // 1. /mod (warn, kick, ban, mute, config...)
  ...securityGroupCommands, // 2. /security (osint, audit, config...)
  ...aiGroupCommands, // 3. /ai (chat, image, translate, config...)
  ...gameGroupCommands, // 4. /game (track, news, free-games, steam...)
  ...fnbotCommands, // 4b. /fnbot (Fortnite Party Bot)
  ...minecraftGroupCommands, // 4c. /mc (Minecraft Bedrock Bot)
  ...adminGroupCommands, // 5. /admin (config, database, roles...)
  ...botGroupCommands, // 6. /bot (help, status, uptime, dashboard...)
  ...sourcesGroupCommands, // 7. /sources (add, remove, list, health...)
  ...alertGroupCommands, // 8. /alert (rules, ack, digest, test...)
  ...casierGroupCommands, // 9. /casier (view, clear...)
  ...ticketGroupCommands, // 10. /ticket (setup, close, transcript...)
  ...manageGroupCommands, // 11. /manage (roles, channels, emojis...)
  ...helpCommands, // 12. /help + /commands
  // ── Groupes conservés (standalone) ──
  ...modAdminCommands, // 13. /modadmin
  ...osintCommands, // 14. /osint (scan, dns, whois...)
  ...autoThreadCommands, // 15. /autothread
  ...customCmdCommands, // /customcmd
  // ── Context Menus (clic droit) ──
  ...contextMenuCommands,
].filter((cmd) => {
  const name = (cmd as { name?: string }).name;
  return name ? !REMOVED_COMMANDS.has(name) : true;
});

type GroupHandler = (interaction: ChatInputCommandInteraction, client: Client) => Promise<void>;

function registerGroup(groupNames: string[], handler: GroupHandler): void {
  for (const name of groupNames) {
    commandRouter[name] = async (interaction, client) => {
      if (!interaction.isChatInputCommand()) return;
      await handler(interaction as ChatInputCommandInteraction, client);
    };
  }
}

export function buildCommandRouter(): void {
  // ─── Catégories migrées vers le router dynamique ───
  // Ces catégories sont dispatchées par le file-based router.
  // Les fichiers sont chargés via await import() au runtime.
  const dynamicCategories = new Set<string>(["mc", "bot"]);

  for (const cat of dynamicCategories) {
    commandRouter[cat] = async (interaction, client) => {
      if (!interaction.isChatInputCommand()) return;
      await dispatchInteraction(interaction as ChatInputCommandInteraction, client);
    };
  }

  // ─── Catégories legacy (non encore migrées) ───
  registerGroup(["mod"], handleModGroup);
  registerGroup(["security"], handleSecurityGroup);
  registerGroup(["ai"], handleAiGroup);
  registerGroup(["game"], handleGameGroup);
  registerGroup(["fnbot"], handleFnbotCommand);
  // mc et bot sont maintenant dynamiques ↑
  registerGroup(["admin"], handleAdminGroup);
  // bot est maintenant dynamique ↑
  registerGroup(["sources"], handleSourcesGroup);
  registerGroup(["alert"], handleAlertGroup);
  registerGroup(["casier"], handleCasierGroup);
  registerGroup(["ticket"], handleTicketGroup);
  registerGroup(["manage"], handleManageGroup);
  registerGroup(["help", "commands"], handleHelp);
  registerGroup(["modadmin"], handleModAdmin);
  registerGroup(["osint"], handleOsint);
  registerGroup(["autothread"], handleAutoThread);
  registerGroup(["customcmd"], handleCustomCmd);
  // ─── Context Menus ───
  registerGroup(
    [
      "👤 Voir profil",
      "📋 Voir casier",
      "🤖 Analyser IA",
      "⚠️ Risque score",
      "🚩 Signaler",
      "🌐 Traduire",
      "📊 Analyser sentiment",
      "📦 Extraire",
      "🚩 Rapporter",
      "🔍 Snipe",
    ],
    handleContextMenu as unknown as GroupHandler,
  );
}

export function applyCommandMiddleware(): void {
  for (const name of Object.keys(commandRouter)) {
    const handler = commandRouter[name];
    if (handler) {
      commandRouter[name] = withMiddleware(handler, commandMiddlewares);
    }
  }
}

export async function registerCommands(): Promise<void> {
  try {
    const rest = new REST({ version: "10" }).setToken(config.token);
    logger.info("Enregistrement des commandes slash...");

    // ── Construire les commandes dynamiques depuis le file-based router ──
    let dynamicCommands: ReturnType<typeof Object>[] = [];
    try {
      dynamicCommands = (await buildAllCommands()) as ReturnType<typeof Object>[];
      logger.info(`✓ Router dynamique: ${dynamicCommands.length} commandes construites`);
    } catch (err) {
      logger.error(
        `Erreur construction router dynamique: ${err instanceof Error ? err.message : String(err)}`,
      );
    }

    // ── Fusionner: commandes dynamiques + legacy (sans doublons) ──
    const dynamicNames = new Set(dynamicCommands.map((c) => (c as { name?: string }).name));
    const legacyFiltered = allCommands.filter((cmd) => {
      const name = (cmd as { name?: string }).name;
      return name ? !dynamicNames.has(name) : true;
    });
    const mergedCommands = [...dynamicCommands, ...legacyFiltered];

    // Vérifier les doublons
    const seenNames = new Map<string, number>();
    for (const cmd of mergedCommands) {
      const name = (cmd as { name?: string }).name;
      if (name) {
        seenNames.set(name, (seenNames.get(name) ?? 0) + 1);
      }
    }
    const duplicates = [...seenNames.entries()].filter(([, count]) => count > 1);
    if (duplicates.length > 0) {
      logger.warn(`Doublons détectés: ${duplicates.map(([n, c]) => `${n}(${c}x)`).join(", ")}`);
      // Garder seulement la première occurrence de chaque doublon
      const deduped = new Map<string, unknown>();
      for (const cmd of mergedCommands) {
        const name = (cmd as { name?: string }).name;
        if (name && !deduped.has(name)) {
          deduped.set(name, cmd);
        } else if (!name) {
          deduped.set(`_no_name_${deduped.size}`, cmd);
        }
      }
      mergedCommands.length = 0;
      mergedCommands.push(...(Array.from(deduped.values()) as typeof mergedCommands));
      logger.info(`Après dédoublonnage: ${mergedCommands.length} commandes`);
    }

    logger.info(
      `Déploiement: ${dynamicCommands.length} dynamiques + ${legacyFiltered.length} legacy = ${mergedCommands.length} total`,
    );

    // ── Déploiement en un seul PUT (bulk overwrite) ──
    // Le PUT vers applicationGuildCommands/applicationCommands remplace
    // TOUTES les commandes en une seule opération atomique.
    // Pas besoin de supprimer d'abord — cela cause un flash "une par une".
    if (config.guildId) {
      // Mode guilde: déploiement instantané (1-2s vs 1h en global)
      await rest.put(Routes.applicationGuildCommands(config.clientId, config.guildId), {
        body: mergedCommands,
      });
      logger.info(
        `✓ ${mergedCommands.length} commandes enregistrées pour la guilde ${config.guildId}`,
      );

      // Nettoyer les commandes globales orphelines (sans flash côté guilde)
      try {
        await rest.put(Routes.applicationCommands(config.clientId), { body: [] });
      } catch {
        // Non critique — les commandes globales orphelines disparaissent d'elles-mêmes
      }
    } else {
      // Mode global: déploiement partout (peut prendre jusqu'à 1h)
      await rest.put(Routes.applicationCommands(config.clientId), { body: mergedCommands });
      logger.info(`✓ ${mergedCommands.length} commandes enregistrées globalement`);
    }
  } catch (error) {
    logger.error(
      `Erreur d'enregistrement des commandes: ${error instanceof Error ? error.message : String(error)}`,
      { stack: error instanceof Error ? error.stack : undefined },
    );
  }
}

// Réexport pour interactionHandler
export { handleMainSelectMenu };
