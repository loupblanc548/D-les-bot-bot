import type { ToolCallResult } from "../agentTools.js";

const ok = (d: string): ToolCallResult => ({ success: true, data: d });
const err = (d: string): ToolCallResult => ({ success: false, data: d });

export async function toolSearchAnime(args: Record<string, unknown>): Promise<ToolCallResult> {
  const q = String(args.query || "").trim();
  const type = String(args.type || "anime").trim();
  if (!q) return err("Paramètre: query");
  try {
    const res = await fetch(`https://api.jikan.moe/v4/${type}?q=${encodeURIComponent(q)}&limit=3`, {
      signal: AbortSignal.timeout(10_000),
    });
    if (!res.ok) return err(`API error: ${res.status}`);
    const data = (await res.json()) as {
      data?: Array<{
        title: string;
        score?: number;
        episodes?: number;
        synopsis?: string;
        year?: number;
      }>;
    };
    const r = data.data || [];
    if (!r.length) return err(`Aucun ${type}`);
    return ok(
      `🎬 **${type} "${q}":**\n\n${r.map((a, i) => `${i + 1}. **${a.title}** ${a.year ? `(${a.year})` : ""}\n   Score: ${a.score || "N/A"} | Ép: ${a.episodes || "N/A"}\n   ${a.synopsis ? a.synopsis.slice(0, 180) + "..." : ""}`).join("\n\n")}`,
    );
  } catch (e) {
    return err(`Erreur: ${e}`);
  }
}

export async function toolIssTracker(_a: Record<string, unknown>): Promise<ToolCallResult> {
  try {
    const res = await fetch("http://api.open-notify.org/iss-now.json", {
      signal: AbortSignal.timeout(10_000),
    });
    const d = (await res.json()) as { iss_position?: { latitude: string; longitude: string } };
    const p = d.iss_position;
    if (!p) return err("Indisponible");
    return ok(
      `🛰️ **ISS**\nLat: ${p.latitude} | Lon: ${p.longitude}\n🌍 https://maps.google.com?q=${p.latitude},${p.longitude}`,
    );
  } catch (e) {
    return err(`Erreur: ${e}`);
  }
}

export async function toolMoonPhase(args: Record<string, unknown>): Promise<ToolCallResult> {
  const ds = String(args.date || new Date().toISOString().slice(0, 10));
  try {
    const date = new Date(ds);
    const synodic = 29.53058867;
    const known = new Date("2000-01-06").getTime();
    const pn = ((((date.getTime() - known) / 86400000) % synodic) + synodic) % synodic;
    const illum = Math.round(((1 - Math.cos((2 * Math.PI * pn) / synodic)) / 2) * 100);
    const phases = [
      "Nouvelle lune",
      "Premier croissant",
      "Premier quartier",
      "Gibbeuse croissante",
      "Pleine lune",
      "Gibbeuse décroissante",
      "Dernier quartier",
      "Dernier croissant",
    ];
    const idx = Math.floor((pn / synodic) * 8) % 8;
    const em = ["🌑", "🌒", "🌓", "🌔", "🌕", "🌖", "🌗", "🌘"];
    return ok(`${em[idx]} **Lune** (${ds})\nPhase: ${phases[idx]} | Illumination: ${illum}%`);
  } catch {
    return err("Date invalide");
  }
}

export async function toolRedditHot(args: Record<string, unknown>): Promise<ToolCallResult> {
  const sub = String(args.subreddit || "").trim();
  const count = Math.min(Number(args.count) || 5, 10);
  if (!sub) return err("Paramètre: subreddit");
  try {
    const res = await fetch(`https://www.reddit.com/r/${sub}/hot.json?limit=${count}`, {
      headers: { "User-Agent": "bot/1.0" },
      signal: AbortSignal.timeout(10_000),
    });
    if (!res.ok) return err("Subreddit introuvable");
    const d = (await res.json()) as {
      data?: {
        children?: Array<{
          data?: { title: string; score: number; num_comments: number; permalink: string };
        }>;
      };
    };
    const posts = d.data?.children || [];
    if (!posts.length) return err(`Aucun post r/${sub}`);
    return ok(
      `🔥 **r/${sub}:**\n\n${posts.map((p, i) => `${i + 1}. **${p.data?.title}**\n   ⬆️ ${p.data?.score} | 💬 ${p.data?.num_comments}`).join("\n\n")}`,
    );
  } catch (e) {
    return err(`Erreur: ${e}`);
  }
}

