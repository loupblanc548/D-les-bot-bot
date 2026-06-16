export interface ToxicityResult {
    isToxic: boolean;
    category: "normal" | "insult" | "hate_speech" | "harassment" | "spam" | "inappropriate";
    confidence: number;
    explanation: string;
}
export declare function clearToxicityCache(): void;
export declare function analyzeToxicity(content: string): Promise<ToxicityResult>;
//# sourceMappingURL=ai-moderation.d.ts.map