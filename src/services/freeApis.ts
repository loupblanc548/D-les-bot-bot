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
import Parser from "rss-parser";

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
        const storyRes = await fetch(`https://hacker-news.firebaseio.com/v0/item/${id}.json`, {
          signal: AbortSignal.timeout(5000),
        });
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
      const match = input.match(/rgb\((\d+),\s*(\d+),\s*(\d+)\)/i);
      if (!match) return null;
      r = parseInt(match[1]);
      g = parseInt(match[2]);
      b = parseInt(match[3]);
    } else if (input.startsWith("hsl")) {
      const match = input.match(/hsl\((\d+),\s*(\d+)%,\s*(\d+)%\)/i);
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

// ─── 21. Pollinations.ai — Génération d'images gratuite (sans clé) ───────────

export async function generateImage(
  prompt: string,
  width = 1024,
  height = 1024,
): Promise<string> {
  const seed = Math.floor(Math.random() * 1000000);
  return `https://image.pollinations.ai/prompt/${encodeURIComponent(prompt)}?width=${width}&height=${height}&seed=${seed}&nologo=true`;
}

// ─── 22. StreamElements TTS — Voix gratuite (sans clé) ────────────────────────

export function generateTTSUrl(text: string, voice = "Brian"): string {
  return `https://api.streamelements.com/kappa/v2/speech?voice=${encodeURIComponent(voice)}&text=${encodeURIComponent(text.slice(0, 500))}`;
}

export const TTS_VOICES = [
  "Brian", "Emma", "Joey", "Matthew", "Russell", "Amy", "Charlotte",
  "Justin", "Kendra", "Salli", "Joanna", "Ivy", "Raveena", "Nicole",
  "Celine", "Mathieu", "Chantal", "Marlene", "Hans", "Vicki",
];

// ─── 23. NASA APOD — Astronomy Picture of the Day ─────────────────────────────

export async function getNasaApod(date?: string): Promise<{
  title: string; explanation: string; url: string; mediaType: string; date: string;
} | null> {
  try {
    const apiKey = process.env.NASA_API_KEY ?? "DEMO_KEY";
    const dateParam = date ? `&date=${date}` : "";
    const res = await fetch(
      `https://api.nasa.gov/planetary/apod?api_key=${apiKey}${dateParam}`,
      { signal: AbortSignal.timeout(10_000) },
    );
    if (!res.ok) return null;
    const data = (await res.json()) as {
      title: string; explanation: string; url: string; media_type: string; date: string;
    };
    return {
      title: data.title,
      explanation: data.explanation.slice(0, 1000),
      url: data.url,
      mediaType: data.media_type,
      date: data.date,
    };
  } catch {
    return null;
  }
}

// ─── 24. USGS Earthquakes — Séismes temps réel (sans clé) ────────────────────

export async function getEarthquakes(
  minMagnitude = 4.5,
  limit = 10,
): Promise<Array<{
  magnitude: number; place: string; time: string; url: string;
  coords: { lat: number; lng: number };
}>> {
  try {
    const res = await fetch(
      `https://earthquake.usgs.gov/earthquakes/feed/v1.0/summary/all_${minMagnitude}.geojson`,
      { signal: AbortSignal.timeout(10_000) },
    );
    if (!res.ok) return [];
    const data = (await res.json()) as {
      features: Array<{
        properties: { mag: number; place: string; time: number; url: string };
        geometry: { coordinates: [number, number, number] };
      }>;
    };
    return (data.features ?? []).slice(0, limit).map((f) => ({
      magnitude: f.properties.mag,
      place: f.properties.place ?? "Unknown",
      time: new Date(f.properties.time).toISOString(),
      url: f.properties.url,
      coords: { lng: f.geometry.coordinates[0], lat: f.geometry.coordinates[1] },
    }));
  } catch {
    return [];
  }
}

// ─── 25. Chess.com — Stats joueur (sans clé) ──────────────────────────────────

export async function getChessStats(username: string): Promise<{
  username: string;
  stats: Array<{ mode: string; rating: number; best: number; games: number; wins: number; losses: number; draws: number }>;
} | null> {
  try {
    const res = await fetch(
      `https://api.chess.com/pub/player/${encodeURIComponent(username.toLowerCase())}/stats`,
      { signal: AbortSignal.timeout(8_000) },
    );
    if (!res.ok) return null;
    const data = (await res.json()) as Record<string, {
      last?: { rating: number }; best?: { rating: number };
      record?: { win: number; loss: number; draw: number };
    }>;
    const modeMap: Record<string, string> = {
      chess_rapid: "Rapid", chess_bullet: "Bullet", chess_blitz: "Blitz",
      chess_daily: "Daily", tactics: "Tactics", puzzle_rush: "Puzzle Rush",
    };
    const stats = Object.entries(data)
      .filter(([, v]) => v.last?.rating)
      .map(([k, v]) => ({
        mode: modeMap[k] ?? k,
        rating: v.last!.rating,
        best: v.best?.rating ?? 0,
        games: v.record ? v.record.win + v.record.loss + v.record.draw : 0,
        wins: v.record?.win ?? 0,
        losses: v.record?.loss ?? 0,
        draws: v.record?.draw ?? 0,
      }));
    return { username, stats };
  } catch {
    return null;
  }
}

// ─── 26. Lichess — Stats joueur (sans clé) ────────────────────────────────────

export async function getLichessStats(username: string): Promise<{
  username: string;
  perfs: Array<{ mode: string; rating: number; games: number }>;
  playTime: string;
} | null> {
  try {
    const res = await fetch(
      `https://lichess.org/api/user/${encodeURIComponent(username.toLowerCase())}`,
      { signal: AbortSignal.timeout(8_000) },
    );
    if (!res.ok) return null;
    const data = (await res.json()) as {
      perfs?: Record<string, { rating: number; games: number }>;
      playTime?: { total: number };
    };
    const perfs = Object.entries(data.perfs ?? {}).map(([mode, v]) => ({
      mode, rating: v.rating, games: v.games,
    }));
    const hours = Math.floor((data.playTime?.total ?? 0) / 3600);
    return { username, perfs, playTime: `${hours}h` };
  } catch {
    return null;
  }
}

// ─── 27. OpenLibrary — Recherche de livres (sans clé) ────────────────────────

export async function searchBooks(query: string, limit = 5): Promise<
  Array<{ title: string; author: string; year: number | null; cover: string | null; url: string }>
> {
  try {
    const res = await fetch(
      `https://openlibrary.org/search.json?q=${encodeURIComponent(query)}&limit=${limit}`,
      { signal: AbortSignal.timeout(8_000) },
    );
    if (!res.ok) return [];
    const data = (await res.json()) as {
      docs: Array<{
        title: string; author_name?: string[];
        first_publish_year?: number; cover_i?: number; key: string;
      }>;
    };
    return (data.docs ?? []).map((d) => ({
      title: d.title,
      author: d.author_name?.[0] ?? "Unknown",
      year: d.first_publish_year ?? null,
      cover: d.cover_i ? `https://covers.openlibrary.org/b/id/${d.cover_i}-M.jpg` : null,
      url: `https://openlibrary.org${d.key}`,
    }));
  } catch {
    return [];
  }
}

// ─── 28. Open Food Facts — Base alimentaire (sans clé) ───────────────────────

export async function searchFood(query: string, limit = 5): Promise<
  Array<{ name: string; brand: string; calories: number | null; nutriscore: string | null; url: string }>
> {
  try {
    const res = await fetch(
      `https://world.openfoodfacts.org/cgi/search.pl?search_terms=${encodeURIComponent(query)}&search_simple=1&action=process&json=1&page_size=${limit}`,
      { signal: AbortSignal.timeout(8_000) },
    );
    if (!res.ok) return [];
    const data = (await res.json()) as {
      products: Array<{
        product_name?: string; brands?: string; energy_100g?: number;
        nutriscore_grade?: string; url?: string;
      }>;
    };
    return (data.products ?? []).map((p) => ({
      name: p.product_name ?? "Unknown",
      brand: p.brands ?? "Unknown",
      calories: p.energy_100g ? Math.round(p.energy_100g / 4.184) : null,
      nutriscore: p.nutriscore_grade ?? null,
      url: p.url ?? "",
    }));
  } catch {
    return [];
  }
}

// ─── 29. arXiv — Papers scientifiques (sans clé) ──────────────────────────────

export async function searchArxiv(query: string, limit = 5): Promise<
  Array<{ title: string; authors: string; summary: string; published: string; url: string }>
> {
  try {
    const res = await fetch(
      `https://export.arxiv.org/api/query?search_query=all:${encodeURIComponent(query)}&max_results=${limit}&sortBy=relevance`,
      { signal: AbortSignal.timeout(10_000) },
    );
    if (!res.ok) return [];
    const text = await res.text();
    const rssParserLocal = new Parser();
    const feed = await rssParserLocal.parseString(text);
    return feed.items.map((item) => ({
      title: item.title?.trim() ?? "",
      authors: item.creator ?? "Unknown",
      summary: (item.contentSnippet ?? "").slice(0, 500),
      published: item.isoDate ?? "",
      url: item.link ?? "",
    }));
  } catch {
    return [];
  }
}

// ─── 30. OpenSky — Suivi de vols (sans clé) ───────────────────────────────────

export async function getFlights(): Promise<
  Array<{ callsign: string; origin: string; altitude: number; velocity: number; heading: number }>
> {
  try {
    const res = await fetch("https://opensky-network.org/api/states/all", {
      signal: AbortSignal.timeout(10_000),
    });
    if (!res.ok) return [];
    const data = (await res.json()) as {
      states: Array<[string, string, string, number, number, number, number, number, number, number, number, number, number]> | null;
    };
    if (!data.states) return [];
    return data.states.slice(0, 20).map((s) => ({
      callsign: (s[1] ?? "").trim() || "N/A",
      origin: s[2] ?? "N/A",
      altitude: Math.round((s[7] ?? 0) * 3.281),
      velocity: Math.round((s[9] ?? 0) * 3.6),
      heading: Math.round(s[10] ?? 0),
    }));
  } catch {
    return [];
  }
}

// ─── 31. Google Trends — Tendances (sans clé) ────────────────────────────────

export async function getGoogleTrends(country = "FR"): Promise<
  Array<{ title: string; traffic: string; url: string }>
> {
  try {
    const res = await fetch(
      `https://trends.google.com/trending/rss?geo=${encodeURIComponent(country)}`,
      { signal: AbortSignal.timeout(10_000) },
    );
    if (!res.ok) return [];
    const text = await res.text();
    const rssParserLocal = new Parser();
    const feed = await rssParserLocal.parseString(text);
    return feed.items.slice(0, 20).map((item) => ({
      title: item.title ?? "",
      traffic: (item.contentSnippet ?? "").split(" ")[0] ?? "",
      url: item.link ?? "",
    }));
  } catch {
    return [];
  }
}

// ─── 32. RSSHub — Universal RSS (Twitter/Insta/TikTok sans API payante) ──────

const RSSHUB_URL = process.env.RSSHUB_URL ?? "https://rsshub.app";

export async function getRssHubFeed(route: string, limit = 10): Promise<
  Array<{ title: string; link: string; content: string; pubDate: string; author: string }>
> {
  try {
    const url = `${RSSHUB_URL}/${route.replace(/^\//, "")}`;
    const res = await fetch(url, { signal: AbortSignal.timeout(10_000) });
    if (!res.ok) return [];
    const text = await res.text();
    const rssParserLocal = new Parser();
    const feed = await rssParserLocal.parseString(text);
    return feed.items.slice(0, limit).map((item) => ({
      title: item.title ?? "",
      link: item.link ?? "",
      content: (item.contentSnippet ?? "").slice(0, 500),
      pubDate: item.isoDate ?? "",
      author: item.creator ?? "",
    }));
  } catch {
    return [];
  }
}

export function isRssHubConfigured(): boolean {
  return !!process.env.RSSHUB_URL;
}

// ─── 33. Dev.to — Articles tech (sans clé) ───────────────────────────────────

export async function getDevToArticles(tag?: string, limit = 5): Promise<
  Array<{ title: string; url: string; author: string; tags: string; reactions: number }>
> {
  try {
    const url = tag
      ? `https://dev.to/api/articles?tag=${encodeURIComponent(tag)}&per_page=${limit}`
      : `https://dev.to/api/articles?per_page=${limit}`;
    const res = await fetch(url, { signal: AbortSignal.timeout(8_000) });
    if (!res.ok) return [];
    const data = (await res.json()) as Array<{
      title: string; url: string; user: { username: string };
      tag_list?: string[]; positive_reactions_count: number;
    }>;
    return (data ?? []).map((a) => ({
      title: a.title,
      url: a.url,
      author: a.user?.username ?? "Unknown",
      tags: (a.tag_list ?? []).join(", "),
      reactions: a.positive_reactions_count ?? 0,
    }));
  } catch {
    return [];
  }
}

// ─── 34. Cat API (sans clé) ───────────────────────────────────────────────────

export async function getCatImage(): Promise<string | null> {
  try {
    const res = await fetch("https://api.thecatapi.com/v1/images/search", {
      signal: AbortSignal.timeout(5_000),
    });
    if (!res.ok) return null;
    const data = (await res.json()) as Array<{ url: string }>;
    return data[0]?.url ?? null;
  } catch {
    return null;
  }
}

// ─── 35. PokeAPI (sans clé) ───────────────────────────────────────────────────

export async function getPokemon(nameOrId: string): Promise<{
  name: string; id: number; height: number; weight: number;
  types: string[]; stats: Array<{ name: string; value: number }>; sprite: string;
} | null> {
  try {
    const res = await fetch(`https://pokeapi.co/api/v2/pokemon/${encodeURIComponent(nameOrId.toLowerCase())}`, {
      signal: AbortSignal.timeout(8_000),
    });
    if (!res.ok) return null;
    const data = (await res.json()) as {
      name: string; id: number; height: number; weight: number;
      types: Array<{ type: { name: string } }>;
      stats: Array<{ base_stat: number; stat: { name: string } }>;
      sprites: { front_default: string };
    };
    return {
      name: data.name, id: data.id,
      height: data.height / 10, weight: data.weight / 10,
      types: data.types.map((t) => t.type.name),
      stats: data.stats.map((s) => ({ name: s.stat.name, value: s.base_stat })),
      sprite: data.sprites.front_default,
    };
  } catch {
    return null;
  }
}

// ─── 36. NPM registry (sans clé) ──────────────────────────────────────────────

export async function getNpmPackage(name: string): Promise<{
  name: string; version: string; description: string; author: string; license: string; homepage: string;
} | null> {
  try {
    const res = await fetch(`https://registry.npmjs.org/${encodeURIComponent(name)}/latest`, {
      signal: AbortSignal.timeout(8_000),
    });
    if (!res.ok) return null;
    const data = (await res.json()) as {
      name: string; version: string; description: string;
      author?: { name: string } | string; license?: string; homepage?: string;
    };
    return {
      name: data.name, version: data.version,
      description: (data.description ?? "").slice(0, 300),
      author: typeof data.author === "string" ? data.author : (data.author?.name ?? "Unknown"),
      license: data.license ?? "Unknown",
      homepage: data.homepage ?? `https://www.npmjs.com/package/${name}`,
    };
  } catch {
    return null;
  }
}

// ─── 37. PyPI (sans clé) ──────────────────────────────────────────────────────

export async function getPypiPackage(name: string): Promise<{
  name: string; version: string; summary: string; author: string; license: string; homepage: string;
} | null> {
  try {
    const res = await fetch(`https://pypi.org/pypi/${encodeURIComponent(name)}/json`, {
      signal: AbortSignal.timeout(8_000),
    });
    if (!res.ok) return null;
    const data = (await res.json()) as {
      info: { name: string; version: string; summary: string; author: string; license: string; home_page: string };
    };
    return {
      name: data.info.name, version: data.info.version,
      summary: (data.info.summary ?? "").slice(0, 300),
      author: data.info.author ?? "Unknown",
      license: data.info.license ?? "Unknown",
      homepage: data.info.home_page ?? `https://pypi.org/project/${name}/`,
    };
  } catch {
    return null;
  }
}

// ─── 38. REST Countries (sans clé) ────────────────────────────────────────────

export async function getCountryInfo(name: string): Promise<{
  name: string; capital: string; population: number; region: string;
  languages: string[]; currencies: string[]; flag: string;
} | null> {
  try {
    const res = await fetch(
      `https://restcountries.com/v3.1/name/${encodeURIComponent(name)}?fields=name,capital,population,region,languages,currencies,flag`,
      { signal: AbortSignal.timeout(8_000) },
    );
    if (!res.ok) return null;
    const data = (await res.json()) as Array<{
      name: { common: string }; capital?: string[]; population: number;
      region: string; languages?: Record<string, string>;
      currencies?: Record<string, { name: string }>; flag: string;
    }>;
    const c = data[0];
    if (!c) return null;
    return {
      name: c.name.common,
      capital: c.capital?.[0] ?? "N/A",
      population: c.population,
      region: c.region,
      languages: Object.values(c.languages ?? {}),
      currencies: Object.keys(c.currencies ?? {}),
      flag: c.flag,
    };
  } catch {
    return null;
  }
}

// ─── 39. Urban Dictionary (sans clé) ──────────────────────────────────────────

export async function getUrbanDict(term: string): Promise<{
  word: string; definition: string; example: string;
} | null> {
  try {
    const res = await fetch(`https://api.urbandictionary.com/v0/define?term=${encodeURIComponent(term)}`, {
      signal: AbortSignal.timeout(8_000),
    });
    if (!res.ok) return null;
    const data = (await res.json()) as {
      list: Array<{ word: string; definition: string; example: string }>;
    };
    const entry = data.list?.[0];
    if (!entry) return null;
    return {
      word: entry.word,
      definition: entry.definition.slice(0, 500),
      example: entry.example.slice(0, 300),
    };
  } catch {
    return null;
  }
}

// ─── 40. Currency exchange (exchangerate.host — sans clé) ────────────────────

export async function getCurrencyRate(from: string, to: string, amount = 1): Promise<{
  from: string; to: string; rate: number; result: number;
} | null> {
  try {
    const res = await fetch(
      `https://api.exchangerate.host/live?source=${from.toUpperCase()}&currencies=${to.toUpperCase()}`,
      { signal: AbortSignal.timeout(8_000) },
    );
    if (!res.ok) return null;
    const data = (await res.json()) as { quotes: Record<string, number> };
    const key = `${from.toUpperCase()}${to.toUpperCase()}`;
    const rate = data.quotes?.[key];
    if (!rate) return null;
    return { from: from.toUpperCase(), to: to.toUpperCase(), rate, result: amount * rate };
  } catch {
    return null;
  }
}

// ─── 41. Random User (sans clé) ───────────────────────────────────────────────

export async function getRandomUser(): Promise<{
  name: string; gender: string; email: string; country: string; picture: string;
} | null> {
  try {
    const res = await fetch("https://randomuser.me/api/?nat=fr", {
      signal: AbortSignal.timeout(5_000),
    });
    if (!res.ok) return null;
    const data = (await res.json()) as {
      results: Array<{
        name: { first: string; last: string }; gender: string; email: string;
        location: { country: string }; picture: { large: string };
      }>;
    };
    const u = data.results?.[0];
    if (!u) return null;
    return {
      name: `${u.name.first} ${u.name.last}`,
      gender: u.gender, email: u.email,
      country: u.location.country, picture: u.picture.large,
    };
  } catch {
    return null;
  }
}

// ─── 42. Stock price (Alpha Vantage — gratuit, 500 req/jour) ─────────────────

export async function getStockPrice(symbol: string): Promise<{
  symbol: string; price: number; change: number; changePercent: number;
  high: number; low: number; volume: number;
} | null> {
  try {
    const apiKey = process.env.ALPHA_VANTAGE_API_KEY ?? "demo";
    const res = await fetch(
      `https://www.alphavantage.co/query?function=GLOBAL_QUOTE&symbol=${encodeURIComponent(symbol)}&apikey=${apiKey}`,
      { signal: AbortSignal.timeout(10_000) },
    );
    if (!res.ok) return null;
    const data = (await res.json()) as { "Global Quote": Record<string, string> };
    const q = data["Global Quote"];
    if (!q) return null;
    return {
      symbol: q["01. symbol"] ?? symbol,
      price: parseFloat(q["05. price"] ?? "0"),
      change: parseFloat(q["09. change"] ?? "0"),
      changePercent: parseFloat(q["10. change percent"]?.replace("%", "") ?? "0"),
      high: parseFloat(q["03. high"] ?? "0"),
      low: parseFloat(q["04. low"] ?? "0"),
      volume: parseInt(q["06. volume"] ?? "0", 10),
    };
  } catch {
    return null;
  }
}
