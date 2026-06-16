"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.getStreamerByLogin = getStreamerByLogin;
exports.startTwitchMonitoring = startTwitchMonitoring;
exports.stopTwitchMonitoring = stopTwitchMonitoring;
const logger_1 = __importDefault(require("../utils/logger"));
// Service de surveillance Twitch — notifie quand un streamer passe en live
const discord_js_1 = require("discord.js");
const prisma_1 = __importDefault(require("../prisma"));
const config_1 = require("../config");
let twitchAccessToken = null;
let tokenExpiresAt = 0;
let twitchInterval = null;
// Obtention du token OAuth Twitch
async function getTwitchToken() {
    if (twitchAccessToken && Date.now() < tokenExpiresAt - 60_000) {
        return twitchAccessToken;
    }
    const res = await fetch(config_1.config.twitchOAuthUrl, {
        method: "POST",
        headers: { "Content-Type": "application/x-www-form-urlencoded" },
        body: new URLSearchParams({
            client_id: config_1.config.twitchClientId,
            client_secret: config_1.config.twitchClientSecret,
            grant_type: "client_credentials",
        }),
    });
    if (!res.ok) {
        throw new Error(`Twitch OAuth error: ${res.status} ${res.statusText}`);
    }
    const data = await res.json();
    twitchAccessToken = data.access_token;
    tokenExpiresAt = Date.now() + (data.expires_in - 60) * 1000;
    return twitchAccessToken;
}
// Récupère les infos d'un streamer via son login
async function getStreamerByLogin(login) {
    const token = await getTwitchToken();
    const res = await fetch(`https://api.twitch.tv/helix/users?login=${encodeURIComponent(login)}`, {
        headers: {
            "Client-ID": config_1.config.twitchClientId,
            Authorization: `Bearer ${token}`,
        },
    });
    if (!res.ok)
        return null;
    const data = await res.json();
    return data.data?.[0] || null;
}
// Vérifie quels streamers suivis sont en live
async function getLiveStreams(logins) {
    if (logins.length === 0)
        return [];
    const token = await getTwitchToken();
    const params = logins.map((l) => `user_login=${encodeURIComponent(l)}`).join("&");
    const res = await fetch(`https://api.twitch.tv/helix/streams?${params}`, {
        headers: {
            "Client-ID": config_1.config.twitchClientId,
            Authorization: `Bearer ${token}`,
        },
    });
    if (!res.ok) {
        logger_1.default.error("[TWITCH] API streams error:", res.status);
        return [];
    }
    const data = await res.json();
    return data.data || [];
}
// Boucle principale de vérification
async function checkTwitchStreams(client) {
    try {
        const follows = await prisma_1.default.twitchFollow.findMany();
        if (follows.length === 0)
            return;
        const logins = [...new Set(follows.map((f) => f.streamerName.toLowerCase()))];
        const liveStreams = await getLiveStreams(logins);
        const liveLogins = new Set(liveStreams.map((s) => s.user_login.toLowerCase()));
        for (const follow of follows) {
            const isNowLive = liveLogins.has(follow.streamerName.toLowerCase());
            const stream = liveStreams.find((s) => s.user_login.toLowerCase() === follow.streamerName.toLowerCase());
            if (isNowLive && !follow.isLive) {
                // Passage en live : notifier
                await prisma_1.default.twitchFollow.update({
                    where: { id: follow.id },
                    data: { isLive: true },
                });
                const channel = await client.channels.fetch(follow.channelId).catch(() => null);
                if (!channel?.isTextBased())
                    continue;
                const embed = new discord_js_1.EmbedBuilder()
                    .setColor(0x9146ff)
                    .setTitle(`${stream.user_name} est en live sur Twitch !`)
                    .setURL(`https://twitch.tv/${follow.streamerName}`)
                    .setDescription(`**Jeu :** ${stream.game_name || "Inconnu"}\n` +
                    `**Titre :** ${stream.title}\n` +
                    `**Spectateurs :** ${stream.viewer_count.toLocaleString()}`)
                    .setImage(stream.thumbnail_url
                    ?.replace("{width}", "1280")
                    .replace("{height}", "720") || "")
                    .setFooter({ text: "Surveillance System • Twitch" })
                    .setTimestamp();
                await channel.send({ embeds: [embed] }).catch(() => { });
                logger_1.default.info(`[TWITCH] ${follow.streamerName} est en live → notifié dans #${channel.name}`);
            }
            else if (!isNowLive && follow.isLive) {
                // Fin du live
                await prisma_1.default.twitchFollow.update({
                    where: { id: follow.id },
                    data: { isLive: false },
                });
            }
        }
    }
    catch (err) {
        logger_1.default.error("[TWITCH] Erreur boucle de vérification:", err);
    }
}
// Démarre la surveillance Twitch
function startTwitchMonitoring(client, intervalMs = 120_000) {
    if (twitchInterval)
        return;
    if (!config_1.config.twitchClientId || !config_1.config.twitchClientSecret) {
        logger_1.default.info("[TWITCH] Credentials manquants, surveillance desactivee.");
        return;
    }
    logger_1.default.info("[TWITCH] Surveillance démarrée (vérification toutes les 2 min)");
    checkTwitchStreams(client); // Premier check immédiat
    twitchInterval = setInterval(() => checkTwitchStreams(client), intervalMs);
}
// Arrête la surveillance
function stopTwitchMonitoring() {
    if (twitchInterval) {
        clearInterval(twitchInterval);
        twitchInterval = null;
        logger_1.default.info("[TWITCH] Surveillance arrêtée");
    }
}
//# sourceMappingURL=twitch.js.map