/**
 * agentTools.ts — Outils disponibles pour l'agent IA autonome
 *
 * Définit les functions que l'IA peut décider d'appeler via function calling.
 * Chaque tool a :
 *  - Une définition JSON Schema (envoyée à l'API LLM)
 *  - Un handler TypeScript qui exécute l'action sur Discord
 *
 * L'agent reçoit la liste des tools, réfléchit, et demande l'exécution
 * de ceux qu'il juge nécessaires.
 */

import { Client, Message, TextChannel, ChannelType } from "discord.js";
import prisma from "../prisma.js";
import logger from "../utils/logger.js";
import { stripAllHtml } from "../utils/sanitizeHtml.js";
import { safeFetch } from "../utils/ssrfGuard.js";
import { EXTENDED_TOOLS, executeExtendedTool } from "./agentToolsExtended.js";
import { AUTONOMOUS_TOOLS, executeAutonomousTool } from "./agentToolsAutonomous.js";
import { KALI_TOOLS, executeKaliTool } from "./agentToolsKali.js";
import { braveWebSearch, isBraveSearchAvailable } from "./braveSearch.js";
import { rerankDocuments, isCohereAvailable } from "./cohere.js";
import { transcribeAudio, isAssemblyAiAvailable } from "./assemblyAi.js";
import { analyzeImageWithGemini, isGeminiAvailable } from "./gemini.js";
import { executeCode, formatSandboxResult, isE2BConfigured } from "./codeSandbox.js";
import { FREE_TOOLS, executeFreeTool } from "./agentToolsFree.js";
import { EXTERNAL_TOOLS, executeExternalTool } from "./agentToolsExternal.js";
import { EXTRA_TOOLS, executeExtraTool } from "./agentToolsExtra.js";
import { ORPHAN_TOOLS, executeOrphanTool } from "./agentToolsOrphan.js";
import { ingestUrl, searchKnowledge } from "./webIngestion.js";
import { getOpenAIClient } from "./ai.js";
import { config } from "../config.js";
import { classifyNsfw } from "./nsfwClassifier.js";
import { startVoiceTranslation, stopVoiceTranslation } from "./voiceTranslation.js";
import { setDigestConfig } from "./communityDigest.js";
import { generateMultiplePasswords } from "./passwordGenerator.js";
import { createTempEmail, checkTempEmailInbox, PRIVACY_WARNING } from "./tempEmail.js";
import { generateImage } from "./freeApis.js";
import { removeBackground } from "./removeBg.js";
import { MEMORY_TOOLS, executeMemoryTool } from "./memoryTools.js";
import { RETAILER_TOOL_DEFS, handleRetailerTool } from "./agentToolsRetailers.js";
import { searchDocumentation, isContext7Available } from "./context7.js";
import {
  getGodlyInspiration,
  getAceternityComponents,
  getAceternityComponentDoc,
  listImpeccableCommands,
  auditDesignForSlop,
} from "./designTools.js";

// ─── Cache web (évite les requêtes répétées) ────────────────────────────────
const webCache = new Map<string, { data: string; ts: number }>();
const WEB_CACHE_TTL_MS = 5 * 60 * 1000; // 5 min

// ─── Types ───────────────────────────────────────────────────────────────────

export interface AgentToolDef {
  type: "function";
  function: {
    name: string;
    description: string;
    parameters: {
      type: "object";
      properties: Record<string, unknown>;
      required: string[];
    };
  };
}

export interface ToolCallResult {
  success: boolean;
  data: string;
}

export interface ToolContext {
  client: Client;
  message: Message;
  userId: string;
  guildId: string;
  channelId: string;
}

// ─── Définitions des outils (JSON Schema pour l'API LLM) ─────────────────────

