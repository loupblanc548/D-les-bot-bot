/**
 * Blagues : JokeAPI (catégories + FR/EN), dad jokes, Chuck Norris, toc-toc.
 * Toujours en safe-mode — pas de NSFW.
 */

import logger from "../utils/logger.js";

export const JOKE_CATEGORIES = [
  "any",
  "programming",
  "misc",
  "pun",
  "spooky",
  "christmas",
  "dark",
  "dad",
  "chuck",
  "knock-knock",
] as const;

export const JOKE_LANGS = ["fr", "en"] as const;
export const JOKE_STYLES = ["any", "single", "twopart"] as const;

export type JokeCategory = (typeof JOKE_CATEGORIES)[number];
export type JokeLang = (typeof JOKE_LANGS)[number];
export type JokeStyle = (typeof JOKE_STYLES)[number];

export interface Joke {
  setup: string;
  punchline: string;
  category: string;
  lang: JokeLang;
  oneLiner: boolean;
}

export interface JokeRequest {
  category?: string | null;
  lang?: string | null;
  style?: string | null;
}

const JOKEAPI_PATH: Record<string, string> = {
  any: "Any",
  programming: "Programming",
  misc: "Misc",
  pun: "Pun",
  spooky: "Spooky",
  christmas: "Christmas",
  dark: "Dark",
};

const FR_FALLBACKS: Joke[] = [
  {
    setup: "Que dit une imprimante qui tombe à l'eau ?",
    punchline: "J'ai papier.",
    category: "pun",
    lang: "fr",
    oneLiner: false,
  },
  {
    setup: "Pourquoi les plongeurs plongent-ils toujours en arrière ?",
    punchline: "Parce que sinon ils tombent dans le bateau.",
    category: "any",
    lang: "fr",
    oneLiner: false,
  },
  {
    setup: "Qu'est-ce qui est jaune et qui attend ?",
    punchline: "Jonathan.",
    category: "pun",
    lang: "fr",
    oneLiner: false,
  },
  {
    setup: "Toc toc.",
    punchline: "Qui est là ? Feur. Feur qui ? Feur de rire, c'est une blague de John.",
    category: "knock-knock",
    lang: "fr",
    oneLiner: false,
  },
  {
    setup: "Un octet arrive chez le médecin.",
    punchline: "Docteur, je me sens un peu décomposé.",
    category: "programming",
    lang: "fr",
    oneLiner: false,
  },
  {
    setup: "Chuck Norris a déjà compté jusqu'à l'infini.",
    punchline: "Deux fois.",
    category: "chuck",
    lang: "fr",
    oneLiner: false,
  },
];

export function normalizeJokeCategory(raw?: string | null): JokeCategory {
  const v = (raw ?? "any").trim().toLowerCase();
  return (JOKE_CATEGORIES as readonly string[]).includes(v) ? (v as JokeCategory) : "any";
}

export function normalizeJokeLang(raw?: string | null): JokeLang {
  const v = (raw ?? "fr").trim().toLowerCase();
  return v === "en" ? "en" : "fr";
}

export function normalizeJokeStyle(raw?: string | null): JokeStyle {
  const v = (raw ?? "any").trim().toLowerCase();
  if (v === "single" || v === "oneliner" || v === "one-liner") return "single";
  if (v === "twopart" || v === "two-part" || v === "setup") return "twopart";
  return "any";
}

export function buildJokeApiUrl(
  category: JokeCategory,
  lang: JokeLang,
  style: JokeStyle,
): string | null {
  const path = JOKEAPI_PATH[category === "dad" && lang === "fr" ? "pun" : category];
  if (!path) return null;
  let url = `https://v2.jokeapi.dev/joke/${path}?lang=${lang}&safe-mode`;
  if (style === "single" || style === "twopart") url += `&type=${style}`;
  return url;
}

function pickFallback(category: JokeCategory, lang: JokeLang): Joke {
  const pool = FR_FALLBACKS.filter(
    (j) => j.lang === lang && (category === "any" || j.category === category),
  );
  const list = pool.length > 0 ? pool : lang === "fr" ? FR_FALLBACKS : FR_FALLBACKS;
  return list[Math.floor(Math.random() * list.length)];
}

