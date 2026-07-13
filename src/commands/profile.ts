/**
 * profile.ts — Commande /profile (profil personnalisé : bio, couleurs, badges, titre)
 *
 * Subcommands : view, bio, color, title, badges, reset
 */

import {
  ChatInputCommandInteraction,
  AutocompleteInteraction,
  SlashCommandBuilder,
  EmbedBuilder,
  MessageFlags,
  User,
  ActionRowBuilder,
  ButtonBuilder,
  ButtonStyle,
  ComponentType,
  ButtonInteraction,
} from "discord.js";
import prisma from "../prisma.js";
import logger from "../utils/logger.js";

// ─── Système de rareté ───────────────────────────────────────────────────────

type Rarity = "common" | "uncommon" | "rare" | "epic" | "legendary" | "mythic";

const RARITY_INFO: Record<Rarity, { color: number; label: string; icon: string }> = {
  common: { color: 0x95a5a6, label: "Common", icon: "⚪" },
  uncommon: { color: 0x2ecc71, label: "Uncommon", icon: "🟢" },
  rare: { color: 0x3498db, label: "Rare", icon: "🔵" },
  epic: { color: 0x9b59b6, label: "Epic", icon: "🟣" },
  legendary: { color: 0xf1c40f, label: "Legendary", icon: "🟡" },
  mythic: { color: 0xe74c3c, label: "Mythic", icon: "🔴" },
};

interface BadgeDef {
  emoji: string;
  label: string;
  description: string;
  icon?: string;
  rarity?: Rarity;
  category?: string;
  unlockLevel?: number;
  imageUrl?: string;
}

// ─── Badges disponibles ────────────────────────────────────────────────────────

