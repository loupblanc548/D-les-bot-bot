const Music = {
  _refreshInterval: null,
  _guildId: null,

  init() {
    this.refresh();
    this._refreshInterval = setInterval(() => this.refresh(), 5000);
  },

  async refresh() {
    try {
      const data = await window.electronAPI.getMusic();
      this._render(data);
    } catch {
      if (window.electronAPI?.apiFetch) {
        try {
          const data = await window.electronAPI.apiFetch("/api/music");
          this._render(data);
        } catch {}
      }
    }
  },

  async control(action) {
    if (!this._guildId) {
      if (window.Notifications) Notifications.error("Aucun salon vocal actif");
      return;
    }
    try {
      await window.electronAPI.musicControl(action, this._guildId);
      if (window.Notifications) Notifications.success("Action: " + action);
      setTimeout(() => this.refresh(), 500);
    } catch {
      if (window.electronAPI?.apiFetch) {
        try {
          await window.electronAPI.apiFetch("/api/music/control", {
            method: "POST",
            body: JSON.stringify({ action, guildId: this._guildId }),
          });
          setTimeout(() => this.refresh(), 500);
        } catch {}
      }
    }
  },

  _render(data) {
    if (!data) return;
    const s = data.stats || {};
    const set = (id, val) => { const el = document.getElementById(id); if (el) el.textContent = val; };
    set("music-voice-count", s.voiceCount ?? 0);
    set("music-queue-count", s.queueCount ?? 0);

    const np = data.nowPlaying;
    const npEl = document.getElementById("music-nowplaying");
    const controlsEl = document.getElementById("music-controls");
    if (npEl) {
      if (!np) {
        npEl.innerHTML = '<div class="empty-state"><div class="empty-icon">🎵</div>Aucune musique en cours</div>';
        if (controlsEl) controlsEl.style.display = "none";
      } else {
        npEl.innerHTML =
          '<div style="font-size:18px;font-weight:700;margin-bottom:4px">' + Utils.escapeHtml(np.title) + '</div>' +
          '<div style="font-size:12px;color:var(--text-muted);margin-bottom:8px">' +
            (np.guild ? '📍 ' + Utils.escapeHtml(np.guild) + ' · ' : '') +
            (np.duration ? '⏱ ' + np.duration : '') +
          '</div>' +
          (np.url ? '<a href="' + np.url + '" target="_blank" style="font-size:11px;color:var(--accent);text-decoration:none">🔗 Ouvrir</a>' : '');
        if (controlsEl) controlsEl.style.display = "flex";
      }
    }

    const queues = data.queues || [];
    const queueEl = document.getElementById("music-queue-list");
    if (queueEl) {
      if (!queues.length) {
        queueEl.innerHTML = '<div class="empty-state"><div class="empty-icon">📋</div>File vide</div>';
      } else {
        let html = "";
        for (const q of queues) {
          this._guildId = q.guild;
          html += '<div style="margin-bottom:12px">';
          html += '<div style="font-size:11px;color:var(--text-muted);margin-bottom:4px">📍 ' + Utils.escapeHtml(q.guild) + (q.playing ? ' · ▶ En lecture' : ' · ⏸ En pause') + ' · 🔊 ' + (q.volume || 50) + '%</div>';
          const songs = q.songs || [];
          if (songs.length) {
            html += '<div style="display:flex;flex-direction:column;gap:4px">';
            songs.forEach((s, i) => {
              const isCurrent = i === 0;
              html += '<div class="activity-item" style="' + (isCurrent ? 'background:rgba(59,130,246,0.06);border-radius:6px;padding:4px 8px' : '') + '">' +
                '<span class="activity-time">' + (i + 1) + '</span>' +
                '<span class="activity-dot" style="background:' + (isCurrent ? "var(--accent)" : "var(--text-muted)") + '">' + (isCurrent ? "▶" : "♪") + '</span>' +
                '<span class="activity-msg">' + Utils.escapeHtml(s.title?.substring(0, 50) || "Unknown") + (s.duration ? ' <span style="color:var(--text-muted)">(' + s.duration + ')</span>' : '') + '</span>' +
              '</div>';
            });
            html += '</div>';
          }
          html += '</div>';
        }
        queueEl.innerHTML = html;
      }
    }
  },
};
