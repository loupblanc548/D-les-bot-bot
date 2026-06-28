/**
 * freeApis.ts — APIs 100% gratuites sans clé API
 *
 * Sources utilisées :
 * - Open-Meteo (météo, sans clé)
 * - is.gd (raccourcisseur d'URL, sans clé)
 * - Official Joke API (blagues EN, sans clé)
 * - ZenQuotes (citations, sans clé)
 * - Advice Slip (conseils, sans clé)
 * - Bored API (activités anti-ennui, sans clé)
 * - Numbers API (faits sur les nombres, sans clé)
 * - Dog API (photos de chiens, sans clé)
 * - Hacker News (Firebase API, sans clé)
 * - Reddit JSON (.json sur les subreddits, sans clé)
 * - Trivia API (questions trivia, sans clé)
 * - Dictionary API (définitions, sans clé)
 * - QR Server (génération QR code, sans clé)
 * - ip-api.com (géoloc IP, sans clé)
 */

import logger from "../utils/logger.js";

// ─── 1. Open-Meteo (météo gratuite, sans clé) ────────────────────────────────

export interface WeatherData {
  temperature: number;
  windspeed: number;
  weatherCode: number;
  description: string;
  city: string;
}

const WEATHER_CODES: Record<number, string> = {
  0: "Ciel dégagé",
  1: "Principalement dégagé",
  2: "Partiellement nuageux",
  3: "Couvert",
  45: "Brouillard",
  48: "Brouillard givrant",
  51: "Bruine légère",
  53: "Bruine modérée",
  55: "Bruine dense",
  61: "Pluie légère",
  63: "Pluie modérée",
  65: "Pluie forte",
  71: "Neige légère",
  73: "Neige modérée",
  75: "Neige forte",
  80: "Averses légères",
  81: "Averses modérées",
  82: "Averses violentes",
  95: "Orage",
  96: "Orage avec grêle légère",
  99: "Orage avec grêle forte",
};

export async function getWeather(city: string): Promise<WeatherData | null> {
  try {
    // Géocoding via Open-Meteo
    const geoUrl = `https://geocoding-api.open-meteo.com/v1/search?name=${encodeURIComponent(city)}&count=1&language=fr`;
    const geoRes = await fetch(geoUrl, { signal: AbortSignal.timeout(5000) });
    if (!geoRes.ok) throw new Error(`Geo ${geoRes.status}`);
    const geoData = (await geoRes.json()) as {
      results?: Array<{ latitude: number; longitude: number; name: string }>;
    };
    if (!geoData.results?.length) return null;

    const { latitude, longitude, name } = geoData.results[0];

    const weatherUrl = `https://api.open-meteo.com/v1/forecast?latitude=${latitude}&longitude=${longitude}&current=temperature_2m,windspeed_10m,weather_code`;
    const weatherRes = await fetch(weatherUrl, { signal: AbortSignal.timeout(5000) });
    if (!weatherRes.ok) throw new Error(`Weather ${weatherRes.status}`);
    const weatherData = (await weatherRes.json()) as {
      current: { temperature_2m: number; windspeed_10m: number; weather_code: number };
    };

    const code = weatherData.current.weather_code;
    return {
      temperature: weatherData.current.temperature_2m,
      windspeed: weatherData.current.windspeed_10m,
      weatherCode: code,
      description: WEATHER_CODES[code] ?? "Inconnu",
      city: name,
    };
  } catch (error) {
    logger.warn(
      `[FreeAPI] Weather error: ${error instanceof Error ? error.message : String(error)}`,
    );
    return null;
  }
}

// ─── 2. is.gd (raccourcisseur URL, sans clé) ──────────────────────────────────

export async function shortenUrl(url: string): Promise<string | null> {
  try {
    // Validate URL to prevent SSRF
    const parsed = new URL(url);
    if (!parsed.protocol.startsWith("http")) {
      throw new Error("Only http/https URLs are allowed");
    }
    const apiUrl = `https://is.gd/create.php?format=simple&url=${encodeURIComponent(url)}`;
    const res = await fetch(apiUrl, { signal: AbortSignal.timeout(5000) });
    if (!res.ok) throw new Error(`is.gd ${res.status}`);
    const text = await res.text();
    if (text.startsWith("http")) return text.trim();
    return null;
  } catch (error) {
    logger.warn(
      `[FreeAPI] Shorten URL error: ${error instanceof Error ? error.message : String(error)}`,
    );
    return null;
  }
}

// ─── 3. Official Joke API (sans clé) ──────────────────────────────────────────