const AVAILABLE_BADGES: Record<string, BadgeDef> = {
  // ─── Gaming ───
  gamer: { emoji: "🎮", label: "Gamer", description: "Joueur passionné", category: "Gaming" },
  pro: {
    emoji: "🏆",
    label: "Pro Gamer",
    description: "Compétiteur hors pair",
    category: "Gaming",
    rarity: "rare",
  },
  fortnite: { emoji: "🪂", label: "Fortnite", description: "Fan de Fortnite", category: "Gaming" },
  minecraft: {
    emoji: "⛏️",
    label: "Mineur",
    description: "Builder de Minecraft",
    category: "Gaming",
  },
  valorant: {
    emoji: "🎯",
    label: "Radiant",
    description: "Joueur de Valorant",
    category: "Gaming",
  },
  league: {
    emoji: "⚔️",
    label: "Invocateur",
    description: "Joueur de League of Legends",
    category: "Gaming",
  },
  retro: { emoji: "👾", label: "Rétro", description: "Fan de jeux rétro", category: "Gaming" },
  speedrun: {
    emoji: "⏱️",
    label: "Speedrunner",
    description: "Toujours plus vite",
    category: "Gaming",
  },
  // ─── Tech ───
  dev: { emoji: "💻", label: "Développeur", description: "Codeur de talent", category: "Tech" },
  hacker: {
    emoji: "🧑‍💻",
    label: "Hacker",
    description: "Expert en cybersécurité",
    category: "Tech",
    rarity: "rare",
  },
  ai: { emoji: "🤖", label: "AI Whisperer", description: "Passionné d'IA", category: "Tech" },
  // ─── Créatif ───
  artist: { emoji: "🎨", label: "Artiste", description: "Âme créative", category: "Creatif" },
  writer: { emoji: "✍️", label: "Écrivain", description: "Plume affûtée", category: "Creatif" },
  photographer: {
    emoji: "📸",
    label: "Photographe",
    description: "Œil de lynx",
    category: "Creatif",
  },
  streamer: {
    emoji: "🎥",
    label: "Streamer",
    description: "Devant la caméra",
    category: "Creatif",
  },
  // ─── Musique ───
  music: {
    emoji: "🎵",
    label: "Mélomane",
    description: "Amoureux de la musique",
    category: "Musique",
  },
  dj: { emoji: "🎧", label: "DJ", description: "Maître des platines", category: "Musique" },
  rapper: { emoji: "🎤", label: "Rappeur", description: "Flow de malade", category: "Musique" },
  // ─── Communauté ───
  veteran: {
    emoji: "🎖️",
    label: "Vétéran",
    description: "Membre de longue date",
    category: "Communaute",
    rarity: "rare",
  },
  helper: {
    emoji: "🤝",
    label: "Helper",
    description: "Toujours prêt à aider",
    category: "Communaute",
    rarity: "uncommon",
  },
  meme: {
    emoji: "😂",
    label: "Meme Lord",
    description: "Le roi des memes",
    category: "Communaute",
    rarity: "uncommon",
  },
  chill: { emoji: "🌴", label: "Chill", description: "Détendu et cool", category: "Communaute" },
  // ─── Culture ───
  otaku: { emoji: "🌸", label: "Otaku", description: "Fan d'anime/manga", category: "Culture" },
  cinephile: {
    emoji: "🎬",
    label: "Cinéphile",
    description: "Passionné de cinéma",
    category: "Culture",
  },
  bookworm: {
    emoji: "📚",
    label: "Bookworm",
    description: "Dévoreur de livres",
    category: "Culture",
  },
  // ─── Lifestyle ───
  sport: {
    emoji: "⚽",
    label: "Sportif",
    description: "Actif et énergique",
    category: "Lifestyle",
  },
  foodie: {
    emoji: "🍕",
    label: "Foodie",
    description: "Passionné de cuisine",
    category: "Lifestyle",
  },
  traveler: {
    emoji: "✈️",
    label: "Voyageur",
    description: "Explorateur du monde",
    category: "Lifestyle",
  },
  nightowl: {
    emoji: "🦉",
    label: "Oiseau de nuit",
    description: "Toujours up la nuit",
    category: "Lifestyle",
  },
  coffee: { emoji: "☕", label: "Caféiné", description: "Vit sur le café", category: "Lifestyle" },
  // ─── Spécial ───
  legend: {
    emoji: "👑",
    label: "Légende",
    description: "Statut légendaire",
    category: "Special",
    rarity: "legendary",
  },
  mystery: {
    emoji: "🔍",
    label: "Mystère",
    description: "Personnage mystérieux",
    category: "Special",
    rarity: "epic",
  },
  lucky: {
    emoji: "🍀",
    label: "Chanceux",
    description: "Toujours du bon côté",
    category: "Special",
    rarity: "rare",
  },
  chaos: {
    emoji: "🔥",
    label: "Agent du Chaos",
    description: "Semant la pagaille",
    category: "Special",
    rarity: "epic",
  },
  // ─── Gaming+ ───
  cod: { emoji: "🔫", label: "Soldat", description: "Joueur de Call of Duty", category: "Gaming" },
  fifa: { emoji: "⚽", label: "Footballeur", description: "Roi du FIFA", category: "Gaming" },
  gta: { emoji: "🚗", label: "Pilote", description: "Fan de GTA", category: "Gaming" },
  pokemon: { emoji: "🔴", label: "Dresseur", description: "Attrape-les tous", category: "Gaming" },
  zelda: { emoji: "🗡️", label: "Héros", description: "Sauveur d'Hyrule", category: "Gaming" },
  souls: {
    emoji: "💀",
    label: "Sans Peur",
    description: "Survivant de Dark Souls",
    category: "Gaming",
  },
  rpg: { emoji: "🐉", label: "Aventurier", description: "Quêteur de donjons", category: "Gaming" },
  strategy: {
    emoji: "♟️",
    label: "Stratège",
    description: "Maître des échecs",
    category: "Gaming",
  },
  // ─── Tech+ ───
  gamerpc: {
    emoji: "🖥️",
    label: "PC Master Race",
    description: "PC avant tout",
    category: "Gaming",
  },
  console: {
    emoji: "🎮",
    label: "Console Gamer",
    description: "Manette en main",
    category: "Gaming",
  },
  mobile: { emoji: "📱", label: "Mobile Gamer", description: "Joue partout", category: "Gaming" },
  linux: { emoji: "🐧", label: "Linuxien", description: "Pingouin powered", category: "Tech" },
  // ─── Social ───
  talkative: {
    emoji: "💬",
    label: "Bavard",
    description: "Ne s'arrête jamais de parler",
    category: "Social",
  },
  popular: { emoji: "⭐", label: "Populaire", description: "Connu de tous", category: "Social" },
  introvert: {
    emoji: "🌙",
    label: "Introverti",
    description: "Préfère le calme",
    category: "Social",
  },
  extrovert: {
    emoji: "☀️",
    label: "Extraverti",
    description: "Énergie sociale",
    category: "Social",
  },
  // ─── Nature & Animaux ───
  cat: { emoji: "🐱", label: "Chat", description: "Felin à cœur", category: "Animaux" },
  dog: { emoji: "🐶", label: "Chien", description: "Meilleur ami", category: "Animaux" },
  nature: {
    emoji: "🌿",
    label: "Nature",
    description: "Amoureux de la nature",
    category: "Animaux",
  },
  ocean: { emoji: "🌊", label: "Océan", description: "Esprit marin", category: "Animaux" },
  // ─── Fun & Humour ───
  clown: { emoji: "🤡", label: "Clown", description: "Fait rire tout le monde", category: "Fun" },
  troll: { emoji: "🎣", label: "Troll", description: "Maître de la provocation", category: "Fun" },
  sarcastic: { emoji: "😏", label: "Sarcastique", description: "Ironie incarnée", category: "Fun" },
  pun: {
    emoji: " dad",
    label: "King of Puns",
    description: "Maître du jeu de mots",
    category: "Fun",
  },
  // ─── Astro & Sciences ───
  space: { emoji: "🚀", label: "Astronaute", description: "Tête dans les étoiles" },
  science: { emoji: "🔬", label: "Scientifique", description: "Esprit rationnel" },
  math: { emoji: "📐", label: "Matheux", description: "Chiffres et formules" },
  // ─── Collector ───
  collector: {
    emoji: "🧩",
    label: "Collectionneur",
    description: "Amasse tout",
    category: "Collector",
  },
  hoarder: { emoji: "📦", label: "Cumulus", description: "Garde tout", category: "Collector" },
  // ─── Events ───
  earlybird: {
    emoji: "🌅",
    label: "Lève-tôt",
    description: "Premier au réveil",
    category: "Events",
  },
  nightshift: {
    emoji: "🌃",
    label: "Garde de nuit",
    description: "Veille tard",
    category: "Events",
  },
  // ─── Émotions ───
  zen: { emoji: "🧘", label: "Zen", description: "Paix intérieure", category: "Emotions" },
  hype: { emoji: "⚡", label: "Hype", description: "Toujours excité", category: "Emotions" },
  romantic: {
    emoji: "💖",
    label: "Romantique",
    description: "Cœur sensible",
    category: "Emotions",
  },
  // ─── Rarity ───
  diamond: {
    emoji: "💎",
    label: "Diamant",
    description: "Brille pour toujours",
    category: "Rarity",
    rarity: "mythic",
  },
  gold: {
    emoji: "🥇",
    label: "Or",
    description: "Premier de la classe",
    category: "Rarity",
    rarity: "legendary",
  },
  silver: {
    emoji: "🥈",
    label: "Argent",
    description: "Toujours deuxième",
    category: "Rarity",
    rarity: "epic",
  },
  bronze: {
    emoji: "🥉",
    label: "Bronze",
    description: "Sur le podium",
    category: "Rarity",
    rarity: "rare",
  },
  // ─── Divers ───
  wizard: { emoji: "🧙", label: "Sorcier", description: "Maître des arcanes", category: "Divers" },
  ninja: { emoji: "🥷", label: "Ninja", description: "Rapide et discret", category: "Divers" },
  pirate: { emoji: "🏴‍☠️", label: "Pirate", description: "À l'abordage", category: "Divers" },
  knight: {
    emoji: "🛡️",
    label: "Chevalier",
    description: "Honneur et bravoure",
    category: "Divers",
  },
  vampire: { emoji: "🧛", label: "Vampire", description: "Vit la nuit", category: "Divers" },
  alien: {
    emoji: "👽",
    label: "Extraterrestre",
    description: "Pas de cette terre",
    category: "Divers",
  },
  ghost: {
    emoji: "👻",
    label: "Fantôme",
    description: "Disparaît sans crier gare",
    category: "Divers",
  },
  robot: { emoji: "🦾", label: "Cyborg", description: "Mi-humain mi-machine", category: "Divers" },
  unicorn: {
    emoji: "🦄",
    label: "Licorne",
    description: "Unique et magique",
    category: "Divers",
    rarity: "mythic",
  },
  dragon: {
    emoji: "🐲",
    label: "Dragon",
    description: "Puissant et fier",
    category: "Divers",
    rarity: "mythic",
  },
  phoenix: {
    emoji: "🔥",
    label: "Phénix",
    description: "Renaît de ses cendres",
    category: "Divers",
    rarity: "mythic",
  },
  // ─── Boissons ───
  tea: { emoji: "🍵", label: "Théier", description: "Vit sur le thé", category: "Boissons" },
  energy: {
    emoji: "⚡",
    label: "Energy Drink",
    description: "Fonctionne au Monster",
    category: "Boissons",
  },
  water: {
    emoji: "💧",
    label: "Hydraté",
    description: "Boit ses 2L par jour",
    category: "Boissons",
  },
  // ─── Saisons ───
  summer: { emoji: "☀️", label: "Été", description: "Vit pour le soleil", category: "Saisons" },
  winter: { emoji: "❄️", label: "Hiver", description: "Aime le froid", category: "Saisons" },
  halloween: {
    emoji: "🎃",
    label: "Halloween",
    description: "Frisson garanti",
    category: "Saisons",
  },
  christmas: { emoji: "🎄", label: "Noël", description: "Esprit de fête", category: "Saisons" },
  // ─── Gaming++ ───
  apex: { emoji: "🦅", label: "Legend", description: "Joueur d'Apex Legends", category: "Gaming" },
  overwatch: { emoji: "🛡️", label: "Hero", description: "Joueur d'Overwatch", category: "Gaming" },
  wow: { emoji: "🗡️", label: "Horde", description: "Pour la Horde !", category: "Gaming" },
  genshin: {
    emoji: "⚔️",
    label: "Voyageur",
    description: "Fan de Genshin Impact",
    category: "Gaming",
  },
  roblox: { emoji: "🟥", label: "Robloxian", description: "Builder de Roblox", category: "Gaming" },
  amongus: { emoji: "🔴", label: "Imposteur", description: "Sus", category: "Gaming" },
  terraria: { emoji: "🌳", label: "Terrarien", description: "Creuseur infini", category: "Gaming" },
  stardew: { emoji: "🥕", label: "Fermier", description: "Vie à la ferme", category: "Gaming" },
  hollowknight: {
    emoji: "🪲",
    label: "Knight",
    description: "Chevalier de Hallownest",
    category: "Gaming",
  },
  hades: { emoji: "🔥", label: "Dieu", description: "Fuyant l'Underworld", category: "Gaming" },
  csgo: { emoji: "🔫", label: "AWPer", description: "One shot one kill", category: "Gaming" },
  rocketleague: {
    emoji: "🚗",
    label: "Rocketeer",
    description: "Voiture + foot",
    category: "Gaming",
  },
  fifa_pro: { emoji: "⚽", label: "Pro Foot", description: "Compétiteur FIFA", category: "Gaming" },
  warzone: {
    emoji: "💥",
    label: "Warrior",
    description: "Survivant de Warzone",
    category: "Gaming",
  },
  pubg: {
    emoji: "🎒",
    label: "Parachutiste",
    description: "Winner Winner Chicken Dinner",
    category: "Gaming",
  },
  smash: { emoji: "🥊", label: "Smasher", description: "Joueur de Smash Bros", category: "Gaming" },
  mario: { emoji: "🍄", label: "Plombier", description: "It's a me !", category: "Gaming" },
  sonic: { emoji: "🦔", label: "Speedster", description: "Gotta go fast", category: "Gaming" },
  zelda_botw: {
    emoji: "🏹",
    label: "Explorateur",
    description: "Breath of the Wild",
    category: "Gaming",
  },
  metroid: { emoji: "👽", label: "Chasseuse", description: "Samus Aran", category: "Gaming" },
  kirby: { emoji: "⭐", label: "Puffball", description: "Inhale tout", category: "Gaming" },
  animalcrossing: { emoji: "🦝", label: "Maire", description: "Vie sur l'île", category: "Gaming" },
  splatoon: { emoji: "🦑", label: "Inkling", description: "Splash de couleur", category: "Gaming" },
  // ─── Tech++ ───
  rust: { emoji: "🦀", label: "Rustacean", description: "Rust programmer", category: "Tech" },
  python: { emoji: "🐍", label: "Pythonista", description: "Python lover", category: "Tech" },
  javascript: {
    emoji: "🟨",
    label: "JS Warrior",
    description: "JS dans le sang",
    category: "Tech",
  },
  typescript: {
    emoji: "🔷",
    label: "Type Master",
    description: "Type-safe forever",
    category: "Tech",
  },
  golang: { emoji: "🐹", label: "Gopher", description: "Go programmer", category: "Tech" },
  java: { emoji: "☕", label: "Java Dev", description: "JVM enthusiast", category: "Tech" },
  csharp: { emoji: "♯", label: "C# Dev", description: "DotNet warrior", category: "Tech" },
  php: { emoji: "🐘", label: "PHP Dev", description: "Web pioneer", category: "Tech" },
  react: { emoji: "⚛️", label: "React Dev", description: "Component builder", category: "Tech" },
  vue: { emoji: "💚", label: "Vue Dev", description: "Progressive framework", category: "Tech" },
  angular: {
    emoji: "🔺",
    label: "Angular Dev",
    description: "Enterprise framework",
    category: "Tech",
  },
  nodejs: { emoji: "🟢", label: "Node Dev", description: "Backend JavaScript", category: "Tech" },
  docker: {
    emoji: "🐳",
    label: "Docker Captain",
    description: "Container master",
    category: "Tech",
  },
  kubernetes: { emoji: "☸️", label: "K8s Admin", description: "Orchestrateur", category: "Tech" },
  git: { emoji: "📝", label: "Git Master", description: "Commit propre", category: "Tech" },
  cybersecurity: { emoji: "🔐", label: "Sécurité", description: "White hat", category: "Tech" },
  blockchain: { emoji: "⛓️", label: "Crypto Dev", description: "Web3 builder", category: "Tech" },
  datascience: {
    emoji: "📊",
    label: "Data Scientist",
    description: "Analyse de données",
    category: "Tech",
  },
  ml: { emoji: "🧠", label: "ML Engineer", description: "Machine learning", category: "Tech" },
  // ─── Musique++ ───
  rock: { emoji: "🎸", label: "Rockeur", description: "Vie sur le rock", category: "Musique" },
  jazz: { emoji: "🎷", label: "Jazzman", description: "Improvisation", category: "Musique" },
  classical: {
    emoji: "🎻",
    label: "Classique",
    description: "Amour de Beethoven",
    category: "Musique",
  },
  edm: { emoji: "🎛️", label: "EDM Fan", description: "Bass drop !", category: "Musique" },
  metal: { emoji: "🤘", label: "Metalhead", description: "Heavy metal", category: "Musique" },
  hiphop: { emoji: "🧢", label: "Hip-Hop", description: "Culture urbaine", category: "Musique" },
  lofi: { emoji: "🌙", label: "Lo-Fi", description: "Beats to relax", category: "Musique" },
  kpop: { emoji: "💜", label: "K-Pop Stan", description: "Fan de K-Pop", category: "Musique" },
  jpop: { emoji: "🌸", label: "J-Pop Fan", description: "Fan de J-Pop", category: "Musique" },
  punk: { emoji: "🤙", label: "Punk", description: "No rules", category: "Musique" },
  reggae: { emoji: "🌴", label: "Reggae", description: "Vibes positives", category: "Musique" },
  country: { emoji: "🤠", label: "Country", description: "Western music", category: "Musique" },
  blues: { emoji: "💙", label: "Blues", description: "Âme mélancolique", category: "Musique" },
  opera: { emoji: "🎭", label: "Opéra", description: "Amateur d'opéra", category: "Musique" },
  // ─── Créatif++ ───
  dancer: {
    emoji: "💃",
    label: "Danseur",
    description: "Rythme dans la peau",
    category: "Creatif",
  },
  actor: { emoji: "🎭", label: "Acteur", description: "Sur scène", category: "Creatif" },
  designer: { emoji: "🖌️", label: "Designer", description: "Œil esthétique", category: "Creatif" },
  editor: {
    emoji: "✂️",
    label: "Monteur",
    description: "Découpeur de vidéos",
    category: "Creatif",
  },
  cosplayer: {
    emoji: "🦸",
    label: "Cosplayer",
    description: "Costumes faits maison",
    category: "Creatif",
  },
  youtuber: {
    emoji: "▶️",
    label: "YouTuber",
    description: "Créateur de contenu",
    category: "Creatif",
  },
  tiktoker: { emoji: "📱", label: "TikTok", description: "Vidéos courtes", category: "Creatif" },
  podcaster: {
    emoji: "🎙️",
    label: "Podcasteur",
    description: "Micro à la main",
    category: "Creatif",
  },
  vlogger: { emoji: "📹", label: "Vlogueur", description: "Vie en vidéo", category: "Creatif" },
  sculptor: {
    emoji: "🗿",
    label: "Sculpteur",
    description: "Façonneur de matière",
    category: "Creatif",
  },
  tattoo: { emoji: "🖋️", label: "Tatoué", description: "Art sur peau", category: "Creatif" },
  graffiti: { emoji: "🎨", label: "Graffeur", description: "Art urbain", category: "Creatif" },
  // ─── Sport++ ───
  basketball: { emoji: "🏀", label: "Basketteur", description: "Dunk master", category: "Sport" },
  football: { emoji: "⚽", label: "Footballeur", description: "But après but", category: "Sport" },
  tennis: { emoji: "🎾", label: "Tennisman", description: "Ace service", category: "Sport" },
  swimming: { emoji: "🏊", label: "Nageur", description: "Dans l'eau", category: "Sport" },
  cycling: { emoji: "🚴", label: "Cycliste", description: "Sur le vélo", category: "Sport" },
  running: { emoji: "🏃", label: "Coureur", description: "Marathonien", category: "Sport" },
  boxing: { emoji: "🥊", label: "Boxeur", description: "K.O. artist", category: "Sport" },
  mma: { emoji: "🥋", label: "Combattant", description: "Arts martiaux mixtes", category: "Sport" },
  skate: { emoji: "🛹", label: "Skateur", description: "Tricks et flips", category: "Sport" },
  ski: { emoji: "⛷️", label: "Skieur", description: "Piste noire", category: "Sport" },
  surf: { emoji: "🏄", label: "Surfeur", description: "Sur la vague", category: "Sport" },
  climbing: { emoji: "🧗", label: "Grimpeur", description: "Escalade", category: "Sport" },
  gym: { emoji: "💪", label: "Musclo", description: "Lève de la fonte", category: "Sport" },
  yoga: { emoji: "🧘", label: "Yogi", description: "Postures et souffle", category: "Sport" },
  // ─── Cuisine++ ───
  chef: { emoji: "👨‍🍳", label: "Chef", description: "Cuisinier étoilé", category: "Cuisine" },
  baker: { emoji: "🥖", label: "Boulanger", description: "Pain frais", category: "Cuisine" },
  pizzaiolo: {
    emoji: "🍕",
    label: "Pizzaiolo",
    description: "Roi de la pizza",
    category: "Cuisine",
  },
  barista: { emoji: "☕", label: "Barista", description: "Art du café", category: "Cuisine" },
  bartender: {
    emoji: "🍸",
    label: "Barman",
    description: "Cocktails créatifs",
    category: "Cuisine",
  },
  bbq: { emoji: "🔥", label: "BBQ Master", description: "Roi du grill", category: "Cuisine" },
  vegan: { emoji: "🥗", label: "Vegan", description: "100% végétal", category: "Cuisine" },
  spicy: { emoji: "🌶️", label: "Épicé", description: "Aime ça chaud", category: "Cuisine" },
  sweet: { emoji: "🍰", label: "Gourmand", description: "Vit pour le sucre", category: "Cuisine" },
  // ─── Voyage++ ───
  backpacker: { emoji: "🎒", label: "Backpacker", description: "Sac au dos", category: "Voyage" },
  tourist: { emoji: "📷", label: "Touriste", description: "Photos partout", category: "Voyage" },
  nomad: { emoji: "🧳", label: "Nomade", description: "Sans domicile fixe", category: "Voyage" },
  explorer: {
    emoji: "🧭",
    label: "Explorateur",
    description: "Terres inconnues",
    category: "Voyage",
  },
  // ─── Langues ───
  french: { emoji: "🇫🇷", label: "Français", description: "Langue maternelle", category: "Langues" },
  english: { emoji: "🇬🇧", label: "English", description: "Fluent in English", category: "Langues" },
  spanish: {
    emoji: "🇪🇸",
    label: "Español",
    description: "Hablante de español",
    category: "Langues",
  },
  german: { emoji: "🇩🇪", label: "Deutsch", description: "Deutschsprachig", category: "Langues" },
  japanese: { emoji: "🇯🇵", label: "日本語", description: "Nihongo speaker", category: "Langues" },
  korean: { emoji: "🇰🇷", label: "한국어", description: "Hangugeo speaker", category: "Langues" },
  italian: { emoji: "🇮🇹", label: "Italiano", description: "Parla italiano", category: "Langues" },
  portuguese: {
    emoji: "🇵🇹",
    label: "Português",
    description: "Falante português",
    category: "Langues",
  },
  chinese: { emoji: "🇨🇳", label: "中文", description: "Zhōngwén speaker", category: "Langues" },
  russian: { emoji: "🇷🇺", label: "Русский", description: "Russkiy speaker", category: "Langues" },
  arabic: { emoji: "🇸🇦", label: "العربية", description: "Arabic speaker", category: "Langues" },
  dutch: { emoji: "🇳🇱", label: "Nederlands", description: "Dutch speaker", category: "Langues" },
  polyglot: {
    emoji: "🌍",
    label: "Polyglotte",
    description: "Parle 5+ langues",
    category: "Langues",
    rarity: "epic",
  },
  // ─── Animaux++ ───
  wolf: { emoji: "🐺", label: "Loup", description: "Esprit solitaire", category: "Animaux" },
  fox: { emoji: "🦊", label: "Renard", description: "Malin et rusé", category: "Animaux" },
  bear: { emoji: "🐻", label: "Ours", description: "Force tranquille", category: "Animaux" },
  panda: { emoji: "🐼", label: "Panda", description: "Mange du bambou", category: "Animaux" },
  penguin: { emoji: "🐧", label: "Pingouin", description: "Vit sur la glace", category: "Animaux" },
  lion: { emoji: "🦁", label: "Lion", description: "Roi de la jungle", category: "Animaux" },
  tiger: { emoji: "🐯", label: "Tigre", description: "Chasseur solitaire", category: "Animaux" },
  owl: { emoji: "🦉", label: "Hibou", description: "Sage de nuit", category: "Animaux" },
  eagle: { emoji: "🦅", label: "Aigle", description: "Vue perçante", category: "Animaux" },
  shark: { emoji: "🦈", label: "Requin", description: "Prédateur des mers", category: "Animaux" },
  butterfly: { emoji: "🦋", label: "Papillon", description: "Métamorphose", category: "Animaux" },
  bee: { emoji: "🐝", label: "Abeille", description: "Travailleuse", category: "Animaux" },
  turtle: { emoji: "🐢", label: "Tortue", description: "Lent mais sûr", category: "Animaux" },
  snake: {
    emoji: "🐍",
    label: "Serpent",
    description: "Silencieux et rapide",
    category: "Animaux",
  },
  horse: { emoji: "🐴", label: "Cavalier", description: "Ami des chevaux", category: "Animaux" },
  hamster: { emoji: "🐹", label: "Hamster", description: "Mignon et rond", category: "Animaux" },
  // ─── Mythologie++ ───
  greek: {
    emoji: "⚡",
    label: "Olympien",
    description: "Mythologie grecque",
    category: "Mythologie",
  },
  norse: {
    emoji: "🪓",
    label: "Viking",
    description: "Mythologie nordique",
    category: "Mythologie",
  },
  egyptian: {
    emoji: "🏺",
    label: "Pharaon",
    description: "Mythologie égyptienne",
    category: "Mythologie",
  },
  // ─── Hobbies++ ───
  chess: { emoji: "♟️", label: "Échecquier", description: "Échecs et mat", category: "Hobbies" },
  puzzle: {
    emoji: "🧩",
    label: "Puzzle Master",
    description: "Pièce par pièce",
    category: "Hobbies",
  },
  lego: {
    emoji: "🧱",
    label: "Builder LEGO",
    description: "Brique par brique",
    category: "Hobbies",
  },
  origami: {
    emoji: "📄",
    label: "Origamiste",
    description: "Art du papier plié",
    category: "Hobbies",
  },
  gardening: { emoji: "🌱", label: "Jardinier", description: "Pouce vert", category: "Hobbies" },
  fishing: { emoji: "🎣", label: "Pêcheur", description: "Ligne à l'eau", category: "Hobbies" },
  hunting: { emoji: "🎯", label: "Chasseur", description: "Dans la nature", category: "Hobbies" },
  reading: { emoji: "📖", label: "Lecteur", description: "Dévore des livres", category: "Hobbies" },
  writing: { emoji: "✏️", label: "Auteur", description: "Écrit pour vivre", category: "Hobbies" },
  painting: { emoji: "🎨", label: "Peintre", description: "Toile et pinceau", category: "Hobbies" },
  singing: { emoji: "🎶", label: "Chanteur", description: "Voix d'or", category: "Hobbies" },
  guitar: { emoji: "🎸", label: "Guitariste", description: "Solo de guitare", category: "Hobbies" },
  piano: {
    emoji: "🎹",
    label: "Pianiste",
    description: "Doigts sur les touches",
    category: "Hobbies",
  },
  drums: { emoji: "🥁", label: "Batteur", description: "Rythme et frappe", category: "Hobbies" },
  violin: {
    emoji: "🎻",
    label: "Violoniste",
    description: "Archet et cordes",
    category: "Hobbies",
  },
  // ─── Personnalité++ ───
  optimistic: {
    emoji: "😊",
    label: "Optimiste",
    description: "Voit le bon côté",
    category: "Personnalite",
  },
  pessimistic: {
    emoji: "😔",
    label: "Pessimiste",
    description: "Prépare le pire",
    category: "Personnalite",
  },
  realist: {
    emoji: "😐",
    label: "Réaliste",
    description: "Les pieds sur terre",
    category: "Personnalite",
  },
  dreamer: {
    emoji: "💭",
    label: "Rêveur",
    description: "Tête dans les nuages",
    category: "Personnalite",
  },
  perfectionist: {
    emoji: "✨",
    label: "Perfectionniste",
    description: "Tout doit être parfait",
    category: "Personnalite",
  },
  loyal: {
    emoji: "🤝",
    label: "Loyal",
    description: "Fidèle jusqu'au bout",
    category: "Personnalite",
  },
  brave: {
    emoji: "🦁",
    label: "Courageux",
    description: "Ne recule jamais",
    category: "Personnalite",
  },
  wise: { emoji: "🦉", label: "Sage", description: "Conseiller éclairé", category: "Personnalite" },
  creative: {
    emoji: "💡",
    label: "Créatif",
    description: "Idées en folie",
    category: "Personnalite",
  },
  curious: {
    emoji: "🤔",
    label: "Curieux",
    description: "Veut tout savoir",
    category: "Personnalite",
  },
  ambitious: {
    emoji: "🚀",
    label: "Ambitieux",
    description: "Vise le sommet",
    category: "Personnalite",
  },
  patient: {
    emoji: "🐌",
    label: "Patient",
    description: "Prend son temps",
    category: "Personnalite",
  },
  // ─── Zodiac ───
  aries: { emoji: "♈", label: "Bélier", description: "21 mars - 19 avril", category: "Zodiac" },
  taurus: { emoji: "♉", label: "Taureau", description: "20 avril - 20 mai", category: "Zodiac" },
  gemini: { emoji: "♊", label: "Gémeaux", description: "21 mai - 20 juin", category: "Zodiac" },
  cancer: { emoji: "♋", label: "Cancer", description: "21 juin - 22 juillet", category: "Zodiac" },
  leo: { emoji: "♌", label: "Lion", description: "23 juillet - 22 août", category: "Zodiac" },
  virgo: { emoji: "♍", label: "Vierge", description: "23 août - 22 sept", category: "Zodiac" },
  libra: { emoji: "♎", label: "Balance", description: "23 sept - 22 oct", category: "Zodiac" },
  scorpio: { emoji: "♏", label: "Scorpion", description: "23 oct - 21 nov", category: "Zodiac" },
  sagittarius: {
    emoji: "♐",
    label: "Sagittaire",
    description: "22 nov - 21 déc",
    category: "Zodiac",
  },
  capricorn: {
    emoji: "♑",
    label: "Capricorne",
    description: "22 déc - 19 jan",
    category: "Zodiac",
  },
  aquarius: { emoji: "♒", label: "Verseau", description: "20 jan - 18 fév", category: "Zodiac" },
  pisces: { emoji: "♓", label: "Poissons", description: "19 fév - 20 mars", category: "Zodiac" },
  // ─── Éléments ───
  fire: { emoji: "🔥", label: "Feu", description: "Passion et énergie", category: "Elements" },
  water_el: { emoji: "💧", label: "Eau", description: "Fluide et adaptatif", category: "Elements" },
  earth: { emoji: "🌍", label: "Terre", description: "Stable et solide", category: "Elements" },
  air: { emoji: "💨", label: "Air", description: "Libre et insaisissable", category: "Elements" },
  ice: { emoji: "🧊", label: "Glace", description: "Froid et calculé", category: "Elements" },
  lightning: {
    emoji: "⚡",
    label: "Foudre",
    description: "Rapide et puissant",
    category: "Elements",
  },
  shadow: {
    emoji: "🌑",
    label: "Ombre",
    description: "Discret et mystérieux",
    category: "Elements",
  },
  light: { emoji: "✨", label: "Lumière", description: "Rayonnant et pur", category: "Elements" },
  // ─── MBTI ───
  intj: { emoji: "🧠", label: "INTJ", description: "Architecte", category: "MBTI" },
  intp: { emoji: "🔬", label: "INTP", description: "Logicien", category: "MBTI" },
  entj: { emoji: "👑", label: "ENTJ", description: "Commandant", category: "MBTI" },
  entp: { emoji: "💡", label: "ENTP", description: "Débateur", category: "MBTI" },
  infj: { emoji: "🦉", label: "INFJ", description: "Avocat", category: "MBTI" },
  infp: { emoji: "🌸", label: "INFP", description: "Médiateur", category: "MBTI" },
  enfj: { emoji: "🤝", label: "ENFJ", description: "Protagoniste", category: "MBTI" },
  enfp: { emoji: "🎉", label: "ENFP", description: "Inspirateur", category: "MBTI" },
  istj: { emoji: "📋", label: "ISTJ", description: "Logisticien", category: "MBTI" },
  isfj: { emoji: "🛡️", label: "ISFJ", description: "Défenseur", category: "MBTI" },
  estj: { emoji: "📊", label: "ESTJ", description: "Directeur", category: "MBTI" },
  esfj: { emoji: "💝", label: "ESFJ", description: "Consul", category: "MBTI" },
  istp: { emoji: "🔧", label: "ISTP", description: "Virtuose", category: "MBTI" },
  isfp: { emoji: "🎨", label: "ISFP", description: "Aventurier", category: "MBTI" },
  estp: { emoji: "⚡", label: "ESTP", description: "Entrepreneur", category: "MBTI" },
  esfp: { emoji: "🎭", label: "ESFP", description: "Amuseur", category: "MBTI" },
  // ─── Achievements ───
  first: {
    emoji: "🥇",
    label: "Premier",
    description: "Premier membre",
    category: "Achievements",
    rarity: "legendary",
  },
  level100: {
    emoji: "💯",
    label: "Niveau 100",
    description: "Cent niveaux atteints",
    category: "Achievements",
    rarity: "epic",
  },
  level500: {
    emoji: "🌟",
    label: "Niveau 500",
    description: "Légende vivante",
    category: "Achievements",
    rarity: "mythic",
  },
  nolife: {
    emoji: "🎮",
    label: "No Life",
    description: "Toujours connecté",
    category: "Achievements",
    rarity: "rare",
  },
  addicted: {
    emoji: "💊",
    label: "Accro",
    description: "Ne peut pas se déconnecter",
    category: "Achievements",
    rarity: "uncommon",
  },
  og: {
    emoji: "👑",
    label: "OG",
    description: "Original Gangster",
    category: "Achievements",
    rarity: "legendary",
  },
  // ─── Mood ───
  happy: { emoji: "😄", label: "Joyeux", description: "Toujours souriant", category: "Mood" },
  sad: { emoji: "😢", label: "Triste", description: "Journée difficile", category: "Mood" },
  angry: { emoji: "😡", label: "En colère", description: "Gare à toi", category: "Mood" },
  sleepy: { emoji: "😴", label: "Somnolent", description: "Toujours fatigué", category: "Mood" },
  hungry: { emoji: "🤤", label: "Affamé", description: "A toujours faim", category: "Mood" },
  bored: { emoji: "🥱", label: "Ennuyé", description: "Rien à faire", category: "Mood" },
  excited: { emoji: "🤩", label: "Excité", description: "Hype maximal", category: "Mood" },
  confused: { emoji: "🤔", label: "Confus", description: "Comprend rien", category: "Mood" },
  // ─── Divers++ ───
  book: { emoji: "📕", label: "Livre", description: "Lecteur passionné", category: "Divers" },
  clock: { emoji: "⏰", label: "Ponctuel", description: "Toujours à l'heure", category: "Divers" },
  crown: {
    emoji: "👑",
    label: "Roi",
    description: "Règne sur tout",
    category: "Divers",
    rarity: "legendary",
  },
  heart: { emoji: "❤️", label: "Cœur", description: "Plein d'amour", category: "Divers" },
  star: { emoji: "⭐", label: "Star", description: "Brille partout", category: "Divers" },
  trophy: {
    emoji: "🏆",
    label: "Champion",
    description: "Toujours gagnant",
    category: "Divers",
    rarity: "legendary",
  },
  medal: {
    emoji: "🏅",
    label: "Médaillé",
    description: "Haut fait",
    category: "Divers",
    rarity: "epic",
  },
  flag: { emoji: "🏁", label: "Drapeau", description: "Ligne d'arrivée", category: "Divers" },
  target: { emoji: "🎯", label: "Sniper", description: "Objectif atteint", category: "Divers" },
  bolt: { emoji: "⚡", label: "Éclair", description: "Rapide comme l'éclair", category: "Divers" },
  flame: { emoji: "🔥", label: "Flamme", description: "En feu", category: "Divers" },
  gem: { emoji: "💎", label: "Gemme", description: "Précieux", category: "Divers" },
  shield: { emoji: "🛡️", label: "Bouclier", description: "Protecteur", category: "Divers" },
  sword: { emoji: "⚔️", label: "Épée", description: "Combattant", category: "Divers" },
  key: { emoji: "🔑", label: "Clé", description: "Ouvre toutes les portes", category: "Divers" },
  lock: { emoji: "🔒", label: "Cadenas", description: "Sécurité avant tout", category: "Divers" },
  gear: { emoji: "⚙️", label: "Mécanicien", description: "Tourne les roues", category: "Divers" },
  magnet: { emoji: "🧲", label: "Aimant", description: "Attire tout", category: "Divers" },
  battery: { emoji: "🔋", label: "Batterie", description: "Pleine énergie", category: "Divers" },
  plug: { emoji: "🔌", label: "Branché", description: "Connecté", category: "Divers" },
  satellite: {
    emoji: "🛰️",
    label: "Satellite",
    description: "Dans l'espace",
    category: "Divers",
    rarity: "rare",
  },
  rocket: {
    emoji: "🚀",
    label: "Fusée",
    description: "Vers les étoiles",
    category: "Divers",
    rarity: "rare",
  },
  // ─── Weather ───
  sunny: { emoji: "☀️", label: "Ensoleillé", description: "Beau temps", category: "Weather" },
  rainy: { emoji: "🌧️", label: "Pluvieux", description: "Aime la pluie", category: "Weather" },
  stormy: { emoji: "⛈️", label: "Orageux", description: "Aime les tempêtes", category: "Weather" },
  snowy: { emoji: "🌨️", label: "Neigeux", description: "Aime la neige", category: "Weather" },
  rainbow: {
    emoji: "🌈",
    label: "Arc-en-ciel",
    description: "Toujours positif",
    category: "Weather",
  },
  foggy: { emoji: "🌫️", label: "Brumeux", description: "Dans le flou", category: "Weather" },
  windy: { emoji: "💨", label: "Venteux", description: "Esprit libre", category: "Weather" },
  // ─── Food++ ───
  burger: { emoji: "🍔", label: "Burger", description: "Fast food lover", category: "Food" },
  sushi: { emoji: "🍣", label: "Sushi", description: "Cuisine japonaise", category: "Food" },
  taco: { emoji: "🌮", label: "Taco", description: "Cuisine mexicaine", category: "Food" },
  ramen: { emoji: "🍜", label: "Ramen", description: "Noodles addict", category: "Food" },
  croissant: {
    emoji: "🥐",
    label: "Croissant",
    description: "Petit-déj français",
    category: "Food",
  },
  donut: { emoji: "🍩", label: "Donut", description: "Beurre et sucre", category: "Food" },
  chocolate: {
    emoji: "🍫",
    label: "Chocolat",
    description: "Addict au chocolat",
    category: "Food",
  },
  icecream: { emoji: "🍦", label: "Glace", description: "Frais et sucré", category: "Food" },
  cookie: { emoji: "🍪", label: "Cookie", description: "Croustillant", category: "Food" },
  cheese: {
    emoji: "🧀",
    label: "Fromage",
    description: "Français jusqu'au bout",
    category: "Food",
  },
  bread: { emoji: "🍞", label: "Pain", description: "Base de tout", category: "Food" },
  egg: { emoji: "🥚", label: "Œuf", description: "Protéine simple", category: "Food" },
  honey: { emoji: "🍯", label: "Miel", description: "Douceur naturelle", category: "Food" },
  // ─── Drinks++ ───
  beer: { emoji: "🍺", label: "Bière", description: "Mousse et houblon", category: "Boissons" },
  wine: { emoji: "🍷", label: "Vin", description: "Connaisseur", category: "Boissons" },
  cocktail: {
    emoji: "🍹",
    label: "Cocktail",
    description: "Sucré et coloré",
    category: "Boissons",
  },
  champagne: {
    emoji: "🥂",
    label: "Champagne",
    description: "Fête et bulles",
    category: "Boissons",
  },
  sake: { emoji: "🍶", label: "Saké", description: "Alcool japonais", category: "Boissons" },
  whiskey: { emoji: "🥃", label: "Whiskey", description: "Fumé et fort", category: "Boissons" },
  smoothie: { emoji: "🥤", label: "Smoothie", description: "Mix de fruits", category: "Boissons" },
  milk: { emoji: "🥛", label: "Lait", description: "Os solides", category: "Boissons" },
  juice: { emoji: "🧃", label: "Jus", description: "Vitamines", category: "Boissons" },
  soda: { emoji: "🥤", label: "Soda", description: "Bulles et sucre", category: "Boissons" },
  // ─── Achievements+ ───
  activedev: {
    emoji: "👨‍💻",
    label: "Développeur Actif",
    description: "Code tous les jours",
    category: "Achievements",
    rarity: "epic",
  },
  contributor: {
    emoji: "🤝",
    label: "Contributeur",
    description: "Aide à améliorer le bot",
    category: "Achievements",
    rarity: "rare",
  },
  bughunter: {
    emoji: "🐛",
    label: "Chasseur de Bugs",
    description: "Trouve et report les bugs",
    category: "Achievements",
    rarity: "rare",
  },
  earlysupporter: {
    emoji: "🌱",
    label: "Soutien des Premiers Jours",
    description: "Là depuis le début",
    category: "Achievements",
    rarity: "epic",
  },
  tester: {
    emoji: "🧪",
    label: "Testeur",
    description: "Teste les nouveautés en avant-première",
    category: "Achievements",
    rarity: "uncommon",
  },
  translator: {
    emoji: "🌍",
    label: "Traducteur",
    description: "Aide à traduire le bot",
    category: "Achievements",
    rarity: "uncommon",
  },
  feedbacker: {
    emoji: "💬",
    label: "Feedbackeur",
    description: "Donne des retours constructifs",
    category: "Achievements",
    rarity: "uncommon",
  },
  // ─── Communauté+ ───
  friendly: {
    emoji: "😊",
    label: "Sympa",
    description: "Toujours bienveillant",
    category: "Communaute",
  },
  active: {
    emoji: "⚡",
    label: "Membre Actif",
    description: "Participe régulièrement",
    category: "Communaute",
    rarity: "uncommon",
  },
  eventwinner: {
    emoji: "🏅",
    label: "Vainqueur d'Événement",
    description: "A gagné un événement",
    category: "Communaute",
    rarity: "epic",
  },
  eventpart: {
    emoji: "🎉",
    label: "Participant d'Événement",
    description: "Participe aux événements",
    category: "Communaute",
  },
  // ─── Style Officiel Discord (répliques personnalisées avec images) ───
  ds_verified_dev: {
    emoji: "✅",
    label: "Dev Vérifié",
    description: "Développeur d'applications vérifié",
    category: "Discord Style",
    rarity: "epic",
    imageUrl:
      "https://cdn.jsdelivr.net/gh/discord-badge-images/verified-developer@latest/badge.png",
  },
  ds_early_supporter: {
    emoji: "💎",
    label: "Soutien des Premiers Jours",
    description: "Utilisateur Nitro depuis les débuts",
    category: "Discord Style",
    rarity: "legendary",
    imageUrl: "https://cdn.jsdelivr.net/gh/discord-badge-images/early-supporter@latest/badge.png",
  },
  ds_bug_hunter: {
    emoji: "🐛",
    label: "Chasseur de Bugs",
    description: "Chasseur de bugs certifié",
    category: "Discord Style",
    rarity: "rare",
    imageUrl: "https://cdn.jsdelivr.net/gh/discord-badge-images/bug-hunter@latest/badge.png",
  },
  ds_bug_hunter_gold: {
    emoji: "🏅",
    label: "Chasseur de Bugs Or",
    description: "Chasseur de bugs niveau or",
    category: "Discord Style",
    rarity: "legendary",
    imageUrl: "https://cdn.jsdelivr.net/gh/discord-badge-images/bug-hunter-gold@latest/badge.png",
  },
  ds_hypesquad: {
    emoji: "🏠",
    label: "HypeSquad",
    description: "Membre de la HypeSquad",
    category: "Discord Style",
    rarity: "uncommon",
  },
  ds_bravery: {
    emoji: "🟣",
    label: "HypeSquad Bravery",
    description: "Bravery tout le chemin",
    category: "Discord Style",
    rarity: "uncommon",
  },
  ds_brilliance: {
    emoji: "🟠",
    label: "HypeSquad Brilliance",
    description: "Brilliance et passion",
    category: "Discord Style",
    rarity: "uncommon",
  },
  ds_balance: {
    emoji: "🟢",
    label: "HypeSquad Balance",
    description: "L'équilibre avant tout",
    category: "Discord Style",
    rarity: "uncommon",
  },
  ds_partner: {
    emoji: "🔵",
    label: "Partenaire",
    description: "Serveur partenaire",
    category: "Discord Style",
    rarity: "mythic",
  },
  ds_staff: {
    emoji: "🛡️",
    label: "Staff Discord",
    description: "Membre de l'équipe Discord",
    category: "Discord Style",
    rarity: "mythic",
  },
  ds_active_dev: {
    emoji: "🟩",
    label: "Développeur Actif",
    description: "Développeur d'app actif",
    category: "Discord Style",
    rarity: "epic",
    imageUrl:
      "https://i0.wp.com/www.alphr.com/wp-content/uploads/2023/05/Discord-How-to-Get-Active-Developer-Badge.jpg?resize=80,80&ssl=1",
  },
  ds_certified_mod: {
    emoji: "🟦",
    label: "Modérateur Certifié",
    description: "Modérateur formé et certifié",
    category: "Discord Style",
    rarity: "epic",
  },
  ds_bot_dev: {
    emoji: "🤖",
    label: "Créateur de Bot",
    description: "Créateur de bot vérifié",
    category: "Discord Style",
    rarity: "rare",
  },
  ds_nitro: {
    emoji: "💎",
    label: "Nitro",
    description: "Abonné Nitro",
    category: "Discord Style",
    rarity: "uncommon",
  },
  ds_nitro_boost: {
    emoji: "💜",
    label: "Server Booster",
    description: "Booste son serveur",
    category: "Discord Style",
    rarity: "uncommon",
  },
  // ─── Fun+ ───
  potato: { emoji: "🥔", label: "Patate", description: "C'est une patate", category: "Fun" },
  clown2: { emoji: "🤡", label: "Clown", description: "On est tous des clowns", category: "Fun" },
  brainrot: { emoji: "🧠", label: "Brainrot", description: "Cerveau en compote", category: "Fun" },
  sigma: {
    emoji: "🗿",
    label: "Sigma",
    description: "Sigma grindset",
    category: "Fun",
    rarity: "rare",
  },
  gigachad: {
    emoji: "💪",
    label: "GigaChad",
    description: "Le vrai Chad",
    category: "Fun",
    rarity: "epic",
  },
  // ─── Tech+ ───
  fullstack: {
    emoji: "🧩",
    label: "Full Stack",
    description: "Maîtrise front et back",
    category: "Tech",
    rarity: "rare",
  },
  backend: {
    emoji: "⚙️",
    label: "Backend",
    description: "L'ombre derrière l'app",
    category: "Tech",
  },
  frontend: {
    emoji: "🖼️",
    label: "Frontend",
    description: "L'interface avant tout",
    category: "Tech",
  },
  devops: {
    emoji: "🔄",
    label: "DevOps",
    description: "Automatise tout",
    category: "Tech",
    rarity: "uncommon",
  },
  gamedev: { emoji: "🕹️", label: "Game Dev", description: "Crée des jeux", category: "Tech" },
  modder: {
    emoji: "🔧",
    label: "Moddeur",
    description: "Modifie tout ce qu'il touche",
    category: "Tech",
  },
  // ─── Lifestyle+ ───
  gamer_chair: {
    emoji: "🪑",
    label: "Gamer Chair",
    description: "Vie dessus",
    category: "Lifestyle",
  },
  headphones: {
    emoji: "🎧",
    label: "Casque Audio",
    description: "Ne vit pas sans",
    category: "Lifestyle",
  },
  mechanical: {
    emoji: "⌨️",
    label: "Clavier Mécanique",
    description: "Click click click",
    category: "Tech",
  },
  multimonitor: {
    emoji: "🖥️",
    label: "Multi-Moniteur",
    description: "2 écrans minimum",
    category: "Tech",
  },
};

