import cron from "node-cron";
import { Client, TextChannel, ChannelType } from "discord.js";
import logger from "../utils/logger.js";
import { config } from "../config.js";
import { fetchBoutique, buildBoutiqueEmbeds } from "../commands/fun/boutique.js";

// Anti-doublon : stocke la date de la dernière boutique postée
let lastPostedShopDate: string | null = null;
let isRunning = false;

async function postBoutiqueToChannel(client: Client): Promise<void> {
  if (isRunning) {
    logger.warn("[BoutiqueCron] Déjà en cours, skip");
    return;
  }
  isRunning = true;

  try {
    const data = await fetchBoutique();
    if (!data) {
      logger.warn("[BoutiqueCron] API indisponible, skip");
      return;
    }

    // Anti-doublon : ne pas reposter si la date n'a pas changé
    if (lastPostedShopDate === data.date) {
      logger.info(`[BoutiqueCron] Boutique ${data.date} déjà postée, skip`);
      return;
    }

    const embeds = buildBoutiqueEmbeds(data);
    if (embeds.length === 0) {
      logger.warn("[BoutiqueCron] Aucun embed à poster");
      return;
    }

    const channelId = config.boutiqueChannel;
    if (!channelId) {
      logger.warn("[BoutiqueCron] Aucun salon configuré");
      return;
    }

    const channel = await client.channels.fetch(channelId).catch(() => null);
    if (!channel || channel.type !== ChannelType.GuildText) {
      logger.warn(`[BoutiqueCron] Salon ${channelId} inaccessible`);
      return;
    }

    await (channel as TextChannel).send({
      content: "🛒 **Boutique Fortnite du jour mise à jour automatiquement**",
      embeds,
    });

    lastPostedShopDate = data.date;
    logger.info(`[BoutiqueCron] Boutique ${data.date} postée dans ${channelId}`);
  } catch (err) {
    logger.error("[BoutiqueCron] Erreur:", String(err));
  } finally {
    isRunning = false;
  }
}

export function startBoutiqueCron(client: Client): void {
  // Poste la boutique à 10h00 UTC (12h00 FR) chaque jour
  cron.schedule("0 10 * * *", () => {
    logger.info("[BoutiqueCron] Envoi quotidien de la boutique...");
    void postBoutiqueToChannel(client);
  });

  // Vérification de secours toutes les 2h (au cas où la boutique n'est pas encore dispo à 10h)
  cron.schedule("0 */2 * * *", () => {
    if (!lastPostedShopDate) {
      logger.info(
        "[BoutiqueCron] Vérification de secours (boutique non encore postée aujourd'hui)...",
      );
      void postBoutiqueToChannel(client);
    }
  });

  logger.info("[BoutiqueCron] Cron quotidien démarré (10h UTC + vérification secours 2h)");
}
