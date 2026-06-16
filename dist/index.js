"use strict";
var __createBinding = (this && this.__createBinding) || (Object.create ? (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    var desc = Object.getOwnPropertyDescriptor(m, k);
    if (!desc || ("get" in desc ? !m.__esModule : desc.writable || desc.configurable)) {
      desc = { enumerable: true, get: function() { return m[k]; } };
    }
    Object.defineProperty(o, k2, desc);
}) : (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    o[k2] = m[k];
}));
var __setModuleDefault = (this && this.__setModuleDefault) || (Object.create ? (function(o, v) {
    Object.defineProperty(o, "default", { enumerable: true, value: v });
}) : function(o, v) {
    o["default"] = v;
});
var __importStar = (this && this.__importStar) || (function () {
    var ownKeys = function(o) {
        ownKeys = Object.getOwnPropertyNames || function (o) {
            var ar = [];
            for (var k in o) if (Object.prototype.hasOwnProperty.call(o, k)) ar[ar.length] = k;
            return ar;
        };
        return ownKeys(o);
    };
    return function (mod) {
        if (mod && mod.__esModule) return mod;
        var result = {};
        if (mod != null) for (var k = ownKeys(mod), i = 0; i < k.length; i++) if (k[i] !== "default") __createBinding(result, mod, k[i]);
        __setModuleDefault(result, mod);
        return result;
    };
})();
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
const Sentry = __importStar(require("@sentry/node"));
const discord_js_1 = require("discord.js");
const prisma_1 = __importDefault(require("./prisma"));
const config_1 = require("./config");
const logger_1 = __importDefault(require("./utils/logger"));
const middleware_1 = require("./middleware");
const health_http_1 = require("./services/health-http");
const metrics_1 = require("./services/metrics");
const data_pruning_1 = require("./services/data-pruning");
const main_1 = require("./commands/main");
const sources_1 = require("./commands/sources");
const admin_1 = require("./commands/admin");
const ai_1 = require("./commands/ai");
const moderation_1 = require("./commands/moderation");
const casier_1 = require("./commands/casier");
const core_1 = require("./commands/security/core");
const security_1 = require("./commands/security");
const gaming_1 = require("./commands/gaming");
const community_1 = require("./commands/community");
const utility_1 = require("./commands/utility");
const vocal_1 = require("./commands/vocal");
const retrospective_1 = require("./commands/retrospective");
const twitch_1 = require("./commands/twitch");
const trackGame_1 = require("./commands/trackGame");
const steam_1 = require("./commands/steam");
const psn_1 = require("./commands/psn");
const echoTds_1 = require("./commands/fun/echoTds");
const askBot_1 = require("./commands/fun/askBot");
const wishlist_1 = require("./commands/fun/wishlist");
const shop_1 = require("./commands/fun/shop");
const dictee_1 = require("./commands/dictee");
const alertcenter_1 = require("./commands/alertcenter");
const mp3_1 = require("./commands/mp3");
const ai_extra_1 = require("./commands/ai-extra");
const fortnite_api_1 = require("./services/fortnite-api");
const twitch_2 = require("./services/twitch");
const members_1 = require("./events/members");
const roles_1 = require("./events/roles");
const channels_1 = require("./events/channels");
const messages_1 = require("./events/messages");
const emojis_1 = require("./events/emojis");
const moderation_2 = require("./events/moderation");
const feeds_1 = require("./services/feeds");
const monitor_1 = require("./services/monitor");
const healthcheck_1 = require("./services/healthcheck");
const channel_validator_1 = require("./services/channel-validator");
const patchNotes_1 = require("./services/patchNotes");
const backup_1 = require("./services/backup");
const instantgaming_news_1 = require("./services/instantgaming-news");
const instantgaming_1 = require("./services/instantgaming");
const steamNewsCron_1 = require("./cron/steamNewsCron");
const freeGamesCron_1 = require("./cron/freeGamesCron");
const twitterCron_1 = require("./cron/twitterCron");
const dealsCron_1 = require("./cron/dealsCron");
const globalPatchNotesCron_1 = require("./cron/globalPatchNotesCron");
const client = new discord_js_1.Client({
    intents: [
        discord_js_1.GatewayIntentBits.Guilds,
        discord_js_1.GatewayIntentBits.GuildMembers,
        discord_js_1.GatewayIntentBits.GuildMessages,
        discord_js_1.GatewayIntentBits.MessageContent,
        discord_js_1.GatewayIntentBits.GuildEmojisAndStickers,
        discord_js_1.GatewayIntentBits.GuildMessageReactions,
        discord_js_1.GatewayIntentBits.DirectMessages,
    ],
});
const allCommands = [
    ...main_1.commands, ...sources_1.commands, ...admin_1.commands, ...ai_1.commands, ...moderation_1.commands, ...casier_1.commands,
    ...core_1.commands, ...gaming_1.commands, ...community_1.commands, ...utility_1.commands, ...vocal_1.commands, ...retrospective_1.commands, ...twitch_1.commands, ...steam_1.commands, ...psn_1.commands, ...trackGame_1.commands, ...echoTds_1.commands,
    ...askBot_1.commands, ...wishlist_1.commands, ...shop_1.commands,
    ...ai_extra_1.commands,
    ...dictee_1.commands,
    ...alertcenter_1.commands,
    ...mp3_1.commands,
];
// Constantes pour les rapports automatiques
const LOG_CHANNEL_ID = config_1.config.logChannel;
const OWNER_ID = config_1.config.ownerId;
let reportInterval = null;
let wishlistCheckInterval = null;
async function registerCommands() {
    try {
        const rest = new discord_js_1.REST({ version: "10" }).setToken(config_1.config.token);
        logger_1.default.info("Enregistrement des commandes slash...");
        if (config_1.config.guildId) {
            await rest.put(discord_js_1.Routes.applicationGuildCommands(config_1.config.clientId, config_1.config.guildId), { body: allCommands });
            logger_1.default.info(`✓ ${allCommands.length} commandes enregistrees pour la guilde ${config_1.config.guildId}`);
        }
        else {
            await rest.put(discord_js_1.Routes.applicationCommands(config_1.config.clientId), { body: allCommands });
            logger_1.default.info(`✓ ${allCommands.length} commandes enregistrees globalement`);
        }
    }
    catch (error) {
        logger_1.default.error(`Erreur d'enregistrement des commandes: ${error instanceof Error ? error.message : String(error)}`, { stack: error instanceof Error ? error.stack : undefined });
    }
}
const commandRouter = {};
const commandMiddlewares = [
    (0, middleware_1.createLoggingMiddleware)(),
    (0, middleware_1.createRateLimitMiddleware)(),
];
function applyCommandMiddleware() {
    for (const name of Object.keys(commandRouter)) {
        const handler = commandRouter[name];
        if (handler) {
            commandRouter[name] = (0, middleware_1.withMiddleware)(handler, commandMiddlewares);
        }
    }
}
function buildCommandRouter() {
    const groups = {
        main: ["start", "help", "status", "restart", "retro"],
        source: ["addsource", "removesource", "listsources"],
        admin: ["broadcast", "dm", "logs", "deletehistory", "test-freegames"],
        ai: ["chat", "mention", "aichat", "smartpoll"],
        aiExtra: ["translate", "summarize"],
        mod: ["ban", "kick", "mute", "unmute", "warn", "clear", "timeout", "lock", "unlock", "softban", "purge", "slowmode", "snipe", "history"],
        casier: ["casier", "casier-clear"],
        security: ["lockdown", "nuke", "check-alt", "blacklist", "role-mass", "antiraid", "verif", "namehistory", "avatarhistory", "linkcheck", "antiphishing", "guildconfig"],
        gaming: ["free-games", "game-status", "patch-notes", "deal"],
        community: ["reminder", "ticket-setup", "wishlist-notify"],
        utility: ["embed-builder", "say"],
        vocal: ["vocal"],
        retrospective: ["retrospective"],
        twitch: ["twitch"],
        steam: ["steam"],
        trackGame: ["track-game", "untrack-game", "list-tracked"],
        psn: ["psn"],
        fun: ["echo-tds", "ask-bot", "wishlist", "shop"],
        mp3: ["mp3"],
        dictee: ["dictee"],
        alertcenter: ["alertcenter", "riskscore", "riskyusers", "alertconfig"],
    };
    for (const name of groups.main) {
        commandRouter[name] = async (interaction, client) => {
            if (!interaction.isChatInputCommand())
                return;
            await (0, main_1.handleCommand)(interaction, client);
        };
    }
    for (const name of groups.source) {
        commandRouter[name] = async (interaction) => {
            if (!interaction.isChatInputCommand())
                return;
            await (0, sources_1.handleCommand)(interaction);
        };
    }
    for (const name of groups.admin) {
        commandRouter[name] = async (interaction) => {
            if (!interaction.isChatInputCommand())
                return;
            await (0, admin_1.handleCommand)(interaction);
        };
    }
    for (const name of groups.ai) {
        commandRouter[name] = async (interaction) => {
            if (!interaction.isChatInputCommand())
                return;
            await (0, ai_1.handleCommand)(interaction);
        };
    }
    for (const name of groups.aiExtra) {
        commandRouter[name] = async (interaction) => {
            if (!interaction.isChatInputCommand())
                return;
            await (0, ai_extra_1.handleCommand)(interaction);
        };
    }
    for (const name of groups.mod) {
        commandRouter[name] = async (interaction) => {
            if (!interaction.isChatInputCommand())
                return;
            await (0, moderation_1.handleCommand)(interaction, client);
        };
    }
    for (const name of groups.casier) {
        commandRouter[name] = async (interaction) => {
            if (!interaction.isChatInputCommand())
                return;
            await (0, casier_1.handleCommand)(interaction);
        };
    }
    for (const name of groups.security) {
        commandRouter[name] = async (interaction, client) => {
            if (!interaction.isChatInputCommand())
                return;
            await (0, core_1.handleCommand)(interaction, client);
        };
    }
    for (const name of groups.community) {
        commandRouter[name] = async (interaction, client) => {
            if (!interaction.isChatInputCommand())
                return;
            await (0, community_1.handleCommand)(interaction, client);
        };
    }
    for (const name of groups.gaming) {
        commandRouter[name] = async (interaction) => {
            if (!interaction.isChatInputCommand())
                return;
            await (0, gaming_1.handleCommand)(interaction);
        };
    }
    for (const name of groups.utility) {
        commandRouter[name] = async (interaction, client) => {
            if (!interaction.isChatInputCommand())
                return;
            await (0, utility_1.handleCommand)(interaction, client);
        };
    }
    for (const name of groups.vocal) {
        commandRouter[name] = async (interaction) => {
            if (!interaction.isChatInputCommand())
                return;
            await (0, vocal_1.handleCommand)(interaction);
        };
    }
    for (const name of groups.retrospective) {
        commandRouter[name] = async (interaction, client) => {
            if (!interaction.isChatInputCommand())
                return;
            await (0, retrospective_1.handleCommand)(interaction, client);
        };
    }
    for (const name of groups.twitch) {
        commandRouter[name] = async (interaction) => {
            if (!interaction.isChatInputCommand())
                return;
            await (0, twitch_1.handleCommand)(interaction);
        };
    }
    for (const name of groups.steam) {
        commandRouter[name] = async (interaction) => {
            if (!interaction.isChatInputCommand())
                return;
            await (0, steam_1.handleCommand)(interaction);
        };
    }
    for (const name of groups.trackGame) {
        commandRouter[name] = async (interaction) => {
            if (!interaction.isChatInputCommand())
                return;
            await (0, trackGame_1.handleCommand)(interaction);
        };
    }
    for (const name of groups.psn) {
        commandRouter[name] = async (interaction) => {
            if (!interaction.isChatInputCommand())
                return;
            await (0, psn_1.handleCommand)(interaction);
        };
    }
    for (const name of groups.fun) {
        commandRouter[name] = async (interaction, client) => {
            if (!interaction.isChatInputCommand())
                return;
            const cmd = interaction;
            if (name === "echo-tds")
                await (0, echoTds_1.handleCommand)(cmd, client);
            else if (name === "ask-bot")
                await (0, askBot_1.handleCommand)(cmd);
            else if (name === "wishlist")
                await (0, wishlist_1.handleCommand)(cmd);
            else if (name === "shop")
                await (0, shop_1.handleCommand)(cmd);
        };
    }
    for (const name of groups.mp3) {
        commandRouter[name] = async (interaction) => {
            if (!interaction.isChatInputCommand())
                return;
            await (0, mp3_1.handleCommand)(interaction);
        };
    }
    for (const name of groups.dictee) {
        commandRouter[name] = async (interaction, client) => {
            if (!interaction.isChatInputCommand())
                return;
            await (0, dictee_1.handleCommand)(interaction, client);
        };
    }
    for (const name of groups.alertcenter) {
        commandRouter[name] = async (interaction) => {
            if (!interaction.isChatInputCommand())
                return;
            await (0, alertcenter_1.handleCommand)(interaction);
        };
    }
}
// --- Helper : Embed de statut (demarrage & cyclique) ---
async function sendStatusReport(client, color, channelId) {
    const uptimeMs = client.uptime ?? 0;
    const uptimeSeconds = Math.floor(uptimeMs / 1000);
    const hours = Math.floor(uptimeSeconds / 3600);
    const minutes = Math.floor((uptimeSeconds % 3600) / 60);
    const seconds = uptimeSeconds % 60;
    const uptimeStr = `${hours}h ${minutes}m ${seconds}s`;
    const [totalLogs, totalWarnings, totalNotifications, totalSources] = await Promise.all([
        prisma_1.default.log.count(),
        prisma_1.default.sanction.count({ where: { type: "WARN" } }),
        prisma_1.default.notification.count(),
        prisma_1.default.source.count(),
    ]);
    const embed = new discord_js_1.EmbedBuilder()
        .setTitle(`🤖 ${client.user?.username ?? "Bot"} — Rapport de statut`)
        .setColor(color)
        .addFields({ name: "Statut", value: "🟢 En ligne", inline: true }, { name: "Latence API", value: `${client.ws.ping}ms`, inline: true }, { name: "Serveurs", value: `${client.guilds.cache.size}`, inline: true }, { name: "Uptime", value: uptimeStr, inline: true }, { name: "​", value: "​", inline: false }, { name: "📋 Logs", value: `${totalLogs}`, inline: true }, { name: "⚠️ Warnings", value: `${totalWarnings}`, inline: true }, { name: "🔔 Notifications", value: `${totalNotifications}`, inline: true }, { name: "📡 Sources", value: `${totalSources}`, inline: true })
        .setTimestamp();
    try {
        const channel = await client.channels.fetch(channelId);
        if (channel?.isTextBased()) {
            await channel.send({ embeds: [embed] });
        }
    }
    catch (error) {
        logger_1.default.error(`[StatusReport] Erreur d'envoi du rapport: ${error instanceof Error ? error.message : String(error)}`, { stack: error instanceof Error ? error.stack : undefined });
    }
}
// ─── Initialisation des schedulers (boot scan + cron) ──────────────────────
async function initSchedulers(client) {
    logger_1.default.info("♻️ Scan de démarrage lancé pour tous les services...");
    const results = await Promise.allSettled([
        (0, twitterCron_1.checkTwitterAccounts)(client),
        (0, freeGamesCron_1.checkFreeGames)(client),
        (0, instantgaming_news_1.checkInstantGamingNews)(client),
        (0, steamNewsCron_1.checkTrackedGames)(client),
        (0, dealsCron_1.checkDeals)(client),
        (0, globalPatchNotesCron_1.checkPatchNotes)(client),
    ]);
    const succeeded = results.filter(r => r.status === "fulfilled").length;
    const failed = results.filter(r => r.status === "rejected").length;
    logger_1.default.info(`♻️ Scans de démarrage terminés (${succeeded} OK, ${failed} échec(s))`);
    logger_1.default.info("⏱️ Planification Cron...");
    (0, twitterCron_1.startTwitterMonitoring)(client);
    (0, freeGamesCron_1.startFreeGamesMonitoring)(client);
    (0, instantgaming_news_1.startInstantGamingNewsCheck)(client);
    (0, globalPatchNotesCron_1.startGlobalPatchNotesMonitoring)(client);
    logger_1.default.info("⏱️ Tous les crons sont planifiés");
}
client.once(discord_js_1.Events.ClientReady, async (readyClient) => {
    logger_1.default.info(`✓ ${readyClient.user.tag} est en ligne !`);
    logger_1.default.info(`📡 ${client.guilds.cache.size} serveurs`);
    logger_1.default.info(`📋 ${allCommands.length} commandes disponibles`);
    // Rapports de statut désactivés pour réduire le spam dans le salon log
    // if (LOG_CHANNEL_ID) {
    //   await sendStatusReport(client, 0x00ff00, LOG_CHANNEL_ID);
    // }
    if (OWNER_ID) {
        client.users
            .fetch(OWNER_ID)
            .then((owner) => owner.send(`🚀 **${readyClient.user.username}** vient de demarrer !`))
            .catch((error) => logger_1.default.error(`[Startup] Impossible d'envoyer le MP au proprietaire: ${error instanceof Error ? error.message : String(error)}`, { stack: error instanceof Error ? error.stack : undefined }));
    }
    // Rapports cycliques désactivés pour réduire le spam dans le salon log
    // if (LOG_CHANNEL_ID) {
    //   reportInterval = setInterval(() => {
    //     sendStatusReport(client, 0x00ffff, LOG_CHANNEL_ID).catch((error) =>
    //       logger.error(`[StatusReport] Erreur rapport cyclique: ${error instanceof Error ? error.message : String(error)}`, { stack: error instanceof Error ? error.stack : undefined })
    //     );
    //   }, 24 * 60 * 60 * 1000);
    // }
    logger_1.default.info("[Startup] Verification wishlist Fortnite...");
    try {
        const matches = await (0, fortnite_api_1.checkWishlistMatches)(client);
        if (matches > 0)
            logger_1.default.info(`[FortniteAPI/Wishlist] ${matches} DM(s) envoye(s) au demarrage`);
    }
    catch (e) {
        logger_1.default.error(`[Startup] Erreur wishlist check: ${e instanceof Error ? e.message : String(e)}`, { stack: e instanceof Error ? e.stack : undefined });
    }
    wishlistCheckInterval = setInterval(() => {
        (0, fortnite_api_1.checkWishlistMatches)(client).then((matches) => {
            if (matches > 0)
                logger_1.default.info(`[FortniteAPI/Wishlist] ${matches} DM(s) envoye(s) (check cyclique)`);
        }).catch((e) => logger_1.default.error(`[FortniteAPI/Wishlist] Erreur cyclique: ${e instanceof Error ? e.message : String(e)}`, { stack: e instanceof Error ? e.stack : undefined }));
    }, 24 * 60 * 60 * 1000);
    logger_1.default.info("[Startup] Rattrapage des actualites manquees...");
    try {
        await (0, feeds_1.runStartupRetrospective)(client);
        await (0, monitor_1.runDbSourcesRetrospective)(client);
        await (0, fortnite_api_1.runWishlistRetrospective)(client);
    }
    catch (e) {
        logger_1.default.error(`[Startup] Erreur lors du rattrapage: ${e instanceof Error ? e.message : String(e)}`, { stack: e instanceof Error ? e.stack : undefined });
    }
    // Validation des salons Discord configurés dans le .env
    logger_1.default.info("[Startup] Validation des salons Discord...");
    const channelsReport = await (0, channel_validator_1.validateChannels)(client);
    if (channelsReport.errors > 0) {
        logger_1.default.warn(`[Startup] ${channelsReport.errors} salon(s) inaccessible(s) — les crons concernés loggeront des warnings`);
    }
    (0, monitor_1.startMonitoring)(client);
    (0, twitch_2.startTwitchMonitoring)(client);
    (0, patchNotes_1.startPatchNotesService)(client);
    (0, backup_1.startBackupService)(client);
    (0, instantgaming_1.startInstantGamingCheck)(client);
    (0, steamNewsCron_1.startSteamNewsMonitoring)(client);
    (0, dealsCron_1.startDealsMonitoring)(client);
    (0, globalPatchNotesCron_1.startGlobalPatchNotesMonitoring)(client);
    await initSchedulers(client);
    await (0, healthcheck_1.sendHealthReport)(client, healthResults);
    logger_1.default.info("");
    logger_1.default.info("=".repeat(55));
    logger_1.default.info("  ✅ BOT DEMARRE AVEC SUCCES");
    logger_1.default.info("  📋 Base de donnees synchronisee");
    logger_1.default.info(`  📡 Surveillance active (${allCommands.length} commandes, ${client.guilds.cache.size} serveurs)`);
    logger_1.default.info("  🟢 Tous les modules sont operationnels");
    logger_1.default.info("=".repeat(55));
    logger_1.default.info("");
});
client.on(discord_js_1.Events.InteractionCreate, async (interaction) => {
    if (!interaction.isChatInputCommand())
        return;
    const handler = commandRouter[interaction.commandName];
    if (handler) {
        try {
            await handler(interaction, client);
        }
        catch (error) {
            logger_1.default.error(`Erreur commande /${interaction.commandName}: ${error instanceof Error ? error.message : String(error)}`, { stack: error instanceof Error ? error.stack : undefined });
            await Sentry.captureException(error, { tags: { command: interaction.commandName } });
            if (interaction.replied || interaction.deferred) {
                await interaction.followUp({ content: "❌ Une erreur est survenue lors de l'execution de la commande.", flags: [discord_js_1.MessageFlags.Ephemeral] }).catch(() => { });
            }
            else {
                await interaction.reply({ content: "❌ Une erreur est survenue lors de l'execution de la commande.", flags: [discord_js_1.MessageFlags.Ephemeral] }).catch(() => { });
            }
        }
    }
});
client.on(discord_js_1.Events.InteractionCreate, async (interaction) => {
    if (interaction.isButton()) {
        try {
            const handled = (0, security_1.handleVerifButton)(interaction);
            if (handled)
                return;
        }
        catch (err) {
            logger_1.default.error(`[Bouton] Erreur: ${err instanceof Error ? err.message : String(err)}`, { stack: err instanceof Error ? err.stack : undefined });
        }
    }
    if (!interaction.isStringSelectMenu())
        return;
    if (interaction.customId === "help_category_select") {
        try {
            await (0, main_1.handleSelectMenu)(interaction);
        }
        catch (error) {
            logger_1.default.error(`Erreur select menu ${interaction.customId}: ${error instanceof Error ? error.message : String(error)}`, { stack: error instanceof Error ? error.stack : undefined });
            if (interaction.replied || interaction.deferred) {
                await interaction.followUp({ content: "❌ Une erreur est survenue lors de la sélection.", flags: [discord_js_1.MessageFlags.Ephemeral] }).catch(() => { });
            }
            else {
                await interaction.reply({ content: "❌ Une erreur est survenue lors de la sélection.", flags: [discord_js_1.MessageFlags.Ephemeral] }).catch(() => { });
            }
        }
    }
});
client.on(discord_js_1.Events.InteractionCreate, async (interaction) => {
    if (!interaction.isAutocomplete())
        return;
    if (interaction.commandName === "removesource") {
        const focused = interaction.options.getFocused();
        const sources = await prisma_1.default.source.findMany({
            where: { urlOrHandle: { contains: focused.replace("@", "") } },
            take: 25,
        });
        await interaction.respond(sources.map((s) => ({ name: `@${s.urlOrHandle} (${s.type})`, value: s.urlOrHandle })));
    }
    else if (interaction.commandName === "untrack-game") {
        await (0, trackGame_1.handleAutocomplete)(interaction);
    }
    else if (interaction.commandName === "mp3") {
        await (0, mp3_1.handleAutocomplete)(interaction);
    }
    else if (interaction.commandName === "wishlist") {
        await (0, wishlist_1.handleAutocomplete)(interaction);
    }
    else if (interaction.commandName === "translate") {
        await (0, utility_1.handleTranslateAutocomplete)(interaction);
    }
});
let healthResults = [];
async function main() {
    logger_1.default.info("=== Discord Surveillance Bot ===");
    // Vérifier si l'option --register est présente
    const shouldRegisterOnly = process.argv.includes("--register");
    if (shouldRegisterOnly) {
        logger_1.default.info("Mode enregistrement des commandes uniquement...");
        await registerCommands();
        logger_1.default.info("Enregistrement termine.");
        process.exit(0);
    }
    logger_1.default.info("Demarrage...");
    // Health check HTTP (Docker/monitoring)
    try {
        (0, health_http_1.startHealthServer)(3000);
    }
    catch {
        logger_1.default.warn("Health server failed to start (port 3000 in use?)");
    }
    try {
        (0, metrics_1.startMetricsServer)(3001);
    }
    catch {
        logger_1.default.warn("Metrics server failed to start (port 3001 in use?)");
    }
    // Nettoyage initial + automatique
    (0, data_pruning_1.pruneOldData)().catch((err) => logger_1.default.error(`[Pruning] Erreur nettoyage initial: ${err instanceof Error ? err.message : String(err)}`, { stack: err instanceof Error ? err.stack : undefined }));
    (0, data_pruning_1.startDataPruning)();
    const { errors, warnings } = (0, config_1.validateConfig)();
    if (warnings.length > 0) {
        logger_1.default.warn("⚠️ Avertissements de configuration :");
        warnings.forEach((w) => logger_1.default.warn(`  - ${w}`));
    }
    if (errors.length > 0) {
        logger_1.default.error("❌ Erreurs de configuration :");
        errors.forEach((e) => logger_1.default.error(`  - ${e}`));
        process.exit(1);
    }
    logger_1.default.info("✓ Configuration valide");
    // Initialiser Sentry (monitoring d'erreurs)
    if (config_1.config.sentryDsn) {
        Sentry.init({
            dsn: config_1.config.sentryDsn,
            tracesSampleRate: 0.3,
            environment: process.env.NODE_ENV || "production",
        });
        logger_1.default.info("✓ Sentry initialise");
    }
    else {
        logger_1.default.warn("⚠️ SENTRY_DSN non defini — monitoring des erreurs desactive");
    }
    try {
        await prisma_1.default.$connect();
        logger_1.default.info("✓ Base de donnees connectee");
    }
    catch (error) {
        logger_1.default.error(`❌ Erreur de connexion a la base de donnees: ${error instanceof Error ? error.message : String(error)}`, { stack: error instanceof Error ? error.stack : undefined });
        process.exit(1);
    }
    healthResults = await (0, healthcheck_1.runHealthCheck)();
    const healthFailed = healthResults.filter((r) => !r.passed).length;
    if (healthFailed > 0) {
        logger_1.default.error("\n[HEALTHCHECK] LANCEMENT BLOQUE : " + healthFailed + " anomalie(s).");
        logger_1.default.error("[HEALTHCHECK] Corrigez les variables .env ou fichiers manquants.");
        process.exit(1);
    }
    buildCommandRouter();
    applyCommandMiddleware();
    (0, members_1.handleMemberEvents)(client);
    (0, roles_1.handleRoleEvents)(client);
    (0, channels_1.handleChannelEvents)(client);
    (0, messages_1.handleMessageEvents)(client);
    (0, emojis_1.handleEmojiEvents)(client);
    (0, moderation_2.handleModerationEvents)(client);
    (0, messages_1.startMapCleanup)();
    logger_1.default.info("✓ Gestionnaires d'evenements initialises");
    await registerCommands();
    try {
        await client.login(config_1.config.token);
    }
    catch (error) {
        logger_1.default.error(`❌ Erreur de connexion a Discord: ${error instanceof Error ? error.message : String(error)}`, { stack: error instanceof Error ? error.stack : undefined });
        process.exit(1);
    }
}
process.on("SIGINT", async () => {
    logger_1.default.info("\nArret du bot...");
    (0, monitor_1.stopMonitoring)();
    (0, twitch_2.stopTwitchMonitoring)();
    (0, patchNotes_1.stopPatchNotesService)();
    (0, instantgaming_1.stopInstantGamingCheck)();
    (0, instantgaming_news_1.stopInstantGamingNewsCheck)();
    (0, steamNewsCron_1.stopSteamNewsMonitoring)();
    (0, freeGamesCron_1.stopFreeGamesMonitoring)();
    (0, dealsCron_1.stopDealsMonitoring)();
    (0, globalPatchNotesCron_1.stopGlobalPatchNotesMonitoring)();
    (0, twitterCron_1.stopTwitterMonitoring)();
    (0, messages_1.stopMapCleanup)();
    if (wishlistCheckInterval)
        clearInterval(wishlistCheckInterval);
    if (reportInterval)
        clearInterval(reportInterval);
    await prisma_1.default.$disconnect();
    client.destroy();
    await Sentry.close(2000);
    process.exit(0);
});
process.on("SIGTERM", async () => {
    logger_1.default.info("\nArret du bot...");
    (0, monitor_1.stopMonitoring)();
    (0, twitch_2.stopTwitchMonitoring)();
    (0, instantgaming_1.stopInstantGamingCheck)();
    (0, instantgaming_news_1.stopInstantGamingNewsCheck)();
    (0, steamNewsCron_1.stopSteamNewsMonitoring)();
    (0, freeGamesCron_1.stopFreeGamesMonitoring)();
    (0, dealsCron_1.stopDealsMonitoring)();
    (0, globalPatchNotesCron_1.stopGlobalPatchNotesMonitoring)();
    (0, twitterCron_1.stopTwitterMonitoring)();
    (0, messages_1.stopMapCleanup)();
    if (wishlistCheckInterval)
        clearInterval(wishlistCheckInterval);
    if (reportInterval)
        clearInterval(reportInterval);
    await prisma_1.default.$disconnect();
    client.destroy();
    await Sentry.close(2000);
    process.exit(0);
});
process.on("unhandledRejection", (reason, promise) => {
    const err = reason instanceof Error ? reason : new Error(String(reason));
    logger_1.default.error(`[PROCESS] Unhandled Rejection at: ${promise}, reason: ${err.message}`, { stack: err.stack });
    Sentry.captureException(err, { tags: { type: "unhandledRejection" } });
});
process.on("uncaughtException", (error) => {
    logger_1.default.error(`[PROCESS] ⚠️ Uncaught Exception: ${error.message}`, { stack: error.stack });
    logger_1.default.error("[PROCESS] L'erreur a ete capturee. Le bot continue de fonctionner.");
    Sentry.captureException(error, { tags: { type: "uncaughtException" } });
});
main();
//# sourceMappingURL=index.js.map