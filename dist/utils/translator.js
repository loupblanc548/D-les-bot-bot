"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.SUPPORTED_LANGUAGES = void 0;
exports.checkCircuitBreaker = checkCircuitBreaker;
exports.banMyMemory = banMyMemory;
exports.translateAutoToFrench = translateAutoToFrench;
exports.translateText = translateText;
exports.translateFrenchToEnglish = translateFrenchToEnglish;
exports.translateToFrench = translateToFrench;
exports.translateBatchToFrench = translateBatchToFrench;
exports.isLikelyEnglish = isLikelyEnglish;
exports.getCircuitBreakerState = getCircuitBreakerState;
exports.resetCircuitBreaker = resetCircuitBreaker;
const logger_1 = __importDefault(require("./logger"));
/**
 * Service de traduction intelligent avec Circuit Breaker (Disjoncteur réseau)
 *
 * Plan A: MyMemory API (gratuit pour volumes standards)
 *   └─ Circuit Breaker: si 429 ou timeout → bannissement 1h, skip immédiat
 * Plan B: OpenRouter API (failover si MyMemory échoue ou banni)
 *   └─ Prompt système intraitable: Markdown Discord, jargon gaming, texte brut
 *
 * Support multi-langues et traduction inversée
 */
// ─── Circuit Breaker State ───────────────────────────────────────────────────
let isMyMemoryBanned = false;
let banTimestamp = 0;
const BAN_DURATION_MS = 60 * 60 * 1000; // 1 heure
/**
 * Vérifie et met à jour l'état du Circuit Breaker.
 * Si banni et 1h écoulée → réinitialise (repasse à false).
 * @returns true si MyMemory est actuellement banni
 */
/**
 * @internal Test-only export — vérifie et met à jour l'état du Circuit Breaker.
 * Si banni et 1h écoulée → réinitialise (repasse à false).
 * @returns true si MyMemory est actuellement banni
 */
function checkCircuitBreaker() {
    if (!isMyMemoryBanned)
        return false;
    const elapsed = Date.now() - banTimestamp;
    if (elapsed >= BAN_DURATION_MS) {
        // Réinitialisation automatique après 1h
        isMyMemoryBanned = false;
        banTimestamp = 0;
        logger_1.default.info("[CircuitBreaker] Bannissement MyMemory levé après 1h — réactivation");
        return false;
    }
    const remainingMinutes = Math.ceil((BAN_DURATION_MS - elapsed) / 60000);
    logger_1.default.warn(`[CircuitBreaker] MyMemory toujours banni — ${remainingMinutes}min restantes avant réessai`);
    return true;
}
/**
 * Bannit MyMemory pour 1h et loggue un avertissement critique.
 */
/**
 * @internal Test-only export — bannit MyMemory pour 1h et loggue un avertissement critique.
 */
function banMyMemory(reason) {
    isMyMemoryBanned = true;
    banTimestamp = Date.now();
    logger_1.default.error(`[CircuitBreaker] ⚠️ MyMemory BANNI pour 1h — raison: ${reason}`);
}
/**
 * Codes de langues supportés (ISO 639-1)
 */