export async function getJoke(): Promise<{ setup: string; punchline: string } | null> {
  try {
    const res = await fetch("https://official-joke-api.appspot.com/random_joke", {
      signal: AbortSignal.timeout(5000),
    });
    if (!res.ok) throw new Error(`Joke API ${res.status}`);
    const data = (await res.json()) as { setup: string; punchline: string };
    return data;
  } catch (error) {
    logger.warn(`[FreeAPI] Joke error: ${error instanceof Error ? error.message : String(error)}`);
    return null;
  }
}

// ─── 4. ZenQuotes (citations, sans clé) ───────────────────────────────────────

export async function getQuote(): Promise<{ quote: string; author: string } | null> {
  try {
    const res = await fetch("https://zenquotes.io/api/random", {
      signal: AbortSignal.timeout(5000),
    });
    if (!res.ok) throw new Error(`ZenQuotes ${res.status}`);
    const data = (await res.json()) as Array<{ q: string; a: string }>;
    if (!data?.length) return null;
    return { quote: data[0].q, author: data[0].a };
  } catch (error) {
    logger.warn(`[FreeAPI] Quote error: ${error instanceof Error ? error.message : String(error)}`);
    return null;
  }
}

// ─── 5. Advice Slip (conseils aléatoires, sans clé) ───────────────────────────

export async function getAdvice(): Promise<string | null> {
  try {
    const res = await fetch("https://api.adviceslip.com/advice", {
      signal: AbortSignal.timeout(5000),
    });
    if (!res.ok) throw new Error(`Advice ${res.status}`);
    const data = (await res.json()) as { slip: { advice: string } };
    return data.slip?.advice ?? null;
  } catch (error) {
    logger.warn(
      `[FreeAPI] Advice error: ${error instanceof Error ? error.message : String(error)}`,
    );
    return null;
  }
}

// ─── 6. Bored API (activités anti-ennui, sans clé) ────────────────────────────

export async function getActivity(): Promise<{
  activity: string;
  type: string;
  participants: number;
} | null> {
  try {
    const res = await fetch("https://www.boredapi.com/api/activity", {
      signal: AbortSignal.timeout(5000),
    });
    if (!res.ok) throw new Error(`Bored ${res.status}`);
    const data = (await res.json()) as { activity: string; type: string; participants: number };
    return data;
  } catch (error) {
    logger.warn(`[FreeAPI] Bored error: ${error instanceof Error ? error.message : String(error)}`);
    return null;
  }
}

// ─── 7. Numbers API (faits sur les nombres, sans clé) ─────────────────────────

export async function getNumberFact(number: number | "random"): Promise<string | null> {
  try {
    const n = number === "random" ? "random" : String(number);
    const res = await fetch(`http://numbersapi.com/${n}?json=true`, {
      signal: AbortSignal.timeout(5000),
    });
    if (!res.ok) throw new Error(`Numbers ${res.status}`);
    const data = (await res.json()) as { text: string };
    return data.text ?? null;
  } catch (error) {
    logger.warn(
      `[FreeAPI] Number fact error: ${error instanceof Error ? error.message : String(error)}`,
    );
    return null;
  }
}

// ─── 8. Dog API (photos de chiens, sans clé) ──────────────────────────────────

export async function getDogImage(): Promise<string | null> {
  try {
    const res = await fetch("https://dog.ceo/api/breeds/image/random", {
      signal: AbortSignal.timeout(5000),
    });
    if (!res.ok) throw new Error(`Dog API ${res.status}`);
    const data = (await res.json()) as { message: string };
    return data.message ?? null;
  } catch (error) {
    logger.warn(`[FreeAPI] Dog error: ${error instanceof Error ? error.message : String(error)}`);
    return null;
  }
}

// ─── 9. Hacker News (Firebase API, sans clé) ──────────────────────────────────

export async function getHackerNewsTop(
  limit = 5,
): Promise<Array<{ title: string; url: string; score: number }>> {
  try {
    const res = await fetch("https://hacker-news.firebaseio.com/v0/topstories.json", {
      signal: AbortSignal.timeout(5000),
    });
    if (!res.ok) throw new Error(`HN ${res.status}`);
    const ids = (await res.json()) as number[];
    const top = ids.slice(0, limit);

    const stories = await Promise.all(
      top.map(async (id) => {
        const storyRes = await fetch(`https://hacker-news.firebaseio.com/v0/item/${id}.json`);
        const story = (await storyRes.json()) as {
          title: string;
          url?: string;
          score: number;
        };
        return {
          title: story.title,
          url: story.url ?? `https://news.ycombinator.com/item?id=${id}`,
          score: story.score,
        };
      }),
    );
    return stories;
  } catch (error) {
    logger.warn(
      `[FreeAPI] HackerNews error: ${error instanceof Error ? error.message : String(error)}`,
    );
    return [];
  }
}

