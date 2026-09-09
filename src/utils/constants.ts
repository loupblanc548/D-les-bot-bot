/**
 * Constantes partagées utilisées dans tout le projet
 */

// Intervals de temps
export const TIME_CONSTANTS = {
  SECOND: 1000,
  MINUTE: 60 * 1000,
  HOUR: 60 * 60 * 1000,
  DAY: 24 * 60 * 60 * 1000,
  WEEK: 7 * 24 * 60 * 60 * 1000,
} as const;

// Limites Discord
export const DISCORD_LIMITS = {
  MAX_MESSAGE_LENGTH: 2000,
  MAX_EMBED_TITLE_LENGTH: 256,
  MAX_EMBED_DESCRIPTION_LENGTH: 4096,
  MAX_EMBED_FIELDS: 25,
  MAX_EMBED_FIELD_NAME_LENGTH: 256,
  MAX_EMBED_FIELD_VALUE_LENGTH: 1024,
  MAX_EMBED_FOOTER_LENGTH: 2048,
  MAX_EMBED_AUTHOR_NAME_LENGTH: 256,
} as const;

// Couleurs Discord
export const DISCORD_COLORS = {
  DEFAULT: 0x000000,
  WHITE: 0xffffff,
  AQUA: 0x1abc9c,
  GREEN: 0x2ecc71,
  BLUE: 0x3498db,
  YELLOW: 0xf1c40f,
  PURPLE: 0x9b59b6,
  LUMINOUS_VIVID_PINK: 0xe91e63,
  GOLD: 0xf1c40f,
  ORANGE: 0xe67e22,
  RED: 0xe74c3c,
  GREY: 0x95a5a6,
  NAVY: 0x34495e,
  DARK_AQUA: 0x11806a,
  DARK_GREEN: 0x1f8b4c,
  DARK_BLUE: 0x206694,
  DARK_PURPLE: 0x71368a,
  DARK_VIVID_PINK: 0xad1457,
  DARK_GOLD: 0xc27c0e,
  DARK_ORANGE: 0xa84300,
  DARK_RED: 0x992d22,
  DARK_GREY: 0x737f8d,
  DARKER_GREY: 0x2c3e50,
  LIGHT_GREY: 0x979c9f,
  DARK_NAVY: 0x2c3e50,
  BLURPLE: 0x5865f2,
  GREYPLE: 0x99aacd,
  DARK_BUT_NOT_BLACK: 0x2c2f33,
  NOT_QUITE_BLACK: 0x23272a,
} as const;

// Emojis communs
export const EMOJIS = {
  SUCCESS: "✅",
  ERROR: "❌",
  WARNING: "⚠️",
  INFO: "ℹ️",
  LOADING: "⏳",
  CHECK: "✓",
  CROSS: "✗",
  STAR: "⭐",
  FIRE: "🔥",
  SHIELD: "🛡️",
  BELL: "🔔",
  LOCK: "🔒",
  UNLOCK: "🔓",
  TRASH: "🗑️",
  PENCIL: "✏️",
  GEAR: "⚙️",
  MAGNIFYING_GLASS: "🔍",
} as const;

// Patterns regex communs
export const REGEX_PATTERNS = {
  DISCORD_ID: /^\d{17,20}$/,
  URL: /^https?:\/\/.+/,
  EMAIL: /^[^\s@]+@[^\s@]+\.[^\s@]+$/,
  MENTION: /^<@!?(\d{17,20})>$/,
  CHANNEL_MENTION: /^<#(\d{17,20})>$/,
  ROLE_MENTION: /^<@&(\d{17,20})>$/,
  TIMESTAMP: /^<t:(\d+)(?::([tTdDfFR]))?>$/,
} as const;

// Messages d'erreur communs
export const ERROR_MESSAGES = {
  PERMISSION_DENIED: "Vous n'avez pas la permission d'utiliser cette commande.",
  INVALID_ARGUMENT: "Argument invalide.",
  COMMAND_FAILED: "La commande a échoué.",
  RATE_LIMITED: "Vous envoyez des commandes trop rapidement. Veuillez attendre.",
  UNKNOWN_ERROR: "Une erreur inconnue s'est produite.",
} as const;
