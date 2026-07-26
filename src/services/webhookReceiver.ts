/**
 * webhookReceiver.ts — Réception de webhooks entrants avec vérification de signature
 *
 * Supporte la vérification HMAC-SHA256 (style GitHub/Stripe) et
 * un système de retry pour les handlers asynchrones.
 */

import { createHmac, timingSafeEqual } from "node:crypto";
import http from "node:http";
import logger from "../utils/logger.js";

type WebhookHandler = (event: string, payload: unknown, headers: Record<string, string>) => Promise<void>;

interface WebhookRoute {
  path: string;
  secret: string;
  handler: WebhookHandler;
  signatureHeader: string;
  signaturePrefix: string;
}

const routes = new Map<string, WebhookRoute>();

/** Enregistre une route webhook */
export function registerWebhook(
  path: string,
  secret: string,
  handler: WebhookHandler,
  opts: { signatureHeader?: string; signaturePrefix?: string } = {},
): void {
  routes.set(path, {
    path,
    secret,
    handler,
    signatureHeader: opts.signatureHeader ?? "x-hub-signature-256",
    signaturePrefix: opts.signaturePrefix ?? "sha256=",
  });
  logger.info(`[WebhookReceiver] Route enregistrée: ${path}`);
}

/** Vérifie la signature HMAC-SHA256 d'un payload */
export function verifySignature(payload: Buffer, signature: string, secret: string, prefix = "sha256="): boolean {
  if (!signature.startsWith(prefix)) return false;
  const expected = prefix + createHmac("sha256", secret).update(payload).digest("hex");
  const sigBuf = Buffer.from(signature);
  const expBuf = Buffer.from(expected);
  if (sigBuf.length !== expBuf.length) return false;
  return timingSafeEqual(sigBuf, expBuf);
}

/** Gère une requête HTTP entrante — à brancher dans le control-server */
export async function handleWebhook(
  req: http.IncomingMessage,
  res: http.ServerResponse,
  body: Buffer,
): Promise<boolean> {
  const path = req.url?.split("?")[0] ?? "";
  const route = routes.get(path);
  if (!route) return false;

  const signature = req.headers[route.signatureHeader] as string | undefined;
  if (!signature || !verifySignature(body, signature, route.secret, route.signaturePrefix)) {
    logger.warn(`[WebhookReceiver] Signature invalide pour ${path}`);
    res.writeHead(401, { "Content-Type": "application/json" });
    res.end(JSON.stringify({ error: "Invalid signature" }));
    return true;
  }

  const event = (req.headers["x-github-event"] as string) ?? "webhook";
  let payload: unknown;
  try {
    payload = JSON.parse(body.toString("utf-8"));
  } catch {
    logger.warn(`[WebhookReceiver] Payload JSON invalide pour ${path}`);
    res.writeHead(400, { "Content-Type": "application/json" });
    res.end(JSON.stringify({ error: "Invalid JSON" }));
    return true;
  }

  // ACK immédiat, handler async avec retry
  res.writeHead(200, { "Content-Type": "application/json" });
  res.end(JSON.stringify({ received: true }));

  const headers: Record<string, string> = {};
  for (const [k, v] of Object.entries(req.headers)) {
    if (typeof v === "string") headers[k] = v;
  }

  executeWithRetry(route.handler, event, payload, headers, route.path);
  return true;
}

async function executeWithRetry(
  handler: WebhookHandler,
  event: string,
  payload: unknown,
  headers: Record<string, string>,
  routePath: string,
  maxRetries = 3,
): Promise<void> {
  for (let attempt = 1; attempt <= maxRetries; attempt++) {
    try {
      await handler(event, payload, headers);
      return;
    } catch (err) {
      logger.error(
        `[WebhookReceiver] ${routePath} handler failed (attempt ${attempt}/${maxRetries}): ${err instanceof Error ? err.message : String(err)}`,
      );
      if (attempt < maxRetries) {
        await new Promise((r) => setTimeout(r, 1000 * Math.pow(2, attempt - 1)));
      }
    }
  }
  logger.error(`[WebhookReceiver] ${routePath} handler exhausted ${maxRetries} retries`);
}