exports.SUPPORTED_LANGUAGES = {
    'fr': 'Français',
    'en': 'English',
    'es': 'Español',
    'de': 'Deutsch',
    'it': 'Italiano',
    'pt': 'Português',
    'ru': 'Русский',
    'ja': '日本語',
    'ko': '한국어',
    'zh': '中文',
    'ar': 'العربية',
    'hi': 'हिन्दी',
    'tr': 'Türkçe',
    'pl': 'Polski',
    'nl': 'Nederlands',
    'sv': 'Svenska',
    'da': 'Dansk',
    'no': 'Norsk',
    'fi': 'Suomi',
    'el': 'Ελληνικά',
    'he': 'עברית',
    'th': 'ไทย',
    'vi': 'Tiếng Việt',
    'id': 'Bahasa Indonesia',
    'ms': 'Bahasa Melayu',
    'uk': 'Українська',
    'cs': 'Čeština',
    'ro': 'Română',
    'hu': 'Magyar',
    'bg': 'Български',
    'sk': 'Slovenčina',
    'hr': 'Hrvatski',
    'sr': 'Српски',
    'sl': 'Slovenščina',
    'lt': 'Lietuvių',
    'lv': 'Latviešu',
    'et': 'Eesti',
    'is': 'Íslenska',
    'mt': 'Malti',
    'ga': 'Gaeilge',
    'cy': 'Cymraeg',
    'bn': 'বাংলা',
    'ta': 'தமிழ்',
    'te': 'తెలుగు',
    'mr': 'मराठी',
    'gu': 'ગુજરાતી',
    'kn': 'ಕನ್ನಡ',
    'ml': 'മലയാളം',
    'fa': 'فارسی',
    'ur': 'اردو',
    'az': 'Azərbaycan',
    'ka': 'ქართული',
    'hy': 'Հայերեն',
    'kk': 'Қазақша',
    'ky': 'Кыргызча',
    'uz': "Oʻzbekcha",
    'mn': 'Монгол',
    'ne': 'नेपाली',
    'si': 'සිංහල',
    'my': 'မြန်မာ',
    'km': 'ខ្មែរ',
    'lo': 'ລາວ',
    'am': 'አማርኛ',
    'sw': 'Kiswahili',
    'zu': 'isiZulu',
    'xh': 'isiXhosa',
    'af': 'Afrikaans',
    'sq': 'Shqip',
    'mk': 'Македонски',
    'be': 'Беларуская',
    'bs': 'Bosanski',
    'me': 'Crnogorski',
    'lb': 'Lëtzebuergesch',
    'fo': 'Føroyskt',
};
// ─── API Publique ────────────────────────────────────────────────────────────
/**
 * Traduit automatiquement un texte vers le français avec système de failover
 */
async function translateAutoToFrench(text) {
    return translateText(text, "fr");
}
/**
 * Traduit un texte vers une langue cible avec Circuit Breaker + Failover
 */
async function translateText(text, targetLang, sourceLang = "auto") {
    if (!text || text.trim().length === 0) {
        return null;
    }
    // Si sourceLang = targetLang, ne pas traduire
    if (sourceLang !== "auto" && sourceLang === targetLang) {
        return {
            translatedText: text,
            detectedLanguage: sourceLang
        };
    }
    // Si le texte est déjà dans la langue cible, ne pas traduire
    if (sourceLang === "auto" && targetLang === "fr" && containsFrench(text)) {
        return {
            translatedText: text,
            detectedLanguage: "fr"
        };
    }
    // ── PLAN A: MyMemory API (avec Circuit Breaker) ──────────────────────
    const isBanned = checkCircuitBreaker();
    if (!isBanned) {
        try {
            const myMemoryResult = await translateWithMyMemory(text, sourceLang, targetLang);
            if (myMemoryResult) {
                return myMemoryResult;
            }
        }
        catch (error) {
            const errMsg = error instanceof Error ? error.message : String(error);
            logger_1.default.warn(`[Translator] MyMemory API échouée: ${errMsg}`);
            // Si 429 ou timeout → Circuit Breaker: bannir 1h
            if (errMsg.includes("429") || errMsg.includes("quota") || errMsg.includes("timeout")) {
                banMyMemory(errMsg);
            }
        }
    }
    else {
        logger_1.default.info("[Translator] MyMemory banni (Circuit Breaker) → basculement direct sur OpenRouter");
    }
    // ── PLAN B: OpenRouter API (Failover) ────────────────────────────────
    try {
        const openRouterResult = await translateWithOpenRouter(text, sourceLang, targetLang);
        if (openRouterResult) {
            return openRouterResult;
        }
    }
    catch (error) {
        logger_1.default.error(`[Translator] OpenRouter API échouée également: ${error instanceof Error ? error.message : String(error)}`);
    }
    // ── SÉCURITÉ ULTIME: Retourner le texte original si tout échoue ─────
    logger_1.default.warn(`[Translator] Tous les services de traduction échoués, utilisation texte original`);
    return {
        translatedText: text,
        detectedLanguage: sourceLang === "auto" ? "unknown" : sourceLang
    };
}
/**
 * Traduit du français vers l'anglais (traduction inversée)
 */
