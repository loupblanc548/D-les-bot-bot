/**
 * i18nPlural.ts — Internationalisation avec pluriels via Intl.PluralRules
 *
 * API volontairement micro :
 *   - `registerTranslations(entries)` : pousse un lot de clés.
 *   - `t(key, locale, vars)` : retourne la chaîne localisée, en
 *     sélectionnant la forme via Intl.PluralRules.
 *
 * Format des traductions :
 *   Pour chaque locale, la valeur est `"formeSingulier|formePluriel"`
 *   (séparateur `|`). C'est compact, JSON-friendly, et permet un
 *   mapping direct vers Intl.PluralRules. Si la locale a plus de deux
 *   formes (slaves, arabe, etc.), des segments supplémentaires sont
 *   mappés sur les catégories `few` / `many` / `two` selon l'ordre
 *   standard PluralRules.
 *
 * Substitutions :
 *   - Toutes les variables `{name}` du template sont remplacées par
 *     `vars[name]`. Clés absentes → laissées littérales.
 *   - Si `vars.count` est fourni mais que la chaîne rendue ne contient
 *     PAS déjà le chiffre (ni `{count}` restant), on préfixe
 *     `"<count> "` automatiquement pour matcher l'idiome de la spec
 *     (`t("messages", "fr", { count: 5 }) → "5 messages"`).
 *
 * Locales officiellement testées : fr, en, es. Locale non supportée
 * → fallback "en".
 */

import logger from "../utils/logger.js";

// ─── Types ────────────────────────────────────────────────────────

export interface I18nEntry {
  key: string;
  /** Record<locale, "singulier|pluriel|autresFormes…">. */
  translations: Record<string, string>;
}

export type Vars = Record<string, number | string>;

// ─── Constantes ───────────────────────────────────────────────────

/** Locales officiellement supportées (tests visuels faits sur ces 3 langues). */
const SUPPORTED_LOCALES = new Set(["fr", "en", "es"]);
/** Séparateur entre forme singulier et pluriel dans la chaîne stockée. */
const FORM_SEPARATOR = "|";

// ─── Store en mémoire ─────────────────────────────────────────────
const entriesByKey = new Map<string, I18nEntry>();

// Cache de PluralRules par locale pour éviter de recréer l'objet à chaque t().
const pluralRulesCache = new Map<string, Intl.PluralRules>();

// ─── API publique ─────────────────────────────────────────────────

/**
 * Enregistre un lot de traductions. Les clés existantes sont écrasées
 * silencieusement (politique "dernier gagne") pour faciliter le
 * hot-reload de packs en dev.
 */
export function registerTranslations(entries: I18nEntry[]): void {
  if (!Array.isArray(entries)) {
    logger.warn("[i18nPlural] registerTranslations: entries non-array ignoré");
    return;
  }
  for (const entry of entries) {
    if (!entry || typeof entry.key !== "string" || !entry.translations) {
      logger.warn("[i18nPlural] entrée invalide ignorée");
      continue;
    }
    entriesByKey.set(entry.key, entry);
  }
  logger.info(`[i18nPlural] ${entries.length} entrée(s) enregistrée(s)`);
}

/**
 * Récupère la chaîne localisée pour `key`. Si la clé est inconnue
 * ou la locale absente, on log en debug et on retourne la clé brute
 * — fallback safe.
 *
 * @param key    Clé d'i18n.
 * @param locale Code BCP-47 (ex: "fr", "en", "es"). Non supportée →
 *               fallback "en".
 * @param vars   Variables à interpoler. `vars.count` (number) pilote
 *               la sélection singulier/pluriel + l'auto-prefix du
 *               chiffre s'il n'apparaît pas déjà dans la chaîne.
 */
