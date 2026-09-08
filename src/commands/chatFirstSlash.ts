/**
 * chatFirstSlash.ts — Slash encore visibles après le passage chat-first.
 *
 * Le reste (Steam, game, IA, fun…) se fait en parlant à @John.
 * Tenir cette liste alignée avec le filtre d'enregistrement dans commandRouter.ts.
 */

export const CHAT_FIRST_SLASH = [
  "help",
  "learn-stats",
  "admin",
  "config",
  "killswitch",
  "privacy",
  "ticket",
  "mod",
  "security",
  "wishlist",
  "mc",
] as const;

export const CHAT_FIRST_SLASH_SET = new Set<string>(CHAT_FIRST_SLASH);

const SLASH_BLURB: Record<(typeof CHAT_FIRST_SLASH)[number], string> = {
  help: "menu Discord des slash encore visibles",
  "learn-stats": "stats d'apprentissage",
  admin: "administration (staff)",
  config: "configuration du bot",
  killswitch: "coupe-circuit d'urgence",
  privacy: "confidentialité / données",
  ticket: "tickets support",
  mod: "modération",
  security: "sécurité et OSINT",
  wishlist: "wishlist jeux",
  mc: "Minecraft Bedrock",
};

/** Texte à coller dans les system prompts (fast-path + agent). */
export const CHAT_FIRST_COMMANDS_HINT =
  "\n\n## COMMANDES DISCORD\n" +
  "Il n'existe AUCUNE commande préfixe `!` : !help, !cmd, !commands n'existent pas. " +
  "Si on demande LA commande pour voir le menu slash : réponds `/help` (c'est la seule). " +
  "Liste les slash encore au menu si on veut « toutes les commandes ». " +
  "Pour tout le reste (Steam, météo, jeu, recherche, DNS, fuite email) : pas de slash, tu le fais en chat. " +
  "N'invente jamais une commande qui n'est pas dans cette liste : /help, /learn-stats, /admin, /config, /killswitch, /privacy, /ticket, /mod, /security, /wishlist, /mc.\n";

export function formatChatFirstSlashHelp(): string {
  const lines = CHAT_FIRST_SLASH.map((name) => `/${name} — ${SLASH_BLURB[name]}`);
  return (
    "Pas de commande `!` (!help n'existe pas).\n" +
    "Menu Discord cliquable : **/help**\n" +
    "Sinon ping @John et dis ce que tu veux.\n\n" +
    "Slash encore au menu :\n" +
    lines.join("\n")
  );
}

export function isChatFirstSlash(name: string): boolean {
  return CHAT_FIRST_SLASH_SET.has(name);
}
