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
  // Auto-detect API URL: prefer VPS, fallback to localhost
  if (!settings.apiUrl) {
    const controlPort = (() => {
      try {
        const envPath = path.join(__dirname, "..", ".env");
        if (fs.existsSync(envPath)) {
          const envContent = fs.readFileSync(envPath, "utf8");
          const match = envContent.match(/^CONTROL_PORT\s*=\s*["']?(\d+)["']?/m);
          if (match) return match[1];
        }
      } catch (e) {}
      return "3002";
    })();
    // Check if VPS_HOST is set in .env, otherwise use localhost
    const vpsHost = (() => {
      try {
        const envPath = path.join(__dirname, "..", ".env");
        if (fs.existsSync(envPath)) {
          const envContent = fs.readFileSync(envPath, "utf8");
          const match = envContent.match(/^VPS_HOST\s*=\s*["']?([^"'\s]+)["']?/m);
          if (match) return match[1];
        }
      } catch (e) {}
      return null;
    })();
    settings.apiUrl = vpsHost
      ? `http://${vpsHost}:${controlPort}`
      : `http://localhost:${controlPort}`;
  } else {
    // Migration: if apiUrl points to localhost but VPS_HOST is set, migrate
    if (settings.apiUrl.includes("localhost") || settings.apiUrl.includes("127.0.0.1")) {
      try {
        const envPath = path.join(__dirname, "..", ".env");
        if (fs.existsSync(envPath)) {
          const envContent = fs.readFileSync(envPath, "utf8");
          const vpsMatch = envContent.match(/^VPS_HOST\s*=\s*["']?([^"'\s]+)["']?/m);
          if (vpsMatch) {
            const oldPort = settings.apiUrl.match(/:(\d+)$/)?.[1] || "3002";
            settings.apiUrl = `http://${vpsMatch[1]}:${oldPort}`;
            console.log(`[Settings] Migrated API URL from localhost to VPS: ${settings.apiUrl}`);
          }
        }
      } catch (e) {}
    }
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
  return "http://31.220.79.90:3002";
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

// Amazon
ipcMain.handle("api:amazon", () => apiFetch("/api/amazon"));
ipcMain.handle("api:amazon-track", (_e, { asin, domain }) =>
  apiFetch("/api/amazon/track", { method: "POST", body: JSON.stringify({ asin, domain }) })
);
ipcMain.handle("api:amazon-wishlist", (_e, { wishlistUrl, domain }) =>
  apiFetch("/api/amazon/wishlist", { method: "POST", body: JSON.stringify({ wishlistUrl, domain }) })
);
ipcMain.handle("api:amazon-alert", (_e, { asin, targetPrice, channelId }) =>
  apiFetch("/api/amazon/alert", { method: "POST", body: JSON.stringify({ asin, targetPrice, channelId }) })
);
ipcMain.handle("api:amazon-deals", (_e, params) => {
  const qs = new URLSearchParams(params || {}).toString();
  return apiFetch("/api/amazon/deals" + (qs ? "?" + qs : ""));
});

// Security
ipcMain.handle("api:security", () => apiFetch("/api/security"));

// Minecraft LLM Agent
ipcMain.handle("mc:status", () => apiFetch("/api/mc/agent/status"));
ipcMain.handle("mc:world", () => apiFetch("/api/mc/agent/world"));
ipcMain.handle("mc:goal", (_e, { goal, maxActions }) =>
  apiFetch("/api/mc/agent/goal", { method: "POST", body: JSON.stringify({ goal, max_actions: maxActions || 80 }) })
);
ipcMain.handle("mc:stop", () => apiFetch("/api/mc/agent/stop", { method: "POST" }));
ipcMain.handle("mc:log", (_e, lines) => apiFetch("/api/mc/agent/log?lines=" + (lines || 50)));
ipcMain.handle("mc:chat", (_e, { message }) =>
  apiFetch("/api/mc/agent/chat", { method: "POST", body: JSON.stringify({ message }) })
);
ipcMain.handle("mc:action", (_e, { type, params }) =>
  apiFetch("/api/mc/agent/action", { method: "POST", body: JSON.stringify({ type, params: params || {} }) })
);
ipcMain.handle("mc:connect", (_e, { server, username }) =>
  apiFetch("/api/mc/agent/connect", { method: "POST", body: JSON.stringify({ server, username: username || "LLM_Bot" }) })
);

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
let wsReconnectTimer = null;
let wsReconnectAttempts = 0;
const WS_MAX_RECONNECT_DELAY = 30000;
const WS_BASE_RECONNECT_DELAY = 1000;
const WS_MAX_ATTEMPTS = 10;

function scheduleWsReconnect() {
  if (wsReconnectTimer) return;
  if (wsReconnectAttempts >= WS_MAX_ATTEMPTS) {
    console.log(`[WS] Max reconnect attempts (${WS_MAX_ATTEMPTS}) reached — falling back to HTTP polling`);
    mainWindow?.webContents.send("ws:status", "polling");
    return;
  }
  wsReconnectAttempts++;
  const delay = Math.min(WS_BASE_RECONNECT_DELAY * Math.pow(2, wsReconnectAttempts - 1), WS_MAX_RECONNECT_DELAY);
  console.log(`[WS] Reconnecting in ${delay}ms (attempt ${wsReconnectAttempts})`);
  mainWindow?.webContents.send("ws:status", "reconnecting");
  wsReconnectTimer = setTimeout(() => {
    wsReconnectTimer = null;
    doWsConnect().catch((err) => {
      console.error("[WS] Reconnect failed:", err);
      scheduleWsReconnect();
    });
  }, delay);
}

async function doWsConnect() {
  const apiBase = getApiBase();
  const wsToken = getToken();
  if (wsToken && !/^[a-zA-Z0-9_\-.]{0,256}$/.test(wsToken)) {
    throw new Error("Invalid token format");
  }
  const wsUrl = apiBase.replace(/^http/, "ws") + "/ws?token=" + encodeURIComponent(wsToken);
  ws = new WebSocket(wsUrl);

  return new Promise((resolve, reject) => {
    ws.onopen = () => {
      console.log("[WS] Connected");
      wsReconnectAttempts = 0;
      mainWindow?.webContents.send("ws:status", "connected");
      resolve();
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
      ws = null;
      scheduleWsReconnect();
    };

    ws.onerror = (err) => {
      console.error("[WS] Error:", err);
      reject(err);
    };
  });
}

ipcMain.handle("ws:connect", async () => {
  if (ws && ws.readyState === WebSocket.OPEN) return { ok: true };
  try {
    await doWsConnect();
    return { ok: true };
  } catch (err) {
    return { ok: false, error: "WebSocket connection failed" };
  }
});

ipcMain.handle("ws:disconnect", () => {
  if (wsReconnectTimer) { clearTimeout(wsReconnectTimer); wsReconnectTimer = null; }
  wsReconnectAttempts = 0;
  if (ws) { ws.close(); ws = null; }
});

// ─── Backend Connection Status ───────────────────────────────────────────

ipcMain.handle("backend:ping", async () => {
  try {
    const apiBase = getApiBase();
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 3000);
    const res = await fetch(`${apiBase}/api/health`, {
      signal: controller.signal,
      headers: { Authorization: `Bearer ${getToken()}` },
    });
    clearTimeout(timeout);
    if (res.ok) {
      const data = await res.json();
      return { ok: true, status: data.status, uptime: data.uptime, url: apiBase };
    }
    return { ok: false, status: `HTTP ${res.status}`, url: apiBase };
  } catch (err) {
    return { ok: false, error: err.message || "Connection failed", url: getApiBase() };
  }
});
