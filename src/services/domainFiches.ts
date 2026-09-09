/**
 * domainFiches.ts — Fiches Discord par domaine (playbooks + données déjà dispo).
 * Pas de Kali offensif. Pas de faux Nitro.
 */

import { EmbedBuilder, type Client, type GuildMember, type Message } from "discord.js";
import prisma from "../prisma.js";
import { getNasaApod, getWeather } from "./freeApis.js";
import { checkEmail, getLatestBreach, type BreachInfo } from "../utils/hibp.js";
import { checkUrlForSsrf } from "../utils/ssrfGuard.js";
import { NETWORK_DEFENSE_ITEMS, buildNetworkDefenseEmbeds } from "./networkDefenseBrief.js";
import { buildFicheEmbeds, presentFichesFromTool, type FicheCard } from "./discordFiche.js";
import { inspectHostCertificate } from "./sslInspect.js";
import { getMemoryLevel } from "../utils/memoryConfig.js";

export const FICHE_DOMAINS = [
  { id: "moderation", name: "Modération" },
  { id: "securite", name: "Sécurité" },
  { id: "gaming", name: "Gaming" },
  { id: "medias", name: "Médias" },
  { id: "retail", name: "Retail" },
  { id: "ia", name: "IA" },
  { id: "devops", name: "Dev / VPS" },
  { id: "communaute", name: "Communauté" },
  { id: "vocal", name: "Vocal" },
  { id: "science", name: "Science" },
  { id: "analytics", name: "Analytics" },
] as const;

export type FicheDomainId = (typeof FICHE_DOMAINS)[number]["id"];

export interface DomainPlaybook {
  id: FicheDomainId;
  title: string;
  intro: string;
  cards: FicheCard[];
}

const BOT_STARTED_AT = new Date();

export function findFicheDomain(raw?: string | null): FicheDomainId | undefined {
  if (!raw) return undefined;
  const key = raw
    .trim()
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "");
  const aliases: Record<string, FicheDomainId> = {
    moderation: "moderation",
    modo: "moderation",
    securite: "securite",
    security: "securite",
    sécu: "securite",
    secu: "securite",
    kali: "securite",
    gaming: "gaming",
    jeux: "gaming",
    steam: "gaming",
    medias: "medias",
    media: "medias",
    twitch: "medias",
    youtube: "medias",
    retail: "retail",
    prix: "retail",
    boutique: "retail",
    ia: "ia",
    memoire: "ia",
    devops: "devops",
    vps: "devops",
    bot: "devops",
    communaute: "communaute",
    community: "communaute",
    digest: "communaute",
    vocal: "vocal",
    musique: "vocal",
    science: "science",
    nasa: "science",
    meteo: "science",
    analytics: "analytics",
    stats: "analytics",
  };
  return aliases[key];
}

