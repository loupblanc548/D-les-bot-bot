/**
 * selfLearner.ts — Auto-apprentissage continu
 *
 * Le bot génère des questions sur des sujets variés, y répond via des sources
 * gratuites (Wikipédia, Wiktionnaire) et stocke les Q&A dans Obsidian.
 * Au fil du temps, le vault se remplit de connaissances pré-construites.
 *
 * Quand un utilisateur pose une question similaire, le bot trouve la Q&A
 * dans Obsidian et répond SANS appeler l'API payante.
 */

import logger from "../utils/logger.js";
import crypto from "crypto";
import fs from "fs";
import path from "path";
import { execFileSync } from "child_process";
import { saveQA, searchQA } from "./obsidianMemory.js";
import { braveWebSearch, isBraveSearchAvailable } from "./braveSearch.js";
import { sendProactiveAlert } from "./proactiveAlerts.js";

const LEARN_INTERVAL_MS = 1 * 60 * 1000; // 1 min entre chaque batch
const BATCH_SIZE = 8; // 8 Q&A par batch = ~11520 Q&A/jour
let isLearning = false;
let learnTimer: ReturnType<typeof setInterval> | null = null;

// ─── Dedup persistant: fichier sur disque qui survit aux redémarrages ────────
const DEDUP_FILE = process.env.OBSIDIAN_VAULT_PATH
  ? path.join(process.env.OBSIDIAN_VAULT_PATH, "qa", ".learned-subjects.json")
  : "/tmp/bot-learned-subjects.json";

function loadLearnedSet(): Set<string> {
  try {
    if (fs.existsSync(DEDUP_FILE)) {
      const data = JSON.parse(fs.readFileSync(DEDUP_FILE, "utf-8")) as string[];
      return new Set(data);
    }
  } catch {
    // ignore
  }
  return new Set();
}

function saveLearnedSet(set: Set<string>): void {
  try {
    const dir = path.dirname(DEDUP_FILE);
    if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
    fs.writeFileSync(DEDUP_FILE, JSON.stringify([...set]), "utf-8");
  } catch {
    // non-critical
  }
}

function normalizeSubject(subject: string): string {
  return subject
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[^a-z0-9]/g, "")
    .trim();
}

function subjectHash(subject: string): string {
  return crypto.createHash("md5").update(normalizeSubject(subject)).digest("hex").slice(0, 12);
}

