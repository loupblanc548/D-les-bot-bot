const { app, BrowserWindow, ipcMain } = require("electron");
const path = require("path");

let mainWindow;

function createWindow() {
  mainWindow = new BrowserWindow({
    width: 1440,
    height: 900,
    minWidth: 1024,
    minHeight: 700,
    backgroundColor: "#0b1220",
    webPreferences: {
      preload: path.join(__dirname, "preload.js"),
      nodeIntegration: false,
      contextIsolation: true,
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

let settings = {};
const fs = require("fs");
const SETTINGS_FILE = path.join(app.getPath("userData"), "settings.json");

function loadSettings() {
  try {
    if (fs.existsSync(SETTINGS_FILE)) {
      settings = JSON.parse(fs.readFileSync(SETTINGS_FILE, "utf8"));
    }
  } catch (e) {
    settings = {};
  }
  return settings;
}

function saveSettings(newSettings) {
  settings = { ...settings, ...newSettings };
  try {
    fs.writeFileSync(SETTINGS_FILE, JSON.stringify(settings, null, 2));
  } catch (e) {
    console.error("Failed to save settings:", e);
  }
  return settings;
}

function getToken() {
  loadSettings();
  return settings.token || "CHANGE_ME_TO_MATCH_YOUR_CONTROL_TOKEN";
}

function getApiBase() {
  loadSettings();
  return "http://localhost:" + (settings.port || "3002");
}

// ─── API Helper ─────────────────────────────────────────────────────────

async function apiFetch(endpoint, options = {}) {
  const res = await fetch(getApiBase() + endpoint, {
    ...options,
    headers: {
      Authorization: "Bearer " + getToken(),
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
ipcMain.handle("api:cache", () => apiFetch("/api/cache"));
ipcMain.handle("api:toggle-platform", (_e, { platformId, enable }) =>
  apiFetch("/api/platforms/toggle", { method: "POST", body: JSON.stringify({ platformId, enable }) })
);
ipcMain.handle("api:cleanup", () => apiFetch("/api/cleanup", { method: "POST" }));
ipcMain.handle("api:restart", () => apiFetch("/api/bot/restart", { method: "POST" }));

// Health & Activity
ipcMain.handle("api:health", () => apiFetch("/api/health"));
ipcMain.handle("api:activity", () => apiFetch("/api/activity"));
ipcMain.handle("api:discord", () => apiFetch("/api/discord"));
ipcMain.handle("api:stats", () => apiFetch("/api/stats"));

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
    const port = settings.port || "3002";
    ws = new WebSocket("ws://localhost:" + port + "/ws?token=" + getToken());

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
