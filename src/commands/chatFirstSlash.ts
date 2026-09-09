/**
 * chatFirstSlash.ts — Slash Discord réellement enregistrés (menu /).
 *
 * Aligné avec le filtre d'enregistrement dans commandRouter.ts.
 * Les sous-commandes (« ce qui va avec ») viennent de helpCategories.ts.
 */

import { CATEGORIES } from "./helpCategories.js";

export const CHAT_FIRST_SLASH = [
  "help",
  "bot",
  "game",
  "ai",
  "mod",
  "security",
  "mc",
  "admin",
  "wishlist",
  "fiches",
  "config",
  "privacy",
  "killswitch",
  "learn-stats",
] as const;

export const CHAT_FIRST_SLASH_SET = new Set<string>(CHAT_FIRST_SLASH);

const SLASH_BLURB: Record<(typeof CHAT_FIRST_SLASH)[number], string> = {
  help: "liste paginée des commandes slash",
  bot: "aide, statut, restart",
  game: "Steam, deals, jeux gratuits, Fortnite, patch notes",
  ai: "chat, image, traduction, résumé",
  mod: "modération (warn, mute, ban…)",
  security: "OSINT, fuites, liens suspects",
  mc: "Minecraft Bedrock",
  admin: "administration (staff)",
  wishlist: "wishlist jeux",
  fiches: "fiches Discord par domaine (cartes natives)",
  config: "configuration du bot",
  privacy: "confidentialité / données",
  killswitch: "coupe-circuit d'urgence",
  "learn-stats": "stats d'apprentissage",
};

const GROUP_CATEGORY_ID: Partial<Record<(typeof CHAT_FIRST_SLASH)[number], string>> = {
  bot: "bot",
  mod: "moderation",
  security: "security",
  ai: "ai",
  game: "gaming",
  mc: "mc",
  admin: "admin",
};

function commandLines(): string[] {
  const lines: string[] = [];
  for (const name of CHAT_FIRST_SLASH) {
    const catId = GROUP_CATEGORY_ID[name];
    const cat = catId ? CATEGORIES.find((c) => c.id === catId) : undefined;
    if (cat) {
      for (const raw of cat.commands.split("\n")) {
        const line = raw.replace(/`/g, "").trim();
        if (line) lines.push(line);
      }
    } else {
      lines.push(`/${name} - ${SLASH_BLURB[name]}`);
    }
  }
  return lines;
}

/** Sous-commandes qui collent à une demande (« steam », « mute », « fuite »…). */
export function matchSlashCommands(query: string): string[] {
  const words = query
    .toLowerCase()
    .split(/[^a-z0-9àâäéèêëïîôùûüç_+-]+/i)
    .map((w) => w.trim())
    .filter((w) => w.length >= 3);
  if (words.length === 0) return [];

  const hits: string[] = [];
  for (const line of commandLines()) {
    const lower = line.toLowerCase();
    if (words.some((w) => lower.includes(w))) hits.push(line);
  }
  return hits.slice(0, 12);
}

export const CHAT_FIRST_COMMANDS_HINT =
  "\n\n## COMMANDES DISCORD\n" +
  "Il n'existe AUCUNE commande préfixe `!` : !help, !cmd, !commands n'existent pas. " +
  "Le menu Discord s'ouvre avec `/`. Groupes : /help, /bot, /game, /ai, /mod, /security, /mc, /admin, /wishlist, /fiches, /config, /privacy, /killswitch, /learn-stats. " +
  "Si on demande une commande (cmd, slash, « c'est quoi la commande pour… ») → list_bot_commands avec le sujet. " +
  "Donne le `/groupe sous-commande` réel (ex: Steam → /game steam, pas /steam). " +
  "Si on veut aussi le résultat maintenant, fais-le en chat avec tes tools. " +
  "N'invente jamais une commande hors de cette liste.\n";

export function formatChatFirstSlashHelp(query?: string): string {
  const header =
    "Pas de commande `!` (!help n'existe pas).\n" +
    "Pour cliquer : tape `/` dans Discord. Liste : **/help** ou **/bot help**.\n" +
    "John peut aussi le faire en chat si tu veux le résultat tout de suite.\n\n";

  const q = query?.trim();
  if (q) {
    const hits = matchSlashCommands(q);
    if (hits.length === 0) {
      return (
        header +
        `Rien ne colle à « ${q} ». Groupes : ` +
        CHAT_FIRST_SLASH.map((n) => `/${n}`).join(", ")
      );
    }
    return header + "Commandes qui vont avec :\n" + hits.map((h) => `- ${h}`).join("\n");
  }

  const groups = CHAT_FIRST_SLASH.map((name) => `/${name} — ${SLASH_BLURB[name]}`);
  return (
    header +
    "Groupes slash :\n" +
    groups.join("\n") +
    "\n\nPrécise un sujet (steam, mute, breach, fortnite…) pour les sous-commandes."
  );
}

export function isChatFirstSlash(name: string): boolean {
  return CHAT_FIRST_SLASH_SET.has(name);
}