// ─── Sujets prédéfinis pour l'apprentissage ──────────────────────────────────
// Liste massive couvrant tous les domaines possibles et imaginables
const LEARN_TOPICS: { category: string; subjects: string[] }[] = [
  {
    category: "tech",
    subjects: [
      "processeur",
      "carte graphique",
      "RAM",
      "SSD",
      "disque dur",
      "carte mère",
      "alimentation PC",
      "refroidissement liquide",
      "ventirad",
      "overclocking",
      "système d'exploitation",
      "Linux",
      "Windows",
      "macOS",
      "Ubuntu",
      "Debian",
      "Arch Linux",
      "Android",
      "iOS",
      "HarmonyOS",
      "Python",
      "JavaScript",
      "TypeScript",
      "Rust",
      "C++",
      "Java",
      "Go",
      "Kotlin",
      "Swift",
      "Ruby",
      "PHP",
      "C#",
      "Dart",
      "Scala",
      "Elixir",
      "Zig",
      "Nim",
      "intelligence artificielle",
      "machine learning",
      "deep learning",
      "réseau de neurones",
      "transformer",
      "GPT",
      "LLM",
      "RAG",
      "embedding",
      "fine-tuning",
      "vision par ordinateur",
      "NLP",
      "reconnaissance vocale",
      "synthèse vocale",
      "blockchain",
      "cryptomonnaie",
      "Bitcoin",
      "Ethereum",
      "NFT",
      "DeFi",
      "smart contract",
      "cybersécurité",
      "VPN",
      "pare-feu",
      "chiffrement",
      "AES",
      "RSA",
      "TLS",
      "SSL",
      "pentest",
      "ingénierie sociale",
      "phishing",
      "ransomware",
      "malware",
      "rootkit",
      "Docker",
      "Kubernetes",
      "cloud computing",
      "AWS",
      "Azure",
      "GCP",
      "Vercel",
      "Git",
      "GitHub",
      "GitLab",
      "CI/CD",
      "DevOps",
      "SRE",
      "base de données",
      "SQL",
      "PostgreSQL",
      "MySQL",
      "MongoDB",
      "Redis",
      "Elasticsearch",
      "GraphQL",
      "REST API",
      "gRPC",
      "WebSocket",
      "WebRTC",
      "HTML",
      "CSS",
      "Tailwind",
      "React",
      "Vue",
      "Svelte",
      "Angular",
      "Next.js",
      "Nuxt",
      "Node.js",
      "Deno",
      "Bun",
      "Express",
      "Fastify",
      "NestJS",
      "Hono",
      "Raspberry Pi",
      "Arduino",
      "ESP32",
      "IoT",
      "domotique",
      "home assistant",
      "impression 3D",
      "laser cutting",
      "CAD",
      "FreeCAD",
      "Blender",
      "réseau informatique",
      "TCP/IP",
      "DNS",
      "BGP",
      "CDN",
      "load balancer",
      "virtualisation",
      "VMware",
      "Proxmox",
      "QEMU",
      "KVM",
      "shell",
      "bash",
      "powershell",
      "awk",
      "sed",
      "vim",
      "neovim",
    ],
  },
  {
    category: "science",
    subjects: [
      "photosynthèse",
      "ADN",
      "ARN",
      "évolution",
      "génétique",
      "mutation génétique",
      "gravité",
      "relativité",
      "relativité restreinte",
      "relativité générale",
      "trou noir",
      "trou de ver",
      "système solaire",
      "étoile",
      "galaxie",
      "big bang",
      "nébuleuse",
      "pulsar",
      "quasar",
      "supernova",
      "naine blanche",
      "naine brune",
      "exoplanète",
      "Mars",
      "Jupiter",
      "Saturne",
      "Vénus",
      "Mercure",
      "Uranus",
      "Neptune",
      "Lune",
      "Titan",
      "Europe",
      "ceinture d'astéroïdes",
      "comète",
      "météorite",
      "atome",
      "molécule",
      "réaction chimique",
      "tableau périodique",
      "élément chimique",
      "électricité",
      "magnétisme",
      "thermodynamique",
      "quantique",
      "physique des particules",
      "boson de Higgs",
      "quantum",
      "superposition",
      "intrication quantique",
      "volcan",
      "tremblement de terre",
      "tectonique des plaques",
      "tsunami",
      "géothermie",
      "climat",
      "météo",
      "effet de serre",
      "océan",
      "courant marin",
      "El Niño",
      "glaciation",
      "ère glaciaire",
      "permafrost",
      "dérive des continents",
      "biologie",
      "cellule",
      "mitochondrie",
      "bactérie",
      "virus",
      "prion",
      "écosystème",
      "biodiversité",
      "extinction de masse",
      "théorie de l'évolution",
      "chimie organique",
      "chimie inorganique",
      "biochimie",
      "catalyseur",
      "mathématiques",
      "algèbre",
      "géométrie",
      "trigonométrie",
      "calcul différentiel",
      "probabilités",
      "statistiques",
      "théorie des nombres",
      "topologie",
      "fractale",
      "nombre premier",
      "nombre d'or",
      "suite de Fibonacci",
      "cryptographie",
      "théorie de l'information",
      "théorie des jeux",
      "nanotechnologie",
      "biotechnologie",
      "CRISPR",
      "clonage",
      "cellules souches",
      "fission nucléaire",
      "fusion nucléaire",
      "énergie nucléaire",
      "uranium",
      "plutonium",
      "énergie solaire",
      "énergie éolienne",
      "énergie hydraulique",
      "géothermie",
      "pile à combustible",
      "hydrogène",
      "batterie lithium-ion",
    ],
  },
  {
    category: "culture",
    subjects: [
      "Renaissance",
      "Révolution française",
      "Révolution industrielle",
      "Seconde Guerre mondiale",
      "Première Guerre mondiale",
      "Guerre froide",
      "Empire romain",
      "Empire byzantin",
      "Empire ottoman",
      "Empire mongol",
      "Antiquité grecque",
      "Antiquité égyptienne",
      "Moyen Âge",
      "féodalité",
      "découverte de l'Amérique",
      "colonisation",
      "décolonisation",
      "philosophie",
      "Socrate",
      "Platon",
      "Aristote",
      "Kant",
      "Nietzsche",
      "Descartes",
      "Rousseau",
      "Voltaire",
      "Marx",
      "Sartre",
      "Camus",
      "Stoïcisme",
      "Épicurisme",
      "existentialisme",
      "phénoménologie",
      "art",
      "peinture",
      "sculpture",
      "architecture",
      "musique",
      "opéra",
      "littérature",
      "poésie",
      "théâtre",
      "cinéma",
      "photographie",
      "Renaissance italienne",
      "Baroque",
      "Romantisme",
      "Impressionnisme",
      "Cubisme",
      "Surréalisme",
      "Art abstrait",
      "Art contemporain",
      "mythologie grecque",
      "mythologie nordique",
      "mythologie égyptienne",
      "religion",
      "bouddhisme",
      "christianisme",
      "islam",
      "hindouisme",
      "judaïsme",
      "shintoïsme",
      "taoïsme",
      "confucianisme",
      "animisme",
      "Bible",
      "Coran",
      "Torah",
      "Vedas",
      "Tripitaka",
      "langues",
      "linguistique",
      "étymologie",
      "phonétique",
      "syntaxe",
      "français",
      "anglais",
      "espagnol",
      "allemand",
      "italien",
      "portugais",
      "russe",
      "chinois",
      "japonais",
      "coréen",
      "arabe",
      "hindi",
      "espéranto",
      "latin",
      "grec ancien",
      "sanskrit",
      "cuisine française",
      "cuisine italienne",
      "cuisine japonaise",
      "cuisine chinoise",
      "cuisine indienne",
      "cuisine mexicaine",
      "gastronomie",
      "œnologie",
      "mode",
      "haute couture",
      "prêt-à-porter",
      "Louis Vuitton",
      "Chanel",
      "Dior",
      "danse",
      "ballet",
      "hip-hop",
      "tango",
      "salsa",
      "danse contemporaine",
      "festival",
      "Cannes",
      "Oscars",
      "Grammy Awards",
      "Eurovision",
    ],
  },
  {
    category: "gaming",
    subjects: [
      "Helldivers",
      "Helldivers 2",
      "GTA",
      "GTA V",
      "GTA 6",
      "GTA Online",
      "Minecraft",
      "Fortnite",
      "Valorant",
      "League of Legends",
      "Counter-Strike",
      "Counter-Strike 2",
      "Dota 2",
      "Overwatch",
      "Overwatch 2",
      "Apex Legends",
      "Call of Duty",
      "Battlefield",
      "Rainbow Six Siege",
      "Elden Ring",
      "Dark Souls",
      "Bloodborne",
      "Sekiro",
      "The Witcher",
      "Cyberpunk 2077",
      "Baldur's Gate 3",
      "Skyrim",
      "Final Fantasy",
      "Final Fantasy VII",
      "Kingdom Hearts",
      "Zelda",
      "Breath of the Wild",
      "Tears of the Kingdom",
      "Mario",
      "Sonic",
      "Pokémon",
      "Metroid",
      "Donkey Kong",
      "PlayStation",
      "Xbox",
      "Nintendo Switch",
      "PC gaming",
      "Steam Deck",
      "Steam",
      "Epic Games",
      "Battle.net",
      "GOG",
      "itch.io",
      "MMORPG",
      "FPS",
      "RPG",
      "RTS",
      "battle royale",
      "MOBA",
      "roguelike",
      "metroidvania",
      "visual novel",
      "point and click",
      "speedrun",
      "esport",
      "streaming",
      "Twitch",
      "YouTube Gaming",
      "game engine",
      "Unreal Engine",
      "Unity",
      "Godot",
      "game design",
      "game developer",
      "indie game",
      "Early Access",
      "DLC",
      "microtransaction",
      "loot box",
      "battle pass",
      "cross-play",
      "ray tracing",
      "DLSS",
      "FSR",
      "PlayStation 5",
      "Xbox Series X",
      "PlayStation 4",
      "Xbox One",
      "Game Boy",
      "NES",
      "SNES",
      "Sega Genesis",
      "N64",
      "PS1",
      "PS2",
      "PS3",
      "rétrogaming",
      "émulateur",
      "ROM",
      "arcade",
    ],
  },
  {
    category: "quotidien",
    subjects: [
      "nutrition",
      "vitamine C",
      "vitamine D",
      "vitamine B12",
      "fer",
      "calcium",
      "protéine",
      "glucide",
      "lipide",
      "fibre alimentaire",
      "antioxydant",
      "régime alimentaire",
      "végétarisme",
      "végétalisme",
      "cétogène",
      "jeûne intermittent",
      "sommeil",
      "insomnie",
      "apnée du sommeil",
      "cycle circadien",
      "stress",
      "anxiété",
      "dépression",
      "burn-out",
      "méditation",
      "pleine conscience",
      "exercice physique",
      "musculation",
      "cardio",
      "yoga",
      "Pilates",
      "stretching",
      "running",
      "cyclisme",
      "natation",
      "escalade",
      "randonnée",
      "ski",
      "surf",
      "cuisine",
      "recette",
      "pâtisserie",
      "boulangerie",
      "pâtes",
      "pizza",
      "sushi",
      "jardinage",
      "plante",
      "fleur",
      "bonsaï",
      "potager",
      "compost",
      "voyage",
      "culture japonaise",
      "culture coréenne",
      "culture américaine",
      "culture chinoise",
      "culture indienne",
      "culture africaine",
      "Tokyo",
      "Paris",
      "Londres",
      "New York",
      "Séoul",
      "Bangkok",
      "Barcelone",
      "maison",
      "décoration",
      "minimalisme",
      "feng shui",
      "bricolage",
      "voiture",
      "véhicule électrique",
      "hybride",
      "Tesla",
      "vélo",
      "scooter",
      "finance personnelle",
      "budget",
      "épargne",
      "investissement",
      "bourse",
      "assurance",
      "hypothèque",
      "crédit",
      "impôt",
      "cryptomonnaie",
      "éducation",
      "école",
      "université",
      "apprentissage",
      "mémoire",
      "concentration",
      "productivité",
      "gestion du temps",
      "Pomodoro",
      "GTD",
      "Notion",
      "Obsidian",
      "santé mentale",
      "thérapie",
      "psychologie",
      "psychanalyse",
      "TCCE",
      "relation",
      "communication",
      "non-violente",
      "intelligence émotionnelle",
      "parenting",
      "enfant",
      "adolescent",
      "éducation wellington",
    ],
  },
  {
    category: "discord",
    subjects: [
      "comment bannir un membre Discord",
      "comment configurer les rôles Discord",
      "comment créer un bot Discord",
      "permissions Discord",
      "webhooks Discord",
      "salons vocaux Discord",
      "intégrations Discord",
      "Discord Nitro",
      "serveur Discord communautaire",
      "modération Discord automatisée",
      "Discord.js",
      "Discord.py",
      "slash commands Discord",
      "embeds Discord",
      "Discord API",
      "Discord OAuth2",
      "Discord bot hosting",
      "auto-mod Discord",
      "anti-raid Discord",
      "anti-spam Discord",
      "Discord tickets",
      "Discord threads",
      "Discord forums",
      "Discord stages",
      "Discord events",
      "Discord activities",
    ],
  },
  {
    category: "osint",
    subjects: [
      "recherche OSINT",
      "investigation numérique",
      "analyse de domaine",
      "WHOIS",
      "DNS lookup",
      "scan de ports",
      "empreinte digitale web",
      "réseaux sociaux investigation",
      "géolocalisation",
      "analyse de métadonnées",
      "stéganographie",
      "Maltego",
      "Shodan",
      "theHarvester",
      "SpiderFoot",
      "Google dorking",
      "Wayback Machine",
      "archive internet",
      "VPN detection",
      "proxy detection",
      "Tor",
      "dark web",
      "deep web",
      "forensic",
      "analyse de disque",
      "récupération de données",
      "ingénierie sociale",
      "phishing",
      "spear phishing",
      "vishing",
      "threat intelligence",
      "IOC",
      "APT",
      "ransomware",
      "botnet",
      "zero-day",
      "exploit",
      "CVE",
      "vulnerability scanner",
      "Nessus",
      "Burp Suite",
      "Metasploit",
      "Nmap",
      "Wireshark",
      "John the Ripper",
    ],
  },
  {
    category: "meteo",
    subjects: [
      "prévision météo",
      "nuages",
      "cumulus",
      "stratus",
      "cirrus",
      "cumulonimbus",
      "orage",
      "foudre",
      "éclair",
      "tonnerre",
      "grêle",
      "tornade",
      "ouragan",
      "cyclone",
      "typhon",
      "anticyclone",
      "dépression atmosphérique",
      "front froid",
      "front chaud",
      "front occlus",
      "humidité",
      "pression atmosphérique",
      "température",
      "point de rosée",
      "isobare",
      "isotherme",
      "vent",
      "brise",
      "mistral",
      "sirocco",
      "foehn",
      "canicule",
      "vague de froid",
      "gel",
      "neige",
      "verglas",
      "brouillard",
      "arc-en-ciel",
      "parhélie",
      "aurore boréale",
      "aurore australe",
      "satellite météo",
      "radar météo",
      "station météo",
      "anémomètre",
      "El Niño",
      "La Niña",
      "oscillation australe",
      "gulf stream",
      "réchauffement climatique",
      "changements climatiques",
      "GIEC",
      "empreinte carbone",
      "neutralité carbone",
      "transition écologique",
    ],
  },
  {
    category: "histoire",
    subjects: [
      "préhistoire",
      "paléolithique",
      "néolithique",
      "âge du bronze",
      "âge du fer",
      "Mésopotamie",
      "Babylone",
      "Assyrie",
      "Sumer",
      "Égypte antique",
      "Grèce antique",
      "Rome antique",
      "Empire perse",
      "Empire chinois",
      "dynastie Tang",
      "dynastie Ming",
      "dynastie Qing",
      "Vikings",
      "Normands",
      "Charlemagne",
      "Empire carolingien",
      "Croisades",
      "Templiers",
      "Inquisition",
      "Reconquista",
      "Guerre de Cent Ans",
      "Guerre de Trente Ans",
      "Guerre de Sept Ans",
      "Révolution américaine",
      "Révolution haïtienne",
      "Révolution russe",
      "Guerre de Sécession",
      "Guerre d'Espagne",
      "Guerre du Vietnam",
      "Guerre de Corée",
      "Guerre d'Algérie",
      "Guerre d'Indochine",
      "Mur de Berlin",
      "chute du communisme",
      "perestroïka",
      "apartheid",
      "droits civiques",
      "Martin Luther King",
      "Nelson Mandela",
      "colonisation de l'Afrique",
      "traite négrière",
      "esclavage",
      "silk road",
      "route de la soie",
      "commerce maritime",
      "imprimerie",
      "révolution industrielle",
      "machine à vapeur",
      "découverte de la pénicilline",
      "vaccin",
      "Louis Pasteur",
      "Renaissance",
      "Siècle des Lumières",
      "Romantisme",
    ],
  },
  {
    category: "geographie",
    subjects: [
      "France",
      "Japon",
      "Corée du Sud",
      "États-Unis",
      "Chine",
      "Inde",
      "Brésil",
      "Russie",
      "Canada",
      "Australie",
      "Allemagne",
      "Italie",
      "Espagne",
      "Portugal",
      "Royaume-Uni",
      "Mexique",
      "Argentine",
      "Égypte",
      "Maroc",
      "Algérie",
      "Tunisie",
      "Sénégal",
      "Nigeria",
      "Afrique du Sud",
      "Kenya",
      "Éthiopie",
      "Thaïlande",
      "Vietnam",
      "Indonésie",
      "Philippines",
      "Turquie",
      "Iran",
      "Arabie Saoudite",
      "Israël",
      "Palestine",
      "Suisse",
      "Belgique",
      "Pays-Bas",
      "Suède",
      "Norvège",
      "Finlande",
      "Danemark",
      "Pologne",
      "Ukraine",
      "Grèce",
      "Paris",
      "Lyon",
      "Marseille",
      "Tokyo",
      "Séoul",
      "New York",
      "Londres",
      "Berlin",
      "Moscou",
      "Pékin",
      "Shanghai",
      "Bombay",
      "Le Caire",
      "Istanbul",
      "Dubaï",
      "Singapour",
      "Hong Kong",
      "océan Pacifique",
      "océan Atlantique",
      "océan Indien",
      "océan Arctique",
      "désert du Sahara",
      "désert de Gobi",
      "Amazonie",
      "forêt tropicale",
      "Himalaya",
      "Alpes",
      "Andes",
      "Rocheuses",
      "Caucase",
      "fleuve Amazone",
      "Nil",
      "Mississippi",
      "Yangtze",
      "Gange",
      "canal de Suez",
      "canal de Panama",
      "détroit de Gibraltar",
    ],
  },
  {
    category: "sport",
    subjects: [
      "football",
      "basketball",
      "tennis",
      "rugby",
      "cricket",
      "baseball",
      "handball",
      "volleyball",
      "hockey sur glace",
      "football américain",
      "golf",
      "athlétisme",
      "natation",
      "cyclisme",
      "boxe",
      "MMA",
      "UFC",
      "judo",
      "karaté",
      "taekwondo",
      "aïkido",
      "kung fu",
      "BJJ",
      "escrime",
      "tir à l'arc",
      "équitation",
      "aviron",
      "voile",
      "ski alpin",
      "ski de fond",
      "snowboard",
      "patinage",
      "hockey",
      "Formule 1",
      "rallye",
      "MotoGP",
      "NASCAR",
      "IndyCar",
      "Jeux Olympiques",
      "Jeux Olympiques d'été",
      "Jeux Olympiques d'hiver",
      "Coupe du Monde",
      "Euro",
      "Ligue des Champions",
      "NBA",
      "NFL",
      "NHL",
      "Tour de France",
      "Wimbledon",
      "Roland-Garros",
      "US Open",
      "Lionel Messi",
      "Cristiano Ronaldo",
      "Kylian Mbappé",
      "Neymar",
      "LeBron James",
      "Michael Jordan",
      "Kobe Bryant",
      "Serena Williams",
      "Rafael Nadal",
      "Roger Federer",
      "Novak Djokovic",
    ],
  },
  {
    category: "musique",
    subjects: [
      "rock",
      "pop",
      "jazz",
      "blues",
      "classique",
      "électronique",
      "techno",
      "house",
      "dubstep",
      "trance",
      "drum and bass",
      "ambient",
      "hip-hop",
      "rap",
      "R&B",
      "soul",
      "funk",
      "reggae",
      "ska",
      "punk",
      "metal",
      "heavy metal",
      "death metal",
      "black metal",
      "power metal",
      "country",
      "folk",
      "bluegrass",
      "gospel",
      "flamenco",
      "K-pop",
      "J-pop",
      "anime music",
      "vocaloid",
      "lo-fi",
      "guitare",
      "piano",
      "batterie",
      "basse",
      "violon",
      "violoncelle",
      "saxophone",
      "trompette",
      "flûte",
      "accordéon",
      "harpe",
      "Beatles",
      "Rolling Stones",
      "Led Zeppelin",
      "Pink Floyd",
      "Queen",
      "Michael Jackson",
      "Madonna",
      "Prince",
      "David Bowie",
      "Eminem",
      "Tupac",
      "Notorious BIG",
      "Jay-Z",
      "Kanye West",
      "BTS",
      "Blackpink",
      "Stray Kids",
      "TWICE",
      "Daft Punk",
      "Deadmau5",
      "Tiësto",
      "Calvin Harris",
      "Mozart",
      "Beethoven",
      "Bach",
      "Chopin",
      "Debussy",
      "Stravinsky",
      "solfège",
      "accordage",
      "gamme musicale",
      "harmonie",
      "contrepoint",
    ],
  },
  {
    category: "cinema",
    subjects: [
      "cinéma",
      "histoire du cinéma",
      "âge d'or d'Hollywood",
      "Nouvelle Vague",
      "néoréalisme italien",
      "expressionnisme allemand",
      "cinéma japonais",
      "Studio Ghibli",
      "Hayao Miyazaki",
      "Akira Kurosawa",
      "Alfred Hitchcock",
      "Steven Spielberg",
      "Martin Scorsese",
      "Quentin Tarantino",
      "Christopher Nolan",
      "Stanley Kubrick",
      "Francis Ford Coppola",
      "Ridley Scott",
      "Denis Villeneuve",
      "Star Wars",
      "Seigneur des Anneaux",
      "Harry Potter",
      "Marvel Cinematic Universe",
      "DC Comics",
      "Batman",
      "Superman",
      "Spider-Man",
      "Iron Man",
      "Matrix",
      "Inception",
      "Interstellar",
      "Dune",
      "Blade Runner",
      "Pulp Fiction",
      "Goodfellas",
      "The Godfather",
      "Casablanca",
      "anime",
      "Studio Ghibli films",
      "Your Name",
      "Demon Slayer",
      "Attack on Titan",
      "One Piece",
      "Naruto",
      "Bleach",
      "Dragon Ball",
      "Hunter x Hunter",
      "Fullmetal Alchemist",
      "Death Note",
      "Cowboy Bebop",
      "Evangelion",
      "Oscars",
      "Cannes Film Festival",
      "Sundance Film Festival",
      "effets spéciaux",
      "CGI",
      "motion capture",
      "stuntman",
    ],
  },
  {
    category: "sante",
    subjects: [
      "système immunitaire",
      "vaccin",
      "anticorps",
      "virus",
      "bactérie",
      "grippe",
      "COVID-19",
      "rhume",
      "angine",
      "bronchite",
      "pneumonie",
      "diabète",
      "hypertension",
      "cholestérol",
      "maladie cardiovasculaire",
      "cancer",
      "chimiothérapie",
      "radiothérapie",
      "immunothérapie",
      "Alzheimer",
      "Parkinson",
      "sclérose en plaques",
      "épilepsie",
      "allergie",
      "asthme",
      "eczéma",
      "psoriasis",
      "arthrose",
      "arthrite",
      "osteoporose",
      "lombalgie",
      "migraine",
      "céphalée",
      "acouphène",
      "vertige",
      "nutrition",
      "obésité",
      "anorexie",
      "boulimie",
      "santé mentale",
      "dépression",
      "anxiété",
      "bipolarité",
      "schizophrénie",
      "TDAH",
      "autisme",
      "dyslexie",
      "dyspraxie",
      "premiers secours",
      "RCP",
      "massage cardiaque",
      "défibrillateur",
      "don de sang",
      "greffe d'organe",
      "moelle osseuse",
      "médecine alternative",
      "acupuncture",
      "homéopathie",
      "phytothérapie",
      "sommeil",
      "insomnie",
      "apnée",
      "narcolepsie",
      "grossesse",
      "accouchement",
      "allaitement",
      "IVG",
      "contraception",
      "pilule",
      "préservatif",
      "stérilet",
    ],
  },
  {
    category: "business",
    subjects: [
      "entrepreneuriat",
      "startup",
      "business plan",
      "levée de fonds",
      "capital risque",
      "business angel",
      "crowdfunding",
      "Kickstarter",
      "marketing",
      "marketing digital",
      "SEO",
      "SEA",
      "réseaux sociaux marketing",
      "influencer marketing",
      "content marketing",
      "email marketing",
      "e-commerce",
      "dropshipping",
      "Amazon FBA",
      "Shopify",
      "WooCommerce",
      "freelance",
      "auto-entrepreneur",
      "SASU",
      "SARL",
      "EURL",
      "comptabilité",
      "bilan",
      "compte de résultat",
      "cash flow",
      "fiscalité",
      "TVA",
      "IS",
      "IR",
      "IFI",
      "ressources humaines",
      "recrutement",
      "paie",
      "droit du travail",
      "management",
      "leadership",
      "Agile",
      "Scrum",
      "Kanban",
      "négociation",
      "vente",
      "prospection",
      "CRM",
      "Salesforce",
      "stratégie d'entreprise",
      "avantage concurrentiel",
      "Porter",
      "blue ocean strategy",
      "disruption",
      "innovation",
      "propriété intellectuelle",
      "brevet",
      "marque déposée",
      "copyright",
      "droit commercial",
      "contrat",
      "CGV",
      "RGPD",
    ],
  },
  {
    category: "animaux",
    subjects: [
      "chien",
      "chat",
      "cheval",
      "vache",
      "mouton",
      "chèvre",
      "cochon",
      "poule",
      "canard",
      "lapin",
      "hamster",
      "cobaye",
      "furet",
      "aquarium",
      "poisson rouge",
      "poisson tropical",
      "koi",
      "perroquet",
      "cockatiel",
      "perruche",
      "canari",
      "reptile",
      "tortue",
      "lézard",
      "gecko",
      "iguane",
      "serpent",
      "lion",
      "tigre",
      "léopard",
      "guépard",
      "jaguar",
      "panthère",
      "éléphant",
      "girafe",
      "rhinocéros",
      "hippopotame",
      "zèbre",
      "ours",
      "loup",
      "renard",
      "cerf",
      "sanglier",
      "dauphin",
      "baleine",
      "orque",
      "requin",
      "raie",
      "aigle",
      "faucon",
      "hibou",
      "chouette",
      "vautour",
      "abeille",
      "guêpe",
      "fourmi",
      "papillon",
      "mante religieuse",
      "araignée",
      "scorpion",
      "centipède",
      "corail",
      "méduse",
      "pieuvre",
      "calmar",
      "seiche",
      "extinction",
      "espèce protégée",
      "conservation",
      "WWF",
    ],
  },
  {
    category: "art_craft",
    subjects: [
      "dessin",
      "peinture",
      "aquarelle",
      "huile",
      "acrylique",
      "gouache",
      "pastel",
      "fusain",
      "croquis",
      "perspective",
      "anatomie artistique",
      "calligraphie",
      "typographie",
      "lettrage",
      "graffiti",
      "street art",
      "poterie",
      "céramique",
      "sculpture",
      "modelage",
      "terre cuite",
      "tricot",
      "crochet",
      "broderie",
      "couture",
      "tapisserie",
      "menuiserie",
      "ébénisterie",
      "sculpture sur bois",
      "marqueterie",
      "verrerie",
      "vitrail",
      "soufflage de verre",
      "bijouterie",
      "joaillerie",
      "orfèvrerie",
      "diamant",
      "or",
      "argent",
      "tatouage",
      "piercing",
      "body art",
      "photographie",
      "portrait",
      "paysage",
      "macro",
      "street photography",
      "Lightroom",
      "Photoshop",
      "GIMP",
      "Procreate",
      "design graphique",
      "logo",
      "branding",
      "UI design",
      "UX design",
      "Figma",
      "Adobe Illustrator",
      "InDesign",
    ],
  },
];

