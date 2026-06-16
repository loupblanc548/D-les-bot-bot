"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.clearToxicityCache = clearToxicityCache;
exports.analyzeToxicity = analyzeToxicity;
const logger_1 = __importDefault(require("../utils/logger"));
const ai_1 = require("./ai");
const config_1 = require("../config");
const TOXICITY_CACHE = new Map();
const CACHE_TTL = 60_000;
function clearToxicityCache() {
    TOXICITY_CACHE.clear();
}
async function analyzeToxicity(content) {
    const cacheKey = content.slice(0, 200);
    const cached = TOXICITY_CACHE.get(cacheKey);
    if (cached && Date.now() - cached.timestamp < CACHE_TTL) {
        return cached.result;
    }
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), config_1.config.aiModerationTimeoutMs);
    try {
        const client = (0, ai_1.getOpenAIClient)();
        const completion = await client.chat.completions.create({
            model: config_1.config.openRouterModel,
            messages: [
                {
                    role: "system",
                    content: "Tu es un modérateur de contenu. Analyse le message et réponds UNIQUEMENT avec un objet JSON " +
                        'au format : {"isToxic": true/false, "category": "normal|insult|hate_speech|harassment|spam|inappropriate", ' +
                        '"confidence": 0.0-1.0, "explanation": "courte explication en français"}. ' +
                        "Ne mets pas le JSON dans un bloc de code. Sois strict mais pas excessif : " +
                        "les jurons légers sans attaque personnelle ne sont pas toxiques.",
                },
                { role: "user", content },
            ],
            max_tokens: 200,
            temperature: 0.1,
        }, { signal: controller.signal });
        const raw = completion.choices[0]?.message?.content?.trim() || "";
        const parsed = JSON.parse(raw);
        const result = {
            isToxic: parsed.isToxic || false,
            category: parsed.category || "normal",
            confidence: parsed.confidence || 0,
            explanation: parsed.explanation || "",
        };
        TOXICITY_CACHE.set(cacheKey, { result, timestamp: Date.now() });
        if (TOXICITY_CACHE.size > 500) {
            const now = Date.now();
            for (const [k, v] of TOXICITY_CACHE) {
                if (now - v.timestamp > CACHE_TTL)
                    TOXICITY_CACHE.delete(k);
            }
            if (TOXICITY_CACHE.size > 500) {
                const firstKey = TOXICITY_CACHE.keys().next().value;
                if (firstKey)
                    TOXICITY_CACHE.delete(firstKey);
            }
        }
        return result;
    }
    catch (error) {
        logger_1.default.error("[AI-Moderation] Erreur:", String(error));
        if (error.name === "AbortError") {
            return { isToxic: false, category: "normal", confidence: 0, explanation: "Timeout" };
        }
        return { isToxic: false, category: "normal", confidence: 0, explanation: "Erreur API" };
    }
    finally {
        clearTimeout(timeout);
    }
}
//# sourceMappingURL=ai-moderation.js.map