async function fetchJson(url: string): Promise<unknown | null> {
  const res = await fetch(url, {
    signal: AbortSignal.timeout(8000),
    headers: { Accept: "application/json", "User-Agent": "John Discord bot" },
  });
  if (!res.ok) return null;
  return res.json();
}

function fromJokeApi(
  data: {
    error?: boolean;
    type?: string;
    joke?: string;
    setup?: string;
    delivery?: string;
    category?: string;
    lang?: string;
  },
  fallbackLang: JokeLang,
): Joke | null {
  if (data.error) return null;
  if (data.type === "single" && data.joke) {
    return {
      setup: data.joke,
      punchline: "",
      category: (data.category ?? "any").toLowerCase(),
      lang: data.lang === "en" ? "en" : fallbackLang,
      oneLiner: true,
    };
  }
  if (data.setup && data.delivery) {
    return {
      setup: data.setup,
      punchline: data.delivery,
      category: (data.category ?? "any").toLowerCase(),
      lang: data.lang === "en" ? "en" : fallbackLang,
      oneLiner: false,
    };
  }
  return null;
}

async function fetchDadJoke(): Promise<Joke | null> {
  const res = await fetch("https://icanhazdadjoke.com/", {
    signal: AbortSignal.timeout(8000),
    headers: { Accept: "text/plain", "User-Agent": "John Discord bot" },
  });
  if (!res.ok) return null;
  const text = (await res.text()).trim();
  if (!text) return null;
  return { setup: text, punchline: "", category: "dad", lang: "en", oneLiner: true };
}

async function fetchChuckJoke(): Promise<Joke | null> {
  const data = (await fetchJson("https://api.chucknorris.io/jokes/random")) as {
    value?: string;
  } | null;
  if (!data?.value) return null;
  return { setup: data.value, punchline: "", category: "chuck", lang: "en", oneLiner: true };
}

async function fetchKnockJoke(): Promise<Joke | null> {
  const data = (await fetchJson(
    "https://official-joke-api.appspot.com/jokes/knock-knock/random",
  )) as
    Array<{ setup?: string; punchline?: string }> | { setup?: string; punchline?: string } | null;
  const row = Array.isArray(data) ? data[0] : data;
  if (!row?.setup || !row.punchline) return null;
  return {
    setup: row.setup,
    punchline: row.punchline,
    category: "knock-knock",
    lang: "en",
    oneLiner: false,
  };
}

/** Compatible avec l'ancien getJoke() : setup + punchline. */
export async function getJoke(opts: JokeRequest = {}): Promise<Joke | null> {
  const category = normalizeJokeCategory(opts.category);
  const lang = normalizeJokeLang(opts.lang);
  const style = normalizeJokeStyle(opts.style);

  try {
    if (category === "chuck") {
      return (await fetchChuckJoke()) ?? pickFallback("chuck", lang);
    }
    if (category === "dad" && lang !== "fr") {
      return (await fetchDadJoke()) ?? pickFallback("dad", "fr");
    }
    if (category === "knock-knock" && lang !== "fr") {
      return (await fetchKnockJoke()) ?? pickFallback("knock-knock", "fr");
    }

    const url = buildJokeApiUrl(category, lang, style);
    if (url) {
      const data = (await fetchJson(url)) as Parameters<typeof fromJokeApi>[0] | null;
      const parsed = data ? fromJokeApi(data, lang) : null;
      if (parsed) return parsed;
    }

    if (lang === "en") {
      const data = (await fetchJson("https://official-joke-api.appspot.com/random_joke")) as {
        setup?: string;
        punchline?: string;
      } | null;
      if (data?.setup && data.punchline) {
        return {
          setup: data.setup,
          punchline: data.punchline,
          category,
          lang: "en",
          oneLiner: false,
        };
      }
    }

    return pickFallback(category, lang);
  } catch (error) {
    logger.warn(`[Joke] ${error instanceof Error ? error.message : String(error)}`);
    return pickFallback(category, lang);
  }
}
