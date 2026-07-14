import logger from "../utils/logger.js";
import prisma from "../prisma.js";
import { getOpenAIClient } from "./ai.js";
import { config } from "../config.js";

// ── Configuration ────────────────────────────────────────────────
const MAX_HISTORY = 20; // Max messages chargés depuis la DB
const MAX_PERSIST_MS = 7 * 24 * 60 * 60 * 1000; // Rétention 7 jours

/** Récupère le prompt système spécifique à une guilde, ou le défaut global */
async function _getSystemPrompt(guildId?: string): Promise<string> {
  if (!guildId) return config.aiSystemPrompt;
  try {
    const gc = await prisma.guildConfig.findUnique({ where: { guildId } });
    return gc?.aiSystemPrompt || config.aiSystemPrompt;
  } catch {
    return config.aiSystemPrompt;
  }
}

// Map tampon pour éviter de relire la DB à chaque message (optimisation)
const channelBuffers = new Map<string, Array<{ role: "user" | "assistant"; content: string }>>();

// Salons avec aichat activé
const aichatChannels = new Set<string>();

// ── Persistance ──────────────────────────────────────────────────

/** Charge l'historique d'un salon depuis la DB */
async function loadHistory(
  channelId: string,
): Promise<Array<{ role: "user" | "assistant"; content: string }>> {
  try {
    const rows = await prisma.chatHistory.findMany({
      where: { channelId },
      orderBy: { createdAt: "asc" },
      take: MAX_HISTORY,
    });
    return rows.map((r) => ({
      role: r.role as "user" | "assistant",
      content: r.content,
    }));
  } catch (err) {
    logger.error("[AIChat] Erreur chargement historique:", err);
    return [];
  }
}

/** Sauvegarde deux messages (user + assistant) dans la DB */
async function persistMessages(
  channelId: string,
  userMsg: string,
  assistantMsg: string,
): Promise<void> {
  try {
    await prisma.chatHistory.createMany({
      data: [
        { channelId, role: "user", content: userMsg },
        { channelId, role: "assistant", content: assistantMsg },
      ],
    });
  } catch (err) {
    logger.error("[AIChat] Erreur sauvegarde historique:", err);
  }
}

/** Purge les messages vieux de +7 jours */
async function pruneOldMessages(channelId: string): Promise<void> {
  try {
    const cutoff = new Date(Date.now() - MAX_PERSIST_MS);
    await prisma.chatHistory.deleteMany({
      where: {
        channelId,
        createdAt: { lt: cutoff },
      },
    });
  } catch (err) {
    logger.error("[AIChat] Erreur purge historique:", err);
  }
}

// ── API publique ─────────────────────────────────────────────────

export function enableAiChat(channelId: string): void {
  aichatChannels.add(channelId);
  if (!channelBuffers.has(channelId)) {
    channelBuffers.set(channelId, []);
  }
}

export function disableAiChat(channelId: string): void {
  aichatChannels.delete(channelId);
  channelBuffers.delete(channelId);
}

export function isAiChatEnabled(channelId: string): boolean {
  return aichatChannels.has(channelId);
}

export function getConversationSize(channelId: string): number {
  return channelBuffers.get(channelId)?.length || 0;
}

/** Efface l'historique d'un salon (RAM + DB) */
export async function clearHistory(channelId: string): Promise<number> {
  channelBuffers.delete(channelId);
  try {
    const result = await prisma.chatHistory.deleteMany({
      where: { channelId },
    });
    return result.count;
  } catch (err) {
    logger.error("[AIChat] Erreur suppression historique:", err);
    return 0;
  }
}

// ── Chat avec historique persistant ──────────────────────────────

