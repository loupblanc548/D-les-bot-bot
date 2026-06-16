/**
 * Constantes partagées utilisées dans tout le projet
 */
export declare const TIME_CONSTANTS: {
    readonly SECOND: 1000;
    readonly MINUTE: number;
    readonly HOUR: number;
    readonly DAY: number;
    readonly WEEK: number;
};
export declare const DISCORD_LIMITS: {
    readonly MAX_MESSAGE_LENGTH: 2000;
    readonly MAX_EMBED_TITLE_LENGTH: 256;
    readonly MAX_EMBED_DESCRIPTION_LENGTH: 4096;
    readonly MAX_EMBED_FIELDS: 25;
    readonly MAX_EMBED_FIELD_NAME_LENGTH: 256;
    readonly MAX_EMBED_FIELD_VALUE_LENGTH: 1024;
    readonly MAX_EMBED_FOOTER_LENGTH: 2048;
    readonly MAX_EMBED_AUTHOR_NAME_LENGTH: 256;
};
export declare const DISCORD_COLORS: {
    readonly DEFAULT: 0;
    readonly WHITE: 16777215;
    readonly AQUA: 1752220;
    readonly GREEN: 3066993;
    readonly BLUE: 3447003;
    readonly YELLOW: 15844367;
    readonly PURPLE: 10181046;
    readonly LUMINOUS_VIVID_PINK: 15277667;
    readonly GOLD: 15844367;
    readonly ORANGE: 15105570;
    readonly RED: 15158332;
    readonly GREY: 9807270;
    readonly NAVY: 3426654;
    readonly DARK_AQUA: 1146986;
    readonly DARK_GREEN: 2067276;
    readonly DARK_BLUE: 2123412;
    readonly DARK_PURPLE: 7419530;
    readonly DARK_VIVID_PINK: 11342935;
    readonly DARK_GOLD: 12745742;
    readonly DARK_ORANGE: 11027200;
    readonly DARK_RED: 10038562;
    readonly DARK_GREY: 7569293;
    readonly DARKER_GREY: 2899536;
    readonly LIGHT_GREY: 9936031;
    readonly DARK_NAVY: 2899536;
    readonly BLURPLE: 5793266;
    readonly GREYPLE: 10070733;
    readonly DARK_BUT_NOT_BLACK: 2895667;
    readonly NOT_QUITE_BLACK: 2303786;
};
export declare const EMOJIS: {
    readonly SUCCESS: "✅";
    readonly ERROR: "❌";
    readonly WARNING: "⚠️";
    readonly INFO: "ℹ️";
    readonly LOADING: "⏳";
    readonly CHECK: "✓";
    readonly CROSS: "✗";
    readonly STAR: "⭐";
    readonly FIRE: "🔥";
    readonly SHIELD: "🛡️";
    readonly BELL: "🔔";
    readonly LOCK: "🔒";
    readonly UNLOCK: "🔓";
    readonly TRASH: "🗑️";
    readonly PENCIL: "✏️";
    readonly GEAR: "⚙️";
    readonly MAGNIFYING_GLASS: "🔍";
};
export declare const REGEX_PATTERNS: {
    readonly DISCORD_ID: RegExp;
    readonly URL: RegExp;
    readonly EMAIL: RegExp;
    readonly MENTION: RegExp;
    readonly CHANNEL_MENTION: RegExp;
    readonly ROLE_MENTION: RegExp;
    readonly TIMESTAMP: RegExp;
};
export declare const ERROR_MESSAGES: {
    readonly PERMISSION_DENIED: "Vous n'avez pas la permission d'utiliser cette commande.";
    readonly INVALID_ARGUMENT: "Argument invalide.";
    readonly COMMAND_FAILED: "La commande a échoué.";
    readonly RATE_LIMITED: "Vous envoyez des commandes trop rapidement. Veuillez attendre.";
    readonly UNKNOWN_ERROR: "Une erreur inconnue s'est produite.";
};
//# sourceMappingURL=constants.d.ts.map