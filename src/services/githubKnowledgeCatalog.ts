/**
 * Catalogue unique des dépôts GitHub : ingestion, releases, et matching agent.
 */
export type GithubDomain =
  | "osint"
  | "security"
  | "discord"
  | "node"
  | "ai"
  | "devops"
  | "network"
  | "fortnite"
  | "helldivers"
  | "minecraft"
  | "emu"
  | "game-engine"
  | "steam"
  | "web"
  | "data"
  | "science"
  | "algo"
  | "media"
  | "hardware"
  | "privacy"
  | "learning";

export interface GithubCatalogEntry {
  owner: string;
  repo: string;
  description: string;
  domain: GithubDomain;
  keywords: string[];
  /** Index README dans agentKnowledge (défaut true). */
  ingest?: boolean;
  trackReleases?: boolean;
  files?: string[];
  label?: string;
  platform?: string;
  color?: number;
  emoji?: string;
}

const PS = 0x003791;
const NIN = 0xe60012;
const XB = 0x107c10;
const ST = 0x1b2838;
const GEN = 0x5865f2;

export const GITHUB_CATALOG: GithubCatalogEntry[] = [
  // ── Déjà indexés (connaissance) ──
  {
    owner: "awesome-selfhosted",
    repo: "awesome-selfhosted",
    description: "Logiciels self-hosted open source.",
    domain: "devops",
    keywords: ["self-hosted", "selfhosted", "homelab", "auto-hébergé"],
  },
  {
    owner: "vinta",
    repo: "awesome-python",
    description: "Liste Python (libs, frameworks).",
    domain: "learning",
    keywords: ["python", "django", "flask"],
  },
  {
    owner: "avelino",
    repo: "awesome-go",
    description: "Liste Go.",
    domain: "learning",
    keywords: ["golang", "go lang"],
  },
  {
    owner: "rust-unofficial",
    repo: "awesome-rust",
    description: "Liste Rust.",
    domain: "learning",
    keywords: ["rust", "cargo"],
  },
  {
    owner: "trimstray",
    repo: "the-book-of-secret-knowledge",
    description: "Cheatsheets sysadmin / sécu.",
    domain: "security",
    keywords: ["cheatsheet", "sysadmin", "secret knowledge"],
  },
  {
    owner: "ripienaar",
    repo: "free-for-dev",
    description: "Offres cloud / SaaS avec palier gratuit.",
    domain: "devops",
    keywords: ["free tier", "gratuit", "saas", "paas", "hébergeur"],
  },
  {
    owner: "kamranahmedse",
    repo: "developer-roadmap",
    description: "Roadmaps pour apprendre le dev.",
    domain: "learning",
    keywords: ["roadmap", "apprendre", "cursus"],
  },
  {
    owner: "jwasham",
    repo: "coding-interview-university",
    description: "Préparation entretiens ingénieur.",
    domain: "algo",
    keywords: ["entretien", "interview", "leetcode"],
  },
  {
    owner: "practical-tutorials",
    repo: "project-based-learning",
    description: "Tutoriels par projets.",
    domain: "learning",
    keywords: ["projet", "tutoriel", "apprendre en faisant"],
  },
  {
    owner: "ossu",
    repo: "computer-science",
    description: "Cursus CS gratuit niveau licence.",
    domain: "learning",
    keywords: ["computer science", "licence", "ossu"],
  },
  {
    owner: "papers-we-love",
    repo: "papers-we-love",
    description: "Papers informatiques.",
    domain: "science",
    keywords: ["paper", "publication", "recherche"],
  },
  {
    owner: "microsoft",
    repo: "generative-ai-for-beginners",
    description: "Cours IA générative débutants.",
    domain: "ai",
    keywords: ["ia générative", "prompt", "débutant ia"],
  },
  {
    owner: "TheAlgorithms",
    repo: "Python",
    description: "Algorithmes en Python.",
    domain: "algo",
    keywords: ["algorithme", "tri", "python algo"],
  },
  {
    owner: "TheAlgorithms",
    repo: "JavaScript",
    description: "Algorithmes en JavaScript.",
    domain: "algo",
    keywords: ["algorithme js", "javascript algo"],
  },
  {
    owner: "tldr-pages",
    repo: "tldr",
    description: "Pages man simplifiées.",
    domain: "learning",
    keywords: ["tldr", "man", "commande linux"],
  },
  {
    owner: "public-apis",
    repo: "public-apis",
    description: "APIs publiques gratuites.",
    domain: "learning",
    keywords: ["api publique", "public api", "endpoint gratuit"],
  },
  {
    owner: "30-seconds",
    repo: "30-seconds-of-code",
    description: "Snippets JS/TS courts.",
    domain: "node",
    keywords: ["snippet", "one liner", "30 seconds"],
  },
  {
    owner: "EbookFoundation",
    repo: "free-programming-books",
    description: "Livres de programmation gratuits (dont FR).",
    domain: "learning",
    keywords: ["livre", "ebook", "livre gratuit"],
  },
  {
    owner: "donnemartin",
    repo: "system-design-primer",
    description: "Primer architecture / scalabilité.",
    domain: "algo",
    keywords: ["system design", "scalabilité", "architecture"],
    files: ["README.md"],
  },

  // ── OSINT ──
  {
    owner: "jivoi",
    repo: "awesome-osint",
    description: "Liste d'outils OSINT.",
    domain: "osint",
    keywords: ["osint", "investigation", "renseignement", "username", "trace"],
  },
  {
    owner: "laramies",
    repo: "theHarvester",
    description: "Collecte d'emails / hosts / sous-domaines.",
    domain: "osint",
    keywords: ["harvester", "email osint", "sous-domaine"],
  },
  {
    owner: "sherlock-project",
    repo: "sherlock",
    description: "Recherche d'un pseudo sur des centaines de sites.",
    domain: "osint",
    keywords: ["sherlock", "pseudo", "username", "compte"],
  },
  {
    owner: "lanmaster53",
    repo: "recon-ng",
    description: "Framework de recon web.",
    domain: "osint",
    keywords: ["recon-ng", "recon", "osint framework"],
  },
  {
    owner: "smicallef",
    repo: "spiderfoot",
    description: "OSINT automatisé (IP, domaine, nom).",
    domain: "osint",
    keywords: ["spiderfoot", "automatiser osint"],
  },
  {
    owner: "mxrch",
    repo: "GHunt",
    description: "OSINT sur comptes Google.",
    domain: "osint",
    keywords: ["ghunt", "gmail", "google osint"],
  },
  {
    owner: "qeeqbox",
    repo: "social-analyzer",
    description: "Profils réseaux sociaux à partir d'un identifiant.",
    domain: "osint",
    keywords: ["social analyzer", "réseaux sociaux", "profil"],
  },
  {
    owner: "sundowndev",
    repo: "phoneinfoga",
    description: "OSINT sur numéros de téléphone.",
    domain: "osint",
    keywords: ["phoneinfoga", "téléphone", "numéro"],
  },

  // ── Sécu ──
  {
    owner: "OWASP",
    repo: "CheatSheetSeries",
    description: "Cheatsheets OWASP (XSS, auth, CSRF…).",
    domain: "security",
    keywords: ["owasp", "cheatsheet", "xss", "csrf", "injection"],
  },
  {
    owner: "swisskyrepo",
    repo: "PayloadsAllTheThings",
    description: "Payloads et méthodologie pentest.",
    domain: "security",
    keywords: ["payload", "pentest", "exploit", "injection"],
  },
  {
    owner: "Hack-with-Github",
    repo: "Awesome-Hacking",
    description: "Liste d'outils hacking / sécu.",
    domain: "security",
    keywords: ["hacking", "awesome hacking"],
  },
  {
    owner: "enaqx",
    repo: "awesome-pentest",
    description: "Ressources pentest.",
    domain: "security",
    keywords: ["pentest", "penetration", "red team"],
  },
  {
    owner: "Tib3rius",
    repo: "AutoRecon",
    description: "Recon réseau automatisé.",
    domain: "security",
    keywords: ["autorecon", "enum", "nmap auto"],
  },
  {
    owner: "projectdiscovery",
    repo: "nuclei-templates",
    description: "Templates Nuclei (vulns web).",
    domain: "security",
    keywords: ["nuclei", "cve", "scan web", "template"],
  },
  {
    owner: "SigmaHQ",
    repo: "sigma",
    description: "Règles de détection SIEM.",
    domain: "security",
    keywords: ["sigma", "siem", "détection", "blue team"],
  },
  {
    owner: "danielmiessler",
    repo: "SecLists",
    description: "Wordlists sécu (dirs, passwords, fuzz).",
    domain: "security",
    keywords: ["seclists", "wordlist", "fuzz", "directory"],
  },
  {
    owner: "owasp-amass",
    repo: "amass",
    description: "Cartographie de surface d'attaque / DNS.",
    domain: "security",
    keywords: ["amass", "enum dns", "attack surface"],
  },

  // ── Discord / bot ──
  {
    owner: "discordjs",
    repo: "discord.js",
    description: "Lib Discord officielle JS.",
    domain: "discord",
    keywords: ["discord.js", "discordjs", "bot discord"],
    trackReleases: true,
    platform: "general",
    color: GEN,
    emoji: "🤖",
    label: "discord.js",
  },
  {
    owner: "discordjs",
    repo: "guide",
    description: "Guide discord.js.",
    domain: "discord",
    keywords: ["guide discord", "tutoriel bot", "slash command"],
  },
  {
    owner: "discord",
    repo: "discord-api-docs",
    description: "Docs API Discord.",
    domain: "discord",
    keywords: ["api discord", "gateway", "intent"],
    ingest: false,
  },
  {
    owner: "sapphiredev",
    repo: "framework",
    description: "Framework bots Discord (Sapphire).",
    domain: "discord",
    keywords: ["sapphire", "framework bot"],
  },
  {
    owner: "AnIdiotsGuide",
    repo: "discordjs-bot-guide",
    description: "Guide communautaire discord.js.",
    domain: "discord",
    keywords: ["idiot guide", "bot guide"],
  },

  // ── Stack John ──
  {
    owner: "sindresorhus",
    repo: "awesome-nodejs",
    description: "Liste Node.js.",
    domain: "node",
    keywords: ["nodejs", "node.js", "npm"],
  },
  {
    owner: "microsoft",
    repo: "TypeScript",
    description: "Langage TypeScript.",
    domain: "node",
    keywords: ["typescript", "ts", "generics"],
    ingest: false,
    trackReleases: true,
    platform: "general",
    color: GEN,
    emoji: "🔧",
    label: "TypeScript",
  },
  {
    owner: "nodejs",
    repo: "node",
    description: "Runtime Node.js.",
    domain: "node",
    keywords: ["node", "nodejs runtime"],
    ingest: false,
    trackReleases: true,
    platform: "general",
    color: GEN,
    emoji: "🔧",
    label: "Node.js",
  },
  {
    owner: "prisma",
    repo: "prisma",
    description: "ORM Prisma.",
    domain: "data",
    keywords: ["prisma", "orm", "schema prisma"],
    trackReleases: true,
    platform: "general",
    color: GEN,
    emoji: "🤖",
    label: "Prisma ORM",
  },
  {
    owner: "Unitech",
    repo: "pm2",
    description: "Process manager Node (PM2).",
    domain: "node",
    keywords: ["pm2", "process manager", "restart bot"],
    trackReleases: true,
    platform: "general",
    color: GEN,
    emoji: "🔧",
    label: "PM2",
  },
  {
    owner: "vitest-dev",
    repo: "vitest",
    description: "Runner de tests Vitest.",
    domain: "node",
    keywords: ["vitest", "test unitaire", "vite test"],
    trackReleases: true,
    platform: "general",
    color: GEN,
    emoji: "🔧",
    label: "Vitest",
  },
  {
    owner: "expressjs",
    repo: "express",
    description: "Framework HTTP Express.",
    domain: "node",
    keywords: ["express", "middleware"],
  },
  {
    owner: "redis",
    repo: "node-redis",
    description: "Client Redis officiel Node.",
    domain: "data",
    keywords: ["redis", "cache", "ioredis"],
  },
  {
    owner: "axios",
    repo: "axios",
    description: "Client HTTP Axios.",
    domain: "node",
    keywords: ["axios", "http client"],
    trackReleases: true,
    platform: "general",
    color: GEN,
    emoji: "🔧",
    label: "Axios (HTTP Client)",
  },
  {
    owner: "LeCoupa",
    repo: "awesome-cheatsheets",
    description: "Cheatsheets dev (git, bash, js…).",
    domain: "learning",
    keywords: ["cheatsheet", "pense-bête"],
  },

  // ── IA / LLM ──
  {
    owner: "ollama",
    repo: "ollama",
    description: "LLM local (Ollama).",
    domain: "ai",
    keywords: ["ollama", "llm local", "modèle local", "llama"],
    trackReleases: true,
    platform: "general",
    color: GEN,
    emoji: "🤖",
    label: "Ollama",
  },
  {
    owner: "ggerganov",
    repo: "llama.cpp",
    description: "Inférence LLM CPU/GPU (llama.cpp).",
    domain: "ai",
    keywords: ["llama.cpp", "gguf", "quantization"],
    ingest: false,
  },
  {
    owner: "microsoft",
    repo: "ai-agents-for-beginners",
    description: "Cours agents IA.",
    domain: "ai",
    keywords: ["agent ia", "tool calling", "orchestrateur"],
  },
  {
    owner: "langchain-ai",
    repo: "langchainjs",
    description: "LangChain JavaScript.",
    domain: "ai",
    keywords: ["langchain", "rag", "chain"],
  },
  {
    owner: "vercel",
    repo: "ai",
    description: "Vercel AI SDK.",
    domain: "ai",
    keywords: ["ai sdk", "vercel ai", "streaming llm"],
  },
  {
    owner: "openai",
    repo: "openai-cookbook",
    description: "Cookbook OpenAI.",
    domain: "ai",
    keywords: ["openai", "cookbook", "embeddings"],
  },
  {
    owner: "huggingface",
    repo: "transformers",
    description: "Transformers Hugging Face.",
    domain: "ai",
    keywords: ["huggingface", "transformers", "bert"],
    ingest: false,
  },
  {
    owner: "run-llama",
    repo: "llama_index",
    description: "LlamaIndex (RAG).",
    domain: "ai",
    keywords: ["llamaindex", "rag", "index docs"],
    ingest: false,
  },

  // ── DevOps ──
  {
    owner: "bregman-arie",
    repo: "devops-exercises",
    description: "Exercices DevOps / interview.",
    domain: "devops",
    keywords: ["devops", "sre", "ci/cd"],
  },
  {
    owner: "binhnguyennus",
    repo: "awesome-scalability",
    description: "Patterns de scalabilité.",
    domain: "devops",
    keywords: ["scalability", "haute dispo"],
  },
  {
    owner: "docker",
    repo: "awesome-compose",
    description: "Exemples docker compose.",
    domain: "devops",
    keywords: ["docker", "compose", "conteneur"],
  },
  {
    owner: "kubernetes",
    repo: "kubernetes",
    description: "Kubernetes.",
    domain: "devops",
    keywords: ["kubernetes", "k8s", "pod"],
    ingest: false,
  },
  {
    owner: "prometheus",
    repo: "prometheus",
    description: "Métriques Prometheus.",
    domain: "devops",
    keywords: ["prometheus", "métriques", "alerting"],
    ingest: false,
  },
  {
    owner: "grafana",
    repo: "grafana",
    description: "Dashboards Grafana.",
    domain: "devops",
    keywords: ["grafana", "dashboard"],
    ingest: false,
  },
  {
    owner: "authelia",
    repo: "authelia",
    description: "SSO / 2FA self-hosted.",
    domain: "devops",
    keywords: ["authelia", "sso", "2fa"],
  },
  {
    owner: "immich-app",
    repo: "immich",
    description: "Photos self-hosted (Immich).",
    domain: "devops",
    keywords: ["immich", "photos", "google photos"],
  },

  // ── Réseau ──
  {
    owner: "wireshark",
    repo: "wireshark",
    description: "Analyseur de paquets.",
    domain: "network",
    keywords: ["wireshark", "pcap", "paquet"],
    ingest: false,
  },
  {
    owner: "nmap",
    repo: "nmap",
    description: "Scanner de ports Nmap.",
    domain: "network",
    keywords: ["nmap", "port scan", "scan réseau"],
    ingest: false,
  },
  {
    owner: "trailofbits",
    repo: "algo",
    description: "VPN IPSEC simple (Algo).",
    domain: "network",
    keywords: ["algo vpn", "ipsec", "vpn"],
  },
  {
    owner: "AdguardTeam",
    repo: "AdGuardHome",
    description: "DNS adblocking AdGuard Home.",
    domain: "network",
    keywords: ["adguard", "dns", "bloqueur"],
  },
  {
    owner: "pi-hole",
    repo: "pi-hole",
    description: "Pi-hole (DNS sinkhole).",
    domain: "network",
    keywords: ["pihole", "pi-hole", "dns sinkhole"],
  },

  // ── Fortnite / Steam / Helldivers ──
  {
    owner: "Fortnite-API",
    repo: "FortniteAPI",
    description: "API boutique / cosmétiques Fortnite.",
    domain: "fortnite",
    keywords: ["fortnite", "boutique", "shop fortnite", "wishlist fortnite"],
    trackReleases: true,
    platform: "steam",
    color: ST,
    emoji: "🛒",
    label: "Fortnite API",
  },
  {
    owner: "SteamDatabase",
    repo: "SteamTracking",
    description: "Tracking dépôts Steam.",
    domain: "steam",
    keywords: ["steam tracking", "manifest steam"],
    ingest: false,
  },
  {
    owner: "Revadike",
    repo: "InternalSteamWebAPI",
    description: "Steam Web API interne documentée.",
    domain: "steam",
    keywords: ["steam api", "web api steam"],
  },
  {
    owner: "JustArchiNET",
    repo: "ArchiSteamFarm",
    description: "Farm Steam cartes / badges.",
    domain: "steam",
    keywords: ["asf", "archisteamfarm", "cartes steam"],
    trackReleases: true,
    platform: "steam",
    color: ST,
    emoji: "🎮",
    label: "ArchiSteamFarm",
  },
  {
    owner: "helldivers-2",
    repo: "api",
    description: "API communautaire Helldivers 2.",
    domain: "helldivers",
    keywords: ["helldivers", "helldivers 2", "super terre", "automatons", "terminids"],
  },
  {
    owner: "SteamDatabase",
    repo: "GameTracking-Helldivers2",
    description: "Tracking fichiers Helldivers 2.",
    domain: "helldivers",
    keywords: ["helldivers tracking", "patch helldivers"],
    ingest: false,
  },

  // ── Minecraft ──
  {
    owner: "PrismLauncher",
    repo: "PrismLauncher",
    description: "Launcher Minecraft Prism.",
    domain: "minecraft",
    keywords: ["prism", "launcher minecraft"],
    trackReleases: true,
    platform: "steam",
    color: ST,
    emoji: "🎮",
    label: "Prism Launcher",
  },
  {
    owner: "FabricMC",
    repo: "fabric",
    description: "Loader mods Fabric.",
    domain: "minecraft",
    keywords: ["fabric", "mod minecraft"],
  },
  {
    owner: "MinecraftForge",
    repo: "MinecraftForge",
    description: "Minecraft Forge.",
    domain: "minecraft",
    keywords: ["forge", "mods forge"],
    ingest: false,
  },
  {
    owner: "PaperMC",
    repo: "Paper",
    description: "Serveur Minecraft Paper.",
    domain: "minecraft",
    keywords: ["paper", "serveur minecraft", "bukkit", "spigot"],
    trackReleases: true,
    platform: "steam",
    color: ST,
    emoji: "🎮",
    label: "PaperMC",
  },
  {
    owner: "itzg",
    repo: "docker-minecraft-server",
    description: "Image Docker serveur Minecraft.",
    domain: "minecraft",
    keywords: ["docker minecraft", "serveur mc docker"],
  },

  // ── Émulation (yuzu / Ryujinx officiels exclus : DMCA) ──
  {
    owner: "PCSX2",
    repo: "pcsx2",
    description: "Émulateur PS2.",
    domain: "emu",
    keywords: ["pcsx2", "ps2", "playstation 2"],
    ingest: false,
    trackReleases: true,
    platform: "playstation",
    color: PS,
    emoji: "🕹️",
    label: "PCSX2 (PS2 Emulator)",
  },
  {
    owner: "RPCS3",
    repo: "rpcs3",
    description: "Émulateur PS3.",
    domain: "emu",
    keywords: ["rpcs3", "ps3"],
    ingest: false,
    trackReleases: true,
    platform: "playstation",
    color: PS,
    emoji: "🕹️",
    label: "RPCS3 (PS3 Emulator)",
  },
  {
    owner: "RetroArch",
    repo: "RetroArch",
    description: "Frontend libretro.",
    domain: "emu",
    keywords: ["retroarch", "libretro", "core"],
    ingest: false,
    trackReleases: true,
    platform: "nintendo",
    color: NIN,
    emoji: "🎲",
    label: "RetroArch",
  },
  {
    owner: "dolphin-emu",
    repo: "dolphin",
    description: "Émulateur GameCube / Wii.",
    domain: "emu",
    keywords: ["dolphin", "gamecube", "wii"],
    ingest: false,
    trackReleases: true,
    platform: "nintendo",
    color: NIN,
    emoji: "🎲",
    label: "Dolphin (Wii/GC Emulator)",
  },
  {
    owner: "cemu-project",
    repo: "Cemu",
    description: "Émulateur Wii U.",
    domain: "emu",
    keywords: ["cemu", "wii u"],
    ingest: false,
    trackReleases: true,
    platform: "nintendo",
    color: NIN,
    emoji: "🎲",
    label: "Cemu (Wii U Emulator)",
  },
  {
    owner: "xenia-project",
    repo: "xenia",
    description: "Émulateur Xbox 360.",
    domain: "emu",
    keywords: ["xenia", "xbox 360"],
    ingest: false,
    trackReleases: true,
    platform: "xbox",
    color: XB,
    emoji: "🎯",
    label: "Xenia (Xbox 360 Emulator)",
  },
  {
    owner: "melonDS-emu",
    repo: "melonDS",
    description: "Émulateur Nintendo DS.",
    domain: "emu",
    keywords: ["melonds", "nintendo ds", "nds"],
    ingest: false,
    trackReleases: true,
    platform: "nintendo",
    color: NIN,
    emoji: "🎲",
    label: "melonDS (DS Emulator)",
  },
  {
    owner: "mupen64plus",
    repo: "mupen64plus-core",
    description: "Émulateur N64.",
    domain: "emu",
    keywords: ["mupen", "n64", "nintendo 64"],
    ingest: false,
    trackReleases: true,
    platform: "nintendo",
    color: NIN,
    emoji: "🎲",
    label: "mupen64plus (N64)",
  },
  {
    owner: "Ryubing",
    repo: "Ryujinx",
    description: "Fork vivant de Ryujinx (Switch).",
    domain: "emu",
    keywords: ["ryujinx", "switch", "ryubing"],
    ingest: false,
    trackReleases: true,
    platform: "nintendo",
    color: NIN,
    emoji: "🎲",
    label: "Ryujinx (fork Ryubing)",
  },
  {
    owner: "eden-emulator",
    repo: "eden",
    description: "Émulateur Switch Eden.",
    domain: "emu",
    keywords: ["eden", "switch emulator"],
    ingest: false,
    trackReleases: true,
    platform: "nintendo",
    color: NIN,
    emoji: "🎲",
    label: "Eden (Switch)",
  },
  {
    owner: "hrydgard",
    repo: "ppsspp",
    description: "Émulateur PSP.",
    domain: "emu",
    keywords: ["ppsspp", "psp"],
    ingest: false,
    trackReleases: true,
    platform: "playstation",
    color: PS,
    emoji: "🕹️",
    label: "PPSSPP",
  },
  {
    owner: "stenzek",
    repo: "duckstation",
    description: "Émulateur PS1.",
    domain: "emu",
    keywords: ["duckstation", "ps1", "playstation 1"],
    ingest: false,
    trackReleases: true,
    platform: "playstation",
    color: PS,
    emoji: "🕹️",
    label: "DuckStation",
  },
  {
    owner: "shadps4-emu",
    repo: "shadPS4",
    description: "Émulateur PS4.",
    domain: "emu",
    keywords: ["shadps4", "ps4"],
    ingest: false,
    trackReleases: true,
    platform: "playstation",
    color: PS,
    emoji: "🕹️",
    label: "shadPS4",
  },
  {
    owner: "Vita3K",
    repo: "Vita3K",
    description: "Émulateur PS Vita.",
    domain: "emu",
    keywords: ["vita3k", "ps vita", "vita"],
    ingest: false,
    trackReleases: true,
    platform: "playstation",
    color: PS,
    emoji: "🕹️",
    label: "Vita3K",
  },
  {
    owner: "mgba-emu",
    repo: "mgba",
    description: "Émulateur GBA.",
    domain: "emu",
    keywords: ["mgba", "gba", "game boy"],
    ingest: false,
  },
  {
    owner: "snes9xgit",
    repo: "snes9x",
    description: "Émulateur SNES.",
    domain: "emu",
    keywords: ["snes9x", "snes", "super nintendo"],
    ingest: false,
  },
  {
    owner: "TASEmulators",
    repo: "BizHawk",
    description: "Multi-émulateur TAS.",
    domain: "emu",
    keywords: ["bizhawk", "tas"],
    ingest: false,
  },

  // ── Moteurs / jeux open source (releases existantes) ──
  {
    owner: "OpenRCT2",
    repo: "OpenRCT2",
    description: "OpenRCT2 (RollerCoaster Tycoon).",
    domain: "game-engine",
    keywords: ["openrct2", "rollercoaster"],
    ingest: false,
    trackReleases: true,
    platform: "steam",
    color: ST,
    emoji: "🎮",
    label: "OpenRCT2 (RollerCoaster Tycoon)",
  },
  {
    owner: "OpenMW",
    repo: "openmw",
    description: "Moteur libre Morrowind.",
    domain: "game-engine",
    keywords: ["openmw", "morrowind"],
    ingest: false,
    trackReleases: true,
    platform: "steam",
    color: ST,
    emoji: "🎮",
    label: "OpenMW (Morrowind)",
  },
  {
    owner: "0ad",
    repo: "0ad",
    description: "0 A.D. RTS.",
    domain: "game-engine",
    keywords: ["0 a.d", "0ad", "rts antique"],
    ingest: false,
    trackReleases: true,
    platform: "steam",
    color: ST,
    emoji: "🎮",
    label: "0 A.D. (RTS)",
  },
  {
    owner: "OpenRA",
    repo: "OpenRA",
    description: "OpenRA (C&C / Red Alert).",
    domain: "game-engine",
    keywords: ["openra", "red alert", "command and conquer"],
    ingest: false,
    trackReleases: true,
    platform: "steam",
    color: ST,
    emoji: "🎮",
    label: "OpenRA (C&C/Red Alert)",
  },
  {
    owner: "luanti-org",
    repo: "luanti",
    description: "Luanti (ex-Minetest).",
    domain: "game-engine",
    keywords: ["minetest", "luanti", "voxel"],
    ingest: false,
    trackReleases: true,
    platform: "steam",
    color: ST,
    emoji: "🎮",
    label: "Luanti (Minetest)",
  },
  {
    owner: "godotengine",
    repo: "godot",
    description: "Moteur Godot.",
    domain: "game-engine",
    keywords: ["godot", "moteur jeu", "gdscript"],
    ingest: false,
    trackReleases: true,
    platform: "steam",
    color: ST,
    emoji: "🎮",
    label: "Godot Engine",
  },
  {
    owner: "LavaGang",
    repo: "MelonLoader",
    description: "Mod loader Unity (MelonLoader).",
    domain: "game-engine",
    keywords: ["melonloader", "mod unity"],
    ingest: false,
    trackReleases: true,
    platform: "steam",
    color: ST,
    emoji: "🎮",
    label: "MelonLoader (Mod Loader)",
  },
  {
    owner: "BepInEx",
    repo: "BepInEx",
    description: "Framework mods Unity.",
    domain: "game-engine",
    keywords: ["bepinex", "mod unity"],
    ingest: false,
    trackReleases: true,
    platform: "steam",
    color: ST,
    emoji: "🎮",
    label: "BepInEx (Mod Framework)",
  },
  {
    owner: "ModOrganizer2",
    repo: "modorganizer",
    description: "Mod Organizer 2.",
    domain: "game-engine",
    keywords: ["mod organizer", "mo2", "mods skyrim"],
    ingest: false,
    trackReleases: true,
    platform: "steam",
    color: ST,
    emoji: "🎮",
    label: "Mod Organizer 2",
  },
  {
    owner: "ValveSoftware",
    repo: "source-sdk-2013",
    description: "Source SDK Valve.",
    domain: "steam",
    keywords: ["source sdk", "source engine"],
    ingest: false,
    trackReleases: true,
    platform: "steam",
    color: ST,
    emoji: "🎮",
    label: "Valve Source SDK",
  },
  {
    owner: "SteamRE",
    repo: "SteamKit",
    description: "SteamKit API.",
    domain: "steam",
    keywords: ["steamkit", "steam protocol"],
    ingest: false,
    trackReleases: true,
    platform: "steam",
    color: ST,
    emoji: "🎮",
    label: "SteamKit (Steam API)",
  },
  {
    owner: "libsdl-org",
    repo: "SDL",
    description: "SDL3 (multimédia / jeux).",
    domain: "game-engine",
    keywords: ["sdl", "sdl3"],
    ingest: false,
  },

  // ── Web ──
  {
    owner: "facebook",
    repo: "react",
    description: "React.",
    domain: "web",
    keywords: ["react", "jsx", "hooks"],
    ingest: false,
  },
  {
    owner: "vuejs",
    repo: "core",
    description: "Vue.js.",
    domain: "web",
    keywords: ["vue", "vuejs"],
    ingest: false,
  },
  {
    owner: "tailwindlabs",
    repo: "tailwindcss",
    description: "Tailwind CSS.",
    domain: "web",
    keywords: ["tailwind", "css utility"],
  },

  // ── Data ──
  {
    owner: "postgres",
    repo: "postgres",
    description: "PostgreSQL.",
    domain: "data",
    keywords: ["postgres", "postgresql", "sql"],
    ingest: false,
  },
  {
    owner: "redis",
    repo: "redis",
    description: "Redis serveur.",
    domain: "data",
    keywords: ["redis server", "redis"],
    ingest: false,
    trackReleases: true,
    platform: "general",
    color: GEN,
    emoji: "🔧",
    label: "Redis",
  },
  {
    owner: "duckdb",
    repo: "duckdb",
    description: "DuckDB (OLAP embarqué).",
    domain: "data",
    keywords: ["duckdb", "olap", "analytics sql"],
  },

  // ── Science / ML ──
  {
    owner: "karpathy",
    repo: "nn-zero-to-hero",
    description: "Cours neural nets Karpathy.",
    domain: "science",
    keywords: ["karpathy", "neural net", "zero to hero"],
  },
  {
    owner: "fastai",
    repo: "fastbook",
    description: "Livre fast.ai.",
    domain: "science",
    keywords: ["fastai", "fast.ai", "deep learning livre"],
  },
  {
    owner: "ageron",
    repo: "handson-ml3",
    description: "Hands-On ML (Géron).",
    domain: "science",
    keywords: ["hands-on ml", "scikit", "tensorflow"],
  },
  {
    owner: "jakevdp",
    repo: "PythonDataScienceHandbook",
    description: "Python Data Science Handbook.",
    domain: "science",
    keywords: ["pandas", "numpy", "data science"],
  },
  {
    owner: "ossu",
    repo: "data-science",
    description: "Cursus data science OSSU.",
    domain: "science",
    keywords: ["data science cursus"],
  },

  // ── Algo ──
  {
    owner: "yangshun",
    repo: "tech-interview-handbook",
    description: "Handbook entretiens tech.",
    domain: "algo",
    keywords: ["tech interview", "coding interview"],
  },
  {
    owner: "krahets",
    repo: "hello-algo",
    description: "Algo illustré (hello-algo).",
    domain: "algo",
    keywords: ["hello-algo", "structures de données"],
  },

  // ── Média ──
  {
    owner: "yt-dlp",
    repo: "yt-dlp",
    description: "Téléchargeur vidéo yt-dlp.",
    domain: "media",
    keywords: ["yt-dlp", "youtube-dl", "télécharger vidéo", "paroles"],
    trackReleases: true,
    platform: "general",
    color: GEN,
    emoji: "🎵",
    label: "yt-dlp",
  },
  {
    owner: "mpv-player",
    repo: "mpv",
    description: "Lecteur mpv.",
    domain: "media",
    keywords: ["mpv", "lecteur vidéo"],
    ingest: false,
  },
  {
    owner: "navidrome",
    repo: "navidrome",
    description: "Serveur musique Navidrome.",
    domain: "media",
    keywords: ["navidrome", "subsonic", "musique self-hosted"],
  },
  {
    owner: "Spotifyd",
    repo: "spotifyd",
    description: "Client Spotify daemon.",
    domain: "media",
    keywords: ["spotifyd", "spotify"],
  },

  // ── Hardware ──
  {
    owner: "raspberrypi",
    repo: "documentation",
    description: "Docs Raspberry Pi.",
    domain: "hardware",
    keywords: ["raspberry", "rpi", "gpio"],
  },
  {
    owner: "esphome",
    repo: "esphome",
    description: "ESPHome (IoT).",
    domain: "hardware",
    keywords: ["esphome", "esp32", "iot"],
  },
  {
    owner: "Koenkk",
    repo: "zigbee2mqtt",
    description: "Zigbee2MQTT.",
    domain: "hardware",
    keywords: ["zigbee", "zigbee2mqtt", "mqtt"],
  },
  {
    owner: "home-assistant",
    repo: "core",
    description: "Home Assistant.",
    domain: "hardware",
    keywords: ["home assistant", "domotique", "hass"],
    ingest: false,
  },

  // ── Vie privée ──
  {
    owner: "privacyguides",
    repo: "privacyguides.org",
    description: "Guides vie privée.",
    domain: "privacy",
    keywords: ["privacy", "vie privée", "tracking"],
  },
  {
    owner: "keepassxreboot",
    repo: "keepassxc",
    description: "Coffre-fort KeePassXC.",
    domain: "privacy",
    keywords: ["keepass", "mot de passe", "coffre"],
  },
  {
    owner: "bitwarden",
    repo: "clients",
    description: "Clients Bitwarden.",
    domain: "privacy",
    keywords: ["bitwarden", "password manager"],
    ingest: false,
  },
];