// ─── Sujets en anglais pour couvrir plus de domaines ─────────────────────────
const EN_TOPICS: { category: string; subjects: string[] }[] = [
  {
    category: "tech_en",
    subjects: [
      "quantum computing",
      "large language model",
      "neural network architecture",
      "edge computing",
      "distributed systems",
      "microservices",
      "container orchestration",
      "WebAssembly",
      "GraphQL",
      "WebRTC",
      "CRDT",
      "zero-knowledge proof",
      "homomorphic encryption",
      "post-quantum cryptography",
      "federated learning",
      "reinforcement learning",
      "transfer learning",
      "generative adversarial network",
      "diffusion model",
      "retrieval augmented generation",
    ],
  },
  {
    category: "science_en",
    subjects: [
      "CRISPR gene editing",
      "fusion energy",
      "dark matter",
      "exoplanet detection",
      "James Webb Space Telescope",
      "gravitational waves",
      "quantum entanglement",
      "protein folding",
      "stem cell therapy",
      "mRNA vaccine technology",
      "carbon capture technology",
      "perovskite solar cell",
      "superconductor",
      "topological insulator",
      "metamaterial",
    ],
  },
];

// Combiner les topics FR et EN
const ALL_LEARN_TOPICS = [...LEARN_TOPICS, ...EN_TOPICS];