const MAX_BADGES = 10;
const MAX_BIO_LENGTH = 500;
const MAX_TITLE_LENGTH = 50;

// ─── Commande ──────────────────────────────────────────────────────────────────

export const commands = [
  new SlashCommandBuilder()
    .setName("profile")
    .setDescription("Gère ton profil personnalisé (bio, couleur, badges, titre)")
    .addSubcommand((sc) =>
      sc
        .setName("view")
        .setDescription("Affiche ton profil ou celui d'un autre membre")
        .addUserOption((o) =>
          o.setName("utilisateur").setDescription("Profil à afficher").setRequired(false),
        ),
    )
    .addSubcommand((sc) =>
      sc
        .setName("bio")
        .setDescription("Définis ta biographie")
        .addStringOption((o) =>
          o
            .setName("texte")
            .setDescription("Ta bio (max 500 caractères)")
            .setRequired(true)
            .setMaxLength(MAX_BIO_LENGTH),
        ),
    )
    .addSubcommand((sc) =>
      sc
        .setName("color")
        .setDescription("Définis la couleur de ton profil")
        .addStringOption((o) =>
          o
            .setName("couleur")
            .setDescription("Code hex sans # (ex: 5865f2) ou couleur prédéfinie")
            .setRequired(true)
            .addChoices(
              { name: "🔵 Bleu Discord", value: "5865f2" },
              { name: "🟢 Vert", value: "57f287" },
              { name: "🔴 Rouge", value: "ed4245" },
              { name: "🟡 Jaune", value: "fee75c" },
              { name: "🟣 Violet", value: "9b59b6" },
              { name: "🟠 Orange", value: "e67e22" },
              { name: "🌸 Rose", value: "eb459e" },
              { name: "⚪ Blanc", value: "ffffff" },
              { name: "⚫ Noir", value: "2f3136" },
              { name: "🟤 Marron", value: "8b4513" },
              { name: "🩵 Cyan", value: "1abc9c" },
              { name: "🩷 Magenta", value: "e91e63" },
            ),
        ),
    )
    .addSubcommand((sc) =>
      sc
        .setName("title")
        .setDescription("Définis ton titre personnalisé")
        .addStringOption((o) =>
          o
            .setName("titre")
            .setDescription("Ton titre (max 50 caractères)")
            .setRequired(true)
            .setMaxLength(MAX_TITLE_LENGTH),
        ),
    )
    .addSubcommand((sc) =>
      sc
        .setName("badges")
        .setDescription("Gère tes badges")
        .addStringOption((o) =>
          o
            .setName("action")
            .setDescription("Action sur les badges")
            .setRequired(true)
            .addChoices(
              { name: "📋 Lister les badges disponibles", value: "list" },
              { name: "➕ Ajouter un badge", value: "add" },
              { name: "➖ Retirer un badge", value: "remove" },
              { name: "🗑️ Réinitialiser mes badges", value: "clear" },
            ),
        )
        .addStringOption((o) =>
          o
            .setName("badge")
            .setDescription("Tape le nom du badge à ajouter/retirer (recherche automatique)")
            .setRequired(false)
            .setAutocomplete(true),
        ),
    )
    .addSubcommand((sc) =>
      sc.setName("reset").setDescription("Réinitialise entièrement ton profil"),
    )
    .toJSON(),
];