export const AGENT_TOOLS: AgentToolDef[] = [
  {
    type: "function",
    function: {
      name: "searchDocs",
      description:
        "Recherche la documentation à jour d'une librairie/framework/SDK via Context7. Utilise cet outil quand l'utilisateur demande de la doc, des exemples de code, ou comment utiliser une librairie spécifique (React, Next.js, Prisma, Express, etc.).",
      parameters: {
        type: "object",
        properties: {
          library: {
            type: "string",
            description:
              "Le nom de la librairie (ex: 'React', 'Next.js', 'Prisma', 'Tailwind CSS')",
          },
          question: {
            type: "string",
            description:
              "La question spécifique ou le sujet recherché dans la doc (ex: 'how to use useEffect cleanup', 'setup authentication with JWT')",
          },
        },
        required: ["library", "question"],
      },
    },
  },
  {
    type: "function",
    function: {
      name: "getDesignInspiration",
      description:
        "Récupère les derniers sites web en vedette sur Godly (godly.website) pour inspiration design. Utile quand l'utilisateur cherche des idées de design web, des exemples de beaux sites, ou veut voir les tendances design actuelles.",
      parameters: {
        type: "object",
        properties: {
          category: {
            type: "string",
            description:
              "Catégorie optionnelle (ex: 'portfolio', 'ecommerce', 'animation', 'agency', 'minimal')",
          },
        },
        required: [],
      },
    },
  },
  {
    type: "function",
    function: {
      name: "getUiComponents",
      description:
        "Liste ou recherche des composants React/Tailwind prêts à l'emploi depuis Aceternity UI (200+ components: hero, bento grid, cards, navbar, pricing, etc.). Donne la commande d'installation npx et le lien vers la doc.",
      parameters: {
        type: "object",
        properties: {
          filter: {
            type: "string",
            description: "Terme de recherche optionnel (ex: 'hero', 'card', 'navbar', 'pricing')",
          },
        },
        required: [],
      },
    },
  },
  {
    type: "function",
    function: {
      name: "getComponentDoc",
      description:
        "Récupère la documentation et un exemple de code pour un composant Aceternity UI spécifique.",
      parameters: {
        type: "object",
        properties: {
          component: {
            type: "string",
            description: "Nom du composant (ex: 'bento-grid', 'hero-sections', 'cards')",
          },
        },
        required: ["component"],
      },
    },
  },
  {
    type: "function",
    function: {
      name: "listDesignCommands",
      description:
        "Liste les 23 commandes design Impeccable disponibles pour auditer et améliorer du design frontend (polish, audit, critique, animate, typeset, layout, etc.).",
      parameters: {
        type: "object",
        properties: {},
        required: [],
      },
    },
  },
  {
    type: "function",
    function: {
      name: "auditDesign",
      description:
        "Audite du HTML/CSS pour détecter les anti-patterns design 'AI slop' (purple gradients, bounce easing, over-rounding, etc.) basé sur les règles Impeccable. Retourne une liste de problèmes trouvés.",
      parameters: {
        type: "object",
        properties: {
          html: {
            type: "string",
            description: "Le code HTML/CSS à auditer",
          },
        },
        required: ["html"],
      },
    },
  },
  {
    type: "function",
    function: {
      name: "deleteMessages",
      description:
        "Supprime un nombre précis de messages récents dans le salon actuel. Utilisé en cas de spam ou flood.",
      parameters: {
        type: "object",
        properties: {
          amount: {
            type: "number",
            description: "Le nombre de messages à supprimer (max 100).",
          },
        },
        required: ["amount"],
      },
    },
  },
  {
    type: "function",
    function: {
      name: "getBotStatus",
      description:
        "Récupère le statut du bot : mémoire, latence, nombre de serveurs, uptime. Aucun paramètre.",
      parameters: {
        type: "object",
        properties: {},
        required: [],
      },
    },
  },
  {
    type: "function",
    function: {
      name: "timeoutUser",
      description:
        "Met un utilisateur en timeout (mute temporaire) sur ce serveur. Nécessite l'ID utilisateur et une durée.",
      parameters: {
        type: "object",
        properties: {
          userId: { type: "string", description: "L'ID Discord de l'utilisateur à timeout" },
          durationMinutes: {
            type: "number",
            description: "Durée du timeout en minutes (max 1440 = 24h)",
          },
          reason: { type: "string", description: "Raison du timeout" },
        },
        required: ["userId", "durationMinutes"],
      },
    },
  },
  {
    type: "function",
    function: {
      name: "warnUser",
      description:
        "Enregistre un avertissement officiel pour un utilisateur dans la base de données.",
      parameters: {
        type: "object",
        properties: {
          userId: { type: "string", description: "L'ID Discord de l'utilisateur" },
          reason: { type: "string", description: "Raison de l'avertissement" },
        },
        required: ["userId", "reason"],
      },
    },
  },
  {
    type: "function",
    function: {
      name: "getUserInfo",
      description:
        "Récupère les informations sur un utilisateur : sanctions, score de risque, historique de modération.",
      parameters: {
        type: "object",
        properties: {
          userId: { type: "string", description: "L'ID Discord de l'utilisateur" },
        },
        required: ["userId"],
      },
    },
  },
  {
    type: "function",
    function: {
      name: "searchUserMemory",
      description:
        "Recherche dans la mémoire long-terme de l'agent : faits stockés sur un utilisateur, préférences, historique.",
      parameters: {
        type: "object",
        properties: {
          userId: { type: "string", description: "L'ID Discord de l'utilisateur" },
          query: {
            type: "string",
            description: "Terme de recherche optionnel pour filtrer les faits",
          },
        },
        required: ["userId"],
      },
    },
  },
  {
    type: "function",
    function: {
      name: "saveMemoryFact",
      description:
        "Sauvegarde un fait important en mémoire long-terme sur un utilisateur. Ex: préférences, avertissements notables, contexte.",
      parameters: {
        type: "object",
        properties: {
          userId: { type: "string", description: "L'ID Discord de l'utilisateur" },
          key: { type: "string", description: "Clé du fait (ex: 'prefere_jeu', 'avertissement')" },
          value: { type: "string", description: "Valeur du fait" },
          category: {
            type: "string",
            description: "Catégorie optionnelle (ex: 'preference', 'moderation', 'info')",
          },
        },
        required: ["userId", "key", "value"],
      },
    },
  },
  {
    type: "function",
    function: {
      name: "getChannelInfo",
      description:
        "Récupère les informations sur le salon actuel : nom, nombre de messages récents, topic.",
      parameters: {
        type: "object",
        properties: {},
        required: [],
      },
    },
  },
  {
    type: "function",
    function: {
      name: "pinMessage",
      description: "Épingle le message actuel ou un message par ID dans ce salon.",
      parameters: {
        type: "object",
        properties: {
          messageId: {
            type: "string",
            description: "ID du message à épingler (ou 'last' pour le dernier message)",
          },
        },
        required: ["messageId"],
      },
    },
  },
  {
    type: "function",
    function: {
      name: "searchWeb",
      description:
        "Recherche sur Internet via DuckDuckGo. Retourne des titres, URLs et extraits. Utilise cet outil quand tu as besoin d'informations actuelles, d'actualités, ou de connaissances que tu n'as pas.",
      parameters: {
        type: "object",
        properties: {
          query: {
            type: "string",
            description: "La requête de recherche",
          },
          lang: {
            type: "string",
            description: "Code langue (fr, en, es, de, it). Défaut: fr",
          },
        },
        required: ["query"],
      },
    },
  },
  {
    type: "function",
    function: {
      name: "readUrl",
      description:
        "Lit le contenu d'une page web (URL). Récupère le texte principal, utile pour approfondir un résultat de recherche. Retourne jusqu'à 3000 caractères de contenu.",
      parameters: {
        type: "object",
        properties: {
          url: { type: "string", description: "L'URL complète à lire (doit commencer par http)" },
        },
        required: ["url"],
      },
    },
  },
  {
    type: "function",
    function: {
      name: "fetchAndSummarize",
      description:
        "Fetch une URL, extrait le contenu principal (sans boilerplate HTML), le résume avec l'IA, et le stocke en base de connaissances pour réutilisation. Plus puissant que readUrl car il garde le contenu en mémoire.",
      parameters: {
        type: "object",
        properties: {
          url: { type: "string", description: "L'URL à ingérer (doit commencer par http)" },
          customPrompt: {
            type: "string",
            description:
              "Prompt personnalisé pour le résumé (optionnel). Ex: 'Extrait les concepts techniques clés'",
          },
        },
        required: ["url"],
      },
    },
  },
  {
    type: "function",
    function: {
      name: "ingestDocumentation",
      description:
        "Ingère plusieurs URLs de documentation en batch. Fetch, extrait, résume et stocke chaque page. Utile pour apprendre une techno entière (ex: docs discord.js, docs prisma).",
      parameters: {
        type: "object",
        properties: {
          urls: {
            type: "array",
            items: { type: "string" },
            description: "Liste d'URLs à ingérer",
          },
          customPrompt: {
            type: "string",
            description: "Prompt personnalisé pour les résumés (optionnel)",
          },
        },
        required: ["urls"],
      },
    },
  },
  {
    type: "function",
    function: {
      name: "searchKnowledge",
      description:
        "Recherche dans la base de connaissances du bot (contenu précédemment ingéré via fetchAndSummarize ou ingestDocumentation). Retourne les résumés pertinents. Utilise cet outil avant de chercher sur le web si la question a déjà été traitée.",
      parameters: {
        type: "object",
        properties: {
          query: { type: "string", description: "La requête de recherche" },
          limit: {
            type: "number",
            description: "Nombre max de résultats (défaut 5)",
          },
        },
        required: ["query"],
      },
    },
  },
  {
    type: "function",
    function: {
      name: "searchYouTube",
      description:
        "Recherche des vidéos YouTube. Retourne titre, chaîne, URL et miniature. Utile pour trouver des tutoriels, gameplay, ou contenu vidéo.",
      parameters: {
        type: "object",
        properties: {
          query: { type: "string", description: "La requête de recherche" },
          maxResults: {
            type: "number",
            description: "Nombre max de résultats (défaut 5, max 10)",
          },
        },
        required: ["query"],
      },
    },
  },
  {
    type: "function",
    function: {
      name: "getServerStats",
      description:
        "Récupère les statistiques du serveur Discord : nombre de membres, salons, rôles, boost level, date de création.",
      parameters: {
        type: "object",
        properties: {},
        required: [],
      },
    },
  },
  {
    type: "function",
    function: {
      name: "getWeather",
      description:
        "Récupère la météo actuelle pour une ville. Température, vent, humidité, conditions. Gratuit via Open-Meteo (pas de clé API).",
      parameters: {
        type: "object",
        properties: {
          city: { type: "string", description: "Nom de la ville (ex: Paris, Tokyo, New York)" },
        },
        required: ["city"],
      },
    },
  },
  {
    type: "function",
    function: {
      name: "getCryptoPrice",
      description:
        "Récupère le prix actuel d'une cryptomonnaie en EUR et USD. Gratuit via CoinGecko (pas de clé API). Ex: bitcoin, ethereum, solana.",
      parameters: {
        type: "object",
        properties: {
          coin: {
            type: "string",
            description: "ID de la crypto (ex: bitcoin, ethereum, solana, dogecoin)",
          },
        },
        required: ["coin"],
      },
    },
  },
  {
    type: "function",
    function: {
      name: "getWikipediaSummary",
      description:
        "Récupère un résumé encyclopédique sur un sujet depuis Wikipedia. Gratuit, pas de clé API. Préfère à searchWeb pour les sujets encyclopédiques.",
      parameters: {
        type: "object",
        properties: {
          query: { type: "string", description: "Le sujet à rechercher sur Wikipedia" },
          lang: { type: "string", description: "Code langue (fr, en). Défaut: fr" },
        },
        required: ["query"],
      },
    },
  },
  {
    type: "function",
    function: {
      name: "getGitHubRepo",
      description:
        "Récupère les infos d'un dépôt GitHub : étoiles, forks, langage, description, dernière mise à jour. Gratuit (pas de clé API).",
      parameters: {
        type: "object",
        properties: {
          owner: {
            type: "string",
            description: "Nom d'utilisateur ou organisation GitHub (ex: facebook)",
          },
          repo: { type: "string", description: "Nom du dépôt (ex: react)" },
        },
        required: ["owner", "repo"],
      },
    },
  },
  {
    type: "function",
    function: {
      name: "translateText",
      description:
        "Traduit un texte d'une langue vers une autre. Gratuit via MyMemory API (pas de clé). Utile pour comprendre des messages étrangers.",
      parameters: {
        type: "object",
        properties: {
          text: { type: "string", description: "Le texte à traduire" },
          from: {
            type: "string",
            description: "Langue source (ex: en, es, de). 'auto' pour détection.",
          },
          to: { type: "string", description: "Langue cible (ex: fr, en)" },
        },
        required: ["text", "to"],
      },
    },
  },
  {
    type: "function",
    function: {
      name: "getTechNews",
      description:
        "Récupère les top stories de Hacker News (actualités tech/science). Gratuit, pas de clé API. Retourne titres et liens.",
      parameters: {
        type: "object",
        properties: {
          maxResults: {
            type: "number",
            description: "Nombre max de stories (défaut 5, max 10)",
          },
        },
        required: [],
      },
    },
  },
  {
    type: "function",
    function: {
      name: "transcribeAudio",
      description:
        "Transcrit un fichier audio (message vocal Discord, MP3, WAV, etc.) en texte via AssemblyAI. Utilise cet outil quand un utilisateur envoie un message vocal ou un fichier audio.",
      parameters: {
        type: "object",
        properties: {
          audioUrl: {
            type: "string",
            description: "URL du fichier audio à transcrire",
          },
        },
        required: ["audioUrl"],
      },
    },
  },
  {
    type: "function",
    function: {
      name: "analyzeImageGemini",
      description:
        "Analyse une image avec Google Gemini Vision (multimodal). Plus précis que analyze_image pour les détails complexes, textes dans l'image, schémas, etc. Retourne une description détaillée en français.",
      parameters: {
        type: "object",
        properties: {
          imageUrl: {
            type: "string",
            description: "URL de l'image à analyser",
          },
          question: {
            type: "string",
            description:
              "Question ou instruction sur l'image (défaut: 'Décris cette image en détail')",
          },
        },
        required: ["imageUrl"],
      },
    },
  },
  {
    type: "function",
    function: {
      name: "execute_code",
      description:
        "Exécute du code dans une sandbox sécurisée (Python, JavaScript, ou shell). Utilise cet outil quand l'utilisateur demande d'écrire et exécuter un script, faire un calcul complexe, analyser des données, générer un fichier, ou prototyper quelque chose. Le code s'exécute avec un timeout de 15s. E2B cloud sandbox si configuré, sinon local.",
      parameters: {
        type: "object",
        properties: {
          code: {
            type: "string",
            description: "Le code à exécuter (code complet, pas un snippet)",
          },
          language: {
            type: "string",
            enum: ["python", "javascript", "shell"],
            description: "Langage du code: python, javascript, ou shell (défaut: python)",
          },
        },
        required: ["code"],
      },
    },
  },
  {
    type: "function",
    function: {
      name: "classify_nsfw",
      description:
        "Classifie une image pour détecter du contenu NSFW (nudité, suggestif). Utilise Sightengine ou Gemini Vision. Retourne les scores raw/partial/suggestive et une action recommandée (block/warn/allow).",
      parameters: {
        type: "object",
        properties: {
          imageUrl: { type: "string", description: "URL de l'image à analyser" },
          threshold: { type: "number", description: "Seuil de détection 0-1 (défaut 0.5)" },
          strict: { type: "boolean", description: "Mode strict (bloque aussi le suggestif)" },
        },
        required: ["imageUrl"],
      },
    },
  },
  {
    type: "function",
    function: {
      name: "voice_translation",
      description:
        "Démarre une session de traduction vocale en temps réel. L'utilisateur parle dans sa langue, le bot traduit et répond dans la langue cible. Nécessite opt-in vocal préalable (/voice opt-in).",
      parameters: {
        type: "object",
        properties: {
          targetLang: {
            type: "string",
            enum: ["FR", "EN", "DE", "ES", "IT", "PT", "JA", "KO", "ZH", "RU"],
            description: "Langue cible de la traduction",
          },
          voiceChannelId: { type: "string", description: "ID du salon vocal" },
          textChannelId: {
            type: "string",
            description: "ID du salon textuel pour afficher les transcriptions",
          },
        },
        required: ["targetLang", "voiceChannelId"],
      },
    },
  },
  {
    type: "function",
    function: {
      name: "stop_voice_translation",
      description: "Arrête la session de traduction vocale en cours pour l'utilisateur.",
      parameters: {
        type: "object",
        properties: {},
        required: [],
      },
    },
  },
  {
    type: "function",
    function: {
      name: "enable_digest",
      description:
        "Active le digest périodique communautaire pour ce serveur. Envoie un résumé de l'activité (membres, commandes, modération, événements) à intervalle régulier.",
      parameters: {
        type: "object",
        properties: {
          frequency: {
            type: "string",
            enum: ["daily", "weekly"],
            description: "Fréquence du digest (daily = quotidien, weekly = hebdomadaire)",
          },
          channelId: { type: "string", description: "ID du salon où envoyer le digest" },
          sendHour: { type: "number", description: "Heure d'envoi 0-23 (défaut 9)" },
        },
        required: ["frequency", "channelId"],
      },
    },
  },
  {
    type: "function",
    function: {
      name: "disable_digest",
      description: "Désactive le digest périodique communautaire pour ce serveur.",
      parameters: {
        type: "object",
        properties: {},
        required: [],
      },
    },
  },
  {
    type: "function",
    function: {
      name: "generate_password",
      description:
        "Génère un mot de passe sécurisé localement (crypto.randomInt). Aucun appel réseau. Retourne le mot de passe, l'entropie en bits et un label de force. Peut générer plusieurs mots de passe à la fois.",
      parameters: {
        type: "object",
        properties: {
          length: { type: "number", description: "Longueur du mot de passe (4-128, défaut 16)" },
          uppercase: { type: "boolean", description: "Inclure majuscules (défaut true)" },
          lowercase: { type: "boolean", description: "Inclure minuscules (défaut true)" },
          numbers: { type: "boolean", description: "Inclure chiffres (défaut true)" },
          symbols: { type: "boolean", description: "Inclure symboles (défaut true)" },
          excludeAmbiguous: {
            type: "boolean",
            description: "Exclure caractères ambigus 0/O/1/l/I (défaut false)",
          },
          count: {
            type: "number",
            description: "Nombre de mots de passe à générer (1-10, défaut 1)",
          },
        },
        required: [],
      },
    },
  },
  {
    type: "function",
    function: {
      name: "create_temp_email",
      description:
        "Crée une adresse email temporaire/jetable via Mail.tm ou 1secmail (fallback). Aucune clé API requise. Retourne l'adresse et un identifiant pour relire la boîte.",
      parameters: {
        type: "object",
        properties: {},
        required: [],
      },
    },
  },
  {
    type: "function",
    function: {
      name: "check_temp_email",
      description:
        "Vérifie la boîte de réception d'un email temporaire créé précédemment. Retourne les messages reçus. ⚠️ Le contenu n'est pas privé — toute personne connaissant l'adresse peut le lire.",
      parameters: {
        type: "object",
        properties: {
          address: { type: "string", description: "L'adresse email temporaire" },
          providerId: {
            type: "string",
            description: "L'identifiant fournisseur retourné par create_temp_email",
          },
          provider: { type: "string", description: "Le fournisseur (mail.tm ou 1secmail)" },
        },
        required: ["address", "providerId", "provider"],
      },
    },
  },
  {
    type: "function",
    function: {
      name: "extract_text_from_image",
      description:
        "Extrait tout le texte visible dans une image (OCR) via Gemini Vision. Utile pour screenshots, documents scannés, memes avec texte, reçus, etc.",
      parameters: {
        type: "object",
        properties: {
          imageUrl: { type: "string", description: "URL de l'image à analyser" },
        },
        required: ["imageUrl"],
      },
    },
  },
  {
    type: "function",
    function: {
      name: "compose_image",
      description:
        "Génère une image via Pollinations (gratuit) puis optionnellement supprime le fond via Remove.bg. Utile pour créer des images détourées à la demande.",
      parameters: {
        type: "object",
        properties: {
          prompt: {
            type: "string",
            description:
              "Description de l'image à générer (en anglais pour de meilleurs résultats)",
          },
          removeBackground: {
            type: "boolean",
            description: "Si true, supprime le fond après génération (nécessite Remove.bg API key)",
          },
          width: { type: "number", description: "Largeur en pixels (défaut 1024)" },
          height: { type: "number", description: "Hauteur en pixels (défaut 1024)" },
        },
        required: ["prompt"],
      },
    },
  },
  // ─── Minecraft LLM Agent tools ───
  {
    type: "function",
    function: {
      name: "mcAgentConnect",
      description:
        "Connecte le bot Minecraft LLM (Mineflayer sur Colab) à un serveur ou monde Minecraft. " +
        "L'utilisateur peut dire (variantes FR): 'rejoins moi', 'rejoins mon monde', 'rejoins ce serveur', 'rejoins ça', " +
        "'connecte-toi', 'connecte toi', 'connexion', 'viens sur mon serveur', 'viens jouer', 'viens avec moi', " +
        "'viens me voir', 'viens sur mc', 'rejoins l'ip', 'rejoins le serveur', 'go sur le serveur', " +
        "'go sur mon monde', 'go mc', 'rejoins minecraft', 'connecte le bot', 'met le bot sur', " +
        "'met le bot dans mon monde', 'envoie le bot', 'le bot peut rejoindre', 'le bot peut venir', " +
        "'tu peux rejoindre', 'tu peux venir', 'viens', 'rejoins', 'connecte', 'go serveur', 'go mc', " +
        "'rejoins mon serveur minecraft', 'rejoins mon monde solo', 'viens dans mon monde solo', " +
        "'ouvre minecraft et rejoins', 'le bot rejoint', 'fait rejoindre le bot'. " +
        "Variantes EN: 'join me', 'join my world', 'join my server', 'connect to', 'come to my server', " +
        "'come play', 'get on minecraft', 'join this ip', 'connect the bot', 'hop on'. " +
        "Pour un monde solo ouvert en LAN, l'utilisateur doit fournir son IP publique et le port LAN affiché par Minecraft. " +
        "Si l'utilisateur ne donne pas l'IP, demande-la. Le port par défaut est 25565 pour les serveurs, mais variable pour le LAN. " +
        "Si l'utilisateur dit 'rejoins moi' sans IP, demande: 'Quelle est ton IP:port ? Ouvre ton monde en LAN (Échap → Ouvrir en LAN) et donne-moi l'IP:port affiché'.",
      parameters: {
        type: "object",
        properties: {
          server: {
            type: "string",
            description:
              "Adresse IP:port du serveur Minecraft (ex: '123.45.67.89:25565' ou 'play.mcraft.fr'). Pour un monde LAN, c'est l'IP publique de l'utilisateur + le port LAN affiché dans Minecraft.",
          },
          username: {
            type: "string",
            description: "Pseudo du bot Minecraft (défaut: LLM_Bot)",
          },
        },
        required: ["server"],
      },
    },
  },
  {
    type: "function",
    function: {
      name: "mcAgentGoal",
      description:
        "Envoie un objectif en langage naturel au bot Minecraft LLM. " +
        "Le bot va observer le monde, décider des actions et les exécuter automatiquement. " +
        "Variantes FR: 'construis une maison', 'construis un abri', 'construis une tour', 'construis un château', " +
        "'construis ça', 'construis-moi', 'bâtis', 'fais une maison', 'fais une ferme', 'fais un pont', " +
        "'mine 10 fer', 'mine du charbon', 'mine des diamants', 'va miner', 'mine ça', 'creuse', " +
        "'cherche des diamants', 'cherche du fer', 'cherche de l'or', 'trouve des diamants', " +
        "'va chercher du bois', 'collecte du bois', 'collecte de la pierre', 'collecte des ressources', " +
        "'chasse des zombies', 'chasse des animaux', 'chasse', 'tue les monstres', 'tue les zombies', " +
        "'défends-moi', 'défens-toi', 'protège-moi', 'protege la zone', " +
        "'explore', 'explore et trouve des diamants', 'explore la zone', 'va voir autour', " +
        "'fais une ferme', 'fais de l'agriculture', 'plante des cultures', 'fais pousser du blé', " +
        "'va pêcher', 'pêche', 'fais de la pêche', " +
        "'craft une épée', 'craft des planches', 'craft un four', 'fais un craft', " +
        "'fais cuire', 'cuis', 'fais fondre le minerai', 'smelt le fer', " +
        "'fais un pont', 'fais un tunnel', 'creuse un tunnel', " +
        "'soigne-toi', 'mange', 'dors', 'va dormir', " +
        "'apprivoise un cheval', 'apprivoise un loup', 'domestique', " +
        "'fais reproduire les vaches', 'fais des bébés animaux', 'breed', " +
        "'va au village', 'va à la forteresse', 'va au nether', " +
        "'range ton inventaire', 'équipe-toi', 'mets ton armure', " +
        "'fais ce que tu veux', 'amuse-toi', 'fais ce que tu peux', " +
        "'aide-moi à survivre', 'survis', 'fais en sorte de rester en vie', " +
        "'va là-bas', 'va vers', 'va au coordonnées', 'va à la position'. " +
        "Variantes EN: 'build a house', 'mine some iron', 'go mining', 'find diamonds', 'hunt zombies', " +
        "'defend me', 'explore', 'make a farm', 'craft a sword', 'survive', 'go there'. " +
        "Toute phrase exprimant une intention d'action dans Minecraft doit utiliser cet outil.",
      parameters: {
        type: "object",
        properties: {
          goal: {
            type: "string",
            description:
              "Objectif en langage naturel pour le bot Minecraft (ex: 'Build a 5x5 house with oak planks', 'Mine 10 iron ore and smelt into ingots', 'Find and mine diamonds', 'Hunt animals for food', 'Defend against zombies', 'Explore and find a village')",
          },
          maxActions: {
            type: "number",
            description: "Nombre maximum d'actions (défaut: 50, max: 200)",
          },
        },
        required: ["goal"],
      },
    },
  },
  {
    type: "function",
    function: {
      name: "mcAgentStatus",
      description:
        "Récupère le statut du bot Minecraft LLM: connecté, position, santé, faim, modèle LLM, actions en cours. " +
        "Variantes FR: 'comment va le bot', 'où il est', 'il fait quoi', 'il est où', 'où est le bot', " +
        "'quel est le statut', 'statut du bot', 'le bot est connecté', 'le bot est en ligne', " +
        "'il a combien de vie', 'combien de vie il a', 'il a combien de coeurs', " +
        "'il a faim', 'combien de faim', 'est-ce qu'il est en train de faire quelque chose', " +
        "'il travaille', 'il est occupé', 'il est libre', 'il fait quoi maintenant', " +
        "'le bot est là', 'le bot est vivant', 'le bot est mort', " +
        "'donne moi le statut', 'info du bot', 'infos bot', 'état du bot', " +
        "'le bot ça va', 'bot status', 'tu fais quoi', 'tu es où'. " +
        "Variantes EN: 'bot status', 'how is the bot', 'where is the bot', 'what is he doing', " +
        "'is he online', 'is he alive', 'his health', 'his hunger', 'is he busy'.",
      parameters: {
        type: "object",
        properties: {},
        required: [],
      },
    },
  },
  {
    type: "function",
    function: {
      name: "mcAgentWorld",
      description:
        "Récupère l'état complet du monde Minecraft vu par le bot: position, santé, inventaire, blocs proches, entités proches, biome, météo. " +
        "Variantes FR: 'que voit le bot', 'qu'est-ce qu'il y a autour', 'il a quoi dans son inventaire', " +
        "'montre-moi son inventaire', 'son inventaire', 'inventaire du bot', 'il a quoi sur lui', " +
        "'qu'est-ce qu'il y a autour de lui', 'y a quoi autour', 'il y a quoi près du bot', " +
        "'quels blocs il y a', 'quelles ressources il y a', 'y a-t-il du fer', 'y a-t-il des diamants', " +
        "'y a quoi comme animaux', 'y a quoi comme monstres', 'qui est autour du bot', " +
        "'dans quel biome il est', 'quel biome', 'il pleut', 'fait-il jour ou nuit', " +
        "'quelle heure il est dans le jeu', 'l'heure du jeu', " +
        "'montre le monde', 'montre la vue', 'que voit-il', 'qui voit-il', " +
        "'il est dans quel biome', 'y a des arbres', 'y a une grotte', 'y a un village', " +
        "'qu'est-ce qu'il y a près de lui', 'scan les environs', 'analyse la zone', " +
        "'quelles entités', 'quels animaux', 'quels monstres', 'quels joueurs'. " +
        "Variantes EN: 'what does he see', 'what's around him', 'his inventory', 'what blocks are near', " +
        "'any diamonds nearby', 'what biome', 'is it raining', 'day or night', 'scan the area'.",
      parameters: {
        type: "object",
        properties: {},
        required: [],
      },
    },
  },
  {
    type: "function",
    function: {
      name: "mcAgentAction",
      description:
        "Envoie une action directe au bot Minecraft sans passer par le LLM (action immédiate). " +
        "Actions disponibles et leurs variantes FR/EN: " +
        "collectWood: 'va chercher du bois', 'collecte du bois', 'coupe des arbres', 'go wood', 'get wood', 'chop trees'. " +
        "collectStone: 'va chercher de la pierre', 'collecte de la pierre', 'mine de la pierre', 'go stone', 'get stone'. " +
        "collectIron: 'va chercher du fer', 'mine du fer', 'collecte du fer', 'go iron', 'get iron'. " +
        "collectDiamonds: 'cherche des diamants', 'va chercher des diamants', 'mine des diamants', 'go diamonds', 'get diamonds'. " +
        "buildHouse: 'construis une maison', 'fais une maison', 'bâtis une maison', 'build a house'. " +
        "eat: 'mange', 'mange quelque chose', 'mange de la nourriture', 'il a faim', 'nourris-toi', 'eat', 'eat food'. " +
        "sleep: 'dors', 'va dormir', 'va au lit', 'couche-toi', 'sleep', 'go to bed'. " +
        "defend: 'défens-toi', 'défend', 'protège-toi', 'combat', 'tape les monstres', 'defend', 'fight'. " +
        "hunt: 'chasse', 'chasse des animaux', 'va chasser', 'tue des animaux', 'hunt', 'go hunting'. " +
        "stop: 'arrête', 'stop', 'ça suffit', 'arrête tout', 'stoppe', 'halte', 'arrête de bouger', 'stop moving', 'stand still'. " +
        "explore: 'explore', 'va explorer', 'promène-toi', 'va voir autour', 'balade-toi', 'explore', 'go explore', 'wander'. " +
        "sortInventory: 'range ton inventaire', 'mets ton armure', 'équipe-toi', 'organise ton inventaire', 'sort inventory', 'equip armor'. " +
        "Utilise cet outil pour les actions simples et immédiates. Pour les objectifs complexes (plusieurs étapes), utilise mcAgentGoal.",
      parameters: {
        type: "object",
        properties: {
          action: {
            type: "string",
            description:
              "Nom de l'action: collectWood, collectStone, collectIron, collectDiamonds, buildHouse, eat, sleep, defend, hunt, stop, explore, sortInventory",
            enum: [
              "collectWood",
              "collectStone",
              "collectIron",
              "collectDiamonds",
              "buildHouse",
              "eat",
              "sleep",
              "defend",
              "hunt",
              "stop",
              "explore",
              "sortInventory",
            ],
          },
        },
        required: ["action"],
      },
    },
  },
  {
    type: "function",
    function: {
      name: "mcAgentChat",
      description:
        "Envoie un message dans le chat Minecraft via le bot. " +
        "Variantes FR: 'dis bonjour dans le chat', 'dis-leur que j'arrive', 'parle dans le chat', " +
        "'envoie un message', 'dis coucou', 'dis quelque chose', 'parle aux autres', " +
        "'écris dans le chat', 'fais parler le bot', 'le bot peut dire', 'dis à tout le monde', " +
        "'annonce', 'crie', 'hurle', 'dis dans minecraft', 'parle sur mc', " +
        "'dis moi bonjour en jeu', 'fais parler le bot dans le jeu'. " +
        "Variantes EN: 'say hello in chat', 'send a message', 'talk in chat', 'say something', 'announce'.",
      parameters: {
        type: "object",
        properties: {
          message: {
            type: "string",
            description: "Message à envoyer dans le chat Minecraft",
          },
        },
        required: ["message"],
      },
    },
  },
  {
    type: "function",
    function: {
      name: "mcAgentStop",
      description:
        "Arrête l'agent LLM Minecraft (stoppe la boucle d'actions en cours). " +
        "Variantes FR: 'arrête', 'stop', 'ça suffit', 'laisse tomber', 'arrête tout', " +
        "'stoppe le bot', 'arrête le bot', 'plus rien', 'finis', 'c'est bon', " +
        "'arrête de faire ça', 'arrête de miner', 'arrête de construire', 'arrête de bouger', " +
        "'plus besoin', 'c'est fini', 'termine', 'tu peux arrêter', " +
        "'laisse faire', 'arrête l'objectif', 'annule', 'annule ça', " +
        "'stoppe tout', 'halte', 'pause', 'met en pause', 'plus d'action'. " +
        "Variantes EN: 'stop', 'stop it', 'enough', 'cancel', 'abort', 'quit', 'halt', 'pause', 'that's enough'.",
      parameters: {
        type: "object",
        properties: {},
        required: [],
      },
    },
  },
  {
    type: "function",
    function: {
      name: "mcAgentLog",
      description:
        "Récupère l'historique des actions récentes du bot Minecraft LLM. " +
        "Variantes FR: 'qu'est-ce qu'il a fait', 'montre-moi les logs', 'où il en est', " +
        "'qu'est-ce qu'il fait', 'historique', 'historique des actions', 'il a fait quoi', " +
        "'montre ce qu'il a fait', 'montre l'historique', 'les logs', 'log', " +
        "'où il en est dans sa tâche', 'avancement', 'progression', 'ça en est où', " +
        "'qu'est-ce qui s'est passé', 'résumé de ses actions', 'compte-rendu', " +
        "'il a réussi', 'il a échoué', 'où en est le bot', 'le bot a fait quoi'. " +
        "Variantes EN: 'what did he do', 'show logs', 'history', 'what happened', 'progress', 'status log'.",
      parameters: {
        type: "object",
        properties: {
          lines: {
            type: "number",
            description: "Nombre de lignes à récupérer (défaut: 20, max: 100)",
          },
        },
        required: [],
      },
    },
  },
];

