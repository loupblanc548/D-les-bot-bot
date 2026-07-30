/**
 * capabilitiesGenerator.ts — Génère un embed propre listant toutes les capacités du bot.
 *
 * Déclenché quand un utilisateur @mention le bot et demande "que peux-tu faire ?"
 * dans n'importe quelle langue. Détecte les variantes de la question.
 */

import { EmbedBuilder } from "discord.js";

// ── Détection multilingue de "que peux-tu faire ?" ──────────────────────────

const CAPABILITY_TRIGGERS = [
  // FR
  "que peux-tu faire",
  "que peux tu faire",
  "que peut tu faire",
  "que peut-tu faire",
  "qu'est-ce que tu sais faire",
  "qu est ce que tu sais faire",
  "qu'est ce que tu sais faire",
  "qu'est-ce que tu peux faire",
  "qu est ce que tu peux faire",
  "que sais-tu faire",
  "que sais tu faire",
  "que sais faire",
  "tes capacités",
  "tes capacites",
  "tes fonctionnalités",
  "tes fonctionnalites",
  "liste tes fonctions",
  "tes fonctions",
  "que gères-tu",
  "que gere tu",
  "que gere-tu",
  "à quoi tu sers",
  "a quoi tu sers",
  "a quoi sers tu",
  "à quoi sers tu",
  "présente-toi",
  "presente toi",
  "presente-toi",
  "qui es-tu",
  "qui es tu",
  "que fais-tu",
  "que fais tu",
  "tu fais quoi",
  "tu sais faire quoi",
  "montre-moi ce que tu sais",
  "montre moi ce que tu sais",
  "fonctionnalités",
  "fonctionnalites",
  "features",
  "que connais-tu",
  "que connais tu",
  "tes compétences",
  "tes competences",
  "tu sers à quoi",
  "tu sers a quoi",
  // EN
  "what can you do",
  "what do you do",
  "what are your capabilities",
  "what are your features",
  "what are your functions",
  "what do you know",
  "what do you know how to do",
  "what are you capable of",
  "tell me what you can do",
  "show me what you can do",
  "your abilities",
  "your skills",
  "who are you",
  "introduce yourself",
  "describe yourself",
  "how can you help",
  "what can you help with",
  "list your tools",
  "what tools do you have",
  "what are your tools",
  "your tools",
  // ES
  "qué puedes hacer",
  "que puedes hacer",
  "qué sabes hacer",
  "que sabes hacer",
  "cuáles son tus capacidades",
  "cuales son tus capacidades",
  "tus funciones",
  "tus características",
  "tus caracteristicas",
  "quién eres",
  "quien eres",
  "preséntate",
  "presentate",
  "qué haces",
  "que haces",
  "en qué puedes ayudarme",
  "en que puedes ayudarme",
  // DE
  "was kannst du",
  "was kannst du machen",
  "was machst du",
  "was sind deine fähigkeiten",
  "was sind deine funktionen",
  "wer bist du",
  "stell dich vor",
  "wobei kannst du helfen",
  "deine tools",
  "was kannst du alles",
  // IT
  "cosa puoi fare",
  "cosa sai fare",
  "quali sono le tue capacità",
  "quali sono le tue funzioni",
  "chi sei",
  "presentati",
  "cosa fai",
  "come puoi aiutarmi",
  "i tuoi strumenti",
  // PT
  "o que você pode fazer",
  "o que voce pode fazer",
  "o que você sabe fazer",
  "o que voce sabe fazer",
  "quais são suas capacidades",
  "quais sao suas capacidades",
  "suas funções",
  "suas funcoes",
  "quem é você",
  "quem e voce",
  "o que você faz",
  "o que voce faz",
  "como você pode ajudar",
  // RU
  "что ты умеешь",
  "что ты можешь",
  "что ты можешь делать",
  "твои возможности",
  "твои функции",
  "кто ты",
  "расскажи о себе",
  "чем ты можешь помочь",
  "твои инструменты",
  // JP
  "何ができる",
  "何ができますか",
  "あなたの機能",
  "あなたは誰",
  "自己紹介",
  // CN
  "你能做什么",
  "你会做什么",
  "你的功能",
  "你是谁",
  "自我介绍",
  // KR
  "무엇을 할 수 있어",
  "무엇을 할 수 있나요",
  "당신의 기능",
  "누구세요",
  "자기소개",
  // TR
  "ne yapabilirsin",
  "neler yapabilirsin",
  "yeteneklerin neler",
  "kim olduğunu",
  "kendini tanıt",
  "nasıl yardımcı olabilirsin",
  // AR
  "ماذا يمكنك أن تفعل",
  "ما هي قدراتك",
  "ما هي وظائفك",
  "من أنت",
  "عرف بنفسك",
  "كيف يمكن أن تساعدني",
  // NL
  "wat kun je doen",
  "wat zijn je mogelijkheden",
  "wat zijn je functies",
  "wie ben jij",
  "stel jezelf voor",
  "waarmee kun je helpen",
  // PL
  "co potrafisz",
  "co możesz zrobić",
  "jakie są twoje możliwości",
  "jakie są twoje funkcje",
  "kim jesteś",
  "przedstaw się",
];

