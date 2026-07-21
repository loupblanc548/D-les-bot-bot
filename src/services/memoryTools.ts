/**
 * memoryTools.ts — Agent tools pour mémoire, conversations et personas
 *
 * Permet à l'IA de gérer ces fonctionnalités via langage naturel
 * quand l'utilisateur @mentionne le bot, sans commande slash.
 */

import logger from "../utils/logger.js";
import prisma from "../prisma.js";
import { searchVectorMemories, storeVectorMemory, pruneVectorMemories } from "./vectorMemory.js";
import { getCustomInstructions, setInstruction, clearInstruction } from "./customInstructions.js";
import {
  startSession,
  endSession,
  getActiveSession,
  loadConversationContext,
} from "./conversationSessions.js";
import type { AgentToolDef } from "./agentTools.js";

export const MEMORY_TOOLS: AgentToolDef[] = [
  {
    type: "function",
    function: {
      name: "memory_search",
      description:
        "Recherche dans la mémoire de l'utilisateur (faits mémorisés, préférences, historique vectoriel). " +
        "Utilise cet outil quand l'utilisateur demande 'qu'est-ce que tu sais sur moi?' ou 'souviens-tu de...'",
      parameters: {
        type: "object",
        properties: {
          query: {
            type: "string",
            description: "La requête de recherche sémantique dans la mémoire",
          },
        },
        required: ["query"],
      },
    },
  },
  {
    type: "function",
    function: {
      name: "memory_list",
      description:
        "Liste tous les faits mémorisés sur l'utilisateur. " +
        "Utilise cet outil quand l'utilisateur demande 'montre-moi ma mémoire' ou 'que sais-tu sur moi?'.",
      parameters: { type: "object", properties: {}, required: [] },
    },
  },
  {
    type: "function",
    function: {
      name: "memory_forget",
      description:
        "Supprime un fait spécifique ou toute la mémoire de l'utilisateur. " +
        "Utilise cet outil quand l'utilisateur dit 'oublie tout' ou 'efface ce souvenir'.",
      parameters: {
        type: "object",
        properties: {
          key: {
            type: "string",
            description: "La clé du fait à supprimer, ou 'all' pour tout effacer",
          },
        },
        required: ["key"],
      },
    },
  },
  {
    type: "function",
    function: {
      name: "persona_set",
      description:
        "Définit une instruction personnalisée pour l'utilisateur (ton, langue, niveau de détail, prompt custom). " +
        "Utilise cet outil quand l'utilisateur dit 'parle-moi en anglais' ou 'sois plus formel' ou 'réponds toujours en détail'.",
      parameters: {
        type: "object",
        properties: {
          param: {
            type: "string",
            description: "Le paramètre: tone, language, detail, ou custom",
            enum: ["tone", "language", "detail", "custom"],
          },
          value: {
            type: "string",
            description: "La valeur du paramètre",
          },
        },
        required: ["param", "value"],
      },
    },
  },
  {
    type: "function",
    function: {
      name: "persona_list",
      description:
        "Affiche les instructions personnalisées de l'utilisateur. " +
        "Utilise cet outil quand l'utilisateur demande 'quelles sont mes préférences?' ou 'montre-moi mon persona'.",
      parameters: { type: "object", properties: {}, required: [] },
    },
  },
  {
    type: "function",
    function: {
      name: "persona_clear",
      description:
        "Supprime une instruction personnalisée. " +
        "Utilise cet outil quand l'utilisateur dit 'annule mon ton personnalisé' ou 'efface mes préférences'.",
      parameters: {
        type: "object",
        properties: {
          param: {
            type: "string",
            description: "Le paramètre à supprimer: tone, language, detail, custom, ou all",
            enum: ["tone", "language", "detail", "custom", "all"],
          },
        },
        required: ["param"],
      },
    },
  },
  {
    type: "function",
    function: {
      name: "conversation_start",
      description:
        "Démarre une nouvelle conversation nommée et persistante. " +
        "Utilise cet outil quand l'utilisateur dit 'commençons une nouvelle conversation' ou 'nouveau sujet'.",
      parameters: {
        type: "object",
        properties: {
          name: {
            type: "string",
            description: "Le nom de la conversation",
          },
        },
        required: ["name"],
      },
    },
  },
  {
    type: "function",
    function: {
      name: "conversation_end",
      description:
        "Termine la conversation active. " +
        "Utilise cet outil quand l'utilisateur dit 'fin de la conversation' ou 'on arrête ce sujet'.",
      parameters: { type: "object", properties: {}, required: [] },
    },
  },
  {
    type: "function",
    function: {
      name: "conversation_status",
      description:
        "Affiche le statut de la conversation active (nom, nombre de messages). " +
        "Utilise cet outil quand l'utilisateur demande 'où en est notre conversation?'.",
      parameters: { type: "object", properties: {}, required: [] },
    },
  },
];

