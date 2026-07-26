/**
 * tools.ts — Sources de connaissances utilitaires (outils)
 * QR Code, Calculator, Encode/Decode, Hash, UUID, Cron, Regex, Color, Placeholder, Lorem Ipsum
 */

export async function fetchQrCode(query: string): Promise<string | null> {
  const lower = query.toLowerCase();
  const match =
    lower.match(/qr code(?:de|pour|for)?\s*(.+)/) || lower.match(/g[ée]n[ée]re?\s*(?:un)?\s*qr/);
  if (!match) return null;

  const content = match[1]?.replace(/[?.!]/g, "").trim();
  if (!content || content.length < 2) return null;

  const qrUrl = `https://api.qrserver.com/v1/create-qr-code/?size=300x300&data=${encodeURIComponent(content)}`;
  return `📱 **QR Code généré:**\n${qrUrl}\nScannez cette URL pour obtenir le QR code.`;
}

export async function fetchCalculator(query: string): Promise<string | null> {
  const lower = query.toLowerCase();
  const match =
    lower.match(/calcule\s+(.+)/) || lower.match(/combien fait\s+(.+)/) || lower.match(/=\s*(.+)/);
  if (!match) return null;

  const expr = match[1].replace(/[?]/g, "").trim();
  if (!expr || expr.length < 1) return null;

  if (!/^[\d\s+\-*/().%^]+$/.test(expr)) return null;

  try {
    const jsExpr = expr.replace(/\^/g, "**").replace(/%/g, "/100*");
    if (/[a-zA-Z]/.test(jsExpr)) return null;
    const result = Function(`"use strict"; return (${jsExpr})`)();
    if (typeof result === "number" && !isNaN(result) && isFinite(result)) {
      return `🧮 **${expr}** = **${result}**`;
    }
  } catch {
    return null;
  }
  return null;
}

export async function fetchEncodeDecode(query: string): Promise<string | null> {
  const lower = query.toLowerCase();

  const b64enc = lower.match(/base64\s*(?:encode|encoder)\s+(.+)/);
  if (b64enc) {
    try {
      const result = Buffer.from(b64enc[1].trim()).toString("base64");
      return `🔐 **Base64 encode:**\n\`${result}\``;
    } catch {
      return null;
    }
  }

  const b64dec = lower.match(/base64\s*(?:decode|d[ée]coder)\s+(.+)/);
  if (b64dec) {
    try {
      const result = Buffer.from(b64dec[1].trim(), "base64").toString("utf-8");
      return `🔓 **Base64 decode:**\n\`${result}\``;
    } catch {
      return null;
    }
  }

  const urlEnc = lower.match(/url\s*(?:encode|encoder)\s+(.+)/);
  if (urlEnc) {
    const result = encodeURIComponent(urlEnc[1].trim());
    return `🔗 **URL encode:**\n\`${result}\``;
  }

  const urlDec = lower.match(/url\s*(?:decode|d[ée]coder)\s+(.+)/);
  if (urlDec) {
    try {
      const result = decodeURIComponent(urlDec[1].trim());
      return `🔗 **URL decode:**\n\`${result}\``;
    } catch {
      return null;
    }
  }

  const hexEnc = lower.match(/hex\s*(?:encode|encoder)\s+(.+)/);
  if (hexEnc) {
    const result = Buffer.from(hexEnc[1].trim()).toString("hex");
    return `🔐 **Hex encode:**\n\`${result}\``;
  }

  return null;
}

export async function fetchHash(query: string): Promise<string | null> {
  const lower = query.toLowerCase();
  const match = lower.match(/(?:hash|md5|sha256|sha512)\s+(?:de|of)?\s+(.+)/);
  if (!match) return null;

  const algoMatch = lower.match(/(md5|sha256|sha512)/);
  const algo = algoMatch?.[1] || "sha256";
  const input = match[1].replace(/[?.!]/g, "").trim();
  if (!input) return null;

  try {
    const crypto = await import("node:crypto");
    const hash = crypto.createHash(algo).update(input).digest("hex");
    return `🔐 **${algo.toUpperCase()}** de \`${input}\`:\n\`${hash}\``;
  } catch {
    return null;
  }
}

export async function fetchUuid(query: string): Promise<string | null> {
  const lower = query.toLowerCase();
  if (!lower.match(/g[ée]n[ée]re?\s*(?:un)?\s*uuid|generate uuid|uuid al[ée]atoire/)) return null;

  try {
    const crypto = await import("node:crypto");
    const uuid = crypto.randomUUID();
    return `🆔 **UUID généré:**\n\`${uuid}\``;
  } catch {
    return null;
  }
}