export const DOMAIN_PLAYBOOKS: Record<FicheDomainId, DomainPlaybook> = {
  moderation: {
    id: "moderation",
    title: "Modération",
    intro: "Signaux, appels, incidents. Lecture seule. Discord gère le faux Nitro, pas John.",
    cards: [
      {
        title: "Multi-comptes",
        fields: [
          {
            name: "Signaux",
            value: "Âge du compte, date de join, écart join vs création, flags Discord.",
          },
          {
            name: "Limite",
            value: "Pas d’accusation, pas de doxx. Une fiche par membre, pas un listing de ban.",
          },
        ],
      },
      {
        title: "Appel d’une sanction",
        fields: [
          { name: "Quoi", value: "Dernière ligne du casier + comment contester." },
          { name: "Où", value: "Ticket modo. On ne réécrit pas le casier ici." },
        ],
      },
      {
        title: "Anti-spam",
        fields: [
          { name: "Quoi", value: "Liens, raids, automod — une carte par incident." },
          {
            name: "Hors scope",
            value: "Faux Nitro : Trust & Safety Discord. John ne filtre pas ça.",
          },
        ],
      },
    ],
  },
  securite: {
    id: "securite",
    title: "Sécurité",
    intro: "Fuites, certificats, deps. Parade seulement — aucun outil d’attaque.",
    cards: [
      {
        title: "Fuite HIBP",
        fields: [
          { name: "Quoi", value: "Est-ce que cet e-mail apparaît dans une fuite connue." },
          {
            name: "Que faire",
            value: "MDP unique, gestionnaire, MFA, révoquer les sessions. Jamais coller un secret.",
          },
        ],
      },
      {
        title: "Certificat SSL",
        fields: [
          { name: "Alerte", value: "Moins de 21 jours avant expiration → carte ops." },
          { name: "Parade", value: "Renouveler, HTTPS partout, pas d’admin sur HTTP." },
        ],
      },
      {
        title: "Digest Trivy",
        fields: [
          { name: "Quoi", value: "CRITICAL / HIGH des deps du bot, pas le dump SARIF." },
          { name: "Parade", value: "Patcher, moins de surface, inventaire des images." },
        ],
      },
      {
        title: "Défense réseau",
        fields: [
          {
            name: "Menaces",
            value: NETWORK_DEFENSE_ITEMS.map((item) => item.name).join(", "),
          },
          {
            name: "Règle",
            value: "On explique comment se protéger. On ne lance pas Hydra, Hashcat, Metasploit…",
          },
        ],
      },
    ],
  },
  gaming: {
    id: "gaming",
    title: "Gaming",
    intro: "Steam, skins, giveaways. Hors scope : faux Nitro Discord.",
    cards: [
      {
        title: "Anti-arnaque Steam",
        fields: [
          {
            name: "Ce que ça vise",
            value: "Faux giveaway, « support Steam », trade URL, site de skins clone.",
          },
          {
            name: "Parade",
            value: "Store officiel, jamais de trade hors Steam, ignore les DMs « support ».",
          },
        ],
      },
      {
        title: "Fiche jeu Steam",
        fields: [
          { name: "Champs", value: "Prix, news, wish — une carte, pas un pavé markdown." },
          { name: "Tool", value: "getSteamGame / steam news déjà là." },
        ],
      },
      {
        title: "Helldivers / Fortnite / Minecraft",
        fields: [
          { name: "Quoi", value: "Statut en cartes paginées, plus de tableaux | col |." },
          { name: "Où", value: "/game, /fnbot, /mc — John oriente, il ne dump pas." },
        ],
      },
    ],
  },
  medias: {
    id: "medias",
    title: "Médias",
    intro: "Légende + idées. Pas de fichier audio, pas de téléchargement.",
    cards: [
      {
        title: "Résumé YouTube / TikTok",
        fields: [
          { name: "Quoi", value: "Titre, auteur, légende via oembed — 1 embed." },
          { name: "Pas", value: "Pas le son, pas le mp4." },
        ],
      },
      {
        title: "Live Twitch / Kick",
        fields: [
          { name: "Champs", value: "Titre, jeu, viewers, lien." },
          { name: "Déjà", value: "Les follows partent déjà en carte quand ça passe en live." },
        ],
      },
    ],
  },
  retail: {
    id: "retail",
    title: "Retail",
    intro: "Prix et boutiques. Date / Boutique / Prix / Stock.",
    cards: [
      {
        title: "Historique de prix",
        fields: [
          { name: "Champs", value: "Date, boutique, prix, stock." },
          { name: "Tool", value: "searchRetailers / trackRetailerProduct." },
        ],
      },
      {
        title: "Boutique douteuse",
        fields: [
          { name: "Signaux", value: "Typosquat, HTTP, certificat bizarre, clone de marque." },
          { name: "Parade", value: "webcheck_scan + ssl_checker. Ne paie pas sur HTTP." },
        ],
      },
      {
        title: "Baisse déjà trackée",
        fields: [
          { name: "Quoi", value: "Une carte unique quand le track baisse." },
          { name: "Déjà", value: "Retailer alerts + price-alerts postent déjà un embed." },
        ],
      },
    ],
  },
  ia: {
    id: "ia",
    title: "IA",
    intro: "Mémoire et tools. Pas de dump JSON, pas de Kali offensif, pas de secrets.",
    cards: [
      {
        title: "Préférences",
        fields: [
          { name: "Quoi", value: "Jeux, langue, fuseau — cartes, pas un JSON." },
          { name: "Tool", value: "searchUserMemory / saveMemoryFact." },
        ],
      },
      {
        title: "Garde-fous",
        fields: [
          {
            name: "Interdit",
            value: "Hydra, Hashcat, Metasploit, Wifite, Ettercap, secrets collés, faux Nitro.",
          },
          { name: "OK", value: "Fiches de parade, HIBP, SSL, tools déjà écrits (Reddit, Steam…)." },
        ],
      },
    ],
  },
  devops: {
    id: "devops",
    title: "Dev / VPS",
    intro: "Déploiement et santé. Salon ops, pas un roman.",
    cards: [
      {
        title: "Déploiement",
        fields: [
          { name: "Champs", value: "Branche, SHA, heure du dernier ready." },
          { name: "Quand", value: "Après un reload PM2, ou /fiches devops." },
        ],
      },
      {
        title: "Santé bot",
        fields: [
          { name: "Champs", value: "PM2/process, RAM, ping, last ready." },
          { name: "Déjà", value: "Cron health : alerte seulement si ça casse vraiment." },
        ],
      },
    ],
  },
  communaute: {
    id: "communaute",
    title: "Communauté",
    intro: "Digest et accueil. Cartes, pas un roman. Opt-in /digest.",
    cards: [
      {
        title: "Digest hebdo",
        fields: [
          { name: "Quoi", value: "Sujets, vocaux, nouveaux membres, sanctions." },
          { name: "Où", value: "/digest enable + salon. Cron lundi aussi (alertes ops)." },
        ],
      },
      {
        title: "Bienvenue / règles / rôles",
        fields: [
          { name: "Quoi", value: "Trois cartes : salut, règles courtes, rôles à prendre." },
          { name: "Tool", value: "setup_basic_server pour aménager, pas pour inventer un guild." },
        ],
      },
    ],
  },
  vocal: {
    id: "vocal",
    title: "Vocal",
    intro: "Métadonnées et rappel. Pas de téléchargement de fichier.",
    cards: [
      {
        title: "Identifiant musique",
        fields: [
          { name: "Quoi", value: "Titre / artiste via oembed." },
          { name: "Pas", value: "Pas le fichier, pas de rip." },
        ],
      },
      {
        title: "Transcription",
        fields: [
          { name: "Quoi", value: "Court résumé + rappel, si AssemblyAI a tourné." },
          { name: "Limite", value: "Pas de dump intégral d’un vocal privé." },
        ],
      },
    ],
  },
  science: {
    id: "science",
    title: "Science",
    intro: "Claim sourcé, NASA, météo. Une carte.",
    cards: [
      {
        title: "Fact-check",
        fields: [
          { name: "Champs", value: "Claim + source (URL) + verdict." },
          { name: "Règle", value: "searchWeb d’abord. Pas de verdict sans source." },
        ],
      },
      {
        title: "NASA / météo / air",
        fields: [
          { name: "Quoi", value: "APOD, température, qualité de l’air — 1 carte chacun." },
          { name: "Tools", value: "getNasaApod, getWeather, getAirQuality." },
        ],
      },
    ],
  },
  analytics: {
    id: "analytics",
    title: "Analytics",
    intro: "Top slash, tools John, erreurs. Résumé Discord, pas Prometheus brut.",
    cards: [
      {
        title: "Commandes",
        fields: [
          { name: "Quoi", value: "Top /slash 7 jours, volume, erreurs récentes." },
          { name: "Où", value: "Salon ANALYTICS_DASHBOARD_CHANNEL ou /fiches analytics." },
        ],
      },
    ],
  },
};

