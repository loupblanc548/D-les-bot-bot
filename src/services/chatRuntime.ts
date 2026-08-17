import logger from "../utils/logger.js";

export interface ChatRuntimeSignal {
  readonly aborted: boolean;
  readonly reason?: string;
  throwIfAborted(): void;
}

interface RuntimeJob {
  messageId: string;
  userId: string;
  run: (signal: ChatRuntimeSignal) => Promise<void>;
  notifyQueued?: (position: number) => void;
  controller: AbortController;
}

const MAX_CONCURRENT_JOBS = 2;
const MAX_QUEUE_SIZE = 8;
const COMPLETED_MESSAGE_TTL_MS = 10 * 60 * 1000;
const JOB_TIMEOUT_MS = 150_000;

const queue: RuntimeJob[] = [];
const activeJobs = new Map<string, RuntimeJob>();
const knownMessages = new Map<string, number>();

function pruneKnownMessages(now = Date.now()): void {
  for (const [messageId, expiresAt] of knownMessages) {
    if (expiresAt <= now) knownMessages.delete(messageId);
  }
}

function makeSignal(controller: AbortController): ChatRuntimeSignal {
  return {
    get aborted() {
      return controller.signal.aborted;
    },
    get reason() {
      return controller.signal.reason instanceof Error
        ? controller.signal.reason.message
        : String(controller.signal.reason || "");
    },
    throwIfAborted() {
      if (controller.signal.aborted) {
        throw controller.signal.reason instanceof Error
          ? controller.signal.reason
          : new Error(String(controller.signal.reason || "Chat request cancelled"));
      }
    },
  };
}

async function execute(job: RuntimeJob): Promise<void> {
  activeJobs.set(job.messageId, job);
  const timeout = setTimeout(() => {
    if (!job.controller.signal.aborted) {
      job.controller.abort(new Error("Chat request timed out"));
    }
  }, JOB_TIMEOUT_MS);

  try {
    await job.run(makeSignal(job.controller));
  } catch (error) {
    if (!job.controller.signal.aborted) {
      logger.warn(
        `[ChatRuntime] Job ${job.messageId} failed: ${error instanceof Error ? error.message : String(error)}`,
      );
    }
  } finally {
    clearTimeout(timeout);
    activeJobs.delete(job.messageId);
    knownMessages.set(job.messageId, Date.now() + COMPLETED_MESSAGE_TTL_MS);
    pump();
  }
}

function pump(): void {
  while (activeJobs.size < MAX_CONCURRENT_JOBS && queue.length > 0) {
    const next = queue.shift();
    if (!next) return;
    void execute(next);
  }
}

/** Enqueue a chat request. Returns false for duplicates or a full queue. */
export async function enqueueChatTask(
  messageId: string,
  userId: string,
  run: (signal: ChatRuntimeSignal) => Promise<void>,
  options: { notifyQueued?: (position: number) => Promise<void> | void } = {},
): Promise<boolean> {
  pruneKnownMessages();
  if (
    knownMessages.has(messageId) ||
    activeJobs.has(messageId) ||
    queue.some((job) => job.messageId === messageId)
  ) {
    return false;
  }
  if (queue.length >= MAX_QUEUE_SIZE && activeJobs.size >= MAX_CONCURRENT_JOBS) {
    return false;
  }

  const job: RuntimeJob = {
    messageId,
    userId,
    run,
    notifyQueued: options.notifyQueued,
    controller: new AbortController(),
  };
  knownMessages.set(messageId, Date.now() + COMPLETED_MESSAGE_TTL_MS);

  const position = queue.length + 1;
  if (activeJobs.size >= MAX_CONCURRENT_JOBS) {
    queue.push(job);
    if (options.notifyQueued) await options.notifyQueued(position);
  } else {
    void execute(job);
  }
  return true;
}

/** Cancel an active or queued chat request. */
export function cancelChatTask(messageId: string, userId?: string): boolean {
  const active = activeJobs.get(messageId);
  if (active && (!userId || active.userId === userId)) {
    active.controller.abort(new Error("Chat request cancelled by user"));
    return true;
  }

  const index = queue.findIndex(
    (job) => job.messageId === messageId && (!userId || job.userId === userId),
  );
  if (index >= 0) {
    const [job] = queue.splice(index, 1);
    job.controller.abort(new Error("Chat request cancelled by user"));
    knownMessages.set(messageId, Date.now() + COMPLETED_MESSAGE_TTL_MS);
    pump();
    return true;
  }
  return false;
}

export function getChatRuntimeStatus(): {
  active: number;
  queued: number;
  capacity: number;
} {
  return {
    active: activeJobs.size,
    queued: queue.length,
    capacity: MAX_CONCURRENT_JOBS,
  };
}

export function resetChatRuntimeForTests(): void {
  for (const job of activeJobs.values()) job.controller.abort(new Error("Runtime reset"));
  queue.splice(0, queue.length);
  activeJobs.clear();
  knownMessages.clear();
}
