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
  /^(comment|pourquoi|explique|expliques|c['’ ]?est quoi|cest quoi|qu['’]?est[- ]ce|quest-ce|quel(?:le|s|les)?\b|combien|o[uù]\b|how |why |what |who |when |where |write |[ée]cris|aide[- ]moi|help |fais |peux[- ]tu|peut[- ]on|can you|could you|please |dis[- ]moi|raconte|r[ée]sume|r[ée]sume|compare|diff[ée]rence)/i;

/**
 * True if the message should go through the agent loop (tools + multi-step).
 */
export function needsAgentLoop(content: string): boolean {
  const text = content.trim();
  if (!text) return false;
  if (text.length > 80) return true;
  if (/[?？]/.test(text)) return true;
  if (/https?:\/\//i.test(text)) return true;
  if (/\[Image jointe:/i.test(text)) return true;
  if (TOOL_OR_TASK_RE.test(text)) return true;
  if (QUESTION_STARTER_RE.test(text)) return true;
  return false;
}
