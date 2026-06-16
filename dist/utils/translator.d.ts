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
export declare function checkCircuitBreaker(): boolean;
/**
 * Bannit MyMemory pour 1h et loggue un avertissement critique.
 */
/**
 * @internal Test-only export — bannit MyMemory pour 1h et loggue un avertissement critique.
 */
export declare function banMyMemory(reason: string): void;
interface TranslationResult {
    translatedText: string;
    detectedLanguage: string;
}
/**
 * Codes de langues supportés (ISO 639-1)
 */
export declare const SUPPORTED_LANGUAGES: {
    readonly fr: "Français";
    readonly en: "English";
    readonly es: "Español";
    readonly de: "Deutsch";
    readonly it: "Italiano";
    readonly pt: "Português";
    readonly ru: "Русский";
    readonly ja: "日本語";
    readonly ko: "한국어";
    readonly zh: "中文";
    readonly ar: "العربية";
    readonly hi: "हिन्दी";
    readonly tr: "Türkçe";
    readonly pl: "Polski";
    readonly nl: "Nederlands";
    readonly sv: "Svenska";
    readonly da: "Dansk";
    readonly no: "Norsk";
    readonly fi: "Suomi";
    readonly el: "Ελληνικά";
    readonly he: "עברית";
    readonly th: "ไทย";
    readonly vi: "Tiếng Việt";
    readonly id: "Bahasa Indonesia";
    readonly ms: "Bahasa Melayu";
    readonly uk: "Українська";
    readonly cs: "Čeština";
    readonly ro: "Română";
    readonly hu: "Magyar";
    readonly bg: "Български";
    readonly sk: "Slovenčina";
    readonly hr: "Hrvatski";
    readonly sr: "Српски";
    readonly sl: "Slovenščina";
    readonly lt: "Lietuvių";
    readonly lv: "Latviešu";
    readonly et: "Eesti";
    readonly is: "Íslenska";
    readonly mt: "Malti";
    readonly ga: "Gaeilge";
    readonly cy: "Cymraeg";
    readonly bn: "বাংলা";
    readonly ta: "தமிழ்";
    readonly te: "తెలుగు";
    readonly mr: "मराठी";
    readonly gu: "ગુજરાતી";
    readonly kn: "ಕನ್ನಡ";
    readonly ml: "മലയാളം";
    readonly fa: "فارسی";
    readonly ur: "اردو";
    readonly az: "Azərbaycan";
    readonly ka: "ქართული";
    readonly hy: "Հայերեն";
    readonly kk: "Қазақша";
    readonly ky: "Кыргызча";
    readonly uz: "Oʻzbekcha";
    readonly mn: "Монгол";
    readonly ne: "नेपाली";
    readonly si: "සිංහල";
    readonly my: "မြန်မာ";
    readonly km: "ខ្មែរ";
    readonly lo: "ລາວ";
    readonly am: "አማርኛ";
    readonly sw: "Kiswahili";
    readonly zu: "isiZulu";
    readonly xh: "isiXhosa";
    readonly af: "Afrikaans";
    readonly sq: "Shqip";
    readonly mk: "Македонски";
    readonly be: "Беларуская";
    readonly bs: "Bosanski";
    readonly me: "Crnogorski";
    readonly lb: "Lëtzebuergesch";
    readonly fo: "Føroyskt";
};
export type LanguageCode = keyof typeof SUPPORTED_LANGUAGES;
/**
 * Traduit automatiquement un texte vers le français avec système de failover
 */
export declare function translateAutoToFrench(text: string): Promise<TranslationResult | null>;
/**
 * Traduit un texte vers une langue cible avec Circuit Breaker + Failover
 */
export declare function translateText(text: string, targetLang: LanguageCode, sourceLang?: LanguageCode | "auto"): Promise<TranslationResult | null>;
/**
 * Traduit du français vers l'anglais (traduction inversée)
 */
export declare function translateFrenchToEnglish(text: string): Promise<TranslationResult | null>;
/**
 * Traduit un texte de l'anglais vers le français (legacy)
 */
export declare function translateToFrench(text: string): Promise<string>;
/**
 * Traduit un tableau de textes en parallèle
 */
export declare function translateBatchToFrench(texts: string[]): Promise<string[]>;
/**
 * Vérifie si un texte est principalement en anglais
 */
export declare function isLikelyEnglish(text: string): boolean;
/**
 * Retourne l'état actuel du Circuit Breaker (pour monitoring/debug)
 */
export declare function getCircuitBreakerState(): {
    banned: boolean;
    remainingMs: number;
};
/**
 * Réinitialise manuellement le Circuit Breaker (commande debug/admin)
 */
export declare function resetCircuitBreaker(): void;
export {};
//# sourceMappingURL=translator.d.ts.map