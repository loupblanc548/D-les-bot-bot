/**
 * array.ts — Utilitaires de tableaux
 */

/** Découpe un tableau en chunks de taille n */
export function chunk<T>(arr: readonly T[], size: number): T[][] {
  if (size < 1) throw new Error("chunk size must be >= 1");
  const result: T[][] = [];
  for (let i = 0; i < arr.length; i += size) {
    result.push(arr.slice(i, i + size));
  }
  return result;
}

/** Groupe les éléments par clé */
export function groupBy<T, K extends string | number>(
  arr: readonly T[],
  keyFn: (item: T) => K,
): Record<K, T[]> {
  const result = {} as Record<K, T[]>;
  for (const item of arr) {
    const key = keyFn(item);
    (result[key] ??= []).push(item);
  }
  return result;
}

/** Déduplique par clé d'identité */
export function uniqueBy<T, K>(arr: readonly T[], keyFn: (item: T) => K): T[] {
  const seen = new Set<K>();
  const result: T[] = [];
  for (const item of arr) {
    const key = keyFn(item);
    if (!seen.has(key)) {
      seen.add(key);
      result.push(item);
    }
  }
  return result;
}

/** Mélange aléatoirement (Fisher-Yates) */
export function shuffle<T>(arr: readonly T[]): T[] {
  const result = [...arr];
  for (let i = result.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [result[i], result[j]] = [result[j], result[i]];
  }
  return result;
}

/** Prend n éléments au hasard */
export function sample<T>(arr: readonly T[], n = 1): T[] {
  return shuffle(arr).slice(0, n);
}

/** Intersection de deux tableaux */
export function intersection<T>(a: readonly T[], b: readonly T[]): T[] {
  const setB = new Set(b);
  return a.filter((x) => setB.has(x));
}
