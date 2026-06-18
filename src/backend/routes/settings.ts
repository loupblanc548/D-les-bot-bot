import http from "http";
import { authenticate } from "../middleware/auth.js";
import type { AppSettings } from "../types.js";

let settings: AppSettings = {
  refreshInterval: 5,
  theme: "dark",
  notifications: true,
  autoReconnect: true,
};

export function getSettings(): AppSettings {
  return { ...settings };
}

export function updateSettings(partial: Partial<AppSettings>): AppSettings {
  settings = { ...settings, ...partial };
  return { ...settings };
}

export function handleGetSettings(req: http.IncomingMessage, res: http.ServerResponse): void {
  if (!authenticate(req, res)) return;
  res.writeHead(200, { "Content-Type": "application/json" });
  res.end(JSON.stringify({ success: true, data: getSettings(), timestamp: new Date().toISOString() }));
}

export function handlePutSettings(req: http.IncomingMessage, res: http.ServerResponse): void {
  if (!authenticate(req, res)) return;
  let body = "";
  req.on("data", (chunk) => (body += chunk));
  req.on("end", () => {
    try {
      const partial = JSON.parse(body);
      const allowed = ["refreshInterval", "theme", "notifications", "autoReconnect"];
      const sanitized: Partial<AppSettings> = {};
      for (const key of allowed) {
        if (key in partial) sanitized[key as keyof AppSettings] = partial[key];
      }
      if (sanitized.refreshInterval && (sanitized.refreshInterval < 1 || sanitized.refreshInterval > 60)) {
        res.writeHead(400, { "Content-Type": "application/json" });
        res.end(JSON.stringify({ success: false, error: "refreshInterval doit être entre 1 et 60" }));
        return;
      }
      const data = updateSettings(sanitized);
      res.writeHead(200, { "Content-Type": "application/json" });
      res.end(JSON.stringify({ success: true, data, timestamp: new Date().toISOString() }));
    } catch {
      res.writeHead(400, { "Content-Type": "application/json" });
      res.end(JSON.stringify({ success: false, error: "JSON invalide" }));
    }
  });
}