/**
 * Génère automatiquement une liste lisible des tools disponibles
 * pour l'inclure dans le system prompt de l'agent.
 * Évite la désynchronisation entre les tools réels et le prompt.
 */
export function generateToolListPrompt(tools: AgentToolDef[]): string {
  const lines: string[] = [];
  for (const t of tools) {
    const name = t.function.name;
    const desc = t.function.description?.slice(0, 120) || "";
    lines.push(`- ${name} : ${desc}`);
  }
  return lines.join("\n");
}

// Fusionner avec les tools étendus (APIs gratuites + Discord + bot features)
export const ALL_AGENT_TOOLS: AgentToolDef[] = [
  ...AGENT_TOOLS,
  ...EXTENDED_TOOLS,
  ...AUTONOMOUS_TOOLS,
  ...FREE_TOOLS,
  ...EXTERNAL_TOOLS,
  ...EXTRA_TOOLS,
  ...MEMORY_TOOLS,
  ...RETAILER_TOOL_DEFS,
  ...ORPHAN_TOOLS,
  ...KALI_TOOLS,
];

// ─── Handlers — Exécution réelle des outils ──────────────────────────────────

export async function executeTool(
  toolName: string,
  args: Record<string, unknown>,
  ctx: ToolContext,
): Promise<ToolCallResult> {
  logger.info(
    `[AgentTools] 🔧 Exécution tool: ${toolName} args=${JSON.stringify(args).slice(0, 200)}`,
  );

  // ── Guardrails: check user permissions for dangerous actions ──
  const { checkToolPermission } = await import("./toolGuardrails.js");
  const permCheck = await checkToolPermission(ctx.client, ctx.guildId, ctx.userId, toolName);
  if (!permCheck.allowed) {
    logger.warn(
      `[Guardrails] ❌ ${toolName} blocked for ${ctx.userId} (level: ${permCheck.level})`,
    );
    return { success: false, data: permCheck.reason };
  }

  try {
    switch (toolName) {
      case "searchDocs":
        return await toolSearchDocs(args);
      case "getDesignInspiration":
        return await toolGetDesignInspiration(args);
      case "getUiComponents":
        return await toolGetUiComponents(args);
      case "getComponentDoc":
        return await toolGetComponentDoc(args);
      case "listDesignCommands":
        return await toolListDesignCommands();
      case "auditDesign":
        return await toolAuditDesign(args);
      case "deleteMessages":
        return await toolDeleteMessages(args, ctx);
      case "getBotStatus":
        return await toolGetBotStatus(ctx);
      case "timeoutUser":
        return await toolTimeoutUser(args, ctx);
      case "warnUser":
        return await toolWarnUser(args, ctx);
      case "getUserInfo":
        return await toolGetUserInfo(args, ctx);
      case "searchUserMemory":
        return await toolSearchUserMemory(args);
      case "saveMemoryFact":
        return await toolSaveMemoryFact(args);
      case "getChannelInfo":
        return await toolGetChannelInfo(ctx);
      case "pinMessage":
        return await toolPinMessage(args, ctx);
      case "searchWeb":
        return await toolSearchWeb(args);
      case "readUrl":
        return await toolReadUrl(args);
      case "fetchAndSummarize":
        return await toolFetchAndSummarize(args);
      case "ingestDocumentation":
        return await toolIngestDocumentation(args);
      case "searchKnowledge":
        return await toolSearchKnowledge(args);
      case "searchYouTube":
        return await toolSearchYouTube(args);
      case "getServerStats":
        return await toolGetServerStats(ctx);
      case "getWeather":
        return await toolGetWeather(args);
      case "getCryptoPrice":
        return await toolGetCryptoPrice(args);
      case "getWikipediaSummary":
        return await toolGetWikipediaSummary(args);
      case "getGitHubRepo":
        return await toolGetGitHubRepo(args);
      case "translateText":
        return await toolTranslateText(args);
      case "getTechNews":
        return await toolGetTechNews(args);
      case "transcribeAudio":
        return await toolTranscribeAudio(args);
      case "analyzeImageGemini":
        return await toolAnalyzeImageGemini(args);
      case "execute_code":
        return await toolExecuteCode(args);
      case "classify_nsfw":
        return await toolClassifyNsfw(args);
      case "voice_translation":
        return await toolVoiceTranslation(args, ctx);
      case "stop_voice_translation":
        return await toolStopVoiceTranslation(ctx);
      case "enable_digest":
        return await toolEnableDigest(args, ctx);
      case "disable_digest":
        return await toolDisableDigest(ctx);
      case "generate_password":
        return await toolGeneratePassword(args);
      case "create_temp_email":
        return await toolCreateTempEmail();
      case "check_temp_email":
        return await toolCheckTempEmail(args);
      case "extract_text_from_image":
        return await toolExtractTextFromImage(args);
      case "compose_image":
        return await toolComposeImage(args);
      // ─── Minecraft LLM Agent tools ───
      case "mcAgentConnect":
        return await toolMcAgentConnect(args);
      case "mcAgentGoal":
        return await toolMcAgentGoal(args);
      case "mcAgentStatus":
        return await toolMcAgentStatus();
      case "mcAgentWorld":
        return await toolMcAgentWorld();
      case "mcAgentAction":
        return await toolMcAgentAction(args);
      case "mcAgentChat":
        return await toolMcAgentChat(args);
      case "mcAgentStop":
        return await toolMcAgentStop();
      case "mcAgentLog":
        return await toolMcAgentLog(args);
      default: {
        // Essayer les tools mémoire/persona/conversation
        const memoryResult = await executeMemoryTool(toolName, args, { userId: ctx.userId });
        if (memoryResult) return memoryResult;
        // Essayer les tools étendus
        const extToolResult = await executeExtendedTool(toolName, args, ctx);
        if (extToolResult) return extToolResult;
        // Essayer les tools autonomes
        const autoResult = await executeAutonomousTool(toolName, args, ctx);
        if (autoResult) return autoResult;
        // Essayer les tools free APIs
        const freeResult = await executeFreeTool(toolName, args, ctx);
        if (freeResult) return freeResult;
        // Essayer les tools externes (VPS, HTTP, DB, Docker, Git)
        const extResult = await executeExternalTool(toolName, args, ctx);
        if (extResult) return extResult;
        // Essayer les tools extra (HackerNews, GitHub trending, weather forecast, etc.)
        const extraResult = await executeExtraTool(toolName, args, ctx);
        if (extraResult) return extraResult;
        // Essayer les tools orphelins (lyrics, URL shortener, DNS, reminders, etc.)
        const orphanResult = await executeOrphanTool(toolName, args, ctx);
        if (orphanResult) return orphanResult;
        // Essayer les tools Kali Linux (Layer 7 — Docker isolé)
        const kaliResult = await executeKaliTool(toolName, args, { userId: ctx.userId });
        if (kaliResult) return kaliResult;
        // Essayer les tools revendeurs (Amazon, eBay, Cdiscount, etc.)
        const retailerResult = await handleRetailerTool(toolName, args, ctx);
        if (retailerResult.success || retailerResult.data) return retailerResult;
        return { success: false, data: `Outil inconnu: ${toolName}` };
      }
    }
  } catch (error) {
    logger.error(
      `[AgentTools] Erreur tool ${toolName}: ${error instanceof Error ? error.message : String(error)}`,
    );
    return {
      success: false,
      data: `Erreur lors de l'exécution: ${error instanceof Error ? error.message : String(error)}`,
    };
  }
}