// ─── Handler ───────────────────────────────────────────────────────────────────

export async function handleCommand(interaction: ChatInputCommandInteraction) {
  const sub = interaction.options.getSubcommand();
  const userId = interaction.user.id;

  try {
    switch (sub) {
      case "view":
        await handleView(interaction);
        break;
      case "bio":
        await handleBio(interaction, userId);
        break;
      case "color":
        await handleColor(interaction, userId);
        break;
      case "title":
        await handleTitle(interaction, userId);
        break;
      case "badges":
        await handleBadges(interaction, userId);
        break;
      case "reset":
        await handleReset(interaction, userId);
        break;
    }
  } catch (error) {
    logger.error("[Profile] Erreur:", error);
    try {
      if (interaction.deferred) {
        await interaction.editReply({ content: "❌ Une erreur est survenue." });
      } else {
        await interaction.reply({
          content: "❌ Une erreur est survenue.",
          flags: [MessageFlags.Ephemeral],
        });
      }
    } catch {}
  }
}

// ─── View ──────────────────────────────────────────────────────────────────────

async function handleView(interaction: ChatInputCommandInteraction) {
  const targetUser = interaction.options.getUser("utilisateur");
  const user: User = targetUser || interaction.user;
  const userId = user.id;

  const profile = await prisma.memberProfile.findUnique({ where: { userId } });

  let badges: string[] = [];
  try {
    badges = profile?.badges ? JSON.parse(profile.badges) : [];
  } catch {
    badges = [];
  }
  const badgeDisplay =
    badges.length > 0
      ? badges
          .map((b) => {
            const def = AVAILABLE_BADGES[b];
            if (!def) return "";
            const rarityIcon = def.rarity ? RARITY_INFO[def.rarity].icon : "";
            return `${rarityIcon}${def.emoji}`;
          })
          .filter(Boolean)
          .join(" ")
      : "Aucun badge";

  const color = parseInt(profile?.color || "2f3136", 16);

  const member = await interaction.guild?.members.fetch(userId).catch(() => null);
  const displayName = member?.displayName || user.username;
  const title = profile?.title || "Membre";

  const embed = new EmbedBuilder()
    .setColor(color)
    .setTitle(`${displayName}`)
    .setThumbnail(user.displayAvatarURL({ size: 256 }))
    .addFields(
      { name: "🏷️ Titre", value: title, inline: true },
      { name: "🎖️ Badges", value: badgeDisplay, inline: true },
    );

  if (profile?.bio) {
    embed.setDescription(profile.bio);
  } else {
    embed.setDescription("*Aucune bio définie. Utilise `/profile bio` pour en ajouter une.*");
  }

  embed.addFields({
    name: "📅 Compte créé le",
    value: `<t:${Math.floor(user.createdTimestamp / 1000)}:R>`,
    inline: true,
  });

  if (member?.joinedTimestamp) {
    embed.addFields({
      name: "📥 A rejoint le",
      value: `<t:${Math.floor(member.joinedTimestamp / 1000)}:R>`,
      inline: true,
    });
  }

  embed.setFooter({ text: `Profil de ${user.tag}` }).setTimestamp();

  // Si l'utilisateur a des badges avec images, créer un embed séparé
  const imageBadges = badges.map((b) => AVAILABLE_BADGES[b]).filter((b) => b?.imageUrl);

  const embeds: EmbedBuilder[] = [embed];

  if (imageBadges.length > 0) {
    const badgeImagesEmbed = new EmbedBuilder()
      .setColor(color)
      .setTitle("🎖️ Badges du profil")
      .setDescription(
        imageBadges
          .map((b) => {
            const rarityIcon = b.rarity ? RARITY_INFO[b.rarity].icon : "";
            return `${rarityIcon} **${b.label}** — ${b.description}`;
          })
          .join("\n"),
      );

    // Utiliser la première image de badge comme image de l'embed
    if (imageBadges[0]?.imageUrl) {
      badgeImagesEmbed.setThumbnail(imageBadges[0].imageUrl);
    }

    // Si plusieurs badges avec images, les afficher comme champs
    if (imageBadges.length > 1) {
      for (const b of imageBadges.slice(1, 4)) {
        if (b.imageUrl) {
          badgeImagesEmbed.addFields({
            name: `${b.emoji} ${b.label}`,
            value: `[Image](${b.imageUrl})`,
            inline: true,
          });
        }
      }
    }

    embeds.push(badgeImagesEmbed);
  }

  await interaction.reply({ embeds });
}