export async function toolBoardgameSearch(args: Record<string, unknown>): Promise<ToolCallResult> {
  const q = String(args.query || "").trim();
  if (!q) return err("Paramètre: query");
  try {
    const res = await fetch(
      `https://api.geekdo.com/xmlapi2/search?type=boardgame&query=${encodeURIComponent(q)}`,
      { signal: AbortSignal.timeout(10_000) },
    );
    if (!res.ok) return err("API error");
    const xml = await res.text();
    const m = [...xml.matchAll(/<boardgame[^>]*objectid="(\d+)"[^>]*>([^<]+)<\/boardgame>/g)].slice(
      0,
      5,
    );
    if (!m.length) return err(`Aucun jeu "${q}"`);
    return ok(
      `🎲 **Jeux "${q}":**\n${m.map((x, i) => `${i + 1}. ${x[2]} (ID:${x[1]})`).join("\n")}`,
    );
  } catch (e) {
    return err(`Erreur: ${e}`);
  }
}

export async function toolRandomFact(args: Record<string, unknown>): Promise<ToolCallResult> {
  const type = String(args.type || "trivia").trim();
  const num = args.number ? String(args.number) : "random";
  try {
    const res = await fetch(`http://numbersapi.com/${num}/${type}`, {
      signal: AbortSignal.timeout(10_000),
    });
    if (!res.ok) return err("API error");
    return ok(`🔢 ${await res.text()}`);
  } catch (e) {
    return err(`Erreur: ${e}`);
  }
}

export async function toolThisDayInHistory(_a: Record<string, unknown>): Promise<ToolCallResult> {
  try {
    const now = new Date();
    const res = await fetch(
      `https://en.wikipedia.org/api/rest_v1/feed/onthisday/events/${now.getMonth() + 1}/${now.getDate()}`,
      { signal: AbortSignal.timeout(10_000) },
    );
    if (!res.ok) return err("API error");
    const data = (await res.json()) as { events?: Array<{ year: number; text: string }> };
    return ok(
      `📜 **Ce jour-là:**\n\n${(data.events || [])
        .slice(0, 5)
        .map((e) => `📅 **${e.year}:** ${e.text}`)
        .join("\n\n")}`,
    );
  } catch (e) {
    return err(`Erreur: ${e}`);
  }
}

export async function toolWordOfTheDay(args: Record<string, unknown>): Promise<ToolCallResult> {
  const lang = String(args.language || "fr").trim();
  const words: Record<string, string[]> = {
    fr: [
      "sérénité",
      "éphémère",
      "mélancolie",
      "nostalgie",
      "infini",
      "rêverie",
      "douceur",
      "mystère",
      "évasion",
      "poésie",
      "silence",
      "lumière",
      "voyage",
      "liberté",
      "passion",
    ],
    en: [
      "serendipity",
      "ephemeral",
      "mellifluous",
      "petrichor",
      "luminous",
      "wanderlust",
      "ethereal",
      "solitude",
      "eloquence",
      "tranquil",
    ],
  };
  const list = words[lang] || words.fr;
  const now = new Date();
  return ok(
    `📖 **Mot du jour (${lang}):** ${list[Math.floor((now.getFullYear() * 366 + now.getMonth() * 31 + now.getDate()) % list.length)]}`,
  );
}

