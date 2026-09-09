/**
 * agentToolsImport.ts — APIs publiques que le bot n'avait pas (lecture seule).
 * Sans argument obligatoire → échec immédiat, pas de réseau (tests conversationPush).
 */

import { resolveMx, resolveTxt } from "node:dns/promises";
import type { AgentToolDef, ToolCallResult, ToolContext } from "./agentTools.js";
import { safeFetch } from "../utils/ssrfGuard.js";

const UA = "John-Discord-Bot/1.0 (+https://github.com/loupblanc548/D-les-bot-bot)";
const DISCORD_EPOCH = 1420070400000n;

function ok(data: unknown): ToolCallResult {
  return { success: true, data: typeof data === "string" ? data : JSON.stringify(data) };
}
function err(msg: string): ToolCallResult {
  return { success: false, data: msg };
}
function str(args: Record<string, unknown>, key: string): string {
  const v = args[key];
  return v == null ? "" : String(v).trim();
}

async function getJson(url: string, timeoutMs = 8000): Promise<unknown> {
  const res = await fetch(url, {
    headers: { Accept: "application/json", "User-Agent": UA },
    signal: AbortSignal.timeout(timeoutMs),
  });
  if (!res.ok) throw new Error(`HTTP ${res.status}`);
  return res.json();
}

function def(
  name: string,
  description: string,
  properties: Record<string, unknown>,
  required: string[],
): AgentToolDef {
  return {
    type: "function",
    function: {
      name,
      description,
      parameters: { type: "object", properties, required },
    },
  };
}

type Handler = (args: Record<string, unknown>, ctx: ToolContext) => Promise<ToolCallResult>;

const HANDLERS: Record<string, Handler> = {};
const DEFS: AgentToolDef[] = [];

function add(tool: AgentToolDef, handler: Handler): void {
  DEFS.push(tool);
  HANDLERS[tool.function.name] = handler;
}

// ── Discord ──────────────────────────────────────────────────────────────────

add(
  def(
    "snowflakeDecode",
    "Décode un ID Discord (snowflake) : date de création. Local, pas de réseau.",
    { id: { type: "string", description: "ID Discord (17–19 chiffres)" } },
    ["id"],
  ),
  async (args) => {
    const id = str(args, "id").replace(/\D/g, "");
    if (!/^\d{17,20}$/.test(id)) return err("id Discord invalide");
    const created = new Date(Number((BigInt(id) >> 22n) + DISCORD_EPOCH));
    return ok({
      id,
      created: created.toISOString(),
      unix: Math.floor(created.getTime() / 1000),
      discord: `<t:${Math.floor(created.getTime() / 1000)}:F>`,
    });
  },
);

add(
  def("discordStatus", "Incidents en cours sur Discord (API, voix, login).", {}, []),
  async () => {
    const data = (await getJson("https://discordstatus.com/api/v2/summary.json")) as {
      status?: { description?: string };
      incidents?: Array<{ name?: string; status?: string }>;
    };
    const incidents = (data.incidents || []).slice(0, 5);
    return ok({
      status: data.status?.description || "—",
      incidents: incidents.map((i) => `${i.name}: ${i.status}`),
    });
  },
);

add(
  def(
    "timeoutRemaining",
    "Temps de timeout Discord restant pour un membre.",
    { userId: { type: "string", description: "ID du membre" } },
    ["userId"],
  ),
  async (args, ctx) => {
    const userId = str(args, "userId");
    if (!/^\d{17,20}$/.test(userId)) return err("userId invalide");
    const guild = ctx.client.guilds.cache.get(ctx.guildId);
    if (!guild) return err("Serveur introuvable");
    const member = await guild.members.fetch(userId).catch(() => null);
    if (!member) return err("Membre introuvable");
    const until = member.communicationDisabledUntil;
    if (!until || until.getTime() <= Date.now()) return ok({ userId, timeout: false });
    return ok({
      userId,
      timeout: true,
      until: until.toISOString(),
      remainingMin: Math.ceil((until.getTime() - Date.now()) / 60_000),
    });
  },
);

add(
  def(
    "serverBoostCard",
    "Niveau de boost du serveur (slots emoji). Pas de faux Nitro utilisateur.",
    {},
    [],
  ),
  async (_args, ctx) => {
    const guild = ctx.client.guilds.cache.get(ctx.guildId);
    if (!guild) return err("Serveur introuvable");
    return ok({
      name: guild.name,
      premiumTier: guild.premiumTier,
      boosts: guild.premiumSubscriptionCount ?? 0,
      emojiSlots: guild.maximumEmojis,
      stickers: guild.maximumStickers,
    });
  },
);

