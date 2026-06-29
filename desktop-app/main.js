const { app, BrowserWindow, ipcMain } = require("electron");
const path = require("path");
const WebSocket = require("ws");

let mainWindow;

function createWindow() {
  mainWindow = new BrowserWindow({
    width: 1440,
    height: 900,
    minWidth: 1024,
    minHeight: 700,
    backgroundColor: "#00000000",
    transparent: true,
    webPreferences: {
      preload: path.join(__dirname, "preload.js"),
      nodeIntegration: false,
      contextIsolation: true,
      sandbox: true,
      webSecurity: true,
      allowRunningInsecureContent: false,
    },
    frame: false,
    titleBarStyle: "hidden",
  });

  mainWindow.loadFile("index.html");
  mainWindow.setMenu(null);
}

app.whenReady().then(createWindow);
app.on("window-all-closed", () => app.quit());

// ─── Settings ────────────────────────────────────────────────────────────

let settings = null;
const fs = require("fs");
const SETTINGS_FILE = path.join(app.getPath("userData"), "settings.json");

function loadSettings() {
  if (settings) return settings;
  try {
    if (fs.existsSync(SETTINGS_FILE)) {
      settings = JSON.parse(fs.readFileSync(SETTINGS_FILE, "utf8"));
    } else {
      settings = {};
    }
  } catch (e) {
    settings = {};
  }
  // Auto-populate token from bot .env if not set
  if (!settings.token) {
    try {
      const envPath = path.join(__dirname, "..", ".env");
      if (fs.existsSync(envPath)) {
        const envContent = fs.readFileSync(envPath, "utf8");
        const match = envContent.match(/^CONTROL_TOKEN\s*=\s*["']?([^"'\s]*)["']?/m);
        if (match) {
          settings.token = match[1] || "no-token-needed";
          console.log("[Settings] Auto-loaded CONTROL_TOKEN from .env");
        } else {
          // CONTROL_TOKEN not set in .env — control server allows no-auth
          settings.token = "no-token-needed";
          console.log("[Settings] CONTROL_TOKEN not set — using no-auth mode");
        }
      } else {
        settings.token = "no-token-needed";
      }
    } catch (e) {
      // Ignore — user can set manually
    }
  }
  // Auto-detect local API URL if not set
  if (!settings.apiUrl) {
    const controlPort = (() => {
      try {
        const envPath = path.join(__dirname, "..", ".env");
        if (fs.existsSync(envPath)) {
          const envContent = fs.readFileSync(envPath, "utf8");
          const match = envContent.match(/^CONTROL_PORT\s*=\s*(\d+)/m);
          if (match) return match[1];
        }
      } catch (e) {}
      return "3002";
    })();
    settings.apiUrl = "http://localhost:" + controlPort;
  }
  return settings;
}

function saveSettings(newSettings) {
  settings = { ...loadSettings(), ...newSettings };
  try {
    fs.writeFileSync(SETTINGS_FILE, JSON.stringify(settings, null, 2));
  } catch (e) {
    console.error("Failed to save settings:", e);
  }
  return settings;
}

function getToken() {
  const t = loadSettings().token;
  if (!t) {
    throw new Error("No auth token configured. Set it in Settings.");
  }
  return t;
}

function getApiBase() {
  const s = loadSettings();
  if (s.apiUrl) return s.apiUrl.replace(/\/$/, "");
  return "http://localhost:3002";
}

// ─── API Helper ─────────────────────────────────────────────────────────

async function apiFetch(endpoint, options = {}) {
  const token = getToken();
  // Validate token format before sending (prevent injection via malformed stored token)
  if (token && !/^[a-zA-Z0-9_\-.]{0,256}$/.test(token)) {
    throw new Error("Invalid token format");
  }
  const res = await fetch(getApiBase() + endpoint, {
    ...options,
    headers: {
      Authorization: "Bearer " + token,
      "Content-Type": "application/json",
      ...(options.headers || {}),
    },
  });
  if (!res.ok) {
    throw new Error("API error " + res.status + ": " + (await res.text()));
  }
  return res.json();
}

// ─── IPC Handlers ───────────────────────────────────────────────────────

// Dashboard
ipcMain.handle("api:status", () => apiFetch("/api/status"));
ipcMain.handle("api:platforms", () => apiFetch("/api/platforms"));
ipcMain.handle("api:cache", () => apiFetch("/api/metrics"));
ipcMain.handle("api:toggle-platform", (_e, { platformId, enable }) =>
  apiFetch("/api/flux/" + (enable ? "resume" : "pause"), { method: "POST", body: JSON.stringify({ platformId }) })
);
ipcMain.handle("api:cleanup", () => apiFetch("/api/flux/test", { method: "POST", body: JSON.stringify({ platformId: "all" }) }));
ipcMain.handle("api:restart", () => apiFetch("/api/restart", { method: "POST" }));

