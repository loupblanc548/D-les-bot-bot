const { contextBridge, ipcRenderer } = require("electron");

contextBridge.exposeInMainWorld("electronAPI", {
  // Dashboard
  getStatus: () => ipcRenderer.invoke("api:status"),
  getPlatforms: () => ipcRenderer.invoke("api:platforms"),
  getCache: () => ipcRenderer.invoke("api:cache"),
  togglePlatform: (platformId, enable) =>
    ipcRenderer.invoke("api:toggle-platform", { platformId, enable }),
  triggerCleanup: () => ipcRenderer.invoke("api:cleanup"),
  restartBot: () => ipcRenderer.invoke("api:restart"),

  // Health & Activity
  getHealth: () => ipcRenderer.invoke("api:health"),
  getActivity: () => ipcRenderer.invoke("api:activity"),
  getDiscord: () => ipcRenderer.invoke("api:discord"),
  getStats: () => ipcRenderer.invoke("api:stats"),

  // Feeds / Flux
  fluxPause: (platformId) => ipcRenderer.invoke("api:flux-pause", { platformId }),
  fluxResume: (platformId) => ipcRenderer.invoke("api:flux-resume", { platformId }),
  fluxTest: (platformId) => ipcRenderer.invoke("api:flux-test", { platformId }),

  // Fortnite
  getFortnite: () => ipcRenderer.invoke("api:fortnite"),

  // Logs
  getLogs: (params) => ipcRenderer.invoke("api:logs", params),
  clearLogs: () => ipcRenderer.invoke("api:clear-logs"),

  // DM
  sendDM: (userId, message) => ipcRenderer.invoke("api:send-dm", { userId, message }),
  getDMHistory: () => ipcRenderer.invoke("api:dm-history"),

  // Servers
  getServers: () => ipcRenderer.invoke("api:servers"),

  // Moderation
  getModeration: () => ipcRenderer.invoke("api:moderation"),

  // Security
  getSecurity: () => ipcRenderer.invoke("api:security"),

  // Music
  getMusic: () => ipcRenderer.invoke("api:music"),
  musicControl: (action, guildId) => ipcRenderer.invoke("api:music-control", { action, guildId }),

  // Generic API fetch — endpoint validated in main process
  apiFetch: (endpoint, options) => {
    if (typeof endpoint !== "string" || endpoint.length > 500) {
      return Promise.reject(new Error("Invalid endpoint"));
    }
    return ipcRenderer.invoke("api:fetch", { endpoint, options });
  },

  // WebSocket
  connectWebSocket: () => ipcRenderer.invoke("ws:connect"),
  disconnectWebSocket: () => ipcRenderer.invoke("ws:disconnect"),
  onWsMessage: (callback) =>
    ipcRenderer.on("ws:message", (_event, data) => callback(data)),
  onWsStatus: (callback) =>
    ipcRenderer.on("ws:status", (_event, status) => callback(status)),

  // Settings
  loadSettings: () => ipcRenderer.invoke("settings:load"),
  saveSettings: (newSettings) => ipcRenderer.invoke("settings:save", newSettings),

  // Window controls
  minimizeWindow: () => ipcRenderer.invoke("window:minimize"),
  maximizeWindow: () => ipcRenderer.invoke("window:maximize"),
  closeWindow: () => ipcRenderer.invoke("window:close"),
});