export async function toolBoredActivity(args: Record<string, unknown>): Promise<ToolCallResult> {
  const type = String(args.type || "").trim();
  try {
    const url = type
      ? `https://www.boredapi.com/api/activity?type=${type}`
      : "https://www.boredapi.com/api/activity";
    const res = await fetch(url, { signal: AbortSignal.timeout(10_000) });
    if (!res.ok) return err("API error");
    const d = (await res.json()) as { activity?: string; type?: string; participants?: number };
    return ok(`🎯 **Activité:** ${d.activity}\nType: ${d.type} | Participants: ${d.participants}`);
  } catch (e) {
    return err(`Erreur: ${e}`);
  }
}

export async function toolChuckNorrisFact(_a: Record<string, unknown>): Promise<ToolCallResult> {
  try {
    const res = await fetch("https://api.chucknorris.io/jokes/random", {
      signal: AbortSignal.timeout(10_000),
    });
    if (!res.ok) return err("API error");
    const d = (await res.json()) as { value?: string };
    return ok(`💪 **Chuck Norris:** ${d.value}`);
  } catch (e) {
    return err(`Erreur: ${e}`);
  }
}

export async function toolProgrammingJoke(_a: Record<string, unknown>): Promise<ToolCallResult> {
  try {
    const res = await fetch("https://v2.jokeapi.dev/joke/Programming?format=json&safe-mode", {
      signal: AbortSignal.timeout(10_000),
    });
    if (!res.ok) return err("API error");
    const d = (await res.json()) as {
      type?: string;
      joke?: string;
      setup?: string;
      delivery?: string;
    };
    return ok(
      `💻 **Blague dev:** ${d.type === "twopart" ? `${d.setup}\n\n${d.delivery}` : d.joke}`,
    );
  } catch (e) {
    return err(`Erreur: ${e}`);
  }
}

export async function toolWouldYouRather(_a: Record<string, unknown>): Promise<ToolCallResult> {
  const qs = [
    "Voler ou être invisible?",
    "Plus jamais froid ou jamais faim?",
    "Passé ou futur?",
    "Meilleur dans un domaine ou bon en tout?",
    "Plus dormir ou dormir 16h?",
    "Lire les pensées ou voir le futur?",
    "Riche et seul ou pauvre et entouré?",
    "Plus mentir ou détecter les mensonges?",
    "Sans musique ou sans films?",
    "10 ans en moins ou 10M€?",
  ];
  return ok(`🤔 **Tu préfères?**\n${qs[Math.floor(Math.random() * qs.length)]}`);
}

export async function toolCountryInfo(args: Record<string, unknown>): Promise<ToolCallResult> {
  const country = String(args.country || "").trim();
  if (!country) return err("Paramètre: country");
  try {
    const res = await fetch(
      `https://restcountries.com/v3.1/name/${encodeURIComponent(country)}?fields=name,capital,population,flag,currencies,languages,region`,
      { signal: AbortSignal.timeout(10_000) },
    );
    if (!res.ok) return err(`Pays introuvable: ${country}`);
    const data = (await res.json()) as Array<{
      name?: { common: string };
      capital?: string[];
      population?: number;
      flag?: string;
      currencies?: Record<string, { name: string }>;
      languages?: Record<string, string>;
      region?: string;
    }>;
    const c = data[0];
    if (!c) return err("Pays introuvable");
    return ok(
      `${c.flag || "🏳️"} **${c.name?.common || country}**\nCapitale: ${c.capital?.[0] || "N/A"}\nPop: ${c.population?.toLocaleString() || "N/A"}\nRégion: ${c.region || "N/A"}\nMonnaie: ${
        Object.values(c.currencies || {})
          .map((x) => x.name)
          .join(", ") || "N/A"
      }\nLangues: ${Object.values(c.languages || {}).join(", ") || "N/A"}`,
    );
  } catch (e) {
    return err(`Erreur: ${e}`);
  }
}

