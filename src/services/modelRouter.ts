/**
 * modelRouter.ts — Routeur multi-modèles intelligent
 *
 * Classifie la requête utilisateur et sélectionne le modèle LLM optimal:
 * - Simple (salut, merci, question courte) → modèle gratuit/rapide
 * - Code/technique → modèle fort en code
 * - Analyse/raisonnement → modèle puissant
 * - Vision/image → Gemini
 * - Défaut → modèle configuré
 */

import { config } from "../config.js";
import { isNvidiaNimAvailable } from "./nvidiaNim.js";
import logger from "../utils/logger.js";

// ─── Model presets ───────────────────────────────────────────────────────────

// Ne jamais router vers un modèle NVIDIA si sa clé n'est pas configurée :
// l'agent l'enverrait alors à OpenRouter, où cet identifiant peut être invalide.
const providerModel = (nvidiaModel: string): string =>
  isNvidiaNimAvailable() ? nvidiaModel : config.openRouterModel;

interface ModelPreset {
  id: string;
  label: string;
  maxTokens: number;
  temperature: number;
}

const MODELS: Record<string, ModelPreset> = {
  fast: {
    id: providerModel("nvidia/nemotron-mini-4b-instruct"),
    label: "Nemotron Mini 4B (fast)",
    maxTokens: 800,
    temperature: 0.5,
  },
  balanced: {
    id: config.openRouterModel,
    label: "Default configured model (Llama 3.3 70B)",
    maxTokens: 1000,
    temperature: 0.7,
  },
  powerful: {
    id: providerModel("meta/llama-3.3-70b-instruct"),
    label: "Llama 3.3 70B (powerful, free)",
    maxTokens: 2000,
    temperature: 0.7,
  },
  code: {
    id: providerModel("meta/llama-3.3-70b-instruct"),
    label: "Llama 3.3 70B (code/complex)",
    maxTokens: 2000,
    temperature: 0.3,
  },
  vision: {
    id: providerModel("nvidia/nemotron-3-ultra-550b-a55b"),
    label: "Nemotron Ultra (vision via Gemini fallback)",
    maxTokens: 1500,
    temperature: 0.5,
  },
};

// ─── Classification patterns ─────────────────────────────────────────────────

type QueryCategory = "fast" | "balanced" | "powerful" | "code" | "vision";

