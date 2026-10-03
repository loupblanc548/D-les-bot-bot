/** Salon « signalement du bot » : chaque ban réussi y est annoncé. */
export const BAN_SIGNAL_CHANNEL_ID = "1520866527753011220";

const CAPABILITY =
  /\b(?:tu peux|peux-tu|peux tu|est-ce que|capable|juste pour savoir|c'était pour savoir)\b/i;
const BAN_ORDER = /(?:^|[\s,.;:!?])(?:bannis|bannir|ban)\b/i;

/**
 * Ordre clair de ban avec une cible (mention ou identifiant).
 * Une question du type « tu peux bannir » ne compte pas.
 */
export function extractBanOrder(text: string): { userId: string; reason: string } | null {
  const source = text.trim();
  if (!source || CAPABILITY.test(source) || !BAN_ORDER.test(source)) return null;
  const mention = source.match(/<@!?(\d{17,20})>/);
  const snowflake = source.match(/\b(\d{17,20})\b/);
  const userId = mention?.[1] ?? snowflake?.[1];
  if (!userId) return null;
  const reason = source
    .replace(/<@!?\d{17,20}>/g, "")
    .replace(/\b(?:bannis|bannir|ban)\b/gi, "")
    .replace(/\b\d{17,20}\b/g, "")
    .replace(/\s+/g, " ")
    .trim()
    .slice(0, 200);
  return { userId, reason: reason || "Demandé dans le salon" };
}

export function banSignalFields(input: {
  userId: string;
  askedById: string;
  channelId: string;
  channelName: string;
  reason: string;
}): { name: string; value: string; inline?: boolean }[] {
  const channelName = input.channelName.trim() || input.channelId;
  return [
    { name: "Membre banni", value: `<@${input.userId}> (\`${input.userId}\`)` },
    { name: "Demandé par", value: `<@${input.askedById}>`, inline: true },
    {
      name: "Salon concerné",
      value: `<#${input.channelId}> (${channelName})`,
      inline: true,
    },
    { name: "Raison", value: (input.reason || "—").slice(0, 1000) },
  ];
}