export function isCapabilityQuery(message: string): boolean {
  const lower = message.toLowerCase().trim();
  if (lower.length < 3) return false;
  return CAPABILITY_TRIGGERS.some((trigger) => lower.includes(trigger));
}

// ── Génération de l'embed ────────────────────────────────────────────────────

interface CapabilityCategory {
  icon: string;
  name: string;
  items: string[];
}

const CAPABILITIES: CapabilityCategory[] = [
  {
    icon: "🎬",
    name: "Films & Séries",
    items: ["Recherche films/séries (TMDB)", "Infos casting, notes, synopsis"],
  },
  {
    icon: "🔍",
    name: "Recherche & Web",
    items: [
      "Recherche web (Brave Search, DuckDuckGo)",
      "Lecture de pages web (Jina Reader)",
      "Recherche YouTube + transcriptions",
      "Wikipedia (résumés encyclopédiques)",
      "News tech (Hacker News)",
      "Deep Research (rapports sourcis multi-étapes)",
      "Recherche Reddit (posts, trending)",
      "Recherche Twitter/X (profils, tweets)",
      "Open Graph extractor (métadonnées de pages)",
      "Robots.txt parser",
      "Sitemap.xml parser",
    ],
  },
  {
    icon: "💰",
    name: "Finance & Crypto",
    items: [
      "Prix crypto en temps réel (CoinGecko)",
      "Conversion de devises (open.er-api)",
      "Bourse & actions (via recherche web)",
    ],
  },
  {
    icon: "🌦️",
    name: "Météo & Environnement",
    items: [
      "Météo par ville (Open-Meteo)",
      "Indice UV (OpenUV)",
      "Phase de la lune (NOAA)",
      "Séismes temps réel (USGS)",
      "Qualité de l'air (OpenAQ)",
      "Lever/Coucher du soleil (sunrise-sunset.org)",
    ],
  },
  {
    icon: "🎮",
    name: "Gaming",
    items: [
      "Infos dépôts GitHub",
      "Stats Chess.com & Lichess",
      "Patch notes de jeux (RSS/Steam)",
      "Jeux gratuits Epic/Steam (détection auto)",
      "Boutique Fortnite (shop quotidien)",
      "Wishlist Fortnite (matching auto)",
      "Sorties de jeux (calendrier)",
      "Stats Pokémon (PokeAPI)",
      "Serveur Minecraft (gestion intégrée)",
      "Helldivers 2 — statut guerre galactique",
    ],
  },
  {
    icon: "📺",
    name: "Médias & Streaming",
    items: [
      "Recherche de vidéos YouTube",
      "Monitoring Twitch (live detection)",
      "Alertes TikTok / Kick / VOD",
      "Forwarding de clips",
      "Go Live (stream des sorties de jeux)",
      "Sous-titres vocaux en temps réel",
      "Traduction vocale en temps réel",
      "Conversation vocale IA",
    ],
  },
  {
    icon: "🔬",
    name: "Science & Savoir",
    items: [
      "Articles scientifiques (Crossref, arXiv)",
      "Dictionnaire anglais (Free Dictionary API)",
      "Recherche de livres (Open Library)",
      "Nourriture & recettes (TheMealDB)",
      "Fait aléatoire (Numbers API)",
      "Infos par pays (REST Countries)",
      "Fact-checking (Google Fact Check)",
      "NASA APOD (photo d'astronomie du jour)",
      "Lever/Coucher du soleil (sunrise-sunset.org)",
      "Qualité de l'air (OpenAQ)",
      "Ce jour dans l'histoire (byabbe.se)",
      "Jours fériés par pays (date.nager.at)",
    ],
  },
  {
    icon: "🛡️",
    name: "Sécurité & OSINT",
    items: [
      "Scan OSINT complet (IP, domaine, email)",
      "Shodan (appareils exposés)",
      "Vérification de sécurité d'URL (URLVoid)",
      "Détection d'emails jetables",
      "Vérification SteamRep (bans)",
      "Détection typosquatting",
      "Tracking d'avatar (hash SHA-256)",
      "Détection de ghost pings",
      "Recherche de pseudo sur 30+ plateformes",
      "Réputation d'email (EmailRep)",
      "SecurityTrails (historique DNS)",
      "Censys (surface d'attaque)",
      "GreyNoise (classification d'IP)",
      "Kali Linux : nmap, nikto, arp-scan, airodump, lynis",
      "Détection de rogue AP / Evil Twin",
      "Audit de durcissement système (Lynis)",
      "Snapshot IDS (Suricata)",
      "AbuseIPDB (score de réputation d'IP)",
      "Détection VPN/Proxy (ip-api.com)",
      "SSL Certificate Checker (ssl-checker.io)",
    ],
  },
  {
    icon: "🤖",
    name: "IA & Agent",
    items: [
      "Chat IA multi-modèles (OpenRouter, OpenAI, Groq, Gemini, HuggingFace, NVIDIA NIM)",
      "Boucle d'agent (Think → Act → Observe → Respond)",
      "Auto-réflexion sur les résultats d'outils",
      "Mémoire long-terme par utilisateur",
      "Génération d'images (Pollinations.ai)",
      "Analyse d'images (Gemini Vision)",
      "Transcription audio (AssemblyAI)",
      "Classification NSFW (Sightengine/Gemini)",
      "Sandbox code (Python/JS/Shell via E2B)",
      "Reranking de documents (Cohere)",
      "Arbres de pensée (Tree of Thought)",
      "Consensus multi-expert",
      "Personnalité configurable",
    ],
  },
  {
    icon: "🛠️",
    name: "Dev Tools",
    items: [
      "Générateur de mots de passe (crypto local)",
      "Email temporaire (Mail.tm)",
      "UUID generator",
      "Hash calculator (MD5/SHA256/SHA512)",
      "Encodeur/décodeur (Base64/URL/Hex)",
      "Calculatrice scientifique",
      "QR code generator",
      "Générateur TTS (text-to-speech)",
      "Stats système VPS (CPU/RAM/disk)",
      "Commandes shell (whitelist sécurisée)",
      "Requêtes SQL (SELECT read-only)",
      "Opérations Git (status/log/pull/diff)",
      "Gestion Docker (list/logs/restart/stats)",
      "Lecture de fichiers VPS",
      "Monitoring RSS",
      "Détection de changements sur site web",
      "Cron jobs dynamiques",
      "HTTP request générique",
      "Convertisseur d'unités (longueur, poids, température, données)",
      "Convertisseur de fuseaux horaires",
      "Expliqueur d'expressions cron",
      "Testeur de regex",
      "Générateur de palettes de couleurs",
    ],
  },
  {
    icon: "🌐",
    name: "Réseaux & Communauté",
    items: [
      "Monitoring Twitter/X, Reddit, Instagram",
      "Suivi de créateurs (social follow)",
      "Alertes de sorties GitHub (releases)",
      "Digest communautaire (résumé périodique)",
      "Détection de hot topics",
      "Prédiction de churn (départ de membres)",
      "Matchmaking LFG (Looking For Group)",
      "Heatmap d'activité",
      "Système de tickets",
      "Reaction roles",
      "Suggestion system + Starboard",
      "Giveaway + Poll system",
      "Tag system + AFK system",
      "Reminder + Scheduled messages",
      "Auto-thread + Custom commands",
    ],
  },
  {
    icon: "⚖️",
    name: "Modération",
    items: [
      "Détection de spam (IA + heuristique)",
      "Filtre de mots interdits (escalade auto)",
      "Anti-raid (détection de pic d'activité)",
      "Freeze de salon d'urgence",
      "Système d'avertissements (warnings DB)",
      "Timeout / Kick / Ban (via agent IA)",
      "Détection de multi-comptes (alt detector)",
      "Modération IA (analyse de sentiment)",
      "Anti-nuke (protection contre la destruction de masse)",
      "Captcha verification",
      "Slowmode automatique",
    ],
  },
  {
    icon: "🌍",
    name: "Géoloc & Transport",
    items: [
      "Géolocalisation IP (ip-api.com)",
      "Wayback Machine (archives web)",
      "Tracking aérien temps réel (OpenSky Network)",
      "Trivia (Open Trivia DB)",
      "Blagues (JokeAPI)",
      "Conseils (Advice API)",
      "Générateur d'image placeholder",
      "Générateur Lorem Ipsum (BaconIpsum)",
      "Générateur de profils aléatoires (randomuser.me)",
    ],
  },
  {
    icon: "📊",
    name: "Analytics & Monitoring",
    items: [
      "Stats serveur (membres, salons, rôles)",
      "Analytics de commandes",
      "Tableau de bord de rate limiting",
      "Métriques Prometheus",
      "Health checks (HTTP endpoints)",
      "Détection d'anomalies",
      "Rapports automatiques (planifiés)",
      "Suivi de présence (presence tracker)",
    ],
  },
  {
    icon: "🛒",
    name: "Suivi de Produits Revendeurs",
    items: [
      "Track un produit: @mention + \"Track-moi ça sur Amazon\"",
      "Track depuis une image: envoie une capture de panier + @mention",
      "Track tout un panier: @mention + \"Scan mon panier\" + image",
      "Vérifier les promos: @mention + \"Y'a une promo sur ça ?\"",
      "Comparer les prix: @mention + \"Compare le prix de ça\"",
      "Recherche multi-boutiques: @mention + \"Trouve-moi ça partout\"",
      "Boutiques: Amazon, eBay, Fnac, Cdiscount, Darty, Boulanger, LDLC, etc.",
      "Pays: 🇫🇷 🇩🇪 🇧🇪 🇳🇱 🇪🇸 🇮🇹 🇨🇭 🇬🇧 🇺🇸",
      "Alertes automatiques: baisse de prix, restock, promotion",
      "Notifications: salon dédié + message privé (DM)",
      "Embeds riches: nom, image, pays, marketplace, prix, stock, lien",
      "Multilingue: FR, EN, DE, ES, IT, NL — réponds dans ta langue",
      "Phrases naturelles: \"Suis-moi ça\", \"Piste-moi ça\", \"Surveille ça\"",
      "Aucune commande slash — tout se fait en langage naturel",
    ],
  },
];