add(
  def("emojiQuota", "Emojis / stickers utilisés vs plafond du serveur.", {}, []),
  async (_args, ctx) => {
    const guild = ctx.client.guilds.cache.get(ctx.guildId);
    if (!guild) return err("Serveur introuvable");
    await guild.emojis.fetch().catch(() => null);
    await guild.stickers.fetch().catch(() => null);
    return ok({
      emojis: `${guild.emojis.cache.size} / ${guild.maximumEmojis}`,
      stickers: `${guild.stickers.cache.size} / ${guild.maximumStickers}`,
      animated: guild.emojis.cache.filter((e) => e.animated).size,
    });
  },
);

add(def("vcWho", "Qui est dans quel salon vocal maintenant.", {}, []), async (_args, ctx) => {
  const guild = ctx.client.guilds.cache.get(ctx.guildId);
  if (!guild) return err("Serveur introuvable");
  const rooms: Record<string, string[]> = {};
  for (const state of guild.voiceStates.cache.values()) {
    if (!state.channelId || !state.member) continue;
    const name = guild.channels.cache.get(state.channelId)?.name || state.channelId;
    (rooms[name] ||= []).push(state.member.displayName);
  }
  return ok(Object.keys(rooms).length ? rooms : "Personne en vocal.");
});

add(
  def(
    "compareRoles",
    "Diff de permissions entre deux rôles (noms ou IDs).",
    {
      roleA: { type: "string", description: "Premier rôle" },
      roleB: { type: "string", description: "Second rôle" },
    },
    ["roleA", "roleB"],
  ),
  async (args, ctx) => {
    const guild = ctx.client.guilds.cache.get(ctx.guildId);
    if (!guild) return err("Serveur introuvable");
    const find = (q: string) =>
      guild.roles.cache.find((r) => r.id === q || r.name.toLowerCase() === q.toLowerCase());
    const a = find(str(args, "roleA"));
    const b = find(str(args, "roleB"));
    if (!a || !b) return err("Rôle introuvable");
    const onlyA = a.permissions.toArray().filter((p) => !b.permissions.has(p));
    const onlyB = b.permissions.toArray().filter((p) => !a.permissions.has(p));
    return ok({ a: a.name, b: b.name, onlyA, onlyB });
  },
);

// ── Sécu parade ──────────────────────────────────────────────────────────────

add(
  def(
    "cveLookup",
    "Fiche CVE (description, sévérité). Pas d’exploit, pas de PoC.",
    { cve: { type: "string", description: "CVE-YYYY-NNNN" } },
    ["cve"],
  ),
  async (args) => {
    const cve = str(args, "cve").toUpperCase();
    if (!/^CVE-\d{4}-\d{4,}$/.test(cve)) return err("Format: CVE-2024-1234");
    const data = (await getJson(`https://cveawg.mitre.org/api/cve/${cve}`)) as {
      containers?: { cna?: { title?: string; descriptions?: Array<{ value?: string }> } };
    };
    const cna = data.containers?.cna;
    return ok({
      cve,
      title: cna?.title || cve,
      description: (cna?.descriptions?.[0]?.value || "—").slice(0, 800),
    });
  },
);

add(
  def(
    "cisaKev",
    "La CVE est-elle dans le catalogue CISA KEV (exploitée dans la nature) ?",
    { cve: { type: "string", description: "CVE-YYYY-NNNN" } },
    ["cve"],
  ),
  async (args) => {
    const cve = str(args, "cve").toUpperCase();
    if (!/^CVE-\d{4}-\d{4,}$/.test(cve)) return err("Format: CVE-2024-1234");
    const data = (await getJson(
      "https://www.cisa.gov/sites/default/files/feeds/known_exploited_vulnerabilities.json",
      15_000,
    )) as {
      vulnerabilities?: Array<{
        cveID?: string;
        vendorProject?: string;
        shortDescription?: string;
      }>;
    };
    const hit = (data.vulnerabilities || []).find((v) => v.cveID === cve);
    return ok(hit ? { inKev: true, ...hit } : { inKev: false, cve });
  },
);

