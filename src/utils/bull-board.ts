/**
 * bull-board.ts
 *
 * Dashboard visuel pour les queues BullMQ.
 * Accessible sur /admin/queues (port 3006 par défaut).
 * Permet de voir les jobs en attente, échoués, complétés.
 */

import express from "express";
import { createBullBoard } from "@bull-board/api";
import { BullMQAdapter } from "@bull-board/api/dist/queueAdapters/bullMQ.js";
import { ExpressAdapter } from "@bull-board/express";
import logger from "./logger.js";
import { dealQueue, notificationQueue, reminderQueue } from "../queues/index.js";

let server: ReturnType<typeof express.application.listen> | null = null;

export function startBullBoard(port = parseInt(process.env.BULL_BOARD_PORT || "3006")): void {
  if (server) return;
  if (!dealQueue || !notificationQueue || !reminderQueue) {
    logger.info("[BullBoard] REDIS non configuré — BullBoard désactivé");
    return;
  }

  const app = express();
  const serverAdapter = new ExpressAdapter();
  serverAdapter.setBasePath("/admin/queues");

  createBullBoard({
    queues: [
      new BullMQAdapter(dealQueue),
      new BullMQAdapter(notificationQueue),
      new BullMQAdapter(reminderQueue),
    ],
    serverAdapter: serverAdapter as unknown as Parameters<typeof createBullBoard>[0]["serverAdapter"],
  });

  app.use("/admin/queues", serverAdapter.getRouter());

  server = app.listen(port, () => {
    logger.info(`[BullBoard] Dashboard disponible sur http://localhost:${port}/admin/queues`);
  });
}

export function stopBullBoard(): void {
  if (server) {
    server.close();
    server = null;
    logger.info("[BullBoard] Dashboard arrêté");
  }
}
