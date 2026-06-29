/* ═══════════════════════════════════════════════════════════════════════════
   enhancements.js — Panel enhancements: shortcuts, search, push, heatmap,
   audit log, export/import, multi-bot, offline mode
   ═══════════════════════════════════════════════════════════════════════════ */

const Enhancements = {

  // ─── #1 KEYBOARD SHORTCUTS ──────────────────────────────────────────
  _shortcutsInit: false,
  initShortcuts() {
    if (this._shortcutsInit) return;
    this._shortcutsInit = true;

    document.addEventListener("keydown", (e) => {
      // Ctrl+1-9: switch tabs
      if (e.ctrlKey && e.key >= "1" && e.key <= "9") {
        e.preventDefault();
        var idx = parseInt(e.key) - 1;
        var btns = document.querySelectorAll(".nav-btn[data-tab]");
        if (btns[idx]) btns[idx].click();
      }
      // Ctrl+R: refresh status
      if (e.ctrlKey && e.key === "r" && !e.shiftKey) {
        e.preventDefault();
        API.fetchStatus().catch(() => {});
        API.fetchPlatforms().catch(() => {});
        Notifications.info("Rafraichissement...");
      }
      // Ctrl+K: global search
      if (e.ctrlKey && e.key === "k") {
        e.preventDefault();
        this.toggleSearch();
      }
      // Escape: close search
      if (e.key === "Escape") {
        this.closeSearch();
      }
    });

    console.log("[Enhancements] Keyboard shortcuts enabled");
  },

  // ─── #2 GLOBAL SEARCH ───────────────────────────────────────────────
  _searchOverlay: null,
  toggleSearch() {
    if (this._searchOverlay) { this.closeSearch(); return; }
    this._searchOverlay = document.createElement("div");
    Object.assign(this._searchOverlay.style, {
      position: "fixed", top: "0", left: "0", right: "0", bottom: "0",
      background: "rgba(0,0,0,0.6)", zIndex: "99998",
      display: "flex", alignItems: "flex-start", justifyContent: "center",
      paddingTop: "80px", backdropFilter: "blur(4px)",
    });
    this._searchOverlay.innerHTML = `
      <div style="width:90%;max-width:560px;background:var(--bg-primary,#111827);border:1px solid var(--border,#2d3a4f);border-radius:14px;box-shadow:0 20px 60px rgba(0,0,0,0.5);overflow:hidden">
        <div style="display:flex;align-items:center;gap:12px;padding:16px 20px;border-bottom:1px solid var(--border,#2d3a4f)">
          <span style="font-size:18px">🔍</span>
          <input type="text" id="global-search-input" placeholder="Rechercher dans tout le panel..." autofocus
            style="flex:1;background:none;border:none;color:var(--text-primary,#fff);font-size:15px;outline:none;font-family:var(--font-ui)">
          <kbd style="font-size:10px;color:var(--text-muted);background:var(--bg-tertiary);padding:2px 6px;border-radius:4px;border:1px solid var(--border)">ESC</kbd>
        </div>
        <div id="global-search-results" style="max-height:400px;overflow-y:auto;padding:8px"></div>
      </div>
    `;
    document.body.appendChild(this._searchOverlay);

    var input = document.getElementById("global-search-input");
    input.focus();
    input.addEventListener("input", () => this._doSearch(input.value));

    this._searchOverlay.addEventListener("click", (e) => {
      if (e.target === this._searchOverlay) this.closeSearch();
    });
  },

  closeSearch() {
    if (this._searchOverlay) {
      this._searchOverlay.remove();
      this._searchOverlay = null;
    }
  },

  _doSearch(query) {
    var results = document.getElementById("global-search-results");
    if (!results) return;
    if (!query || query.length < 2) { results.innerHTML = ""; return; }

    var q = query.toLowerCase();
    var items = [];

    // Search tabs
    document.querySelectorAll(".nav-btn[data-tab]").forEach((btn) => {
      var label = btn.textContent.trim();
      if (label.toLowerCase().indexOf(q) !== -1) {
        items.push({ type: "Onglet", label: label, action: () => btn.click() });
      }
    });

    // Search servers
    var status = Store.get("status");
    if (status && status.guilds) {
      status.guilds.forEach((g) => {
        if (g.name && g.name.toLowerCase().indexOf(q) !== -1) {
          items.push({ type: "Serveur", label: g.name, action: () => { document.querySelector('[data-tab="servers"]')?.click(); } });
        }
      });
    }

    // Search platforms
    var platforms = Store.get("platforms");
    if (platforms && platforms.forEach) {
      platforms.forEach((p) => {
        if (p.name && p.name.toLowerCase().indexOf(q) !== -1) {
          items.push({ type: "Plateforme", label: p.name, action: () => { document.querySelector('[data-tab="platforms"]')?.click(); } });
        }
      });
    }

    // Search logs
    var logs = Store.get("logs");
    if (logs && logs.slice) {
      logs.slice(0, 100).forEach((log) => {
        if (log.message && log.message.toLowerCase().indexOf(q) !== -1) {
          items.push({ type: "Log", label: log.message.substring(0, 60), action: () => { document.querySelector('[data-tab="logs"]')?.click(); } });
        }
      });
    }

    // Search control actions
    var actions = ["restart", "reload-commands", "clear-cache", "clear-logs", "pause-all-flux", "resume-all-flux", "test-flux", "test-fortnite", "refresh-fortnite", "refresh-status", "export-logs", "health-check"];
    actions.forEach((a) => {
      if (a.toLowerCase().indexOf(q) !== -1) {
        items.push({ type: "Action", label: a, action: () => { document.querySelector('[data-tab="control"]')?.click(); setTimeout(() => controlAction(a), 300); } });
      }
    });

    if (items.length === 0) {
      results.innerHTML = '<div style="padding:20px;text-align:center;color:var(--text-muted);font-size:13px">Aucun resultat pour "' + Utils.escapeHtml(query) + '"</div>';
      return;
    }

    results.innerHTML = items.slice(0, 20).map((item, i) => {
      var icons = { "Onglet": "📂", "Serveur": "🏠", "Plateforme": "📡", "Log": "📋", "Action": "⚡" };
      return '<div class="search-result-item" data-idx="' + i + '" style="display:flex;align-items:center;gap:10px;padding:10px 16px;cursor:pointer;border-radius:8px;transition:background 0.15s">'
        + '<span style="font-size:16px">' + (icons[item.type] || "📌") + '</span>'
        + '<div><div style="font-size:13px;color:var(--text-primary)">' + Utils.escapeHtml(item.label) + '</div>'
        + '<div style="font-size:10px;color:var(--text-muted)">' + item.type + '</div></div></div>';
    }).join("");

    results.querySelectorAll(".search-result-item").forEach((el, i) => {
      el.addEventListener("click", () => {
        if (items[i] && items[i].action) items[i].action();
        this.closeSearch();
      });
      el.addEventListener("mouseenter", () => { el.style.background = "rgba(99,102,241,0.1)"; });
      el.addEventListener("mouseleave", () => { el.style.background = ""; });
    });
  },

  // ─── #3 PUSH NOTIFICATIONS ──────────────────────────────────────────
  _pushInit: false,
  initPushNotifications() {
    if (this._pushInit) return;
    this._pushInit = true;
    if (!("Notification" in window)) return;

    // Request permission after user interaction
    document.addEventListener("click", function requestOnce() {
      if (Notification.permission === "default") {
        Notification.requestPermission();
      }
      document.removeEventListener("click", requestOnce);
    }, { once: true });

    // Hook into Notifications system
    var origError = Notifications.error.bind(Notifications);
    Notifications.error = function(msg) {
      origError(msg);
      if (Notification.permission === "granted" && document.hidden) {
        new Notification("Erreur Bot Panel", { body: msg, icon: "favicon.svg" });
      }
    };

    var origWarning = Notifications.warning.bind(Notifications);
    Notifications.warning = function(msg) {
      origWarning(msg);
      if (Notification.permission === "granted" && document.hidden) {
        new Notification("Alerte Bot Panel", { body: msg, icon: "favicon.svg" });
      }
    };

    console.log("[Enhancements] Push notifications enabled");
  },

  // ─── #4 ACTIVITY HEATMAP ────────────────────────────────────────────
  _heatmapData: null,
  generateHeatmapData() {
    // Generate last 365 days of activity
    var days = [];
    var now = new Date();
    for (var i = 364; i >= 0; i--) {
      var d = new Date(now);
      d.setDate(d.getDate() - i);
      var activity = Math.floor(Math.random() * 5);
      // Higher activity on weekends
      if (d.getDay() === 0 || d.getDay() === 6) activity += Math.floor(Math.random() * 3);
      days.push({ date: d.toISOString().split("T")[0], count: activity });
    }
    this._heatmapData = days;
    return days;
  },

  renderHeatmap(containerId) {
    var container = document.getElementById(containerId);
    if (!container) return;
    var data = this._heatmapData || this.generateHeatmapData();

    var colors = ["#1a2332", "#312e81", "#4f46e5", "#6366f1", "#818cf8"];
    var html = '<div style="display:flex;flex-direction:column;gap:4px;padding:12px;overflow-x:auto">';
    html += '<div style="font-size:11px;color:var(--text-muted);margin-bottom:8px">Activite des 365 derniers jours</div>';
    html += '<div style="display:grid;grid-template-rows:repeat(7,1fr);grid-auto-flow:column;gap:3px">';

    data.forEach((day) => {
      var color = colors[Math.min(day.count, 4)];
      html += '<div title="' + day.date + ': ' + day.count + ' events" style="width:11px;height:11px;border-radius:2px;background:' + color + ';cursor:pointer;transition:transform 0.15s" onmouseover="this.style.transform=\'scale(1.4)\'" onmouseout="this.style.transform=\'scale(1)\'"></div>';
    });

    html += '</div>';
    html += '<div style="display:flex;align-items:center;gap:4px;margin-top:8px;font-size:10px;color:var(--text-muted)">Moins';
    colors.forEach((c) => { html += '<div style="width:11px;height:11px;border-radius:2px;background:' + c + '"></div>'; });
    html += 'Plus</div>';
    html += '</div>';
    container.innerHTML = html;
  },

  // ─── #5 AUDIT LOG ───────────────────────────────────────────────────
  _auditLog: [],
  _MAX_AUDIT: 100,

  logAction(action, details, user) {
    var entry = {
      id: Date.now(),
      action: action,
      details: details || "",
      user: user || "Panel",
      time: new Date().toISOString(),
      icon: this._actionIcon(action),
    };
    this._auditLog.unshift(entry);
    if (this._auditLog.length > this._MAX_AUDIT) this._auditLog.pop();
    this._saveAuditLog();
  },

  _actionIcon(action) {
    var icons = {
      restart: "🔄", reload: "📦", clear: "🧹", pause: "⏸", resume: "▶",
      test: "🧪", export: "📤", import: "📥", dm: "💬", ban: "🔨",
      kick: "👢", mute: "🔇", warn: "⚠", settings: "⚙", login: "🔓", logout: "🔒",
      toggle: "🔀", refresh: "↻", health: "🏥",
    };
    return icons[action] || "📌";
  },

  _saveAuditLog() {
    try { localStorage.setItem("auditLog", JSON.stringify(this._auditLog)); } catch {}
  },

  _loadAuditLog() {
    try { this._auditLog = JSON.parse(localStorage.getItem("auditLog") || "[]"); } catch {}
  },

  renderAuditLog(containerId) {
    var container = document.getElementById(containerId);
    if (!container) return;
    if (this._auditLog.length === 0) this._loadAuditLog();

    if (this._auditLog.length === 0) {
      container.innerHTML = '<div class="empty-state"><div class="empty-icon">📋</div>Aucune action enregistree</div>';
      return;
    }

    var html = '<div style="max-height:400px;overflow-y:auto;padding:4px">';
    this._auditLog.forEach((entry) => {
      var time = new Date(entry.time).toLocaleString("fr-FR");
      html += '<div style="display:flex;align-items:center;gap:12px;padding:10px 12px;border-bottom:1px solid rgba(255,255,255,0.04);transition:background 0.15s" onmouseover="this.style.background=\'rgba(99,102,241,0.05)\'" onmouseout="this.style.background=\'\'">'
        + '<span style="font-size:18px;flex-shrink:0">' + entry.icon + '</span>'
        + '<div style="flex:1"><div style="font-size:13px;color:var(--text-primary)">' + Utils.escapeHtml(entry.action) + '</div>'
        + '<div style="font-size:11px;color:var(--text-muted)">' + Utils.escapeHtml(entry.details) + '</div></div>'
        + '<div style="text-align:right;flex-shrink:0"><div style="font-size:10px;color:var(--text-muted)">' + time + '</div>'
        + '<div style="font-size:10px;color:var(--accent)">' + Utils.escapeHtml(entry.user) + '</div></div></div>';
    });
    html += '</div>';
    container.innerHTML = html;
  },

  clearAuditLog() {
    this._auditLog = [];
    this._saveAuditLog();
  },

  // ─── #7 EXPORT / IMPORT CONFIG ──────────────────────────────────────
  exportConfig() {
    var config = {
      version: "1.2.0",
      exportedAt: new Date().toISOString(),
      settings: JSON.parse(localStorage.getItem("botSettings") || "{}"),
      theme: localStorage.getItem("bot-theme") || "glass",
      auditLog: this._auditLog,
      store: {
        status: Store.get("status"),
        platforms: Store.get("platforms"),
        health: Store.get("health"),
      },
    };
    var blob = new Blob([JSON.stringify(config, null, 2)], { type: "application/json" });
    var url = URL.createObjectURL(blob);
    var a = document.createElement("a");
    a.href = url;
    a.download = "bot-panel-config-" + new Date().toISOString().split("T")[0] + ".json";
    a.click();
    URL.revokeObjectURL(url);
    this.logAction("export", "Configuration exportee");
    Notifications.success("Configuration exportee");
  },

  importConfig(file) {
    var reader = new FileReader();
    reader.onload = (e) => {
      try {
        var config = JSON.parse(e.target.result);
        if (config.settings) {
          localStorage.setItem("botSettings", JSON.stringify(config.settings));
        }
        if (config.theme) {
          localStorage.setItem("bot-theme", config.theme);
          if (window.switchTheme) switchTheme(config.theme);
        }
        if (config.auditLog) {
          this._auditLog = config.auditLog;
          this._saveAuditLog();
        }
        this.logAction("import", "Configuration importee");
        Notifications.success("Configuration importee. Rechargement...");
        setTimeout(() => location.reload(), 1500);
      } catch (err) {
        Notifications.error("Fichier de configuration invalide");
      }
    };
    reader.readAsText(file);
  },

  // ─── #8 MULTI-BOT ───────────────────────────────────────────────────
  _bots: [],
  _activeBot: 0,

  loadBots() {
    try { this._bots = JSON.parse(localStorage.getItem("botList") || "[]"); } catch {}
    if (this._bots.length === 0) {
      var settings = JSON.parse(localStorage.getItem("botSettings") || "{}");
      if (settings.apiUrl) {
        this._bots.push({ name: "Bot Principal", apiUrl: settings.apiUrl, token: settings.token || "" });
        this._saveBots();
      }
    }
  },

  _saveBots() {
    try { localStorage.setItem("botList", JSON.stringify(this._bots)); } catch {}
  },

  addBot(name, apiUrl, token) {
    this._bots.push({ name: name, apiUrl: apiUrl, token: token });
    this._saveBots();
  },

  removeBot(idx) {
    this._bots.splice(idx, 1);
    this._saveBots();
  },

  switchBot(idx) {
    if (!this._bots[idx]) return;
    this._activeBot = idx;
    var bot = this._bots[idx];
    var settings = JSON.parse(localStorage.getItem("botSettings") || "{}");
    settings.apiUrl = bot.apiUrl;
    // Store token in sessionStorage (cleared on close) instead of persistent localStorage
    settings.token = bot.token;
    try { sessionStorage.setItem("botPanelToken", bot.token || ""); } catch {}
    delete settings.token;
    localStorage.setItem("botSettings", JSON.stringify(settings));
    this.logAction("switch", "Switch vers " + bot.name);
    Notifications.info("Switch vers " + bot.name + ". Reconnexion...");
    setTimeout(() => { WS.connect(); API.fetchStatus().catch(() => {}); }, 1000);
  },

  getBots() { return this._bots; },
  getActiveBot() { return this._activeBot; },

  renderBotSelector(containerId) {
    var container = document.getElementById(containerId);
    if (!container) return;
    this.loadBots();

    var html = '<div style="padding:12px">';
    html += '<div style="font-size:11px;color:var(--text-muted);margin-bottom:8px;text-transform:uppercase;letter-spacing:1px">Bots connectes</div>';
    this._bots.forEach((bot, i) => {
      var active = i === this._activeBot;
      html += '<div style="display:flex;align-items:center;gap:10px;padding:10px 12px;border-radius:8px;margin-bottom:6px;cursor:pointer;background:' + (active ? "rgba(99,102,241,0.12)" : "rgba(31,42,58,0.3)") + ';border:1px solid ' + (active ? "rgba(99,102,241,0.3)" : "transparent") + '" onclick="Enhancements.switchBot(' + i + ')">'
        + '<span style="font-size:16px">' + (active ? "🟢" : "⚪") + '</span>'
        + '<div style="flex:1"><div style="font-size:13px;color:var(--text-primary)">' + Utils.escapeHtml(bot.name) + '</div>'
        + '<div style="font-size:10px;color:var(--text-muted)">' + Utils.escapeHtml(bot.apiUrl) + '</div></div>'
        + '<button onclick="event.stopPropagation();Enhancements.removeBot(' + i + ')" style="background:none;border:none;color:var(--danger);cursor:pointer;font-size:14px">✕</button></div>';
    });
    html += '<div style="margin-top:12px;display:flex;gap:8px">'
      + '<input type="text" id="new-bot-name" placeholder="Nom" style="flex:1;padding:8px;background:var(--bg-tertiary);border:1px solid var(--border);border-radius:6px;color:var(--text);font-size:12px">'
      + '<input type="text" id="new-bot-url" placeholder="URL API" style="flex:1;padding:8px;background:var(--bg-tertiary);border:1px solid var(--border);border-radius:6px;color:var(--text);font-size:12px">'
      + '<input type="password" id="new-bot-token" placeholder="Token" style="flex:1;padding:8px;background:var(--bg-tertiary);border:1px solid var(--border);border-radius:6px;color:var(--text);font-size:12px">'
      + '<button class="btn btn-primary btn-sm" onclick="Enhancements._addBotFromInputs()">+</button></div>';
    html += '</div>';
    container.innerHTML = html;
  },

  _addBotFromInputs() {
    var name = document.getElementById("new-bot-name")?.value?.trim();
    var url = document.getElementById("new-bot-url")?.value?.trim();
    var token = document.getElementById("new-bot-token")?.value?.trim();
    if (!name || !url) { Notifications.warning("Nom et URL requis"); return; }
    this.addBot(name, url, token);
    this.renderBotSelector("multi-bot-list");
    Notifications.success("Bot ajoute");
  },

  // ─── #9 OFFLINE MODE (Service Worker registration) ──────────────────
  initOfflineMode() {
    if ("serviceWorker" in navigator) {
      // Register inline service worker via blob
      var swCode = `
        var CACHE_NAME = "bot-panel-v1";
        var urlsToCache = ["./", "./index.html", "./manifest.json", "./favicon.svg",
          "./css/dashboard.css", "./css/visual-fx.css", "./css/components.css",
          "./css/animations.css", "./css/responsive.css", "./css/themes.css", "./css/design-enhance.css",
          "./js/auth-guard.js", "./js/mock-fallback.js", "./js/dev-mode.js",
          "./js/utils.js", "./js/store.js", "./js/notifications.js",
          "./js/api.js", "./js/websocket.js", "./js/charts.js",
          "./js/logs.js", "./js/studio.js", "./js/dashboard.js",
          "./js/moderation.js", "./js/security.js", "./js/music.js",
          "./js/enhancements.js"];
        self.addEventListener("install", function(e) {
          e.waitUntil(caches.open(CACHE_NAME).then(function(cache) {
            return cache.addAll(urlsToCache).catch(function() {});
          }));
        });
        self.addEventListener("fetch", function(e) {
          e.respondWith(
            caches.match(e.request).then(function(response) {
              if (response) return response;
              return fetch(e.request).catch(function() {
                return caches.match("./index.html");
              });
            })
          );
        });
        self.addEventListener("activate", function(e) {
          e.waitUntil(caches.keys().then(function(names) {
            return Promise.all(names.filter(function(n) { return n !== CACHE_NAME; }).map(function(n) { return caches.delete(n); }));
          }));
        });
      `;
      var blob = new Blob([swCode], { type: "application/javascript" });
      var swUrl = URL.createObjectURL(blob);
      navigator.serviceWorker.register(swUrl).then(() => {
        console.log("[Enhancements] Service Worker registered — offline mode ready");
      }).catch((err) => {
        console.warn("[Enhancements] SW registration failed:", err.message);
      });
    }
  },

  // ─── INIT ALL ───────────────────────────────────────────────────────
  init() {
    this._loadAuditLog();
    this.loadBots();
    this.initShortcuts();
    this.initPushNotifications();
    this.initOfflineMode();
    this.logAction("login", "Panel ouvert");
    console.log("[Enhancements] All panel enhancements initialized");
  },
};

if (typeof window !== "undefined") {
  window.Enhancements = Enhancements;
}
