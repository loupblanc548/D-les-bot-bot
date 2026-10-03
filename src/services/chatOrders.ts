const CAPABILITY = /\b(?:tu peux|peux-tu|peux tu|est-ce que|capable|juste pour savoir)\b/i;

export type ChatOrder =
  | {
      tool: "moveOrCopyMessages";
      args: { mode: "copy" | "move"; amount: number; targetChannelId: string };
    }
  | { tool: "playMp3"; args: { name: string } }
  | { tool: "joinVoice"; args: Record<string, never> }
  | { tool: "leaveVoice"; args: Record<string, never> };

function amountFrom(text: string): number {
  if (/\b(dernier|dernière|derniere|1)\b/i.test(text)) return 1;
  const count = text.match(/\b(\d{1,2})\b/);
  if (count) return Math.min(30, Math.max(1, Number(count[1])));
  return 10;
}

function targetFrom(text: string): string | null {
  const channelMention = text.match(/<#(\d{17,20})>/);
  if (channelMention) return channelMention[1];
  if (/\b(ce salon|même salon|meme salon|ici)\b/i.test(text)) return "__same__";
  const named = text.match(/#([a-z0-9-]{2,80})/i);
  if (named) return named[1];
  const vers = text.match(
    /\b(?:vers|dans|au)\s+(?:le\s+|la\s+|l')?(?:salon\s+)?([a-z0-9][a-z0-9-]{1,40})/i,
  );
  return vers?.[1] ?? null;
}

/** Ordre clair de copie, déplacement, vocal ou MP3. Une question de capacité ne compte pas. */
export function extractChatOrder(text: string): ChatOrder | null {
  const source = text.trim();
  if (!source || CAPABILITY.test(source)) return null;

  if (/\b(copi\w*|d[ée]plac\w*)\b/i.test(source)) {
    const targetChannelId = targetFrom(source);
    if (!targetChannelId) return null;
    const mode = /\bd[ée]plac\w*/i.test(source) ? "move" : "copy";
    return {
      tool: "moveOrCopyMessages",
      args: { mode, amount: amountFrom(source), targetChannelId },
    };
  }

  if (/\b(joue|jouer|lis|lire)\b/i.test(source) && /\b(mp3|son|audio)\b/i.test(source)) {
    const name = source
      .replace(/\b(joue|jouer|lis|lire|un|une|le|la|mp3|son|audio|s'il te plaît|stp)\b/gi, "")
      .replace(/[.?!,;:]+/g, " ")
      .replace(/\s+/g, " ")
      .trim()
      .slice(0, 80);
    return { tool: "playMp3", args: { name } };
  }

  if (/\b(quitte|sors)\b/i.test(source) && /\bvocal\b/i.test(source)) {
    return { tool: "leaveVoice", args: {} };
  }

  if (/\brejoins?\b/i.test(source) && /\bvocal\b/i.test(source)) {
    return { tool: "joinVoice", args: {} };
  }

  return null;
}

export function resolveChatOrder(order: ChatOrder, currentChannelId: string): ChatOrder {
  if (order.tool !== "moveOrCopyMessages") return order;
  if (order.args.targetChannelId !== "__same__") return order;
  return {
    ...order,
    args: { ...order.args, targetChannelId: currentChannelId },
  };
}
