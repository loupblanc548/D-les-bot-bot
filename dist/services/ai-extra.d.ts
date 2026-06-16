declare const SUPPORTED_LANGUAGES: Record<string, string>;
export declare function getSupportedLanguages(): typeof SUPPORTED_LANGUAGES;
export declare function getLanguageName(code: string): string;
export declare function translateText(text: string, targetLang: string): Promise<{
    translation: string;
    detectedSource: string;
    targetLanguage: string;
}>;
export declare function summarizeMessages(messages: {
    author: string;
    content: string;
}[]): Promise<string>;
export {};
//# sourceMappingURL=ai-extra.d.ts.map