export async function toolGeocodeAddress(args: Record<string, unknown>): Promise<ToolCallResult> {
  const address = String(args.address || "").trim();
  if (!address) return err("Paramètre: address");
  try {
    const res = await fetch(
      `https://nominatim.openstreetmap.org/search?q=${encodeURIComponent(address)}&format=json&limit=1`,
      { headers: { "User-Agent": "bot/1.0" }, signal: AbortSignal.timeout(10_000) },
    );
    const d = (await res.json()) as Array<{ lat: string; lon: string; display_name: string }>;
    if (!d[0]) return err("Adresse introuvable");
    return ok(
      `📍 **${d[0].display_name}**\nLat: ${d[0].lat} | Lon: ${d[0].lon}\n🗺️ https://osm.org/?mlat=${d[0].lat}&mlon=${d[0].lon}`,
    );
  } catch (e) {
    return err(`Erreur: ${e}`);
  }
}

export async function toolDistanceCalculator(
  args: Record<string, unknown>,
): Promise<ToolCallResult> {
  const lat1 = Number(args.lat1),
    lon1 = Number(args.lon1),
    lat2 = Number(args.lat2),
    lon2 = Number(args.lon2);
  if (isNaN(lat1) || isNaN(lon1) || isNaN(lat2) || isNaN(lon2)) return err("Coordonnées invalides");
  const R = 6371,
    dLat = ((lat2 - lat1) * Math.PI) / 180,
    dLon = ((lon2 - lon1) * Math.PI) / 180;
  const a =
    Math.sin(dLat / 2) ** 2 +
    Math.cos((lat1 * Math.PI) / 180) * Math.cos((lat2 * Math.PI) / 180) * Math.sin(dLon / 2) ** 2;
  const km = R * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
  return ok(`📏 Distance: **${km.toFixed(1)} km** (${(km * 0.621371).toFixed(1)} miles)`);
}

export async function toolPeriodicTable(args: Record<string, unknown>): Promise<ToolCallResult> {
  const input = String(args.element || "").trim();
  if (!input) return err("Paramètre: element");
  try {
    const res = await fetch(
      `https://neelpatel05.pythonanywhere.com/element/element?query=${encodeURIComponent(input)}`,
      { signal: AbortSignal.timeout(10_000) },
    );
    if (!res.ok) return err(`Élément introuvable: ${input}`);
    const d = (await res.json()) as Record<string, unknown>;
    return ok(
      `⚗️ **${d.name}** (${d.symbol})\nNuméro: ${d.atomic_number}\nMasse: ${d.atomic_mass}\nCatégorie: ${d.group}`,
    );
  } catch (e) {
    return err(`Erreur: ${e}`);
  }
}

export async function toolFakePersonGenerator(
  args: Record<string, unknown>,
): Promise<ToolCallResult> {
  const nat = String(args.nationality || "").trim();
  try {
    const res = await fetch(
      nat ? `https://randomuser.me/api/?nat=${nat}` : "https://randomuser.me/api/",
      { signal: AbortSignal.timeout(10_000) },
    );
    if (!res.ok) return err("API error");
    const d = (await res.json()) as {
      results?: Array<{
        name?: { first: string; last: string };
        email?: string;
        phone?: string;
        location?: { city: string; country: string };
      }>;
    };
    const p = d.results?.[0];
    if (!p) return err("Échec");
    return ok(
      `👤 **Faux profil**\nNom: ${p.name?.first} ${p.name?.last}\nEmail: ${p.email}\nTel: ${p.phone}\nVille: ${p.location?.city}, ${p.location?.country}`,
    );
  } catch (e) {
    return err(`Erreur: ${e}`);
  }
}

export async function toolGitignoreGenerator(
  args: Record<string, unknown>,
): Promise<ToolCallResult> {
  const stack = String(args.stack || "")
    .trim()
    .toLowerCase();
  if (!stack) return err("Paramètre: stack");
  try {
    const res = await fetch(
      `https://www.toptal.com/developers/gitignore/api/${encodeURIComponent(stack)}`,
      { signal: AbortSignal.timeout(10_000) },
    );
    if (!res.ok) return err("Stack introuvable");
    return ok(`📝 **.gitignore ${stack}:**\n\`\`\`\n${(await res.text()).slice(0, 1800)}\n\`\`\``);
  } catch (e) {
    return err(`Erreur: ${e}`);
  }
}