export function formatDomainFicheForAgent(domain: FicheDomainId, sujet?: string): string {
  const book = DOMAIN_PLAYBOOKS[domain];
  return [
    `**Fiche ${book.title}** déjà postée dans le salon.`,
    sujet ? `Sujet : ${sujet}.` : "",
    "Réponds en une phrase en français. Pas de tableau markdown | col |. Pas de commandes Kali. Pas de secrets. Pas de faux Nitro.",
  ]
    .filter(Boolean)
    .join(" ");
}

export function buildDomainPlaybookEmbeds(
  domain: FicheDomainId,
  filterTitle?: string,
): EmbedBuilder[] {
  const book = DOMAIN_PLAYBOOKS[domain];
  const cards = filterTitle
    ? book.cards.filter((card) => card.title.toLowerCase().includes(filterTitle.toLowerCase()))
    : book.cards;
  return buildFicheEmbeds({
    title: book.title,
    description: book.intro,
    footer: `${book.title} · fiche`,
    cards: cards.length ? cards : book.cards,
  });
}

export function listDomainIndexEmbeds(): EmbedBuilder[] {
  const groups: FicheDomainId[][] = [
    ["moderation", "securite", "gaming"],
    ["medias", "retail", "ia"],
    ["devops", "communaute", "vocal"],
    ["science", "analytics"],
  ];
  return buildFicheEmbeds({
    title: "Fiches",
    description:
      "Choisis un domaine (`/fiches domaine:`). Cartes natives, comme le casier. Discord s’occupe du faux Nitro — on n’y touche pas.",
    footer: "Fiches · tous domaines",
    cards: groups.map((ids) => ({
      title: ids.map((id) => DOMAIN_PLAYBOOKS[id].title).join(" · "),
      fields: ids.map((id) => ({
        name: DOMAIN_PLAYBOOKS[id].title,
        value: DOMAIN_PLAYBOOKS[id].cards.map((card) => card.title).join(" · "),
      })),
    })),
  });
}