async function translateFrenchToEnglish(text) {
    return translateText(text, "en", "fr");
}
// ─── Plan A: MyMemory ────────────────────────────────────────────────────────
async function translateWithMyMemory(text, sourceLang = "auto", targetLang = "fr") {
    try {
        const url = `https://api.mymemory.translated.net/get?q=${encodeURIComponent(text)}&langpair=${sourceLang}|${targetLang}`;
        const response = await fetch(url, {
            method: 'GET',
            headers: {
                'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36'
            },
            signal: AbortSignal.timeout(10000)
        });
        if (!response.ok) {
            if (response.status === 429) {
                throw new Error("MyMemory quota épuisé (429)");
            }
            throw new Error(`MyMemory HTTP error: ${response.status}`);
        }
        const data = await response.json();
        if (data.responseStatus === 200 && data.responseData?.translatedText) {
            const translatedText = data.responseData.translatedText;
            const detectedLanguage = data.responseData.detectedLanguage || (sourceLang === "auto" ? "auto" : sourceLang);
            logger_1.default.debug(`[Translator] MyMemory ✓: "${text.slice(0, 30)}..." → "${translatedText.slice(0, 30)}..."`);
            return {
                translatedText,
                detectedLanguage
            };
        }
        else {
            throw new Error(`MyMemory response invalid: ${JSON.stringify(data)}`);
        }
    }
    catch (error) {
        if (error instanceof Error) {
            if (error.name === 'AbortError') {
                throw new Error("MyMemory timeout");
            }
            throw error;
        }
        throw new Error("MyMemory unknown error");
    }
}
// ─── Plan B: OpenRouter (Failover) ───────────────────────────────────────────
async function translateWithOpenRouter(text, sourceLang = "auto", targetLang = "fr") {
    const apiKey = process.env.OPENROUTER_API_KEY;
    if (!apiKey) {
        throw new Error("OPENROUTER_API_KEY non configurée");
    }
    const targetLanguageName = exports.SUPPORTED_LANGUAGES[targetLang] || targetLang;
    const sourceLanguageName = sourceLang === "auto" ? "la langue détectée" : (exports.SUPPORTED_LANGUAGES[sourceLang] || sourceLang);
    try {
        const response = await fetch("https://openrouter.ai/api/v1/chat/completions", {
            method: 'POST',
            headers: {
                'Authorization': `Bearer ${apiKey}`,
                'Content-Type': 'application/json',
                'HTTP-Referer': 'https://discord-bot.com',
                'X-Title': 'Discord Translation Bot'
            },
            body: JSON.stringify({
                model: 'meta-llama/llama-3-8b-instruct:free',
                messages: [
                    {
                        role: 'system',
                        content: `Tu es un traducteur expert. Traduis le texte de ${sourceLanguageName} vers ${targetLanguageName}. RÈGLES INTRAITABLES:\n1. Conserve TOUTE la mise en forme Markdown Discord (gras **, italique *, listes -, code \`\`\`, liens [texte](url)).\n2. Préserve le jargon technique/gaming (ex: "FPS drops", "nerf", "buff", "patch", "hotfix", "DPS").\n3. Ne renvoie UNIQUEMENT que le texte brut traduit — pas d'introduction, de commentaire, de guillemets, ni d'explication.\n4. Si le texte est déjà en ${targetLanguageName}, renvoie-le TEL QUEL sans modification.`
                    },
                    {
                        role: 'user',
                        content: text
                    }
                ],
                max_tokens: 500,
                temperature: 0.3
            }),
            signal: AbortSignal.timeout(15000)
        });
        if (!response.ok) {
            throw new Error(`OpenRouter HTTP error: ${response.status}`);
        }
        const data = await response.json();
        if (data.choices && data.choices[0]?.message?.content) {
            const translatedText = data.choices[0].message.content.trim();
            logger_1.default.debug(`[Translator] OpenRouter ✓: "${text.slice(0, 30)}..." → "${translatedText.slice(0, 30)}..."`);
            return {
                translatedText,
                detectedLanguage: sourceLang === "auto" ? "auto" : sourceLang
            };
        }
        else {
            throw new Error("OpenRouter response invalid");
        }
    }
    catch (error) {
        if (error instanceof Error) {
            if (error.name === 'AbortError') {
                throw new Error("OpenRouter timeout");
            }
            throw error;
        }
        throw new Error("OpenRouter unknown error");
    }
}
// ─── Utilitaires ─────────────────────────────────────────────────────────────
/**
 * Traduit un texte de l'anglais vers le français (legacy)
 */