// Health & Activity
ipcMain.handle("api:health", () => apiFetch("/api/health"));
ipcMain.handle("api:activity", () => apiFetch("/api/logs?limit=20"));
ipcMain.handle("api:discord", () => apiFetch("/api/status"));
ipcMain.handle("api:stats", () => apiFetch("/api/metrics"));

// Feeds / Flux
ipcMain.handle("api:flux-pause", (_e, { platformId }) =>
  apiFetch("/api/flux/pause", { method: "POST", body: JSON.stringify({ platformId }) })
);
ipcMain.handle("api:flux-resume", (_e, { platformId }) =>
  apiFetch("/api/flux/resume", { method: "POST", body: JSON.stringify({ platformId }) })
);
ipcMain.handle("api:flux-test", (_e, { platformId }) =>
  apiFetch("/api/flux/test", { method: "POST", body: JSON.stringify({ platformId }) })
);

// Fortnite
ipcMain.handle("api:fortnite", () => apiFetch("/api/fortnite"));

// Logs
ipcMain.handle("api:logs", (_e, params) => {
  const qs = new URLSearchParams(params || {}).toString();
  return apiFetch("/api/logs" + (qs ? "?" + qs : ""));
});
ipcMain.handle("api:clear-logs", () => apiFetch("/api/logs", { method: "DELETE" }));

// DM
ipcMain.handle("api:send-dm", (_e, { userId, message }) =>
  apiFetch("/api/dm/send", { method: "POST", body: JSON.stringify({ userId, message }) })
);
ipcMain.handle("api:dm-history", () => apiFetch("/api/dm/history"));

// Servers
ipcMain.handle("api:servers", () => apiFetch("/api/servers"));

// Moderation
ipcMain.handle("api:moderation", () => apiFetch("/api/moderation"));

// Security
ipcMain.handle("api:security", () => apiFetch("/api/security"));

// Music
ipcMain.handle("api:music", () => apiFetch("/api/music"));
ipcMain.handle("api:music-control", (_e, { action, guildId }) =>
  apiFetch("/api/music/control", { method: "POST", body: JSON.stringify({ action, guildId }) })
);

// Generic fetch — restricted to allowlisted API paths only
const ALLOWED_API_PREFIXES = ["/api/", "/ws"];
ipcMain.handle("api:fetch", (_e, { endpoint, options }) => {
  if (!endpoint || typeof endpoint !== "string") {
    return Promise.reject(new Error("Invalid endpoint"));
  }
  if (!ALLOWED_API_PREFIXES.some((p) => endpoint.startsWith(p))) {
    return Promise.reject(new Error("Endpoint not allowed: " + endpoint));
  }
  return apiFetch(endpoint, options);
});

// Settings
ipcMain.handle("settings:load", () => loadSettings());
ipcMain.handle("settings:save", (_e, newSettings) => saveSettings(newSettings));

// Window controls
ipcMain.handle("window:minimize", () => mainWindow?.minimize());
ipcMain.handle("window:maximize", () => {
  if (mainWindow?.isMaximized()) mainWindow.unmaximize();
  else mainWindow?.maximize();
});
ipcMain.handle("window:close", () => mainWindow?.close());

// ─── WebSocket ──────────────────────────────────────────────────────────

let ws = null;

ipcMain.handle("ws:connect", () => {
  if (ws && ws.readyState === WebSocket.OPEN) return { ok: true };

  return new Promise((resolve) => {
    const apiBase = getApiBase();
    const wsToken = getToken();
    if (wsToken && !/^[a-zA-Z0-9_\-.]{0,256}$/.test(wsToken)) {
      resolve({ ok: false, error: "Invalid token format" });
      return;
    }
    const wsUrl = apiBase.replace(/^http/, "ws") + "/ws?token=" + encodeURIComponent(wsToken);
    ws = new WebSocket(wsUrl);

    ws.onopen = () => {
      console.log("[WS] Connected");
      mainWindow?.webContents.send("ws:status", "connected");
      resolve({ ok: true });
    };

    ws.onmessage = (event) => {
      try {
        mainWindow?.webContents.send("ws:message", JSON.parse(event.data));
      } catch (e) {
        console.error("[WS] Parse error:", e);
      }
    };

    ws.onclose = () => {
      console.log("[WS] Disconnected");
      mainWindow?.webContents.send("ws:status", "disconnected");
    };

    ws.onerror = (err) => {
      console.error("[WS] Error:", err);
      resolve({ ok: false, error: "WebSocket connection failed" });
    };
  });
});

ipcMain.handle("ws:disconnect", () => {
  if (ws) { ws.close(); ws = null; }
});