// ─── Bio ───────────────────────────────────────────────────────────────────────

async function handleBio(interaction: ChatInputCommandInteraction, userId: string) {
  const bio = interaction.options.getString("texte", true);

  await prisma.memberProfile.upsert({
    where: { userId },
    update: { bio },
    create: { userId, bio },
  });

  await interaction.reply({
    content: `✅ Bio mise à jour ! (${bio.length} caractères)`,
    flags: [MessageFlags.Ephemeral],
  });
  logger.info(`[Profile] Bio updated by ${interaction.user.tag}`);
}

// ─── Color ─────────────────────────────────────────────────────────────────────

async function handleColor(interaction: ChatInputCommandInteraction, userId: string) {
  const color = interaction.options.getString("couleur", true);

  // Valider le format hex
  if (!/^[0-9a-fA-F]{6}$/.test(color)) {
    await interaction.reply({
      content: "❌ Couleur invalide. Utilise un code hex à 6 chiffres (ex: 5865f2).",
      flags: [MessageFlags.Ephemeral],
    });
    return;
  }

  await prisma.memberProfile.upsert({
    where: { userId },
    update: { color },
    create: { userId, color },
  });

  await interaction.reply({
    content: `✅ Couleur du profil définie sur **#${color}** !`,
    flags: [MessageFlags.Ephemeral],
  });
  logger.info(`[Profile] Color updated by ${interaction.user.tag} → #${color}`);
}