add(
  def(
    "endoflife",
    "Une techno (nodejs, nginx, php, python…) est-elle en fin de vie ?",
    {
      product: { type: "string", description: "nodejs | nginx | php | python | postgresql…" },
      version: { type: "string", description: "Version optionnelle (ex: 20)" },
    },
    ["product"],
  ),
  async (args) => {
    const product = str(args, "product")
      .toLowerCase()
      .replace(/[^a-z0-9.-]/g, "");
    if (!product) return err("product requis");
    const data = (await getJson(`https://endoflife.date/api/${product}.json`)) as Array<{
      cycle?: string;
      eol?: string | boolean;
      latest?: string;
      support?: string | boolean;
    }>;
    const version = str(args, "version");
    const rows = (Array.isArray(data) ? data : []).filter((r) =>
      version ? String(r.cycle).startsWith(version) : true,
    );
    return ok(
      rows.slice(0, 6).map((r) => ({
        cycle: r.cycle,
        latest: r.latest,
        eol: r.eol,
        support: r.support,
      })),
    );
  },
);

add(
  def(
    "emailAuth",
    "SPF, DMARC, MX d’un domaine (lecture DNS). Parade mail, pas de spoof.",
    { domain: { type: "string", description: "exemple.fr" } },
    ["domain"],
  ),
  async (args) => {
    const domain = str(args, "domain")
      .toLowerCase()
      .replace(/^https?:\/\//, "")
      .replace(/\/.*$/, "");
    if (!/^[a-z0-9.-]+\.[a-z]{2,}$/i.test(domain)) return err("domaine invalide");
    const [mx, txt, dmarc] = await Promise.all([
      resolveMx(domain).catch(() => []),
      resolveTxt(domain).catch(() => []),
      resolveTxt(`_dmarc.${domain}`).catch(() => []),
    ]);
    const flat = (rows: string[][]) => rows.map((r) => r.join(""));
    const txts = flat(txt as string[][]);
    return ok({
      domain,
      mx: mx.map((m) => `${m.priority} ${m.exchange}`),
      spf: txts.filter((t) => t.toLowerCase().startsWith("v=spf1")),
      dmarc: flat(dmarc as string[][]),
    });
  },
);

add(
  def(
    "securityTxt",
    "Lit /.well-known/security.txt d’un domaine.",
    { domain: { type: "string", description: "exemple.fr" } },
    ["domain"],
  ),
  async (args) => {
    const domain = str(args, "domain")
      .toLowerCase()
      .replace(/^https?:\/\//, "")
      .replace(/\/.*$/, "");
    if (!/^[a-z0-9.-]+\.[a-z]{2,}$/i.test(domain)) return err("domaine invalide");
    const url = `https://${domain}/.well-known/security.txt`;
    const res = await safeFetch(
      url,
      { headers: { "User-Agent": UA }, signal: AbortSignal.timeout(8000) },
      "securityTxt",
    );
    if (!res.ok) return err(`Pas de security.txt (${res.status})`);
    return ok((await res.text()).slice(0, 1500));
  },
);

add(
  def(
    "hstsPreload",
    "Le domaine est-il dans la liste HSTS preload ?",
    { domain: { type: "string", description: "exemple.fr" } },
    ["domain"],
  ),
  async (args) => {
    const domain = str(args, "domain").toLowerCase();
    if (!domain) return err("domain requis");
    return ok(
      await getJson(`https://hstspreload.org/api/v2/status?domain=${encodeURIComponent(domain)}`),
    );
  },
);

add(
  def(
    "openssfScorecard",
    "Score OpenSSF d’un repo GitHub public (owner/repo).",
    { repo: { type: "string", description: "owner/repo" } },
    ["repo"],
  ),
  async (args) => {
    const repo = str(args, "repo").replace(/^https?:\/\/github.com\//, "");
    if (!/^[A-Za-z0-9_.-]+\/[A-Za-z0-9_.-]+$/.test(repo)) return err("Format: owner/repo");
    const data = (await getJson(
      `https://api.securityscorecards.dev/projects/github.com/${repo}`,
    )) as { score?: number; date?: string };
    return ok({ repo, score: data.score, date: data.date });
  },
);

add(
  def(
    "depsDev",
    "Infos deps.dev d’un paquet npm.",
    { name: { type: "string", description: "Nom npm" } },
    ["name"],
  ),
  async (args) => {
    const name = str(args, "name");
    if (!name) return err("name requis");
    return ok(
      await getJson(`https://api.deps.dev/v3/systems/npm/packages/${encodeURIComponent(name)}`),
    );
  },
);

// ── Gaming / médias ──────────────────────────────────────────────────────────

add(
  def(
    "protonDb",
    "Steam Deck / Proton : rapport ProtonDB pour un appid Steam.",
    { appid: { type: "string", description: "AppID Steam (ex: 730)" } },
    ["appid"],
  ),
  async (args) => {
    const appid = str(args, "appid").replace(/\D/g, "");
    if (!appid) return err("appid requis");
    return ok(await getJson(`https://www.protondb.com/api/v1/reports/summaries/${appid}.json`));
  },
);

add(
  def(
    "cheapShark",
    "Meilleurs prix PC (CheapShark / IsThereAnyDeal-like).",
    { title: { type: "string", description: "Nom du jeu" } },
    ["title"],
  ),
  async (args) => {
    const title = str(args, "title");
    if (!title) return err("title requis");
    const data = (await getJson(
      `https://www.cheapshark.com/api/1.0/games?title=${encodeURIComponent(title)}&limit=5`,
    )) as Array<{ external?: string; cheapest?: string; steamAppID?: string }>;
    return ok(
      (Array.isArray(data) ? data : []).slice(0, 5).map((g) => ({
        name: g.external,
        cheapest: g.cheapest,
        steam: g.steamAppID,
      })),
    );
  },
);

add(
  def(
    "scryfall",
    "Carte Magic: The Gathering (texte, set, prix).",
    { name: { type: "string", description: "Nom de carte" } },
    ["name"],
  ),
  async (args) => {
    const name = str(args, "name");
    if (!name) return err("name requis");
    const data = (await getJson(
      `https://api.scryfall.com/cards/named?fuzzy=${encodeURIComponent(name)}`,
    )) as {
      name?: string;
      mana_cost?: string;
      type_line?: string;
      oracle_text?: string;
      prices?: { eur?: string };
      scryfall_uri?: string;
    };
    return ok({
      name: data.name,
      mana: data.mana_cost,
      type: data.type_line,
      text: (data.oracle_text || "").slice(0, 600),
      eur: data.prices?.eur,
      url: data.scryfall_uri,
    });
  },
);

add(
  def(
    "pokemontcg",
    "Carte Pokémon TCG.",
    { name: { type: "string", description: "Nom (ex: Charizard)" } },
    ["name"],
  ),
  async (args) => {
    const name = str(args, "name");
    if (!name) return err("name requis");
    const data = (await getJson(
      `https://api.pokemontcg.io/v2/cards?q=name:"${encodeURIComponent(name)}"&pageSize=3`,
    )) as { data?: Array<{ name?: string; set?: { name?: string }; rarity?: string }> };
    return ok((data.data || []).slice(0, 3));
  },
);

add(def("lichessPuzzle", "Puzzle d’échecs du jour (Lichess).", {}, []), async () => {
  const data = (await getJson("https://lichess.org/api/puzzle/daily")) as {
    puzzle?: { id?: string; rating?: number };
    game?: { id?: string };
  };
  return ok({
    id: data.puzzle?.id,
    rating: data.puzzle?.rating,
    url: data.puzzle?.id ? `https://lichess.org/training/${data.puzzle.id}` : undefined,
  });
});

add(
  def(
    "dnd5e",
    "Sort ou monstre SRD D&D 5e.",
    {
      kind: { type: "string", description: "spells | monsters" },
      index: { type: "string", description: "ex: fireball, goblin" },
    },
    ["kind", "index"],
  ),
  async (args) => {
    const kind = str(args, "kind") === "monsters" ? "monsters" : "spells";
    const index = str(args, "index")
      .toLowerCase()
      .replace(/\s+/g, "-")
      .replace(/[^a-z0-9-]/g, "");
    if (!index) return err("index requis");
    return ok(await getJson(`https://www.dnd5eapi.co/api/${kind}/${index}`));
  },
);

add(
  def(
    "tvmazeSchedule",
    "Fiche série + prochain épisode (TVMaze).",
    { query: { type: "string", description: "Nom de série" } },
    ["query"],
  ),
  async (args) => {
    const query = str(args, "query");
    if (!query) return err("query requis");
    const data = (await getJson(
      `https://api.tvmaze.com/singlesearch/shows?q=${encodeURIComponent(query)}&embed=nextepisode`,
    )) as {
      name?: string;
      status?: string;
      premiered?: string;
      officialSite?: string;
      _embedded?: { nextepisode?: { name?: string; airdate?: string } };
    };
    return ok({
      name: data.name,
      status: data.status,
      premiered: data.premiered,
      next: data._embedded?.nextepisode,
      url: data.officialSite,
    });
  },
);

add(
  def(
    "deezerSearch",
    "Recherche titre / artiste Deezer (métadonnées, pas de fichier).",
    { query: { type: "string", description: "Recherche" } },
    ["query"],
  ),
  async (args) => {
    const query = str(args, "query");
    if (!query) return err("query requis");
    const data = (await getJson(
      `https://api.deezer.com/search?q=${encodeURIComponent(query)}&limit=5`,
    )) as {
      data?: Array<{
        title?: string;
        artist?: { name?: string };
        album?: { title?: string };
        link?: string;
      }>;
    };
    return ok(
      (data.data || []).slice(0, 5).map((t) => ({
        title: t.title,
        artist: t.artist?.name,
        album: t.album?.title,
        url: t.link,
      })),
    );
  },
);

add(
  def(
    "podcastSearch",
    "Podcast iTunes + flux (pas de téléchargement audio).",
    { query: { type: "string", description: "Nom du podcast" } },
    ["query"],
  ),
  async (args) => {
    const query = str(args, "query");
    if (!query) return err("query requis");
    const data = (await getJson(
      `https://itunes.apple.com/search?media=podcast&term=${encodeURIComponent(query)}&limit=5`,
    )) as { results?: Array<{ collectionName?: string; artistName?: string; feedUrl?: string }> };
    return ok((data.results || []).slice(0, 5));
  },
);

add(
  def(
    "radioBrowser",
    "Stations radio par nom (URL de flux seulement).",
    { query: { type: "string", description: "Nom / ville" } },
    ["query"],
  ),
  async (args) => {
    const query = str(args, "query");
    if (!query) return err("query requis");
    const data = (await getJson(
      `https://de1.api.radio-browser.info/json/stations/search?name=${encodeURIComponent(query)}&limit=5`,
    )) as Array<{ name?: string; country?: string; homepage?: string; url_resolved?: string }>;
    return ok(
      (Array.isArray(data) ? data : []).slice(0, 5).map((s) => ({
        name: s.name,
        country: s.country,
        site: s.homepage,
        stream: s.url_resolved,
      })),
    );
  },
);

add(
  def(
    "platformStatus",
    "Steam / PSN / Xbox / Epic / Riot / Discord : page de statut. platform = steam|psn|xbox|epic|riot|discord",
    { platform: { type: "string", description: "steam | psn | xbox | epic | riot | discord" } },
    ["platform"],
  ),
  async (args) => {
    const platform = str(args, "platform").toLowerCase();
    const urls: Record<string, string> = {
      steam: "https://store.steampowered.com/",
      discord: "https://discordstatus.com/api/v2/status.json",
      psn: "https://status.playstation.com/",
      xbox: "https://support.xbox.com/en-US/xbox-live-status",
      riot: "https://status.riotgames.com/api/v2/status.json",
      epic: "https://status.epicgames.com/api/v2/status.json",
    };
    const url = urls[platform];
    if (!url) return err(`platform: ${Object.keys(urls).join(", ")}`);
    if (url.includes("/api/")) {
      return ok(await getJson(url));
    }
    const res = await fetch(url, {
      headers: { "User-Agent": UA },
      signal: AbortSignal.timeout(8000),
    });
    return ok({ platform, http: res.status, url });
  },
);

// ── Retail / finance / FR ────────────────────────────────────────────────────

add(def("fearGreed", "Indice crypto Fear & Greed.", {}, []), async () => {
  const data = (await getJson("https://api.alternative.me/fng/")) as {
    data?: Array<{ value?: string; value_classification?: string }>;
  };
  const row = data.data?.[0];
  return ok({ value: row?.value, label: row?.value_classification });
});

add(def("ethGas", "Frais de gas ETH recommandés (mempool.space).", {}, []), async () =>
  ok(await getJson("https://mempool.space/api/v1/fees/recommended")),
);

add(
  def(
    "ecbRates",
    "Taux BCE (Frankfurter) : from=EUR vers une devise.",
    { to: { type: "string", description: "USD | GBP | JPY…" } },
    ["to"],
  ),
  async (args) => {
    const to = str(args, "to").toUpperCase();
    if (!/^[A-Z]{3}$/.test(to)) return err("Devise ISO à 3 lettres");
    return ok(await getJson(`https://api.frankfurter.app/latest?from=EUR&to=${to}`));
  },
);

add(def("metals", "Cours or / argent (USD).", {}, []), async () =>
  ok(await getJson("https://api.gold-api.com/price/XAU")),
);

add(
  def(
    "holidaysFr",
    "Jours fériés France (année civile).",
    { year: { type: "string", description: "Année (défaut: année en cours)" } },
    [],
  ),
  async (args) => {
    const year = str(args, "year") || String(new Date().getFullYear());
    if (!/^\d{4}$/.test(year)) return err("year AAAA");
    return ok(await getJson(`https://calendrier.api.gouv.fr/jours-feries/metropole/${year}.json`));
  },
);

add(
  def(
    "banAddress",
    "Normalise une adresse française (BAN).",
    { q: { type: "string", description: "Adresse" } },
    ["q"],
  ),
  async (args) => {
    const q = str(args, "q");
    if (!q) return err("q requis");
    const data = (await getJson(
      `https://api-adresse.data.gouv.fr/search/?q=${encodeURIComponent(q)}&limit=3`,
    )) as {
      features?: Array<{ properties?: { label?: string; postcode?: string; city?: string } }>;
    };
    return ok((data.features || []).map((f) => f.properties));
  },
);

add(
  def(
    "rappelConso",
    "Rappels produits FR (RappelConso) par mot-clé.",
    { query: { type: "string", description: "Marque / aliment" } },
    ["query"],
  ),
  async (args) => {
    const query = str(args, "query");
    if (!query) return err("query requis");
    const url =
      "https://data.economie.gouv.fr/api/explore/v2.1/catalog/datasets/rappelconso-v2-gtin-espaces/records" +
      `?limit=5&where=${encodeURIComponent(`libelle_produit like '%${query.replace(/'/g, "")}%'`)}`;
    const data = (await getJson(url)) as {
      results?: Array<{
        libelle_produit?: string;
        motif_rappel?: string;
        date_publication?: string;
      }>;
    };
    return ok(data.results || "Aucun rappel trouvé.");
  },
);

add(
  def(
    "pollen",
    "Indice pollen Open-Meteo pour une ville.",
    { city: { type: "string", description: "Ville" } },
    ["city"],
  ),
  async (args) => {
    const city = str(args, "city");
    if (!city) return err("city requis");
    const geo = (await getJson(
      `https://geocoding-api.open-meteo.com/v1/search?name=${encodeURIComponent(city)}&count=1&language=fr`,
    )) as { results?: Array<{ latitude: number; longitude: number; name: string }> };
    const loc = geo.results?.[0];
    if (!loc) return err("Ville introuvable");
    const air = await getJson(
      `https://air-quality-api.open-meteo.com/v1/air-quality?latitude=${loc.latitude}&longitude=${loc.longitude}&current=alder_pollen,birch_pollen,grass_pollen,mugwort_pollen,olive_pollen,ragweed_pollen`,
    );
    return ok({ city: loc.name, pollen: air });
  },
);

add(
  def(
    "vatEu",
    "Taux de TVA standard d’un pays UE (code ISO2).",
    { country: { type: "string", description: "FR | DE | IT…" } },
    ["country"],
  ),
  async (args) => {
    const rates: Record<string, number> = {
      FR: 20,
      DE: 19,
      IT: 22,
      ES: 21,
      BE: 21,
      NL: 21,
      PT: 23,
      AT: 20,
      IE: 23,
      FI: 25.5,
      GR: 24,
      LU: 17,
      PL: 23,
      CZ: 21,
      SE: 25,
      DK: 25,
      HU: 27,
      RO: 19,
      BG: 20,
      HR: 25,
      SK: 23,
      SI: 22,
      LT: 21,
      LV: 21,
      EE: 22,
      CY: 19,
      MT: 18,
    };
    const country = str(args, "country").toUpperCase();
    const rate = rates[country];
    if (rate == null) return err("Pays UE inconnu");
    return ok({ country, vatPercent: rate });
  },
);

// ── Science / dev ────────────────────────────────────────────────────────────

add(def("nasaNeo", "Astéroïdes proches (NASA NEO) sur 2 jours.", {}, []), async () => {
  const key = process.env.NASA_API_KEY || "DEMO_KEY";
  const start = new Date().toISOString().slice(0, 10);
  const end = new Date(Date.now() + 86400000).toISOString().slice(0, 10);
  const data = (await getJson(
    `https://api.nasa.gov/neo/rest/v1/feed?start_date=${start}&end_date=${end}&api_key=${key}`,
  )) as { element_count?: number };
  return ok({ days: `${start} → ${end}`, count: data.element_count });
});

add(def("nasaMars", "Dernières photos rover Curiosity.", {}, []), async () => {
  const key = process.env.NASA_API_KEY || "DEMO_KEY";
  const data = (await getJson(
    `https://api.nasa.gov/mars-photos/api/v1/rovers/curiosity/latest_photos?api_key=${key}`,
  )) as {
    latest_photos?: Array<{ img_src?: string; earth_date?: string; camera?: { name?: string } }>;
  };
  const photos = (data.latest_photos || []).slice(0, 3);
  return ok(photos.map((p) => ({ date: p.earth_date, camera: p.camera?.name, url: p.img_src })));
});

add(
  def(
    "oeis",
    "Suite de nombres OEIS (ex: 1,1,2,3,5).",
    { q: { type: "string", description: "Termes ou A-number" } },
    ["q"],
  ),
  async (args) => {
    const q = str(args, "q");
    if (!q) return err("q requis");
    const data = (await getJson(
      `https://oeis.org/search?q=${encodeURIComponent(q)}&fmt=json&start=0`,
    )) as { results?: Array<{ number?: number; name?: string; data?: string }> };
    return ok(
      (data.results || []).slice(0, 3).map((r) => ({
        id: r.number != null ? `A${String(r.number).padStart(6, "0")}` : undefined,
        name: r.name,
        terms: r.data,
      })),
    );
  },
);

add(
  def(
    "pubmed",
    "Abstract PubMed (titre ou PMID). Pas un diagnostic médical.",
    { q: { type: "string", description: "Recherche ou PMID" } },
    ["q"],
  ),
  async (args) => {
    const q = str(args, "q");
    if (!q) return err("q requis");
    const search = (await getJson(
      `https://eutils.ncbi.nlm.nih.gov/entrez/eutils/esearch.fcgi?db=pubmed&retmode=json&retmax=3&term=${encodeURIComponent(q)}`,
    )) as { esearchresult?: { idlist?: string[] } };
    const ids = search.esearchresult?.idlist || [];
    if (!ids.length) return ok("Aucun résultat PubMed.");
    const sum = (await getJson(
      `https://eutils.ncbi.nlm.nih.gov/entrez/eutils/esummary.fcgi?db=pubmed&retmode=json&id=${ids.join(",")}`,
    )) as { result?: Record<string, { title?: string; source?: string; pubdate?: string }> };
    return ok(
      ids.map((id) => ({
        pmid: id,
        title: sum.result?.[id]?.title,
        source: sum.result?.[id]?.source,
        date: sum.result?.[id]?.pubdate,
        url: `https://pubmed.ncbi.nlm.nih.gov/${id}/`,
      })),
    );
  },
);

add(
  def(
    "crossrefDoi",
    "Métadonnées d’un DOI (Crossref).",
    { doi: { type: "string", description: "10.xxxx/..." } },
    ["doi"],
  ),
  async (args) => {
    const doi = str(args, "doi").replace(/^https?:\/\/doi.org\//, "");
    if (!doi) return err("doi requis");
    const data = (await getJson(`https://api.crossref.org/works/${encodeURIComponent(doi)}`)) as {
      message?: { title?: string[]; author?: Array<{ family?: string }>; URL?: string };
    };
    const m = data.message;
    return ok({
      title: m?.title?.[0],
      authors: (m?.author || []).slice(0, 5).map((a) => a.family),
      url: m?.URL,
    });
  },
);

add(
  def(
    "gbif",
    "Espèce GBIF (nom scientifique / commun).",
    { q: { type: "string", description: "Nom" } },
    ["q"],
  ),
  async (args) => {
    const q = str(args, "q");
    if (!q) return err("q requis");
    const data = (await getJson(
      `https://api.gbif.org/v1/species/search?q=${encodeURIComponent(q)}&limit=3`,
    )) as {
      results?: Array<{
        scientificName?: string;
        vernacularName?: string;
        kingdom?: string;
        taxonID?: number;
      }>;
    };
    return ok(data.results || []);
  },
);

add(
  def(
    "citybikes",
    "Réseau vélo d’une ville (Vélib, etc.).",
    { city: { type: "string", description: "Nom de ville" } },
    ["city"],
  ),
  async (args) => {
    const city = str(args, "city").toLowerCase();
    if (!city) return err("city requis");
    const data = (await getJson("https://api.citybik.es/v2/networks")) as {
      networks?: Array<{
        id?: string;
        name?: string;
        location?: { city?: string; country?: string };
      }>;
    };
    const hits = (data.networks || []).filter((n) =>
      (n.location?.city || "").toLowerCase().includes(city),
    );
    return ok(hits.slice(0, 5));
  },
);

add(
  def(
    "bundlephobia",
    "Poids minifié + gzip d’un paquet npm.",
    { name: { type: "string", description: "lodash, react…" } },
    ["name"],
  ),
  async (args) => {
    const name = str(args, "name");
    if (!name) return err("name requis");
    const data = (await getJson(
      `https://bundlephobia.com/api/size?package=${encodeURIComponent(name)}`,
    )) as { size?: number; gzip?: number; name?: string; version?: string };
    return ok({
      name: data.name,
      version: data.version,
      sizeKb: data.size != null ? Math.round(data.size / 1024) : undefined,
      gzipKb: data.gzip != null ? Math.round(data.gzip / 1024) : undefined,
    });
  },
);

add(
  def(
    "npmDownloads",
    "Téléchargements npm sur 7 jours.",
    { name: { type: "string", description: "Nom du paquet" } },
    ["name"],
  ),
  async (args) => {
    const name = str(args, "name");
    if (!name) return err("name requis");
    return ok(
      await getJson(`https://api.npmjs.org/downloads/point/last-week/${encodeURIComponent(name)}`),
    );
  },
);

add(
  def(
    "hfModelSearch",
    "Recherche de modèles Hugging Face.",
    { q: { type: "string", description: "Nom / tâche" } },
    ["q"],
  ),
  async (args) => {
    const q = str(args, "q");
    if (!q) return err("q requis");
    const data = (await getJson(
      `https://huggingface.co/api/models?search=${encodeURIComponent(q)}&limit=5`,
    )) as Array<{ id?: string; likes?: number; pipeline_tag?: string }>;
    return ok((Array.isArray(data) ? data : []).slice(0, 5));
  },
);

add(
  def(
    "mdnSearch",
    "Recherche MDN (JS / CSS / HTML).",
    { q: { type: "string", description: "API ou propriété" } },
    ["q"],
  ),
  async (args) => {
    const q = str(args, "q");
    if (!q) return err("q requis");
    const data = (await getJson(
      `https://developer.mozilla.org/api/v1/search?q=${encodeURIComponent(q)}&locale=fr`,
    )) as { documents?: Array<{ title?: string; mdn_url?: string; summary?: string }> };
    return ok(
      (data.documents || []).slice(0, 5).map((d) => ({
        title: d.title,
        summary: (d.summary || "").slice(0, 240),
        url: d.mdn_url ? `https://developer.mozilla.org${d.mdn_url}` : undefined,
      })),
    );
  },
);

add(
  def(
    "rfcLookup",
    "Début du texte d’une RFC (numéro).",
    { n: { type: "string", description: "Numéro RFC (ex: 9110)" } },
    ["n"],
  ),
  async (args) => {
    const n = str(args, "n").replace(/\D/g, "");
    if (!n) return err("n requis");
    const res = await fetch(`https://www.rfc-editor.org/rfc/rfc${n}.txt`, {
      headers: { "User-Agent": UA },
      signal: AbortSignal.timeout(8000),
    });
    if (!res.ok) return err(`RFC ${n} introuvable`);
    return ok((await res.text()).slice(0, 1800));
  },
);

add(
  def("cratesSearch", "Crate Rust (crates.io).", { q: { type: "string", description: "Nom" } }, [
    "q",
  ]),
  async (args) => {
    const q = str(args, "q");
    if (!q) return err("q requis");
    const data = (await getJson(
      `https://crates.io/api/v1/crates?q=${encodeURIComponent(q)}&per_page=5`,
    )) as { crates?: Array<{ name?: string; max_version?: string; description?: string }> };
    return ok(data.crates || []);
  },
);

add(
  def(
    "unicodeInfo",
    "Codepoint Unicode d’un caractère (local).",
    { text: { type: "string", description: "Un ou quelques caractères" } },
    ["text"],
  ),
  async (args) => {
    const text = str(args, "text");
    if (!text) return err("text requis");
    const chars = [...text].slice(0, 8);
    return ok(
      chars.map((ch) => {
        const cp = ch.codePointAt(0) || 0;
        return {
          char: ch,
          cp: `U+${cp.toString(16).toUpperCase().padStart(4, "0")}`,
          dec: cp,
        };
      }),
    );
  },
);

add(
  def(
    "tokenCount",
    "Estimation de tokens (≈ caractères / 4). Pas un compteur exact tiktoken.",
    { text: { type: "string", description: "Texte" } },
    ["text"],
  ),
  async (args) => {
    const text = str(args, "text");
    if (!text) return err("text requis");
    return ok({ chars: text.length, tokensApprox: Math.ceil(text.length / 4) });
  },
);

export const IMPORT_TOOLS: AgentToolDef[] = DEFS;
export const IMPORT_TOOL_NAMES: string[] = DEFS.map((t) => t.function.name);

export async function executeImportTool(
  toolName: string,
  args: Record<string, unknown>,
  ctx: ToolContext,
): Promise<ToolCallResult | null> {
  const spec = DEFS.find((t) => t.function.name === toolName);
  const run = HANDLERS[toolName];
  if (!spec || !run) return null;
  if (process.env.VITEST === "true" && spec.function.parameters.required.length === 0) {
    return err("skipped in test");
  }
  try {
    return await run(args, ctx);
  } catch (e) {
    return err(e instanceof Error ? e.message : String(e));
  }
}
