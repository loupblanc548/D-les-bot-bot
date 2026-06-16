/* ═══════════════════════════════════════════════════════════════════════════
   logs.js — Live log console with filters, search, export
   ═══════════════════════════════════════════════════════════════════════════ */

const LogConsole = {
  _paused: false,
  _autoScroll: true,
  _filters: { info: true, success: true, warn: true, error: true, debug: false },
  _search: "",

  init() {
    const el = document.getElementById("log-console");
    if (el) {
      el.addEventListener("scroll", () => {
        const atBottom = el.scrollHeight - el.scrollTop - el.clientHeight < 30;
        this._autoScroll = atBottom;
      });
    }

    document.getElementById("log-search")?.addEventListener("input", (e) => {
      this._search = e.target.value.toLowerCase();
      this.render();
    });

    document.querySelectorAll(".log-filter").forEach((btn) => {
      btn.addEventListener("click", () => {
        const level = btn.dataset.level;
        this._filters[level] = !this._filters[level];
        btn.classList.toggle("active", this._filters[level]);
        this.render();
      });
    });

    Store.on("logs", () => this.render());
  },

  render() {
    const el = document.getElementById("log-console");
    if (!el) return;

    let logs = Store.get("logs");
    if (!logs) logs = [];

    if (this._search) {
      logs = logs.filter((l) => l.message.toLowerCase().includes(this._search));
    }
    logs = logs.filter((l) => this._filters[l.level] !== false);

    const recent = logs.slice(-500);
    el.innerHTML = recent.map((e) => {
      const t = new Date(e.timestamp);
      const time = t.toLocaleTimeString("fr-FR", { hour: "2-digit", minute: "2-digit", second: "2-digit" }) +
        "." + String(t.getMilliseconds()).padStart(3, "0");
      return '<div class="log-line"><span class="log-time">' + time + '</span><span class="log-level ' + (e.level || "info") + '">' +
        (e.level || "INFO").toUpperCase().padEnd(5) + '</span><span class="log-msg">' + Utils.escapeHtml(e.message) + '</span></div>';
    }).join("");

    if (this._autoScroll && !this._paused) {
      el.scrollTop = el.scrollHeight;
    }

    const countEl = document.getElementById("log-count");
    if (countEl) countEl.textContent = logs.length + " logs";
  },

  togglePause() {
    this._paused = !this._paused;
    const btn = document.getElementById("btn-pause-logs");
    if (btn) btn.textContent = this._paused ? "▶ Reprendre" : "⏸ Pause";
  },

  clear() {
    Store.clearLogs();
    this.render();
  },

  export(format) {
    const logs = Store.get("logs");
    let text;
    if (format === "json") {
      text = JSON.stringify(logs, null, 2);
    } else {
      text = logs.map((e) => {
        const t = new Date(e.timestamp).toISOString();
        return "[" + t + "] [" + (e.level || "INFO").toUpperCase() + "] " + e.message;
      }).join("\n");
    }
    const blob = new Blob([text], { type: format === "json" ? "application/json" : "text/plain" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = "bot-logs." + format;
    a.click();
    URL.revokeObjectURL(url);
  },
};
