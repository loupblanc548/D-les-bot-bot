/**
 * date.ts — Utilitaires de date et durée
 */

/** Format relatif: "il y a 5 min", "dans 2 h" */
export function formatRelative(date: Date | number, locale = "fr"): string {
  const ts = typeof date === "number" ? date : date.getTime();
  const diff = ts - Date.now();
  const abs = Math.abs(diff);
  const past = diff < 0;

  const units: Array<[number, string, string]> = [
    [60_000, "s", "s"],
    [3_600_000, "min", "min"],
    [86_400_000, "h", "h"],
    [604_800_000, "j", "d"],
    [2_592_000_000, "sem", "w"],
    [31_536_000_000, "mois", "mo"],
  ];

  for (let i = units.length - 1; i >= 0; i--) {
    const [ms, fr, en] = units[i];
    if (abs >= ms) {
      const val = Math.floor(abs / ms);
      const unit = locale === "fr" ? fr : en;
      return past
        ? locale === "fr"
          ? `il y a ${val} ${unit}`
          : `${val} ${unit} ago`
        : locale === "fr"
          ? `dans ${val} ${unit}`
          : `in ${val} ${unit}`;
    }
  }

  return locale === "fr" ? "à l'instant" : "just now";
}

/** Parse une durée textuelle ("1h30m", "2d", "45s") en millisecondes */
export function parseDuration(input: string): number | null {
  const match = input.trim().match(/^(\d+)\s*(s|m|h|d|w|mo)$/i);
  if (!match) return null;

  const value = parseInt(match[1], 10);
  const unit = match[2].toLowerCase();

  const multipliers: Record<string, number> = {
    s: 1000,
    m: 60_000,
    h: 3_600_000,
    d: 86_400_000,
    w: 604_800_000,
    mo: 2_592_000_000,
  };

  return value * (multipliers[unit] ?? 0);
}

/** Convertit un Date en timestamp Discord (<t:...>) */
export function toDiscordTimestamp(date: Date | number, style: "R" | "f" | "F" | "t" | "T" | "d" | "D" = "R"): string {
  const ts = typeof date === "number" ? Math.floor(date / 1000) : Math.floor(date.getTime() / 1000);
  return `<t:${ts}:${style}>`;
}

/** Convertit en timezone spécifique (retourne une string localisée) */
export function toTimezone(date: Date, timezone: string, locale = "fr-FR"): string {
  return new Intl.DateTimeFormat(locale, {
    timeZone: timezone,
    dateStyle: "full",
    timeStyle: "short",
  }).format(date);
}

/** Retourne le début de journée pour une date donnée */
export function startOfDay(date: Date = new Date()): Date {
  const d = new Date(date);
  d.setHours(0, 0, 0, 0);
  return d;
}

/** Retourne la fin de journée pour une date donnée */
export function endOfDay(date: Date = new Date()): Date {
  const d = new Date(date);
  d.setHours(23, 59, 59, 999);
  return d;
}
