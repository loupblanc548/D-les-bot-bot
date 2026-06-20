/**
 * aiMemory.ts — Per-user AI memory for John Helldiver.
 *
 * Stores facts (key/value with weight decay), recent messages,
 * tone/locale metadata, and an LLM-generated summary per user.
 *
 * Design:
 *   - Facts are upserted on {userId, key}; weight increments on each
 *     remember() to encode frequency/relevance.
 *   - Recall() reads top-K facts by weight, filters out expired and
 *     below-minWeight, and bumps access counters (fire-and-forget).
 *   - decayStep() applies a multiplicative decay to facts that have
 *     been idle for N days and prunes anything that drops below the
 *     minWeight threshold; entries are logged to MemoryDecayLog.
 *   - purgeExpired() removes facts whose expiresAt is in the past.
 *
 * Concurrency: all writes are isolated per-userId; reads are parallelised
 * across (user, facts, messages) via Promise.all.
 */
import prisma from "../prisma.js";
import logger from "../utils/logger.js";
// SQL tuning — caps that protect the bot from runaway queries.
const MAX_FACTS_PER_RECALL = 50;
const MAX_MESSAGES_PER_RECALL = 50;
// Weight tuning — defaults chosen empirically to balance recall vs staleness.
const WEIGHT_INCREMENT_ON_REMEMBER = 0.2;
const WEIGHT_INCREMENT_ON_RECALL = 0.05;
// Token approximation — fast, no model required.
function approximateTokens(text) {
    return Math.max(1, Math.ceil(text.length / 4));
}
// ─────────────────────────────────────────────────────────────────────────────
// Internals
// ─────────────────────────────────────────────────────────────────────────────
async function touch(userId) {
    await prisma.userMemory.upsert({
        where: { userId },
        create: { userId, lastActiveAt: new Date() },
        update: { lastActiveAt: new Date() },
    });
}
// ─────────────────────────────────────────────────────────────────────────────
// Public API
// ─────────────────────────────────────────────────────────────────────────────
/** Create or strengthen a fact. Increments weight on duplicates. */
export async function remember(userId, key, value, options = {}) {
    if (!userId || !key) {
        throw new Error("remember() requires both userId and key");
    }
    const expiresAt = options.ttlDays ? new Date(Date.now() + options.ttlDays * 86_400_000) : null;
    try {
        await prisma.memoryFact.upsert({
            where: { userId_key: { userId, key } },
            create: {
                userId,
                key,
                value,
                category: options.category ?? null,
                sourceMsg: options.sourceMsg ?? null,
                expiresAt,
                weight: 1.0,
            },
            update: {
                value,
                category: options.category ?? null,
                sourceMsg: options.sourceMsg ?? null,
                expiresAt,
                weight: { increment: WEIGHT_INCREMENT_ON_REMEMBER },
                updatedAt: new Date(),
            },
        });
        await touch(userId);
        logger.info(`[aiMemory] remember: user=${userId} key=${key} ttl=${options.ttlDays ?? "∞"}`);
    }
    catch (err) {
        logger.error(`[aiMemory] remember failed: user=${userId} key=${key} err=${err instanceof Error ? err.message : String(err)}`);
        throw err;
    }
}
/** Read top-K facts and tail-N messages for a user (swap). */
export async function recall(userId, opts = {}) {
    if (!userId)
        return emptySnapshot("");
    const limit = Math.min(opts.limit ?? 10, MAX_FACTS_PER_RECALL);
    const minWeight = opts.minWeight ?? 0.05;
    const includeMessages = opts.includeMessages ?? true;
    const messageLimit = Math.min(opts.messageLimit ?? 10, MAX_MESSAGES_PER_RECALL);
    const [user, facts, messages] = await Promise.all([
        prisma.userMemory.findUnique({ where: { userId } }),
        prisma.memoryFact.findMany({
            where: {
                userId,
                weight: { gte: minWeight },
                OR: [{ expiresAt: null }, { expiresAt: { gt: new Date() } }],
            },
            orderBy: { weight: "desc" },
            take: limit,
        }),
        includeMessages
            ? prisma.memoryMessage.findMany({
                where: opts.channelId ? { userId, channelId: opts.channelId } : { userId },
                orderBy: { createdAt: "desc" },
                take: messageLimit,
            })
            : Promise.resolve([]),
    ]);
    // Bump the access counters asynchronously — don't block the response.
    if (facts.length > 0) {
        void prisma.memoryFact
            .updateMany({
            where: { id: { in: facts.map((f) => f.id) } },
            data: {
                accessedAt: new Date(),
                accessCount: { increment: 1 },
                weight: { increment: WEIGHT_INCREMENT_ON_RECALL },
            },
        })
            .catch((err) => logger.error(`[aiMemory] recall bump failed: ${err instanceof Error ? err.message : String(err)}`));
    }
    await touch(userId);
    const recentMessages = messages.reverse().map((m) => ({
        role: m.role,
        content: m.content,
        at: m.createdAt,
        channelId: m.channelId,
    }));
    return {
        userId,
        guildId: user?.guildId ?? null,
        tone: user?.tone ?? "casual",
        locale: user?.locale ?? "fr",
        summary: user?.summary ?? null,
        facts: facts.map((f) => ({
            key: f.key,
            value: f.value,
            weight: f.weight,
            category: f.category ?? undefined,
        })),
        recentMessages,
        lastActiveAt: user?.lastActiveAt ?? new Date(),
    };
}
/** Forget a single fact (by key) or all facts for a user. Returns row count. */
export async function forget(userId, key) {
    if (key) {
        const r = await prisma.memoryFact.deleteMany({ where: { userId, key } });
        logger.info(`[aiMemory] forget: user=${userId} key=${key} count=${r.count}`);
        return r.count;
    }
    const r = await prisma.memoryFact.deleteMany({ where: { userId } });
    logger.info(`[aiMemory] forget: user=${userId} all count=${r.count}`);
    return r.count;
}
/** Hard reset: remove facts, messages, and the user record entirely. */
export async function forgetAll(userId) {
    await prisma.$transaction([
        prisma.memoryFact.deleteMany({ where: { userId } }),
        prisma.memoryMessage.deleteMany({ where: { userId } }),
        prisma.userMemory.deleteMany({ where: { userId } }),
    ]);
    logger.info(`[aiMemory] forgetAll: user=${userId}`);
}
/** Append a conversation message and bump lastActiveAt in one transaction. */
export async function appendMessage(userId, role, content, channelId) {
    if (!userId || !role || !content) {
        throw new Error("appendMessage requires userId, role, and content");
    }
    await prisma.$transaction([
        prisma.userMemory.upsert({
            where: { userId },
            create: { userId, lastActiveAt: new Date() },
            update: { lastActiveAt: new Date() },
        }),
        prisma.memoryMessage.create({
            data: {
                userId,
                role,
                content,
                channelId: channelId ?? null,
                tokens: approximateTokens(content),
            },
        }),
    ]);
}
/** Set or update the conversational tone for a user. */
export async function setTone(userId, tone) {
    const valid = ["casual", "formal", "meme", "helpful"];
    if (!valid.includes(tone))
        throw new Error(`invalid tone: ${tone}`);
    await prisma.userMemory.upsert({
        where: { userId },
        create: { userId, tone, lastActiveAt: new Date() },
        update: { tone, lastActiveAt: new Date() },
    });
}
/** Set the LLM-generated rolling summary for a user. */
export async function setSummary(userId, summary) {
    await prisma.userMemory.upsert({
        where: { userId },
        create: { userId, summary, lastActiveAt: new Date() },
        update: { summary, lastActiveAt: new Date() },
    });
}
/** Apply multiplicative decay to stale facts; prune anything below the floor. */
export async function decayStep(opts = {}) {
    const idleDays = opts.idleDays ?? 7;
    const factor = opts.factor ?? 0.9;
    const minWeight = opts.minWeight ?? 0.05;
    const cutoff = new Date(Date.now() - idleDays * 86_400_000);
    const stale = await prisma.memoryFact.findMany({
        where: { accessedAt: { lt: cutoff } },
        select: { id: true, weight: true, userId: true },
    });
    let pruned = 0;
    for (const fact of stale) {
        const next = fact.weight * factor;
        if (next < minWeight) {
            await prisma.memoryFact.delete({ where: { id: fact.id } });
            pruned++;
        }
        else {
            await prisma.memoryFact.update({ where: { id: fact.id }, data: { weight: next } });
        }
    }
    await prisma.memoryDecayLog.create({
        data: {
            factsBefore: stale.length,
            factsAfter: stale.length - pruned,
            notes: `idleDays=${idleDays} factor=${factor} minWeight=${minWeight}`,
        },
    });
    logger.info(`[aiMemory] decay: processed=${stale.length} pruned=${pruned}`);
    return { processed: stale.length, pruned };
}
/** Hard delete all facts whose expiresAt is now in the past. Returns count. */
export async function purgeExpired() {
    const r = await prisma.memoryFact.deleteMany({ where: { expiresAt: { lt: new Date() } } });
    logger.info(`[aiMemory] purgeExpired: count=${r.count}`);
    return r.count;
}
function emptySnapshot(userId) {
    return {
        userId,
        guildId: null,
        tone: "casual",
        locale: "fr",
        summary: null,
        facts: [],
        recentMessages: [],
        lastActiveAt: new Date(),
    };
}
export const aiMemory = {
    remember,
    recall,
    forget,
    forgetAll,
    appendMessage,
    setTone,
    setSummary,
    decayStep,
    purgeExpired,
};
// ─── Legacy-friendly aliases used by src/events/messages.ts ───
export async function addMessageToConversation(userId, role, content, channelId) {
    return appendMessage(userId, role, content, channelId);
}
export async function getConversationHistory(userId, channelId) {
    const snap = await recall(userId, {
        includeMessages: true,
        messageLimit: 50,
        channelId,
    });
    return snap.recentMessages;
}
export async function clearConversation(userId) {
    const r = await prisma.memoryMessage.deleteMany({ where: { userId } });
    logger.info(`[aiMemory] clearConversation: user=${userId} count=${r.count}`);
    return r.count;
}
//# sourceMappingURL=aiMemory.js.map