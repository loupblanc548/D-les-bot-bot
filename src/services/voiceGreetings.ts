/**
 * Phrases parlées au join vocal — Piper FR.
 * Jamais le même « yo » collé à chaque entrée.
 */

export const VOICE_JOIN_GREETINGS = [
  "Salut, je suis là.",
  "Hey, je t'écoute.",
  "Coucou, tu peux parler.",
  "Je suis dans le vocal.",
  "Ça va, je t'entends.",
  "Dis-moi, je suis là.",
  "Ouais, je suis branché.",
  "Allez, je t'écoute.",
  "Présent. Parle quand tu veux.",
  "Me voilà.",
  "C'est John, je suis là.",
  "Tranquille, je capte.",
  "Go, micro ouvert.",
  "Je drop dans le vocal.",
  "Parle, je t'écoute.",
  "Wesh, je suis là.",
  "On y va, je t'écoute.",
  "Salut, micro branché.",
  "Je suis dans tes oreilles.",
  "Tu peux y aller.",
  "Hello, je t'entends.",
  "Bah, je suis là.",
  "Nickel, parle.",
  "Je t'écoute, vas-y.",
  "Coucou, c'est John.",
  "Ouais, je capte.",
  "Dis, je suis là.",
  "Salut la team.",
  "Je suis posé, parle.",
  "Allez hop, je t'écoute.",
  "Présent dans le vocal.",
  "T'inquiète, je t'entends.",
  "C'est bon, je suis là.",
  "Ah, je te rejoins.",
  "Salut, raconte.",
] as const;

export const VOICE_FALLBACKS = ["Ouais ?", "Hmm ?", "Je t'écoute.", "Vas-y.", "Dis."] as const;

let lastGreetingIndex = -1;

export function pickVoiceGreeting(
  list: readonly string[] = VOICE_JOIN_GREETINGS,
  previous = lastGreetingIndex,
): { text: string; index: number } {
  if (list.length === 0) return { text: "Je t'écoute.", index: 0 };
  if (list.length === 1) return { text: list[0], index: 0 };
  let index = previous;
  while (index === previous) {
    index = Math.floor(Math.random() * list.length);
  }
  lastGreetingIndex = index;
  return { text: list[index], index };
}

export function pickVoiceFallback(list: readonly string[] = VOICE_FALLBACKS): string {
  if (list.length === 0) return "Je t'écoute.";
  return list[Math.floor(Math.random() * list.length)];
}