// ─── Tracker persistant pour éviter de répéter les mêmes sujets ──────────────
const learnedSubjects = loadLearnedSet();
function getNextSubject(): { category: string; subject: string } | null {
  if (ALL_LEARN_TOPICS.length === 0) return null;

  let attempts = 0;
  while (attempts < 100) {
    // Pick a random category each time to balance learning
    const topic = ALL_LEARN_TOPICS[Math.floor(Math.random() * ALL_LEARN_TOPICS.length)];
    const subject = topic.subjects[Math.floor(Math.random() * topic.subjects.length)];
    attempts++;

    const hash = subjectHash(subject);
    if (!learnedSubjects.has(hash)) {
      learnedSubjects.add(hash);
      saveLearnedSet(learnedSubjects);
      return { category: topic.category, subject };
    }
  }

  // Tous les sujets ont été traités — reset
  logger.info("[SelfLearner] 🔄 Tous les sujets ont été traités — reset du cycle");
  learnedSubjects.clear();
  saveLearnedSet(learnedSubjects);
  return null;
}

// ─── DB Wikipedia locale (offline, instantané) ───────────────────────────────
const WIKI_DB_PATH = "/opt/wikipedia/wikipedia.db";
let wikiDbAvailable: boolean | null = null;

function isWikiDbAvailable(): boolean {
  if (wikiDbAvailable !== null) return wikiDbAvailable;
  try {
    const result = execFileSync(
      "python3",
      ["-c", `import os; print("1" if os.path.exists("${WIKI_DB_PATH}") else "0")`],
      { timeout: 3000, encoding: "utf-8" },
    ).trim();
    wikiDbAvailable = result === "1";
    if (wikiDbAvailable) logger.info("[SelfLearner] DB Wikipedia locale détectée (offline)");
  } catch {
    wikiDbAvailable = false;
  }
  return wikiDbAvailable;
}

