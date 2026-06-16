/* ═══════════════════════════════════════════════════════════════════════════
   dev-mode.js — Mock data pour développement et tests visuels hors Electron
   S'exécute uniquement si window.electronAPI n'est pas déjà défini.
   ═══════════════════════════════════════════════════════════════════════════ */

if (!window.electronAPI) {
  var mockTweets = 0, mockNews = 0, mockSkins = 0;

  window.electronAPI = {
    _apiBase: "http://localhost:3002",
    // Dashboard
    getStatus: function () {
      return Promise.resolve({
        online: true, uptime: 84200, memoryMB: 245.6, cpuPercent: 34,
        loadAvg: [1.2, 0.9, 0.7], ping: 42,
        guildCount: 18, userCount: 45200, activePlatforms: 5, totalPlatforms: 7,
        cacheTotal: 3200, alertsTotal: 2, pid: 12345, version: "1.1.0"
      });
    },

    getPlatforms: function () {
      return Promise.resolve([
        { id: "free-games", label: "Jeux gratuits (Epic/Steam/GOG...)", active: true, cacheCount: 450, lastRun: new Date().toISOString(), recentErrors: 0 },
        { id: "twitter", label: "Twitter / X", active: true, cacheCount: 1200, lastRun: new Date().toISOString(), recentErrors: 1 },
        { id: "deals", label: "Bons plans (Dealabs/PPDG...)", active: true, cacheCount: 320, lastRun: new Date().toISOString(), recentErrors: 0 },
        { id: "steam-news", label: "Actualités Steam", active: true, cacheCount: 180, lastRun: new Date().toISOString(), recentErrors: 0 },
        { id: "patch-notes", label: "Patch notes globaux", active: false, cacheCount: 95, lastRun: null, recentErrors: 2 },
        { id: "instantgaming-news", label: "Instant Gaming - News", active: true, cacheCount: 60, lastRun: new Date().toISOString(), recentErrors: 0 },
        { id: "instantgaming-giveaway", label: "Instant Gaming - Giveaway", active: true, cacheCount: 210, lastRun: new Date().toISOString(), recentErrors: 0 },
      ]);
    },

    getCache: function () { return Promise.resolve({ total: 3200, stats: {} }); },
    togglePlatform: function () { return Promise.resolve(); },
    triggerCleanup: function () { return Promise.resolve({ before: 3200, after: 2800 }); },
    restartBot: function () { return Promise.resolve(); },

    // Health & Activity
    getHealth: function () {
      return Promise.resolve([
        { name: "Discord", status: "ok", message: "Gateway connecté", passed: true },
        { name: "Base de données", status: "ok", message: "Prisma connecté", passed: true },
        { name: "Plateformes", status: "warning", message: "1 flux en pause", passed: true },
      ]);
    },
    getActivity: function () { return Promise.resolve({ events: [] }); },
    getDiscord: function () { return Promise.resolve({ ping: 42, guildCount: 18 }); },
    getStats: function () { return Promise.resolve({ messagesEnvoyes: 1450, alertes: 12, erreurs: 3, detections: 890 }); },

    // Feeds
    fluxPause: function () { return Promise.resolve(); },
    fluxResume: function () { return Promise.resolve(); },
    fluxTest: function () { return Promise.resolve(); },

    // Fortnite — données mockées riches pour tester les animations
    getFortnite: function () {
      mockTweets += Math.floor(Math.random() * 3);
      mockNews += Math.floor(Math.random() * 2);
      mockSkins += Math.floor(Math.random() * 5);
      var now = new Date().toISOString();
      return Promise.resolve({
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
      });
    },

    // Logs
    getLogs: function () { return Promise.resolve({ total: 0, logs: [] }); },
    clearLogs: function () { return Promise.resolve(); },

    // WebSocket (mock — pas de vraie connexion)
    connectWebSocket: function () {
      return Promise.resolve({ ok: true });
    },
    disconnectWebSocket: function () { return Promise.resolve(); },
    onWsMessage: function (callback) {
      // Simuler des événements périodiques
      setInterval(function () {
        callback({ type: "log", level: "info", message: "[DEV] " + new Date().toLocaleTimeString() + " — Bot opérationnel", timestamp: new Date().toISOString() });
      }, 8000);
      // Simuler une détection Fortnite toutes les 15s
      setInterval(function () {
        callback({ type: "fortnite-update", tweets: 1, skins: 2 });
      }, 15000);
      // Simuler platform-update
      setInterval(function () {
        callback({ type: "platform-update", platforms: [] });
      }, 30000);
    },
    onWsStatus: function (callback) {
      setTimeout(function () { callback("connected"); }, 500);
    },

    // Settings
    loadSettings: function () { return Promise.resolve({ token: "****", port: 3002, theme: "dark", refreshInterval: 5 }); },
    saveSettings: function () { return Promise.resolve(); },

    // Window controls (no-op en mode dev)
    minimizeWindow: function () {},
    maximizeWindow: function () {},
    closeWindow: function () {},
  };

  console.log("[DEV MODE] Mock electronAPI activé — données simulées");
}