// ─── Tool executor ───────────────────────────────────────────────────────────

export async function executeMemoryTool(
  toolName: string,
  args: Record<string, unknown>,
  ctx: { userId: string },
): Promise<{ success: boolean; data: string } | null> {
  const userId = ctx.userId;

  switch (toolName) {
    case "memory_search": {
      const query = (args.query as string) ?? "";
      const results = await searchVectorMemories(userId, query, 5, 0.2);
      if (results.length === 0) {
        return { success: true, data: "Aucun souvenir trouvé pour cette recherche." };
      }
      const formatted = results
        .map((r, i) => `${i + 1}. [${Math.round(r.score * 100)}%] ${r.content.slice(0, 150)}`)
        .join("\n");
      return { success: true, data: `Souvenirs trouvés:\n${formatted}` };
    }

    case "memory_list": {
      const facts = await prisma.memoryFact.findMany({
        where: { userId },
        orderBy: { weight: "desc" },
        take: 25,
      });
      const embeddingCount = await prisma.memoryEmbedding.count({ where: { userId } });
      if (facts.length === 0 && embeddingCount === 0) {
        return { success: true, data: "Aucune mémoire enregistrée." };
      }
      const factList = facts
        .map((f) => `• ${f.key} (${f.category || "auto"}): ${f.value.slice(0, 100)}`)
        .join("\n");
      return {
        success: true,
        data: `${facts.length} fait(s) + ${embeddingCount} souvenir(s) vectoriel(s):\n${factList}`,
      };
    }

    case "memory_forget": {
      const key = (args.key as string) ?? "";
      if (key.toLowerCase() === "all") {
        const factsDeleted = await prisma.memoryFact.deleteMany({ where: { userId } });
        const embDeleted = await prisma.memoryEmbedding.deleteMany({ where: { userId } });
        return {
          success: true,
          data: `Mémoire effacée: ${factsDeleted.count} fait(s) + ${embDeleted.count} souvenir(s) supprimés.`,
        };
      }
      const deleted = await prisma.memoryFact.deleteMany({ where: { userId, key } });
      return {
        success: deleted.count > 0,
        data:
          deleted.count > 0 ? `Fait "${key}" supprimé.` : `Aucun fait trouvé avec la clé "${key}".`,
      };
    }

    case "persona_set": {
      const param = (args.param as string) ?? "custom";
      const value = (args.value as string) ?? "";
      const keyMap: Record<string, string> = {
        tone: "preferred_tone",
        language: "preferred_language",
        detail: "detail_level",
        custom: "custom_prompt",
      };
      const key = keyMap[param] ?? "custom_prompt";
      await setInstruction(userId, key, value);
      return {
        success: true,
        data: `Instruction personnalisée définie: ${param} = "${value.slice(0, 80)}"`,
      };
    }

    case "persona_list": {
      const instructions = await getCustomInstructions(userId);
      return {
        success: true,
        data: instructions || "Aucune instruction personnalisée définie.",
      };
    }

    case "persona_clear": {
      const param = (args.param as string) ?? "all";
      const keyMap: Record<string, string> = {
        tone: "preferred_tone",
        language: "preferred_language",
        detail: "detail_level",
        custom: "custom_prompt",
        all: "all",
      };
      const key = keyMap[param] ?? "all";
      if (key === "all") {
        await prisma.memoryFact.deleteMany({
          where: { userId, category: "custom_instruction" },
        });
        return { success: true, data: "Toutes les instructions personnalisées ont été effacées." };
      }
      const deleted = await clearInstruction(userId, key);
      return {
        success: deleted,
        data: deleted
          ? `Instruction "${param}" supprimée.`
          : `Aucune instruction trouvée pour "${param}".`,
      };
    }

    case "conversation_start": {
      const name = (args.name as string) ?? "session";
      const session = startSession(userId, name);
      return { success: true, data: `Conversation "${session.sessionName}" démarrée.` };
    }

    case "conversation_end": {
      const session = endSession(userId);
      return {
        success: session !== null,
        data: session
          ? `Conversation "${session.sessionName}" terminée (${session.messageCount} messages).`
          : "Aucune conversation active.",
      };
    }

    case "conversation_status": {
      const session = getActiveSession(userId);
      return {
        success: true,
        data: session
          ? `Conversation active: "${session.sessionName}" — ${session.messageCount} messages depuis ${session.startedAt.toLocaleString()}.`
          : "Aucune conversation active.",
      };
    }

    default:
      return null;
  }
}
