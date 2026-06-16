"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.getSupportedLanguages = getSupportedLanguages;
exports.getLanguageName = getLanguageName;
exports.translateText = translateText;
exports.summarizeMessages = summarizeMessages;
const logger_1 = __importDefault(require("../utils/logger"));
const ai_1 = require("./ai");
const config_1 = require("../config");
const SUPPORTED_LANGUAGES = {
    fr: "Français",
    en: "Anglais",
    es: "Espagnol",
    de: "Allemand",
    it: "Italien",
    pt: "Portugais",
    ru: "Russe",
    ja: "Japonais",
    ko: "Coréen",
    zh: "Chinois",
    ar: "Arabe",
    nl: "Néerlandais",
    pl: "Polonais",
    tr: "Turc",
    hi: "Hindi",
};
function getSupportedLanguages() {
    return SUPPORTED_LANGUAGES;
}
function getLanguageName(code) {
    return SUPPORTED_LANGUAGES[code] || code;
}
async function translateText(text, targetLang) {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), config_1.config.aiTimeoutMs);
    try {
        const client = (0, ai_1.getOpenAIClient)();
        const langName = getLanguageName(targetLang);
        const completion = await client.chat.completions.create({
            model: config_1.config.openRouterModel,
            messages: [
                {
                    role: "system",
                    content: `Tu es un traducteur professionnel. Traduis le texte fourni en ${langName}. Réponds UNIQUEMENT avec un objet JSON au format : {"translation": "texte traduit", "detectedSource": "code langue source (ex: fr, en, es)"}. Ne mets pas le JSON dans un bloc de code.`,
                },
                { role: "user", content: text },
            ],
            max_tokens: 4096,
            temperature: 0.3,
        }, { signal: controller.signal });
        const raw = completion.choices[0]?.message?.content?.trim() || "";
        let parsed;
        try {
            const cleaned = raw.replace(/^```(?:json)?\s*/, "").replace(/\s*```$/, "");
            parsed = JSON.parse(cleaned);
        }
        catch {
            return {
                translation: raw,
                detectedSource: "inconnue",
                targetLanguage: langName,
            };
        }
        return {
            translation: parsed.translation || raw,
            detectedSource: parsed.detectedSource || "inconnue",
            targetLanguage: langName,
        };
    }
    catch (error) {
        logger_1.default.error("[AI-Translate] Erreur:", String(error));
        if (error.name === "AbortError") {
            throw new Error("La traduction a pris trop de temps. Réessayez.");
        }
        throw new Error("Erreur lors de la traduction.");
    }
    finally {
        clearTimeout(timeout);
    }
}
async function summarizeMessages(messages) {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), config_1.config.aiSummarizeTimeoutMs);
    try {
        const client = (0, ai_1.getOpenAIClient)();
        const conversation = messages
            .map((m) => `[${m.author}]: ${m.content}`)
            .join("\n");
        const completion = await client.chat.completions.create({
            model: config_1.config.openRouterModel,
            messages: [
                {
                    role: "system",
                    content: "Tu es un assistant qui résume les conversations Discord de façon concise et structurée. " +
                        "Fais un résumé en français (5-10 lignes max) avec : les sujets principaux abordés, " +
                        "les décisions prises, et les points importants. Utilise des emojis et des tirets.",
                },
                {
                    role: "user",
                    content: `Résume cette conversation :\n\n${conversation}`,
                },
            ],
            max_tokens: 800,
            temperature: 0.5,
        }, { signal: controller.signal });
        return (completion.choices[0]?.message?.content ||
            "Impossible de générer un résumé.");
    }
    catch (error) {
        logger_1.default.error("[AI-Summarize] Erreur:", String(error));
        if (error.name === "AbortError") {
            throw new Error("Le résumé a pris trop de temps. Réessayez avec moins de messages.");
        }
        throw new Error("Erreur lors du résumé.");
    }
    finally {
        clearTimeout(timeout);
    }
}
//# sourceMappingURL=ai-extra.js.map