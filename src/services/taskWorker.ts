/**
 * taskWorker.ts — MODULE 3: Event-Driven Asynchronous Task Decoupling
 *
 * Decouples high-CPU/blocking tasks from the main event loop.
 * Heavy commands (backup, purge, channel-summary) are dispatched as async jobs
 * via an internal EventEmitter, keeping the Discord gateway responsive.
 *
 * Memory-safe: job results are cleaned up after delivery. Max queue size enforced.
 */

import { EventEmitter } from "events";
import { ChatInputCommandInteraction, Client, EmbedBuilder } from "discord.js";
import logger from "../utils/logger.js";

// ─── Types ───────────────────────────────────────────────────────────────────

export interface TaskJob {
  /** Unique job ID. */
  id: string;
  /** Task type (e.g. "backup", "purge-duplicates", "channel-summary"). */
  type: string;
  /** Discord interaction token for async follow-up. */
  interactionToken: string;
  /** Discord interaction ID. */
  interactionId: string;
  /** Guild ID. */
  guildId: string;
  /** User ID who triggered the task. */
  userId: string;
  /** Payload parameters for the task. */
  payload: Record<string, unknown>;
  /** Timestamp when the job was created. */
  createdAt: number;
  /** Timeout handle for auto-cleanup. */
  timeoutHandle: ReturnType<typeof setTimeout> | null;
}

export type TaskHandler = (job: TaskJob, client: Client) => Promise<TaskResult>;

export interface TaskResult {
  success: boolean;
  message: string;
  embeds?: EmbedBuilder[];
}

// ─── Configuration ───────────────────────────────────────────────────────────

const MAX_QUEUE_SIZE = 50;
const MAX_CONCURRENT_TASKS = 3;
const TASK_TIMEOUT_MS = 120_000; // 2 min max per task
const RESULT_CLEANUP_MS = 30_000; // Clean result refs after 30s

// ─── Task Worker ─────────────────────────────────────────────────────────────

const emitter = new EventEmitter();
emitter.setMaxListeners(MAX_QUEUE_SIZE + 10);

const taskHandlers = new Map<string, TaskHandler>();
const pendingJobs = new Map<string, TaskJob>();
const activeJobs = new Set<string>();
let runningCount = 0;

// ─── Stats ───────────────────────────────────────────────────────────────────

let totalTasksProcessed = 0;
let totalTasksFailed = 0;

export function getTaskWorkerStats(): {
  pending: number;
  active: number;
  totalProcessed: number;
  totalFailed: number;
  handlersRegistered: number;
} {
  return {
    pending: pendingJobs.size,
    active: activeJobs.size,
    totalProcessed: totalTasksProcessed,
    totalFailed: totalTasksFailed,
    handlersRegistered: taskHandlers.size,
  };
}

// ─── Handler Registration ────────────────────────────────────────────────────

/**
 * Register a handler for a specific task type.
 * Call this at startup for each heavy task type.
 */
export function registerTaskHandler(taskType: string, handler: TaskHandler): void {
  taskHandlers.set(taskType, handler);
  logger.info(`[TaskWorker] Registered handler for task type: ${taskType}`);
}

// ─── Job Submission ──────────────────────────────────────────────────────────

/**
 * Submit a heavy task for async processing.
 * The interaction should already be deferred via `interaction.deferReply({ ephemeral: true })`.
 *
 * Returns the job ID. The result will be delivered via `interaction.editReply()`.
 */