// ─── Implémentation des tools ────────────────────────────────────────────────

async function toolSearchDocs(args: Record<string, unknown>): Promise<ToolCallResult> {
  const library = args.library as string;
  const question = args.question as string;

  if (!library || !question) {
    return { success: false, data: "Paramètres manquants: 'library' et 'question' sont requis." };
  }

  if (!isContext7Available()) {
    return { success: false, data: "Context7 n'est pas disponible." };
  }

  try {
    const result = await searchDocumentation(library, question, 5000);
    if (!result) {
      return {
        success: false,
        data: `Aucune documentation trouvée pour "${library}" avec la question: ${question}`,
      };
    }

    return {
      success: true,
      data: `📚 Documentation ${result.library} (via Context7):\n\n${result.content.slice(0, 4000)}`,
    };
  } catch (err) {
    logger.error("[AgentTools] searchDocs error:", String(err));
    return { success: false, data: `Erreur lors de la recherche de doc: ${String(err)}` };
  }
}

async function toolGetDesignInspiration(args: Record<string, unknown>): Promise<ToolCallResult> {
  const category = args.category as string | undefined;
  try {
    const result = await getGodlyInspiration(category);
    if (!result) {
      return { success: false, data: "Impossible de récupérer l'inspiration design depuis Godly." };
    }
    return { success: true, data: result };
  } catch (err) {
    return { success: false, data: `Erreur Godly: ${String(err)}` };
  }
}

async function toolGetUiComponents(args: Record<string, unknown>): Promise<ToolCallResult> {
  const filter = args.filter as string | undefined;
  return { success: true, data: getAceternityComponents(filter) };
}

async function toolGetComponentDoc(args: Record<string, unknown>): Promise<ToolCallResult> {
  const component = args.component as string;
  if (!component) {
    return { success: false, data: "Paramètre 'component' requis." };
  }
  try {
    const result = await getAceternityComponentDoc(component);
    return { success: true, data: result || `Composant "${component}" non trouvé.` };
  } catch (err) {
    return { success: false, data: `Erreur: ${String(err)}` };
  }
}

async function toolListDesignCommands(): Promise<ToolCallResult> {
  return { success: true, data: listImpeccableCommands() };
}

async function toolAuditDesign(args: Record<string, unknown>): Promise<ToolCallResult> {
  const html = args.html as string;
  if (!html) {
    return { success: false, data: "Paramètre 'html' requis (le code HTML/CSS à auditer)." };
  }
  return { success: true, data: auditDesignForSlop(html) };
}