async function translateToFrench(text) {
    const result = await translateAutoToFrench(text);
    return result?.translatedText || text;
}
/**
 * Détection simple si le texte contient déjà du français
 */
function containsFrench(text) {
    const frenchIndicators = [
        'le ', 'la ', 'les ', 'un ', 'une ', 'des ', 'du ', 'au ',
        'et ', 'ou ', 'mais ', 'pour ', 'avec ', 'sans ', 'sur ',
        'dans ', 'par ', 'pour ', 'avec ', 'sans ', 'sur ', 'sous ',
        'être ', 'avoir ', 'faire ', 'aller ', 'venir ', 'voir ',
        'pas ', 'plus ', 'moins ', 'très ', 'bien ', 'aussi ',
        "c'est ", 'il ', 'elle ', 'nous ', 'vous ', 'ils ', 'elles '
    ];
    const lowerText = text.toLowerCase();
    return frenchIndicators.some(indicator => lowerText.includes(indicator));
}
/**
 * Traduit un tableau de textes en parallèle
 */
async function translateBatchToFrench(texts) {
    const translations = await Promise.all(texts.map(text => translateToFrench(text)));
    return translations;
}
/**
 * Vérifie si un texte est principalement en anglais
 */
function isLikelyEnglish(text) {
    const englishIndicators = [
        'the ', 'and ', 'or ', 'but ', 'for ', 'with ', 'without ',
        'on ', 'in ', 'at ', 'to ', 'from ', 'by ', 'about ',
        'this ', 'that ', 'these ', 'those ', 'is ', 'are ', 'was ',
        'were ', 'be ', 'been ', 'being ', 'have ', 'has ', 'had ',
        'will ', 'would ', 'could ', 'should ', 'may ', 'might ',
        'can ', 'cannot ', 'not ', 'no ', 'yes ', 'very ', 'much '
    ];
    const lowerText = text.toLowerCase();
    const englishCount = englishIndicators.filter(indicator => lowerText.includes(indicator)).length;
    return englishCount >= 2;
}
/**
 * Retourne l'état actuel du Circuit Breaker (pour monitoring/debug)
 */
function getCircuitBreakerState() {
    if (!isMyMemoryBanned)
        return { banned: false, remainingMs: 0 };
    const remaining = Math.max(0, BAN_DURATION_MS - (Date.now() - banTimestamp));
    return { banned: true, remainingMs: remaining };
}
/**
 * Réinitialise manuellement le Circuit Breaker (commande debug/admin)
 */
function resetCircuitBreaker() {
    isMyMemoryBanned = false;
    banTimestamp = 0;
    logger_1.default.info("[CircuitBreaker] Réinitialisation manuelle effectuée");
}
//# sourceMappingURL=translator.js.map