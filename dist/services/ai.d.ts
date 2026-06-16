import OpenAI from "openai";
export declare function getOpenAIClient(): OpenAI;
export declare function chatWithAI(message: string, username?: string): Promise<string>;
export declare function handleMention(message: string, authorName: string): Promise<string | null>;
//# sourceMappingURL=ai.d.ts.map