async function toolDeleteMessages(
  args: Record<string, unknown>,
  ctx: ToolContext,
): Promise<ToolCallResult> {
  const amount = Math.min(100, Math.max(1, Number(args.amount) || 5));
  const channel = ctx.client.channels.cache.get(ctx.channelId) as TextChannel | undefined;
  if (!channel || !channel.isTextBased()) {
    return { success: false, data: "Salon introuvable ou non textuel" };
  }

  const messages = await channel.messages.fetch({ limit: amount });
  const deleted = await channel.bulkDelete(messages, true).catch((): null => null);

  const count = deleted?.size ?? 0;
  return {
    success: true,
    data: `${count} messages supprimés dans #${channel.name}.`,
  };
}

async function toolGetBotStatus(ctx: ToolContext): Promise<ToolCallResult> {
  const mem = process.memoryUsage();
  const rssMB = Math.round(mem.rss / 1024 / 1024);
  const heapMB = Math.round(mem.heapUsed / 1024 / 1024);
  const ping = ctx.client.ws.ping;
  const uptime = Math.round(process.uptime() / 60);
  const guildCount = ctx.client.guilds.cache.size;

  return {
    success: true,
    data: JSON.stringify({
      memoryRSS: `${rssMB}MB`,
      memoryHeap: `${heapMB}MB`,
      ping: `${ping}ms`,
      uptime: `${uptime}min`,
      guilds: guildCount,
      status: rssMB >= 300 ? "WARNING" : "OK",
    }),
  };
}

async function toolTimeoutUser(
  args: Record<string, unknown>,
  ctx: ToolContext,
): Promise<ToolCallResult> {
  const userId = String(args.userId);
  const durationMin = Math.min(1440, Math.max(1, Number(args.durationMinutes) || 10));
  const reason = String(args.reason || "Timeout par agent IA");
  const guild = ctx.client.guilds.cache.get(ctx.guildId);
  if (!guild) return { success: false, data: "Serveur introuvable" };

  const member = await guild.members.fetch(userId).catch((): null => null);
  if (!member) return { success: false, data: "Utilisateur introuvable" };

  await member.timeout(durationMin * 60 * 1000, `[Agent IA] ${reason}`.slice(0, 512));

  // Logger la sanction
  await prisma.sanction
    .create({
      data: {
        guildId: ctx.guildId,
        userId,
        moderatorId: "AI_AGENT",
        type: "TIMEOUT",
        reason: `[Agent IA] ${reason}`,
      },
    })
    .catch(() => {});

  return {
    success: true,
    data: `Utilisateur <@${userId}> mis en timeout pour ${durationMin}min. Raison: ${reason}`,
  };
}

async function toolWarnUser(
  args: Record<string, unknown>,
  ctx: ToolContext,
): Promise<ToolCallResult> {
  const userId = String(args.userId);
  const reason = String(args.reason || "Avertissement par agent IA");

  await prisma.sanction
    .create({
      data: {
        guildId: ctx.guildId,
        userId,
        moderatorId: "AI_AGENT",
        type: "WARN",
        reason,
      },
    })
    .catch(() => {});

  return {
    success: true,
    data: `Avertissement enregistré pour <@${userId}>. Raison: ${reason}`,
  };
}

async function toolGetUserInfo(
  args: Record<string, unknown>,
  ctx: ToolContext,
): Promise<ToolCallResult> {
  const userId = String(args.userId);

  const sanctions = await prisma.sanction.findMany({
    where: { userId, guildId: ctx.guildId },
    orderBy: { createdAt: "desc" },
    take: 10,
  });

  const riskProfile = await prisma.riskProfile.findUnique({
    where: { userId_guildId: { userId, guildId: ctx.guildId } },
  });

  return {
    success: true,
    data: JSON.stringify({
      userId,
      sanctions: sanctions.map((s) => ({
        type: s.type,
        reason: s.reason,
        date: s.createdAt.toISOString(),
      })),
      sanctionCount: sanctions.length,
      riskScore: riskProfile?.riskScore ?? 0,
      riskLevel: riskProfile?.riskLevel ?? "INCONNU",
      underWatch: riskProfile?.underWatch ?? false,
    }),
  };
}

async function toolSearchUserMemory(args: Record<string, unknown>): Promise<ToolCallResult> {
  const userId = String(args.userId);
  const query = args.query ? String(args.query) : undefined;

  let where: Record<string, unknown> = { userId };
  if (query) {
    where = {
      userId,
      OR: [
        { key: { contains: query, mode: "insensitive" } },
        { value: { contains: query, mode: "insensitive" } },
      ],
    };
  }

  const facts = await prisma.memoryFact.findMany({
    where,
    orderBy: { weight: "desc" },
    take: 10,
  });

  if (facts.length === 0) {
    return { success: true, data: "Aucun fait en mémoire pour cet utilisateur." };
  }

  return {
    success: true,
    data: JSON.stringify(
      facts.map((f) => ({ key: f.key, value: f.value, category: f.category, weight: f.weight })),
    ),
  };
}

async function toolSaveMemoryFact(args: Record<string, unknown>): Promise<ToolCallResult> {
  const userId = String(args.userId);
  const key = String(args.key);
  const value = String(args.value);
  const category = args.category ? String(args.category) : "info";

  // S'assurer que UserMemory existe
  await prisma.userMemory.upsert({
    where: { userId },
    create: { userId },
    update: { lastActiveAt: new Date() },
  });

  await prisma.memoryFact.upsert({
    where: { userId_key: { userId, key } },
    create: { userId, key, value, category },
    update: { value, category, updatedAt: new Date() },
  });

  return {
    success: true,
    data: `Fait sauvegardé: ${key} = ${value} (catégorie: ${category})`,
  };
}

async function toolGetChannelInfo(ctx: ToolContext): Promise<ToolCallResult> {
  const channel = ctx.client.channels.cache.get(ctx.channelId) as TextChannel | undefined;
  if (!channel) return { success: false, data: "Salon introuvable" };

  const recentMessages = await channel.messages.fetch({ limit: 1 }).catch((): null => null);

  return {
    success: true,
    data: JSON.stringify({
      name: channel.name,
      id: channel.id,
      type: channel.type === ChannelType.GuildText ? "text" : "other",
      topic: channel.topic || null,
      lastMessageId: recentMessages?.first()?.id ?? null,
    }),
  };
}

async function toolPinMessage(
  args: Record<string, unknown>,
  ctx: ToolContext,
): Promise<ToolCallResult> {
  const messageId = String(args.messageId);
  const channel = ctx.client.channels.cache.get(ctx.channelId) as TextChannel | undefined;
  if (!channel) return { success: false, data: "Salon introuvable" };

  let msgId = messageId;
  if (messageId === "last") {
    const msgs = await channel.messages.fetch({ limit: 2 });
    // Skip the bot's own message, pin the one before
    const last = msgs.last();
    if (!last) return { success: false, data: "Aucun message à épingler" };
    msgId = last.id;
  }

  const msg = await channel.messages.fetch(msgId).catch((): null => null);
  if (!msg) return { success: false, data: "Message introuvable" };

  await msg.pin().catch(() => {
    // Maybe already pinned
  });

  return { success: true, data: `Message ${msgId} épinglé dans #${channel.name}` };
}

// ─── Web Tools ───────────────────────────────────────────────────────────────

function getCached(key: string): string | null {
  const entry = webCache.get(key);
  if (entry && Date.now() - entry.ts < WEB_CACHE_TTL_MS) return entry.data;
  return null;
}

function setCached(key: string, data: string): void {
  webCache.set(key, { data, ts: Date.now() });
  if (webCache.size > 50) {
    const oldest = webCache.keys().next().value;
    if (oldest) webCache.delete(oldest);
  }
}

async function toolSearchWeb(args: Record<string, unknown>): Promise<ToolCallResult> {
  const query = String(args.query);
  const lang = String(args.lang || "fr");
  const cacheKey = `web:${query}:${lang}`;

  const cached = getCached(cacheKey);
  if (cached) return { success: true, data: cached };

  try {
    // 1. Brave Search API (if configured) — proper search API with rich results
    if (isBraveSearchAvailable()) {
      const braveResults = await braveWebSearch(query, 8);
      if (braveResults.length > 0) {
        // Optional: rerank results with Cohere for better relevance
        if (isCohereAvailable()) {
          const docs = braveResults.map((r) => `${r.title}. ${r.description}`);
          const reranked = await rerankDocuments(query, docs, 5);
          if (reranked.length > 0) {
            const rerankedResults = reranked.map((r) => braveResults[r.index]).filter(Boolean);
            const output = JSON.stringify({ provider: "brave+cohere", results: rerankedResults });
            setCached(cacheKey, output);
            return { success: true, data: output };
          }
        }
        const output = JSON.stringify({ provider: "brave", results: braveResults });
        setCached(cacheKey, output);
        return { success: true, data: output };
      }
    }

    // 2. DuckDuckGo Instant Answer (fallback)
    const iaUrl = `https://api.duckduckgo.com/?q=${encodeURIComponent(query)}&format=json&no_html=1&skip_disambig=1&kl=${lang}-${lang}`;
    const iaRes = await fetch(iaUrl, {
      headers: { "User-Agent": "DiscordBot/1.0" },
      signal: AbortSignal.timeout(8000),
    }).catch((): null => null);

    let abstract = "";
    if (iaRes?.ok) {
      const iaData = (await iaRes.json()) as {
        Abstract?: string;
        Heading?: string;
        AbstractURL?: string;
      };
      if (iaData.Abstract) abstract = iaData.Abstract;
    }

    // 3. DuckDuckGo HTML scraping
    const htmlUrl = `https://html.duckduckgo.com/html/?q=${encodeURIComponent(query)}&kl=${lang}-${lang}`;
    const htmlRes = await fetch(htmlUrl, {
      headers: {
        "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36",
        Accept: "text/html",
        "Accept-Language": lang,
      },
      signal: AbortSignal.timeout(10000),
    }).catch((): null => null);

    const results: Array<{ title: string; url: string; snippet: string }> = [];
    if (htmlRes?.ok) {
      const html = await htmlRes.text();
      const regex =
        /<a[^>]*class="[^"]*result__a[^"]*"[^>]*href="([^"]*)"[^>]*>(.*?)<\/a>[\s\S]*?<a[^>]*class="[^"]*result__snippet[^"]*"[^>]*>(.*?)<\/a>/gi;
      let match: RegExpExecArray | null;
      while ((match = regex.exec(html)) !== null && results.length < 8) {
        const rawUrl = match[1];
        const title = stripAllHtml(match[2]).trim();
        const snippet = stripAllHtml(match[3]).trim();
        let url = rawUrl;
        if (rawUrl.includes("uddg=")) {
          const m = rawUrl.match(/uddg=([^&]+)/);
          if (m) url = decodeURIComponent(m[1]);
        }
        if (title && url.startsWith("http")) {
          results.push({ title: title.slice(0, 200), url, snippet: snippet.slice(0, 300) });
        }
      }
    }

    const output = JSON.stringify({ abstract, results, provider: "duckduckgo" });
    setCached(cacheKey, output);
    return { success: true, data: output };
  } catch (error) {
    return {
      success: false,
      data: `Erreur recherche web: ${error instanceof Error ? error.message : String(error)}`,
    };
  }
}

/**
 * Fetches HTML from a Response, extracts text, then releases the raw buffer.
 * The html variable goes out of scope when the function returns, allowing
 * V8 GC to reclaim the underlying ArrayBuffer immediately.
 */
async function extractTextFromHtml(res: Response): Promise<string> {
  const html = await res.text();
  try {
    const { JSDOM } = await import("jsdom");
    const { Readability } = await import("@mozilla/readability");
    const dom = new JSDOM(html, { url: res.url || "http://localhost" });
    const reader = new Readability(dom.window.document);
    const article = reader.parse();
    dom.window.close();
    if (article?.textContent) {
      const text = article.textContent.replace(/\s+/g, " ").trim().slice(0, 3000);
      return text || "(page vide ou contenu non-texte)";
    }
  } catch {
    // fallback to basic strip
  }
  const text = stripAllHtml(html).replace(/\s+/g, " ").trim().slice(0, 3000);
  return text || "(page vide ou contenu non-texte)";
}

