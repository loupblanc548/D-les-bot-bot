const Moderation = {
  _refreshInterval: null,

  init() {
    this.refresh();
    this._refreshInterval = setInterval(() => this.refresh(), 15000);
  },

  async refresh() {
    try {
      const data = await window.electronAPI.getModeration();
      this._render(data);
    } catch {
      if (window.electronAPI?.apiFetch) {
        try {
          const data = await window.electronAPI.apiFetch("/api/moderation");
          this._render(data);
        } catch {}
      }
    }
  },

  _render(data) {
    if (!data) return;
    const s = data.stats || {};
    const set = (id, val) => { const el = document.getElementById(id); if (el) el.textContent = val; };
    set("mod-warns-count", s.warns ?? 0);
    set("mod-mutes-count", s.mutes ?? 0);
    set("mod-bans-count", s.bans ?? 0);
    set("mod-automod-count", s.automod ?? 0);

    const sanctions = data.recentSanctions || [];
    const sanctionsEl = document.getElementById("mod-recent-sanctions");
    if (sanctionsEl) {
      if (!sanctions.length) {
        sanctionsEl.innerHTML = '<div class="empty-state"><div class="empty-icon">✅</div>Aucune sanction récente</div>';
      } else {
        sanctionsEl.innerHTML = sanctions.map((s) => {
          const time = new Date(s.createdAt).toLocaleString("fr-FR", { hour: "2-digit", minute: "2-digit", day: "2-digit", month: "2-digit" });
          const typeIcon = s.type === "BAN" ? "🔨" : s.type === "MUTE" ? "🔇" : s.type === "WARN" ? "⚠" : s.type === "KICK" ? "👢" : "📋";
          const color = s.type === "BAN" ? "var(--danger)" : s.type === "MUTE" ? "var(--warning)" : "var(--accent)";
          return '<div class="activity-item">' +
            '<span class="activity-time">' + time + '</span>' +
            '<span class="activity-dot" style="background:' + color + '">' + typeIcon + '</span>' +
            '<span class="activity-msg"><b>' + s.type + '</b> — <@' + s.userId + '>' + (s.reason ? ' — ' + Utils.escapeHtml(s.reason.substring(0, 60)) : '') + '</span>' +
          '</div>';
        }).join("");
      }
    }

    const automodFeed = data.automodFeed || [];
    const automodEl = document.getElementById("mod-automod-feed");
    if (automodEl) {
      if (!automodFeed.length) {
        automodEl.innerHTML = '<div class="empty-state"><div class="empty-icon">🛡</div>Aucune action auto-mod</div>';
      } else {
        automodEl.innerHTML = automodFeed.map((l) => {
          const time = new Date(l.timestamp).toLocaleTimeString("fr-FR", { hour: "2-digit", minute: "2-digit" });
          return '<div class="activity-item">' +
            '<span class="activity-time">' + time + '</span>' +
            '<span class="activity-dot" style="background:var(--warning)">⚠</span>' +
            '<span class="activity-msg">' + Utils.escapeHtml(l.message?.substring(0, 80) || "") + '</span>' +
          '</div>';
        }).join("");
      }
    }

    const tempbans = data.tempbans || [];
    const tempbansEl = document.getElementById("mod-tempbans");
    if (tempbansEl) {
      if (!tempbans.length) {
        tempbansEl.innerHTML = '<div class="empty-state"><div class="empty-icon">⏳</div>Aucun tempban actif</div>';
      } else {
        tempbansEl.innerHTML = tempbans.map((t) => {
          const time = new Date(t.createdAt).toLocaleString("fr-FR", { day: "2-digit", month: "2-digit", hour: "2-digit", minute: "2-digit" });
          return '<div class="activity-item">' +
            '<span class="activity-time">' + time + '</span>' +
            '<span class="activity-dot" style="background:var(--danger)">🔨</span>' +
            '<span class="activity-msg">' + Utils.escapeHtml(t.action?.substring(0, 80) || "") + '</span>' +
          '</div>';
        }).join("");
      }
    }
  },
};
