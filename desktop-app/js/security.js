const Security = {
  _refreshInterval: null,

  init() {
    this.refresh();
    this._refreshInterval = setInterval(() => this.refresh(), 15000);
  },

  async refresh() {
    try {
      const data = await window.electronAPI.getSecurity();
      this._render(data);
    } catch {
      if (window.electronAPI?.apiFetch) {
        try {
          const data = await window.electronAPI.apiFetch("/api/security");
          this._render(data);
        } catch {}
      }
    }
  },

  _render(data) {
    if (!data) return;
    const s = data.stats || {};
    const set = (id, val) => { const el = document.getElementById(id); if (el) el.textContent = val; };
    set("sec-risk-avg", (s.riskAvg ?? 0) + "%");
    set("sec-alts-count", s.altsCount ?? 0);
    set("sec-events-count", s.eventsCount ?? 0);
    set("sec-shadow-count", s.shadowCount ?? 0);

    const risky = data.riskyUsers || [];
    const riskyEl = document.getElementById("sec-risky-users");
    if (riskyEl) {
      if (!risky.length) {
        riskyEl.innerHTML = '<div class="empty-state"><div class="empty-icon">✅</div>Aucun utilisateur à risque</div>';
      } else {
        riskyEl.innerHTML = risky.map((u) => {
          const time = new Date(u.createdAt).toLocaleString("fr-FR", { day: "2-digit", month: "2-digit", hour: "2-digit", minute: "2-digit" });
          return '<div class="activity-item">' +
            '<span class="activity-time">' + time + '</span>' +
            '<span class="activity-dot" style="background:var(--danger)">⚠</span>' +
            '<span class="activity-msg"><@' + u.userId + '> — ' + Utils.escapeHtml(u.action?.substring(0, 60) || "") + '</span>' +
          '</div>';
        }).join("");
      }
    }

    const events = data.eventsFeed || [];
    const eventsEl = document.getElementById("sec-events-feed");
    if (eventsEl) {
      if (!events.length) {
        eventsEl.innerHTML = '<div class="empty-state"><div class="empty-icon">🔐</div>Aucun event récent</div>';
      } else {
        eventsEl.innerHTML = events.map((l) => {
          const time = new Date(l.timestamp).toLocaleTimeString("fr-FR", { hour: "2-digit", minute: "2-digit" });
          return '<div class="activity-item">' +
            '<span class="activity-time">' + time + '</span>' +
            '<span class="activity-dot" style="background:' + (l.level === "error" ? "var(--danger)" : "var(--accent)") + '">●</span>' +
            '<span class="activity-msg">' + Utils.escapeHtml(l.message?.substring(0, 80) || "") + '</span>' +
          '</div>';
        }).join("");
      }
    }

    const osint = data.osintResults || [];
    const osintEl = document.getElementById("sec-osint-results");
    if (osintEl) {
      if (!osint.length) {
        osintEl.innerHTML = '<div class="empty-state"><div class="empty-icon">🔍</div>Aucun audit OSINT récent</div>';
      } else {
        osintEl.innerHTML = osint.map((o) => {
          const time = new Date(o.createdAt).toLocaleString("fr-FR", { day: "2-digit", month: "2-digit", hour: "2-digit", minute: "2-digit" });
          return '<div class="activity-item">' +
            '<span class="activity-time">' + time + '</span>' +
            '<span class="activity-dot" style="background:var(--accent)">🔍</span>' +
            '<span class="activity-msg"><@' + o.userId + '> — ' + Utils.escapeHtml(o.action?.substring(0, 60) || "") + '</span>' +
          '</div>';
        }).join("");
      }
    }
  },
};