async function toolReadUrl(args: Record<string, unknown>): Promise<ToolCallResult> {
  const url = String(args.url);
  if (!url.startsWith("http")) return { success: false, data: "URL invalide" };

  const cacheKey = `url:${url}`;
  const cached = getCached(cacheKey);
  if (cached) return { success: true, data: cached };

  try {
    const res = await safeFetch(
      url,
      {
        headers: {
          "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36",
          Accept: "text/html,application/xhtml+xml",
        },
        signal: AbortSignal.timeout(12000),
      },
      "toolReadUrl",
    );

    if (!res.ok) return { success: false, data: `HTTP ${res.status}` };

    // Extract text from HTML then release the raw buffer immediately.
    // The raw HTML string can be several MB for large pages — by extracting
    // in a separate async function, the html variable goes out of scope
    // before we continue, allowing V8 GC to reclaim the buffer.
    const output = await extractTextFromHtml(res);
    setCached(cacheKey, output);
    return { success: true, data: output };
  } catch (error) {
    return {
      success: false,
      data: `Erreur lecture URL: ${error instanceof Error ? error.message : String(error)}`,
    };
  }
}

async function toolSearchYouTube(args: Record<string, unknown>): Promise<ToolCallResult> {
  const query = String(args.query);
  const maxResults = Math.min(10, Math.max(1, Number(args.maxResults) || 5));
  const cacheKey = `yt:${query}:${maxResults}`;
  const cached = getCached(cacheKey);
  if (cached) return { success: true, data: cached };

  const instances = ["https://yewtu.be", "https://inv.nadeko.net", "https://invidious.snopyta.org"];

  for (const instance of instances) {
    try {
      const url = `${instance}/api/v1/search?q=${encodeURIComponent(query)}&type=video&sort_by=relevance&limit=${maxResults}`;
      const res = await fetch(url, { signal: AbortSignal.timeout(5000) });
      if (!res.ok) continue;
      const data = (await res.json()) as Array<{
        videoId: string;
        title: string;
        author: string;
      }>;
      const results = (data ?? []).slice(0, maxResults).map((v) => ({
        title: v.title,
        channel: v.author,
        url: `https://www.youtube.com/watch?v=${v.videoId}`,
      }));
      const output = JSON.stringify(results);
      setCached(cacheKey, output);
      return { success: true, data: output };
    } catch {
      continue;
    }
  }

  return { success: false, data: "Aucun résultat YouTube" };
}

async function toolGetServerStats(ctx: ToolContext): Promise<ToolCallResult> {
  const guild = ctx.client.guilds.cache.get(ctx.guildId);
  if (!guild) return { success: false, data: "Serveur introuvable" };

  return {
    success: true,
    data: JSON.stringify({
      name: guild.name,
      memberCount: guild.memberCount,
      channelCount: guild.channels.cache.size,
      roleCount: guild.roles.cache.size,
      boostLevel: guild.premiumTier,
      boostCount: guild.premiumSubscriptionCount ?? 0,
      createdAt: guild.createdAt.toISOString(),
      iconURL: guild.iconURL(),
    }),
  };
}

// ─── Free API Tools (no API key required) ────────────────────────────────────

// Open-Meteo: free weather API, no key needed
async function toolGetWeather(args: Record<string, unknown>): Promise<ToolCallResult> {
  const city = String(args.city);
  const cacheKey = `weather:${city.toLowerCase()}`;
  const cached = getCached(cacheKey);
  if (cached) return { success: true, data: cached };

  try {
    // 1. Geocode the city name
    const geoUrl = `https://geocoding-api.open-meteo.com/v1/search?name=${encodeURIComponent(city)}&count=1&language=fr&format=json`;
    const geoRes = await fetch(geoUrl, { signal: AbortSignal.timeout(8000) });
    if (!geoRes.ok) return { success: false, data: "Géocodage échoué" };
    const geoData = (await geoRes.json()) as {
      results?: Array<{ latitude: number; longitude: number; name: string; country: string }>;
    };
    if (!geoData.results?.[0]) return { success: false, data: `Ville "${city}" introuvable` };
    const loc = geoData.results[0];

    // 2. Get weather
    const weatherUrl = `https://api.open-meteo.com/v1/forecast?latitude=${loc.latitude}&longitude=${loc.longitude}&current=temperature_2m,relative_humidity_2m,apparent_temperature,weather_code,wind_speed_10m&timezone=auto`;
    const weatherRes = await fetch(weatherUrl, { signal: AbortSignal.timeout(8000) });
    if (!weatherRes.ok) return { success: false, data: "Météo indisponible" };
    const wData = (await weatherRes.json()) as {
      current: {
        temperature_2m: number;
        relative_humidity_2m: number;
        apparent_temperature: number;
        weather_code: number;
        wind_speed_10m: number;
      };
    };

    const codeMap: Record<number, string> = {
      0: "Ciel dégagé",
      1: "Principalement dégagé",
      2: "Partiellement nuageux",
      3: "Couvert",
      45: "Brouillard",
      48: "Brouillard givrant",
      51: "Bruine légère",
      53: "Bruine modérée",
      55: "Bruine dense",
      61: "Pluie légère",
      63: "Pluie modérée",
      65: "Pluie forte",
      71: "Neige légère",
      73: "Neige modérée",
      75: "Neige forte",
      80: "Averses légères",
      81: "Averses modérées",
      82: "Averses violentes",
      95: "Orage",
      96: "Orage + grêle légère",
      99: "Orage + grêle forte",
    };
    const condition = codeMap[wData.current.weather_code] || "Conditions inconnues";

    const output = JSON.stringify({
      city: `${loc.name}, ${loc.country}`,
      temperature: `${wData.current.temperature_2m}°C`,
      feelsLike: `${wData.current.apparent_temperature}°C`,
      humidity: `${wData.current.relative_humidity_2m}%`,
      wind: `${wData.current.wind_speed_10m} km/h`,
      condition,
    });
    setCached(cacheKey, output);
    return { success: true, data: output };
  } catch (error) {
    return {
      success: false,
      data: `Erreur météo: ${error instanceof Error ? error.message : String(error)}`,
    };
  }
}

// CoinGecko: free crypto prices, no key needed
async function toolGetCryptoPrice(args: Record<string, unknown>): Promise<ToolCallResult> {
  const coin = String(args.coin).toLowerCase().trim();
  const cacheKey = `crypto:${coin}`;
  const cached = getCached(cacheKey);
  if (cached) return { success: true, data: cached };

  try {
    const url = `https://api.coingecko.com/api/v3/simple/price?ids=${encodeURIComponent(coin)}&vs_currencies=eur,usd&include_24hr_change=true`;
    const res = await fetch(url, {
      headers: { Accept: "application/json" },
      signal: AbortSignal.timeout(8000),
    });
    if (!res.ok) return { success: false, data: `Crypto "${coin}" introuvable` };
    const data = (await res.json()) as Record<
      string,
      { eur: number; usd: number; eur_24h_change: number }
    >;
    const info = data[coin];
    if (!info)
      return {
        success: false,
        data: `Crypto "${coin}" introuvable. Essayez: bitcoin, ethereum, solana, dogecoin`,
      };

    const output = JSON.stringify({
      coin,
      priceEUR: `${info.eur}€`,
      priceUSD: `$${info.usd}`,
      change24h: `${info.eur_24h_change?.toFixed(2)}%`,
    });
    setCached(cacheKey, output);
    return { success: true, data: output };
  } catch (error) {
    return {
      success: false,
      data: `Erreur crypto: ${error instanceof Error ? error.message : String(error)}`,
    };
  }
}

// Wikipedia: free, no key needed
async function toolGetWikipediaSummary(args: Record<string, unknown>): Promise<ToolCallResult> {
  const query = String(args.query);
  const lang = String(args.lang || "fr");
  const cacheKey = `wiki:${lang}:${query.toLowerCase()}`;
  const cached = getCached(cacheKey);
  if (cached) return { success: true, data: cached };

  try {
    // Search for the best matching article
    const searchUrl = `https://${lang}.wikipedia.org/w/api.php?action=query&list=search&srsearch=${encodeURIComponent(query)}&format=json&srlimit=1`;
    const searchRes = await fetch(searchUrl, { signal: AbortSignal.timeout(8000) });
    if (!searchRes.ok) return { success: false, data: "Wikipedia indisponible" };
    const searchData = (await searchRes.json()) as {
      query?: { search?: Array<{ title: string }> };
    };
    const title = searchData.query?.search?.[0]?.title;
    if (!title) return { success: false, data: `Aucun article Wikipedia pour "${query}"` };

    // Get the summary
    const summaryUrl = `https://${lang}.wikipedia.org/api/rest_v1/page/summary/${encodeURIComponent(title)}`;
    const summaryRes = await fetch(summaryUrl, { signal: AbortSignal.timeout(8000) });
    if (!summaryRes.ok) return { success: false, data: "Résumé indisponible" };
    const summary = (await summaryRes.json()) as {
      title: string;
      extract: string;
      content_urls?: { desktop?: { page: string } };
      thumbnail?: { source: string };
    };

    const output = JSON.stringify({
      title: summary.title,
      extract: summary.extract?.slice(0, 1500) || "Pas de résumé disponible",
      url:
        summary.content_urls?.desktop?.page ||
        `https://${lang}.wikipedia.org/wiki/${encodeURIComponent(title)}`,
      image: summary.thumbnail?.source || null,
    });
    setCached(cacheKey, output);
    return { success: true, data: output };
  } catch (error) {
    return {
      success: false,
      data: `Erreur Wikipedia: ${error instanceof Error ? error.message : String(error)}`,
    };
  }
}

// GitHub API: free for public repos, no key needed (60 req/hour)
async function toolGetGitHubRepo(args: Record<string, unknown>): Promise<ToolCallResult> {
  const owner = String(args.owner);
  const repo = String(args.repo);
  const cacheKey = `github:${owner}/${repo}`;
  const cached = getCached(cacheKey);
  if (cached) return { success: true, data: cached };

  try {
    const url = `https://api.github.com/repos/${encodeURIComponent(owner)}/${encodeURIComponent(repo)}`;
    const res = await fetch(url, {
      headers: {
        Accept: "application/vnd.github.v3+json",
        "User-Agent": "DiscordBot/1.0",
      },
      signal: AbortSignal.timeout(8000),
    });
    if (!res.ok) return { success: false, data: `Dépôt ${owner}/${repo} introuvable` };
    const data = (await res.json()) as {
      full_name: string;
      description: string | null;
      stargazers_count: number;
      forks_count: number;
      language: string | null;
      open_issues_count: number;
      html_url: string;
      updated_at: string;
      topics?: string[];
    };

    const output = JSON.stringify({
      name: data.full_name,
      description: data.description || "Pas de description",
      stars: data.stargazers_count,
      forks: data.forks_count,
      language: data.language || "N/A",
      openIssues: data.open_issues_count,
      url: data.html_url,
      lastUpdate: data.updated_at,
      topics: data.topics || [],
    });
    setCached(cacheKey, output);
    return { success: true, data: output };
  } catch (error) {
    return {
      success: false,
      data: `Erreur GitHub: ${error instanceof Error ? error.message : String(error)}`,
    };
  }
}

// MyMemory: free translation API, no key needed (5000 chars/day)
async function toolTranslateText(args: Record<string, unknown>): Promise<ToolCallResult> {
  const text = String(args.text).slice(0, 500);
  const to = String(args.to);
  const from = args.from ? String(args.from) : "auto";

  try {
    const langPair = from === "auto" ? to : `${from}|${to}`;
    const url = `https://api.mymemory.translated.net/get?q=${encodeURIComponent(text)}&langpair=${encodeURIComponent(langPair)}`;
    const res = await fetch(url, { signal: AbortSignal.timeout(8000) });
    if (!res.ok) return { success: false, data: "Traduction indisponible" };
    const data = (await res.json()) as {
      responseData?: { translatedText?: string; match?: number };
      responseStatus?: number;
    };

    if (data.responseStatus !== 200 || !data.responseData?.translatedText) {
      return { success: false, data: "Traduction échouée" };
    }

    return {
      success: true,
      data: JSON.stringify({
        original: text,
        translated: data.responseData.translatedText,
        from: from === "auto" ? "auto-détecté" : from,
        to,
        confidence: data.responseData.match
          ? `${Math.round(data.responseData.match * 100)}%`
          : "N/A",
      }),
    };
  } catch (error) {
    return {
      success: false,
      data: `Erreur traduction: ${error instanceof Error ? error.message : String(error)}`,
    };
  }
}