export function t(key: string, locale: string, vars: Vars = {}): string {
  const entry = entriesByKey.get(key);
  if (!entry) {
    logger.debug(`[i18nPlural] Clé inconnue: "${key}"`);
    return interpolate(`{${key}}`, vars);
  }

  const effectiveLocale = SUPPORTED_LOCALES.has(locale) ? locale : "en";
  const raw =
    entry.translations[effectiveLocale] ?? entry.translations.en;
  if (raw === undefined) {
    logger.debug(
      `[i18nPlural] Pas de traduction pour clé "${key}" locale "${effectiveLocale}"`,
    );
    return interpolate(key, vars);
  }

  const form = renderPlural(raw, effectiveLocale, vars);
  const withCount = interpolate(form, vars);
  return maybeAutoPrefixCount(withCount, vars);
}

/** Inspection / debug. Retourne une référence (immutable côté consumer). */
export function getEntry(key: string): I18nEntry | null {
  return entriesByKey.get(key) ?? null;
}

/** Reset complet (utile pour tests). */
export function clearTranslations(): void {
  entriesByKey.clear();
  pluralRulesCache.clear();
}

// ─── Helpers ──────────────────────────────────────────────────────

/**
 * Rend la forme (singulier / pluriel / autres) en fonction de
 * `vars.count` ET de `locale`. Si `count` est absent/non-numérique →
 * fallback sur la forme plurielle ("other") par convention.
 */
function renderPlural(raw: string, locale: string, vars: Vars): string {
  let pool: string[];
  if (raw.includes(FORM_SEPARATOR)) {
    const split = raw.split(FORM_SEPARATOR);
    if (split.length === 1) {
      pool = [raw, raw];
    } else if (split.length <= 3) {
      pool = split;
    } else {
      pool = [split[0], split[1], split.slice(2).join(FORM_SEPARATOR)];
    }
  } else {
    pool = [raw, raw];
  }

  const count = typeof vars.count === "number" ? vars.count : Number.NaN;
  const category =
    Number.isFinite(count) ? resolveCategory(locale, count) : "other";

  // Convention de mapping pool → catégorie :
  //   idx 0 → "one"
  //   idx 1 → "other"
  //   idx 2 → "two" / "few" / "many" / "zero" (selon Intl.PluralRules)
  const idx =
    category === "one"
      ? 0
      : category === "other"
        ? 1
        : 2;
  const safeIdx = Math.min(idx, pool.length - 1);
  return pool[safeIdx] ?? pool[0] ?? raw;
}

function resolveCategory(
  locale: string,
  count: number,
): "zero" | "one" | "two" | "few" | "many" | "other" {
  let rules = pluralRulesCache.get(locale);
  if (!rules) {
    try {
      rules = new Intl.PluralRules(locale);
      pluralRulesCache.set(locale, rules);
    } catch {
      // Locale non supportée par l'environnement → fallback "other".
      return "other";
    }
  }
  return rules.select(count);
}

/**
 * Remplace `{varName}` dans `template` par `vars[varName]`. Pas
 * d'échappement : design volontairement minimal. Clés absentes →
 * placeholder laissé tel quel (utile au debug).
 */
function interpolate(template: string, vars: Vars): string {
  return template.replace(/\{(\w+)\}/g, (match, name: string) => {
    if (name in vars) {
      const v = vars[name];
      return typeof v === "number" || typeof v === "string"
        ? String(v)
        : match;
    }
    return match;
  });
}

/**
 * Si le caller a passé `vars.count` ET que la chaîne rendue ne contient
 * PAS déjà le chiffre ET qu'il ne reste pas de `{count}` libre, on
 * préfixe `"<count> "` pour matcher l'idiome de la spec :
 *   `t("messages", "fr", { count: 5 }) → "5 messages"`
 *
 * Cette règle est indépendante de la longueur de la chaîne : la
 * consigne de la spec ne souffre aucune heuristique supplémentaire.
 */
function maybeAutoPrefixCount(rendered: string, vars: Vars): string {
  if (typeof vars.count !== "number") return rendered;
  const asText = String(vars.count);
  if (rendered.includes(asText)) return rendered;
  if (rendered.includes("{count}")) return rendered; // sera interpolé juste après si supporté
  return `${asText} ${rendered}`;
}
