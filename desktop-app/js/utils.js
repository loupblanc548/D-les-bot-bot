/* ═══════════════════════════════════════════════════════════════════════════
   utils.js — Shared utility functions
   ═══════════════════════════════════════════════════════════════════════════ */

const Utils = {
  escapeHtml(str) {
    if (!str) return "";
    const div = document.createElement("div");
    div.textContent = String(str);
    return div.innerHTML;
  },

  formatTime(isoString) {
    const d = new Date(isoString);
    return d.toLocaleTimeString("fr-FR", {
      hour: "2-digit",
      minute: "2-digit",
      second: "2-digit",
    });
  },

  formatDateTime(isoString) {
    const d = new Date(isoString);
    return d.toLocaleString("fr-FR");
  },

  formatUptime(seconds) {
    const d = Math.floor(seconds / 86400);
    const h = Math.floor((seconds % 86400) / 3600);
    const m = Math.floor((seconds % 3600) / 60);
    const parts = [];
    if (d > 0) parts.push(d + "j");
    if (h > 0) parts.push(h + "h");
    if (m > 0) parts.push(m + "m");
    return parts.join(" ") || "<1m";
  },

  formatNumber(n) {
    return Number(n).toLocaleString("fr-FR");
  },

  truncate(str, max) {
    if (!str) return "";
    return str.length > max ? str.slice(0, max) + "..." : str;
  },

  debounce(fn, delay) {
    let timer;
    return function (...args) {
      clearTimeout(timer);
      timer = setTimeout(() => fn.apply(this, args), delay);
    };
  },

  throttle(fn, limit) {
    let inThrottle;
    return function (...args) {
      if (!inThrottle) {
        fn.apply(this, args);
        inThrottle = true;
        setTimeout(() => (inThrottle = false), limit);
      }
    };
  },

  getRarityColor(rarity) {
    const colors = {
      legendary: "#f59e0b",
      epic: "#a855f7",
      rare: "#3b82f6",
      uncommon: "#22c55e",
      common: "#94a3b8",
      mythic: "#fbbf24",
      icon: "#06b6d4",
      marvel: "#ef4444",
      dc: "#3b82f6",
      "star wars": "#eab308",
      frozen: "#67e8f9",
      lava: "#f97316",
      shadow: "#475569",
      slurp: "#34d399",
    };
    return colors[(rarity || "").toLowerCase()] || "#94a3b8";
  },

  getStatusColor(status) {
    if (status === "ok" || status === "connected") return "var(--success)";
    if (status === "warning") return "var(--warning)";
    return "var(--danger)";
  },


  animateNumber(el, target, duration) {
    if (!el) return;
    duration = duration || 600;
    if (el._animFrame) { cancelAnimationFrame(el._animFrame); el._animFrame = null; }
    const start = parseInt(el.getAttribute('data-fn-value')) || 0;
    if (start === target) return;
    const range = target - start;
    const startTime = performance.now();
    const fmt = Utils.formatNumber;
    const step = (now) => {
      const elapsed = now - startTime;
      const progress = Math.min(elapsed / duration, 1);
      const eased = 1 - Math.pow(1 - progress, 3);
      const current = Math.round(start + range * eased);
      el.textContent = fmt(current);
      el.setAttribute('data-fn-value', current);
      if (progress < 1) el._animFrame = requestAnimationFrame(step);
      else { el.textContent = fmt(target); el.setAttribute('data-fn-value', target); el._animFrame = null; }
    };
    el._animFrame = requestAnimationFrame(step);
  },
  getLevelColor(level) {
    const colors = {
      info: "var(--accent)",
      success: "var(--success)",
      warn: "var(--warning)",
      warning: "var(--warning)",
      error: "var(--danger)",
      debug: "var(--text-muted)",
    };
    return colors[level] || "var(--text-secondary)";
  },
};