async function toolTranscribeAudio(args: Record<string, unknown>): Promise<ToolCallResult> {
  const audioUrl = String(args.audioUrl);
  if (!audioUrl.startsWith("http")) {
    return { success: false, data: "URL audio invalide" };
  }
  if (!isAssemblyAiAvailable()) {
    return { success: false, data: "AssemblyAI non configuré. Set ASSEMBLYAI_API_KEY dans .env" };
  }

  try {
    const transcript = await transcribeAudio(audioUrl);
    if (transcript) {
      return {
        success: true,
        data: JSON.stringify({ audioUrl, transcript, length: transcript.length }),
      };
    }
    return { success: false, data: "Transcription échouée ou audio silencieux" };
  } catch (error) {
    return {
      success: false,
      data: `Erreur transcription: ${error instanceof Error ? error.message : String(error)}`,
    };
  }
}

async function toolAnalyzeImageGemini(args: Record<string, unknown>): Promise<ToolCallResult> {
  const imageUrl = String(args.imageUrl);
  const question = String(args.question || "Décris cette image en détail");
  if (!imageUrl.startsWith("http")) {
    return { success: false, data: "URL image invalide" };
  }
  if (!isGeminiAvailable()) {
    return { success: false, data: "Gemini non configuré. Set GEMINI_API_KEY dans .env" };
  }

  try {
    const analysis = await analyzeImageWithGemini(imageUrl, question);
    if (analysis) {
      return {
        success: true,
        data: JSON.stringify({ imageUrl, question, analysis }),
      };
    }
    return { success: false, data: "Analyse d'image échouée" };
  } catch (error) {
    return {
      success: false,
      data: `Erreur analyse image: ${error instanceof Error ? error.message : String(error)}`,
    };
  }
}

// Hacker News: free, no key needed
async function toolGetTechNews(args: Record<string, unknown>): Promise<ToolCallResult> {
  const maxResults = Math.min(10, Math.max(1, Number(args.maxResults) || 5));
  const cacheKey = `hn:${maxResults}`;
  const cached = getCached(cacheKey);
  if (cached) return { success: true, data: cached };

  try {
    // Get top story IDs
    const idsRes = await fetch("https://hacker-news.firebaseio.com/v0/topstories.json", {
      signal: AbortSignal.timeout(8000),
    });
    if (!idsRes.ok) return { success: false, data: "Hacker News indisponible" };
    const ids = (await idsRes.json()) as number[];

    // Fetch top N stories in parallel
    const topIds = ids.slice(0, maxResults);
    const stories = await Promise.all(
      topIds.map(async (id) => {
        const res = await fetch(`https://hacker-news.firebaseio.com/v0/item/${id}.json`, {
          signal: AbortSignal.timeout(8000),
        });
        if (!res.ok) return null;
        const data = (await res.json()) as {
          title: string;
          url?: string;
          score: number;
          by: string;
        };
        return {
          title: data.title,
          url: data.url || `https://news.ycombinator.com/item?id=${id}`,
          score: data.score,
          author: data.by,
        };
      }),
    );

    const valid = stories.filter((s): s is NonNullable<typeof s> => s !== null);
    const output = JSON.stringify(valid);
    setCached(cacheKey, output);
    return { success: true, data: output };
  } catch (error) {
    return {
      success: false,
      data: `Erreur Hacker News: ${error instanceof Error ? error.message : String(error)}`,
    };
  }
}

// ─── Code Sandbox ────────────────────────────────────────────────────────────

async function toolExecuteCode(args: Record<string, unknown>): Promise<ToolCallResult> {
  const code = String(args.code ?? "");
  const language = String(args.language ?? "python") as "python" | "javascript" | "shell";

  if (!code.trim()) {
    return { success: false, data: "Code vide — rien à exécuter" };
  }

  // Safety: block obviously dangerous commands
  const dangerousPatterns = [
    /rm\s+-rf\s+\//,
    /mkfs/,
    /dd\s+if=\/dev\/zero/,
    /:\(\)\{.*\};:/, // fork bomb
    /shutdown/,
    /reboot/,
  ];

  if (dangerousPatterns.some((p) => p.test(code))) {
    return {
      success: false,
      data: "Code bloqué par le filtre de sécurité (commande dangereuse détectée)",
    };
  }

  try {
    const result = await executeCode(code, language);
    const formatted = await formatSandboxResult(result);
    const mode = isE2BConfigured() ? "E2B cloud" : "local";
    logger.info(
      `[CodeSandbox] ${language} executed (${mode}) — ${result.success ? "OK" : "FAIL"} in ${result.executionTimeMs}ms`,
    );
    return { success: result.success, data: formatted };
  } catch (error) {
    return {
      success: false,
      data: `Erreur sandbox: ${error instanceof Error ? error.message : String(error)}`,
    };
  }
}

// ─── Web Ingestion Tools ─────────────────────────────────────────────────────

async function toolFetchAndSummarize(args: Record<string, unknown>): Promise<ToolCallResult> {
  const url = String(args.url);
  const customPrompt = args.customPrompt ? String(args.customPrompt) : undefined;

  const result = await ingestUrl(url, { summarize: true, customPrompt });
  if (!result) {
    return { success: false, data: `Impossible d'ingérer ${url}` };
  }

  return {
    success: true,
    data: JSON.stringify({
      title: result.title,
      summary: result.summary,
      wordCount: result.wordCount,
      message: `Contenu ingéré et stocké dans la base de connaissances (${result.wordCount} mots)`,
    }),
  };
}

async function toolIngestDocumentation(args: Record<string, unknown>): Promise<ToolCallResult> {
  const urls = args.urls as string[];
  if (!Array.isArray(urls) || urls.length === 0) {
    return { success: false, data: "Liste d'URLs vide" };
  }

  const { ingestBatch } = await import("./webIngestion.js");
  const customPrompt = args.customPrompt ? String(args.customPrompt) : undefined;
  const result = await ingestBatch(urls.slice(0, 20), { summarize: true, customPrompt });

  return {
    success: result.success > 0,
    data: JSON.stringify({
      success: result.success,
      failed: result.failed,
      results: result.results,
      message: `${result.success}/${urls.length} pages ingérées avec succès`,
    }),
  };
}

async function toolSearchKnowledge(args: Record<string, unknown>): Promise<ToolCallResult> {
  const query = String(args.query);
  const limit = Math.min(10, Math.max(1, Number(args.limit) || 5));

  const results = await searchKnowledge(query, limit);
  if (!results.length) {
    return { success: false, data: "Aucun contenu trouvé dans la base de connaissances" };
  }

  // Construire le contexte à partir des résultats
  const contextText = results
    .map((r, i) => `[${i + 1}] ${r.title}\nURL: ${r.url}\n${r.summary}`)
    .join("\n\n");

  // Utiliser OpenRouter pour générer une réponse constructive à partir des connaissances
  try {
    const client = getOpenAIClient();
    const completion = await client.chat.completions.create({
      model: config.openRouterModel,
      messages: [
        {
          role: "system",
          content:
            "Tu es un assistant expert. À partir des connaissances stockées en base, " +
            "génère une réponse constructive, structurée et utile. " +
            "Synthétise les informations, mets en avant les points clés, " +
            "et ajoute des conseils pratiques si pertinent. " +
            "Réponds en français. Cite les sources (URLs) quand tu utilises une information. " +
            "Si les connaissances ne couvrent qu'une partie de la question, signale-le clairement.",
        },
        {
          role: "user",
          content: `Question: ${query}\n\nConnaissances disponibles:\n${contextText}`,
        },
      ],
      max_tokens: 800,
      temperature: 0.5,
    });

    const constructiveAnswer = completion.choices[0]?.message?.content;

    if (constructiveAnswer && constructiveAnswer.trim().length > 0) {
      // Retourner la réponse constructive + les sources pour que l'agent puisse les citer
      const sources = results.map((r) => r.url).filter(Boolean);
      return {
        success: true,
        data: `${constructiveAnswer}\n\n--- Sources: ${sources.join(", ")}`,
      };
    }
  } catch (err) {
    logger.warn(
      `[toolSearchKnowledge] OpenRouter synthesis failed: ${err instanceof Error ? err.message : String(err)}`,
    );
  }

  // Fallback: retourner les résultats bruts si l'API échoue
  return {
    success: true,
    data: JSON.stringify(results),
  };
}

// ─── NSFW Classifier ──────────────────────────────────────────────────────────

async function toolClassifyNsfw(args: Record<string, unknown>): Promise<ToolCallResult> {
  const imageUrl = String(args.imageUrl || "").trim();
  if (!imageUrl) return { success: false, data: "URL d'image requise" };
  if (!imageUrl.startsWith("http"))
    return { success: false, data: "L'URL doit commencer par http" };

  const threshold = args.threshold ? Number(args.threshold) : 0.5;
  const strict = args.strict === true;

  const result = await classifyNsfw(imageUrl, { threshold, strict });

  const actionEmoji = result.action === "block" ? "🚫" : result.action === "warn" ? "⚠️" : "✅";
  const data =
    `${actionEmoji} **Classification NSFW**\n` +
    `Source: ${result.source}\n` +
    `Action: **${result.action}**\n` +
    `Confiance: ${(result.confidence * 100).toFixed(1)}%\n` +
    `Raw (nudité explicite): ${(result.categories.raw * 100).toFixed(1)}%\n` +
    `Partial (nudité partielle): ${(result.categories.partial * 100).toFixed(1)}%\n` +
    `Suggestive (suggestif): ${(result.categories.suggestive * 100).toFixed(1)}%`;

  return { success: true, data };
}

// ─── Voice Translation ────────────────────────────────────────────────────────

async function toolVoiceTranslation(
  args: Record<string, unknown>,
  ctx: ToolContext,
): Promise<ToolCallResult> {
  const targetLang = String(args.targetLang || "FR").toUpperCase() as
    "FR" | "EN" | "DE" | "ES" | "IT" | "PT" | "JA" | "KO" | "ZH" | "RU";
  const voiceChannelId = String(args.voiceChannelId || "");
  const textChannelId = String(args.textChannelId || ctx.channelId);

  if (!voiceChannelId) return { success: false, data: "ID du salon vocal requis" };

  const member = ctx.message.member;
  if (!member?.voice.channelId) {
    return {
      success: false,
      data: "Tu dois être dans un salon vocal pour utiliser la traduction vocale.",
    };
  }

  const actualVoiceChannelId = voiceChannelId || member.voice.channelId;
  const guild = ctx.message.guild;
  if (!guild) return { success: false, data: "Serveur introuvable" };

  const result = await startVoiceTranslation(
    ctx.client,
    guild.id,
    actualVoiceChannelId,
    ctx.userId,
    ctx.message.author.username,
    targetLang,
    guild.voiceAdapterCreator as unknown,
    textChannelId,
  );

  return { success: result.success, data: result.message };
}

async function toolStopVoiceTranslation(ctx: ToolContext): Promise<ToolCallResult> {
  const result = await stopVoiceTranslation(ctx.userId);
  return { success: result.success, data: result.message };
}

// ─── Community Digest ─────────────────────────────────────────────────────────

async function toolEnableDigest(
  args: Record<string, unknown>,
  ctx: ToolContext,
): Promise<ToolCallResult> {
  const frequency = String(args.frequency || "daily") as "daily" | "weekly";
  const channelId = String(args.channelId || ctx.channelId);
  const sendHour =
    args.sendHour !== undefined ? Math.min(23, Math.max(0, Number(args.sendHour))) : 9;

  if (!ctx.guildId) return { success: false, data: "Commande serveur uniquement" };

  setDigestConfig(ctx.guildId, {
    enabled: true,
    frequency,
    channelId,
    sendHour,
    guildId: ctx.guildId,
  });

  const freqLabel = frequency === "daily" ? "quotidien" : "hebdomadaire";
  return {
    success: true,
    data: `✅ Digest ${freqLabel} activé pour ce serveur. Envoi à ${sendHour}h dans <#${channelId}>. Utilise disable_digest pour désactiver.`,
  };
}

async function toolDisableDigest(ctx: ToolContext): Promise<ToolCallResult> {
  if (!ctx.guildId) return { success: false, data: "Commande serveur uniquement" };

  setDigestConfig(ctx.guildId, { enabled: false });
  return { success: true, data: "✅ Digest communautaire désactivé pour ce serveur." };
}