export function generateCapabilitiesEmbed(): EmbedBuilder {
  const embed = new EmbedBuilder()
    .setTitle("🤖 Mes Capacités")
    .setDescription(
      "Voici tout ce que je peux faire. Pose-moi tes questions en langage naturel, je détecte automatiquement ce dont tu as besoin.\n\n*💬 @mentionne-moi pour discuter, ou parle naturellement dans un salon où je suis actif.*",
    )
    .setColor(0x5865f2)
    .setFooter({ text: "Bot Universel • Pose ta question, je m'occupe du reste" })
    .setTimestamp();

  for (const cat of CAPABILITIES) {
    const fieldValue = cat.items.map((item) => `• ${item}`).join("\n");
    // Discord embed field value max 1024 chars
    if (fieldValue.length <= 1024) {
      embed.addFields({ name: `${cat.icon} ${cat.name}`, value: fieldValue, inline: false });
    } else {
      // Split into two fields if too long
      const mid = Math.ceil(cat.items.length / 2);
      embed.addFields({
        name: `${cat.icon} ${cat.name} (1/2)`,
        value: cat.items
          .slice(0, mid)
          .map((i) => `• ${i}`)
          .join("\n"),
        inline: false,
      });
      embed.addFields({
        name: `${cat.icon} ${cat.name} (2/2)`,
        value: cat.items
          .slice(mid)
          .map((i) => `• ${i}`)
          .join("\n"),
        inline: false,
      });
    }
  }

  return embed;
}