// ─── 10. Reddit JSON (mèmes, sans clé) ────────────────────────────────────────

export async function getMeme(): Promise<{
  title: string;
  url: string;
  subreddit: string;
  author: string;
} | null> {
  try {
    const res = await fetch("https://www.reddit.com/r/memes/hot.json?limit=20", {
      headers: { "User-Agent": "discord-bot-helldiver/1.0" },
      signal: AbortSignal.timeout(5000),
    });
    if (!res.ok) throw new Error(`Reddit memes ${res.status}`);
    const data = (await res.json()) as {
      data: {
        children: Array<{
          data: {
            title: string;
            url: string;
            subreddit: string;
            author: string;
            post_hint: string;
            stickied: boolean;
          };
        }>;
      };
    };

    const posts = data.data?.children
      ?.filter((c) => c.data.post_hint === "image" && !c.data.stickied)
      .map((c) => ({
        title: c.data.title,
        url: c.data.url,
        subreddit: c.data.subreddit,
        author: c.data.author,
      }));

    if (!posts?.length) return null;
    return posts[Math.floor(Math.random() * posts.length)];
  } catch (error) {
    logger.warn(`[FreeAPI] Meme error: ${error instanceof Error ? error.message : String(error)}`);
    return null;
  }
}

// ─── 11. Trivia API (sans clé) ────────────────────────────────────────────────

