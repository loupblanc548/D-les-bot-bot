/* ═══════════════════════════════════════════════════════════════════════════
   dev-mode.js — Mock data pour développement et tests visuels hors Electron
   S'exécute uniquement si window.electronAPI n'est pas déjà défini.
   ═══════════════════════════════════════════════════════════════════════════ */

if (!window.electronAPI) {
  var mockTweets = 0, mockNews = 0, mockSkins = 0;

  window.electronAPI = {
    _apiBase: "http://localhost:3002",
    versions: { electron: "28.0.0", node: "20.10.0", chrome: "120.0.0" },
    // Dashboard
    getStatus: function () {
      var self = this;
      return self.apiFetch("/api/status").catch(function () {
        return { online: true, uptime: 84200, memoryMb: 245.6, cpuPercent: 34, ping: 42, guilds: 18, members: 45200, commands: 24 };
      });
    },

    getPlatforms: function () {
      var self = this;
      return self.apiFetch("/api/platforms").catch(function () {
        return [
          { id: "twitter", name: "Twitter / X", platform: "twitter", active: true, lastFetch: new Date().toISOString() },
          { id: "youtube", name: "YouTube", platform: "youtube", active: true, lastFetch: new Date().toISOString() },
          { id: "rss", name: "RSS News", platform: "rss", active: true, lastFetch: new Date().toISOString() },
          { id: "patch-notes", name: "Patch notes", platform: "rss", active: false, lastFetch: null },
        ];
      });
    },

    getCache: function () { return Promise.resolve({ total: 3200, stats: {} }); },
    togglePlatform: function () { return Promise.resolve(); },
    triggerCleanup: function () { return Promise.resolve({ success: true }); },
    restartBot: function () { return Promise.resolve(); },

    // Health & Activity
    getHealth: function () {
      var self = this;
      return self.apiFetch("/api/health").catch(function () {
        return [
          { name: "Discord", status: "ok", message: "Gateway connecté", passed: true },
          { name: "Base de données", status: "ok", message: "Prisma connecté", passed: true },
          { name: "Plateformes", status: "warning", message: "1 flux en pause", passed: true },
        ];
      });
    },
    getActivity: function () { return Promise.resolve({ events: [] }); },
    getDiscord: function () { return Promise.resolve({ ping: 42, guildCount: 18 }); },
    getStats: function () { return Promise.resolve({ messagesEnvoyes: 1450, alertes: 12, erreurs: 3, detections: 890 }); },

    // Generic API fetch — in browser mode, do real HTTP requests to the bot API
    apiFetch: function (endpoint, options) {
      var settings = {};
      try { settings = JSON.parse(localStorage.getItem("botSettings") || "{}"); } catch {}
      var baseUrl = (settings.apiUrl || "http://localhost:3002").replace(/\/$/, "");
      var token = settings.token || "";
      var url = baseUrl + endpoint;
      var fetchOpts = Object.assign({}, options, {
        headers: Object.assign({
          "Content-Type": "application/json",
        }, options && options.headers || {}),
      });
      if (token) fetchOpts.headers["Authorization"] = "Bearer " + token;
      return fetch(url, fetchOpts).then(function (res) {
        if (!res.ok) throw new Error("API error " + res.status);
        return res.json();
      }).catch(function (e) {
        console.warn("[Browser] apiFetch failed:", endpoint, e.message);
        throw e;
      });
    },
    // DM
    sendDM: function (userId, message) {
      return this.apiFetch("/api/dm/send", { method: "POST", body: JSON.stringify({ userId: userId, message: message }) });
    },
    getDMHistory: function () {
      return this.apiFetch("/api/dm/history").catch(function () { return []; });
    },
    // Servers — try real API first, fallback to mock
    getServers: function () {
      var self = this;
      return self.apiFetch("/api/servers").catch(function () {
        return [
          { id: "123456789", name: "Serveur de test", memberCount: 42, ownerName: "Admin", iconURL: null }
        ];
      });
    },

    // Moderation — mock data
    getModeration: function () {
      return Promise.resolve({
        stats: { warns: 12, mutes: 3, bans: 1, automod: 28 },
        recentSanctions: [
          { id: 1, type: "WARN", userId: "111", reason: "Spam répété", moderatorId: "222", createdAt: new Date(Date.now() - 3600000).toISOString() },
          { id: 2, type: "MUTE", userId: "333", reason: "Caps excessif", moderatorId: "222", createdAt: new Date(Date.now() - 7200000).toISOString() },
          { id: 3, type: "BAN", userId: "444", reason: "NSFW", moderatorId: "222", createdAt: new Date(Date.now() - 10800000).toISOString() },
        ],
        tempbans: [
          { id: 10, userId: "555", action: "Tempban 2h — Insultes", createdAt: new Date(Date.now() - 1800000).toISOString() },
        ],
        automodFeed: [
          { timestamp: Date.now() - 60000, level: "info", message: "[AutoMod] Word blacklist: User#1234 — 'badword'" },
          { timestamp: Date.now() - 120000, level: "debug", message: "[AutoMod] Anti-caps: User#5678 (85%)" },
          { timestamp: Date.now() - 180000, level: "info", message: "[AutoMod] Mass mention: User#9012 (6 mentions)" },
        ],
      });
    },

    // Security — mock data
    getSecurity: function () {
      return Promise.resolve({
        stats: { riskAvg: 23, altsCount: 2, eventsCount: 15, shadowCount: 1 },
        riskyUsers: [
          { id: 1, userId: "666", action: "Alt account detected", details: "Linked to User#1234", createdAt: new Date(Date.now() - 3600000).toISOString() },
          { id: 2, userId: "777", action: "Mass join detected", details: "5 accounts in 2min", createdAt: new Date(Date.now() - 7200000).toISOString() },
        ],
        eventsFeed: [
          { timestamp: Date.now() - 30000, level: "warn", message: "[Security] Alt detection: User#666 linked to User#1234" },
          { timestamp: Date.now() - 90000, level: "info", message: "[Risk] User#777 risk score: 45/100" },
          { timestamp: Date.now() - 150000, level: "error", message: "[Security] Raid attempt blocked — 5 accounts" },
        ],
        osintResults: [
          { id: 1, userId: "888", action: "OSINT lookup", details: "3 social profiles found", createdAt: new Date(Date.now() - 86400000).toISOString() },
        ],
      });
    },

    // Music — mock data
    getMusic: function () {
      return Promise.resolve({
        stats: { voiceCount: 1, queueCount: 3 },
        nowPlaying: {
          title: "Lofi Hip Hop Radio — Beats to Relax/Study",
          url: "https://youtube.com/watch?v=jfKfPfyJRdk",
          duration: "1:59:42",
          guild: "Serveur de test",
        },
        queues: [{
          guild: "Serveur de test",
          playing: true,
          volume: 65,
          songs: [
            { title: "Lofi Hip Hop Radio — Beats to Relax/Study", url: "https://youtube.com/watch?v=jfKfPfyJRdk", duration: "1:59:42" },
            { title: "Chillhop Yearmix 2024", url: "https://youtube.com/watch?v=abc", duration: "42:18" },
            { title: "Nujabes — Aruarian Dance", url: "https://youtube.com/watch?v=def", duration: "4:25" },
          ],
        }],
      });
    },
    musicControl: function () { return Promise.resolve({ success: true }); },

    // Fortnite — try real API first, fallback to mock
    getFortnite: function () {
      var self = this;
      return self.apiFetch("/api/fortnite").catch(function () {
        mockTweets += Math.floor(Math.random() * 3);
        mockNews += Math.floor(Math.random() * 2);
        mockSkins += Math.floor(Math.random() * 5);
        var now = new Date().toISOString();
        return {
          tweets: mockTweets,
          news: mockNews,
          skins: mockSkins,
          accounts: [
            { name: "FortniteFR", platform: "Twitter/X", type: "Fortnite News", lastDetection: now, active: true },
            { name: "FortniteGame", platform: "Twitter/X", type: "Fortnite News", lastDetection: now, active: true },
            { name: "HYPEX", platform: "Twitter/X", type: "Leaks", lastDetection: now, active: true },
            { name: "ShiinaBR", platform: "Twitter/X", type: "Leaks", lastDetection: now, active: true },
            { name: "Fortnite", platform: "YouTube", type: "Vidéos", lastDetection: now, active: true },
          ],
          detections: [
            { type: "tweets", time: now, message: "Tweet Fortnite: Nouvelle mise à jour v34.20 disponible !" },
            { type: "skins", time: now, message: "3 skin(s) trouvé(s) en wishlist" },
            { type: "news", time: now, message: "Fortnite Chapter 6 dévoilé" },
            { type: "tweets", time: now, message: "Tweet Fortnite: Collaboration Marvel annoncée" },
          ],
          shop: [
            { name: "Renegade Raider", rarity: "legendary", price: 1200, icon: "💀" },
            { name: "Aerial Assault Trooper", rarity: "epic", price: 1500, icon: "🪖" },
            { name: "Skull Trooper", rarity: "legendary", price: 1500, icon: "💀" },
            { name: "Ghoul Trooper", rarity: "epic", price: 1500, icon: "👻" },
            { name: "Black Knight", rarity: "legendary", price: 2000, icon: "⚔️" },
            { name: "Sparkle Specialist", rarity: "rare", price: 1200, icon: "✨" },
          ],
          shopDate: new Date().toISOString().split("T")[0],
          shopItemsTotal: 6,
          cosmeticsTracked: 4521,
          aggregationError: false,
          aggregatedAt: now
        };
      });
    },

    // Logs — try real API first, fallback to mock
    getLogs: function (params) {
      var self = this;
      var qs = "";
      if (params && typeof params === "object") {
        var parts = [];
        for (var k in params) { if (params[k] !== undefined) parts.push(encodeURIComponent(k) + "=" + encodeURIComponent(params[k])); }
        qs = parts.length ? "?" + parts.join("&") : "";
      }
      return self.apiFetch("/api/logs" + qs).catch(function () {
        var now = Date.now();
        return [
          { level: "info", message: "Bot connecté — 18 serveurs, 45200 membres", timestamp: now - 5000 },
          { level: "info", message: "[AutoMod] Slowmode auto activé sur #general (22 msg/min)", timestamp: now - 15000 },
          { level: "warn", message: "[Security] Alt detection: User#666 linked to User#1234", timestamp: now - 30000 },
          { level: "info", message: "[Fortnite] Nouveau skin détecté: Shadow Midas", timestamp: now - 60000 },
          { level: "error", message: "[API] Rate limit hit on Twitter endpoint — retry in 60s", timestamp: now - 120000 },
          { level: "info", message: "[Music] Lofi Hip Hop Radio ajouté à la file — Serveur de test", timestamp: now - 180000 },
          { level: "warn", message: "[AutoMod] Word blacklist: User#1234 — 'badword'", timestamp: now - 240000 },
          { level: "info", message: "[Risk] User#777 risk score: 45/100", timestamp: now - 300000 },
          { level: "info", message: "Commande /mod ban exécutée par Admin#0001", timestamp: now - 360000 },
          { level: "info", message: "[Health] Discord Gateway: OK, Prisma: OK, Plateformes: 1 en pause", timestamp: now - 420000 },
        ];
      });
    },
    clearLogs: function () { return Promise.resolve(); },

    // WebSocket (mock — no fake events to avoid duplicate notifications)
    connectWebSocket: function () {
      return Promise.reject(new Error("WebSocket not available in browser mode"));
    },
    disconnectWebSocket: function () { return Promise.resolve(); },
    onWsMessage: function (callback) {
      // No simulated events — polling fallback handles data refresh
    },
    onWsStatus: function (callback) {
      setTimeout(function () { callback("disconnected"); }, 500);
    },

    // Settings — use localStorage in browser mode
    loadSettings: function () {
      try {
        var s = JSON.parse(localStorage.getItem("botSettings") || "{}");
        return Promise.resolve(s);
      } catch {
        return Promise.resolve({});
      }
    },
    saveSettings: function (newSettings) {
      try {
        var existing = JSON.parse(localStorage.getItem("botSettings") || "{}");
        var merged = Object.assign({}, existing, newSettings);
        localStorage.setItem("botSettings", JSON.stringify(merged));
      } catch {}
      return Promise.resolve();
    },

    // Window controls (no-op en mode dev)
    minimizeWindow: function () {},
    maximizeWindow: function () {},
    closeWindow: function () {},
  };

  console.log("[DEV MODE] Mock electronAPI activé — données simulées");
}
