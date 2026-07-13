export interface AbusePattern {
  id: string;
  name: string;
  pattern: RegExp;
  severity: "low" | "medium" | "high" | "critical";
  action: "flag" | "warn" | "remove" | "timeout" | "ban";
  description: string;
}
export interface AbuseMatch {
  pattern: AbusePattern;
  matchedText: string;
  position: number;
}

const BUILTIN: AbusePattern[] = [
  {
    id: "repeated-chars",
    name: "Repeated Characters",
    pattern: /(.)\1{10,}/,
    severity: "low",
    action: "flag",
    description: "Excessive repeated characters",
  },
  {
    id: "caps-spam",
    name: "Caps Lock Spam",
    pattern: /[A-Z]{50,}/,
    severity: "medium",
    action: "warn",
    description: "Excessive capital letters",
  },
  {
    id: "link-spam",
    name: "Link Spam",
    pattern: /(https?:\/\/[^\s]+[\s]*){4,}/,
    severity: "high",
    action: "remove",
    description: "Multiple links",
  },
  {
    id: "mention-spam",
    name: "Mention Spam",
    pattern: /<@!?\d+>[\s]*<@!?\d+>[\s]*<@!?\d+>[\s]*<@!?\d+>[\s]*<@!?\d+>/,
    severity: "high",
    action: "timeout",
    description: "Mass mentions",
  },
  {
    id: "discord-invite",
    name: "Discord Invite",
    pattern: /discord\.(gg|com\/invite)\/[a-zA-Z0-9]+/i,
    severity: "medium",
    action: "warn",
    description: "Discord invite link",
  },
  {
    id: "ip-logger",
    name: "IP Logger",
    pattern: /(grabify|iplogger|2no\.co)/i,
    severity: "critical",
    action: "ban",
    description: "IP logger detected",
  },
  {
    id: "nitro-scam",
    name: "Nitro Scam",
    pattern: /(free\s*nitro|nitro\s*giveaway|steam\s*gift)/i,
    severity: "critical",
    action: "ban",
    description: "Nitro/Steam scam",
  },
  {
    id: "raid-phrase",
    name: "Raid Phrase",
    pattern: /(raid\s*start|raid\s*time|join\s*the\s*raid)/i,
    severity: "critical",
    action: "ban",
    description: "Raid coordination",
  },
  {
    id: "zalgo-text",
    name: "Zalgo Text",
    // eslint-disable-next-line no-misleading-character-class
    pattern: /[\u0300-\u036f\u1ab0-\u1aff\u1dc0-\u1dff\u20d0-\u20ff\ufe20-\ufe2f]{5,}/u,
    severity: "medium",
    action: "warn",
    description: "Zalgo/corrupted text",
  },
];

const custom: AbusePattern[] = [];
export function addPattern(p: AbusePattern): void {
  custom.push(p);
}
export function removePattern(id: string): boolean {
  const i = custom.findIndex((p) => p.id === id);
  if (i >= 0) {
    custom.splice(i, 1);
    return true;
  }
  return false;
}
export function getPatterns(): AbusePattern[] {
  return [...BUILTIN, ...custom];
}

export function checkMessage(text: string): AbuseMatch[] {
  return getPatterns()
    .map((p) => {
      const m = text.match(p.pattern);
      return m ? { pattern: p, matchedText: m[0].slice(0, 100), position: m.index || 0 } : null;
    })
    .filter(Boolean) as AbuseMatch[];
}

export function shouldBlock(text: string): { block: boolean; action: string; reason: string } {
  const matches = checkMessage(text);
  if (matches.length === 0) return { block: false, action: "allow", reason: "" };
  const sev = { critical: 4, high: 3, medium: 2, low: 1 };
  const highest = matches.reduce((h, c) =>
    sev[c.pattern.severity] > sev[h.pattern.severity] ? c : h,
  );
  return {
    block: highest.pattern.action !== "flag",
    action: highest.pattern.action,
    reason: highest.pattern.description,
  };
}