export function knowledgeRepos(): GithubCatalogEntry[] {
  return GITHUB_CATALOG.filter((e) => e.ingest !== false);
}

export function releaseRepos(): GithubCatalogEntry[] {
  return GITHUB_CATALOG.filter((e) => e.trackReleases);
}

function tokenize(q: string): string[] {
  return q
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .split(/[^a-z0-9+.#]+/i)
    .filter((w) => w.length > 1);
}

export function matchGithubCatalog(query: string, limit = 5): GithubCatalogEntry[] {
  const words = tokenize(query);
  if (words.length === 0) return [];
  const q = words.join(" ");
  const scored = GITHUB_CATALOG.map((e) => {
    let score = 0;
    const name = `${e.owner}/${e.repo}`.toLowerCase();
    if (q.includes(name) || q.includes(e.repo.toLowerCase())) score += 8;
    if (q.includes(e.domain.replace("-", " "))) score += 3;
    for (const kw of e.keywords) {
      const k = kw.toLowerCase();
      if (q.includes(k)) score += 5;
      else if (words.some((w) => k.includes(w) && w.length > 3)) score += 2;
    }
    const blob = `${e.description} ${e.label ?? ""}`.toLowerCase();
    for (const w of words) {
      if (w.length > 3 && blob.includes(w)) score += 1;
    }
    return { e, score };
  })
    .filter((x) => x.score > 0)
    .sort((a, b) => b.score - a.score);
  const out: GithubCatalogEntry[] = [];
  const seen = new Set<string>();
  for (const { e } of scored) {
    const k = `${e.owner}/${e.repo}`;
    if (seen.has(k)) continue;
    seen.add(k);
    out.push(e);
    if (out.length >= limit) break;
  }
  return out;
}

export function githubKnowledgePromptBlock(): string {
  return (
    "\n\n## DÉPÔTS GITHUB INDEXÉS\n" +
    "Tu as un catalogue (OSINT, sécu, Discord/bots, Node/TS, LLM/Ollama, Fortnite, Helldivers, " +
    "émulation, Minecraft, Steam, DevOps, réseau, data, science, média, hardware, vie privée).\n" +
    "- Question dans un de ces domaines → **lookupKnowledgeRepo** puis **searchKnowledge**.\n" +
    "- Stats / version d'un dépôt précis → **getGitHubRepo(owner, repo)**.\n" +
    "- Ne dis pas que tu n'as pas de sources GitHub. Yuzu et Ryujinx officiels sont morts (DMCA) : " +
    "oriente vers Ryubing/Ryujinx ou Eden.\n"
  );
}
