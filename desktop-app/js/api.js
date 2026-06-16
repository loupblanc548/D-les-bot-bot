/* ═══════════════════════════════════════════════════════════════════════════
   api.js — REST API client for the bot control server
   ═══════════════════════════════════════════════════════════════════════════ */

const API = {
  async get(endpoint) {
    try {
      return await window.electronAPI[this.methodMap[endpoint]]();
    } catch (e) {
      console.error("[API] GET", endpoint, e.message);
      throw e;
    }
  },

  methodMap: {
    "/api/status": "getStatus",
    "/api/platforms": "getPlatforms",
    "/api/cache": "getCache",
    "/api/health": "getHealth",
    "/api/activity": "getActivity",
    "/api/discord": "getDiscord",
    "/api/stats": "getStats",
    "/api/fortnite": "getFortnite",
  },

  async fetchStatus() {
    try {
      const data = await window.electronAPI.getStatus();
      Store.update("status", data);
      return data;
    } catch (e) {
      Store.update("status", null);
      throw e;
    }
  },

  async fetchPlatforms() {
    try {
      const platforms = await window.electronAPI.getPlatforms();
      Store.update("platforms", platforms);
      return platforms;
    } catch (e) {
      throw e;
    }
  },

  async fetchHealth() {
    try {
      const checks = await window.electronAPI.getHealth();
      Store.update("health", checks);
      return checks;
    } catch (e) {
      throw e;
    }
  },

  async fetchFortnite() {
    try {
      const data = await window.electronAPI.getFortnite();
      Store.update("fortnite", data);
      return data;
    } catch (e) {
      Store.update("fortnite", null);
      throw e;
    }
  },

  async togglePlatform(platformId, enable) {
    try {
      await window.electronAPI.togglePlatform(platformId, enable);
      await this.fetchPlatforms();
    } catch (e) {
      Notifications.error("Échec toggle: " + e.message);
    }
  },

  async triggerCleanup() {
    try {
      const res = await window.electronAPI.triggerCleanup();
      Notifications.success("Cache nettoyé: " + res.before + " → " + res.after);
    } catch (e) {
      Notifications.error("Échec nettoyage: " + e.message);
    }
  },

  async restartBot() {
    if (!confirm("Redémarrer le bot ?")) return;
    try {
      await window.electronAPI.restartBot();
      Notifications.warning("Bot en redémarrage...");
    } catch (e) {
      Notifications.error("Échec: " + e.message);
    }
  },
};
