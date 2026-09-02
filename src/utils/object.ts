/**
 * object.ts — Utilitaires de manipulation d'objets
 */

/** Retourne une copie sans les clés spécifiées */
export function omit<T extends Record<string, any>, K extends keyof T>(
  obj: T,
  keys: readonly K[],
): Omit<T, K> {
  const result = { ...obj };
  for (const key of keys) {
    delete result[key];
  }
  return result;
}

/** Retourne une copie avec uniquement les clés spécifiées */
export function pick<T extends Record<string, any>, K extends keyof T>(
  obj: T,
  keys: readonly K[],
): Pick<T, K> {
  const result = {} as Pick<T, K>;
  for (const key of keys) {
    if (key in obj) {
      result[key] = obj[key];
    }
  }
  return result;
}

/** Merge profond de deux objets */
export function deepMerge<T extends Record<string, any>>(target: T, source: Partial<T>): T {
  const result = { ...target };
  for (const key of Object.keys(source) as Array<keyof T>) {
    const srcVal = source[key];
    const tgtVal = target[key];
    if (
      srcVal &&
      typeof srcVal === "object" &&
      !Array.isArray(srcVal) &&
      tgtVal &&
      typeof tgtVal === "object" &&
      !Array.isArray(tgtVal)
    ) {
      result[key] = deepMerge(
        tgtVal as Record<string, any>,
        srcVal as Record<string, any>,
      ) as T[keyof T];
    } else if (srcVal !== undefined) {
      result[key] = srcVal as T[keyof T];
    }
  }
  return result;
}

/** Vérifie si un objet est vide (aucune clé propre) */
export function isEmpty(obj: any): boolean {
  if (obj == null) return true;
  if (typeof obj !== "object") return false;
  if (Array.isArray(obj)) return obj.length === 0;
  return Object.keys(obj as Record<string, any>).length === 0;
}

/** Aplatit un objet imbriqué en clés dot-notation */
export function flatten(obj: Record<string, any>, prefix = ""): Record<string, any> {
  const result: Record<string, any> = {};
  for (const [key, value] of Object.entries(obj)) {
    const fullKey = prefix ? `${prefix}.${key}` : key;
    if (value && typeof value === "object" && !Array.isArray(value)) {
      Object.assign(result, flatten(value as Record<string, any>, fullKey));
    } else {
      result[fullKey] = value;
    }
  }
  return result;
}
