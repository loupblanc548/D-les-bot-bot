import http from "http";
import { authenticate } from "../middleware/auth";
import type { FeedInfo } from "../types";

const PLATFORM_LABELS: Record<string, string> = {
  "free-games": "Jeux gratuits (Epic/Steam/GOG...)",
  "twitter": "Twitter / X",
  "deals": "Bons plans (Dealabs/PPDG...)",
  "steam-news": "Actualités Steam",
  "patch_notes": "Patch notes globaux",
  "instantgaming_news": "Instant Gaming - News",
  "instantgaming-giveaway": "Instant Gaming - Giveaway",
};

const platformActive: Record<string, boolean> = {
  "free-games": true, "twitter": true, "deals": true,
  "steam-news": true, "patch_notes": true,
  "instantgaming_news": true, "instantgaming-giveaway": true,
};

export function getPlatforms(): FeedInfo[] {
  return Object.keys(PLATFORM_LABELS).map((id) => ({
    id,
    label: PLATFORM_LABELS[id],
    active: platformActive[id] ?? false,
    cacheCount: 0,
    lastRun: null,
    responseTime: null,
    recentErrors: 0,
  }));
}

export function setPlatformActive(id: string, active: boolean): boolean {
  if (!(id in PLATFORM_LABELS)) return false;
  platformActive[id] = active;
  return true;
}

export function isPlatformActive(id: string): boolean {
  return platformActive[id] ?? false;
}

export function handleGetFeeds(req: http.IncomingMessage, res: http.ServerResponse): void {
  if (!authenticate(req, res)) return;
  res.writeHead(200, { "Content-Type": "application/json" });
  res.end(JSON.stringify({ success: true, data: getPlatforms(), timestamp: new Date().toISOString() }));
}

export function handleToggleFeed(req: http.IncomingMessage, res: http.ServerResponse): void {
  if (!authenticate(req, res)) return;

  let body = "";
  req.on("data", (chunk) => (body += chunk));
  req.on("end", () => {
    try {
      const { platformId, enable } = JSON.parse(body);
      if (!setPlatformActive(platformId, enable)) {
        res.writeHead(400, { "Content-Type": "application/json" });
        res.end(JSON.stringify({ success: false, error: "Plateforme inconnue: " + platformId }));
        return;
      }
      res.writeHead(200, { "Content-Type": "application/json" });
      res.end(JSON.stringify({ success: true, data: { platformId, active: enable }, timestamp: new Date().toISOString() }));
    } catch {
      res.writeHead(400, { "Content-Type": "application/json" });
      res.end(JSON.stringify({ success: false, error: "JSON invalide" }));
    }
  });
}