function queryWikiDb(query: string): string | null {
  try {
    const script = `import sqlite3,json; c=sqlite3.connect("${WIKI_DB_PATH}"); r=c.execute("SELECT extract FROM articles WHERE title = ? COLLATE NOCASE",(r"${query.replace(/"/g, '\\"')}",)).fetchone(); print(json.dumps(r[0]) if r else "null")`;
    const result = execFileSync("python3", ["-c", script], {
      timeout: 3000,
      encoding: "utf-8",
    }).trim();
    if (result && result !== "null") return JSON.parse(result);
    // Fuzzy match
    const prefix = query.slice(0, Math.max(3, Math.floor(query.length * 0.7)));
    const script2 = `import sqlite3,json; c=sqlite3.connect("${WIKI_DB_PATH}"); r=c.execute("SELECT extract FROM articles WHERE title LIKE ? COLLATE NOCASE LIMIT 1",(r"${prefix.replace(/"/g, '\\"')}%",)).fetchone(); print(json.dumps(r[0]) if r else "null")`;
    const result2 = execFileSync("python3", ["-c", script2], {
      timeout: 3000,
      encoding: "utf-8",
    }).trim();
    if (result2 && result2 !== "null") return JSON.parse(result2);
  } catch {
    // ignore
  }
  return null;
}

