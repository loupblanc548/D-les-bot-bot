/**
 * info.ts — Sources de connaissances informatives
 * Dictionary, Scientific Articles, Fact Check, Trivia, Joke, Advice, TMDB, NASA APOD, This Day in History, Random User
 */

export async function fetchDictionary(query: string): Promise<string | null> {
  const lower = query.toLowerCase();
  const match =
    lower.match(/d[ée]finition(?:de\s+)?(.+)/) ||
    lower.match(/meaning of\s+(.+)/) ||
    lower.match(/que veut dire\s+(.+)/);
  if (!match) return null;

  const word = match[1].replace(/[?.!]/g, "").trim().split(/\s+/)[0];
  if (!word || word.length < 2) return null;

  try {
    const res = await fetch(
      `https://api.dictionaryapi.dev/api/v2/entries/en/${encodeURIComponent(word)}`,
      { signal: AbortSignal.timeout(5_000) },
    );
    if (!res.ok) return null;
    const data = (await res.json()) as Array<{
      meanings?: Array<{
        partOfSpeech?: string;
        definitions?: Array<{ definition?: string; example?: string }>;
      }>;
      phonetic?: string;
    }>;
    if (!data[0]?.meanings?.[0]) return null;

    const meanings = data[0].meanings.slice(0, 3);
    const lines = meanings.map((m) => {
      const def = m.definitions?.[0]?.definition || "";
      const pos = m.partOfSpeech || "";
      return `**${pos}**: ${def}`;
    });
    const phonetic = data[0].phonetic || "";
    return `📖 **${word}**${phonetic ? ` ${phonetic}` : ""}\n${lines.join("\n")}`;
  } catch {
    return null;
  }
}

export async function fetchScientificArticles(query: string): Promise<string | null> {
  const lower = query.toLowerCase();
  if (
    !lower.match(
      /article scientifique|scientific|recherche scientifique|study|paper|étude scientifique|publication/,
    )
  )
    return null;

  const searchTerm = lower
    .replace(
      /article scientifique sur|recherche scientifique sur|étude scientifique sur|scientific articles? about|study on|paper on|publication sur/,
      "",
    )
    .trim();
  if (!searchTerm || searchTerm.length < 3) return null;

  try {
    const res = await fetch(
      `https://api.crossref.org/works?query=${encodeURIComponent(searchTerm)}&rows=5&select=title,abstract,URL,published`,
      { signal: AbortSignal.timeout(8_000) },
    );
    if (!res.ok) return null;
    const data = (await res.json()) as {
      message?: {
        items?: Array<{ title?: string[]; URL?: string; published?: { dateParts?: number[][] } }>;
      };
    };
    const items = data.message?.items || [];
    if (items.length === 0) return null;

    const lines = items.map((item) => {
      const title = item.title?.[0] || "Sans titre";
      const year = item.published?.dateParts?.[0]?.[0] || "?";
      const url = item.URL || "";
      return `📄 **${title}** (${year})${url ? `\n   ${url}` : ""}`;
    });
    return `🔬 **Articles scientifiques:**\n${lines.join("\n")}`;
  } catch {
    return null;
  }
}