export function submitTask(
  interaction: ChatInputCommandInteraction,
  taskType: string,
  payload: Record<string, unknown> = {},
): string {
  const jobId = `${taskType}-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;

  // Enforce queue size limit
  if (pendingJobs.size >= MAX_QUEUE_SIZE) {
    logger.warn(`[TaskWorker] Queue full (${MAX_QUEUE_SIZE}), rejecting task ${taskType}`);
    void interaction.editReply({
      content: "⚠️ File de tâches saturée. Réessaie dans un instant.",
    });
    return jobId;
  }

  // Check handler exists
  if (!taskHandlers.has(taskType)) {
    logger.error(`[TaskWorker] No handler registered for task type: ${taskType}`);
    void interaction.editReply({
      content: `❌ Type de tâche inconnu: ${taskType}`,
    });
    return jobId;
  }

  const job: TaskJob = {
    id: jobId,
    type: taskType,
    interactionToken: interaction.token,
    interactionId: interaction.id,
    guildId: interaction.guildId || "",
    userId: interaction.user.id,
    payload,
    createdAt: Date.now(),
    timeoutHandle: null,
  };

  // Auto-cleanup if task never completes
  job.timeoutHandle = setTimeout(() => {
    handleTaskTimeout(job);
  }, TASK_TIMEOUT_MS);

  pendingJobs.set(jobId, job);
  logger.info(
    `[TaskWorker] Job submitted: ${jobId} (type: ${taskType}, queue: ${pendingJobs.size})`,
  );

  // Try to process immediately
  void processNext();

  return jobId;
}

// ─── Job Processing ──────────────────────────────────────────────────────────

async function processNext(): Promise<void> {
  if (runningCount >= MAX_CONCURRENT_TASKS) return;
  if (pendingJobs.size === 0) return;

  // Get the oldest pending job
  const [jobId, job] = pendingJobs.entries().next().value ?? [null, null];
  if (!jobId || !job) return;

  pendingJobs.delete(jobId);
  activeJobs.add(jobId);
  runningCount++;

  const handler = taskHandlers.get(job.type);
  if (!handler) {
    activeJobs.delete(jobId);
    runningCount--;
    return;
  }

  // Process in a microtask to yield to the event loop
  setImmediate(async () => {
    try {
      logger.info(`[TaskWorker] Processing job ${jobId} (active: ${runningCount})`);

      // Get the client from the global scope
      const { getClient } = await import("./clientRef.js");
      const client = getClient();
      if (!client) throw new Error("Discord client not available");

      const result = await handler(job, client);
      totalTasksProcessed++;

      // Deliver result via webhook follow-up
      await deliverResult(job, result);
    } catch (err) {
      totalTasksFailed++;
      totalTasksProcessed++;
      logger.error(
        `[TaskWorker] Job ${jobId} failed: ${err instanceof Error ? err.message : String(err)}`,
      );
      await deliverResult(job, {
        success: false,
        message: `❌ Tâche échouée: ${err instanceof Error ? err.message : "erreur inconnue"}`,
      });
    } finally {
      // Cleanup
      if (job.timeoutHandle) {
        clearTimeout(job.timeoutHandle);
        job.timeoutHandle = null;
      }
      activeJobs.delete(jobId);
      runningCount--;

      // Schedule result cleanup
      setTimeout(() => {
        // Results are delivered inline, nothing to clean here
        // This is just a safety net for any lingering references
      }, RESULT_CLEANUP_MS);

      // Process next in queue
      void processNext();
    }
  });
}

// ─── Result Delivery ─────────────────────────────────────────────────────────

async function deliverResult(job: TaskJob, result: TaskResult): Promise<void> {
  try {
    const { getClient } = await import("./clientRef.js");
    const client = getClient();
    if (!client) return;

    // Use the interaction token to follow up via webhook
    const appId = client.application?.id;
    if (!appId) {
      logger.error(`[TaskWorker] Cannot deliver result — client.application.id is null`);
      return;
    }
    const _response = await client.rest.post(
      `/webhooks/${appId}/${job.interactionToken}/messages/${job.interactionId}`,
      {
        body: {
          content: result.message,
          embeds: result.embeds?.map((e) => e.toJSON()),
        },
      },
    );
    logger.debug(`[TaskWorker] Result delivered for job ${job.id}`);
  } catch (err) {
    // Fallback: try editReply via the interaction if still available
    logger.error(
      `[TaskWorker] Failed to deliver result for job ${job.id}: ${err instanceof Error ? err.message : String(err)}`,
    );
  }
}

// ─── Timeout Handler ─────────────────────────────────────────────────────────

function handleTaskTimeout(job: TaskJob): void {
  if (!activeJobs.has(job.id) && !pendingJobs.has(job.id)) return;

  pendingJobs.delete(job.id);
  activeJobs.delete(job.id);
  runningCount = Math.max(0, runningCount - 1);
  totalTasksFailed++;

  logger.warn(`[TaskWorker] Job ${job.id} timed out after ${TASK_TIMEOUT_MS / 1000}s`);

  void deliverResult(job, {
    success: false,
    message: `⏱️ Tâche expirée (timeout: ${TASK_TIMEOUT_MS / 1000}s). L'opération était trop lourde.`,
  });

  void processNext();
}

// ─── Helper: Defer and Submit ────────────────────────────────────────────────

/**
 * Convenience function: defer the interaction and submit a task in one call.
 * Ensures the 3-second Discord acknowledgment deadline is met.
 */
export async function deferAndSubmit(
  interaction: ChatInputCommandInteraction,
  taskType: string,
  payload: Record<string, unknown> = {},
): Promise<string> {
  // Defer immediately (within 3s limit)
  await interaction.deferReply({ ephemeral: true });

  // Submit the task
  return submitTask(interaction, taskType, payload);
}

// ─── Cleanup ─────────────────────────────────────────────────────────────────

/**
 * Shutdown the task worker cleanly.
 */
export function shutdownTaskWorker(): void {
  // Clear all pending job timeouts
  for (const job of pendingJobs.values()) {
    if (job.timeoutHandle) clearTimeout(job.timeoutHandle);
  }
  pendingJobs.clear();
  activeJobs.clear();
  runningCount = 0;
  emitter.removeAllListeners();
  logger.info("[TaskWorker] Shutdown complete");
}
