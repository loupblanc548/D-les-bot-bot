/* ═══════════════════════════════════════════════════════════════════════════
   minecraft.js — Minecraft LLM Agent control panel
   ═══════════════════════════════════════════════════════════════════════════ */

const Minecraft = {
  _logPollInterval: null,
  _statusPollInterval: null,

  init() {
    this._startPolling();
  },

  _startPolling() {
    this._statusPollInterval = setInterval(() => this.refresh(true), 5000);
    this._logPollInterval = setInterval(() => this._fetchLogs(), 3000);
  },

  async refresh(silent) {
    try {
      const status = await window.electronAPI.mcStatus();
      this._renderStatus(status);
      if (!silent) {
        const world = await window.electronAPI.mcWorld();
        this._renderWorld(world);
        await this._fetchLogs();
      }
    } catch (e) {
      if (!silent) Notifications.error("MC Agent injoignable: " + (e.message || e));
    }
  },

  _renderStatus(data) {
    if (!data) {
      const set = (id, v) => { const el = document.getElementById(id); if (el) el.textContent = v; };
      set("mc-connected", "Hors ligne");
      set("mc-username", "--");
      set("mc-health", "--");
      set("mc-food", "Faim: --");
      set("mc-agent-status", "--");
      set("mc-llm-model", "--");
      set("mc-pos", "--");
      set("mc-server", "--");
      return;
    }
    const set = (id, v) => { const el = document.getElementById(id); if (el) el.textContent = v; };
    set("mc-connected", data.connected ? "En ligne" : "Hors ligne");
    set("mc-username", data.username || "--");
    set("mc-health", data.health !== undefined ? data.health + "/20" : "--");
    set("mc-food", "Faim: " + (data.food !== undefined ? data.food + "/20" : "--"));
    set("mc-agent-status", data.agent_running ? "En cours" : "Inactif");
    set("mc-llm-model", data.llm_model || "--");
    if (data.position) {
      set("mc-pos", data.position.x + ", " + data.position.y + ", " + data.position.z);
    }
    set("mc-server", data.server || data.mc_server || "--");
  },

  _renderWorld(data) {
    const el = document.getElementById("mc-world-state");
    if (!el) return;
    if (!data || data.error) {
      el.innerHTML = '<div class="empty-state"><div class="empty-icon">🌍</div>' + Utils.escapeHtml(data?.error || "Monde non disponible") + '</div>';
      return;
    }
    const lines = [];
    if (data.health !== undefined) lines.push("❤️ Santé: " + data.health + "/20");
    if (data.food !== undefined) lines.push("🍖 Faim: " + data.food + "/20");
    if (data.position) lines.push("📍 Position: " + data.position.x + ", " + data.position.y + ", " + data.position.z);
    if (data.inventory) {
      const items = Array.isArray(data.inventory) ? data.inventory : Object.entries(data.inventory);
      if (items.length > 0) {
        lines.push("\n🎒 Inventaire (" + items.length + "):");
        items.slice(0, 20).forEach((item) => {
          if (Array.isArray(item)) lines.push("  " + item[0] + ": " + item[1]);
          else lines.push("  " + (item.name || item.type || "—") + (item.count ? " x" + item.count : ""));
        });
      }
    }
    if (data.nearbyBlocks) {
      const blocks = Array.isArray(data.nearbyBlocks) ? data.nearbyBlocks : [];
      if (blocks.length > 0) {
        lines.push("\n🧱 Blocs proches (" + blocks.length + "):");
        blocks.slice(0, 10).forEach((b) => lines.push("  " + (b.type || b.name || "—") + " @ " + (b.x || "") + "," + (b.y || "") + "," + (b.z || "")));
      }
    }
    if (data.nearbyEntities) {
      const ents = Array.isArray(data.nearbyEntities) ? data.nearbyEntities : [];
      if (ents.length > 0) {
        lines.push("\n👤 Entités proches (" + ents.length + "):");
        ents.slice(0, 10).forEach((e) => lines.push("  " + (e.type || e.name || "—") + (e.distance ? " (" + e.distance + "m)" : "")));
      }
    }
    el.textContent = lines.length > 0 ? lines.join("\n") : "Aucune donnée mondiale disponible";
  },

  async _fetchLogs() {
    try {
      const result = await window.electronAPI.mcLog(30);
      const el = document.getElementById("mc-log-console");
      if (!el) return;
      if (result?.log) {
        const lines = result.log.split("\n").filter(Boolean);
        if (lines.length === 0) {
          el.innerHTML = '<div class="empty-state"><div class="empty-icon">📋</div>Aucun log</div>';
        } else {
          el.textContent = lines.join("\n");
          el.scrollTop = el.scrollHeight;
        }
      }
    } catch {
      // Silent fail for polling
    }
  },

  async setGoal() {
    const goal = document.getElementById("mc-goal-input")?.value?.trim();
    const maxActions = parseInt(document.getElementById("mc-max-actions")?.value) || 80;
    if (!goal) { Notifications.warning("Entre un objectif"); return; }
    try {
      Notifications.info("🎯 Objectif envoyé: " + goal);
      const result = await window.electronAPI.mcGoal(goal, maxActions);
      if (result?.success !== false) {
        Notifications.success("Agent démarré: " + (result.message || result.goal || goal));
      } else {
        Notifications.error("Échec: " + (result.error || result.message || "erreur"));
      }
    } catch (e) { Notifications.error("Échec: " + (e.message || e)); }
  },

  async stop() {
    try {
      await window.electronAPI.mcStop();
      Notifications.warning("⏹ Agent arrêté");
      this.refresh(true);
    } catch (e) { Notifications.error("Échec stop: " + (e.message || e)); }
  },

  async connect() {
    const server = document.getElementById("mc-server-input")?.value?.trim();
    const username = document.getElementById("mc-username-input")?.value?.trim() || "LLM_Bot";
    if (!server) { Notifications.warning("Entre l'IP:port du serveur"); return; }
    if (!/^[a-zA-Z0-9._-]+(:\d{1,5})?$/.test(server)) {
      Notifications.error("Format invalide. Ex: 123.45.67.89:25565");
      return;
    }
    try {
      Notifications.info("🔗 Connexion à " + server + "...");
      const result = await window.electronAPI.mcConnect(server, username);
      if (result?.success) {
        Notifications.success("✅ Connecté à " + server + " en tant que " + username);
        this.refresh(true);
      } else {
        Notifications.error("Échec: " + (result?.message || result?.error || "erreur"));
      }
    } catch (e) { Notifications.error("Échec connexion: " + (e.message || e)); }
  },

  async quickAction(type, params) {
    try {
      Notifications.info("⚡ " + type + "...");
      const result = await window.electronAPI.mcAction(type, params);
      if (result?.success) {
        Notifications.success("✅ " + type + ": " + (result.message || "OK"));
      } else {
        Notifications.warning("⚠ " + type + ": " + (result?.message || "échec"));
      }
    } catch (e) { Notifications.error("Échec " + type + ": " + (e.message || e)); }
  },

  async sendChat() {
    const msg = document.getElementById("mc-chat-input")?.value?.trim();
    if (!msg) return;
    try {
      await window.electronAPI.mcChat(msg);
      Notifications.success("💬 Message envoyé: " + msg.substring(0, 50));
      document.getElementById("mc-chat-input").value = "";
    } catch (e) { Notifications.error("Échec chat: " + (e.message || e)); }
  },
};