export async function fetchFactCheck(query: string): Promise<string | null> {
  const lower = query.toLowerCase();
  if (!lower.match(/vrai|faux|fact.?check|info ou intox|rumeur|fake news|true or false/))
    return null;

  const claim = lower
    .replace(
      /est.?ce que c'est vrai|vrai ou faux|fact check|rumeur|fake news|info ou intox|is it true|true or false/,
      "",
    )
    .trim();
  if (!claim || claim.length < 5) return null;

  try {
    const apiKey = process.env.GEMINI_API_KEY || process.env.GOOGLE_API_KEY;
    if (!apiKey) return null;
    const res = await fetch(
      `https://factchecktools.googleapis.com/v1factcheckclaims:search?query=${encodeURIComponent(claim)}&key=${apiKey}`,
      { signal: AbortSignal.timeout(8_000) },
    );
    if (!res.ok) return null;
    const data = (await res.json()) as {
      claims?: Array<{
        text?: string;
        claimReview?: Array<{
          textualRating?: string;
          publisher?: { name?: string };
          url?: string;
        }>;
      }>;
    };
    const claims = (data.claims || []).slice(0, 3);
    if (claims.length === 0) return null;

    const lines = claims.map((c) => {
      const review = c.claimReview?.[0];
      const rating = review?.textualRating || "Non vérifié";
      const publisher = review?.publisher?.name || "?";
      const url = review?.url || "";
      return `✅/❌ **${rating}** — ${publisher}${url ? `\n   ${url}` : ""}`;
    });
    return `🔍 **Fact-check:**\n${lines.join("\n")}`;
  } catch {
    return null;
  }
}

export async function fetchTrivia(query: string): Promise<string | null> {
  const lower = query.toLowerCase();
  if (!lower.match(/trivia|question quiz|quiz question|culture g[ée]n[ée]rale/)) return null;

  try {
    const res = await fetch(
      "https://opentdb.com/api.php?amount=1&type=multiple&difficulty=medium",
      { signal: AbortSignal.timeout(5_000) },
    );
    if (!res.ok) return null;
    const data = (await res.json()) as {
      results?: Array<{ question?: string; correct_answer?: string; incorrect_answers?: string[] }>;
    };
    const q = data.results?.[0];
    if (!q) return null;
    const answers = [q.correct_answer, ...(q.incorrect_answers || [])].sort(
      () => Math.random() - 0.5,
    );
    const letters = ["A", "B", "C", "D"];
    const options = answers.map((a, i) => `${letters[i]}) ${a}`).join("\n");
    return `🧠 **Question trivia:**\n❓ ${q.question}\n\n${options}\n\n*(Réponse: ${q.correct_answer})*`;
  } catch {
    return null;
  }
}

export async function fetchJoke(query: string): Promise<string | null> {
  const lower = query.toLowerCase();
  if (!lower.match(/blague|joke|fais.*rire|raconte.*blague/)) return null;

  try {
    const res = await fetch("https://official-joke-api.appspot.com/random_joke", {
      signal: AbortSignal.timeout(5_000),
    });
    if (!res.ok) return null;
    const data = (await res.json()) as { setup?: string; punchline?: string };
    if (!data.setup) return null;
    return `😄 **Blague:**\n${data.setup}\n\n${data.punchline}`;
  } catch {
    return null;
  }
}

export async function fetchAdvice(query: string): Promise<string | null> {
  const lower = query.toLowerCase();
  if (!lower.match(/conseil|advice|donne.*conseil/)) return null;

  try {
    const res = await fetch("https://api.adviceslip.com/advice", {
      signal: AbortSignal.timeout(5_000),
    });
    if (!res.ok) return null;
    const data = (await res.json()) as { slip?: { advice?: string } };
    if (!data.slip?.advice) return null;
    return `💡 **Conseil du jour:**\n${data.slip.advice}`;
  } catch {
    return null;
  }
}

