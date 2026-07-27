/**
 * healthEndpoint.ts — Simple HTTP health check endpoint
 *
 * Returns JSON with bot status: Ollama, Piper, uptime, LLM stats.
 * Use with UptimeRobot or similar monitoring.
 *
 * Runs on port 7890 (configurable via HEALTH_PORT env).
 */

import { createServer, type Server } from "node:http";
import logger from "../utils/logger.js";
import { isLocalLlmAvailable } from "./localLlm.js";
import { isPiperAvailable } from "./localTts.js";
import { getStats } from "./llmStats.js";

let server: Server | null = null;

export function startHealthEndpoint(port: number = 7890): void {
  if (server) return;

  server = createServer((req, res) => {
    if (req.url === "/health") {
      const stats = getStats();
      const health = {
        status: "ok",
        timestamp: new Date().toISOString(),
        uptime_hours: stats.uptimeHours,
        services: {
          ollama: isLocalLlmAvailable(),
          piper_tts: isPiperAvailable(),
        },
        llm_stats: {
          total_messages: stats.total,
          local_handled: stats.localHandled,
          api_handled: stats.apiHandled,
          local_percentage: stats.localPct,
          delegated: stats.delegated,
          estimated_savings_tokens: stats.estimatedSavingsTokens,
          estimated_savings_eur: stats.estimatedSavingsEur,
        },
        tts_stats: {
          piper_used: stats.piperTtsUsed,
          api_used: stats.apiTtsUsed,
        },
      };

      res.writeHead(200, { "Content-Type": "application/json" });
      res.end(JSON.stringify(health, null, 2));
    } else {
      res.writeHead(404);
      res.end("Not found");
    }
  });

  server.listen(port, "127.0.0.1", () => {
    logger.info(`[HealthEndpoint] ✅ Endpoint /health sur http://127.0.0.1:${port}`);
  });

  server.on("error", (err) => {
    logger.warn(`[HealthEndpoint] Erreur: ${err.message}`);
  });
}

export function stopHealthEndpoint(): void {
  if (server) {
    server.close();
    server = null;
  }
}
