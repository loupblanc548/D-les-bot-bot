/* ═══════════════════════════════════════════════════════════════════════════
   websocket.js — WebSocket real-time communication
   ═══════════════════════════════════════════════════════════════════════════ */

const WS = {
  _reconnectTimer: null,
  _reconnectDelay: 2000,
  _maxReconnectDelay: 30000,
  _pollingTimer: null,
  _pollingInterval: 5000,
  _usePolling: false,

  async connect() {
    if (this._usePolling) { this._startPolling(); return; }
    try {
      await window.electronAPI.connectWebSocket();
      Store.setWsStatus(true);
      this._reconnectDelay = 2000;
    } catch (e) {
      Store.setWsStatus(false);
      this._tryPollingFallback();
    }
  },

  _tryPollingFallback() {
    if (this._pollingTimer) return;
    this._usePolling = true;
    console.log("[WS] WebSocket failed — switching to HTTP polling fallback");
    Store.setWsStatus(false);
    this._startPolling();
  },

  _startPolling() {
    if (this._pollingTimer) clearInterval(this._pollingTimer);
    this._pollingTimer = setInterval(() => {
      API.fetchStatus().catch(() => {});
      API.fetchPlatforms().catch(() => {});
    }, this._pollingInterval);
  },

  _stopPolling() {
    if (this._pollingTimer) { clearInterval(this._pollingTimer); this._pollingTimer = null; }
  },

  _scheduleReconnect() {
    if (this._reconnectTimer) return;
    if (this._usePolling) return;
    this._reconnectTimer = setTimeout(() => {
      this._reconnectTimer = null;
      this._reconnectDelay = Math.min(this._reconnectDelay * 1.5, this._maxReconnectDelay);
      this.connect();
    }, this._reconnectDelay);
  },

  handleMessage(data) {
    switch (data.type) {
      case "log":
        Store.addLog(data);
        break;
      case "platform-update":
        Store.update("platforms", data.platforms);
        break;
      case "cache-update":
        API.fetchStatus();
        break;
      case "activity":
        Store.update("activity", data.events);
        break;
      case "bot-status":
        API.fetchStatus();
        break;
      case "dashboard-update":
        Store.update("status", data);
        break;
      case "fortnite-update":
        API.fetchFortnite();
        // Badge clignotant dans la sidebar (uniquement si l'onglet Fortnite n'est pas actif)
        var badge = document.getElementById("fn-badge");
        var tabActive = document.getElementById("tab-fortnite")?.classList.contains("active");
        if (badge && !tabActive) {
          var count = parseInt(badge.textContent) || 0;
          if (count < 99) {
            badge.textContent = count + 1;
          } else {
            badge.textContent = "99+";
          }
          badge.style.display = "inline-flex";
          badge.classList.add("fn-blink");
          badge.addEventListener("animationend", function handler() {
            badge.classList.remove("fn-blink");
            badge.removeEventListener("animationend", handler);
          }, { once: true });
        } else if (badge && tabActive) {
          // Onglet actif : réinitialiser le badge
          badge.textContent = "0";
          badge.style.display = "none";
        }
        if (tabActive) {
          Notifications.info("Nouvelle détection Fortnite !");
        }
        break;
      case "alert":
        Store.update("alerts", Store.get("alerts") ? [...Store.get("alerts"), data] : [data]);
        Notifications.warning(data.title);
        break;
      case "metric-snapshot":
        Store.update("metrics", data);
        break;
      case "connected":
        Store.update("platforms", data.platforms);
        break;
    }
  },

  handleStatus(status) {
    Store.setWsStatus(status === "connected");
    if (status !== "connected" && !this._usePolling) this._scheduleReconnect();
  },
};

// Register WebSocket listeners from Electron preload
window.electronAPI.onWsMessage((data) => WS.handleMessage(data));
window.electronAPI.onWsStatus((status) => WS.handleStatus(status));
