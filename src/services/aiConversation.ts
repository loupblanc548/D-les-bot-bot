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
import prisma from "../prisma.js";
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

    // Extraire les faits importants et liens via LLM
    const extraction = await extractFactsFromConversation(snapshot);

    // Sauvegarder chaque fait en mémoire long-terme
    for (const fact of extraction.facts) {
      await remember(userId, fact.key, fact.value, {
        category: fact.category,
        ttlDays: 30,
      });
    }

    // Sauvegarder les liens du graphe de connaissances
    if (extraction.links.length > 0) {
      await saveLinks(userId, extraction.links);
    }

    // Effacer les messages de conversation
    const cleared = await clearConversation(userId);

    logger.info(
      `[AIConversation] ${userId} — conversation terminée: ${cleared} messages effacés, ${extraction.facts.length} faits sauvegardés, ${extraction.links.length} liens créés`,
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
  // Limite à 15 messages pour éviter de dépasser le context window
  const snapshot = await recall(userId, { includeMessages: true, messageLimit: 15 });

  const messages: Array<{ role: "system" | "user" | "assistant"; content: string }> = [];

  // ── System prompt de base ──
  let systemPrompt = config.aiSystemPrompt;

  // ── Ajouter les faits long-terme ──
  const factKeys: string[] = [];
  if (snapshot.facts.length > 0) {
    const factsText = snapshot.facts.map((f) => `- ${f.key}: ${f.value}`).join("\n");
    systemPrompt += `\n\n[MÉMOIRE LONG-TERME — ce que tu sais sur ${username}]\n${factsText}`;
    for (const f of snapshot.facts) factKeys.push(f.key);
  }

  // ── Ajouter le graphe de connaissances (liens) ──
  if (factKeys.length > 0) {
    const linksText = await getLinksContext(userId, factKeys);
    if (linksText) systemPrompt += linksText;
  }

  // ── Ajouter le résumé si disponible ──
  if (snapshot.summary) {
    systemPrompt += `\n\n[RÉSUMÉ]\n${snapshot.summary}`;
  }

  messages.push({ role: "system", content: systemPrompt });

  // ── Ajouter l'historique de conversation (si actif) ──
  // Limite la taille totale de l'historique à 6000 caractères pour éviter le dépassement de context window
  const MAX_HISTORY_CHARS = 6000;
  let historyChars = 0;
  const trimmedMessages = [];
  for (let i = snapshot.recentMessages.length - 1; i >= 0; i--) {
    const msg = snapshot.recentMessages[i];
    const msgChars = msg.content.length;
    if (historyChars + msgChars > MAX_HISTORY_CHARS) break;
    trimmedMessages.unshift(msg);
    historyChars += msgChars;
  }
  for (const msg of trimmedMessages) {
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

interface ExtractedLink {
  source: string;
  target: string;
  relation: string;
}

interface ExtractionResult {
  facts: ExtractedFact[];
  links: ExtractedLink[];
}

/**
 * Utilise le LLM pour extraire les faits importants et les liens entre concepts d'une conversation.
 * Limite à 5 faits et 8 liens maximum pour éviter le spam.
 */
async function extractFactsFromConversation(
  snapshot: UserMemorySnapshot,
): Promise<ExtractionResult> {
  const apiKey = process.env.OPENROUTER_API_KEY;
  if (!apiKey) return { facts: [], links: [] };

  try {
    const conversationText = snapshot.recentMessages
      .map((m) => `${m.role}: ${m.content}`)
      .join("\n");

    const systemPrompt = `Tu es un extracteur de connaissances type graphe (style Obsidian/second brain). Analyse la conversation et extrais :
1. Les faits importants et durables sur l'utilisateur
2. Les LIENS entre ces faits (ex: "jeu_prefere" --"joue_sur"--> "plateforme")

Réponds UNIQUEMENT en JSON :
{"facts": [{"key": "court", "value": "description", "category": "preference|personal|game|opinion|other"}], "links": [{"source": "key_fact", "target": "key_fact", "relation": "type_de_relation"}]}

Règles :
- Maximum 5 faits et 8 liens
- Les liens ne peuvent connecter que des faits que tu as extraits
- Relations possibles : joue_sur, aime, deteste, connait, prefere, possede, joue_a, parle_de, interesse_a
- Ignore les salutations. Si rien d'important, retourne {"facts": [], "links": []}.`;

    const response = await fetch("https://openrouter.ai/api/v1/chat/completions", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${apiKey}`,
        "Content-Type": "application/json",
        "HTTP-Referer": "https://discord.com",
        "X-Title": "John Helldiver Bot - Fact Extractor",
      },
      body: JSON.stringify({
        model: "meta-llama/llama-3.2-3b-instruct:free",
        messages: [
          { role: "system", content: systemPrompt },
          { role: "user", content: conversationText.slice(0, 3000) },
        ],
        max_tokens: 500,
        temperature: 0.3,
      }),
      signal: AbortSignal.timeout(10000),
    });

    if (!response.ok) return { facts: [], links: [] };

    const data = (await response.json()) as {
      choices: Array<{ message: { content: string } }>;
    };

    const content = data.choices?.[0]?.message?.content;
    if (!content) return { facts: [], links: [] };

    // Parser le JSON (tolérant : extraire le JSON même s'il y a du texte autour)
    const jsonMatch = content.match(/\{[\s\S]*\}/);
    if (!jsonMatch) return { facts: [], links: [] };

    const parsed = JSON.parse(jsonMatch[0]) as {
      facts?: Array<{ key: string; value: string; category?: string }>;
      links?: Array<{ source: string; target: string; relation: string }>;
    };

    if (!parsed.facts) return { facts: [], links: [] };

    const facts = parsed.facts.slice(0, 5).map((f) => ({
      key: f.key.slice(0, 50),
      value: f.value.slice(0, 200),
      category: (f.category as ExtractedFact["category"]) || "other",
    }));

    const validKeys = new Set(facts.map((f) => f.key));
    const links = (parsed.links || [])
      .filter((l) => validKeys.has(l.source) && validKeys.has(l.target))
      .slice(0, 8)
      .map((l) => ({
        source: l.source.slice(0, 50),
        target: l.target.slice(0, 50),
        relation: l.relation.slice(0, 30),
      }));

    return { facts, links };
  } catch (error) {
    logger.warn("[AIConversation] Extraction de faits échouée:", error);
    return { facts: [], links: [] };
  }
}

// ─── Graphe de connaissances (liens bidirectionnels type Obsidian) ─────────────

/**
 * Sauvegarde les liens extraits dans la base. Si un lien existe déjà, augmente sa strength.
 */
async function saveLinks(userId: string, links: ExtractedLink[]): Promise<void> {
  for (const link of links) {
    try {
      await prisma.memoryLink.upsert({
        where: {
          userId_sourceKey_targetKey_relation: {
            userId,
            sourceKey: link.source,
            targetKey: link.target,
            relation: link.relation,
          },
        },
        update: { strength: { increment: 0.5 } },
        create: {
          userId,
          sourceKey: link.source,
          targetKey: link.target,
          relation: link.relation,
          strength: 1.0,
        },
      });
    } catch {
      // Ignore les erreurs de lien individuels
    }
  }
}

/**
 * Récupère les liens associés aux faits d'un utilisateur, formatés pour le contexte IA.
 * Retourne une chaîne type "conceptA --relation--> conceptB".
 */
async function getLinksContext(userId: string, factKeys: string[]): Promise<string> {
  if (factKeys.length === 0) return "";

  try {
    const links = await prisma.memoryLink.findMany({
      where: {
        userId,
        OR: [{ sourceKey: { in: factKeys } }, { targetKey: { in: factKeys } }],
      },
      orderBy: { strength: "desc" },
      take: 15,
    });

    if (links.length === 0) return "";

    const lines = links.map(
      (l) => `  ${l.sourceKey} --${l.relation}--> ${l.targetKey} (×${l.strength.toFixed(1)})`,
    );
    return `\n[GRAPHE DE CONNAISSANCES]\n${lines.join("\n")}`;
  } catch {
    return "";
  }
}
