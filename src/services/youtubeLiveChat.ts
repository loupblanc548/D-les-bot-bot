import logger from "../utils/logger.js";

const YOUTUBE_CLIENT_ID = process.env.YOUTUBE_CLIENT_ID || "";
const YOUTUBE_CLIENT_SECRET = process.env.YOUTUBE_CLIENT_SECRET || "";
const YOUTUBE_REDIRECT_URI = process.env.YOUTUBE_REDIRECT_URI || "http://localhost:3000/callback";
let YOUTUBE_REFRESH_TOKEN = process.env.YOUTUBE_REFRESH_TOKEN || "";

const DISCORD_INVITE_LINK = "https://discord.gg/hAVqWmpGV";

const FRIEND_REQUEST_PATTERNS = [
  "tu peux m'ajouter",
  "tu peux m ajouter",
  "tu peut m'ajouter",
  "tu peut m ajouter",
  "ajoute moi",
  "ajoute-moi",
  "ajoute moi sur discord",
  "on peut jouer ensemble",
  "on peut jouer",
  "c'est quoi ton pseudo",
  "c est quoi ton pseudo",
  "c'est quoi ton discord",
  "c est quoi ton discord",
  "donne ton discord",
  "donne ton pseudo",
  "ton pseudo discord",
  "ajoute mon discord",
  "voici mon discord",
  "mon discord c'est",
  "mon discord c est",
  "ajoute moi sur ps",
  "ajoute moi sur xbox",
  "ajoute moi sur steam",
  "donne ton id discord",
  "tu veux jouer avec moi",
  "on joue ensemble",
  "tu joues à quoi",
  "tu joue a quoi",
  "on peut etre ami",
  "on peut être ami",
  "devient mon ami",
];

let accessToken: string | null = null;
let tokenExpiry = 0;
let liveChatId: string | null = null;
let pollingInterval: NodeJS.Timeout | null = null;
let lastMessageId: string | null = null;
let discordLinkCooldown = 0;

async function refreshAccessToken(): Promise<string | null> {
  if (!YOUTUBE_REFRESH_TOKEN) {
    logger.warn("[YouTubeLiveChat] Pas de refresh token configuré");
    return null;
  }

  try {
    const body = new URLSearchParams({
      client_id: YOUTUBE_CLIENT_ID,
      client_secret: YOUTUBE_CLIENT_SECRET,
      refresh_token: YOUTUBE_REFRESH_TOKEN,
      grant_type: "refresh_token",
    });

    const res = await fetch("https://oauth2.googleapis.com/token", {
      method: "POST",
      headers: { "Content-Type": "application/x-www-form-urlencoded" },
      body,
    });

    if (!res.ok) {
      const errText = await res.text();
      logger.error(`[YouTubeLiveChat] Erreur refresh token: ${errText}`);
      return null;
    }

    const data = await res.json() as { access_token: string; expires_in: number };
    accessToken = data.access_token;
    tokenExpiry = Date.now() + (data.expires_in - 60) * 1000;
    logger.info("[YouTubeLiveChat] Token rafraîchi avec succès");
    return accessToken;
  } catch (err) {
    logger.error("[YouTubeLiveChat] Erreur refresh token:", err);
    return null;
  }
}

async function getValidToken(): Promise<string | null> {
  if (accessToken && Date.now() < tokenExpiry) return accessToken;
  return refreshAccessToken();
}

async function fetchActiveLiveChatId(): Promise<string | null> {
  const token = await getValidToken();
  if (!token) return null;

  try {
    const res = await fetch(
      "https://www.googleapis.com/youtube/v3/liveBroadcasts?part=snippet&broadcastStatus=active&mine=true",
      { headers: { Authorization: `Bearer ${token}` } },
    );

    if (!res.ok) {
      const errText = await res.text();
      logger.error(`[YouTubeLiveChat] Erreur récupération live: ${errText}`);
      return null;
    }

    const data = await res.json() as {
      items?: Array<{ snippet: { liveChatId: string; title: string } }>;
    };

    if (!data.items || data.items.length === 0) {
      logger.warn("[YouTubeLiveChat] Aucun stream actif trouvé");
      return null;
    }

    const chatId = data.items[0].snippet.liveChatId;
    const title = data.items[0].snippet.title;
    logger.info(`[YouTubeLiveChat] Stream trouvé: "${title}" — chatId: ${chatId}`);
    return chatId;
  } catch (err) {
    logger.error("[YouTubeLiveChat] Erreur fetchActiveLiveChatId:", err);
    return null;
  }
}

