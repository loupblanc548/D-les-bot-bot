/* ═══════════════════════════════════════════════════════════════════════════
   dashboard.js — Main dashboard rendering & tab management
   ═══════════════════════════════════════════════════════════════════════════ */

const Dashboard = {
  _refreshInterval: null,
  _eventsCounter: 0,
  _guildCount: 0,
  _userCount: 0,

  init() {
    this._setupTabs();
    this._setupActions();
    this._setupSettings();
    this._updateStatsLoop();
    Store.on("status", (data) => this._renderStatus(data));
    Store.on("platforms", (data) => data && this._renderPlatforms(data));
    Store.on("health", (data) => data && this._renderHealth(data));
    Store.on("logs", () => { LogConsole.render(); this._renderActivity(); });
    Store.on("fortnite", (data) => data && this._renderFortnite(data));
    Store.update("init", true);

    const verEl = document.getElementById("settings-electron-ver");
    const nodeEl = document.getElementById("settings-node-ver");
    if (verEl) verEl.textContent = (window.electronAPI && window.electronAPI.versions?.electron) || "N/A";
    if (nodeEl) nodeEl.textContent = (window.electronAPI && window.electronAPI.versions?.node) || navigator.userAgent.match(/Node\.js\/([\d.]+)/)?.[1] || "N/A";
  },

  _setupSettings() {
    window.electronAPI.loadSettings().then((s) => {
      Store.update("settings", s);
      const tab = document.getElementById("tab-settings");
      if (tab && !tab.querySelector("#setting-api-url")) {
        const defaultUrl = s.apiUrl || "http://31.220.79.90:3002";
        const defaultToken = s.token || "";
        const safeToken = defaultToken.replace(/"/g, "&quot;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
        const safeUrl = defaultUrl.replace(/"/g, "&quot;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
        const section = document.createElement("div");
        section.className = "settings-section";
        section.innerHTML = `
          <div class="settings-title">🔗 Connexion VPS</div>
          <div class="setting-row" style="flex-direction:column;align-items:stretch">
            <div class="setting-label">URL API du bot</div>
            <div class="setting-desc">Control server John (VPS, port 3002)</div>
            <input type="text" id="setting-api-url" value="${safeUrl}" style="width:100%;padding:8px 12px;background:var(--bg-tertiary);border:1px solid var(--border);border-radius:var(--radius-sm);color:var(--text);font-size:13px;margin-top:6px">
          </div>
          <div class="setting-row" style="flex-direction:column;align-items:stretch">
            <div class="setting-label">Token de contrôle</div>
            <div class="setting-desc">Le token d'authentification (CONTROL_TOKEN)</div>
            <input type="password" id="setting-api-token" value="${safeToken}" style="width:100%;padding:8px 12px;background:var(--bg-tertiary);border:1px solid var(--border);border-radius:var(--radius-sm);color:var(--text);font-size:13px;margin-top:6px">
          </div>
          <div class="setting-row">
            <button class="btn btn-primary btn-sm" onclick="saveApiSettings()" style="margin-top:8px">💾 Sauvegarder</button>
          </div>
        `;
        const railwaySection = document.getElementById("settings-railway");
        if (railwaySection) railwaySection.appendChild(section);
        else tab.insertBefore(section, tab.firstChild);
      }
    });
    window.saveApiSettings = async () => {
      const apiUrl = document.getElementById("setting-api-url")?.value || "";
      const token = document.getElementById("setting-api-token")?.value || "";
      await window.electronAPI.saveSettings({ apiUrl, token });
      Store.update("settings", { ...Store.get("settings"), apiUrl, token });
      if (window.Enhancements) Enhancements.logAction("settings", "Parametres API sauvegardes");
      Notifications.success("Paramètres sauvegardés. Reconnexion...");
      setTimeout(() => { WS.connect(); API.fetchStatus().catch(() => {}); }, 1000);
    };
  },

  _setupTabs() {
    document.querySelectorAll(".nav-btn[data-tab]").forEach((btn) => {
      btn.addEventListener("click", () => {
        document.querySelectorAll(".nav-btn").forEach((b) => b.classList.remove("active"));
        btn.classList.add("active");
        document.querySelectorAll(".tab").forEach((t) => t.classList.remove("active"));
        const tab = document.getElementById("tab-" + btn.dataset.tab);
        if (tab) { tab.classList.add("active"); tab.style.animation = "fadeIn 0.25s ease"; }
        // Clear Fortnite badge when entering the Fortnite tab
        if (btn.dataset.tab === "fortnite") {
          var badge = document.getElementById("fn-badge");
          if (badge) { badge.textContent = "0"; badge.style.display = "none"; }
          API.fetchFortnite().catch(() => {});
        }
        if (btn.dataset.tab === "knowledge") {
          Dashboard.fetchLearn();
        }
      });
    });
  },

  _setupActions() {
    window.restartBot = () => API.restartBot();
    window.triggerCleanup = () => API.triggerCleanup();
    window.togglePlatform = (id, enable) => API.togglePlatform(id, enable);
    window.refreshFortnite = () => { API.fetchFortnite(); Notifications.info("Actualisation Fortnite..."); };
    window.postFortniteShop = async () => {
      try {
        Notifications.info("Envoi de la boutique…");
        const result = await window.electronAPI.apiFetch("/api/fortnite/shop-post", { method: "POST" });
        if (result?.success) Notifications.success("Boutique envoyée dans le salon");
        else Notifications.warning(result?.error || "Boutique déjà postée ou API pas prête");
        API.fetchFortnite().catch(() => {});
      } catch (e) {
        Notifications.error("Envoi boutique impossible: " + (e.message || "erreur"));
      }
    };
    window.testFortniteDetection = async () => {
      try {
        await window.electronAPI.apiFetch("/api/fortnite/test", { method: "POST" });
        Notifications.success("Test Fortnite déclenché");
      } catch { Notifications.warning("Backend Fortnite non disponible"); }
    };
    window.clearLogs = () => LogConsole.clear();
    window.exportLogs = (fmt) => LogConsole.export(fmt);
    window.togglePauseLogs = () => LogConsole.togglePause();
    window.sendDM = async () => {
      const userId = document.getElementById("dm-user-id")?.value?.trim();
      const message = document.getElementById("dm-message")?.value?.trim();
      if (!userId || !message) { Notifications.warning("ID utilisateur et message requis"); return; }
      try {
        await window.electronAPI.sendDM(userId, message);
        Notifications.success("DM envoyé à " + userId);
        document.getElementById("dm-message").value = "";
        loadDMHistory();
      } catch (e) { Notifications.error("Échec envoi DM: " + e.message); }
    };
    window.loadDMHistory = async () => {
      try {
        const history = await window.electronAPI.getDMHistory();
        const el = document.getElementById("dm-history");
        if (!el) return;
        if (!history?.length) { el.innerHTML = '<div class="empty-state"><div class="empty-icon">💬</div>Aucun message envoyé</div>'; return; }
        el.innerHTML = history.slice(-50).map((d) => {
          const time = new Date(d.timestamp).toLocaleString("fr-FR");
          const status = d.success ? '<span style="color:var(--success)">✓</span>' : '<span style="color:var(--danger)">✕</span>';
          return '<div class="activity-item"><span class="activity-time">' + time + '</span>' + status + '<span class="activity-msg">→ ' + Utils.escapeHtml(d.userId) + ': ' + Utils.escapeHtml(d.message?.substring(0, 80)) + '</span></div>';
        }).join("");
      } catch {}
    };
    window.changeRefreshRate = (rate) => {
      const ms = parseInt(rate);
      clearInterval(Dashboard._refreshInterval);
      Dashboard._refreshInterval = setInterval(() => API.fetchStatus().catch(() => {}), ms);
      Notifications.info("Fréquence d'actualisation: " + (ms / 1000) + "s");
    };
    window.controlAction = async (action) => {
      try {
        if (window.Enhancements) Enhancements.logAction(action, "Action control: " + action);
        switch (action) {
          case "restart":
            if (!confirm("Vraiment redémarrer le bot ?")) return;
            Notifications.warning("Redémarrage du bot...");
            await window.electronAPI.apiFetch("/api/restart", { method: "POST" });
            Notifications.success("Bot redémarré");
            break;
          case "reload-commands":
            Notifications.info("Rechargement des commandes...");
            await window.electronAPI.apiFetch("/api/restart", { method: "POST" });
            Notifications.success("Bot redémarré (commandes rechargées)");
            break;
          case "clear-cache":
            Notifications.info("Vidage du cache...");
            await window.electronAPI.apiFetch("/api/flux/test", { method: "POST", body: JSON.stringify({ platformId: "all" }) });
            Notifications.success("Cache vidé");
            break;
          case "clear-logs":
            await window.electronAPI.clearLogs();
            LogConsole.clear();
            Notifications.success("Logs vidés");
            break;
          case "pause-all-flux":
            Notifications.warning("Pause de tous les flux...");
            await window.electronAPI.apiFetch("/api/flux/pause", { method: "POST", body: JSON.stringify({ platformId: "all" }) });
            Notifications.success("Flux mis en pause");
            break;
          case "resume-all-flux":
            Notifications.success("Reprise des flux...");
            await window.electronAPI.apiFetch("/api/flux/resume", { method: "POST", body: JSON.stringify({ platformId: "all" }) });
            Notifications.success("Flux repris");
            break;
          case "test-flux":
            Notifications.info("Test des flux...");
            await window.electronAPI.apiFetch("/api/flux/test", { method: "POST", body: JSON.stringify({ platformId: "all" }) });
            Notifications.success("Test déclenché");
            break;
          case "test-fortnite":
            Notifications.info("Test détection Fortnite...");
            await window.electronAPI.apiFetch("/api/fortnite/test", { method: "POST" });
            Notifications.success("Test Fortnite déclenché");
            break;
          case "refresh-fortnite":
            API.fetchFortnite().catch(() => {});
            Notifications.success("Données Fortnite actualisées");
            break;
          case "refresh-status":
            API.fetchStatus().catch(() => {});
            API.fetchPlatforms().catch(() => {});
            Notifications.success("Statut actualisé");
            break;
          case "export-logs":
            LogConsole.export("txt");
            break;
          case "health-check": {
            const health = await window.electronAPI.apiFetch("/api/health");
            if (health.status === "ok") Notifications.success("Bot en bonne santé — uptime: " + Math.floor(health.uptime) + "s");
            else Notifications.error("Problème détecté");
            break;
          }
        }
      } catch (e) {
        Notifications.error("Échec: " + (e.message || "erreur"));
      }
    };
    this._loadServers();
  },

  _updateStatsLoop() {
    API.fetchStatus().catch(() => {});
    API.fetchPlatforms().catch(() => {});
    API.fetchFortnite().catch(() => {});
    API.fetchHealth().catch(() => {});
    this.fetchLearn();
    this._fetchLogs();
    this._refreshInterval = setInterval(() => API.fetchStatus().catch(() => {}), 10000);
    this._platformsInterval = setInterval(() => API.fetchPlatforms().catch(() => {}), 30000);
    this._fortniteInterval = setInterval(() => API.fetchFortnite().catch(() => {}), 60000);
    this._logsInterval = setInterval(() => this._fetchLogs(), 5000);
  },

  _apiRetryCount: 0,
  _maxRetries: 5,

  async _fetchLogs() {
    try {
      const logs = await window.electronAPI.getLogs({ limit: 100 });
      if (logs && Array.isArray(logs)) {
        Store.update("logs", logs);
      }
    } catch {
      if (window.__mockFallback) {
        const logs = window.__mockFallback.getLogs();
        if (logs && Array.isArray(logs)) Store.update("logs", logs);
      }
    }
  },

  _renderStatus(data) {
    const wsIndicator = document.getElementById("ws-indicator");
    const wsStatus = document.getElementById("ws-status");

    if (!data) {
      const dot = document.getElementById("titlebar-dot");
      if (dot) dot.className = "offline";
      this._updateBento({ online: false, uptime: 0, ping: -1, memMb: 0, guilds: 0, members: 0, commands: 0, cpu: 0 });
      const pingOff = document.getElementById("sb-ping-val") || document.getElementById("sb-ping");
    if (pingOff) pingOff.textContent = "Ping: --";
    this._setLiveChip("off");
      this._updateGauge(0);

      // Update status bar dots
      document.querySelectorAll(".status-dot").forEach((d) => d.classList.remove("ok"));
      if (wsIndicator) wsIndicator.className = "ws-indicator offline";
      if (wsStatus) wsStatus.textContent = "Bot injoignable — retry en cours...";
      return;
    }

    const dot = document.getElementById("titlebar-dot");
    if (dot) dot.className = data.online ? "" : "offline";

    // Update status bar dots to ok when online
    if (data.online) {
      document.querySelectorAll(".status-dot").forEach((d) => d.classList.add("ok"));
      if (wsIndicator) wsIndicator.className = "ws-indicator connected";
      if (wsStatus) wsStatus.textContent = "Connecté";
    }

    const memMb = data.memoryMb || data.memoryMB || 0;
    const guilds = data.guilds ?? data.guildCount ?? 0;
    const members = data.members ?? data.userCount ?? 0;
    const ping = data.ping ?? -1;
    const cpu = data.cpuPercent ?? 0;

    this._updateBento({ online: data.online, uptime: data.uptime, ping, memMb, guilds, members, commands: data.commands || 0, cpu, john: data.john });
    const pingEl = document.getElementById("sb-ping-val") || document.getElementById("sb-ping");
    if (pingEl) pingEl.textContent = "Ping: " + (ping >= 0 ? ping + "ms" : "--");
    this._setLiveChip(data.__demo ? "demo" : data.online ? "live" : "off");

    this._updateGauge(cpu);
    Charts.record(cpu, memMb, Math.max(0, ping), this._eventsCounter);
    this._eventsCounter = 0;

    const set = (id, val) => { const el = document.getElementById(id); if (el) el.textContent = val; };
    set("ctrl-status", data.online ? "✅ Online" : "❌ Offline");
    set("ctrl-status-label", data.online ? "Bot opérationnel" : "Bot injoignable");
    set("ctrl-guilds", data.online ? Utils.formatNumber(guilds) : "--");
    set("ctrl-members", data.online ? Utils.formatNumber(members) : "--");
    set("ctrl-uptime", data.online ? Utils.formatUptime(data.uptime) : "--");
    set("ctrl-ping", data.online ? (ping >= 0 ? ping + "ms" : "--") : "--");
    set("ctrl-ram", data.online ? (memMb ? memMb + " MB" : "--") : "--");
  },

  _setLiveChip(state) {
    const chip = document.getElementById("live-chip");
    if (!chip) return;
    chip.className = "live-chip " + state;
    chip.textContent = state === "live" ? "LIVE" : state === "off" ? "OFF" : "DÉMO";
  },

  async fetchLearn() {
    try {
      const data = await window.electronAPI.apiFetch("/api/learn");
      this._renderLearn(data);
    } catch {
      this._renderLearn(null);
    }
  },

  _renderLearn(data) {
    const set = (id, val) => { const el = document.getElementById(id); if (el) el.textContent = val; };
    if (!data) {
      set("learn-count", "--");
      set("learn-remaining", "--");
      set("learn-batch", "--");
      set("learn-status", "Hors ligne");
      return;
    }
    set("learn-count", Utils.formatNumber(data.subjectsLearned || 0));
    set("learn-remaining", Utils.formatNumber(data.subjectsRemaining || 0));
    set("learn-batch", String(data.batchSize || 0));
    set("learn-status", data.isLearning ? "Apprend" : data.active ? "Actif" : "Pause");
    const label = document.getElementById("learn-status-label");
    if (label) label.textContent = data.webScanActive ? "Wiki + web" : "Self-learner";
  },

  _updateGauge(score) {
    const circle = document.getElementById("gauge-fill");
    if (!circle) return;
    const circumference = 2 * Math.PI * 52;
    const offset = circumference - (score / 100) * circumference;
    circle.style.strokeDasharray = circumference;
    circle.style.strokeDashoffset = offset;
    circle.style.stroke = score >= 80 ? "var(--danger)" : score >= 50 ? "var(--warning)" : "var(--success)";
    document.getElementById("gauge-value").textContent = score + "%";
  },

  _updateBento(d) {
    const set = (id, val) => { const el = document.getElementById(id); if (el) el.textContent = val; };
    set("bento-guilds-val", d.online ? Utils.formatNumber(d.guilds) : "--");
    set("bento-members-val", d.online ? Utils.formatNumber(d.members) : "--");
    set("bento-uptime-val", d.online ? Utils.formatUptime(d.uptime) : "--");
    set("bento-ping-val", d.online ? (d.ping >= 0 ? d.ping + "ms" : "--") : "--");
    set("bento-ram-val", d.online ? (d.memMb ? d.memMb + " MB" : "--") : "--");
    set("bento-cmds-val", d.online ? Utils.formatNumber(d.commands || 0) : "--");
    set("bento-cpu-val", d.online ? (d.cpu ? d.cpu.toFixed(1) + "%" : "--") : "--");
    const john = d.john || {};
    set("bento-shop-val", john.shopLastPosted || "--");
    set("bento-wish-val", john.wishlistCount != null ? Utils.formatNumber(john.wishlistCount) : "--");
    set("bento-vault-val", john.subjectsLearned != null ? Utils.formatNumber(john.subjectsLearned) : "--");
    set("bento-ai-val", john.model ? String(john.model).split("/").pop() : "--");
    const shopLabel = document.getElementById("bento-shop-label");
    if (shopLabel) shopLabel.textContent = john.shopLastPosted ? "Dernier envoi" : "Pas encore postée";
    const vaultLabel = document.getElementById("bento-vault-label");
    if (vaultLabel) vaultLabel.textContent = john.learnerBusy ? "En train d’apprendre" : "Sujets appris";

    const statusLabel = document.getElementById("bento-status-label");
    if (statusLabel) {
      statusLabel.textContent = d.online ? "En ligne" : "Hors ligne";
      statusLabel.style.color = d.online ? "var(--success)" : "var(--danger)";
    }

    const healthCell = document.getElementById("bento-health");
    if (healthCell) {
      healthCell.classList.toggle("bento-cell--accent", d.online);
      healthCell.classList.toggle("bento-cell--neutral", !d.online);
    }

    const alertsEl = document.getElementById("alert-list");
    if (alertsEl) {
      if (d.online) {
        const alerts = [];
        if (d.cpu && d.cpu > 80) alerts.push({ icon: "🔥", msg: "CPU élevé: " + d.cpu.toFixed(1) + "%", level: "error" });
        if (d.cpu && d.cpu > 50 && d.cpu <= 80) alerts.push({ icon: "⚠", msg: "CPU modéré: " + d.cpu.toFixed(1) + "%", level: "warn" });
        if (d.ping >= 0 && d.ping > 200) alerts.push({ icon: "📡", msg: "Latence élevée: " + d.ping + "ms", level: "warn" });
        if (d.memMb && d.memMb > 500) alerts.push({ icon: "💾", msg: "RAM élevée: " + d.memMb + " MB", level: "warn" });
        if (d.uptime && d.uptime < 300) alerts.push({ icon: "🔄", msg: "Bot récemment redémarré (< 5min)", level: "info" });
        if (!alerts.length) {
          alertsEl.innerHTML = '<div class="empty-state" style="padding:20px"><div class="empty-icon">✅</div>Système opérationnel</div>';
        } else {
          alertsEl.innerHTML = alerts.map(a =>
            '<div class="activity-item"><span class="activity-dot" style="background:' +
            (a.level === "error" ? "var(--danger)" : a.level === "warn" ? "var(--warning)" : "var(--accent)") +
            '">' + a.icon + '</span><span class="activity-msg">' + a.msg + '</span></div>'
          ).join("");
        }
      } else {
        alertsEl.innerHTML = '<div class="empty-state" style="padding:20px"><div class="empty-icon">❌</div>Bot hors ligne</div>';
      }
    }
  },

  _renderActivity() {
    const logs = Store.get("logs");
    const el = document.getElementById("activity-feed");
    if (!el) return;
    if (!logs || !logs.length) {
      el.innerHTML = '<div class="empty-state"><div class="empty-icon">📡</div>En attente des données...</div>';
      return;
    }
    const recent = logs.slice(0, 15);
    el.innerHTML = recent.map((l) => {
      const time = new Date(l.timestamp).toLocaleTimeString("fr-FR", { hour: "2-digit", minute: "2-digit", second: "2-digit" });
      const levelIcon = l.level === "error" ? "✕" : l.level === "warn" ? "⚠" : "●";
      return '<div class="activity-item"><span class="activity-time">' + time + '</span><span class="activity-dot" style="background:' + (l.level === "error" ? "var(--danger)" : l.level === "warn" ? "var(--warning)" : "var(--success)") + '">' + levelIcon + '</span><span class="activity-msg">' + Utils.escapeHtml(l.message?.substring(0, 100)) + '</span></div>';
    }).join("");
  },

  _renderPlatforms(platforms) {
    if (!platforms?.length) {
      document.getElementById("flux-table-body").innerHTML = '<tr><td colspan="5"><div class="empty-state"><div class="empty-icon">📡</div>Aucune plateforme configurée</div></td></tr>';
      return;
    }
    document.getElementById("flux-table-body").innerHTML = platforms.map((p) => {
      var lastFetch = p.lastFetch || p.lastRun || "--";
      try {
        var d = new Date(lastFetch);
        if (d instanceof Date && !isNaN(d)) lastFetch = d.toLocaleTimeString("fr-FR");
      } catch {}
      return '<tr><td><strong>' + Utils.escapeHtml(p.name || p.label || p.id) + '</strong></td>' +
      '<td><div class="flux-status"><span class="dot ' + (p.active ? "on" : "off") + '"></span>' + (p.active ? "Actif" : "Inactif") + '</div></td>' +
      '<td style="font-size:11px;color:var(--text-muted)">' + Utils.escapeHtml(p.platform || p.type || "—") + '</td>' +
      '<td style="font-size:11px;color:var(--text-muted)">' + lastFetch + '</td>' +
      '<td><div class="flux-actions">' +
      '<label class="toggle"><input type="checkbox" ' + (p.active ? "checked" : "") +
      ' onchange="togglePlatform(\'' + p.id + '\', this.checked)"><span class="slider"></span></label>' +
      '</div></td></tr>';
    }).join("");
  },

  _renderHealth(checks) {
    const all = checks || [];
    const errors = all.filter((c) => c.status === "error");
    const warnings = all.filter((c) => c.status === "warning");
    const oks = all.filter((c) => c.status === "ok");
    const totalAlerts = errors.length + warnings.length;

    const set = (id, val) => { const el = document.getElementById(id); if (el) el.textContent = val; };
    set("alerts-sys-count", totalAlerts);
    set("alerts-ok-count", oks.length);
    set("alerts-warn-count", warnings.length);
    set("alerts-err-count", errors.length);

    const detailEl = document.getElementById("alerts-detail-list");
    if (detailEl) {
      if (!all.length) {
        detailEl.innerHTML = '<div class="empty-state"><div class="empty-icon">⚠</div>Aucune donnée de santé</div>';
      } else {
        detailEl.innerHTML = all.map((a) => {
          const level = a.status === "error" ? "error" : a.status === "warning" ? "warn" : "ok";
          const icon = a.status === "error" ? "✕" : a.status === "warning" ? "⚠" : "✓";
          const color = a.status === "error" ? "var(--danger)" : a.status === "warning" ? "var(--warning)" : "var(--success)";
          return '<div class="activity-item"><span class="activity-dot" style="background:' + color + '">' + icon + '</span><span class="activity-msg"><b>' + Utils.escapeHtml(a.name) + '</b> — ' + Utils.escapeHtml(a.message || "") + '</span></div>';
        }).join("");
      }
    }

    const overviewAlerts = document.getElementById("alert-list");
    if (overviewAlerts) {
      if (!totalAlerts) {
        overviewAlerts.innerHTML = '<div class="empty-state" style="padding:20px"><div class="empty-icon">✅</div>Système opérationnel</div>';
      } else {
        overviewAlerts.innerHTML = all.filter((c) => c.status !== "ok").map((a) => {
          const icon = a.status === "error" ? "✕" : "⚠";
          const color = a.status === "error" ? "var(--danger)" : "var(--warning)";
          return '<div class="activity-item"><span class="activity-dot" style="background:' + color + '">' + icon + '</span><span class="activity-msg"><b>' + Utils.escapeHtml(a.name) + '</b> — ' + Utils.escapeHtml(a.message || "") + '</span></div>';
        }).join("");
      }
    }
  },

  _loadServers() {
    window.electronAPI.getServers().then((servers) => {
      const grid = document.getElementById("server-grid");
      if (!grid || !servers?.length) { if (grid) grid.innerHTML = '<div class="empty-state"><div class="empty-icon">🏰</div>Aucun serveur</div>'; return; }
      grid.innerHTML = servers.map((s) => {
        const icon = s.iconURL ? '<img src="' + Utils.escapeHtml(s.iconURL) + '" style="width:40px;height:40px;border-radius:50%">' : '<div class="server-icon">🏰</div>';
        return '<div class="server-card"><div class="server-card-header">' + icon + '<div><div class="server-name">' + Utils.escapeHtml(s.name) + '</div><div class="server-id">' + Utils.escapeHtml(s.id) + '</div></div></div><div class="server-stats"><span class="server-stat">👥 ' + Utils.formatNumber(s.memberCount) + '</span><span class="server-stat">👑 ' + Utils.escapeHtml(s.ownerName || "—") + '</span></div></div>';
      }).join("");
    }).catch(() => {
      const grid = document.getElementById("server-grid");
      if (grid) grid.innerHTML = '<div class="empty-state"><div class="empty-icon">🏰</div>Impossible de charger les serveurs</div>';
    });
    document.getElementById("server-search")?.addEventListener("input", (e) => {
      const search = e.target.value.toLowerCase();
      document.querySelectorAll("#server-grid .server-card").forEach((card) => {
        card.style.display = card.textContent.toLowerCase().includes(search) ? "" : "none";
      });
    });
  },

  _renderFortnite(data) {
    const set = (id, val) => { const el = document.getElementById(id); if (el) el.textContent = val; };

    if (!data) {
      set("fn-tweets", "0");
      set("fn-news", "0");
      set("fn-skins", "0");
      set("fn-accounts", "0");
      document.getElementById("fortnite-feed").innerHTML = '<div class="empty-state"><div class="empty-icon">🎮</div>En attente des données...</div>';
      document.getElementById("fortnite-shop-preview").innerHTML = '<div class="empty-state"><div class="empty-icon">🛒</div>Shop non disponible</div>';
      return;
    }

    set("fn-tweets", Utils.formatNumber(data.tweets || 0));
    set("fn-news", Utils.formatNumber(data.news || 0));
    set("fn-skins", Utils.formatNumber(data.skins || 0));
    set("fn-accounts", Utils.formatNumber(data.accounts?.length || 0));
    set("fn-last-post", data.shopLastPosted || "--");
    set("fn-wishlist-count", Utils.formatNumber(data.cosmeticsTracked || data.wishlist?.length || 0));
    const dateEl = document.getElementById("fn-shop-date");
    if (dateEl) dateEl.textContent = data.shopDate ? "Shop " + data.shopDate.slice(0, 10) : "Salon boutique";

    if (data.detections?.length) {
      document.getElementById("fortnite-feed").innerHTML = data.detections.slice(0, 15).map((d) => {
        const time = Utils.formatTime(d.time);
        const typeCls = "fn-type-" + d.type;
        return '<div class="activity-item"><span class="activity-time">' + time + '</span><span class="activity-dot ' + typeCls + '"></span><span class="activity-msg">' + Utils.escapeHtml(d.message) + '</span></div>';
      }).join("");
    } else {
      document.getElementById("fortnite-feed").innerHTML = '<div class="empty-state"><div class="empty-icon">🎮</div>Aucune détection récente</div>';
    }

    if (data.shop?.length) {
      document.getElementById("fortnite-shop-preview").innerHTML = data.shop.slice(0, 8).map((item, i) => {
        const color = Utils.getRarityColor(item.rarity);
        const icon = item.icon && String(item.icon).startsWith("http")
          ? '<img src="' + Utils.escapeHtml(item.icon) + '" alt="" width="32" height="32" style="border-radius:6px;object-fit:cover">'
          : '<span style="font-size:20px">🎮</span>';
        return '<div class="fn-shop-item" style="display:flex;align-items:center;gap:10px;padding:8px 10px;background:var(--bg-tertiary);border-radius:var(--radius-sm);animation:slideIn 0.3s ease ' + (i * 0.05) + 's both">' + icon + '<div style="flex:1"><div style="font-weight:600;font-size:12px">' + Utils.escapeHtml(item.name) + '</div><span style="font-size:10px;color:var(--text-muted)">' + (item.rarity || 'common') + '</span></div><span style="font-weight:700;font-size:12px;color:' + color + '">' + (item.price || '—') + ' V-Bucks</span></div>';
      }).join("");
    } else {
      document.getElementById("fortnite-shop-preview").innerHTML = '<div class="empty-state"><div class="empty-icon">🛒</div>Shop non disponible — en attente de données</div>';
    }

    const wishEl = document.getElementById("fortnite-wishlist");
    if (wishEl) {
      if (!data.wishlist?.length) {
        wishEl.innerHTML = '<div class="empty-state"><div class="empty-icon">🎮</div>Aucun item suivi — utilise /wishlist</div>';
      } else {
        wishEl.innerHTML = data.wishlist.map((w) =>
          '<span class="wish-chip">' + Utils.escapeHtml(w.gameName || w.itemName) + "</span>"
        ).join("");
      }
    }
  },
};
