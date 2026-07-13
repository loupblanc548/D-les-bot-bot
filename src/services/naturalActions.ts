/**
 * naturalActions.ts — Détecte et exécute des actions en langage naturel
 * quand le bot est @mentionné.
 *
 * Exemples:
 * - "@bot rejoins le vocal" → join voice channel
 * - "@bot quitte le vocal" → leave voice channel
 * - "@bot dis bonjour à @user" → TTS greeting
 * - "@bot joue de la musique" → play music
 * - "@bot met le skin Renegade Raider" → set fortnite skin
 */

import { Message, GuildMember, VoiceBasedChannel, TextChannel } from "discord.js";
import { getVoiceConnection, VoiceConnectionStatus } from "@discordjs/voice";
import logger from "../utils/logger.js";
import { announceInVoice, findActiveVoiceChannel } from "./voiceAnnouncer.js";

export interface ActionResult {
  handled: boolean;
  response?: string;
}

interface ActionPattern {
  keywords: string[];
  exclude?: string[];
  execute: (message: Message, matchedText: string) => Promise<ActionResult>;
}

// ─── Patterns d'actions ─────────────────────────────────────────────────────

const actionPatterns: ActionPattern[] = [
  // ─── Rejoindre un vocal ──────────────────────────────────────────────────
  {
    keywords: [
      "rejoins",
      "rejoint",
      "rejoindre",
      "rejoins le vocal",
      "rejoins le salon",
      "viens dans le vocal",
      "viens en vocal",
      "viens dans mon vocal",
      "viens me rejoindre",
      "viens",
      "connecte",
      "connecte-toi",
      "connecte toi",
      "connecte au vocal",
      "join",
      "join vocal",
      "join le vocal",
      "join the voice",
      "viens ici",
      "viens voir",
      "rejoins moi",
      "rejoins-nous",
      "rejoins nous",
      "viens jouer",
      "viens avec moi",
      "connecte-toi au vocal",
      "hop viens",
      "viens chanter",
      "viens parler",
      "rejoins le chan",
      "rejoins le voice",
      "go vocal",
      "go viens",
      "viens go",
    ],
    exclude: [
      "quitte",
      "part",
      "déconnecte",
      "deconnecte",
      "leave",
      "stop",
      "sors",
      "pars",
      "va-t-en",
      "va t en",
    ],
    execute: async (message) => {
      const member = message.member as GuildMember | null;
      if (!member) return { handled: false };

      let targetChannel: VoiceBasedChannel | null = null;

      // Si l'utilisateur est en vocal, rejoindre son salon
      if (member.voice?.channel) {
        targetChannel = member.voice.channel;
      } else {
        // Sinon, chercher un vocal actif dans la guilde
        if (message.client && message.guild) {
          targetChannel = findActiveVoiceChannel(message.guild.id, message.client);
        }
      }

      if (!targetChannel) {
        return {
          handled: true,
          response:
            "Tu n'es pas dans un salon vocal et j'en trouve aucun d'actif. Connecte-toi d'abord à un vocal et je te rejoins ! 🎧",
        };
      }

      // Rejoindre le vocal
      const { joinVoiceChannel } = await import("@discordjs/voice");
      try {
        const existing = getVoiceConnection(message.guild!.id);
        if (existing && existing.state.status !== VoiceConnectionStatus.Destroyed) {
          // Déjà connecté, vérifier si c'est le même salon
          return {
            handled: true,
            response: `Je suis déjà dans un salon vocal ! 🎵`,
          };
        }

        joinVoiceChannel({
          channelId: targetChannel.id,
          guildId: message.guild!.id,
          adapterCreator: message.guild!.voiceAdapterCreator,
        });

        logger.info(
          `[NaturalActions] Bot a rejoint #${targetChannel.name} sur ${message.guild!.name}`,
        );
        return {
          handled: true,
          response: `Me voilà dans **${targetChannel.name}** ! 🎧 Qu'est-ce qu'on fait ?`,
        };
      } catch (err) {
        logger.error(`[NaturalActions] Erreur join vocal: ${err}`);
        return { handled: true, response: "Impossible de rejoindre le vocal pour le moment. 😕" };
      }
    },
  },

  // ─── Quitter un vocal ────────────────────────────────────────────────────
  {
    keywords: [
      "quitte le vocal",
      "quitte le salon",
      "quitte",
      "quitter le vocal",
      "déconnecte",
      "deconnecte",
      "déconnecte-toi",
      "deconnecte toi",
      "déconnexion",
      "deconnexion",
      "disconnect",
      "sors du vocal",
      "sors",
      "sors de là",
      "sors d'ici",
      "part du vocal",
      "pars",
      "partir",
      "part d'ici",
      "leave",
      "leave vocal",
      "leave the voice",
      "leave channel",
      "va-t-en",
      "va t en",
      "va-t-en du vocal",
      "casse-toi",
      "casse toi",
      "dégage",
      "degage",
      "dégage du vocal",
      "degage du vocal",
      "stop vocal",
      "coupe le vocal",
      "ferme le vocal",
      "au revoir vocal",
      "bye vocal",
      "salut vocal",
      "je te libère",
      "je te libere",
      "tu peux partir",
      "tu peux sortir",
      "tu peux déconnecter",
      "tu peux deconnecter",
    ],
    execute: async (message) => {
      if (!message.guild) return { handled: false };

      const connection = getVoiceConnection(message.guild.id);
      if (!connection || connection.state.status === VoiceConnectionStatus.Destroyed) {
        return { handled: true, response: "Je ne suis dans aucun salon vocal. 🤷" };
      }

      connection.destroy();
      logger.info(`[NaturalActions] Bot a quitté le vocal sur ${message.guild.name}`);
      return { handled: true, response: "Salut, je m'en vais ! 👋" };
    },
  },

  // ─── Parler en vocal (TTS) ───────────────────────────────────────────────
  {
    keywords: [
      "dis",
      "parle",
      "récite",
      "recite",
      "dis à voix haute",
      "lit",
      "prononce",
      "lis-le",
      "lis le",
      "lis à voix haute",
      "read it",
      "read",
      "dis-le",
      "dis le",
      "repete",
      "répète",
      "repete ça",
      "répète ça",
      "récite-le",
      "recite le",
      "à voix haute",
      "a voix haute",
      "speak",
      "say",
      "vocalise",
      "vocalise ça",
      "dis-moi",
      "dis moi",
      "parle-moi",
      "parle moi",
      "récite-moi",
      "recite moi",
      "prononce-le",
      "prononce le",
      "annonce",
      "annonce-le",
      "annonce le",
      "crie",
      "crie-le",
      "crie le",
      "chuchote",
      "chuchote-le",
      "murmure",
      "murmure-le",
      "dis fort",
    ],
    exclude: ["ne dis pas", "ne parle pas", "ne dit pas", "ne récite pas", "ne prononce pas"],
    execute: async (message, matchedText) => {
      const member = message.member as GuildMember | null;
      if (!member) return { handled: false };

      // Extraire le texte à dire (tout après le mot clé)
      let textToSay = matchedText
        .replace(
          /^(?:@?\w+\s+)?(?:dis(?:-le|-moi)?|parle(?:-moi)?|r[ée]cite(?:-le|-moi)?|dis [àa] voix haute|lit|prononce(?:-le)?|annonce(?:-le)?|lis(?:-le)? [àa] voix haute|read(?: it)?|r[ée]p[èe]te(?: [çc]a)?|[àa] voix haute|speak|say|vocalise(?: [çc]a)?|crie(?:-le)?|chuchote(?:-le)?|murmure(?:-le)?|dis fort)\s+/i,
          "",
        )
        .trim();

      if (!textToSay || textToSay.length < 2) {
        return {
          handled: true,
          response: "Dis-moi quoi dire ! Exemple: @bot dis bonjour tout le monde",
        };
      }

      // Nettoyer les mentions dans le texte
      textToSay = textToSay
        .replace(/<@!?\d+>/g, "")
        .replace(/<#\d+>/g, "")
        .trim();

      if (!member.voice?.channel) {
        return {
          handled: true,
          response:
            "Tu n'es pas dans un salon vocal ! Connecte-toi et je te dirai ça à voix haute. 🎤",
        };
      }

      const ok = await announceInVoice(member, textToSay);
      if (ok) {
        return {
          handled: true,
          response: `🎤 *${textToSay.slice(0, 100)}* — dit à voix haute dans **${member.voice.channel.name}**`,
        };
      }
      return { handled: true, response: "Impossible de générer l'audio pour le moment. 😕" };
    },
  },

  // ─── Mettre un skin Fortnite ─────────────────────────────────────────────
  {
    keywords: [
      "mets le skin",
      "met le skin",
      "change de skin",
      "mets skin",
      "met skin",
      "équipe le skin",
      "equipe le skin",
      "porte le skin",
      "mets la skin",
      "change le skin",
      "change skin",
      "swap skin",
      "switch skin",
      "mets-toi le skin",
      "met toi le skin",
      "mets toi le skin",
      "équipe-toi du skin",
      "equipe toi du skin",
      "mets l'outfit",
      "met l'outfit",
      "change l'outfit",
      "mets le perso",
      "met le perso",
      "change de perso",
      "change perso",
      "mets le personnage",
      "met le personnage",
      "mets le costume",
      "met le costume",
      "change de costume",
      "deviens",
      "transforme-toi en",
      "transforme toi en",
      "mets-toi en",
      "met toi en",
      "mets toi en",
      "skin",
      "outfit",
      "perso",
      "set skin",
      "set outfit",
      "wear skin",
      "mets le cosmetic",
      "met le cosmetic",
    ],
    exclude: [
      "mets le backbling",
      "met le backbling",
      "mets le pickaxe",
      "met le pickaxe",
      "mets le niveau",
      "met le niveau",
    ],
    execute: async (message, matchedText) => {
      const skinName = matchedText
        .replace(
          /^(?:@?\w+\s+)?(?:mets le skin|met le skin|change de skin|mets skin|met skin|équipe le skin|equipe le skin|porte le skin|mets la skin|change le skin|change skin|swap skin|switch skin|mets-toi le skin|met toi le skin|mets toi le skin|équipe-toi du skin|equipe toi du skin|mets l'outfit|met l'outfit|change l'outfit|mets le perso|met le perso|change de perso|change perso|mets le personnage|met le personnage|mets le costume|met le costume|change de costume|deviens|transforme-toi en|transforme toi en|mets-toi en|met toi en|mets toi en|skin|outfit|perso|set skin|set outfit|wear skin|mets le cosmetic|met le cosmetic)\s+/i,
          "",
        )
        .replace(
          /^(?:@?\w+\s+)?(?:mets|met|change|équipe|equipe|porte|deviens|transforme|set|wear)\s+(?:le\s+)?(?:skin|outfit|perso|personnage|costume|cosmetic)\s+/i,
          "",
        )
        .trim();

      if (!skinName || skinName.length < 2) {
        return {
          handled: true,
          response: "Quel skin tu veux que je mette ? Exemple: @bot mets le skin Renegade Raider",
        };
      }

      try {
        const { isFortniteBotReady, setBotSkin } = await import("./fortnitePartyBot.js");
        if (!isFortniteBotReady()) {
          return {
            handled: true,
            response:
              "Je ne suis pas connecté à Fortnite ! Utilise `/game bot-login` d'abord pour me connecter. 🎮",
          };
        }

        const { getCosmeticByName } = await import("./fortnite-cosmetics.js");
        const cosmetic = await getCosmeticByName(skinName);
        if (!cosmetic) {
          return {
            handled: true,
            response: `Je ne trouve pas le skin "${skinName}". Vérifie l'orthographe ! 🔍`,
          };
        }

        await setBotSkin(cosmetic.id);
        logger.info(
          `[NaturalActions] Skin "${cosmetic.name}" appliqué via @mention par ${message.author.tag}`,
        );
        return {
          handled: true,
          response: `Skin **${cosmetic.name}** équipé ! ✅ (${cosmetic.rarity?.displayValue || "rareté inconnue"})`,
        };
      } catch (err) {
        logger.error(`[NaturalActions] Erreur skin: ${err}`);
        return { handled: true, response: "Impossible de changer le skin pour le moment. 😕" };
      }
    },
  },

  // ─── Faire une emote Fortnite ────────────────────────────────────────────
  {
    keywords: [
      "fais l'emote",
      "fait l'emote",
      "mets l'emote",
      "met l'emote",
      "joue l'emote",
      "danse",
      "emote",
      "fais la danse",
      "fait la danse",
      "fais une danse",
      "fait une danse",
      "mets la danse",
      "met la danse",
      "fais-toi l'emote",
      "fais toi l'emote",
      "équipe l'emote",
      "equipe l'emote",
      "joue la danse",
      "joue une danse",
      "fais le dance",
      "fait le dance",
      "dance",
      "emote",
      "emote dance",
      "fais l'emote dance",
      "set emote",
      "set dance",
      "play emote",
      "play dance",
      "bouge-toi",
      "bouge toi",
      "fais bouger",
      "fais le move",
      "fait le move",
      "move",
      "fais le geste",
      "fait le geste",
    ],
    exclude: [
      "ne fais pas",
      "ne met pas",
      "arrête l'emote",
      "arrete l'emote",
      "stop emote",
      "arrête de danser",
      "stop danse",
    ],
    execute: async (message, matchedText) => {
      const emoteName = matchedText
        .replace(
          /^(?:@?\w+\s+)?(?:fais l'emote|fait l'emote|mets l'emote|met l'emote|joue l'emote|danse|emote|fais la danse|fait la danse|fais une danse|fait une danse|mets la danse|met la danse|fais-toi l'emote|fais toi l'emote|équipe l'emote|equipe l'emote|joue la danse|joue une danse|fais le dance|fait le dance|dance|emote dance|fais l'emote dance|set emote|set dance|play emote|play dance|bouge-toi|bouge toi|fais bouger|fais le move|fait le move|move|fais le geste|fait le geste)\s+/i,
          "",
        )
        .replace(
          /^(?:@?\w+\s+)?(?:fais|fait|mets|met|joue|équipe|equipe|set|play|bouge)\s+(?:l')?(?:emote|danse|dance|move|geste)\s+/i,
          "",
        )
        .trim();

      if (!emoteName || emoteName.length < 2) {
        return {
          handled: true,
          response: "Quelle emote tu veux que je fasse ? Exemple: @bot fais l'emote Floss",
        };
      }

      try {
        const { isFortniteBotReady, setBotEmote } = await import("./fortnitePartyBot.js");
        if (!isFortniteBotReady()) {
          return {
            handled: true,
            response: "Je ne suis pas connecté à Fortnite ! Utilise `/game bot-login` d'abord. 🎮",
          };
        }

        const { getCosmeticByName } = await import("./fortnite-cosmetics.js");
        const cosmetic = await getCosmeticByName(emoteName);
        if (!cosmetic) {
          return { handled: true, response: `Je ne trouve pas l'emote "${emoteName}". 🔍` };
        }

        await setBotEmote(cosmetic.id);
        logger.info(
          `[NaturalActions] Emote "${cosmetic.name}" appliquée via @mention par ${message.author.tag}`,
        );
        return { handled: true, response: `Emote **${cosmetic.name}** en cours ! 💃` };
      } catch (err) {
        logger.error(`[NaturalActions] Erreur emote: ${err}`);
        return { handled: true, response: "Impossible de faire l'emote pour le moment. 😕" };
      }
    },
  },

  // ─── Arrêter l'emote ─────────────────────────────────────────────────────
  {
    keywords: [
      "arrête l'emote",
      "arrete l'emote",
      "stop emote",
      "arrête de danser",
      "arrete de danser",
      "stop danse",
      "arrête l'emote",
      "annule l'emote",
      "annule l'emote",
      "arrête la danse",
      "arrete la danse",
      "stop la danse",
      "stop dance",
      "arrête le dance",
      "arrete le dance",
      "stop l'emote",
      "arrête de bouger",
      "arrete de bouger",
      "stop bouger",
      "finis l'emote",
      "fini l'emote",
      "termine l'emote",
      "coupe l'emote",
      "coupe la danse",
      "plus d'emote",
      "plus de danse",
      "stop move",
      "arrête le move",
      "arrete le move",
      "stop le geste",
      "arrête le geste",
      "arrete le geste",
      "emote off",
      "dance off",
      "stop dancing",
      "arrête dancing",
    ],
    execute: async (_message) => {
      try {
        const { isFortniteBotReady, clearBotEmote } = await import("./fortnitePartyBot.js");
        if (!isFortniteBotReady()) {
          return { handled: true, response: "Je ne suis pas connecté à Fortnite. 🎮" };
        }
        await clearBotEmote();
        return { handled: true, response: "Emote arrêtée ! 🛑" };
      } catch {
        return { handled: true, response: "Impossible d'arrêter l'emote. 😕" };
      }
    },
  },

  // ─── Statut Fortnite ─────────────────────────────────────────────────────
  {
    keywords: [
      "statut fortnite",
      "es-tu connecté fortnite",
      "tu es connecté",
      "t'es connecté",
      "statut bot fortnite",
      "es-tu sur fortnite",
      "t'es sur fortnite",
      "tu es sur fortnite",
      "tu es dans fortnite",
      "t'es dans fortnite",
      "es-tu co fortnite",
      "t'es co fortnite",
      "tu es co fortnite",
      "es-tu connecté à fortnite",
      "es-tu connecté a fortnite",
      "t'es connecté à fortnite",
      "t'es connecté a fortnite",
      "tu es connecté à fortnite",
      "tu es connecté a fortnite",
      "statut fn",
      "status fortnite",
      "status fn",
      "statut",
      "quel est le statut",
      "c'est quoi ton statut",
      "tu joue à fortnite",
      "tu joues à fortnite",
      "tu joue a fortnite",
      "t'es en game",
      "tu es en game",
      "t'es en partie",
      "tu es en partie",
      "es-tu en game",
      "es-tu en partie",
      "t'es loggé",
      "tu es loggé",
      "es-tu loggé",
      "es-tu logged",
      "t'es logged",
      "tu es logged",
      "tu tourne fortnite",
      "tu tournes fortnite",
      "connexion fortnite",
      "connexion fn",
      "online fortnite",
      "offline fortnite",
      "es-tu online fortnite",
      "t'es online fortnite",
      "tu es online fortnite",
      "fortnite status",
      "fn status",
    ],
    execute: async (_message) => {
      try {
        const { isFortniteBotReady, getBotDisplayName } = await import("./fortnitePartyBot.js");
        if (isFortniteBotReady()) {
          const name = getBotDisplayName();
          return {
            handled: true,
            response: `Je suis connecté à Fortnite${name ? ` en tant que **${name}**` : ""} ! ✅🎮`,
          };
        }
        return {
          handled: true,
          response:
            "Je ne suis pas connecté à Fortnite. Utilise `/game bot-login` pour me connecter. ❌",
        };
      } catch {
        return { handled: false };
      }
    },
  },

  // ─── Changer le backbling Fortnite ───────────────────────────────────────
  {
    keywords: [
      "mets le backbling",
      "met le backbling",
      "change le backbling",
      "mets backbling",
      "met backbling",
      "équipe le backbling",
      "equipe le backbling",
      "porte le backbling",
      "mets le sac à dos",
      "mets le sac a dos",
      "change de backbling",
      "change backbling",
      "swap backbling",
      "mets-toi le backbling",
      "met toi le backbling",
      "mets toi le backbling",
      "mets le backpack",
      "met le backpack",
      "change le backpack",
      "mets le sac",
      "met le sac",
      "change le sac",
      "équipe-toi du backbling",
      "equipe toi du backbling",
      "set backbling",
      "set backpack",
      "wear backbling",
      "mets le back bling",
      "met le back bling",
    ],
    execute: async (message, matchedText) => {
      const itemName = matchedText
        .replace(
          /^(?:@?\w+\s+)?(?:mets le backbling|met le backbling|change le backbling|mets backbling|met backbling|équipe le backbling|equipe le backbling|porte le backbling|mets le sac à dos)\s+/i,
          "",
        )
        .replace(
          /^(?:@?\w+\s+)?(?:mets|met|change|équipe|equipe|porte)\s+(?:le\s+)?(?:backbling|sac à dos)\s+/i,
          "",
        )
        .trim();

      if (!itemName || itemName.length < 2) {
        return {
          handled: true,
          response: "Quel backbling tu veux que je mette ? Exemple: @bot mets le backbling Galaxy",
        };
      }

      try {
        const { isFortniteBotReady, setBotBackbling } = await import("./fortnitePartyBot.js");
        if (!isFortniteBotReady()) {
          return {
            handled: true,
            response: "Je ne suis pas connecté à Fortnite ! Utilise `/game bot-login` d'abord. 🎮",
          };
        }

        const { getCosmeticByName } = await import("./fortnite-cosmetics.js");
        const cosmetic = await getCosmeticByName(itemName);
        if (!cosmetic) {
          return { handled: true, response: `Je ne trouve pas le backbling "${itemName}". 🔍` };
        }

        await setBotBackbling(cosmetic.id);
        logger.info(
          `[NaturalActions] Backbling "${cosmetic.name}" appliqué via @mention par ${message.author.tag}`,
        );
        return { handled: true, response: `Backbling **${cosmetic.name}** équipé ! 🎒` };
      } catch {
        return { handled: true, response: "Impossible de changer le backbling. 😕" };
      }
    },
  },

  // ─── Changer le pickaxe Fortnite ─────────────────────────────────────────
  {
    keywords: [
      "mets le pickaxe",
      "met le pickaxe",
      "change le pickaxe",
      "mets pickaxe",
      "met pickaxe",
      "équipe le pickaxe",
      "equipe le pickaxe",
      "porte le pickaxe",
      "mets la pioche",
      "met la pioche",
      "change de pickaxe",
      "change pickaxe",
      "swap pickaxe",
      "mets-toi le pickaxe",
      "met toi le pickaxe",
      "mets toi le pickaxe",
      "change la pioche",
      "mets pioche",
      "met pioche",
      "équipe la pioche",
      "equipe la pioche",
      "porte la pioche",
      "set pickaxe",
      "set pioche",
      "wear pickaxe",
      "mets l'outil",
      "met l'outil",
      "change l'outil",
      "mets la hache",
      "met la hache",
      "change la hache",
    ],
    execute: async (message, matchedText) => {
      const itemName = matchedText
        .replace(
          /^(?:@?\w+\s+)?(?:mets le pickaxe|met le pickaxe|change le pickaxe|mets pickaxe|met pickaxe|équipe le pickaxe|equipe le pickaxe|porte le pickaxe|mets la pioche)\s+/i,
          "",
        )
        .replace(
          /^(?:@?\w+\s+)?(?:mets|met|change|équipe|equipe|porte)\s+(?:le\s+)?(?:pickaxe|pioche)\s+/i,
          "",
        )
        .trim();

      if (!itemName || itemName.length < 2) {
        return {
          handled: true,
          response: "Quel pickaxe tu veux que je mette ? Exemple: @bot mets le pickaxe Reaper",
        };
      }

      try {
        const { isFortniteBotReady, setBotPickaxe } = await import("./fortnitePartyBot.js");
        if (!isFortniteBotReady()) {
          return {
            handled: true,
            response: "Je ne suis pas connecté à Fortnite ! Utilise `/game bot-login` d'abord. 🎮",
          };
        }

        const { getCosmeticByName } = await import("./fortnite-cosmetics.js");
        const cosmetic = await getCosmeticByName(itemName);
        if (!cosmetic) {
          return { handled: true, response: `Je ne trouve pas le pickaxe "${itemName}". 🔍` };
        }

        await setBotPickaxe(cosmetic.id);
        logger.info(
          `[NaturalActions] Pickaxe "${cosmetic.name}" appliqué via @mention par ${message.author.tag}`,
        );
        return { handled: true, response: `Pickaxe **${cosmetic.name}** équipé ! ⛏️` };
      } catch {
        return { handled: true, response: "Impossible de changer le pickaxe. 😕" };
      }
    },
  },

  // ─── Définir le niveau Fortnite ──────────────────────────────────────────
  {
    keywords: [
      "mets le niveau",
      "met le niveau",
      "change le niveau",
      "définis le niveau",
      "definis le niveau",
      "set niveau",
      "mets niveau",
      "met niveau",
      "mets-toi le niveau",
      "met toi le niveau",
      "mets toi le niveau",
      "change niveau",
      "set level",
      "mets level",
      "met level",
      "mets le level",
      "met le level",
      "change le level",
      "définis ton niveau",
      "definis ton niveau",
      "mets-toi au niveau",
      "met toi au niveau",
      "passe au niveau",
      "monte au niveau",
      "descends au niveau",
      "mets le battle pass",
      "met le battle pass",
      "mets battle pass",
      "mets le bp",
      "met le bp",
      "change bp",
      "set bp",
      "set battle pass",
    ],
    execute: async (message, matchedText) => {
      const levelMatch = matchedText.match(/(\d+)/);
      if (!levelMatch) {
        return {
          handled: true,
          response: "Quel niveau tu veux que je mette ? Exemple: @bot mets le niveau 100",
        };
      }
      const level = parseInt(levelMatch[1], 10);
      if (level < 1 || level > 1000) {
        return { handled: true, response: "Le niveau doit être entre 1 et 1000." };
      }

      try {
        const { isFortniteBotReady, setBotLevel } = await import("./fortnitePartyBot.js");
        if (!isFortniteBotReady()) {
          return { handled: true, response: "Je ne suis pas connecté à Fortnite ! 🎮" };
        }
        await setBotLevel(level);
        return { handled: true, response: `Niveau défini sur **${level}** ! 📊` };
      } catch {
        return { handled: true, response: "Impossible de changer le niveau. 😕" };
      }
    },
  },

  // ─── Ready/Unready Fortnite ──────────────────────────────────────────────
  {
    keywords: [
      "je suis prêt",
      "je suis pret",
      "marque moi prêt",
      "marque moi pret",
      "ready",
      "prêt fortnite",
      "pret fortnite",
      "mets-toi prêt",
      "met toi pret",
      "mets toi pret",
      "mets-toi pret",
      "prépare-toi",
      "prepare toi",
      "prépare toi",
      "marque-toi prêt",
      "marque toi pret",
      "marque-toi pret",
      "ready up",
      "ready-up",
      "gets ready",
      "get ready",
      "je suis ready",
      "t'es ready",
      "marque ready",
      "mets ready",
      "met ready",
      "passe ready",
      "go ready",
      "prêt à jouer",
      "pret a jouer",
      "prêt pour jouer",
      "pret pour jouer",
      "set ready",
      "become ready",
      "mark ready",
      "prépare-toi pour la partie",
      "prepare toi pour la partie",
      "mets-toi en ready",
      "met toi en ready",
      "je suis chaud",
      "t'es chaud",
      "mets-toi chaud",
      "met toi chaud",
      "go go go",
      "gogogo",
      "let's go",
      "c'est parti",
      "c est parti",
      "en position",
      "prêt à partir",
      "pret a partir",
    ],
    exclude: ["pas prêt", "pas pret", "unready", "not ready", "pas ready"],
    execute: async (_message) => {
      try {
        const { isFortniteBotReady, setBotReady } = await import("./fortnitePartyBot.js");
        if (!isFortniteBotReady()) {
          return { handled: true, response: "Je ne suis pas connecté à Fortnite. 🎮" };
        }
        await setBotReady(true);
        return { handled: true, response: "Marqué comme prêt ! ✅" };
      } catch {
        return { handled: true, response: "Impossible de changer le statut. 😕" };
      }
    },
  },
  {
    keywords: [
      "pas prêt",
      "pas pret",
      "unready",
      "not ready",
      "marque pas prêt",
      "marque pas pret",
      "marque-toi pas prêt",
      "marque toi pas pret",
      "marque-toi pas pret",
      "déprépare-toi",
      "deprepare toi",
      "déprépare toi",
      "pas ready",
      "marque pas ready",
      "mets pas ready",
      "met pas ready",
      "passe pas ready",
      "unready up",
      "not ready up",
      "je suis pas prêt",
      "je suis pas pret",
      "je suis pas ready",
      "enlève ready",
      "enleve ready",
      "retire ready",
      "stop ready",
      "cancel ready",
      "annule ready",
      "pas chaud",
      "plus chaud",
      "refroidis-toi",
      "refroidis toi",
      "attends",
      "pas encore",
      "pas maintenant",
      "set unready",
      "mark unready",
      "become unready",
    ],
    execute: async (_message) => {
      try {
        const { isFortniteBotReady, setBotReady } = await import("./fortnitePartyBot.js");
        if (!isFortniteBotReady()) {
          return { handled: true, response: "Je ne suis pas connecté à Fortnite. 🎮" };
        }
        await setBotReady(false);
        return { handled: true, response: "Marqué comme pas prêt. ⏳" };
      } catch {
        return { handled: true, response: "Impossible de changer le statut. 😕" };
      }
    },
  },

  // ─── Musique : jouer ─────────────────────────────────────────────────────
  {
    keywords: [
      "joue",
      "met la musique",
      "mets la musique",
      "lance la musique",
      "play",
      "musique",
      "chanson",
      "song",
      "joue-moi",
      "joue moi",
      "mets une musique",
      "met une musique",
      "lance un truc",
      "mets un son",
      "met un son",
      "passe la musique",
      "passe la chanson",
      "écoute ça",
      "ecoute ca",
      "écoute-moi ça",
      "ecoute moi ca",
      "mets-moi ça",
      "mets moi ca",
      "met moi ca",
      "play song",
      "play music",
      "start music",
      "lance une musique",
      "lance un son",
      "lance une chanson",
      "mets-moi de la musique",
      "mets moi de la musique",
      "joue-moi de la musique",
      "joue moi de la musique",
      "passe un morceau",
      "mets un morceau",
      "met un morceau",
      "stream ça",
      "stream ca",
      "mets le son",
      "met le son",
      "balance un son",
      "balance une musique",
      "balance la musique",
      "go musique",
      "go music",
      "go play",
    ],
    exclude: [
      "joue l'emote",
      "joue pas",
      "ne joue pas",
      "stop",
      "arrête la musique",
      "coupe la musique",
      "arrete la musique",
      "stop musique",
      "stop la musique",
    ],
    execute: async (message, matchedText) => {
      const songQuery = matchedText
        .replace(
          /^(?:@?\w+\s+)?(?:joue|met la musique|mets la musique|lance la musique|play|musique|chanson|song)\s+/i,
          "",
        )
        .trim();

      if (!songQuery || songQuery.length < 2) {
        return {
          handled: true,
          response:
            "Qu'est-ce que tu veux que je joue ? Exemple: @bot joue Never Gonna Give You Up",
        };
      }

      try {
        const { getDisTube } = await import("./musicService.js");
        const dt = getDisTube();
        if (!dt) {
          return { handled: true, response: "Le service musique n'est pas disponible. 😕" };
        }

        const member = message.member as GuildMember | null;
        if (!member?.voice?.channel) {
          return {
            handled: true,
            response: "Tu dois être dans un salon vocal pour écouter de la musique ! 🎵",
          };
        }

        await dt.play(member.voice.channel, songQuery, {
          member: message.member as GuildMember,
          textChannel: message.channel as TextChannel,
        });

        logger.info(`[NaturalActions] Musique "${songQuery}" demandée par ${message.author.tag}`);
        return { handled: true, response: `🎵 Recherche et lecture de **${songQuery}**...` };
      } catch (err) {
        logger.error(`[NaturalActions] Erreur musique: ${err}`);
        return { handled: true, response: "Impossible de jouer la musique pour le moment. 😕" };
      }
    },
  },

  // ─── Musique : stop ──────────────────────────────────────────────────────
  {
    keywords: [
      "arrête la musique",
      "arrete la musique",
      "stop musique",
      "coupe la musique",
      "stop la musique",
      "éteins la musique",
      "eteins la musique",
      "stop music",
      "stop song",
      "stop playing",
      "arrête de jouer",
      "arrete de jouer",
      "arrête tout",
      "arrete tout",
      "coupe le son",
      "coupe tout",
      "arrete tout",
      "finis la musique",
      "fini la musique",
      "termine la musique",
      "stop ça",
      "stop ca",
      "arrête ça",
      "arrete ca",
      "arrete ça",
      "déconnecte la musique",
      "deconnecte la musique",
      "kill music",
      "kill la musique",
      "destroy music",
      "plus de musique",
      "plus de son",
      "stop le son",
      "silence",
      "ta musique",
      "stop song maintenant",
      "arrête le son",
      "arrete le son",
      "coupe musique",
    ],
    execute: async (message) => {
      try {
        const { getDisTube } = await import("./musicService.js");
        const dt = getDisTube();
        if (!dt) return { handled: true, response: "Service musique indisponible. 😕" };

        const queue = dt.getQueue(message.guild!);
        if (!queue) {
          return { handled: true, response: "Aucune musique en cours. 🤷" };
        }

        queue.stop();
        return { handled: true, response: "Musique arrêtée ! ⏹️" };
      } catch {
        return { handled: true, response: "Impossible d'arrêter la musique. 😕" };
      }
    },
  },

  // ─── Musique : skip ──────────────────────────────────────────────────────
  {
    keywords: [
      "skip",
      "suivant",
      "next",
      "passe",
      "passe à la suivante",
      "skip la musique",
      "next song",
      "passe cette chanson",
      "passe ce morceau",
      "passe à la prochaine",
      "skip ça",
      "skip ca",
      "next musique",
      "next chanson",
      "change de musique",
      "change de chanson",
      "change de morceau",
      "passe l'autre",
      "passe l autre",
      "la suivante",
      "prochaine",
      "skip track",
      "skip song",
      "next track",
      "j'en ai marre de celle-la",
      "j en ai marre",
      "passe-passe",
      "zap",
      "zappe",
      "zap ça",
      "zap ca",
      "forward",
      "avance",
      "avance la musique",
      "next one",
      "passe une autre",
      "mets une autre",
      "met une autre",
    ],
    exclude: ["ne skip pas", "ne passe pas"],
    execute: async (message) => {
      try {
        const { getDisTube } = await import("./musicService.js");
        const dt = getDisTube();
        if (!dt) return { handled: true, response: "Service musique indisponible. 😕" };

        const queue = dt.getQueue(message.guild!);
        if (!queue || queue.songs.length <= 1) {
          return { handled: true, response: "Pas de musique suivante dans la file. 🤷" };
        }

        await queue.skip();
        return { handled: true, response: "Musique suivante ! ⏭️" };
      } catch {
        return { handled: true, response: "Impossible de passer à la suivante. 😕" };
      }
    },
  },

  // ─── Musique : pause ─────────────────────────────────────────────────────
  {
    keywords: [
      "pause",
      "mets en pause",
      "met en pause",
      "suspend la musique",
      "freeze",
      "stop temporaire",
      "pause la musique",
      "attends la musique",
      "attends un peu",
      "mets sur pause",
      "met sur pause",
      "sur pause",
      "hold on",
      "hold",
      "break",
      "arrête temporairement",
      "arrete temporairement",
      "pause music",
      "pause song",
      "pause ça",
      "pause ca",
    ],
    execute: async (message) => {
      try {
        const { getDisTube } = await import("./musicService.js");
        const dt = getDisTube();
        if (!dt) return { handled: true, response: "Service musique indisponible. 😕" };

        const queue = dt.getQueue(message.guild!);
        if (!queue) return { handled: true, response: "Aucune musique en cours. 🤷" };

        queue.pause();
        return { handled: true, response: "Musique en pause. ⏸️" };
      } catch {
        return { handled: true, response: "Impossible de mettre en pause. 😕" };
      }
    },
  },

  // ─── Musique : resume ────────────────────────────────────────────────────
  {
    keywords: [
      "reprend",
      "reprends la musique",
      "resume",
      "continue la musique",
      "remets la musique",
      "remet la musique",
      "reprends",
      "continue",
      "remets-moi ça",
      "remet moi ca",
      "replay",
      "re-start",
      "restart music",
      "remets le son",
      "remet le son",
      "reprends le son",
      "go musique",
      "go music",
      "repart",
      "remets en route",
      "remet en route",
      "reprends la lecture",
      "unpause",
      "un-pause",
      "enlève la pause",
      "enleve la pause",
      "retire la pause",
      "continue à jouer",
      "continue a jouer",
      "remets la lecture",
      "remet la lecture",
      "play again",
      "play back",
      "reprends tout de suite",
    ],
    execute: async (message) => {
      try {
        const { getDisTube } = await import("./musicService.js");
        const dt = getDisTube();
        if (!dt) return { handled: true, response: "Service musique indisponible. 😕" };

        const queue = dt.getQueue(message.guild!);
        if (!queue) return { handled: true, response: "Aucune musique en cours. 🤷" };

        queue.resume();
        return { handled: true, response: "Musique reprise ! ▶️" };
      } catch {
        return { handled: true, response: "Impossible de reprendre. 😕" };
      }
    },
  },

  // ─── Musique : queue ─────────────────────────────────────────────────────
  {
    keywords: [
      "file d'attente",
      "queue",
      "playlist",
      "liste de lecture",
      "quoi après",
      "prochaines musiques",
      "file",
      "file d attente",
      "what's next",
      "what is next",
      "quoi après",
      "quoi apres",
      "c'est quoi après",
      "c est quoi apres",
      "prochaine chanson",
      "prochaines chansons",
      "prochain morceau",
      "la liste",
      "montre la liste",
      "montre la file",
      "montre la queue",
      "montre la playlist",
      "qu'est-ce qui joue après",
      "qu est ce qui joue apres",
      "show queue",
      "show playlist",
      "show list",
      "à venir",
      "a venir",
      "upcoming",
      "next up",
      "musiques à venir",
      "musiques a venir",
      "qu'y a-t-il après",
      "qu y a t il apres",
    ],
    execute: async (message) => {
      try {
        const { getDisTube } = await import("./musicService.js");
        const dt = getDisTube();
        if (!dt) return { handled: true, response: "Service musique indisponible. 😕" };

        const queue = dt.getQueue(message.guild!);
        if (!queue || queue.songs.length === 0) {
          return { handled: true, response: "La file d'attente est vide. 📭" };
        }

        const upcoming = queue.songs
          .slice(0, 5)
          .map((s, i) => `${i === 0 ? "▶️" : `${i}.`} **${s.name || "Inconnu"}**`)
          .join("\n");

        return {
          handled: true,
          response: `🎵 File d'attente (${queue.songs.length}):\n${upcoming}`,
        };
      } catch {
        return { handled: true, response: "Impossible d'afficher la file. 😕" };
      }
    },
  },

  // ─── Info serveur ────────────────────────────────────────────────────────
  {
    keywords: [
      "info serveur",
      "infos serveur",
      "informations serveur",
      "statistiques serveur",
      "stats serveur",
      "combien de membres",
      "nombre de membres",
      "combien on est",
      "server info",
      "server stats",
      "guild info",
      "parle-moi du serveur",
      "parle moi du serveur",
      "dis-moi tout sur le serveur",
      "dis moi tout sur le serveur",
      "c'est quoi ce serveur",
      "c est quoi ce serveur",
      "description du serveur",
      "présentation du serveur",
      "quand le serveur a été créé",
      "quand le serveur a ete cree",
      "âge du serveur",
      "age du serveur",
      "combien de salons",
      "combien de rôles",
      "combien de roles",
      "how many members",
      "how many channels",
    ],
    execute: async (message) => {
      if (!message.guild) return { handled: false };
      const g = message.guild;
      const members = g.memberCount;
      const channels = g.channels.cache.size;
      const roles = g.roles.cache.size;
      const created = g.createdAt.toLocaleDateString("fr-FR");
      return {
        handled: true,
        response: `📊 **${g.name}**\n• Membres: **${members}**\n• Salons: **${channels}**\n• Rôles: **${roles}**\n• Créé le: **${created}**`,
      };
    },
  },

  // ─── Info utilisateur ────────────────────────────────────────────────────
  {
    keywords: [
      "info utilisateur",
      "infos utilisateur",
      "mon profil",
      "mes infos",
      "qui suis-je",
      "info membre",
      "infos membre",
      "qui je suis",
      "parle-moi de moi",
      "parle moi de moi",
      "dis-moi qui je suis",
      "dis moi qui je suis",
      "mes informations",
      "mon compte",
      "my profile",
      "my info",
      "user info",
      "who am i",
      "depuis quand je suis là",
      "depuis quand je suis la",
      "quand j'ai rejoint",
      "quand j ai rejoint",
      "quand j'ai créé mon compte",
      "quand j ai cree mon compte",
      "mes rôles",
      "mes roles",
      "quels rôles j'ai",
      "quels roles j ai",
      "depuis quand je suis sur le serveur",
      "depuis quand je suis sur le serveur",
      "mon pseudo",
      "mon nom",
      "mon display name",
    ],
    execute: async (message) => {
      const member = message.member as GuildMember | null;
      if (!member) return { handled: false };
      const roles =
        member.roles.cache
          .filter((r) => r.id !== message.guild!.id)
          .map((r) => r.name)
          .join(", ") || "Aucun";
      const joined = member.joinedAt?.toLocaleDateString("fr-FR") || "Inconnu";
      const created = member.user.createdAt.toLocaleDateString("fr-FR");
      return {
        handled: true,
        response: `👤 **${member.displayName}**\n• Compte créé le: **${created}**\n• A rejoint le: **${joined}**\n• Rôles: ${roles}`,
      };
    },
  },

  // ─── XP / Niveau ─────────────────────────────────────────────────────────
  {
    keywords: [
      "mon niveau",
      "mon xp",
      "mon level",
      "quel est mon niveau",
      "quel niveau je suis",
      "mon rang",
      "mon rank",
      "quel est mon xp",
      "quel est mon level",
      "quel est mon rang",
      "combien d'xp j'ai",
      "combien d xp j ai",
      "combien de xp",
      "my level",
      "my xp",
      "my rank",
      "what level am i",
      "suis-je haut niveau",
      "suis je haut niveau",
      "où j'en suis",
      "ou j en suis",
      "où j'en suis niveau",
      "mon progression",
      "ma progression",
      "quel rang je suis",
      "quelle place j'ai",
      "quelle place j ai",
      "show my xp",
      "show my level",
      "show my rank",
      "xp info",
      "level info",
      "rank info",
    ],
    execute: async (message) => {
      try {
        const { getUserXp } = await import("./xpService.js");
        const xpData = await getUserXp(message.author.id);
        if (!xpData) {
          return {
            handled: true,
            response: "Tu n'as pas encore d'XP. Continue à parler pour gagner de l'XP ! 📈",
          };
        }
        return {
          handled: true,
          response: `📊 Ton niveau: **${xpData.level}** | XP: **${xpData.xp}** | Rang: **#${xpData.rank}**`,
        };
      } catch {
        return { handled: true, response: "Impossible de récupérer ton XP. 😕" };
      }
    },
  },

  // ─── Rappels ─────────────────────────────────────────────────────────────
  {
    keywords: [
      "mes rappels",
      "mes reminders",
      "liste des rappels",
      "rappels",
      "remind me",
      "rappelle-moi",
      "rappelle moi",
      "mes alarms",
      "mes alarmes",
      "mes alerts",
      "mes alertes",
      "qu'est-ce que j'ai à faire",
      "qu est ce que j ai a faire",
      "mes tâches",
      "mes taches",
      "mes todos",
      "mes to-do",
      "ai-je des rappels",
      "ai je des rappels",
      "show reminders",
      "show my reminders",
      "list reminders",
      "y'a-t-il des rappels",
      "y a t il des rappels",
      "mes notes",
      "mes mémos",
      "mes memos",
    ],
    exclude: [
      "crée un rappel",
      "cree un rappel",
      "nouveau rappel",
      "crée un reminder",
      "cree un reminder",
    ],
    execute: async (message) => {
      try {
        const { getUserReminders } = await import("./reminderService.js");
        const reminders = getUserReminders(message.author.id);
        if (reminders.length === 0) {
          return { handled: true, response: "Tu n'as aucun rappel actif. 📝" };
        }
        const list = reminders
          .slice(0, 5)
          .map((r, i) => `${i + 1}. **${r.text}** — ${r.remindAt.toLocaleString("fr-FR")}`)
          .join("\n");
        return { handled: true, response: `📝 Tes rappels (${reminders.length}):\n${list}` };
      } catch {
        return { handled: false };
      }
    },
  },

  // ─── Ping / Latence ──────────────────────────────────────────────────────
  {
    keywords: [
      "ping",
      "latence",
      "latency",
      "quel est ton ping",
      "ton ping",
      "ping ping",
      "test ping",
      "check ping",
      "ça lag",
      "ca lag",
      "ça laggue",
      "ca laggue",
      "es-tu lent",
      "es tu lent",
      "t'es lent",
      "tes lent",
      "ta latence",
      "ta latency",
      "ton ms",
      "quel est ta latence",
      "quelle est ta latence",
      "show ping",
      "show latency",
      "ms check",
      "ça répond vite",
      "ca repond vite",
      "temps de réponse",
      "temps de reponse",
      "response time",
      "how fast are you",
      "how fast",
    ],
    execute: async (message) => {
      const sent = await message.reply({
        content: "🏓 Pong!",
        allowedMentions: { repliedUser: false },
      });
      const latency = sent.createdTimestamp - message.createdTimestamp;
      const wsPing = message.client.ws.ping;
      try {
        await sent.edit(`🏓 Pong! Latence: **${latency}ms** | WebSocket: **${wsPing}ms**`);
      } catch {}
      return { handled: true };
    },
  },

  // ─── Uptime ──────────────────────────────────────────────────────────────
  {
    keywords: [
      "uptime",
      "depuis quand",
      "combien de temps",
      "tu tourne depuis",
      "tu tournes depuis",
      "depuis combien de temps",
      "depuis quand tu tourne",
      "depuis quand tu tournes",
      "depuis quand t'es allumé",
      "depuis quand t es allume",
      "depuis quand tu es en ligne",
      "depuis quand tu es en ligne",
      "depuis quand tu es up",
      "depuis quand tu es up",
      "ton uptime",
      "ton temps de fonctionnement",
      "how long have you been running",
      "how long up",
      "since when",
      "depuis quand en ligne",
      "tu es allumé depuis",
      "tu es allume depuis",
      "depuis quand tu dors pas",
      "depuis quand tu dors pas",
      "as-tu dormi",
      "as tu dormi",
      "t'as dormi",
      "tas dormi",
      "tu t'es déjà arrêté",
      "tu t es deja arrete",
    ],
    execute: async (_message) => {
      const uptime = process.uptime();
      const days = Math.floor(uptime / 86400);
      const hours = Math.floor((uptime % 86400) / 3600);
      const mins = Math.floor((uptime % 3600) / 60);
      return {
        handled: true,
        response: `⏱️ Je tourne depuis **${days}j ${hours}h ${mins}m**`,
      };
    },
  },

  // ─── Traduire ────────────────────────────────────────────────────────────
  {
    keywords: [
      "traduis",
      "traduire",
      "translate",
      "traduction",
      "comment on dit",
      "traduit",
      "traduis-moi",
      "traduis moi",
      "traduis ça",
      "traduis ca",
      "dis en français",
      "dis en francais",
      "mets en français",
      "mets en francais",
      "en français ça donne quoi",
      "en francais ca donne quoi",
      "comment ça se dit",
      "comment ca se dit",
      "comment on dit en français",
      "comment on dit en francais",
      "ça veut dire quoi",
      "ca veut dire quoi",
      "qu'est-ce que ça veut dire",
      "qu est ce que ca veut dire",
      "quel est la traduction",
      "quelle est la traduction",
      "fais la traduction",
      "donne-moi la traduction",
      "donne moi la traduction",
      "translate this",
      "translate that",
      "how do you say",
      "dis-le en français",
      "dis le en francais",
      "convertis en français",
      "convertis en francais",
      "rédige en français",
      "redige en francais",
      "ça donne quoi en français",
      "ca donne quoi en francais",
    ],
    execute: async (message, matchedText) => {
      const textToTranslate = matchedText
        .replace(
          /^(?:@?\w+\s+)?(?:traduis|traduire|translate|traduction|comment on dit|traduit|traduis-moi|traduis moi|traduis ça|traduis ca|dis en français|dis en francais|mets en français|mets en francais|en français ça donne quoi|en francais ca donne quoi|comment ça se dit|comment ca se dit|comment on dit en français|comment on dit en francais|ça veut dire quoi|ca veut dire quoi|qu'est-ce que ça veut dire|qu est ce que ca veut dire|quel est la traduction|quelle est la traduction|fais la traduction|donne-moi la traduction|donne moi la traduction|translate this|translate that|how do you say|dis-le en français|dis le en francais|convertis en français|convertis en francais|rédige en français|redige en francais|ça donne quoi en français|ca donne quoi en francais)\s+/i,
          "",
        )
        .trim();

      if (!textToTranslate || textToTranslate.length < 2) {
        return {
          handled: true,
          response: "Qu'est-ce que tu veux que je traduise ? Exemple: @bot traduis hello world",
        };
      }

      try {
        const { translateAutoToFrench } = await import("../utils/translator.js");
        const translated = await translateAutoToFrench(textToTranslate);
        if (
          translated &&
          translated.translatedText &&
          translated.translatedText !== textToTranslate
        ) {
          return { handled: true, response: `🌐 Traduction: **${translated.translatedText}**` };
        }
        return { handled: true, response: "Je n'ai pas pu traduire ça. 😕" };
      } catch {
        return { handled: true, response: "Service de traduction indisponible. 😕" };
      }
    },
  },

  // ─── Dire bonjour à quelqu'un en vocal ───────────────────────────────────
  {
    keywords: [
      "dis bonjour à",
      "salue",
      "fais coucou à",
      "dis salut à",
      "dis bienvenue à",
      "dis hello à",
      "dis hey à",
      "souhaite la bienvenue à",
      "accueille",
      "accueille-le",
      "accueille la",
      "accueille-les",
      "fais un coucou à",
      "fais un bonjour à",
      "dis bonjour tout le monde",
      "salue tout le monde",
      "dis salut tout le monde",
      "fais coucou tout le monde",
      "souhaite bonjour",
      "souhaite la bienvenue",
      "welcome",
      "say hello to",
      "greet",
      "dis bonjour à tous",
      "dis bonjour à toutes",
      "salue les nouveaux",
      "accueille les nouveaux",
      "fais un discours de bienvenue",
      "bienvenue à",
    ],
    execute: async (message, matchedText) => {
      const target = matchedText
        .replace(
          /^(?:@?\w+\s+)?(?:dis bonjour [àa]|salue|fais coucou [àa]|dis salut [àa]|dis bienvenue [àa]|dis hello [àa]|dis hey [àa]|souhaite la bienvenue [àa]|accueille(?:-le|-la|-les)?|fais un coucou [àa]|fais un bonjour [àa]|dis bonjour tout le monde|salue tout le monde|dis salut tout le monde|fais coucou tout le monde|souhaite bonjour|souhaite la bienvenue|welcome|say hello to|greet|dis bonjour [àa] tous|dis bonjour [àa] toutes|salue les nouveaux|accueille les nouveaux|fais un discours de bienvenue|bienvenue [àa])\s+/i,
          "",
        )
        .replace(/<@!?\d+>/g, "")
        .trim();

      const member = message.member as GuildMember | null;
      if (!member?.voice?.channel) {
        return {
          handled: true,
          response: "Tu n'es pas en vocal ! Connecte-toi et je dirai bonjour à voix haute. 🎤",
        };
      }

      const ttsText = target
        ? `Bonjour ${target} ! Bienvenue sur le serveur.`
        : "Bonjour tout le monde !";

      const ok = await announceInVoice(member, ttsText);
      return ok
        ? { handled: true, response: `🎤 J'ai dit bonjour dans **${member.voice.channel.name}** !` }
        : { handled: true, response: "Impossible de parler en vocal. 😕" };
    },
  },

  // ─── Annonce générale en vocal ───────────────────────────────────────────
  {
    keywords: [
      "annonce",
      "fais une annonce",
      "annonce à tout le monde",
      "dis à tout le monde",
      "préviens tout le monde",
      "prevents tout le monde",
      "informe tout le monde",
      "informe le serveur",
      "fais passer le message",
      "fais passer l'info",
      "broadcast",
      "announce",
      "dis à tous",
      "préviens les autres",
      "fais une annonce générale",
      "fais une annonce generale",
      "annonce importante",
      "message général",
      "message general",
      "préviens le vocal",
      "prevents le vocal",
      "dis-le à tout le monde",
      "dis le a tout le monde",
      "fais le savoir",
      "fais-le savoir",
      "fais le savoir",
      "passe le message",
      "passe-le",
      "transmets le message",
      "alerte tout le monde",
      "alerte le serveur",
    ],
    exclude: ["ne dis pas", "ne fais pas", "ne préviens pas", "ne préviens pas"],
    execute: async (message, matchedText) => {
      const announcement = matchedText
        .replace(
          /^(?:@?\w+\s+)?(?:annonce|fais une annonce|annonce [àa] tout le monde|dis [àa] tout le monde|pr[ée]viens tout le monde|informe tout le monde|informe le serveur|fais passer le message|fais passer l'info|broadcast|announce|dis [àa] tous|pr[ée]viens les autres|fais une annonce g[ée]n[ée]rale|annonce importante|message g[ée]n[ée]ral|pr[ée]viens le vocal|dis-le [àa] tout le monde|dis le a tout le monde|fais le savoir|fais-le savoir|passe le message|passe-le|transmets le message|alerte tout le monde|alerte le serveur)\s+/i,
          "",
        )
        .trim();

      if (!announcement || announcement.length < 3) {
        return {
          handled: true,
          response:
            "Qu'est-ce que tu veux que j'annonce ? Exemple: @bot annonce on lance une partie Fortnite",
        };
      }

      if (!message.guild) return { handled: false };

      const voiceChannel = findActiveVoiceChannel(message.guild.id, message.client);
      if (!voiceChannel) {
        return { handled: true, response: "Personne n'est en vocal actuellement. 📭" };
      }

      const ok = await announceInVoice(message.member as GuildMember, `Attention. ${announcement}`);
      return ok
        ? { handled: true, response: `📢 Annonce vocale faite dans **${voiceChannel.name}** !` }
        : { handled: true, response: "Impossible de faire l'annonce vocale. 😕" };
    },
  },

  // ─── Statut du bot ───────────────────────────────────────────────────────
  {
    keywords: [
      "comment tu vas",
      "ça va",
      "ca va",
      "tu vas bien",
      "status",
      "statut du bot",
      "tu es là",
      "tu es la",
      "es-tu là",
      "es-tu la",
      "comment ça va",
      "comment ca va",
      "comment tu te sens",
      "comment tu te portes",
      "ça roule",
      "ca roule",
      "tout va bien",
      "tout baigne",
      "tu pètes la forme",
      "tu petes la forme",
      "tu pétais la forme",
      "how are you",
      "how do you do",
      "you good",
      "you ok",
      "are you alive",
      "t'es vivant",
      "tu es vivant",
      "t'es ok",
      "tu es ok",
      "tout ok",
      "tout est ok",
      "tu fonctionnes",
      "tu fonctions",
      "tu marches",
      "tu marche",
      "es-tu fonctionnel",
      "es tu fonctionnel",
      "t'es fonctionnel",
      "ça marche",
      "ca marche",
      "ça fonctionne",
      "ca fonctionne",
      "you running",
      "you up",
      "t'es up",
      "tu es up",
      "t'es en ligne",
      "tu es en ligne",
      "online",
      "tu dors",
      "t'es réveillé",
      "t es reveille",
      "tu es réveillé",
      "hello",
      "coucou",
      "hey",
      "yo",
      "bonjour",
      "salut",
    ],
    execute: async (_message) => {
      const uptime = process.uptime();
      const hours = Math.floor(uptime / 3600);
      const mem = (process.memoryUsage().rss / 1048576).toFixed(0);
      const replies = [
        `Je vais bien merci ! 😎 En ligne depuis ${hours}h, ${mem}MB de RAM utilisée.`,
        `Tout roule ! 🤙 ${hours}h d'uptime et toujours au top.`,
        `Ça va super ! 💪 J'ai tourné ${hours}h sans crash.`,
        `Nickel ! 🎸 Prêt à aider, ${mem}MB de mémoire utilisée.`,
      ];
      return { handled: true, response: replies[Math.floor(Math.random() * replies.length)] };
    },
  },

  // ─── Blague ──────────────────────────────────────────────────────────────
  {
    keywords: [
      "raconte une blague",
      "fais moi rire",
      "dis une blague",
      "une blague",
      "blague",
      "joke",
      "fais une blague",
      "raconte-moi une blague",
      "raconte moi une blague",
      "raconte-moi un truc drôle",
      "raconte moi un truc drole",
      "dis-moi un truc drôle",
      "dis moi un truc drole",
      "fais-moi rire",
      "fais moi rire",
      "fais nous rire",
      "une blague de gamer",
      "blague de gamer",
      "blague gaming",
      "fais moi marrer",
      "fais-moi marrer",
      "tell me a joke",
      "make me laugh",
      "say something funny",
      "raconte une vanne",
      "raconte une blague de gamer",
      "joke time",
      "blague time",
      "fais peter la blague",
      "fais pêter la blague",
      "balance une blague",
      "une histoire drôle",
      "une histoire drole",
      "raconte-moi une histoire drôle",
      "raconte moi une histoire drole",
      "fais le clown",
      "amuse-moi",
      "amuse moi",
      "j'ai besoin de rire",
      "j ai besoin de rire",
      "j'ai besoin de me détendre",
      "j ai besoin de me detendre",
      "dis-moi une vanne",
      "dis moi une vanne",
      "raconte un truc marrant",
      "raconte-moi un truc marrant",
      "raconte moi un truc marrant",
    ],
    execute: async (message, matchedText) => {
      // Détecter si l'utilisateur demande un sujet spécifique
      const subjectMatch = matchedText.match(/(?:sur|de|à propos de|a propos de|about)\s+(.+)/i);
      const subject = subjectMatch?.[1]?.trim();

      const jokes = [
        "Pourquoi les gamers n'ont pas peur du noir ? Parce qu'ils ont déjà vu pire en ranked. 🎮",
        "Quel est le bruit préféré d'un gamer ? Le son d'une victoire Royale ! 👑",
        "Pourquoi les joueurs de Fortnite ne pleurent jamais ? Parce qu'ils ont déjà l'habitude de se faire éliminer. 😭",
        "Un gamer entre dans un bar... mais il lag, donc il entre 3 secondes plus tard. 🏓",
        "Pourquoi j'ai arrêté de jouer à Minecraft ? Parce que je craftais trop de problèmes. ⛏️",
        "Que dit un gamer quand il gagne ? 'GG EZ' — et quand il perd ? 'Mes coéquipiers étaient nuls.' 🤡",
      ];

      if (subject) {
        return {
          handled: true,
          response: `Une blague sur ${subject} ? Ok, ça me inspire 😏\n\n${jokes[Math.floor(Math.random() * jokes.length)]}`,
        };
      }
      return { handled: true, response: jokes[Math.floor(Math.random() * jokes.length)] };
    },
  },

  // ─── Aide ────────────────────────────────────────────────────────────────
  {
    keywords: [
      "aide",
      "help",
      "que sais-tu faire",
      "que peux tu faire",
      "que peux-tu faire",
      "tes capacités",
      "tes capacites",
      "à quoi tu sers",
      "a quoi tu sers",
      "aide-moi",
      "aide moi",
      "help me",
      "j'ai besoin d'aide",
      "j ai besoin d aide",
      "tu fais quoi",
      "tu fait quoi",
      "tu sers à quoi",
      "tu sers a quoi",
      "tes fonctions",
      "tes features",
      "tes commandes",
      "que fais-tu",
      "que fais tu",
      "que tu sais faire",
      "montre-moi ce que tu sais faire",
      "montre moi ce que tu sais faire",
      "list tes capacités",
      "liste tes capacités",
      "list tes fonctions",
      "what can you do",
      "what do you do",
      "your features",
      "tes pouvoirs",
      "tes skills",
      "tes possibilités",
      "help me out",
      "j'ai besoin de ton aide",
      "j ai besoin de ton aide",
      "tu peux faire quoi",
      "tu peut faire quoi",
      "apprends-moi",
      "apprends moi",
      "apprend-moi",
      "explique-moi ce que tu fais",
      "explique moi ce que tu fais",
      "guide-moi",
      "guide moi",
      "guide moi stp",
      "donne-moi un coup de main",
      "donne moi un coup de main",
      "tu connais quoi faire",
      "tu connais quoi faire",
    ],
    execute: async (_message, matchedText) => {
      const lower = matchedText.toLowerCase();
      const wantsFull =
        lower.includes("tout") ||
        lower.includes("all") ||
        lower.includes("complet") ||
        lower.includes("liste");
      const wantsVocal = lower.includes("vocal") || lower.includes("voice");
      const wantsMusic = lower.includes("musique") || lower.includes("music");
      const wantsFortnite =
        lower.includes("fortnite") || lower.includes("fn") || lower.includes("game");
      const wantsInfo = lower.includes("info") || lower.includes("stat");
      const wantsTrad = lower.includes("traduc") || lower.includes("translate");
      const wantsOther =
        lower.includes("autre") || lower.includes("blague") || lower.includes("rappel");

      if (wantsVocal) {
        return {
          handled: true,
          response: `🎧 **Actions vocales :**\n• "rejoins le vocal" / "viens" / "connecte-toi" / "go vocal"\n• "quitte le vocal" / "déconnecte" / "sors" / "casse-toi"\n• "dis [texte]" / "parle" / "récite" / "crie" / "chuchote"\n• "dis bonjour à [quelqu'un]" / "salue" / "fais coucou à"\n• "annonce [texte]" / "fais une annonce" / "dis à tout le monde"`,
        };
      }
      if (wantsMusic) {
        return {
          handled: true,
          response: `🎵 **Actions musique :**\n• "joue [titre]" / "met la musique" / "lance" / "balance un son"\n• "stop musique" / "coupe la musique" / "arrête tout" / "silence"\n• "skip" / "suivant" / "next" / "zap" / "passe l'autre"\n• "pause" / "mets en pause" / "freeze" / "hold"\n• "reprends" / "continue" / "remets la musique" / "unpause"\n• "queue" / "file d'attente" / "playlist" / "quoi après"`,
        };
      }
      if (wantsFortnite) {
        return {
          handled: true,
          response: `🎮 **Actions Fortnite :**\n• "mets le skin [nom]" / "change de perso" / "deviens [nom]" / "transforme-toi en"\n• "fais l'emote [nom]" / "danse" / "bouge-toi" / "fais le move"\n• "arrête l'emote" / "stop danse" / "emote off" / "plus de danse"\n• "mets le backbling [nom]" / "sac à dos" / "backpack"\n• "mets le pickaxe [nom]" / "pioche" / "hache" / "outil"\n• "mets le niveau [X]" / "battle pass" / "level" / "passe au niveau"\n• "je suis prêt" / "prépare-toi" / "ready" / "go go go" / "c'est parti"\n• "pas prêt" / "unready" / "attends" / "pas maintenant"\n• "statut fortnite" / "tu es connecté" / "t'es en game" / "t'es co"`,
        };
      }
      if (wantsInfo) {
        return {
          handled: true,
          response: `📊 **Actions infos :**\n• "info serveur" / "combien de membres" / "stats serveur" / "parle-moi du serveur"\n• "mon profil" / "qui suis-je" / "mes infos" / "depuis quand je suis là"\n• "mon niveau" / "mon xp" / "mon rang" / "combien d'xp j'ai"\n• "ping" / "latence" / "ça lag" / "temps de réponse"\n• "uptime" / "depuis quand" / "tu tourne depuis" / "as-tu dormi"`,
        };
      }
      if (wantsTrad) {
        return {
          handled: true,
          response: `🌐 **Traduction :**\n• "traduis [texte]" / "traduit" / "comment on dit"\n• "dis en français" / "mets en français" / "convertis en français"\n• "ça veut dire quoi [texte]" / "quelle est la traduction"\n• "en français ça donne quoi" / "dis-le en français"`,
        };
      }
      if (wantsOther) {
        return {
          handled: true,
          response: `🎲 **Autres actions :**\n• "raconte une blague" / "fais moi rire" / "dis une vanne" / "fais le clown"\n• "mes rappels" / "mes reminders" / "qu'est-ce que j'ai à faire"\n• "comment tu vas" / "ça va" / "tu pètes la forme" / "t'es vivant"`,
        };
      }

      if (wantsFull) {
        return {
          handled: true,
          response: `🤖 **Tout ce que je peux faire par @mention :**

**🎧 Vocal :** rejoins / quitte / dis / parle / annonce / salue
**🎵 Musique :** joue / stop / skip / pause / reprends / queue
**🎮 Fortnite :** skin / emote / stop emote / backbling / pickaxe / niveau / ready / pas ready / statut
**📊 Infos :** serveur / profil / xp / ping / uptime
**🌐 Autres :** traduis / rappels / blague / statut

Dis-moi une catégorie pour plus de détails, ou essaie directement !`,
        };
      }

      // Aide générale — demander quelle catégorie
      return {
        handled: true,
        response: `🤖 **Quel genre d'aide tu veux ?**

Dis-moi ce qui t'intéresse :
• **Vocal** — rejoindre, quitter, parler en vocal
• **Musique** — jouer, stop, skip, pause, queue
• **Fortnite** — skin, emote, backbling, pickaxe, niveau, ready
• **Minecraft** — connect, mine, stop, status, déconnecte, graine
• **Infos** — serveur, profil, XP, ping, uptime
• **Traduction** — traduire du texte
• **Autre** — blagues, rappels, statut

Ou dis "**aide tout**" pour voir la liste complète !`,
      };
    },
  },

  // ─── Minecraft Bedrock ───────────────────────────────────────────────────
  {
    keywords: [
      "minecraft",
      "mc connect",
      "mc mine",
      "mc stop",
      "mc status",
      "mc disconnect",
      "connecte toi a minecraft",
      "connecte-toi a minecraft",
      "connecte toi minecraft",
      "rejoins minecraft",
      "rejoin minecraft",
      "va sur minecraft",
      "connecte toi au serveur minecraft",
      "connecte-toi au serveur minecraft",
      "lance minecraft",
      "demarre minecraft",
      "démarre minecraft",
      "mine pour moi",
      "commence a miner",
      "commence à miner",
      "arrete de miner",
      "arrête de miner",
      "stop mining",
      "deconnecte minecraft",
      "déconnecte minecraft",
      "quitte minecraft",
      "suis moi",
      "suit moi",
      "suis-moi",
      "arrete de me suivre",
      "arrête de me suivre",
      "donne moi",
      "file moi",
      "passe moi",
      "fais passer",
      "equipe",
      "équipe",
      "prend une",
      "prends une",
      "tiens",
      "utilise une",
      "agriculture",
      "ferme",
      "plante",
      "recolte",
      "récolte",
      "laboure",
      "fauceille",
      "arrete l'agriculture",
      "arrête l'agriculture",
      "solo",
      "joue en solo",
      "lance solo",
      "mode solo",
    ],
    exclude: ["ne te connecte pas", "ne rejoins pas"],
    execute: async (message, matchedText) => {
      const {
        connectBot,
        disconnectBot,
        startMining,
        stopMining,
        getBotStatus,
        startServerWithSeed,
        followPlayer,
        stopFollowing,
        giveItem,
        equipTool,
        startFarming,
        stopFarming,
        soloMode,
      } = await import("./minecraftBot.js");
      const lower = matchedText.toLowerCase();

      // ── Solo (tout-en-un) ──
      if (lower.includes("solo") || lower.includes("mode solo") || lower.includes("joue en solo")) {
        const seedMatch = matchedText.match(/(?:graine|seed)[:\s]+([^\s]+)/i);
        const seed = seedMatch ? seedMatch[1] : undefined;
        const autoMine = !lower.includes("sans miner") && !lower.includes("ne mine pas");
        const result = await soloMode(seed, 19132, autoMine, "strip");
        return { handled: true, response: result.message };
      }

      // ── Connect ──
      if (
        lower.includes("connect") ||
        lower.includes("rejoin") ||
        lower.includes("va sur") ||
        lower.includes("lance") ||
        lower.includes("demarre") ||
        lower.includes("démarre")
      ) {
        // Chercher une IP dans le message (format: ip:port ou ip port ou juste ip)
        const ipMatch = matchedText.match(
          /(\d{1,3}\.\d{1,3}\.\d{1,3}\.\d{1,3}|localhost|127\.0\.0\.1)/i,
        );
        const portMatch = matchedText.match(/port[:\s]+(\d{4,5})/i);
        const pseudoMatch = matchedText.match(/(?:pseudo|nom|identifiant)[:\s]+(\S+)/i);

        if (!ipMatch && !lower.includes("localhost") && !lower.includes("127.0.0.1")) {
          // Pas d'IP fournie — demander
          return {
            handled: true,
            response:
              "⛏️ Pour me connecter à Minecraft Bedrock, j'ai besoin de l'IP du serveur !\n\n**Exemples:**\n• `@bot connecte-toi à minecraft 127.0.0.1`\n• `@bot connecte-toi à minecraft 192.168.1.50 port 19132 pseudo BotMiner`\n• `@bot lance minecraft avec la graine 123456`\n\nTu peux aussi utiliser `/mc connect ip:127.0.0.1` ou `/mc seed graine:123456`",
          };
        }

        const ip = ipMatch ? ipMatch[1] : "127.0.0.1";
        const port = portMatch ? parseInt(portMatch[1]) : 19132;
        const pseudo = pseudoMatch ? pseudoMatch[1] : `Bot_${Math.floor(Math.random() * 9999)}`;

        const result = await connectBot({ host: ip, port, username: pseudo, offline: true });
        return { handled: true, response: result.message };
      }

      // ── Seed (démarrer serveur avec graine) ──
      if (lower.includes("graine") || lower.includes("seed")) {
        const seedMatch = matchedText.match(/(?:graine|seed)[:\s]+([^\s]+)/i);
        if (!seedMatch) {
          return {
            handled: true,
            response:
              "⛏️ Quelle graine veux-tu utiliser ? Exemple: `@bot lance minecraft avec la graine 123456`",
          };
        }
        const result = await startServerWithSeed(seedMatch[1]);
        return { handled: true, response: result.message };
      }

      // ── Mine ──
      if (lower.includes("mine") || lower.includes("miner")) {
        const modeMatch = matchedText.match(
          /(?:mode|strategie|stratégie)[:\s]+(strip|branch|tunnel)/i,
        );
        const mode = modeMatch ? (modeMatch[1] as "strip" | "branch" | "tunnel") : "strip";
        const result = startMining(mode);
        return { handled: true, response: result.message };
      }

      // ── Stop mining ──
      if (lower.includes("arrete") || lower.includes("arrête") || lower.includes("stop")) {
        const result = stopMining();
        return { handled: true, response: result.message };
      }

      // ── Status ──
      if (
        lower.includes("status") ||
        lower.includes("statut") ||
        lower.includes("ou es tu") ||
        lower.includes("où es tu")
      ) {
        const status = getBotStatus();
        if (!status.connected) {
          return {
            handled: true,
            response:
              "❌ Je ne suis pas connecté à Minecraft. Dis-moi `@bot connecte-toi à minecraft <IP>`",
          };
        }
        const stats = await import("./minecraftBot.js").then((m) => m.getMiningStats());
        return {
          handled: true,
          response: `⛏️ **Statut Minecraft**\n• **Serveur:** ${status.host}\n• **Position:** ${status.position ? `X:${status.position.x} Y:${status.position.y} Z:${status.position.z}` : "Inconnue"}\n• **Santé:** ${status.health}/20 | **Faim:** ${status.hunger}/20\n• **Mining:** ${status.mining ? `Oui (${stats.blocksMined} blocs, ${stats.duration})` : "Non"}\n• **Uptime:** ${Math.floor(status.uptime / 60)}min`,
        };
      }

      // ── Disconnect ──
      if (lower.includes("deconnect") || lower.includes("déconnect") || lower.includes("quitte")) {
        const result = disconnectBot();
        return { handled: true, response: result.message };
      }

      // ── Follow ──
      if (
        lower.includes("suis moi") ||
        lower.includes("suit moi") ||
        lower.includes("follow") ||
        lower.includes("suis-moi") ||
        lower.includes("rejoins moi") ||
        lower.includes("rejoins-moi")
      ) {
        const username = message.author.username;
        const result = followPlayer(username);
        return { handled: true, response: result.message };
      }
      if (
        lower.includes("arrete de me suivre") ||
        lower.includes("arrête de me suivre") ||
        lower.includes("stop follow") ||
        lower.includes("ne me suis plus") ||
        lower.includes("unfollow")
      ) {
        const result = stopFollowing();
        return { handled: true, response: result.message };
      }

      // ── Give item ──
      if (
        lower.includes("donne") ||
        lower.includes("fille moi") ||
        lower.includes("file moi") ||
        lower.includes("fais passer") ||
        lower.includes("passe moi") ||
        lower.includes("give")
      ) {
        const itemMatch = matchedText.match(
          /(?:donne|file|fais passer|passe|give)\s+(?:moi\s+)?(?:une\s+|un\s+|des\s+|le\s+|la\s+|les\s+)?(\w+)/i,
        );
        if (itemMatch) {
          const qtyMatch = matchedText.match(/(\d+)\s*(?:fois|x|blocs?)/i);
          const qty = qtyMatch ? parseInt(qtyMatch[1]) : 1;
          const result = giveItem(itemMatch[1], qty);
          return { handled: true, response: result.message };
        }
        return {
          handled: true,
          response:
            "📦 Quel item veux-tu ? Exemple: `@bot donne moi 64 diamants` ou `@bot file moi une épée`",
        };
      }

      // ── Equip tool ──
      if (
        lower.includes("equipe") ||
        lower.includes("équipe") ||
        lower.includes("prend") ||
        lower.includes("tiens") ||
        lower.includes("utilise") ||
        lower.includes("equip")
      ) {
        const toolMatch = matchedText.match(
          /(?:equipe|équipe|prend|tiens|utilise|equip)\s+(?:une\s+|un\s+|la\s+|le\s+)?(\w+)/i,
        );
        if (toolMatch) {
          const result = equipTool(toolMatch[1]);
          return { handled: true, response: result.message };
        }
        return {
          handled: true,
          response:
            "⚔️ Quel outil veux-tu que j'équipe ? Exemple: `@bot équipe une épée` ou `@bot prends une pioche`",
        };
      }

      // ── Farming ──
      if (
        lower.includes("agriculture") ||
        lower.includes("ferme") ||
        lower.includes("farm") ||
        lower.includes("plante") ||
        lower.includes("recolte") ||
        lower.includes("récolte") ||
        lower.includes("laboure") ||
        lower.includes("fauceille") ||
        lower.includes("houe")
      ) {
        const cropMatch = matchedText.match(
          /(?:blé|wheat|carotte|carrot|pomme de terre|potato|betterave|beetroot|citrouille|pumpkin|pastèque|melon)/i,
        );
        const crop = cropMatch ? cropMatch[1].toLowerCase() : "wheat";

        if (lower.includes("plante") || lower.includes("sème") || lower.includes("seme")) {
          const result = startFarming("plant", crop);
          return { handled: true, response: result.message };
        }
        if (lower.includes("recolte") || lower.includes("récolte") || lower.includes("fauceille")) {
          const result = startFarming("harvest", crop);
          return { handled: true, response: result.message };
        }
        if (lower.includes("laboure") || lower.includes("houe") || lower.includes("till")) {
          const result = startFarming("till", crop);
          return { handled: true, response: result.message };
        }
        const result = startFarming("plant", crop);
        return { handled: true, response: result.message };
      }
      if (
        lower.includes("arrete l'agriculture") ||
        lower.includes("arrête l'agriculture") ||
        lower.includes("stop farm") ||
        lower.includes("stop agriculture")
      ) {
        const result = stopFarming();
        return { handled: true, response: result.message };
      }

      // ── Fallback: juste "minecraft" ──
      const status = getBotStatus();
      if (status.connected) {
        return {
          handled: true,
          response: `⛏️ Je suis connecté à Minecraft sur \`${status.host}\` ! Position: ${status.position ? `X:${status.position.x} Y:${status.position.y} Z:${status.position.z}` : "inconnue"}. Santé: ${status.health}/20. ${status.mining ? "Je suis en train de miner !" : "Je ne mine pas actuellement."}\n\nDis-moi: "mine", "stop", "suis-moi", "donne moi X", "équipe une épée", "plante du blé", "status", ou "déconnecte minecraft".`,
        };
      }
      return {
        handled: true,
        response:
          "⛏️ Minecraft Bedrock ! Je peux:\n• **Mode solo (le plus simple)** — `@bot lance solo` ou `@bot joue en solo avec la graine 123456`\n• **Me connecter** — `@bot connecte-toi à minecraft <IP>`\n• **Miner** — `@bot mine pour moi`\n• **Me suivre** — `@bot suis-moi`\n• **Donner des items** — `@bot donne moi 64 diamants`\n• **Équiper un outil** — `@bot équipe une épée`\n• **Agriculture** — `@bot plante du blé` / `@bot récolte` / `@bot laboure`\n• **Statut** — `@bot statut minecraft`\n• **Déconnecter** — `@bot déconnecte minecraft`\n\nOu utilise `/mc` pour les commandes slash.",
      };
    },
  },
];

function matchAction(content: string): { pattern: ActionPattern; matchedText: string } | null {
  const lower = content.toLowerCase().trim();

  for (const pattern of actionPatterns) {
    // Check exclusions first
    if (pattern.exclude) {
      const hasExclusion = pattern.exclude.some((ex) => lower.includes(ex));
      if (hasExclusion) continue;
    }

    // Check if any keyword matches
    const matchedKeyword = pattern.keywords.find((k) => lower.includes(k));
    if (matchedKeyword) {
      return { pattern, matchedText: content };
    }
  }

  return null;
}

// ─── Handler principal ─────────────────────────────────────────────────────

export async function tryHandleNaturalAction(message: Message): Promise<ActionResult> {
  if (!message.guild || message.author.bot) return { handled: false };

  const match = matchAction(message.content);
  if (!match) return { handled: false };

  try {
    const result = await match.pattern.execute(message, match.matchedText);
    if (result.handled && result.response) {
      await message.reply({
        content: result.response,
        allowedMentions: { repliedUser: false },
      });
    }
    return result;
  } catch (err) {
    logger.error(
      `[NaturalActions] Erreur exécution action: ${err instanceof Error ? err.message : String(err)}`,
    );
    return { handled: false };
  }
}