export async function toolNpmPackageInfo(args: Record<string, unknown>): Promise<ToolCallResult> {
  const pkg = String(args.package || "").trim();
  if (!pkg) return err("Paramètre: package");
  try {
    const res = await fetch(`https://registry.npmjs.org/${encodeURIComponent(pkg)}/latest`, {
      signal: AbortSignal.timeout(10_000),
    });
    if (!res.ok) return err(`Package introuvable: ${pkg}`);
    const d = (await res.json()) as {
      name?: string;
      version?: string;
      description?: string;
      license?: string;
      dependencies?: Record<string, string>;
    };
    return ok(
      `📦 **${d.name}** v${d.version}\n${d.description || ""}\nLicence: ${d.license || "N/A"}\nDeps: ${
        Object.keys(d.dependencies || {})
          .slice(0, 10)
          .join(", ") || "none"
      }`,
    );
  } catch (e) {
    return err(`Erreur: ${e}`);
  }
}

export async function toolOpenLibrarySearch(
  args: Record<string, unknown>,
): Promise<ToolCallResult> {
  const q = String(args.query || "").trim();
  if (!q) return err("Paramètre: query");
  try {
    const res = await fetch(
      `https://openlibrary.org/search.json?q=${encodeURIComponent(q)}&limit=3`,
      { signal: AbortSignal.timeout(10_000) },
    );
    const d = (await res.json()) as {
      docs?: Array<{ title: string; author_name?: string[]; first_publish_year?: number }>;
    };
    const books = d.docs || [];
    if (!books.length) return err(`Aucun livre "${q}"`);
    return ok(
      `📚 **Livres "${q}":**\n\n${books.map((b, i) => `${i + 1}. **${b.title}**\n   ${b.author_name?.[0] || "N/A"} (${b.first_publish_year || "N/A"})`).join("\n\n")}`,
    );
  } catch (e) {
    return err(`Erreur: ${e}`);
  }
}

export async function toolAuroraForecast(_a: Record<string, unknown>): Promise<ToolCallResult> {
  try {
    const res = await fetch("https://services.swpc.noaa.gov/text/3-day-forecast.txt", {
      signal: AbortSignal.timeout(10_000),
    });
    if (!res.ok) return err("API error");
    const text = await res.text();
    const m = text.match(/Estimated kp\s+(\d+)/i);
    const kp = m ? m[1] : "N/A";
    const lvl =
      kp !== "N/A" && parseInt(kp) >= 5
        ? "Élevé — aurores visibles!"
        : parseInt(kp) >= 3
          ? "Modéré"
          : "Faible";
    return ok(`🌌 **Aurores**\nKP: ${kp} | Niveau: ${lvl}`);
  } catch (e) {
    return err(`Erreur: ${e}`);
  }
}

export async function toolSteamPlayerCount(args: Record<string, unknown>): Promise<ToolCallResult> {
  const appid = Number(args.appid),
    name = String(args.name || "").trim();
  if (!appid && !name) return err("Paramètre: appid ou name");
  try {
    let id = appid;
    if (name && !id) {
      const sr = await fetch(
        `https://store.steampowered.com/api/storesearch/?term=${encodeURIComponent(name)}&l=fr&cc=fr`,
        { signal: AbortSignal.timeout(10_000) },
      );
      const sd = (await sr.json()) as { items?: Array<{ id: number; name: string }> };
      if (!sd.items?.[0]) return err(`Jeu introuvable: ${name}`);
      id = sd.items[0].id;
    }
    const res = await fetch(
      `https://api.steampowered.com/ISteamUserStats/GetNumberOfCurrentPlayers/v1/?appid=${id}`,
      { signal: AbortSignal.timeout(10_000) },
    );
    const d = (await res.json()) as { response?: { player_count?: number } };
    return ok(`🎮 Joueurs en ligne: ${d.response?.player_count?.toLocaleString() || "N/A"}`);
  } catch (e) {
    return err(`Erreur: ${e}`);
  }
}

