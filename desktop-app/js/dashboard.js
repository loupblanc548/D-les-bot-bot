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
    this._updateStatsLoop();
    Store.on("status", (data) => data && this._renderStatus(data));
    Store.on("platforms", (data) => data && this._renderPlatforms(data));
    Store.on("health", (data) => data && this._renderHealth(data));
    Store.on("logs", () => LogConsole.render());
    Store.on("fortnite", (data) => data && this._renderFortnite(data));
    Store.update("init", true);
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
        }
      });
    });
  },

  _setupActions() {
    window.restartBot = () => API.restartBot();
    window.triggerCleanup = () => API.triggerCleanup();
    window.togglePlatform = (id, enable) => API.togglePlatform(id, enable);
    window.refreshFortnite = () => { API.fetchFortnite(); Notifications.info("Actualisation Fortnite..."); };
    window.testFortniteDetection = async () => {
      try {
        const res = await fetch(window.electronAPI._apiBase + "/api/fortnite/test", {
          method: "POST", headers: { Authorization: "Bearer " + (Store.get("settings")?.token || "") },
        });
        if (res.ok) Notifications.success("Test Fortnite déclenché");
      } catch { Notifications.warning("Backend Fortnite non disponible"); }
    };
    window.clearLogs = () => LogConsole.clear();
    window.exportLogs = (fmt) => LogConsole.export(fmt);
    window.togglePauseLogs = () => LogConsole.togglePause();
  },

  _updateStatsLoop() {
    API.fetchStatus().catch(() => {});
    API.fetchPlatforms().catch(() => {});
    API.fetchFortnite().catch(() => {});
    setInterval(() => API.fetchStatus().catch(() => {}), 5000);
    setInterval(() => API.fetchPlatforms().catch(() => {}), 15000);
    setInterval(() => API.fetchFortnite().catch(() => {}), 30000);
  },

  _renderStatus(data) {
    const dot = document.getElementById("titlebar-dot");
    if (dot) dot.className = data.online ? "" : "offline";

    document.getElementById("stats-grid").innerHTML = [
      { icon: "⬤", label: "Statut", value: data.online ? "ONLINE" : "OFFLINE", cls: data.online ? "" : "offline" },
      { icon: "⏱", label: "Uptime", value: Utils.formatUptime(data.uptime), cls: "" },
      { icon: "⚡", label: "Ping Discord", value: (data.ping >= 0 ? data.ping : "--") + "ms", cls: "" },
      { icon: "💻", label: "CPU", value: data.cpuPercent + "%", cls: "" },
      { icon: "📊", label: "RAM", value: data.memoryMB + " MB", cls: "" },
      { icon: "🏠", label: "Serveurs", value: Utils.formatNumber(data.guildCount), cls: "" },
      { icon: "👥", label: "Utilisateurs", value: Utils.formatNumber(data.userCount), cls: "" },
      { icon: "📡", label: "Flux actifs", value: data.activePlatforms + "/" + data.totalPlatforms, cls: "" },
    ].map((s) =>
      '<div class="stat-card"><div class="stat-header"><span class="stat-icon">' + s.icon + '</span><span class="stat-label">' + s.label +
      '</span></div><span class="stat-value ' + s.cls + '">' + s.value + '</span></div>'
    ).join("");

    document.getElementById("sb-ping").textContent = "Ping: " + (data.ping >= 0 ? data.ping + "ms" : "--");

    this._updateGauge(data.cpuPercent);
    Charts.record(data.cpuPercent, data.memoryMB, Math.max(0, data.ping), this._eventsCounter);
    this._eventsCounter = 0;
  },

  _updateGauge(score) {
    const circle = document.getElementById("gauge-fill");
    if (!circle) return;
    const circumference = 2 * Math.PI * 52;
    const offset = circumference - (score / 100) * circumference;
    circle.style.strokeDasharray = circumference;
    circle.style.strokeDashoffset = offset;
    circle.style.stroke = score >= 80 ? "#ef4444" : score >= 50 ? "#f59e0b" : "#22c55e";
    document.getElementById("gauge-value").textContent = score + "%";
  },

  _renderPlatforms(platforms) {
    if (!platforms?.length) return;
    document.getElementById("flux-table-body").innerHTML = platforms.map((p) =>
      '<tr><td><strong>' + p.label + '</strong></td>' +
      '<td><div class="flux-status"><span class="dot ' + (p.active ? "on" : "off") + '"></span>' + (p.active ? "Actif" : "Inactif") + '</div></td>' +
      '<td style="font-size:11px;color:var(--text-muted)">' + (p.cacheCount || 0) + ' IDs</td>' +
      '<td style="font-size:11px;color:var(--text-muted)">' + (p.lastRun || "--") + '</td>' +
      '<td><div class="flux-actions">' +
      '<label class="toggle"><input type="checkbox" ' + (p.active ? "checked" : "") +
      ' onchange="togglePlatform(\'' + p.id + '\', this.checked)"><span class="slider"></span></label>' +
      '</div></td></tr>'
    ).join("");
  },

  _renderHealth(checks) {
    let alerts = (checks || []).filter((c) => c.status === "error" || c.status === "warning");
    if (!alerts.length) {
      document.getElementById("alert-list").innerHTML = '<div class="alert-card info"><div class="alert-icon">ℹ</div><div class="alert-content"><div class="alert-title">Aucune alerte</div><div class="alert-desc">Système opérationnel</div></div></div>';
      return;
    }
    document.getElementById("alert-list").innerHTML = alerts.map((a) => {
      const level = a.status === "error" ? "critical" : "warning";
      const icon = a.status === "error" ? "✕" : "⚠";
      return '<div class="alert-card ' + level + '"><div class="alert-icon">' + icon + '</div><div class="alert-content"><div class="alert-title">' + a.name + '</div><div class="alert-desc">' + a.message + '</div></div></div>';
    }).join("");
  },

  _renderFortnite(data) {
    if (!data) {
      document.getElementById("fortnite-stats").innerHTML = '<div class="stat-card" style="grid-column:1/-1"><span class="stat-label">Connexion</span><span class="stat-value offline">OFFLINE</span></div>';
      return;
    }

    var statsEl = document.getElementById("fortnite-stats");
    if (!statsEl.querySelector('.stat-value')) {
      // Premier rendu : construire le DOM
      statsEl.innerHTML = [
        { icon: "🐦", label: "Tweets", key: "tweets", raw: data.tweets || 0 },
        { icon: "📰", label: "News", key: "news", raw: data.news || 0 },
        { icon: "💎", label: "Skins", key: "skins", raw: data.skins || 0 },
        { icon: "👤", label: "Comptes", key: "accounts", raw: (data.accounts?.length || 0) },
        { icon: "🛒", label: "Shop", key: "shop", raw: (data.shopItemsTotal || data.shop?.length || 0) },
        { icon: "🎯", label: "Cosmetiques", key: "cosmetics", raw: data.cosmeticsTracked || 0 },
      ].map(function(s) {
        return '<div class="stat-card"><div class="stat-header"><span class="stat-icon">' + s.icon + '</span><span class="stat-label">' + s.label +
        '</span></div><span class="stat-value" data-fn-key="' + s.key + '">' + Utils.formatNumber(s.raw) + '</span></div>';
      }).join("");
    } else {
      // Mise a jour : animer les valeurs existantes
      var items = [
        { key: "tweets", raw: data.tweets || 0 },
        { key: "news", raw: data.news || 0 },
        { key: "skins", raw: data.skins || 0 },
        { key: "accounts", raw: (data.accounts?.length || 0) },
        { key: "shop", raw: (data.shopItemsTotal || data.shop?.length || 0) },
        { key: "cosmetics", raw: data.cosmeticsTracked || 0 },
      ];
      for (var i = 0; i < items.length; i++) {
        var el = statsEl.querySelector('[data-fn-key="' + items[i].key + '"]');
        if (el) Utils.animateNumber(el, items[i].raw);
      }
    }

    if (data.detections?.length) {
      document.getElementById("fortnite-feed").innerHTML = data.detections.slice(0, 15).map((d) => {
        const time = Utils.formatTime(d.time);
        const typeCls = "fn-type-" + d.type;
        return '<div class="activity-item"><span class="activity-time">' + time + '</span><span class="activity-dot ' + typeCls + '"></span><span class="activity-msg">' + Utils.escapeHtml(d.message) + '</span></div>';
      }).join("");
    }

    if (data.shop?.length) {
      document.getElementById("fortnite-shop-preview").innerHTML = data.shop.slice(0, 6).map((item, i) => {
        const color = Utils.getRarityColor(item.rarity);
        return '<div class="fn-shop-item" style="display:flex;align-items:center;gap:10px;padding:8px 10px;background:var(--bg-tertiary);border-radius:var(--radius-sm);animation:slideIn 0.3s ease ' + (i * 0.05) + 's both"><span style="font-size:20px">' + item.icon + '</span><div style="flex:1"><div style="font-weight:600;font-size:12px">' + Utils.escapeHtml(item.name) + '</div><span style="font-size:10px;color:var(--text-muted)">' + (item.rarity || 'common') + '</span></div><span style="font-weight:700;font-size:12px;color:' + color + '">' + (item.price || '—') + ' V-Bucks</span></div>';
      }).join("");
    }
  },
};
