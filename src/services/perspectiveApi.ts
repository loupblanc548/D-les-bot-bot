import axios from "axios";
import logger from "../utils/logger.js";

const PERSPECTIVE_API_KEY = process.env.PERSPECTIVE_API_KEY || "";
const PERSPECTIVE_URL = "https://commentanalyzer.googleapis.com/v1alpha/comments:analyze";

export interface ToxicityResult {
  toxic: number; severeToxic: number; identityAttack: number; insult: number;
  profanity: number; threat: number; overallScore: number;
  recommendedAction: "allow" | "flag" | "warn" | "remove" | "timeout";
}

export async function analyzeToxicity(text: string, language = "fr"): Promise<ToxicityResult | null> {
  if (!PERSPECTIVE_API_KEY) return null;
  try {
    const res = await axios.post(PERSPECTIVE_URL, {
      comment: { text: text.slice(0, 3000) }, languages: [language],
      requestedAttributes: { TOXICITY: {}, SEVERE_TOXICITY: {}, IDENTITY_ATTACK: {}, INSULT: {}, PROFANITY: {}, THREAT: {} },
    }, { params: { key: PERSPECTIVE_API_KEY }, timeout: 10000 });
    const s = res.data?.attributeScores || {};
    const get = (a: string) => s[a] ? Number(s[a].summaryScore?.value || 0) : 0;
    const toxic = get("TOXICITY"), severeToxic = get("SEVERE_TOXICITY"), identityAttack = get("IDENTITY_ATTACK");
    const insult = get("INSULT"), profanity = get("PROFANITY"), threat = get("THREAT");
    const overallScore = Math.max(toxic, severeToxic, identityAttack, threat);
    let action: ToxicityResult["recommendedAction"] = "allow";
    if (severeToxic > 0.8 || threat > 0.8) action = "remove";
    else if (toxic > 0.7 || identityAttack > 0.7) action = "timeout";
    else if (toxic > 0.5 || insult > 0.6 || profanity > 0.6) action = "warn";
    else if (toxic > 0.3 || insult > 0.4) action = "flag";
    return { toxic, severeToxic, identityAttack, insult, profanity, threat, overallScore, recommendedAction: action };
  } catch (err) { logger.error(`[Perspective] Error: ${err instanceof Error ? err.message : String(err)}`); return null; }
}

export async function shouldAutoRemove(text: string, language = "fr"): Promise<boolean> {
  const r = await analyzeToxicity(text, language); if (!r) return false;
  return r.recommendedAction === "remove" || r.recommendedAction === "timeout";
}

export function isPerspectiveConfigured(): boolean { return PERSPECTIVE_API_KEY.length > 0; }
