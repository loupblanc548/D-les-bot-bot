/**
 * index.ts — Point d'entrée du bot Discord
 *
 * Délègue au shardManager qui détecte automatiquement si le bot
 * a besoin de sharding (mode single par défaut, mode sharded si FORCE_SHARDING=true).
 *
 * Modules :
 *   - shardManager.ts : Sharding automatique (inspiré de discord-hybrid-sharding)
 *   - bot.ts           : Orchestrateur (main, client, connexions)
 *   - commandRouter.ts : Routeur de commandes
 *   - interactionHandler.ts : Gestionnaires d'interactions
 *   - startup.ts       : Logique de démarrage (ClientReady)
 *   - shutdown.ts      : Arrêt gracieux (SIGINT/SIGTERM)
 */

import { startBot } from "./shardManager.js";

// ── Node v26 + undici workaround ────────────────────────────────────────────
// Node v26 changed Headers constructor to reject Symbol keys (sensitiveHeaders).
// undici 8.5.0 passes this symbol internally, causing a ByteString conversion error.
// We patch undici's Headers to strip Symbol keys from init objects.
try {
  const undici = await import("undici");
  const OrigHeaders = undici.Headers;
  class PatchedHeaders extends OrigHeaders {
    constructor(init?: any) {
      if (init && typeof init === "object" && !Array.isArray(init) && !(init instanceof OrigHeaders)) {
        const clean: Record<string, string> = {};
        for (const key of Object.keys(init)) {
          clean[key] = init[key];
        }
        super(clean as any);
      } else if (init instanceof OrigHeaders) {
        const clean: Record<string, string> = {};
        init.forEach((value: string, key: string) => { clean[key] = value; });
        super(clean as any);
      } else {
        super(init);
      }
    }
  }
  undici.Headers = PatchedHeaders as any;
  if (globalThis.Headers) {
    const GHeaders = globalThis.Headers;
    class PatchedGlobal extends GHeaders {
      constructor(init?: any) {
        if (init && typeof init === "object" && !Array.isArray(init) && !(init instanceof GHeaders)) {
          const clean: Record<string, string> = {};
          for (const key of Object.keys(init)) {
            clean[key] = init[key];
          }
          super(clean as any);
        } else {
          super(init as any);
        }
      }
    }
    globalThis.Headers = PatchedGlobal as any;
  }
} catch {
  // undici not available — skip patch
}

startBot();