const CODE_PATTERNS = [
  /\b(code|fonction|function|class|bug|error|stack trace|compile|typescript|javascript|python|java|c\+\+|rust|go\b|sql|regex|api|endpoint|algorithm|debug|refactor)\b/i,
  /\b(écris|crée|génère|write|create|generate)\b.*\b(code|script|function|classe|component|module)\b/i,
  /```/,
];

const VISION_PATTERNS = [
  // English
  /\b(image|photo|picture|screenshot|vision|analyz.*image|describ.*image|ocr|text.*image|what.*see|what.*in.*image|read.*image|look.*at)\b/i,
  // French
  /\b(image|photo|capture|capture.*écran|vision|analyse.*image|décris.*image|ocr|texte.*image|qu.*est-ce.*image|que.*voit|regarde.*image|lis.*image)\b/i,
  // German
  /\b(bild|foto|bildschirmfoto|screenshot|vision|analys.*bild|beschreib.*bild|ocr|text.*bild|was.*siehst|sieh.*dir.*an|lies.*bild)\b/i,
  // Spanish
  /\b(imagen|foto|captura.*pantalla|captura|vision|analiz.*imagen|describ.*imagen|ocr|texto.*imagen|qué.*ves|qué.*hay.*imagen|mira.*imagen|lee.*imagen)\b/i,
  // Portuguese
  /\b(imagem|foto|captura.*tela|captura|visão|analisa.*imagem|descrev.*imagem|ocr|texto.*imagem|o.*que.*vê|o.*que.*tem.*imagem|olha.*imagem|lê.*imagem)\b/i,
  // Italian
  /\b(immagine|foto|schermata|screenshot|visione|analizz.*immagine|descriv.*immagine|ocr|testo.*immagine|cosa.*vedi|cosa.*c.*è.*immagine|guarda.*immagine|leggi.*immagine)\b/i,
  // Dutch
  /\b(afbeelding|foto|schermafbeelding|screenshot|visie|analyseer.*afbeelding|beschrijf.*afbeelding|ocr|tekst.*afbeelding|wat.*zie|kijk.*naar|lees.*afbeelding)\b/i,
  // Swedish
  /\b(bild|foto|skärmdump|screenshot|vision|analysera.*bild|beskriv.*bild|ocr|text.*bild|vad.*ser|titta.*på|läs.*bild)\b/i,
  // Norwegian
  /\b(bilde|foto|skjermbilde|screenshot|visjon|analyser.*bilde|beskriv.*bilde|ocr|tekst.*bilde|hva.*ser|se.*på|les.*bilde)\b/i,
  // Czech
  /\b(obrázek|foto|snímek.*obrazovky|screenshot|videní|analyzuj.*obrázek|popiš.*obrázek|ocr|text.*obrázek|co.*vidíš|podívej.*se|přečti.*obrázek)\b/i,
  // Polish
  /\b(obraz|zdjęcie|zrzut.*ekranu|screenshot|wizja|analizuj.*obraz|opisz.*obraz|ocr|tekst.*obraz|co.*widzisz|spójrz.*na|przeczytaj.*obraz)\b/i,
  // Turkish
  /\b(resim|foto|ekran.*görüntüsü|screenshot|görüntü|analiz.*resim|açıkla.*resim|ocr|metin.*resim|ne.*görüyorsun|bak.*resme|resmi.*oku)\b/i,
  // Russian
  /\b(изображение|фото|скриншот|картинка|видение|анализ.*изображен|опиши.*изображен|ocr|текст.*изображен|что.*видишь|посмотри.*на|прочитай.*изображен)\b/i,
  // Japanese
  /\b(画像|写真|スクリーンショット|ビジョン|分析.*画像|説明.*画像|ocr|テキスト.*画像|何.*見える|見て|読んで)\b/i,
  // Chinese
  /\b(图片|照片|截图|视觉|分析.*图片|描述.*图片|ocr|文字.*图片|看到.*什么|看看|读取.*图片)\b/i,
  // Arabic
  /\b(صورة|صورة.*ملتقطة|لقطة.*شاشة|رؤية|تحليل.*صورة|وصف.*صورة|ocr|نص.*صورة|ماذا.*ترى|انظر|اقرأ.*صورة)\b/i,
  // Korean
  /\b(이미지|사진|스크린샷|비전|분석.*이미지|설명.*이미지|ocr|텍스트.*이미지|뭐.*보여|봐|읽어)\b/i,
  // Enriched content marker
  /\[Image jointe:/,
  /\[Description visuelle:/,
];

const COMPLEX_PATTERNS = [
  /\b(analyse complète|audit|rapport détaillé|comprehensive|deep dive|étude approfondie|investigation|thorough)\b/i,
  /\b(compare|comparison|contraste|différence entre|avantages.*inconvénients|pros.*cons)\b/i,
  /\b(plan|stratégie|strategy|architecture|design pattern|system design)\b/i,
  /\b(traduis|translate)\b.*\b(long|complet|document|article)\b/i,
];

const SIMPLE_PATTERNS = [
  /^(salut|bonjour|hello|hi|hey|coucou|merci|thanks|ok|d'accord|bye|au revoir|good night|bonne nuit)\b/i,
  /^(oui|non|yes|no|peut-être|maybe|sure|bien sûr)\b/i,
  /^.{1,30}\?$/, // Very short questions
];

// ─── Classifier ──────────────────────────────────────────────────────────────

export function classifyQuery(userMessage: string): QueryCategory {
  // Vision takes priority (image context)
  if (VISION_PATTERNS.some((p) => p.test(userMessage))) return "vision";

  // Code detection
  if (CODE_PATTERNS.some((p) => p.test(userMessage))) return "code";

  // Complex tasks
  if (COMPLEX_PATTERNS.some((p) => p.test(userMessage))) return "powerful";

  // Simple greetings / short questions
  if (SIMPLE_PATTERNS.some((p) => p.test(userMessage))) return "fast";

  // Default
  return "balanced";
}

// ─── Router ──────────────────────────────────────────────────────────────────

export interface RoutedModel {
  model: string;
  maxTokens: number;
  temperature: number;
  category: QueryCategory;
  label: string;
}

export function routeModel(userMessage: string): RoutedModel {
  const category = classifyQuery(userMessage);
  const preset = MODELS[category] ?? MODELS.balanced;

  logger.info(`[ModelRouter] Category: ${category} → Model: ${preset.label}`);

  return {
    model: preset.id,
    maxTokens: preset.maxTokens,
    temperature: preset.temperature,
    category,
    label: preset.label,
  };
}

/**
 * Override model for specific contexts (e.g. agent loop uses its own model).
 * Returns null if no override needed.
 */
export function getAgentLoopModel(userMessage: string): string | null {
  const routed = routeModel(userMessage);
  // Override for code, powerful, and vision categories
  if (
    routed.category === "code" ||
    routed.category === "powerful" ||
    routed.category === "vision"
  ) {
    return routed.model;
  }
  return null;
}
