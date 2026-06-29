/* ═══════════════════════════════════════════════════════════════════════════
   notifications.js — Toast notification system with anti-spam protection
   ═══════════════════════════════════════════════════════════════════════════ */

const Notifications = {
  _container: null,
  _queue: [],
  _maxVisible: 4,
  _lastShown: {},
  _rateLimitCount: 0,
  _rateLimitReset: 0,
  _quietMode: false,
  _suppressedCount: 0,
  _history: [],

  // Rate limiting: max 8 notifications per 10 seconds
  _RATE_LIMIT_MAX: 8,
  _RATE_LIMIT_WINDOW: 10000,

  // Dedup: same message blocked for 5 seconds
  _DEDUP_WINDOW: 5000,

  // Max history entries
  _MAX_HISTORY: 50,

  _ensureContainer() {
    if (!this._container) {
      this._container = document.createElement("div");
      this._container.id = "toast-container";
      Object.assign(this._container.style, {
        position: "fixed",
        top: "48px",
        right: "20px",
        zIndex: "9999",
        display: "flex",
        flexDirection: "column",
        gap: "8px",
        maxWidth: "380px",
      });
      document.body.appendChild(this._container);
    }
  },

  _checkRateLimit() {
    var now = Date.now();
    if (now > this._rateLimitReset) {
      this._rateLimitCount = 0;
      this._rateLimitReset = now + this._RATE_LIMIT_WINDOW;
    }
    this._rateLimitCount++;
    return this._rateLimitCount <= this._RATE_LIMIT_MAX;
  },

  _checkDedup(level, message) {
    var dedupKey = level + ":" + message;
    var now = Date.now();
    if (this._lastShown[dedupKey] && (now - this._lastShown[dedupKey]) < this._DEDUP_WINDOW) {
      return false;
    }
    this._lastShown[dedupKey] = now;
    return true;
  },

  _cleanupDedup() {
    var now = Date.now();
    for (var key in this._lastShown) {
      if (now - this._lastShown[key] > 15000) delete this._lastShown[key];
    }
  },

  _addToHistory(level, message) {
    this._history.unshift({ level: level, message: message, time: Date.now() });
    if (this._history.length > this._MAX_HISTORY) this._history.pop();
  },

  _show(level, message, icon, duration) {
    if (duration === undefined) duration = 4000;

    // Quiet mode: suppress everything except errors
    if (this._quietMode && level !== "error") {
      this._suppressedCount++;
      return;
    }

    // Dedup check
    if (!this._checkDedup(level, message)) {
      this._suppressedCount++;
      return;
    }

    // Rate limit check
    if (!this._checkRateLimit()) {
      this._suppressedCount++;
      if (this._suppressedCount === 1) {
        this._suppressedCount = 0;
        this._ensureContainer();
        this._renderToast("warning", this._RATE_LIMIT_MAX + " notifications supprimees (anti-spam)", "🔇", 3000);
      }
      return;
    }

    this._cleanupDedup();
    this._addToHistory(level, message);
    this._ensureContainer();
    this._renderToast(level, message, icon, duration);
  },

  _renderToast(level, message, icon, duration) {
    const id = "toast-" + Date.now() + "-" + Math.random().toString(36).slice(2, 6);
    const colors = {
      success: "var(--success)",
      error: "var(--danger)",
      warning: "var(--warning)",
      info: "var(--accent)",
    };
    const el = document.createElement("div");
    el.id = id;
    el.className = "toast toast-" + level;
    Object.assign(el.style, {
      background: "var(--bg-primary)",
      border: "1px solid " + (colors[level] || "var(--border)"),
      borderLeft: "3px solid " + (colors[level] || "var(--accent)"),
      borderRadius: "var(--radius-sm)",
      padding: "12px 16px",
      display: "flex",
      alignItems: "flex-start",
      gap: "10px",
      fontSize: "12px",
      color: "var(--text-primary)",
      boxShadow: "var(--shadow-lg)",
      animation: "toastIn 0.3s ease",
      cursor: "pointer",
    });
    el.innerHTML = '<span style="font-size:16px;flex-shrink:0">' + icon + '</span><span style="flex:1">' + Utils.escapeHtml(message) + '</span>';
    el.addEventListener("click", () => this._dismiss(id));
    this._container.appendChild(el);

    if (this._container.children.length > this._maxVisible) {
      this._container.firstChild?.remove();
    }

    setTimeout(() => this._dismiss(id), duration);
  },

  _dismiss(id) {
    const el = document.getElementById(id);
    if (!el) return;
    el.style.animation = "toastOut 0.25s ease forwards";
    setTimeout(() => el.remove(), 260);
  },

  success(msg) { this._show("success", msg, "✓"); },
  error(msg) { this._show("error", msg, "✕"); },
  warning(msg) { this._show("warning", msg, "⚠"); },
  info(msg) { this._show("info", msg, "ℹ"); },

  // ─── Anti-spam controls ───────────────────────────────────────────

  _enabled: { resources: true, moderation: true, security: true },

  toggle(category, enabled) {
    this._enabled[category] = enabled;
    this.info("Notifications " + category + ": " + (enabled ? "activees" : "desactivees"));
  },

  setQuietMode(enabled) {
    this._quietMode = enabled;
    if (enabled) {
      this._suppressedCount = 0;
    } else if (this._suppressedCount > 0) {
      this._renderToast("info", this._suppressedCount + " notifications supprimees en mode silencieux", "🔇", 3000);
      this._suppressedCount = 0;
    }
  },

  isQuietMode() { return this._quietMode; },

  clear() {
    if (this._container) this._container.innerHTML = "";
  },

  getHistory() { return this._history.slice(); },

  getSuppressedCount() { return this._suppressedCount; },
};