// ─── Récupérer un résumé Wikipédia (gratuit, pas d'API payante) ──────────────
async function fetchWikipediaSummary(subject: string, lang = "fr"): Promise<string | null> {
  // 1. DB locale SQLite (offline, instantané) — seulement pour le français
  if (lang === "fr" && isWikiDbAvailable()) {
    const extract = queryWikiDb(subject);
    if (extract && extract.length > 20) {
      return `**${subject}**\n\n${extract}\n\nSource: https://fr.wikipedia.org/wiki/${encodeURIComponent(subject)}`;
    }
  }

  // 2. Fallback: API Wikipedia en ligne
  try {
    // Search
    const searchUrl = `https://${lang}.wikipedia.org/w/api.php?action=query&list=search&srsearch=${encodeURIComponent(subject)}&format=json&srlimit=1`;
    const searchRes = await fetch(searchUrl, { signal: AbortSignal.timeout(8000) });
    if (!searchRes.ok) return null;
    const searchData = (await searchRes.json()) as {
      query?: { search?: Array<{ title: string }> };
    };
    const title = searchData.query?.search?.[0]?.title;
    if (!title) return null;

    // Summary
    const summaryUrl = `https://${lang}.wikipedia.org/api/rest_v1/page/summary/${encodeURIComponent(title)}`;
    const summaryRes = await fetch(summaryUrl, { signal: AbortSignal.timeout(8000) });
    if (!summaryRes.ok) return null;
    const summary = (await summaryRes.json()) as {
      title: string;
      extract: string;
      content_urls?: { desktop?: { page: string } };
    };

    if (!summary.extract || summary.extract.length < 20) return null;

    return `**${summary.title}**\n\n${summary.extract}\n\nSource: ${summary.content_urls?.desktop?.page || `https://${lang}.wikipedia.org/wiki/${encodeURIComponent(title)}`}`;
  } catch {
    return null;
  }
}

// ─── Récupérer une définition Wiktionnaire (gratuit) ─────────────────────────
async function fetchWiktionaryDefinition(word: string, lang = "fr"): Promise<string | null> {
  try {
    const restUrl = `https://${lang}.wiktionary.org/api/rest_v1/page/definition/${encodeURIComponent(word)}`;
    const res = await fetch(restUrl, { signal: AbortSignal.timeout(8000) });
    if (!res.ok) return null;
    const data = (await res.json()) as {
      definitions?: Array<{ partOfSpeech?: string; definition: string }>;
    };
    if (!data.definitions || data.definitions.length === 0) return null;

    const defs = data.definitions
      .slice(0, 3)
      .map((d) => `(${d.partOfSpeech || ""}) ${d.definition.replace(/<[^>]+>/g, "").trim()}`)
      .join("\n");

    return `**${word}**\n\n${defs}\n\nSource: https://${lang}.wiktionary.org/wiki/${encodeURIComponent(word)}`;
  } catch {
    return null;
  }
}