// ─── Password Generator ───────────────────────────────────────────────────────

async function toolGeneratePassword(args: Record<string, unknown>): Promise<ToolCallResult> {
  const count = args.count !== undefined ? Math.min(10, Math.max(1, Number(args.count))) : 1;
  const options = {
    length: args.length !== undefined ? Math.min(128, Math.max(4, Number(args.length))) : 16,
    uppercase: args.uppercase !== false,
    lowercase: args.lowercase !== false,
    numbers: args.numbers !== false,
    symbols: args.symbols !== false,
    excludeAmbiguous: args.excludeAmbiguous === true,
  };

  const passwords = generateMultiplePasswords(options, count);

  const lines = passwords.map(
    (p, i) =>
      `${count > 1 ? `**${i + 1}.** ` : ""}\`${p.password}\`\n` +
      `Entropie: **${p.entropyBits} bits** — Force: **${p.strengthLabel}**`,
  );

  const warning =
    "\n\n⚠️ **Ce mot de passe n'est pas stocké par le bot.** Copie-le maintenant — il ne sera plus accessible ensuite.";

  return {
    success: true,
    data: `${lines.join("\n\n")}${warning}`,
  };
}

// ─── Temporary Email ──────────────────────────────────────────────────────────

async function toolCreateTempEmail(): Promise<ToolCallResult> {
  try {
    const account = await createTempEmail();
    return {
      success: true,
      data:
        `📧 **Email temporaire créé**\n` +
        `Adresse: \`${account.address}\`\n` +
        `Fournisseur: ${account.provider}\n` +
        `ID: \`${account.providerId}\`\n\n` +
        `Pour vérifier la boîte, utilise \`check_temp_email\` avec:\n` +
        `- address: \`${account.address}\`\n` +
        `- providerId: \`${account.providerId}\`\n` +
        `- provider: \`${account.provider}\`\n\n` +
        PRIVACY_WARNING,
    };
  } catch (err) {
    return {
      success: false,
      data: `Erreur: ${err instanceof Error ? err.message : String(err)}`,
    };
  }
}

async function toolCheckTempEmail(args: Record<string, unknown>): Promise<ToolCallResult> {
  const address = String(args.address || "").trim();
  const providerId = String(args.providerId || "").trim();
  const provider = String(args.provider || "").trim() as "mail.tm" | "1secmail";

  if (!address || !providerId || !provider) {
    return { success: false, data: "Paramètres manquants: address, providerId, provider requis" };
  }

  try {
    const account = { address, providerId, provider };
    const messages = await checkTempEmailInbox(account);

    if (messages.length === 0) {
      return {
        success: true,
        data: `📭 Aucun message reçu sur \`${address}\`.\n\n${PRIVACY_WARNING}`,
      };
    }

    const lines = messages.map(
      (m) =>
        `**De:** ${m.from}\n**Sujet:** ${m.subject}\n**Date:** ${m.date}\n\`\`\`${m.body.slice(0, 500)}\`\`\``,
    );

    return {
      success: true,
      data: `📬 **${messages.length} message(s)** sur \`${address}\`:\n\n${lines.join("\n\n")}\n\n${PRIVACY_WARNING}`,
    };
  } catch (err) {
    return {
      success: false,
      data: `Erreur: ${err instanceof Error ? err.message : String(err)}`,
    };
  }
}

// ─── OCR: Extract text from image via Gemini Vision ──────────────────────────

async function toolExtractTextFromImage(args: Record<string, unknown>): Promise<ToolCallResult> {
  const imageUrl = String(args.imageUrl ?? "").trim();
  if (!imageUrl) return { success: false, data: "URL d'image requise" };
  if (!isGeminiAvailable())
    return { success: false, data: "Gemini API non configuré (clé API manquante)" };

  try {
    const text = await analyzeImageWithGemini(
      imageUrl,
      "Extrais tout le texte visible dans cette image, exactement tel qu'il apparaît. Préserve la mise en forme (lignes, paragraphes). S'il n'y a pas de texte, réponds 'Aucun texte détecté'.",
    );
    if (!text)
      return { success: false, data: "Analyse impossible (image inaccessible ou erreur API)" };
    return { success: true, data: `📝 Texte extrait:\n\n${text.slice(0, 1800)}` };
  } catch (err) {
    return {
      success: false,
      data: `Erreur OCR: ${err instanceof Error ? err.message : String(err)}`,
    };
  }
}

// ─── Compose image: generate + optional background removal ───────────────────

async function toolComposeImage(args: Record<string, unknown>): Promise<ToolCallResult> {
  const prompt = String(args.prompt ?? "").trim();
  if (!prompt) return { success: false, data: "Prompt requis" };
  const width = Number(args.width) || 1024;
  const height = Number(args.height) || 1024;
  const doRemoveBg = Boolean(args.removeBackground);

  try {
    const imageUrl = await generateImage(prompt, width, height);
    if (!imageUrl) return { success: false, data: "Génération d'image échouée" };

    if (doRemoveBg) {
      const bgResult = await removeBackground(imageUrl);
      if (bgResult) {
        return {
          success: true,
          data: `🎨 Image générée et détourée (${bgResult.creditsUsed} crédits Remove.bg):\n${bgResult.resultUrl.slice(0, 200)}`,
        };
      }
      return {
        success: true,
        data: `🎨 Image générée (fond non supprimé — Remove.bg indisponible):\n${imageUrl}`,
      };
    }

    return { success: true, data: `🎨 Image générée:\n${imageUrl}` };
  } catch (err) {
    return {
      success: false,
      data: `Erreur compose_image: ${err instanceof Error ? err.message : String(err)}`,
    };
  }
}

// ─── Minecraft LLM Agent tool implementations ────────────────────────────────

async function toolMcAgentConnect(args: Record<string, unknown>): Promise<ToolCallResult> {
  const { isAgentAvailable, pingAgent, getUrl } = await import("./mineflayerAgent.js");
  if (!isAgentAvailable()) {
    return {
      success: false,
      data: "❌ L'agent Mineflayer n'est pas disponible. Le notebook Colab `mineflayer_agent.ipynb` doit être lancé d'abord. Demande à l'utilisateur de démarrer le notebook Colab.",
    };
  }
  const server = String(args.server || "").trim();
  if (!server) {
    return {
      success: false,
      data: "❌ Aucune adresse serveur fournie. Demande à l'utilisateur l'IP:port de son serveur ou monde LAN.",
    };
  }
  // Validate server format: only allow hostname/IP + optional port (no shell injection)
  const serverRegex = /^[a-zA-Z0-9._-]+(:\d{1,5})?$/;
  if (!serverRegex.test(server)) {
    return {
      success: false,
      data: `❌ Format de serveur invalide: \`${server}\`. Attendu: IP:port (ex: 123.45.67.89:25565 ou play.mcraft.fr:25565).`,
    };
  }
  const username = String(args.username || "LLM_Bot")
    .trim()
    .slice(0, 16);
  // Validate username: only alphanumeric + underscore (Minecraft username rules)
  if (!/^[a-zA-Z0-9_]+$/.test(username)) {
    return {
      success: false,
      data: `❌ Pseudo invalide: \`${username}\`. Seuls les caractères alphanumériques et _ sont autorisés.`,
    };
  }
  const alive = await pingAgent();
  if (!alive) {
    return {
      success: false,
      data: `❌ L'agent Mineflayer ne répond pas. Vérifie que le notebook Colab est bien lancé.`,
    };
  }
  // Use the /connect endpoint to hot-swap the Mineflayer bot to the new server
  try {
    const agentUrl = getUrl();
    if (!agentUrl) {
      return { success: false, data: "❌ URL de l'agent introuvable" };
    }
    const { fetchWithRetry } = await import("../utils/httpClient.js");
    const result = await fetchWithRetry(`${agentUrl}/connect`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: { server, username },
      timeoutMs: 30_000,
      retries: 1,
      parseJson: true,
    });
    if (result?.success) {
      return {
        success: true,
        data: `✅ Bot connecté à \`${server}\` en tant que **${username}**! ${result.message || ""}`,
      };
    }
    return {
      success: false,
      data: `❌ Échec de connexion à ${server}: ${result?.message || result?.error || "erreur inconnue"}`,
    };
  } catch (err) {
    return { success: false, data: `Erreur connexion MC: ${err}` };
  }
}

async function toolMcAgentGoal(args: Record<string, unknown>): Promise<ToolCallResult> {
  const { isAgentAvailable, setAgentGoal } = await import("./mineflayerAgent.js");
  if (!isAgentAvailable()) {
    return {
      success: false,
      data: "❌ Agent Mineflayer non disponible. Démarre le notebook Colab d'abord.",
    };
  }
  const goal = String(args.goal || "")
    .trim()
    .slice(0, 500);
  if (!goal) return { success: false, data: "❌ Aucun objectif fourni" };
  const maxActions = Math.min(200, Math.max(1, Number(args.maxActions) || 50));
  const result = await setAgentGoal(goal, maxActions);
  return { success: result.success, data: result.message };
}

async function toolMcAgentStatus(): Promise<ToolCallResult> {
  const { isAgentAvailable, getAgentStatus, formatAgentStatus } =
    await import("./mineflayerAgent.js");
  if (!isAgentAvailable()) {
    return { success: false, data: "❌ Agent Mineflayer non disponible (Colab éteint ?)" };
  }
  const status = await getAgentStatus();
  if (!status) return { success: false, data: "❌ Impossible de contacter l'agent" };
  return { success: true, data: formatAgentStatus(status) };
}

async function toolMcAgentWorld(): Promise<ToolCallResult> {
  const { isAgentAvailable, getWorldState, formatWorldState } =
    await import("./mineflayerAgent.js");
  if (!isAgentAvailable()) {
    return { success: false, data: "❌ Agent Mineflayer non disponible" };
  }
  const world = await getWorldState();
  if (!world) return { success: false, data: "❌ Impossible de récupérer l'état du monde" };
  return { success: true, data: formatWorldState(world) };
}

async function toolMcAgentAction(args: Record<string, unknown>): Promise<ToolCallResult> {
  const { isAgentAvailable, QUICK_ACTIONS } = await import("./mineflayerAgent.js");
  if (!isAgentAvailable()) {
    return { success: false, data: "❌ Agent Mineflayer non disponible" };
  }
  const actionName = String(args.action || "") as keyof typeof QUICK_ACTIONS;
  const actionFn = QUICK_ACTIONS[actionName];
  if (!actionFn) return { success: false, data: `❌ Action inconnue: ${actionName}` };
  const result = await actionFn();
  return result
    ? { success: result.success, data: `⚡ ${actionName}: ${result.message}` }
    : { success: false, data: `❌ ${actionName} a échoué` };
}

async function toolMcAgentChat(args: Record<string, unknown>): Promise<ToolCallResult> {
  const { isAgentAvailable, sendAgentChat } = await import("./mineflayerAgent.js");
  if (!isAgentAvailable()) {
    return { success: false, data: "❌ Agent Mineflayer non disponible" };
  }
  const message = String(args.message || "")
    .trim()
    .slice(0, 256);
  if (!message) return { success: false, data: "❌ Aucun message fourni" };
  const result = await sendAgentChat(message);
  return { success: result.success, data: result.message };
}

async function toolMcAgentStop(): Promise<ToolCallResult> {
  const { isAgentAvailable, stopAgent } = await import("./mineflayerAgent.js");
  if (!isAgentAvailable()) {
    return { success: false, data: "❌ Agent Mineflayer non disponible" };
  }
  const result = await stopAgent();
  return { success: result.success, data: result.message };
}

async function toolMcAgentLog(args: Record<string, unknown>): Promise<ToolCallResult> {
  const { isAgentAvailable, getAgentLog } = await import("./mineflayerAgent.js");
  if (!isAgentAvailable()) {
    return { success: false, data: "❌ Agent Mineflayer non disponible" };
  }
  const lines = Math.min(100, Math.max(1, Number(args.lines) || 20));
  const log = await getAgentLog(lines);
  if (!log) return { success: false, data: "❌ Aucun log disponible" };
  return { success: true, data: log.slice(-1900) };
}
