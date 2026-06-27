import { Client, Message, AttachmentBuilder } from "discord.js";
import logger from "../../utils/logger.js";
import { readdir } from "fs/promises";
import { join } from "path";
import { createClient } from "redis";

const redis = createClient({
  url: process.env.REDIS_URL || "redis://localhost:6379",
});

redis.on("error", (err: Error) => logger.error("[Redis] Error:", err));
redis.connect().catch((err) => logger.error("[Redis] Connect error:", err));

const MEDIA_DIR = join(process.cwd(), "media");
const VALID_EXTENSIONS = [".mp3", ".mp4", ".wav", ".mov"];

const RP_TEXTS = [
  "Transmission reçue des lignes frontalières. Les Helldivers tiennent bon.",
  "Rapport de terrain : Suppression d'un nid de Terminides confirmée.",
  "Alerte stratégique : Renforts demandés secteur 7. En attente d'ordres.",
  "Mission accomplie. Démocratie préservée. Pour Super Earth !",
  "Patrouille terminée. Aucune activité hostile détectée.",
  "Transmission cryptée : Coordonnées de largage reçues. Prêt au déploiement.",
  "Rapport médical : Pertes minimales. Moral des troupes au maximum.",
  "Alerte météo : Orage ionique imminent. Abri recommandé.",
  "Transmission de commandement : Nouvelle directive reçue. Exécution immédiate.",
  "Rapport logistique : Ravitaillement en cours. Stocks au vert.",
];

export async function handleMediaResponse(client: Client, message: Message): Promise<void> {
  try {
    if (!client.user || !message.mentions.has(client.user)) return;

    const mediaFiles = await getMediaFiles();

    if (mediaFiles.length === 0) {
      await sendTextResponse(message);
      return;
    }

    const useMedia = Math.random() < 0.5;

    if (useMedia) {
      await sendMediaResponse(message, mediaFiles);
    } else {
      await sendTextResponse(message);
    }
  } catch (error) {
    logger.error("[MediaResponder] Error:", error);
    await sendTextResponse(message);
  }
}

async function getMediaFiles(): Promise<string[]> {
  try {
    const files = await readdir(MEDIA_DIR);
    return files.filter((file) => VALID_EXTENSIONS.some((ext) => file.toLowerCase().endsWith(ext)));
  } catch (error) {
    logger.error("[MediaResponder] Error reading media directory:", error);
    return [];
  }
}

async function sendMediaResponse(message: Message, mediaFiles: string[]): Promise<void> {
  try {
    const randomFile = mediaFiles[Math.floor(Math.random() * mediaFiles.length)];
    const filePath = join(MEDIA_DIR, randomFile);

    const attachment = new AttachmentBuilder(filePath);

    await message.reply({
      content: "🔊 **[TRANSMISSION CAPTURÉE]**",
      files: [attachment],
    });

    logger.info(`[MediaResponder] Sent media: ${randomFile}`);
  } catch (error) {
    logger.error("[MediaResponder] Error sending media:", error);
    await sendTextResponse(message);
  }
}

async function sendTextResponse(message: Message): Promise<void> {
  try {
    const randomText = RP_TEXTS[Math.floor(Math.random() * RP_TEXTS.length)];

    await message.reply({
      content: `📡 **[TRANSMISSION ÉCRITE]**\n\n${randomText}`,
    });

    logger.info("[MediaResponder] Sent text response");
  } catch (error) {
    logger.error("[MediaResponder] Error sending text:", error);
  }
}