// ─── Générer une Q&A et la sauvegarder dans Obsidian ──────────────────────────
async function learnSubject(category: string, subject: string): Promise<boolean> {
  // Vérifier si on a déjà une Q&A pour ce sujet
  const existing = await searchQA(subject);
  if (existing) {
    logger.debug(`[SelfLearner] ⏭️ Déjà appris: ${subject} (catégorie: ${existing.category})`);
    return false;
  }

  // Construire la question — varier les formulations
  const questionTemplates = [
    `Qu'est-ce que ${subject} ?`,
    `Comment fonctionne ${subject} ?`,
    `Peux-tu m'expliquer ${subject} ?`,
    `Parle-moi de ${subject}.`,
    `Donne-moi un résumé de ${subject}.`,
  ];
  const question = questionTemplates[Math.floor(Math.random() * questionTemplates.length)];

  // Essayer Wikipédia d'abord
  let answer = await fetchWikipediaSummary(subject);

  // Si pas de résultat Wikipédia, essayer le Wiktionnaire
  if (!answer) {
    answer = await fetchWiktionaryDefinition(subject);
  }

  // Si toujours rien, essayer en anglais
  if (!answer) {
    answer = await fetchWikipediaSummary(subject, "en");
  }

  if (!answer) {
    logger.debug(`[SelfLearner] ❌ Pas de source trouvée pour: ${subject}`);
    return false;
  }

  // Sauvegarder dans Obsidian
  await saveQA(question, answer, category);
  logger.info(`[SelfLearner] 📚 Appris: ${subject} (catégorie: ${category}) → Obsidian`);
  return true;
}

// ─── Cycle d'apprentissage ────────────────────────────────────────────────────
let allExhaustedNotified = false;

async function notifyLearningComplete(): Promise<void> {
  const totalQA = countTotalQA();
  const dedupCount = learnedSubjects.size;
  logger.info(
    `[SelfLearner] 🎉 Tous les sujets sont épuisés! ${totalQA} Q&A apprises, ${dedupCount} sujets uniques.`,
  );

  await sendProactiveAlert(
    "learning_complete",
    "🎉 Auto-apprentissage terminé!",
    `Tous les sujets prédéfinis ont été appris!\n\n` +
      `📊 **Total Q&A**: ${totalQA}\n` +
      `🔒 **Sujets uniques**: ${dedupCount}\n` +
      `⏱️ **Cadence**: ${BATCH_SIZE} Q&A / ${LEARN_INTERVAL_MS / 1000}s\n\n` +
      `Le bot continue le scan web d'actualité toutes les minutes.`,
    0x00d4aa,
    60 * 60 * 1000, // 1h cooldown
  );
}

function countTotalQA(): number {
  try {
    const qaDir = process.env.OBSIDIAN_VAULT_PATH
      ? path.join(process.env.OBSIDIAN_VAULT_PATH, "qa")
      : null;
    if (!qaDir || !fs.existsSync(qaDir)) return 0;
    let count = 0;
    for (const dir of fs.readdirSync(qaDir, { withFileTypes: true })) {
      if (dir.isDirectory()) {
        count += fs.readdirSync(path.join(qaDir, dir.name)).filter((f) => f.endsWith(".md")).length;
      }
    }
    return count;
  } catch {
    return 0;
  }
}

async function learnBatch(): Promise<void> {
  if (isLearning) return;
  isLearning = true;

  try {
    let learned = 0;
    let noNewSubjects = true;

    for (let i = 0; i < BATCH_SIZE; i++) {
      const next = getNextSubject();
      if (!next) {
        if (!allExhaustedNotified && learned === 0 && i === 0) {
          allExhaustedNotified = true;
          await notifyLearningComplete();
        }
        break;
      }
      noNewSubjects = false;

      const success = await learnSubject(next.category, next.subject);
      if (success) learned++;

      await new Promise((resolve) => setTimeout(resolve, 2000));
    }

    // Reset notification flag si de nouveaux sujets ont été trouvés
    if (!noNewSubjects) {
      allExhaustedNotified = false;
    }

    if (learned > 0) {
      logger.info(`[SelfLearner] ✅ Batch terminé: ${learned} Q&A apprises`);
    }
  } catch (error) {
    logger.warn(
      `[SelfLearner] ⚠️ Erreur apprentissage: ${error instanceof Error ? error.message : String(error)}`,
    );
  } finally {
    isLearning = false;
  }
}

// ─── Scan Web en continu: actualités et sujets tendance ──────────────────────
const WEB_SCAN_INTERVAL_MS = 1 * 60 * 1000; // 1 min — scan web en continu
const WEB_SCAN_BATCH = 3; // 3 sujets d'actualité par scan
let webScanTimer: ReturnType<typeof setInterval> | null = null;
let isWebScanning = false;

// Requêtes rotatives pour découvrir des sujets d'actualité frais
const WEB_SCAN_QUERIES = [
  "actualités technologie 2026",
  "nouveautés hardware 2026",
  "sorties jeux vidéo 2026",
  "actualités science 2026",
  "découvertes scientifiques récentes",
  "actualités intelligence artificielle 2026",
  "nouveaux processeurs 2026",
  "actualités space exploration 2026",
  "nouveautés smartphone 2026",
  "actualités cryptomonnaie 2026",
  "découvertes archéologie 2026",
  "actualités médecine 2026",
  "nouveautés logiciel libre 2026",
  "actualités environnement 2026",
  "nouveautés robotique 2026",
  "actualités quantique 2026",
  "sorties films 2026",
  "actualités sport 2026",
  "nouveautés electric vehicles 2026",
  "actualités cybersécurité 2026",
];
let webQueryIndex = 0;
const queryLastRun = new Map<string, number>();
const QUERY_COOLDOWN_MS = 30 * 60 * 1000; // 30min entre 2 requêtes identiques