export async function toolPokemonInfo(args: Record<string, unknown>): Promise<ToolCallResult> {
  const p = String(args.pokemon || "")
    .trim()
    .toLowerCase();
  if (!p) return err("Paramètre: pokemon");
  try {
    const res = await fetch(`https://pokeapi.co/api/v2/pokemon/${encodeURIComponent(p)}`, {
      signal: AbortSignal.timeout(10_000),
    });
    if (!res.ok) return err(`Pokémon introuvable: ${p}`);
    const d = (await res.json()) as {
      name: string;
      id: number;
      types?: Array<{ type: { name: string } }>;
      stats?: Array<{ base_stat: number; stat: { name: string } }>;
      height?: number;
      weight?: number;
      abilities?: Array<{ ability: { name: string } }>;
    };
    return ok(
      `🔴 **${d.name}** (#${d.id})\nTypes: ${d.types?.map((t) => t.type.name).join(", ") || "N/A"}\nTaille: ${(d.height || 0) / 10}m | Poids: ${(d.weight || 0) / 10}kg\nCapacités: ${d.abilities?.map((a) => a.ability.name).join(", ") || "N/A"}\n**Stats:**\n${d.stats?.map((s) => `${s.stat.name}: ${s.base_stat}`).join("\n") || "N/A"}\n🖼️ https://raw.githubusercontent.com/PokeAPI/sprites/master/sprites/pokemon/other/official-artwork/${d.id}.png`,
    );
  } catch (e) {
    return err(`Erreur: ${e}`);
  }
}

export async function toolEsportsMatches(args: Record<string, unknown>): Promise<ToolCallResult> {
  const game = String(args.game || "lol").trim();
  try {
    const res = await fetch(
      `https://api.pandascore.co/${game}/matches/upcoming?sort=begin_at&per_page=5`,
      { headers: { "User-Agent": "bot/1.0" }, signal: AbortSignal.timeout(10_000) },
    );
    if (!res.ok) return err("API error (token?)");
    const d = (await res.json()) as Array<{
      name: string;
      begin_at: string;
      league?: { name: string };
    }>;
    if (!d?.length) return err(`Aucun match ${game}`);
    return ok(
      `🎮 **${game.toUpperCase()} à venir:**\n\n${d.map((m, i) => `${i + 1}. **${m.name}**\n   🏆 ${m.league?.name || "N/A"} | 📅 ${m.begin_at ? new Date(m.begin_at).toLocaleString("fr-FR") : "TBD"}`).join("\n\n")}`,
    );
  } catch (e) {
    return err(`Erreur: ${e}`);
  }
}

export async function toolMemeGenerator(args: Record<string, unknown>): Promise<ToolCallResult> {
  const template = String(args.template || "").trim(),
    top = String(args.top_text || "").trim(),
    bottom = String(args.bottom_text || "").trim();
  if (!template || !top) return err("Paramètres: template, top_text");
  const popular: Record<string, string> = {
    drake: "181913649",
    distracted: "112126428",
    doge: "807228532",
    "two-buttons": "87743030",
    "change-my-mind": "129242436",
    "surprised-pikachu": "155067746",
    "this-is-fine": "55311130",
    "expanding-brain": "93895088",
    "roll-safe": "89370399",
  };
  const id = popular[template.toLowerCase()] || template;
  try {
    const res = await fetch(
      `https://api.imgflip.com/caption_image?template_id=${id}&username=public&password=public&text0=${encodeURIComponent(top)}&text1=${encodeURIComponent(bottom)}`,
      { method: "POST", signal: AbortSignal.timeout(15_000) },
    );
    if (!res.ok) return err("API error");
    const d = (await res.json()) as {
      success?: boolean;
      data?: { url?: string };
      error_message?: string;
    };
    if (!d.success) return err(`Erreur: ${d.error_message || "template introuvable"}`);
    return ok(`😂 **Meme:** ${d.data?.url}`);
  } catch (e) {
    return err(`Erreur: ${e}`);
  }
}

