/**
 * aiConversation.ts — Gestionnaire de conversations temporaires pour l'IA.
 *
 * Principe :
 *   - Chaque @mention démarre/continue une conversation par utilisateur.
 *   - La conversation garde TOUS les messages en mémoire (DB) pendant qu'elle est active.
 *   - Après 10 minutes d'inactivité, la conversation est considérée comme terminée.
 *   - À la fin, les faits importants sont extraits via LLM et sauvegardés en mémoire long-terme.
 *   - Les messages de conversation sont alors effacés, mais les faits persistent.
 *   - Au prochain @mention, l'IA a accès aux faits long-terme mais repart d'une conversation vierge.
 */

import logger from "../utils/logger.js";
import { config } from "../config.js";
import { recall, remember, clearConversation, type UserMemorySnapshot } from "./aiMemory.js";

const CONVERSATION_TIMEOUT_MS = 10 * 60 * 1000; // 10 minutes d'inactivité = fin

// Tracker des conversations actives : userId → lastActivityTimestamp
const activeConversations = new Map<string, number>();

// ─── API publique ─────────────────────────────────────────────────────────────

/** Vérifie si une conversation est encore active (moins de 10 min depuis le dernier message). */
export function isConversationActive(userId: string): boolean {
  const lastActivity = activeConversations.get(userId);
  if (!lastActivity) return false;
  return Date.now() - lastActivity < CONVERSATION_TIMEOUT_MS;
}

/** Marque une activité dans la conversation (appelé à chaque @mention). */
export function touchConversation(userId: string): void {
  activeConversations.set(userId, Date.now());
}

/**
 * Vérifie toutes les conversations actives. Si une a dépassé le timeout,
 * extrait les faits importants puis efface la conversation.
 * À appeler périodiquement (setInterval) ou avant chaque @mention.
 */
export async function checkExpiredConversations(): Promise<void> {
  const now = Date.now();
  const expired: string[] = [];

  for (const [userId, lastActivity] of activeConversations) {
    if (now - lastActivity >= CONVERSATION_TIMEOUT_MS) {
      expired.push(userId);
    }
  }

  for (const userId of expired) {
    await endConversation(userId);
  }
}

/**
 * Termine une conversation : extrait les faits importants via LLM,
 * les sauvegarde en mémoire long-terme, puis efface les messages de conversation.
 */
export async function endConversation(userId: string): Promise<void> {
  activeConversations.delete(userId);

  try {
    // Récupérer l'historique de conversation avant de l'effacer
    const snapshot = await recall(userId, { includeMessages: true, messageLimit: 50 });

    if (snapshot.recentMessages.length === 0) {
      logger.info(`[AIConversation] ${userId} — fin de conversation (aucun message à extraire)`);
      return;
    }

    // Extraire les faits importants via LLM
    const facts = await extractFactsFromConversation(snapshot);

    // Sauvegarder chaque fait en mémoire long-terme
    for (const fact of facts) {
      await remember(userId, fact.key, fact.value, {
        category: fact.category,
        ttlDays: 30,
      });
    }

    // Effacer les messages de conversation
    const cleared = await clearConversation(userId);

    logger.info(
      `[AIConversation] ${userId} — conversation terminée: ${cleared} messages effacés, ${facts.length} faits sauvegardés`,
    );
  } catch (error) {
    logger.error(`[AIConversation] ${userId} — erreur fin de conversation:`, error);
    // En cas d'erreur, on efface quand même la conversation
    await clearConversation(userId).catch(() => {});
  }
}

/**
 * Construit le contexte complet pour une réponse IA :
 *   - Prompt système
 *   - Faits long-terme (mémoire permanente)
 *   - Historique de conversation (si actif)
 *   - Nouveau message
 */