export async function fetchCronExplain(query: string): Promise<string | null> {
  const lower = query.toLowerCase();
  const match = lower.match(
    /(?:cron|explique cron)\s+([\d*/,-]+\s+[\d*/,-]+\s+[\d*/,-]+\s+[\d*/,-]+\s+[\d*/,-]+)/,
  );
  if (!match) return null;
  const expr = match[1].trim();
  const parts = expr.split(/\s+/);
  if (parts.length !== 5) return null;

  const fieldNames = ["Minute", "Heure", "Jour du mois", "Mois", "Jour de la semaine"];
  const desc = parts.map((p, i) => {
    if (p === "*") return `${fieldNames[i]}: chaque`;
    if (p.startsWith("*/")) return `${fieldNames[i]}: toutes les ${p.slice(2)}`;
    if (p.includes(",")) return `${fieldNames[i]}: ${p.split(",").join(", ")}`;
    if (p.includes("-")) return `${fieldNames[i]}: de ${p.replace("-", " à ")}`;
    return `${fieldNames[i]}: ${p}`;
  });
  return `⏰ **Expression cron: \`${expr}\`**\n\n${desc.join("\n")}`;
}

export async function fetchRegexTester(query: string): Promise<string | null> {
  const lower = query.toLowerCase();
  const match = lower.match(/(?:regex|test regex)\s+\/(.+)\/\s+(?:sur|on|against)\s+(.+)/);
  if (!match) return null;
  const pattern = match[1];
  const text = match[2];

  try {
    const regex = new RegExp(pattern, "gi");
    const matches = text.match(regex);
    if (!matches || matches.length === 0)
      return `🔍 **Test regex:** \`${pattern}\`\n\nTexte: \`${text}\`\n❌ Aucun match trouvé.`;
    return `🔍 **Test regex:** \`${pattern}\`\n\nTexte: \`${text}\`\n✅ ${matches.length} match(s) trouvé(s):\n${matches
      .slice(0, 10)
      .map((m) => `• \`${m}\``)
      .join("\n")}`;
  } catch (err) {
    return `🔍 **Regex invalide:** ${err instanceof Error ? err.message : String(err)}`;
  }
}

export async function fetchColorPalette(query: string): Promise<string | null> {
  const lower = query.toLowerCase();
  if (!lower.includes("palette") && !lower.includes("color palette") && !lower.includes("couleurs"))
    return null;
  const hexMatch = lower.match(/#([0-9a-f]{6})/);
  const baseColor = hexMatch ? `#${hexMatch[1]}` : "#5865f2";

  const hexToRgb = (hex: string) => {
    const r = parseInt(hex.slice(1, 3), 16);
    const g = parseInt(hex.slice(3, 5), 16);
    const b = parseInt(hex.slice(5, 7), 16);
    return { r, g, b };
  };
  const rgbToHex = (r: number, g: number, b: number) =>
    `#${[r, g, b]
      .map((x) =>
        Math.max(0, Math.min(255, Math.round(x)))
          .toString(16)
          .padStart(2, "0"),
      )
      .join("")}`;

  const { r, g, b } = hexToRgb(baseColor);
  const complementary = rgbToHex(255 - r, 255 - g, 255 - b);
  const lighter = rgbToHex(r + 40, g + 40, b + 40);
  const darker = rgbToHex(r - 40, g - 40, b - 40);
  const analogous1 = rgbToHex(r + 20, g - 20, b);
  const analogous2 = rgbToHex(r - 20, g + 20, b);

  return `🎨 **Palette de couleurs — base ${baseColor}**\n\nBase: ${baseColor}\nComplémentaire: ${complementary}\nPlus clair: ${lighter}\nPlus foncé: ${darker}\nAnalogue 1: ${analogous1}\nAnalogue 2: ${analogous2}`;
}

export async function fetchPlaceholderImage(query: string): Promise<string | null> {
  const lower = query.toLowerCase();
  const match = lower.match(/(?:placeholder|image test)\s+(\d+)x?(\d+)?/);
  if (!match) return null;
  const w = match[1] || "300";
  const h = match[2] || w;
  return `🖼️ **Image placeholder:**\nhttps://via.placeholder.com/${w}x${h}\n\nUtilise cette URL pour tester des affichages.`;
}

export async function fetchLoremIpsum(query: string): Promise<string | null> {
  const lower = query.toLowerCase();
  if (
    !lower.includes("lorem ipsum") &&
    !lower.includes("texte de remplissage") &&
    !lower.includes("filler text")
  )
    return null;
  const countMatch = lower.match(/(\d+)/);
  const count = countMatch ? parseInt(countMatch[1]) : 3;

  try {
    const url = `https://baconipsum.com/api/?type=all-meat&paras=${Math.min(count, 10)}`;
    const res = await fetch(url, { signal: AbortSignal.timeout(5_000) });
    if (!res.ok) return null;
    const data = (await res.json()) as string[];
    if (!data || data.length === 0) return null;
    return `📝 **Lorem Ipsum (${data.length} paragraphes):**\n\n${data.join("\n\n")}`;
  } catch {
    return null;
  }
}
