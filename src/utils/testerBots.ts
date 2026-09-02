/**
 * Bots Discord autorisés à @mentionner John pour les tests live.
 * John ignore les autres bots (anti-boucle) ; ces IDs passent quand même.
 *
 * TESTER_BOT_IDS=id1,id2  (optionnel, en plus de la liste par défaut)
 */
const DEFAULT_TESTER_BOT_IDS = [
  "1321693294933180538", // « encore un test » — salon #les-test-de-lb
];

export function parseTesterBotIds(env: NodeJS.ProcessEnv = process.env): Set<string> {
  const extra = (env.TESTER_BOT_IDS ?? "").split(/[\s,]+/).filter(Boolean);
  return new Set([...DEFAULT_TESTER_BOT_IDS, ...extra]);
}

export function isTesterBot(userId: string, env: NodeJS.ProcessEnv = process.env): boolean {
  if (!userId) return false;
  return parseTesterBotIds(env).has(userId);
}