// ─── Title ──────────────────────────────────────────────────────────────────────

async function handleTitle(interaction: ChatInputCommandInteraction, userId: string) {
  const title = interaction.options.getString("titre", true);

  await prisma.memberProfile.upsert({
    where: { userId },
    update: { title },
    create: { userId, title },
  });

  await interaction.reply({
    content: `✅ Titre défini sur **${title}** !`,
    flags: [MessageFlags.Ephemeral],
  });
  logger.info(`[Profile] Title updated by ${interaction.user.tag} → "${title}"`);
}

// ─── Badges ────────────────────────────────────────────────────────────────────

async function handleBadges(interaction: ChatInputCommandInteraction, userId: string) {
  const action = interaction.options.getString("action", true);
  const badgeKey = interaction.options.getString("badge");

  if (action === "list") {
    const profile = await prisma.memberProfile.findUnique({ where: { userId } });
    let currentBadges: string[] = [];
    try {
      currentBadges = profile?.badges ? JSON.parse(profile.badges) : [];
    } catch {
      currentBadges = [];
    }

    // Grouper par catégorie
    const categories: Record<string, [string, BadgeDef][]> = {};
    for (const [key, b] of Object.entries(AVAILABLE_BADGES)) {
      const cat = b.category || "Divers";
      if (!categories[cat]) categories[cat] = [];
      categories[cat].push([key, b]);
    }

    const catNames = Object.keys(categories);
    let page = 0;

    const buildEmbed = (pageNum: number) => {
      const catName = catNames[pageNum];
      const items = categories[catName];

      const lines = items
        .map(([key, b]) => {
          const owned = currentBadges.includes(key);
          const rarityIcon = b.rarity ? RARITY_INFO[b.rarity].icon : "";
          const lockIcon = b.unlockLevel ? " 🔒" : "";
          return `${rarityIcon}${b.emoji} **${b.label}** — ${b.description}${lockIcon} ${owned ? "✅" : ""}`;
        })
        .join("\n");

      const rarityBadge = items.find(([, b]) => b.rarity)?.[1];
      const color = rarityBadge?.rarity ? RARITY_INFO[rarityBadge.rarity].color : 0x5865f2;

      return new EmbedBuilder()
        .setTitle(`🎖️ Badges — ${catName}`)
        .setColor(color)
        .setDescription(lines)
        .addFields(
          {
            name: "Tes badges",
            value:
              currentBadges.length > 0
                ? currentBadges
                    .map((b) => {
                      const def = AVAILABLE_BADGES[b];
                      if (!def) return "";
                      const r = def.rarity ? RARITY_INFO[def.rarity].icon : "";
                      return `${r}${def.emoji}`;
                    })
                    .join(" ")
                : "Aucun",
            inline: true,
          },
          { name: "Maximum", value: `${MAX_BADGES} badges`, inline: true },
          { name: "Catégorie", value: `${pageNum + 1}/${catNames.length}`, inline: true },
        )
        .setFooter({
          text: "⚪ Common 🟢 Uncommon 🔵 Rare 🟣 Epic 🟡 Legendary 🔴 Mythic | 🔒 = Niveau requis",
        });
    };

    const buildButtons = (pageNum: number) => {
      return new ActionRowBuilder<ButtonBuilder>().addComponents(
        new ButtonBuilder()
          .setCustomId("badge_prev")
          .setLabel("◀️ Précédent")
          .setStyle(ButtonStyle.Secondary)
          .setDisabled(pageNum === 0),
        new ButtonBuilder()
          .setCustomId("badge_next")
          .setLabel("Suivant ▶️")
          .setStyle(ButtonStyle.Secondary)
          .setDisabled(pageNum === catNames.length - 1),
        new ButtonBuilder()
          .setCustomId("badge_first")
          .setLabel("⏮️ Début")
          .setStyle(ButtonStyle.Secondary)
          .setDisabled(pageNum === 0),
        new ButtonBuilder()
          .setCustomId("badge_last")
          .setLabel("⏭️ Fin")
          .setStyle(ButtonStyle.Secondary)
          .setDisabled(pageNum === catNames.length - 1),
      );
    };

    await interaction.reply({
      embeds: [buildEmbed(page)],
      components: [buildButtons(page)],
      flags: [MessageFlags.Ephemeral],
    });

    const response = await interaction.fetchReply();

    const collector = response.createMessageComponentCollector<ComponentType.Button>({
      time: 120_000,
    });

    collector.on("collect", async (btn: ButtonInteraction) => {
      if (btn.user.id !== interaction.user.id) {
        await btn.reply({ content: "❌ Pas ton menu.", flags: [MessageFlags.Ephemeral] });
        return;
      }

      if (btn.customId === "badge_prev") page = Math.max(0, page - 1);
      else if (btn.customId === "badge_next") page = Math.min(catNames.length - 1, page + 1);
      else if (btn.customId === "badge_first") page = 0;
      else if (btn.customId === "badge_last") page = catNames.length - 1;

      await btn.update({
        embeds: [buildEmbed(page)],
        components: [buildButtons(page)],
      });
    });

    collector.on("end", async () => {
      try {
        await interaction.editReply({ components: [] });
      } catch {}
    });

    return;
  }

  if (action === "clear") {
    await prisma.memberProfile.upsert({
      where: { userId },
      update: { badges: "[]" },
      create: { userId, badges: "[]" },
    });

    await interaction.reply({
      content: "✅ Tous tes badges ont été retirés.",
      flags: [MessageFlags.Ephemeral],
    });
    return;
  }

  if (!badgeKey) {
    await interaction.reply({
      content: "❌ Spécifie un badge à ajouter/retirer.",
      flags: [MessageFlags.Ephemeral],
    });
    return;
  }

  const profile = await prisma.memberProfile.findUnique({ where: { userId } });
  let badges: string[] = [];
  try {
    badges = profile?.badges ? JSON.parse(profile.badges) : [];
  } catch {
    badges = [];
  }

  if (action === "add") {
    if (badges.includes(badgeKey)) {
      await interaction.reply({
        content: "❌ Tu as déjà ce badge.",
        flags: [MessageFlags.Ephemeral],
      });
      return;
    }
    if (badges.length >= MAX_BADGES) {
      await interaction.reply({
        content: `❌ Tu as déjà ${MAX_BADGES} badges (maximum). Retire-en un d'abord.`,
        flags: [MessageFlags.Ephemeral],
      });
      return;
    }
    badges.push(badgeKey);
    await prisma.memberProfile.upsert({
      where: { userId },
      update: { badges: JSON.stringify(badges) },
      create: { userId, badges: JSON.stringify(badges) },
    });

    const badge = AVAILABLE_BADGES[badgeKey];
    await interaction.reply({
      content: `✅ Badge ${badge.emoji} **${badge.label}** ajouté !`,
      flags: [MessageFlags.Ephemeral],
    });
  } else if (action === "remove") {
    if (!badges.includes(badgeKey)) {
      await interaction.reply({
        content: "❌ Tu n'as pas ce badge.",
        flags: [MessageFlags.Ephemeral],
      });
      return;
    }
    badges = badges.filter((b) => b !== badgeKey);
    await prisma.memberProfile.upsert({
      where: { userId },
      update: { badges: JSON.stringify(badges) },
      create: { userId, badges: JSON.stringify(badges) },
    });

    const badge = AVAILABLE_BADGES[badgeKey];
    await interaction.reply({
      content: `✅ Badge ${badge.emoji} **${badge.label}** retiré.`,
      flags: [MessageFlags.Ephemeral],
    });
  }
}

