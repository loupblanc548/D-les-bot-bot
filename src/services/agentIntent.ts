/**
 * agentIntent.ts — Décide si un message Discord mérite la boucle agent (tools)
 * ou un simple chat.
 *
 * Une IA généraliste doit raisonner + chercher dès qu'il y a une vraie question.
 * Le fast-path chat reste pour le bavardage court sans demande.
 */

const TOOL_OR_TASK_RE =
  /\b(cherche|search|recherche|trouve|find|look up|analyse|analyze|scan|v[ée]rifie|check|test|calcule|calculate|compute|r[ée]sous|solve|convert|transform|encode|decode|hash|m[ée]t[ée]o|weather|prix|price|crypto|stock|github|repo|commit|issue|pull request|site|url|page|lien|link|https?:\/\/|image|screenshot|photo|g[ée]n[èe]re|generate|dessine|code|script|ex[ée]cute|execute|\brun\b|wikipedia|wiki|news|article|vid[ée]o|youtube|meme|blague|joke|citation|quote|translate|traduis|langue|language|deal|promo|shop|boutique|serveur|server|ping|dns|domain|\bip\b|password|mot de passe|token|cl[ée]|\bkey\b)\b/i;

const QUESTION_STARTER_RE =
  /^(comment|pourquoi|explique|expliques|c['’ ]?est quoi|cest quoi|qu['’]?est[- ]ce|quest-ce|quel(?:le|s|les)?\b|combien|o[uù]\b|how |why |what |who |when |where |write |[ée]cris|aide[- ]moi|help |fais |peux[- ]tu|peut[- ]on|can you|could you|please |dis[- ]moi|raconte|parle[- ]moi|ton avis|tu penses|t['’]en penses|r[ée]sume|compare|diff[ée]rence)/i;

/** « tu es là ? » / « tu est la » — présence, pas une vraie question. */
const PRESENCE_PING_RE =
  /^(?:(?:salut|hey|hi|yo|hello|coucou|wesh|slt)[\s,!]*)?(?:tu\s+es[t]?\s+l[aà]|t['’ ]?es\s+l[aà]|you\s+(?:still\s+)?(?:there|here)|are\s+you\s+(?:still\s+)?(?:there|here)|still\s+there|y\s*a(?:-t-il)?\s+quelqu['’]?un|anyone\s+(?:there|here)|you\s+up)\s*[?!.]*$/i;

export function isPresencePing(content: string): boolean {
  const text = content
    .replace(/\[LANGUAGE INSTRUCTION\][\s\S]*?\n\n/i, "")
    .replace(/<@!?\d+>/g, "")
    .trim();
  if (!text) return false;
  return PRESENCE_PING_RE.test(text);
}

/**
 * True if the message should go through the agent loop (tools + multi-step).
 */
export function needsAgentLoop(content: string): boolean {
  const text = content.trim();
  if (!text) return false;
  if (isPresencePing(text)) return false;
  if (text.length > 25) return true;
  if (/[?？]/.test(text)) return true;
  if (/https?:\/\//i.test(text)) return true;
  if (/\[Image jointe:/i.test(text)) return true;
  if (TOOL_OR_TASK_RE.test(text)) return true;
  if (QUESTION_STARTER_RE.test(text)) return true;
  return false;
}
