export type Provider = 'local' | 'openai' | 'anthropic' | 'openrouter';

export async function callAi(prompt: string, opts?: any) {
  const order = (process.env.AI_PROVIDER_ORDER || "local,openai").split(",");
  for (const p of order) {
    try {
      if (p === 'local') {
        // call local LLM endpoint
      } else if (p === 'openai') {
        // call OpenAI via key
      }
      // return response if ok
    } catch (e) {
      console.warn(`[aiGateway] provider ${p} failed: ${e instanceof Error ? e.message : String(e)}`);
      continue;
    }
  }
  throw new Error("No AI provider available");
}
