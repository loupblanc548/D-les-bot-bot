/**
 * When every LLM provider fails, retry in the background and edit the
 * Discord placeholder — the user should not have to send « go ».
 */
import type { Message } from "discord.js";
import logger from "../utils/logger.js";
import { recoverChatReply, clearPendingQuestion } from "./chatResponder.js";
import { isCannedFallback, isErrorResponse } from "./responseClassifier.js";
import { resetAllCircuitBreakers, ensureAtLeastOneModelAvailable } from "./modelRotation.js";
import { simulateStreamEdit } from "./streamingResponse.js";

export const SILENT_RECOVER_PLACEHOLDER = "💭 Un instant, je relance…";
export const SILENT_RECOVER_STILL_BUSY =
  "Toujours saturé de mon côté. Je réessaie dès que ça se libère — tu n'as rien à renvoyer.";

export interface SilentRecoverJob {
  userId: string;
  question: string;
  placeholder: Message;
  systemPrompt?: string;
  guildId?: string;
}

const queued = new Map<string, SilentRecoverJob>();
const running = new Set<string>();

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

export function scheduleSilentRecover(job: SilentRecoverJob): void {
  queued.set(job.userId, job);
  if (running.has(job.userId)) return;
  running.add(job.userId);
  void (async () => {
    try {
      while (queued.has(job.userId)) {
        const next = queued.get(job.userId);
        if (!next) break;
        queued.delete(job.userId);
        await runSilentRecover(next);
      }
    } finally {
      running.delete(job.userId);
    }
  })();
}

async function runSilentRecover(job: SilentRecoverJob): Promise<void> {
  const delays = process.env.NODE_ENV === "test" ? [0] : [2_500, 8_000, 20_000];
  try {
    for (const waitMs of delays) {
      if (waitMs > 0) await sleep(waitMs);
      resetAllCircuitBreakers();
      ensureAtLeastOneModelAvailable();
      const text = await recoverChatReply("", job.question, {
        systemPrompt: job.systemPrompt,
        userId: job.userId,
        guildId: job.guildId,
        maxTokens: 1500,
        deadlineMs: 22_000,
        retryDelayMs: 0,
      });
      if (text && !isCannedFallback(text) && !isErrorResponse(text) && text.trim().length > 8) {
        await simulateStreamEdit(job.placeholder, text);
        clearPendingQuestion(job.userId);
        logger.info(`[SilentRecover] réponse livrée pour ${job.userId}`);
        return;
      }
    }
    await job.placeholder
      .edit({
        content: SILENT_RECOVER_STILL_BUSY,
      })
      .catch(() => undefined);
  } catch (err) {
    logger.warn(`[SilentRecover] ${err instanceof Error ? err.message : String(err)}`);
    await job.placeholder.delete().catch(() => undefined);
  }
}