export async function getTriviaQuestion(): Promise<{
  category: string;
  question: string;
  difficulty: string;
  answers: string[];
  correctAnswer: string;
} | null> {
  try {
    const res = await fetch("https://opentdb.com/api.php?amount=1&type=multiple", {
      signal: AbortSignal.timeout(5000),
    });
    if (!res.ok) throw new Error(`Trivia ${res.status}`);
    const data = (await res.json()) as {
      results: Array<{
        category: string;
        question: string;
        difficulty: string;
        correct_answer: string;
        incorrect_answers: string[];
      }>;
    };

    if (!data.results?.length) return null;
    const r = data.results[0];
    const answers = [...r.incorrect_answers, r.correct_answer].sort(() => Math.random() - 0.5);

    // Décoder les entités HTML
    const decode = (s: string) =>
      s
        .replace(/&quot;/g, '"')
        .replace(/&#039;/g, "'")
        .replace(/&amp;/g, "&")
        .replace(/&lt;/g, "<")
        .replace(/&gt;/g, ">");

    return {
      category: decode(r.category),
      question: decode(r.question),
      difficulty: r.difficulty,
      answers: answers.map(decode),
      correctAnswer: decode(r.correct_answer),
    };
  } catch (error) {
    logger.warn(
      `[FreeAPI] Trivia error: ${error instanceof Error ? error.message : String(error)}`,
    );
    return null;
  }
}

// ─── 12. Dictionary API (définitions, sans clé) ───────────────────────────────

export async function defineWord(
  word: string,
): Promise<Array<{ partOfSpeech: string; definition: string; example?: string }>> {
  try {
    const res = await fetch(
      `https://api.dictionaryapi.dev/api/v2/entries/en/${encodeURIComponent(word)}`,
      {
        signal: AbortSignal.timeout(5000),
      },
    );
    if (!res.ok) return [];
    const data = (await res.json()) as Array<{
      meanings: Array<{
        partOfSpeech: string;
        definitions: Array<{ definition: string; example?: string }>;
      }>;
    }>;

    const results: Array<{ partOfSpeech: string; definition: string; example?: string }> = [];
    for (const entry of data) {
      for (const meaning of entry.meanings ?? []) {
        for (const def of meaning.definitions ?? []) {
          results.push({
            partOfSpeech: meaning.partOfSpeech,
            definition: def.definition,
            example: def.example,
          });
        }
      }
    }
    return results.slice(0, 5);
  } catch (error) {
    logger.warn(
      `[FreeAPI] Define error: ${error instanceof Error ? error.message : String(error)}`,
    );
    return [];
  }
}

// ─── 13. QR Server (génération QR code, sans clé) ─────────────────────────────

export function getQrCodeUrl(text: string, size = 300): string {
  return `https://api.qrserver.com/v1/create-qr-code/?size=${size}x${size}&data=${encodeURIComponent(text)}`;
}

// ─── 14. ip-api.com (géolocalisation IP, sans clé) ────────────────────────────

export async function getIpInfo(ip: string): Promise<{
  ip: string;
  city: string;
  region: string;
  country: string;
  isp: string;
  lat: number;
  lon: number;
} | null> {
  try {
    // Validate IP format to prevent injection
    const ipRegex = /^(\d{1,3}\.){3}\d{1,3}$|^[a-fA-F0-9:]+$/;
    if (!ipRegex.test(ip)) {
      throw new Error("Invalid IP format");
    }
    const res = await fetch(
      `http://ip-api.com/json/${encodeURIComponent(ip)}?fields=status,message,query,city,regionName,country,isp,lat,lon`,
      {
        signal: AbortSignal.timeout(5000),
      },
    );
    if (!res.ok) throw new Error(`ip-api ${res.status}`);
    const data = (await res.json()) as {
      status: string;
      query: string;
      city: string;
      regionName: string;
      country: string;
      isp: string;
      lat: number;
      lon: number;
    };
    if (data.status !== "success") return null;
    return {
      ip: data.query,
      city: data.city,
      region: data.regionName,
      country: data.country,
      isp: data.isp,
      lat: data.lat,
      lon: data.lon,
    };
  } catch (error) {
    logger.warn(
      `[FreeAPI] IP info error: ${error instanceof Error ? error.message : String(error)}`,
    );
    return null;
  }
}

// ─── 15. Speedrun.com API (records de speedrun, sans clé) ─────────────────────

export async function getSpeedrunRecords(
  gameName: string,
  limit = 5,
): Promise<Array<{ game: string; category: string; runner: string; time: string; url: string }>> {
  try {
    // Recherche du jeu
    const searchRes = await fetch(
      `https://www.speedrun.com/api/v1/games?name=${encodeURIComponent(gameName)}&limit=1`,
      { signal: AbortSignal.timeout(5000) },
    );
    if (!searchRes.ok) return [];
    const searchData = (await searchRes.json()) as {
      data: Array<{ id: string; names: { international: string } }>;
    };
    if (!searchData.data?.length) return [];

    const gameId = searchData.data[0].id;
    const gameTitle = searchData.data[0].names.international;

    // Records du jeu
    const recordsRes = await fetch(
      `https://www.speedrun.com/api/v1/games/${gameId}/records?top=1&limit=${limit}`,
      { signal: AbortSignal.timeout(5000) },
    );
    if (!recordsRes.ok) return [];
    const recordsData = (await recordsRes.json()) as {
      data: Array<{
        category: string;
        runs: Array<{
          run: { times: { primary_t: number }; players: Array<{ name?: string; id?: string }> };
        }>;
      }>;
    };

    return recordsData.data
      .filter((r) => r.runs?.length > 0)
      .slice(0, limit)
      .map((r) => {
        const run = r.runs[0].run;
        const seconds = run.times.primary_t;
        const h = Math.floor(seconds / 3600);
        const m = Math.floor((seconds % 3600) / 60);
        const s = Math.floor(seconds % 60);
        const timeStr =
          h > 0
            ? `${h}h${String(m).padStart(2, "0")}m${String(s).padStart(2, "0")}s`
            : `${m}m${String(s).padStart(2, "0")}s`;
        return {
          game: gameTitle,
          category: r.category,
          runner: run.players?.[0]?.name ?? "Unknown",
          time: timeStr,
          url: `https://www.speedrun.com/${gameId}`,
        };
      });
  } catch (error) {
    logger.warn(
      `[FreeAPI] Speedrun error: ${error instanceof Error ? error.message : String(error)}`,
    );
    return [];
  }
}

// ─── 16. GitHub API publique (repos, users, sans clé) ─────────────────────────

export async function searchGithubRepos(
  query: string,
  limit = 5,
): Promise<
  Array<{
    name: string;
    fullName: string;
    url: string;
    stars: number;
    description: string;
    language: string;
  }>
> {
  try {
    const res = await fetch(
      `https://api.github.com/search/repositories?q=${encodeURIComponent(query)}&sort=stars&per_page=${limit}`,
      {
        headers: { Accept: "application/vnd.github.v3+json" },
        signal: AbortSignal.timeout(5000),
      },
    );
    if (!res.ok) throw new Error(`GitHub ${res.status}`);
    const data = (await res.json()) as {
      items: Array<{
        name: string;
        full_name: string;
        html_url: string;
        stargazers_count: number;
        description: string | null;
        language: string | null;
      }>;
    };

    return (data.items ?? []).map((r) => ({
      name: r.name,
      fullName: r.full_name,
      url: r.html_url,
      stars: r.stargazers_count,
      description: r.description ?? "",
      language: r.language ?? "N/A",
    }));
  } catch (error) {
    logger.warn(
      `[FreeAPI] GitHub error: ${error instanceof Error ? error.message : String(error)}`,
    );
    return [];
  }
}

// ─── 17. Générateur de mot de passe (local, aucun appel API) ──────────────────

export function generatePassword(length: number = 16, useSymbols: boolean = true): string {
  const lowercase = "abcdefghijklmnopqrstuvwxyz";
  const uppercase = "ABCDEFGHIJKLMNOPQRSTUVWXYZ";
  const numbers = "0123456789";
  const symbols = "!@#$%^&*()_+-=[]{}|;:,.<>?";
  let chars = lowercase + uppercase + numbers;
  if (useSymbols) chars += symbols;

  let password = "";
  const array = new Uint32Array(length);
  crypto.getRandomValues(array);
  for (let i = 0; i < length; i++) {
    password += chars[array[i] % chars.length];
  }
  return password;
}

// ─── 18. Convertisseur de couleurs (local) ────────────────────────────────────

export function convertColor(input: string): { hex: string; rgb: string; hsl: string } | null {
  try {
    let r: number, g: number, b: number;

    if (input.startsWith("#")) {
      const hex = input.slice(1);
      r = parseInt(hex.slice(0, 2), 16);
      g = parseInt(hex.slice(2, 4), 16);
      b = parseInt(hex.slice(4, 6), 16);
    } else if (input.startsWith("rgb")) {
      const match = input.match(/rgb\?\((\d+),\s*(\d+),\s*(\d+)\)/i);
      if (!match) return null;
      r = parseInt(match[1]);
      g = parseInt(match[2]);
      b = parseInt(match[3]);
    } else if (input.startsWith("hsl")) {
      const match = input.match(/hsl\?\((\d+),\s*(\d+)%,\s*(\d+)%\)/i);
      if (!match) return null;
      const h = parseInt(match[1]) / 360;
      const s = parseInt(match[2]) / 100;
      const l = parseInt(match[3]) / 100;
      const hue2rgb = (p: number, q: number, t: number) => {
        if (t < 0) t += 1;
        if (t > 1) t -= 1;
        if (t < 1 / 6) return p + (q - p) * 6 * t;
        if (t < 1 / 2) return q;
        if (t < 2 / 3) return p + (q - p) * (2 / 3 - t) * 6;
        return p;
      };
      const q = l < 0.5 ? l * (1 + s) : l + s - l * s;
      const p = 2 * l - q;
      r = Math.round(hue2rgb(p, q, h + 1 / 3) * 255);
      g = Math.round(hue2rgb(p, q, h) * 255);
      b = Math.round(hue2rgb(p, q, h - 1 / 3) * 255);
    } else {
      return null;
    }

    if (r > 255 || g > 255 || b > 255 || r < 0 || g < 0 || b < 0) return null;

    const toHex = (n: number) => n.toString(16).padStart(2, "0");
    const hex = `#${toHex(r)}${toHex(g)}${toHex(b)}`;
    const rgb = `rgb(${r}, ${g}, ${b})`;

    const rN = r / 255,
      gN = g / 255,
      bN = b / 255;
    const max = Math.max(rN, gN, bN),
      min = Math.min(rN, gN, bN);
    let h = 0,
      s = 0;
    const l = (max + min) / 2;
    if (max !== min) {
      const d = max - min;
      s = l > 0.5 ? d / (2 - max - min) : d / (max + min);
      switch (max) {
        case rN:
          h = (gN - bN) / d + (gN < bN ? 6 : 0);
          break;
        case gN:
          h = (bN - rN) / d + 2;
          break;
        case bN:
          h = (rN - gN) / d + 4;
          break;
      }
      h /= 6;
    }
    const hsl = `hsl(${Math.round(h * 360)}, ${Math.round(s * 100)}%, ${Math.round(l * 100)}%)`;

    return { hex, rgb, hsl };
  } catch {
    return null;
  }
}

// ─── 19. Base64 encode/decode (local) ─────────────────────────────────────────

export function encodeBase64(text: string): string {
  return Buffer.from(text, "utf-8").toString("base64");
}

export function decodeBase64(encoded: string): string | null {
  try {
    return Buffer.from(encoded, "base64").toString("utf-8");
  } catch {
    return null;
  }
}

// ─── 20. Timestamp Discord (local) ────────────────────────────────────────────

export function makeTimestamp(
  dateStr: string,
  format: string = "f",
): { timestamp: string; unix: number } | null {
  try {
    const date = new Date(dateStr);
    if (isNaN(date.getTime())) return null;
    const unix = Math.floor(date.getTime() / 1000);
    return { timestamp: `<t:${unix}:${format}>`, unix };
  } catch {
    return null;
  }
}
