/**
 * Helpers for driving the « encore un test » bot against live John.
 * Network I/O lives in scripts/discord-tester-probe.ts so unit tests stay offline.
 */
export const DEFAULT_JOHN_BOT_USER_ID = "1512435587926200391";
export const DEFAULT_TEST_CHANNEL_ID = "1497977006510440700";

export type ProbeChannelMessage = {
  id: string;
  author?: { id?: string; username?: string; bot?: boolean };
  content?: string | null;
  mentions?: Array<{ id?: string }>;
  message_reference?: { message_id?: string } | null;
  timestamp?: string;
};

export function snowflakeAfter(candidateId: string, afterId: string): boolean {
  try {
    return BigInt(candidateId) > BigInt(afterId);
  } catch {
    return candidateId > afterId;
  }
}

export function buildJohnMention(
  text: string,
  johnId: string = DEFAULT_JOHN_BOT_USER_ID,
): string {
  const body = text.trim();
  return body ? `<@${johnId}> ${body}` : `<@${johnId}>`;
}

export function findJohnReplyAfter(
  messages: ProbeChannelMessage[],
  afterMessageId: string,
  johnId: string = DEFAULT_JOHN_BOT_USER_ID,
): ProbeChannelMessage | undefined {
  return messages.find(
    (m) => m.author?.id === johnId && snowflakeAfter(m.id, afterMessageId),
  );
}

export function summarizeProbeMessage(m: ProbeChannelMessage): string {
  const author = m.author?.username ?? m.author?.id ?? "?";
  const content = (m.content ?? "").trim();
  const contentBit = content
    ? `content=${JSON.stringify(content.slice(0, 180))}`
    : "content=(empty — enable Message Content Intent on the tester to read John's text)";
  const ref = m.message_reference?.message_id
    ? ` reply_to=${m.message_reference.message_id}`
    : "";
  return `${m.id} ${author} ${contentBit}${ref}`;
}