async function pollLiveChat(): Promise<void> {
  if (!liveChatId) {
    liveChatId = await fetchActiveLiveChatId();
    if (!liveChatId) return;
  }

  const token = await getValidToken();
  if (!token) return;

  try {
    const url = `https://www.googleapis.com/youtube/v3/liveChatMessages?liveChatId=${liveChatId}&part=snippet,authorDetails&maxResults=200`;
    const res = await fetch(url, { headers: { Authorization: `Bearer ${token}` } });

    if (!res.ok) {
      const errText = await res.text();
      logger.error(`[YouTubeLiveChat] Erreur poll: ${errText}`);
      if (res.status === 404 || res.status === 403) {
        liveChatId = null;
      }
      return;
    }

    const data = await res.json() as {
      items?: Array<{
        id: string;
        snippet: {
          textMessageDetails?: { messageText: string };
          publishedAt: string;
        };
        authorDetails: {
          displayName: string;
          channelId: string;
          isChatModerator: boolean;
          isChatOwner: boolean;
        };
      }>;
      pollingIntervalMillis: number;
    };

    if (!data.items || data.items.length === 0) return;

    const newMessages = lastMessageId
      ? data.items.filter((m) => m.id !== lastMessageId)
      : data.items.slice(-5);

    if (newMessages.length === 0) return;

    lastMessageId = data.items[data.items.length - 1].id;

    for (const msg of newMessages) {
      const text = msg.snippet.textMessageDetails?.messageText || "";
      const author = msg.authorDetails.displayName;
      const lowerText = text.toLowerCase();

      const matchedPattern = FRIEND_REQUEST_PATTERNS.find((p) => lowerText.includes(p));
      if (matchedPattern) {
        const reply = `@${author} 🚫 Je n'ajoute personne sur Discord, je suis un bot ! Pas la peine de demander mon pseudo ou de vouloir jouer ensemble. 🤖`;
        await sendLiveChatMessage(reply);
        continue;
      }

      if (lowerText.includes("discord")) {
        const now = Date.now();
        if (now - discordLinkCooldown >= 10_000) {
          discordLinkCooldown = now;
          const reply = `@${author} 📌 Voici le lien du serveur Discord : ${DISCORD_INVITE_LINK}`;
          await sendLiveChatMessage(reply);
        }
      }
    }
  } catch (err) {
    logger.error("[YouTubeLiveChat] Erreur pollLiveChat:", err);
  }
}

async function sendLiveChatMessage(messageText: string): Promise<void> {
  const token = await getValidToken();
  if (!token || !liveChatId) return;

  try {
    const body = JSON.stringify({
      snippet: {
        liveChatId,
        type: "textMessageEvent",
        textMessageDetails: { messageText },
      },
      authorDetails: { isChatModerator: false, isChatOwner: false },
    });

    const res = await fetch("https://www.googleapis.com/youtube/v3/liveChatMessages?part=snippet", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${token}`,
        "Content-Type": "application/json",
      },
      body,
    });

    if (!res.ok) {
      const errText = await res.text();
      logger.error(`[YouTubeLiveChat] Erreur envoi message: ${errText}`);
      return;
    }

    logger.info(`[YouTubeLiveChat] Message envoyé: "${messageText.substring(0, 50)}..."`);
  } catch (err) {
    logger.error("[YouTubeLiveChat] Erreur sendLiveChatMessage:", err);
  }
}

export function startYouTubeLiveChat(): void {
  if (!YOUTUBE_CLIENT_ID || !YOUTUBE_CLIENT_SECRET) {
    logger.warn("[YouTubeLiveChat] Credentials YouTube manquants — service désactivé");
    return;
  }

  if (!YOUTUBE_REFRESH_TOKEN) {
    logger.warn("[YouTubeLiveChat] Pas de refresh token — lance 'npm run youtube:auth' pour l'obtenir");
    return;
  }

  if (pollingInterval) {
    logger.info("[YouTubeLiveChat] Déjà en cours");
    return;
  }

  logger.info("[YouTubeLiveChat] Démarrage du polling du chat YouTube...");
  pollingInterval = setInterval(pollLiveChat, 10_000);
  if (pollingInterval.unref) pollingInterval.unref();
  void pollLiveChat();
}

export function stopYouTubeLiveChat(): void {
  if (pollingInterval) {
    clearInterval(pollingInterval);
    pollingInterval = null;
    liveChatId = null;
    lastMessageId = null;
    logger.info("[YouTubeLiveChat] Service arrêté");
  }
}

export function setYouTubeRefreshToken(token: string): void {
  YOUTUBE_REFRESH_TOKEN = token;
}

export function isYouTubeLiveChatActive(): boolean {
  return pollingInterval !== null;
}
