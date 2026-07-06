import { Client, Message, EmbedBuilder, TextChannel } from "discord.js";
import logger from "../utils/logger.js";

const FAQ_ENABLED = process.env.FAQ_ENABLED !== "false";
const FAQ_CHANNELS = (process.env.FAQ_CHANNELS || "")
  .split(",")
  .map((s) => s.trim())
  .filter(Boolean);

const FAQ_RESPONSES: { patterns: string[]; response: string }[] = [
  {
    patterns: ["comment rejoindre", "lien discord", "invite", "rejoindre le serveur"],
    response: "Pour rejoindre le serveur, utilise le lien d'invitation fourni dans la description ou contacte un admin !",
  },
  {
    patterns: ["règles", "regles", "charte", "code de conduite"],
    response: "Les règles du serveur sont épinglées dans le salon #règles. Merci de les lire avant de participer !",
  },
  {
    patterns: ["comment avoir un rôle", "rôle", "role", "grade"],
    response: "Tu peux obtenir un rôle en réagissant au message dans le salon d'accueil. Choisis tes plateformes préférées !",
  },
  {
    patterns: ["bot commande", "commandes du bot", "help", "aide"],
    response: "Tape `/help` pour voir toutes les commandes disponibles. Tu peux aussi utiliser `/admin` si tu es administrateur.",
  },
  {
    patterns: ["notification", "notifier", "alerte", "je veux être notifié"],
    response: "Pour recevoir les notifications, choisis tes plateformes avec les réactions dans le salon d'accueil !",
  },
  {
    patterns: ["stream", "live", "twitch", "youtube live"],
    response: "Les notifications de live Twitch et YouTube sont automatiques ! Abonne-toi au salon dédié pour ne rien rater.",
  },
];

function findFaqResponse(content: string): string | null {
  const lower = content.toLowerCase();
  for (const faq of FAQ_RESPONSES) {
    if (faq.patterns.some((p) => lower.includes(p))) {
      return faq.response;
    }
  }
  return null;
}

export function startFaqAutoResponder(client: Client): void {
  if (!FAQ_ENABLED) {
    logger.info("[FAQ] Auto-responder désactivé (FAQ_ENABLED=false)");
    return;
  }

  client.on("messageCreate", async (message: Message) => {
    try {
      if (message.author.bot) return;
      if (message.guild === null) return;
      if (FAQ_CHANNELS.length > 0 && !FAQ_CHANNELS.includes(message.channelId)) return;

      const response = findFaqResponse(message.content);
      if (!response) return;

      const embed = new EmbedBuilder()
        .setTitle("🤖 Réponse automatique")
        .setDescription(response)
        .setColor(0x00aaff)
        .setFooter({ text: "Surveillance System • FAQ Auto-Responder" })
        .setTimestamp();

      await message.reply({ embeds: [embed] });
      logger.info(`[FAQ] Réponse auto à ${message.author.tag} dans #${(message.channel as TextChannel).name}`);
    } catch (err) {
      logger.error(`[FAQ] Erreur: ${err instanceof Error ? err.message : String(err)}`);
    }
  });

  logger.info(`[FAQ] Auto-responder activé${FAQ_CHANNELS.length > 0 ? ` (${FAQ_CHANNELS.length} salon(s))` : " (tous salons)"}`);
}