export async function chatWithHistory(
  channelId: string,
  userMessage: string,
  username?: string,
  _guildId?: string,
): Promise<string> {
  const client = getOpenAIClient();
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 25_000);

  try {
    // Charger depuis la DB si le buffer est vide (premier message après démarrage)
    let buffer = channelBuffers.get(channelId);
    if (!buffer || buffer.length === 0) {
      buffer = await loadHistory(channelId);
      channelBuffers.set(channelId, buffer);
    }

    const displayName = username || "Utilisateur";

    const messages: Array<{
      role: "system" | "user" | "assistant";
      content: string;
    }> = [
      {
        role: "system",
        content:
          config.aiSystemPrompt +
          "\n\nIMPORTANT: Tu réponds dans la langue du message que tu reçois. " +
          "Adapte-toi à n'importe quelle langue du monde. " +
          "\n\nTu es John Helldiver, un bot Discord sur un serveur gaming français. " +
          "Tu n'es PAS un humain — tu es un bot. Si quelqu'un te demande de l'ajouter sur Discord, " +
          "de jouer ensemble, ou te demande ton pseudo, réponds naturellement que tu es un bot et que tu ne joues pas. " +
          "Si quelqu'un demande le lien du serveur Discord, tu peux donner https://discord.gg/hAVqWmpGV. " +
          "Sois concis, naturel et conversationnel. Réponds en quelques phrases maximum. " +
          "Tu te souviens des messages précédents dans ce salon.",
      },
    ];

    // Ajouter l'historique récent
    const recentHistory = buffer.slice(-MAX_HISTORY);
    for (const msg of recentHistory) {
      messages.push(msg);
    }

    // Ajouter le nouveau message
    messages.push({
      role: "user",
      content: `${displayName}: ${userMessage}`,
    });

    const completion = await client.chat.completions.create(
      {
        model: config.openRouterModel,
        messages,
        max_tokens: 500,
        temperature: 0.8,
      },
      { signal: controller.signal },
    );

    const reply = completion.choices[0]?.message?.content || "(pas de reponse)";

    // Sauvegarder dans le buffer
    buffer.push({ role: "user", content: userMessage });
    buffer.push({ role: "assistant", content: reply });

    while (buffer.length > MAX_HISTORY) buffer.shift();

    // Persister dans la DB (fire-and-forget, pas de await pour ne pas bloquer)
    persistMessages(channelId, userMessage, reply);
    pruneOldMessages(channelId);

    return reply;
  } catch (err: unknown) {
    if ((err as Error)?.name === "AbortError" || (err as any)?.code === "ETIMEDOUT") {
      return "⏰ L'IA met trop de temps a repondre. Reessaye.";
    }
    logger.error("[AIChat] Erreur:", err);
    return "❌ L'IA est momentanement indisponible.";
  } finally {
    clearTimeout(timeout);
  }
}

// ── Génération de sondages ───────────────────────────────────────

export async function generatePollOptions(question: string): Promise<string[]> {
  const client = getOpenAIClient();
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 20_000);

  try {
    const completion = await client.chat.completions.create(
      {
        model: config.openRouterModel,
        messages: [
          {
            role: "system",
            content:
              "Tu es un generateur de sondages. Recris la question de maniere neutre et claire, puis propose 3 a 5 options pertinentes. " +
              'Reponds UNIQUEMENT au format JSON : {"question":"...","options":["Option 1","Option 2","Option 3"]}. ' +
              "Les options doivent etre courtes (max 55 caracteres). Sois creatif et varie les perspectives.",
          },
          { role: "user", content: question },
        ],
        max_tokens: 400,
        temperature: 0.9,
        response_format: { type: "json_object" },
      },
      { signal: controller.signal },
    );

    const raw = completion.choices[0]?.message?.content || "{}";
    const parsed = JSON.parse(raw);

    const options: string[] = parsed.options || [];
    if (parsed.question) {
      return [parsed.question, ...options.slice(0, 5)];
    }
    return [question, ...options.slice(0, 5)];
  } catch (err: unknown) {
    if ((err as Error)?.name === "AbortError") return [];
    logger.error("[SmartPoll] Erreur generation:", err);
    return [];
  } finally {
    clearTimeout(timeout);
  }
}