function discordTime(date: Date): string {
  return `<t:${Math.floor(date.getTime() / 1000)}:f>`;
}

function maskEmail(email: string): string {
  const [user, host] = email.split("@");
  if (!host) return "e-mail";
  const keep = user.slice(0, 1);
  return `${keep}***@${host}`;
}

export function buildHibpCards(breaches: BreachInfo[], email?: string): FicheCard[] {
  const headerHow: FicheCard = {
    title: "Que faire",
    fields: [
      {
        name: "Parade",
        value:
          "Mot de passe unique, gestionnaire, MFA, sessions révoquées. Ne colle jamais le secret ici.",
      },
    ],
  };
  if (breaches.length === 0) {
    return [
      {
        title: email ? `Aucune fuite pour ${maskEmail(email)}` : "Aucune fuite",
        fields: [{ name: "Statut", value: "Pas d’apparition dans le catalogue HIBP interrogé." }],
      },
      headerHow,
    ];
  }
  const cards = breaches.slice(0, 7).map((breach) => ({
    title: (breach.title || breach.name).slice(0, 256),
    fields: [
      { name: "Date", value: breach.breachDate || "—", inline: true },
      { name: "Domaine", value: breach.domain || "—", inline: true },
      {
        name: "Données",
        value: (breach.compromisedData || []).slice(0, 8).join(", ") || "—",
      },
    ],
  }));
  return [...cards, headerHow];
}

export function buildHealthCards(client: Client): FicheCard[] {
  const mem = process.memoryUsage();
  const rssMB = Math.round(mem.rss / 1024 / 1024);
  const heapMB = Math.round(mem.heapUsed / 1024 / 1024);
  const level = getMemoryLevel(rssMB);
  return [
    {
      title: "Process",
      fields: [
        { name: "RAM", value: `${heapMB} MB heap / ${rssMB} MB RSS (${level})`, inline: true },
        { name: "Ping", value: `${client.ws.ping} ms`, inline: true },
        { name: "Uptime", value: `${Math.round(process.uptime() / 60)} min`, inline: true },
        { name: "Serveurs", value: `${client.guilds.cache.size}`, inline: true },
        { name: "Ready", value: discordTime(BOT_STARTED_AT), inline: true },
      ],
    },
  ];
}

export function buildDeployCards(): FicheCard[] {
  const sha = (process.env.GIT_COMMIT || process.env.RAILWAY_GIT_COMMIT_SHA || "inconnu").slice(
    0,
    12,
  );
  const branch =
    process.env.GIT_BRANCH ||
    process.env.RAILWAY_GIT_BRANCH ||
    process.env.BOT_BRANCH ||
    "inconnue";
  return [
    {
      title: "Dernier reload",
      fields: [
        { name: "Branche", value: branch, inline: true },
        { name: "SHA", value: `\`${sha}\``, inline: true },
        { name: "Ready", value: discordTime(BOT_STARTED_AT), inline: true },
      ],
    },
  ];
}

export function buildWelcomeCards(guildName?: string): FicheCard[] {
  const name = guildName || "le serveur";
  return [
    {
      title: "Bienvenue",
      fields: [
        { name: "Salut", value: `Bienvenue sur **${name}**. Lis les règles, prends tes rôles.` },
      ],
    },
    {
      title: "Règles",
      fields: [
        {
          name: "Court",
          value: "Pas de harcèlement, pas de spam, pas d’arnaque. Les modos tranchent.",
        },
      ],
    },
    {
      title: "Rôles",
      fields: [
        { name: "Où", value: "Salon rôles / réaction. John n’invente pas un serveur Discord." },
      ],
    },
  ];
}

export function buildFactCheckCard(claim: string, source?: string, verdict?: string): FicheCard {
  return {
    title: "Fact-check",
    fields: [
      { name: "Claim", value: claim.slice(0, 1000) },
      { name: "Source", value: source || "URL obligatoire — searchWeb d’abord." },
      { name: "Verdict", value: verdict || "En attente d’une source." },
    ],
  };
}

function looksLikeEmail(text: string): boolean {
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(text.trim());
}