export async function toolSslChecker(args: Record<string, unknown>): Promise<ToolCallResult> {
  const domain = String(args.domain || "").trim();
  if (!domain) return err("Paramètre: domain");
  try {
    const tls = await import("node:tls");
    return new Promise((resolve) => {
      const sock = tls.connect(
        443,
        domain,
        { servername: domain, rejectUnauthorized: false },
        () => {
          const cert = sock.getPeerCertificate();
          sock.end();
          if (!cert || !Object.keys(cert).length) {
            resolve(err("Aucun certificat"));
            return;
          }
          const valid = new Date() < new Date(cert.valid_to);
          resolve(
            ok(
              `🔒 **SSL: ${domain}**\nÉmetteur: ${cert.issuer?.O || "N/A"}\nExpire: ${new Date(cert.valid_to).toLocaleDateString("fr-FR")}\nStatut: ${valid ? "✅ Valide" : "❌ Expiré"}`,
            ),
          );
        },
      );
      sock.setTimeout(10_000);
      sock.on("error", () => resolve(err("Connexion impossible")));
      sock.on("timeout", () => {
        sock.destroy();
        resolve(err("Timeout"));
      });
    });
  } catch (e) {
    return err(`Erreur: ${e}`);
  }
}

export async function toolDnsLookup(args: Record<string, unknown>): Promise<ToolCallResult> {
  const domain = String(args.domain || "").trim();
  const rt = String(args.record_type || "A")
    .trim()
    .toUpperCase();
  if (!domain) return err("Paramètre: domain");
  try {
    const dns = await import("node:dns/promises");
    const records = await dns.resolve(
      domain,
      rt.toLowerCase() as "a" | "aaaa" | "mx" | "txt" | "ns" | "cname" | "caa" | "soa",
    );
    const arr = Array.isArray(records) ? records : [records];
    return ok(
      `🌐 **DNS ${rt} — ${domain}:**\n${arr.map((r: unknown) => (typeof r === "string" ? r : JSON.stringify(r))).join("\n")}`,
    );
  } catch (e) {
    return err(`Erreur DNS: ${e}`);
  }
}

export async function toolColorPaletteFromImage(
  args: Record<string, unknown>,
): Promise<ToolCallResult> {
  const url = String(args.url || "").trim();
  if (!url) return err("Paramètre: url");
  try {
    const res = await fetch(`https://api.color.pizza/v1/img-url?url=${encodeURIComponent(url)}`, {
      signal: AbortSignal.timeout(15_000),
    });
    if (!res.ok) return err("API error");
    const d = (await res.json()) as { colors?: Array<{ hex?: string; name?: string }> };
    const colors = (d.colors || []).slice(0, 5);
    if (!colors.length) return err("Palette indisponible");
    return ok(
      `🎨 **Palette:**\n${colors.map((c) => `#${c.hex || "?"} — ${c.name || ""}`).join("\n")}`,
    );
  } catch (e) {
    return err(`Erreur: ${e}`);
  }
}

export async function toolUvIndex(args: Record<string, unknown>): Promise<ToolCallResult> {
  const city = String(args.city || "").trim();
  if (!city) return err("Paramètre: city");
  return ok(
    `☀️ **Indice UV pour ${city}**\nUtilise get_weather_forecast pour les données météo complètes.`,
  );
}

export async function toolImageToAscii(args: Record<string, unknown>): Promise<ToolCallResult> {
  const url = String(args.url || "").trim();
  if (!url) return err("Paramètre: url");
  return ok(`🖼️ **ASCII:** Utilise un service externe pour convertir ${url}`);
}
