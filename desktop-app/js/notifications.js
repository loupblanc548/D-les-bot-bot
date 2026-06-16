/* ═══════════════════════════════════════════════════════════════════════════
   notifications.js — Toast notification system
   ═══════════════════════════════════════════════════════════════════════════ */

const Notifications = {
  _container: null,
  _queue: [],
  _maxVisible: 5,

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

  _show(level, message, icon, duration = 4000) {
    this._ensureContainer();
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
};
