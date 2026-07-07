import logger from "../utils/logger.js";
import { generate as ollamaGenerate, chat as ollamaChat, isOllamaAvailable } from "./ollama.js";

export interface AICharacter {
  id: string; name: string; personality: string; systemPrompt: string;
  speakingStyle: string; catchphrases: string[]; language: "fr" | "en";
  model: "openai" | "ollama"; temperature: number; emoji: string; color: string;
}

const CHARACTERS: Map<string, AICharacter> = new Map();

export function registerCharacter(char: AICharacter): void { CHARACTERS.set(char.id, char); logger.info(`[AICharacters] Registered: ${char.name}`); }
export function getCharacter(id: string): AICharacter | null { return CHARACTERS.get(id) || null; }
export function listCharacters(): AICharacter[] { return [...CHARACTERS.values()]; }

export async function generateAsCharacter(characterId: string, userMessage: string, history?: { role: string; content: string }[]): Promise<string> {
  const char = getCharacter(characterId);
  if (!char) return "Character not found.";
  const systemPrompt = `${char.systemPrompt}\n\nPersonality: ${char.personality}\nSpeaking style: ${char.speakingStyle}\nLanguage: ${char.language === "fr" ? "French" : "English"}\n${char.catchphrases.length > 0 ? `Catchphrases: ${char.catchphrases.join(", ")}` : ""}\n\nStay in character at all times.`;
  try {
    if (char.model === "ollama") {
      const available = await isOllamaAvailable();
      if (available) return await ollamaChat([{ role: "system", content: systemPrompt }, ...(history || []), { role: "user", content: userMessage }], { temperature: char.temperature });
    }
    const available = await isOllamaAvailable();
    if (available) return await ollamaGenerate(`${systemPrompt}\n\nUser: ${userMessage}`, { temperature: char.temperature });
    return char.catchphrases[Math.floor(Math.random() * char.catchphrases.length)] || "Désolé, indisponible.";
  } catch (err) {
    logger.error(`[AICharacters] Error for ${char.name}: ${err instanceof Error ? err.message : String(err)}`);
    return char.catchphrases[Math.floor(Math.random() * char.catchphrases.length)] || "Erreur.";
  }
}

registerCharacter({ id: "gamer", name: "GamerBot", personality: "Passionate gamer, competitive", systemPrompt: "You are GamerBot, an expert gaming companion.", speakingStyle: "Casual, gaming terminology", catchphrases: ["GG EZ", "Skill issue", "Git gud"], language: "fr", model: "openai", temperature: 0.8, emoji: "🎮", color: "#5865F2" });
registerCharacter({ id: "moderator", name: "ModBot", personality: "Strict but fair moderator", systemPrompt: "You are ModBot, a Discord moderation assistant.", speakingStyle: "Professional, clear", catchphrases: ["Let's keep it civil", "Rules are rules"], language: "fr", model: "openai", temperature: 0.3, emoji: "🛡️", color: "#ED4245" });
registerCharacter({ id: "analyst", name: "DataBot", personality: "Analytical, data-driven", systemPrompt: "You are DataBot, a data analyst assistant.", speakingStyle: "Precise, analytical", catchphrases: ["The data shows...", "Based on the metrics"], language: "fr", model: "openai", temperature: 0.5, emoji: "📊", color: "#57F287" });
registerCharacter({ id: "osint", name: "ReconBot", personality: "Mysterious, security-focused", systemPrompt: "You are ReconBot, an OSINT and cybersecurity specialist.", speakingStyle: "Technical, mysterious", catchphrases: ["Stay vigilant", "Intelligence gathered"], language: "fr", model: "ollama", temperature: 0.6, emoji: "🔍", color: "#EB459E" });
registerCharacter({ id: "casual", name: "ChillBot", personality: "Relaxed, friendly", systemPrompt: "You are ChillBot, a relaxed chat companion.", speakingStyle: "Casual, uses emojis", catchphrases: ["No worries!", "That's pretty cool"], language: "fr", model: "openai", temperature: 0.9, emoji: "😎", color: "#FEE75C" });