export async function buildConversationContext(
  userId: string,
  newMessage: string,
  username: string,
): Promise<Array<{ role: "system" | "user" | "assistant"; content: string }>> {
  // Récupérer la mémoire long-terme + historique de conversation
  const snapshot = await recall(userId, { includeMessages: true, messageLimit: 20 });

  const messages: Array<{ role: "system" | "user" | "assistant"; content: string }> = [];

  // ── System prompt de base ──
  let systemPrompt = config.aiSystemPrompt;

  // ── Ajouter les faits long-terme ──
  if (snapshot.facts.length > 0) {
    const factsText = snapshot.facts.map((f) => `- ${f.key}: ${f.value}`).join("\n");
    systemPrompt += `\n\n[MÉMOIRE LONG-TERME — ce que tu sais sur ${username}]\n${factsText}`;
  }

  // ── Ajouter le résumé si disponible ──
  if (snapshot.summary) {
    systemPrompt += `\n\n[RÉSUMÉ]\n${snapshot.summary}`;
  }

  messages.push({ role: "system", content: systemPrompt });

  // ── Ajouter l'historique de conversation (si actif) ──
  for (const msg of snapshot.recentMessages) {
    messages.push({
      role: msg.role as "user" | "assistant",
      content: msg.content,
    });
  }

  // ── Ajouter le nouveau message ──
  messages.push({ role: "user", content: `${username}: ${newMessage}` });

  return messages;
}

// ─── Helpers ──────────────────────────────────────────────────────────────────

interface ExtractedFact {
  key: string;
  value: string;
  category: "preference" | "personal" | "game" | "opinion" | "other";
}

/**
 * Utilise le LLM pour extraire les faits importants d'une conversation.
 * Limite à 5 faits maximum pour éviter le spam.
 */
async function extractFactsFromConversation(
  snapshot: UserMemorySnapshot,
): Promise<ExtractedFact[]> {
  const apiKey = process.env.OPENROUTER_API_KEY;
  if (!apiKey) return [];

  try {
    const conversationText = snapshot.recentMessages
      .map((m) => `${m.role}: ${m.content}`)
      .join("\n");

    const systemPrompt = `Tu es un extracteur de faits. Analyse la conversation suivante et extrais les informations importantes et durables sur l'utilisateur (préférences, goûts, informations personnelles, opinions, jeux préférés, etc.).

Réponds UNIQUEMENT en JSON avec ce format :
{"facts": [{"key": "court", "value": "description", "category": "preference|personal|game|opinion|other"}]}

Limite à 5 faits maximum. Ignore les salutations et les questions ponctuelles sans intérêt durable. Si rien d'important, retourne {"facts": []}.`;

    const response = await fetch("https://openrouter.ai/api/v1/chat/completions", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${apiKey}`,
        "Content-Type": "application/json",
        "HTTP-Referer": "https://discord.com",
        "X-Title": "John Helldiver Bot - Fact Extractor",
      },
      body: JSON.stringify({
        model: "meta-llama/llama-3-8b-instruct:free",
        messages: [
          { role: "system", content: systemPrompt },
          { role: "user", content: conversationText.slice(0, 3000) },
        ],
        max_tokens: 300,
        temperature: 0.3,
      }),
      signal: AbortSignal.timeout(10000),
    });

    if (!response.ok) return [];

    const data = (await response.json()) as {
      choices: Array<{ message: { content: string } }>;
    };

    const content = data.choices?.[0]?.message?.content;
    if (!content) return [];

    // Parser le JSON (tolérant : extraire le JSON même s'il y a du texte autour)
    const jsonMatch = content.match(/\{[\s\S]*\}/);
    if (!jsonMatch) return [];

    const parsed = JSON.parse(jsonMatch[0]) as {
      facts?: Array<{ key: string; value: string; category?: string }>;
    };

    if (!parsed.facts) return [];

    return parsed.facts.slice(0, 5).map((f) => ({
      key: f.key.slice(0, 50),
      value: f.value.slice(0, 200),
      category: (f.category as ExtractedFact["category"]) || "other",
    }));
  } catch (error) {
    logger.warn("[AIConversation] Extraction de faits échouée:", error);
    return [];
  }
}
