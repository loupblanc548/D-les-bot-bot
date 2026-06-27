/**
 * theme.ts — Thème visuel du bot (Matrix/Hacker green)
 *
 * Palette de couleurs principale du Shadow Broker.
 * Toutes les couleurs sont en hexadécimal (0xRRGGBB) pour Discord.js.
 */

export const THEME = {
  // Backgrounds (non utilisables dans Discord embeds mais pour référence)
  bg: {
    base: 0x000000,
    primary: 0x0a0f0a,
    secondary: 0x0f1a0f,
    tertiary: 0x142014,
    border: 0x1a2b1a,
  },

  // Text colors (convertis en entier pour Discord)
  text: {
    primary: 0x00ff41,
    secondary: 0x00cc33,
    muted: 0x008822,
  },

  // Couleurs principales pour embeds Discord
  accent: 0x00ff41,
  success: 0x00ff66,
  warning: 0xffcc00,
  danger: 0xff3333,

  // Alias pratiques
  primary: 0x00ff41,
  secondary: 0x00cc33,
  dark: 0x0a0f0a,
  darkGreen: 0x0f1a0f,
  muted: 0x008822,

  // Couleurs spécifiques Shadow Broker
  shadow: {
    intel: 0x00ff41,
    found: 0x00ff66,
    notFound: 0x008822,
    alert: 0xff3333,
    warning: 0xffcc00,
    info: 0x00cc33,
    stealth: 0x0a0f0a,
  },

  // Couleurs par type d'alerte
  alert: {
    critical: 0xff3333,
    high: 0xff6600,
    medium: 0xffcc00,
    low: 0x00ff66,
    info: 0x00cc33,
  },

  // Couleurs par plateforme (garde les couleurs de marque mais sur fond dark)
  platform: {
    steam: 0x00ff41,
    epic: 0x00ff41,
    default: 0x00ff41,
  },
} as const;

// Export individuel pour utilisation directe
export const COLORS = {
  PRIMARY: 0x00ff41,
  SECONDARY: 0x00cc33,
  MUTED: 0x008822,
  ACCENT: 0x00ff41,
  SUCCESS: 0x00ff66,
  WARNING: 0xffcc00,
  DANGER: 0xff3333,
  DARK: 0x0a0f0a,
  DARK_GREEN: 0x0f1a0f,
  SHADOW: 0x00ff41,
  STEALTH: 0x0a0f0a,
  ALERT_CRITICAL: 0xff3333,
  ALERT_HIGH: 0xff6600,
  ALERT_MEDIUM: 0xffcc00,
  ALERT_LOW: 0x00ff66,
  ALERT_INFO: 0x00cc33,
} as const;
