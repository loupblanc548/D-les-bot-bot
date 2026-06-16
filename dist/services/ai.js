"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.getOpenAIClient = getOpenAIClient;
exports.chatWithAI = chatWithAI;
exports.handleMention = handleMention;
const logger_1 = __importDefault(require("../utils/logger"));
const config_1 = require("../config");
const openai_1 = __importDefault(require("openai"));
let openai = null;
function getOpenAIClient() {
    if (!openai) {
        openai = new openai_1.default({
            baseURL: config_1.config.openRouterBaseUrl,
            apiKey: config_1.config.openRouterApiKey,
            defaultHeaders: {
                "HTTP-Referer": "https://discord.com",
                "X-Title": "Discord Surveillance Bot",
            },
            timeout: config_1.config.aiTimeoutMs,
            maxRetries: 2,
        });
    }
    return openai;
}
async function chatWithAI(message, username) {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), config_1.config.aiTimeoutMs);
    try {
        const client = getOpenAIClient();
        const contextMessage = username
            ? `L'utilisateur Discord "${username}" dit : ${message}`
            : message;
        const completion = await client.chat.completions.create({
            model: config_1.config.openRouterModel,
            messages: [
                { role: "system", content: config_1.config.aiSystemPrompt },
                { role: "user", content: contextMessage },
            ],
            max_tokens: 1000,
            temperature: 0.7,
        }, { signal: controller.signal });
        return completion.choices[0]?.message?.content || "Desole, je n'ai pas pu generer de reponse.";
    }
    catch (error) {
        logger_1.default.error("OpenRouter API error:", String(error));
        if (error.name === "AbortError") {
            return "❌ La reponse de l'IA a pris trop de temps. Reessayez.";
        }
        return "❌ Erreur lors de la communication avec l'IA.";
    }
    finally {
        clearTimeout(timeout);
    }
}
async function handleMention(message, authorName) {
    const mentionMatch = message.match(/^@(\S+)/);
    if (!mentionMatch)
        return null;
    const mentionedUser = mentionMatch[1];
    const cleanMessage = message.replace(/^@\S+\s*/, "");
    if (!cleanMessage)
        return null;
    return chatWithAI(`Tu t'adresses a @${mentionedUser}. ${cleanMessage}`, authorName);
}
//# sourceMappingURL=ai.js.map