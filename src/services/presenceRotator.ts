/**
 * Présence Discord de John : activités qui tournent, comme quelqu'un
 * qui fait autre chose que regarder le même statut 24h/24.
 */
import { ActivityType, Client, type PresenceStatusData } from "discord.js";
import logger from "../utils/logger.js";
import { savePresence } from "./networkResilience.js";

/** Description de l'application Discord (limite 400 caractères). */
export const BOT_DESCRIPTION =
  "John, le bot du serveur. Pose-moi une question, je réponds — jeux, code, cuisine, devoirs, actu. Je poste aussi les news gaming, la boutique Fortnite, les deals, et je surveille un peu le salon. Pas besoin d'un menu : discute.";

export const JOHN_ACTIVITIES: { name: string; type: ActivityType }[] = [
  { type: ActivityType.Playing, name: "Minecraft" },
  { type: ActivityType.Playing, name: "rien de productif" },
  { type: ActivityType.Playing, name: "un jeu indé" },
  { type: ActivityType.Playing, name: "un jeu de cartes" },
  { type: ActivityType.Playing, name: "Helldivers 2" },
  { type: ActivityType.Watching, name: "un tuto cuisine" },
  { type: ActivityType.Watching, name: "la boutique Fortnite" },
  { type: ActivityType.Watching, name: "un speedrun" },
  { type: ActivityType.Watching, name: "les clips du salon" },
  { type: ActivityType.Watching, name: "un film que tout le monde a déjà vu" },
  { type: ActivityType.Listening, name: "le vocal" },
  { type: ActivityType.Listening, name: "la playlist" },
  { type: ActivityType.Listening, name: "vos débats" },
  { type: ActivityType.Listening, name: "un podcast random" },
  { type: ActivityType.Competing, name: "un quiz" },
  { type: ActivityType.Competing, name: "un 1v1" },
];

const ROTATE_MS = 8 * 60 * 1000;

let lastIndex = -1;
let current = JOHN_ACTIVITIES[0];
let started = false;
let rotateTimer: ReturnType<typeof setInterval> | null = null;
let presenceStatus: PresenceStatusData = "online";

export function pickNextActivity(
  list: { name: string; type: ActivityType }[] = JOHN_ACTIVITIES,
  previous = lastIndex,
): { activity: { name: string; type: ActivityType }; index: number } {
  if (list.length === 0) {
    return { activity: { name: "Discord", type: ActivityType.Playing }, index: 0 };
  }
  if (list.length === 1) return { activity: list[0], index: 0 };
  let index = previous;
  while (index === previous) {
    index = Math.floor(Math.random() * list.length);
  }
  return { activity: list[index], index };
}

export function getCurrentActivity(): { name: string; type: ActivityType } {
  return current;
}

export async function applyCurrentPresence(client: Client): Promise<void> {
  if (!client.user) return;
  try {
    await client.user.setPresence({
      status: presenceStatus,
      activities: [{ name: current.name, type: current.type }],
    });
    savePresence({
      status: presenceStatus,
      activities: [{ name: current.name, type: current.type }],
    });
  } catch (err) {
    logger.warn(`[Presence] Maj impossible: ${err instanceof Error ? err.message : String(err)}`);
  }
}

async function rotate(client: Client): Promise<void> {
  const next = pickNextActivity();
  lastIndex = next.index;
  current = next.activity;
  await applyCurrentPresence(client);
  logger.info(`[Presence] ${activityVerb(current.type)} ${current.name}`);
}

function activityVerb(type: ActivityType): string {
  switch (type) {
    case ActivityType.Playing:
      return "Joue à";
    case ActivityType.Listening:
      return "Écoute";
    case ActivityType.Watching:
      return "Regarde";
    case ActivityType.Competing:
      return "Fait";
    default:
      return "Fait";
  }
}

export function setPresenceStatus(status: PresenceStatusData): void {
  presenceStatus = status;
}

export function startPresenceRotator(client: Client): void {
  if (started) return;
  started = true;
  void rotate(client);
  rotateTimer = setInterval(() => {
    void rotate(client);
  }, ROTATE_MS);
  if (rotateTimer.unref) rotateTimer.unref();
  logger.info("[Presence] Rotation toutes les 8 min");
}

export function stopPresenceRotator(): void {
  if (rotateTimer) {
    clearInterval(rotateTimer);
    rotateTimer = null;
  }
  started = false;
}

export async function syncBotDescription(client: Client): Promise<void> {
  try {
    const app = await client.application?.fetch();
    if (!app) return;
    if ((app.description ?? "") === BOT_DESCRIPTION) return;
    await app.edit({ description: BOT_DESCRIPTION });
    logger.info("[Profile] Description Discord mise à jour");
  } catch (err) {
    logger.warn(
      `[Profile] Description non mise à jour: ${err instanceof Error ? err.message : String(err)}`,
    );
  }
}