async function duckDuckGoSearch(
  query: string,
  count = 5,
): Promise<{ title: string; url: string; description: string; snippet?: string }[]> {
  try {
    const htmlUrl = `https://html.duckduckgo.com/html/?q=${encodeURIComponent(query)}&kl=fr-fr`;
    const res = await fetch(htmlUrl, {
      headers: {
        "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36",
        Accept: "text/html",
        "Accept-Language": "fr",
      },
      signal: AbortSignal.timeout(10_000),
    });
    if (!res.ok) return [];
    const html = await res.text();
    const results: { title: string; url: string; description: string; snippet?: string }[] = [];
    // Parse DuckDuckGo HTML results
    const matches = html.matchAll(
      /<a[^>]+class="result__a"[^>]*href="([^"]+)"[^>]*>(.*?)<\/a>[\s\S]*?<a[^>]+class="result__snippet"[^>]*>(.*?)<\/a>/g,
    );
    for (const m of matches) {
      if (results.length >= count) break;
      const url = m[1]
        .replace(/\/\/duckduckgo\.com\/l\/\?uddg=/, "")
        .replace(/&rut=.*/, decodeURIComponent);
      const title = m[2].replace(/<[^>]+>/g, "").trim();
      const desc = m[3].replace(/<[^>]+>/g, "").trim();
      if (title && url && desc) results.push({ title, url, description: desc, snippet: desc });
    }
    return results;
  } catch {
    return [];
  }
}

async function learnFromWeb(): Promise<void> {
  if (isWebScanning) return;
  isWebScanning = true;

  try {
    // Trouver une requête qui n'a pas été lancée récemment (cooldown 30min)
    let query: string | null = null;
    const now = Date.now();
    for (let i = 0; i < WEB_SCAN_QUERIES.length; i++) {
      const candidate = WEB_SCAN_QUERIES[webQueryIndex % WEB_SCAN_QUERIES.length];
      webQueryIndex++;
      const lastRun = queryLastRun.get(candidate) || 0;
      if (now - lastRun > QUERY_COOLDOWN_MS) {
        query = candidate;
        queryLastRun.set(candidate, now);
        break;
      }
    }

    if (!query) {
      return;
    }

    let learned = 0;
    // Utiliser Brave en priorité, DuckDuckGo en fallback
    let results: { title: string; url: string; description: string; snippet?: string }[] = [];
    if (isBraveSearchAvailable()) {
      results = await braveWebSearch(query, 5);
    }
    if (results.length === 0) {
      results = await duckDuckGoSearch(query, 5);
    }
    if (results.length === 0) {
      isWebScanning = false;
      return;
    }

    for (const result of results.slice(0, WEB_SCAN_BATCH)) {
      const subject = result.title
        .replace(/\s*[-|]\s*.*/, "")
        .trim()
        .slice(0, 80);
      if (subject.length < 10) continue;

      const hash = subjectHash(subject);
      if (learnedSubjects.has(hash)) continue;

      // Vérifier si déjà appris via Obsidian
      const existing = await searchQA(subject);
      if (existing) {
        learnedSubjects.add(hash);
        saveLearnedSet(learnedSubjects);
        continue;
      }

      // Construire la Q&A depuis le résultat web (nettoyé et tronqué)
      const cleanDesc = (result.description || result.snippet || "")
        .replace(/<[^>]+>/g, "")
        .replace(/&amp;/g, "&")
        .replace(/&lt;/g, "<")
        .replace(/&gt;/g, ">")
        .replace(/&quot;/g, '"')
        .replace(/&#39;/g, "'")
        .replace(/\s+/g, " ")
        .trim()
        .slice(0, 500);

      const question = `Quelles sont les dernières nouvelles sur "${subject}" ?`;
      const answer = `**${subject}**\n\n${cleanDesc}\n\nSource: ${result.url}`;

      if (answer.length > 50 && cleanDesc.length > 20) {
        await saveQA(question, answer, "actualite");
        learnedSubjects.add(hash);
        saveLearnedSet(learnedSubjects);
        learned++;
        logger.info(`[SelfLearner] 🌐 Appris (web): ${subject} → Obsidian (actualite)`);
      }

      await new Promise((resolve) => setTimeout(resolve, 1500));
    }

    if (learned > 0) {
      logger.info(`[SelfLearner] 🌐 Scan web terminé: ${learned} Q&A d'actualité apprises`);
    }
  } catch (error) {
    logger.warn(
      `[SelfLearner] 🌐 Erreur scan web: ${error instanceof Error ? error.message : String(error)}`,
    );
  } finally {
    isWebScanning = false;
  }
}

// ─── Démarrage / arrêt ────────────────────────────────────────────────────────
export function startSelfLearner(): void {
  if (learnTimer) return;

  // Premier batch après 30s (laisser le bot démarrer)
  setTimeout(() => {
    void learnBatch();
  }, 30_000);

  // Puis toutes les 1 minute
  learnTimer = setInterval(() => {
    void learnBatch();
  }, LEARN_INTERVAL_MS);

  // ─── Scan web d'actualité: premier scan après 60s, puis toutes les 1min ───
  setTimeout(() => {
    void learnFromWeb();
  }, 60_000);

  webScanTimer = setInterval(() => {
    void learnFromWeb();
  }, WEB_SCAN_INTERVAL_MS);

  if (learnTimer.unref) learnTimer.unref();
  if (webScanTimer?.unref) webScanTimer.unref();
  logger.info(
    `[SelfLearner] 🧠 Auto-apprentissage démarré (${BATCH_SIZE} Q&A toutes les ${LEARN_INTERVAL_MS / 1000}s + scan web toutes les ${WEB_SCAN_INTERVAL_MS / 60000}min)`,
  );
}

export function stopSelfLearner(): void {
  if (learnTimer) {
    clearInterval(learnTimer);
    learnTimer = null;
  }
  if (webScanTimer) {
    clearInterval(webScanTimer);
    webScanTimer = null;
  }
  logger.info("[SelfLearner] 🛑 Auto-apprentissage arrêté");
}

export function getSelfLearnerStatus(): {
  active: boolean;
  subjectsLearned: number;
  nextBatchInMs: number | null;
  batchSize: number;
  intervalMs: number;
  webScanActive: boolean;
  webScanIntervalMs: number;
  isLearning: boolean;
  isWebScanning: boolean;
} {
  return {
    active: learnTimer !== null,
    subjectsLearned: learnedSubjects.size,
    nextBatchInMs: learnTimer ? LEARN_INTERVAL_MS : null,
    batchSize: BATCH_SIZE,
    intervalMs: LEARN_INTERVAL_MS,
    webScanActive: webScanTimer !== null,
    webScanIntervalMs: WEB_SCAN_INTERVAL_MS,
    isLearning,
    isWebScanning,
  };
}
