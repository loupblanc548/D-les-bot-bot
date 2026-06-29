window.__mockFallback = {
  _tweets: 142, _news: 89, _skins: 1247,

  getStatus() {
    return {
      online: true, uptime: 84200, memoryMb: 245.6, cpuPercent: 34,
      ping: 42, guilds: 18, members: 45200, commands: 24,
    };
  },

  getPlatforms() {
    return [
      { id: "twitter", name: "Twitter / X", platform: "twitter", active: true, lastFetch: new Date().toISOString() },
      { id: "youtube", name: "YouTube", platform: "youtube", active: true, lastFetch: new Date().toISOString() },
      { id: "rss", name: "RSS News", platform: "rss", active: true, lastFetch: new Date().toISOString() },
      { id: "patch-notes", name: "Patch notes", platform: "rss", active: false, lastFetch: null },
    ];
  },

  getHealth() {
    return [
      { name: "Discord", status: "ok", message: "Gateway connecté", passed: true },
      { name: "Base de données", status: "ok", message: "Prisma connecté", passed: true },
      { name: "Plateformes", status: "warning", message: "1 flux en pause", passed: true },
    ];
  },

  getFortnite() {
    return {
      tweets: this._tweets, news: this._news, skins: this._skins,
      accounts: [
        { name: "FortniteFR", platform: "Twitter/X", type: "Fortnite News", lastDetection: new Date().toISOString(), active: true },
        { name: "HYPEX", platform: "Twitter/X", type: "Leaks", lastDetection: new Date().toISOString(), active: true },
      ],
      detections: [],
      shop: [], shopItemsTotal: 6, cosmeticsTracked: 4521,
      aggregationError: false, aggregatedAt: new Date().toISOString(),
    };
  },

  getLogs() {
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
  },
};