// ─── Reset ──────────────────────────────────────────────────────────────────────

async function handleReset(interaction: ChatInputCommandInteraction, userId: string) {
  await prisma.memberProfile.deleteMany({ where: { userId } });

  await interaction.reply({
    content: "✅ Ton profil a été entièrement réinitialisé.",
    flags: [MessageFlags.Ephemeral],
  });
  logger.info(`[Profile] Reset by ${interaction.user.tag}`);
}

// ─── Autocomplete ──────────────────────────────────────────────────────────────

export async function handleAutocomplete(interaction: AutocompleteInteraction): Promise<void> {
  const focused = interaction.options.getFocused(false) as string;
  const query = focused.toLowerCase().trim();

  // Construire la liste des badges avec catégorie dans le nom pour le regroupement
  const allBadges = Object.entries(AVAILABLE_BADGES).map(([key, b]) => {
    const cat = b.category || "Divers";
    const rarityIcon = b.rarity ? RARITY_INFO[b.rarity].icon : "";
    return {
      name: `[${cat}] ${rarityIcon}${b.emoji} ${b.label}`,
      value: key,
      searchStr: `${cat} ${b.label} ${b.description} ${b.emoji}`.toLowerCase(),
    };
  });

  // Filtrer selon la recherche
  let filtered = query ? allBadges.filter((b) => b.searchStr.includes(query)) : allBadges;

  // Discord limite à 25 résultats
  filtered = filtered.slice(0, 25);

  await interaction.respond(filtered.map((b) => ({ name: b.name.slice(0, 100), value: b.value })));
}