function looksLikeHost(text: string): boolean {
  return /^[a-z0-9.-]+\.[a-z]{2,}$/i.test(
    text
      .trim()
      .replace(/^https?:\/\//, "")
      .replace(/\/.*$/, ""),
  );
}

function looksLikeUrl(text: string): boolean {
  return /^https?:\/\//i.test(text.trim());
}

async function fetchOembed(
  url: string,
): Promise<{ title: string; author: string; provider: string } | null> {
  const ssrf = await checkUrlForSsrf(url, "domainFicheOembed");
  if (!ssrf.allowed) return null;
  const endpoints: string[] = [];
  if (/youtube\.com|youtu\.be/i.test(url)) {
    endpoints.push(`https://www.youtube.com/oembed?url=${encodeURIComponent(url)}&format=json`);
  } else if (/tiktok\.com/i.test(url)) {
    endpoints.push(`https://www.tiktok.com/oembed?url=${encodeURIComponent(url)}`);
  } else if (/soundcloud\.com/i.test(url)) {
    endpoints.push(`https://soundcloud.com/oembed?format=json&url=${encodeURIComponent(url)}`);
  } else if (/spotify\.com/i.test(url)) {
    endpoints.push(`https://open.spotify.com/oembed?url=${encodeURIComponent(url)}`);
  } else {
    return null;
  }
  try {
    const res = await fetch(endpoints[0], { signal: AbortSignal.timeout(8000) });
    if (!res.ok) return null;
    const data = (await res.json()) as {
      title?: string;
      author_name?: string;
      provider_name?: string;
    };
    return {
      title: data.title || "Sans titre",
      author: data.author_name || "—",
      provider: data.provider_name || "—",
    };
  } catch {
    return null;
  }
}

async function steamSearchCard(query: string): Promise<FicheCard | null> {
  try {
    const res = await fetch(
      `https://store.steampowered.com/api/storesearch/?term=${encodeURIComponent(query)}&cc=FR&l=french`,
      { signal: AbortSignal.timeout(8000) },
    );
    if (!res.ok) return null;
    const data = (await res.json()) as {
      items?: Array<{ id: number; name: string; price?: { final: number } }>;
    };
    const hit = data.items?.[0];
    if (!hit) return null;
    const price = hit.price?.final != null ? `${(hit.price.final / 100).toFixed(2)} €` : "—";
    return {
      title: hit.name,
      url: `https://store.steampowered.com/app/${hit.id}`,
      fields: [
        { name: "Prix", value: price, inline: true },
        { name: "Wish", value: "Store Steam officiel seulement.", inline: true },
        { name: "Lien", value: `https://store.steampowered.com/app/${hit.id}` },
      ],
    };
  } catch {
    return null;
  }
}

async function memberSignals(member: GuildMember): Promise<FicheCard> {
  const created = member.user.createdAt;
  const joined = member.joinedAt;
  const ageDays = Math.round((Date.now() - created.getTime()) / 86_400_000);
  const joinDelay =
    joined != null ? Math.round((joined.getTime() - created.getTime()) / 86_400_000) : null;
  return {
    title: member.displayName,
    fields: [
      { name: "Compte", value: discordTime(created), inline: true },
      { name: "Join", value: joined ? discordTime(joined) : "—", inline: true },
      { name: "Âge", value: `${ageDays} j`, inline: true },
      {
        name: "Écart création → join",
        value: joinDelay == null ? "—" : `${joinDelay} j`,
        inline: true,
      },
      {
        name: "Lecture",
        value: "Signaux seulement. Pas une preuve de multi-compte, pas de doxx.",
      },
    ],
  };
}

export interface DomainFicheRequest {
  domain?: string;
  sujet?: string;
  query?: string;
  userId?: string;
  guildId?: string;
  client?: Client;
}

export async function resolveDomainFiche(
  req: DomainFicheRequest,
): Promise<{ embeds: EmbedBuilder[]; agentText: string }> {
  const sujet = (req.sujet || "").trim().toLowerCase();
  const query = (req.query || "").trim();
  const kaliHit = NETWORK_DEFENSE_ITEMS.find(
    (item) => item.id === sujet || item.name.toLowerCase() === sujet,
  );
  if (
    kaliHit ||
    sujet === "kali" ||
    sujet === "nmap" ||
    /nmap|hydra|ettercap|hashcat|metasploit|wifite|searchsploit/.test(sujet)
  ) {
    const embeds = buildNetworkDefenseEmbeds(kaliHit);
    return { embeds, agentText: formatDomainFicheForAgent("securite", kaliHit?.name || "kali") };
  }

  const domain = findFicheDomain(req.domain) || findFicheDomain(sujet);

  if (sujet === "hibp" || sujet === "fuite" || looksLikeEmail(query)) {
    const email = looksLikeEmail(query) ? query : undefined;
    const breaches = email ? ((await checkEmail(email)) ?? []) : [];
    const latest = !email ? await getLatestBreach() : null;
    const cards = buildHibpCards(email ? breaches : latest ? [latest] : [], email);
    return {
      embeds: buildFicheEmbeds({
        title: "Fuite HIBP",
        description: email
          ? `Résultat pour ${maskEmail(email)}. Jamais de mot de passe ici.`
          : "Dernière fuite publique du catalogue. Donne un e-mail pour un compte précis.",
        footer: "HIBP · pas de secrets",
        cards,
      }),
      agentText: formatDomainFicheForAgent("securite", "hibp"),
    };
  }

  if (sujet === "ssl" || (domain === "securite" && looksLikeHost(query))) {
    const host = query.replace(/^https?:\/\//, "").replace(/\/.*$/, "") || sslFallbackHost();
    const info = host ? await inspectHostCertificate(host) : null;
    const cards: FicheCard[] = info
      ? [
          {
            title: info.domain,
            fields: [
              { name: "Émetteur", value: info.issuer, inline: true },
              {
                name: "Expire",
                value:
                  info.daysUntilExpiry == null
                    ? info.error || "—"
                    : `${info.daysUntilExpiry} j (${info.validTo?.slice(0, 10) || "—"})`,
                inline: true,
              },
              {
                name: "Parade",
                value: "Renouveler avant 21 j, HTTPS partout, admin hors HTTP.",
              },
            ],
          },
        ]
      : DOMAIN_PLAYBOOKS.securite.cards.filter((c) => c.title.includes("SSL"));
    return {
      embeds: buildFicheEmbeds({
        title: "Certificat SSL",
        description: "Vérification du certificat — rien n’est attaqué.",
        footer: "SSL · défense",
        cards,
      }),
      agentText: formatDomainFicheForAgent("securite", "ssl"),
    };
  }

  if (sujet === "sante" || sujet === "health" || sujet === "santé") {
    const client = req.client;
    const cards = client ? buildHealthCards(client) : DOMAIN_PLAYBOOKS.devops.cards;
    return {
      embeds: buildFicheEmbeds({
        title: "Santé bot",
        description: "Process actuel. Le cron n’alerte que si ça casse.",
        footer: "Ops · santé",
        cards,
      }),
      agentText: formatDomainFicheForAgent("devops", "sante"),
    };
  }

  if (sujet === "deploy" || sujet === "deploiement" || sujet === "déploiement") {
    return {
      embeds: buildFicheEmbeds({
        title: "Déploiement",
        description: "Dernier process ready. SHA si l’env le fournit.",
        footer: "Ops · deploy",
        cards: buildDeployCards(),
      }),
      agentText: formatDomainFicheForAgent("devops", "deploy"),
    };
  }

  if (
    sujet === "meteo" ||
    sujet === "météo" ||
    (domain === "science" && query && !looksLikeUrl(query) && sujet !== "nasa")
  ) {
    if (query && (sujet === "meteo" || sujet === "météo" || sujet === "air")) {
      const weather = await getWeather(query);
      const cards: FicheCard[] = [];
      if (weather) {
        cards.push({
          title: weather.city,
          fields: [
            { name: "Temps", value: weather.description, inline: true },
            { name: "Température", value: `${weather.temperature} °C`, inline: true },
            { name: "Vent", value: `${weather.windspeed} km/h`, inline: true },
          ],
        });
      }
      if (cards.length) {
        return {
          embeds: buildFicheEmbeds({
            title: "Météo",
            description: `Conditions pour **${query}**.`,
            footer: "Science · météo",
            cards,
          }),
          agentText: formatDomainFicheForAgent("science", "meteo"),
        };
      }
    }
  }

  if (sujet === "nasa" || sujet === "apod") {
    const apod = await getNasaApod();
    const cards: FicheCard[] = apod
      ? [
          {
            title: apod.title,
            description: apod.explanation.slice(0, 400),
            image: apod.mediaType === "image" ? apod.url : undefined,
            url: apod.url,
            fields: [{ name: "Date", value: apod.date, inline: true }],
          },
        ]
      : DOMAIN_PLAYBOOKS.science.cards.filter((c) => c.title.includes("NASA"));
    return {
      embeds: buildFicheEmbeds({
        title: "NASA APOD",
        description: "Photo du jour. Une carte.",
        footer: "Science · NASA",
        cards,
      }),
      agentText: formatDomainFicheForAgent("science", "nasa"),
    };
  }

  if (sujet === "steam" && query) {
    const card = await steamSearchCard(query);
    if (card) {
      return {
        embeds: buildFicheEmbeds({
          title: "Jeu Steam",
          description: "Store officiel. Ignore les DMs « support Steam ».",
          footer: "Gaming · Steam",
          cards: [card],
        }),
        agentText: formatDomainFicheForAgent("gaming", "steam"),
      };
    }
  }

  if (
    (sujet === "youtube" || sujet === "tiktok" || sujet === "musique" || sujet === "resume") &&
    looksLikeUrl(query)
  ) {
    const oembed = await fetchOembed(query);
    if (oembed) {
      return {
        embeds: buildFicheEmbeds({
          title: sujet === "musique" ? "Musique" : "Média",
          description: "Métadonnées seulement — pas de fichier.",
          footer: "Médias · oembed",
          cards: [
            {
              title: oembed.title,
              fields: [
                { name: "Auteur", value: oembed.author, inline: true },
                { name: "Source", value: oembed.provider, inline: true },
                { name: "Lien", value: query.slice(0, 500) },
              ],
            },
          ],
        }),
        agentText: formatDomainFicheForAgent(sujet === "musique" ? "vocal" : "medias", sujet),
      };
    }
  }

  if (sujet === "factcheck" || sujet === "fact-check") {
    const urlMatch = query.match(/https?:\/\/\S+/);
    const claim = query.replace(/https?:\/\/\S+/, "").trim() || query;
    return {
      embeds: buildFicheEmbeds({
        title: "Fact-check",
        description: "Pas de verdict sans source.",
        footer: "Science · fact-check",
        cards: [buildFactCheckCard(claim, urlMatch?.[0])],
      }),
      agentText: formatDomainFicheForAgent("science", "factcheck"),
    };
  }

  if (sujet === "bienvenue" || sujet === "welcome" || sujet === "regles") {
    return {
      embeds: buildFicheEmbeds({
        title: "Accueil",
        description: DOMAIN_PLAYBOOKS.communaute.intro,
        footer: "Communauté · accueil",
        cards: buildWelcomeCards(),
      }),
      agentText: formatDomainFicheForAgent("communaute", "bienvenue"),
    };
  }

  if (
    req.client &&
    req.guildId &&
    req.userId &&
    (sujet === "multi" || sujet === "alts" || sujet === "signaux")
  ) {
    const guild = req.client.guilds.cache.get(req.guildId);
    const member = await guild?.members.fetch(req.userId).catch(() => null);
    if (member) {
      return {
        embeds: buildFicheEmbeds({
          title: "Signaux compte",
          description: "Lecture seule. Pas une accusation de multi-compte.",
          footer: "Modération · signaux",
          cards: [await memberSignals(member)],
        }),
        agentText: formatDomainFicheForAgent("moderation", "multi"),
      };
    }
  }

  if (req.guildId && (sujet === "spam" || sujet === "incidents")) {
    const logs = await prisma.log.findMany({
      where: {
        guildId: req.guildId,
        type: { in: ["security", "automod", "antiphishing", "spam", "raid"] },
      },
      orderBy: { createdAt: "desc" },
      take: 8,
    });
    const cards: FicheCard[] =
      logs.length === 0
        ? [
            {
              title: "Aucun incident récent",
              fields: [{ name: "Statut", value: "Rien dans les logs sécu / automod / phishing." }],
            },
          ]
        : logs.map((log) => ({
            title: log.type,
            fields: [
              { name: "Date", value: discordTime(log.createdAt), inline: true },
              { name: "Action", value: log.action || "—", inline: true },
              { name: "Détail", value: (log.details || "—").slice(0, 400) },
            ],
          }));
    return {
      embeds: buildFicheEmbeds({
        title: "Anti-spam",
        description: "Incidents enregistrés. Pas de faux Nitro.",
        footer: "Modération · spam",
        cards,
      }),
      agentText: formatDomainFicheForAgent("moderation", "spam"),
    };
  }

  if (req.guildId && (sujet === "appel" || sujet === "contester")) {
    const userId = req.userId;
    const last = userId
      ? await prisma.sanction.findFirst({
          where: { guildId: req.guildId, userId },
          orderBy: { createdAt: "desc" },
        })
      : null;
    const cards: FicheCard[] = last
      ? [
          {
            title: `Sanction #${last.id}`,
            fields: [
              { name: "Type", value: last.type, inline: true },
              { name: "Date", value: discordTime(last.createdAt), inline: true },
              { name: "Raison", value: last.reason || "—" },
              {
                name: "Contester",
                value: "Ouvre un ticket modo. On ne modifie pas le casier ici.",
              },
            ],
          },
        ]
      : [
          {
            title: "Aucun appel",
            fields: [{ name: "Quoi", value: "Pas de sanction récente pour cette cible." }],
          },
        ];
    return {
      embeds: buildFicheEmbeds({
        title: "Appel",
        description: "Historique pour contester. Même chrome que le casier.",
        footer: "Modération · appel",
        cards,
      }),
      agentText: formatDomainFicheForAgent("moderation", "appel"),
    };
  }

  if (req.guildId && (sujet === "digest" || (domain === "communaute" && sujet === "hebdo"))) {
    const since = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000);
    const [logs, commands, sanctions] = await Promise.all([
      prisma.log.groupBy({
        by: ["type"],
        where: { guildId: req.guildId, createdAt: { gte: since } },
        _count: true,
      }),
      prisma.commandLog.groupBy({
        by: ["command"],
        where: { guildId: req.guildId, timestamp: { gte: since } },
        _count: true,
      }),
      prisma.sanction.count({ where: { guildId: req.guildId, createdAt: { gte: since } } }),
    ]);
    const cards: FicheCard[] = [
      {
        title: "7 jours",
        fields: [
          {
            name: "Logs",
            value:
              logs
                .sort((a, b) => b._count - a._count)
                .slice(0, 6)
                .map((row) => `${row.type}: ${row._count}`)
                .join("\n") || "—",
          },
          {
            name: "Slash",
            value:
              commands
                .sort((a, b) => b._count - a._count)
                .slice(0, 5)
                .map((row) => `/${row.command}: ${row._count}`)
                .join("\n") || "—",
          },
          { name: "Sanctions", value: `${sanctions}`, inline: true },
        ],
      },
    ];
    return {
      embeds: buildFicheEmbeds({
        title: "Digest hebdo",
        description: "Sujets chauds en cartes, pas un roman.",
        footer: "Communauté · digest",
        cards,
      }),
      agentText: formatDomainFicheForAgent("communaute", "digest"),
    };
  }

  if (req.guildId && (sujet === "commandes" || domain === "analytics")) {
    const since = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000);
    const commands = await prisma.commandLog.groupBy({
      by: ["command"],
      where: { guildId: req.guildId, timestamp: { gte: since } },
      _count: true,
    });
    const errors = await prisma.errorMessage.count({
      where: { guildId: req.guildId, createdAt: { gte: since } },
    });
    const cards: FicheCard[] = [
      {
        title: "7 jours",
        fields: [
          {
            name: "Top slash",
            value:
              commands
                .sort((a, b) => b._count - a._count)
                .slice(0, 8)
                .map((row) => `/${row.command} — ${row._count}`)
                .join("\n") || "Aucune commande loggée.",
          },
          { name: "Erreurs", value: `${errors}`, inline: true },
        ],
      },
    ];
    return {
      embeds: buildFicheEmbeds({
        title: "Analytics",
        description: "Résumé Discord. Pas le dump Prometheus.",
        footer: "Analytics · 7 j",
        cards,
      }),
      agentText: formatDomainFicheForAgent("analytics"),
    };
  }

  if (req.userId && (sujet === "memoire" || sujet === "preferences" || sujet === "préférences")) {
    const facts = await prisma.memoryFact.findMany({
      where: { userId: req.userId },
      orderBy: { weight: "desc" },
      take: 8,
    });
    const cards: FicheCard[] =
      facts.length === 0
        ? [
            {
              title: "Mémoire vide",
              fields: [{ name: "Quoi", value: "Aucun fait stocké pour ce membre." }],
            },
          ]
        : facts.map((fact) => ({
            title: fact.key.slice(0, 256),
            fields: [
              { name: "Valeur", value: fact.value.slice(0, 1000) },
              { name: "Catégorie", value: fact.category || "info", inline: true },
            ],
          }));
    return {
      embeds: buildFicheEmbeds({
        title: "Préférences",
        description: "Cartes, pas un dump JSON.",
        footer: "IA · mémoire",
        cards,
      }),
      agentText: formatDomainFicheForAgent("ia", "memoire"),
    };
  }

  if (!domain) {
    return {
      embeds: listDomainIndexEmbeds(),
      agentText:
        "Index des fiches posté. Une phrase, pas de tableau markdown. Pas de faux Nitro, pas de Kali offensif.",
    };
  }

  return {
    embeds: buildDomainPlaybookEmbeds(domain),
    agentText: formatDomainFicheForAgent(domain, sujet || undefined),
  };
}

function sslFallbackHost(): string {
  return (process.env.SSL_WATCH_HOSTS || "").split(",")[0]?.trim() || "";
}

export async function presentDomainFicheFromTool(
  ctx: { client: Client; message?: Message; channelId?: string; guildId?: string; userId?: string },
  req: DomainFicheRequest,
): Promise<{ success: true; data: string }> {
  const resolved = await resolveDomainFiche({
    ...req,
    client: ctx.client,
    guildId: req.guildId || ctx.guildId,
    userId: req.userId || ctx.userId,
  });
  await presentFichesFromTool(ctx, resolved.embeds);
  return { success: true, data: resolved.agentText };
}