export async function fetchTmdb(query: string): Promise<string | null> {
  const lower = query.toLowerCase();
  if (!lower.match(/film|movie|s[ée]rie|tv show|acteur|director|r[ée]alisateur/)) return null;

  const apiKey = process.env.TMDB_API_KEY;
  if (!apiKey) return null;

  const searchMatch = lower.match(/(?:film|movie|s[ée]rie|tv show)\s+(?:sur|about|de)\s+(.+)/);
  if (!searchMatch) return null;
  const searchTerm = searchMatch[1].replace(/[?.!]/g, "").trim();
  if (!searchTerm || searchTerm.length < 2) return null;

  try {
    const res = await fetch(
      `https://api.themoviedb.org/3/search/multi?api_key=${apiKey}&query=${encodeURIComponent(searchTerm)}&language=fr-FR&limit=3`,
      { signal: AbortSignal.timeout(8_000) },
    );
    if (!res.ok) return null;
    const data = (await res.json()) as {
      results?: Array<{
        title?: string;
        name?: string;
        overview?: string;
        release_date?: string;
        vote_average?: number;
        media_type?: string;
      }>;
    };
    const items = (data.results || [])
      .filter((r) => r.media_type === "movie" || r.media_type === "tv")
      .slice(0, 3);
    if (items.length === 0) return null;

    const lines = items.map((item) => {
      const title = item.title || item.name || "?";
      const year = item.release_date ? item.release_date.slice(0, 4) : "?";
      const rating = item.vote_average ? `⭐ ${item.vote_average.toFixed(1)}` : "";
      const overview = item.overview ? item.overview.slice(0, 150) + "..." : "";
      return `🎬 **${title}** (${year}) ${rating}\n${overview}`;
    });
    return `🎥 **Résultats TMDB:**\n${lines.join("\n\n")}`;
  } catch {
    return null;
  }
}

export async function fetchNasaApod(query: string): Promise<string | null> {
  const lower = query.toLowerCase();
  if (!lower.match(/nasa|astronomy|apod|photo du jour|image du jour.*espace/)) return null;

  const apiKey = process.env.NASA_API_KEY || "DEMO_KEY";
  try {
    const res = await fetch(`https://api.nasa.gov/planetary/apod?api_key=${apiKey}`, {
      signal: AbortSignal.timeout(8_000),
    });
    if (!res.ok) return null;
    const data = (await res.json()) as {
      title?: string;
      explanation?: string;
      url?: string;
      date?: string;
    };
    return `🚀 **NASA APOD — ${data.date || "?"}**\n\n**${data.title || "Image du jour"}**\n\n${data.explanation || ""}\n\n${data.url || ""}`;
  } catch {
    return null;
  }
}

export async function fetchThisDayInHistory(query: string): Promise<string | null> {
  const lower = query.toLowerCase();
  if (!lower.match(/ce jour|today in history|on this day|anniversaire.*histoire/)) return null;

  try {
    const date = new Date();
    const month = date.getMonth() + 1;
    const day = date.getDate();
    const res = await fetch(`https://byabbe.se/on-this-day/${month}/${day}/events.json`, {
      signal: AbortSignal.timeout(8_000),
    });
    if (!res.ok) return null;
    const data = (await res.json()) as {
      events?: Array<{ year?: string; description?: string }>;
    };
    const events = (data.events || []).slice(0, 5);
    if (events.length === 0) return null;
    const lines = events.map((e) => `📅 ${e.year} — ${e.description}`);
    return `📜 **Ce jour dans l'histoire (${day}/${month}):**\n${lines.join("\n")}`;
  } catch {
    return null;
  }
}

export async function fetchRandomUser(query: string): Promise<string | null> {
  const lower = query.toLowerCase();
  if (
    !lower.includes("utilisateur aléatoire") &&
    !lower.includes("random user") &&
    !lower.includes("faux profil") &&
    !lower.includes("fake user") &&
    !lower.includes("profil fictif")
  )
    return null;

  try {
    const url = "https://randomuser.me/api/?nat=fr";
    const res = await fetch(url, { signal: AbortSignal.timeout(5_000) });
    if (!res.ok) return null;
    const data = (await res.json()) as {
      results?: Array<{
        name?: { first?: string; last?: string };
        email?: string;
        phone?: string;
        location?: { city?: string; country?: string };
        picture?: { large?: string };
      }>;
    };
    const u = data.results?.[0];
    if (!u) return null;
    return `👤 **Profil aléatoire généré:**\n\n**Nom:** ${u.name?.first} ${u.name?.last}\n**Email:** ${u.email}\n**Téléphone:** ${u.phone}\n**Ville:** ${u.location?.city}, ${u.location?.country}\n**Avatar:** ${u.picture?.large}`;
  } catch {
    return null;
  }
}
