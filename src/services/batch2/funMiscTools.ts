import type { ToolCallResult } from "../agentTools.js";

const ok = (d: string): ToolCallResult => ({ success: true, data: d });
const err = (d: string): ToolCallResult => ({ success: false, data: d });

export async function toolWorkoutGenerator(args: Record<string, unknown>): Promise<ToolCallResult> {
  const goal = String(args.goal || "strength").trim();
  const level = String(args.level || "beginner").trim();
  const dur = Number(args.duration) || 30;
  const wos: Record<string, string[]> = {
    strength: [
      "Pompes: 3x10",
      "Squats: 3x15",
      "Planche: 3x30s",
      "Dips: 3x8",
      "Fentes: 3x10/jambe",
      "Gainage: 3x45s",
    ],
    cardio: [
      "Jumping jacks: 3min",
      "Burpees: 3x10",
      "Mountain climbers: 3x30s",
      "Corde: 5min",
      "High knees: 3x30s",
    ],
    flexibility: [
      "Ischio: 30s",
      "Quadriceps: 30s",
      "Dos: 30s",
      "Pigeon: 30s/côté",
      "Épaules: 30s",
      "Cobra: 30s",
    ],
    weight_loss: [
      "Burpees: 4x12",
      "Jumping jacks: 4x30s",
      "Mountain climbers: 4x30s",
      "Squat jumps: 4x15",
      "High knees: 4x30s",
    ],
    muscle_gain: [
      "Pompes diamant: 4x10",
      "Squats bulgares: 4x8/jambe",
      "Pompes explosives: 4x8",
      "Tractions: 4x6",
      "Dips: 4x10",
    ],
  };
  const ex = wos[goal] || wos.strength;
  const sets = level === "advanced" ? 4 : level === "intermediate" ? 3 : 2;
  return ok(
    `💪 **Séance ${goal} (${level}, ${dur}min)**\n\n${ex
      .slice(0, Math.max(4, Math.floor(dur / 5)))
      .map((e) => e.replace(/(\d+)x/g, `${sets}x`))
      .join("\n")}\n🔥 Repos: 60s`,
  );
}

export async function toolNameGenerator(args: Record<string, unknown>): Promise<ToolCallResult> {
  const type = String(args.type || "fantasy").trim();
  const count = Math.min(Number(args.count) || 3, 10);
  const names: Record<string, string[]> = {
    fantasy: [
      "Aelindra",
      "Thandoril",
      "Mystria",
      "Kaelthas",
      "Lyriandel",
      "Zephiron",
      "Elowen",
      "Drakonar",
      "Sylvaris",
      "Galadron",
    ],
    scifi: [
      "Zylox",
      "Nex-7",
      "Vortex",
      "Cybella",
      "Quantex",
      "Nova-9",
      "Stellaris",
      "Eon-X",
      "Pulsar",
      "Zenithra",
    ],
    medieval: [
      "Aldric",
      "Edmund",
      "Guinevere",
      "Roland",
      "Isabella",
      "Godfrey",
      "Eleanor",
      "Reginald",
      "Matilda",
      "Percival",
    ],
    pirate: [
      "Captain Redbeard",
      "Black Jack",
      "Salty Sam",
      "Ironhook",
      "Davy Jones",
      "One-Eyed Pete",
      "Cutlass Kate",
      "Barnacle Bill",
    ],
    superhero: [
      "Shadow Strike",
      "Iron Guardian",
      "Thunder Bolt",
      "Night Phoenix",
      "Crystal Blade",
      "Storm Rider",
      "Frost Wolf",
      "Solar Flare",
    ],
    band: [
      "Electric Waves",
      "Neon Shadows",
      "Crimson Echo",
      "Midnight Frequency",
      "Velvet Thunder",
      "Lost Static",
      "Paper Tigers",
    ],
    startup: [
      "Quantrix",
      "Flowly",
      "Zentap",
      "Nuvora",
      "Piktr",
      "Devio",
      "Stackly",
      "Bridgera",
      "Lumina",
      "Codexa",
    ],
  };
  const list = names[type] || names.fantasy;
  return ok(
    `📛 **Noms ${type}:**\n${list
      .sort(() => Math.random() - 0.5)
      .slice(0, count)
      .map((n, i) => `${i + 1}. ${n}`)
      .join("\n")}`,
  );
}

export async function toolZodiacCompatibility(
  args: Record<string, unknown>,
): Promise<ToolCallResult> {
  const s1 = String(args.sign1 || "")
      .trim()
      .toLowerCase(),
    s2 = String(args.sign2 || "")
      .trim()
      .toLowerCase();
  if (!s1 || !s2) return err("Paramètres: sign1, sign2");
  const compat: Record<string, string[]> = {
    aries: ["leo", "sagittarius", "gemini", "aquarius"],
    taurus: ["virgo", "capricorn", "cancer", "pisces"],
    gemini: ["aquarius", "libra", "aries", "leo"],
    cancer: ["pisces", "scorpio", "taurus", "virgo"],
    leo: ["aries", "sagittarius", "gemini", "libra"],
    virgo: ["taurus", "capricorn", "cancer", "scorpio"],
    libra: ["gemini", "aquarius", "leo", "sagittarius"],
    scorpio: ["cancer", "pisces", "virgo", "capricorn"],
    sagittarius: ["aries", "leo", "libra", "aquarius"],
    capricorn: ["taurus", "virgo", "scorpio", "pisces"],
    aquarius: ["gemini", "libra", "sagittarius", "aries"],
    pisces: ["cancer", "scorpio", "taurus", "capricorn"],
  };
  const good = compat[s1]?.includes(s2);
  const score = good ? 85 + Math.floor(Math.random() * 15) : 40 + Math.floor(Math.random() * 30);
  return ok(
    `❤️ **${s1} & ${s2}**\nScore: ${score}%\n${score >= 75 ? "✅ Excellent!" : score >= 50 ? "🤔 Moyen" : "❌ Difficile"}`,
  );
}

export async function toolTextToSpeechInfo(_a: Record<string, unknown>): Promise<ToolCallResult> {
  return ok(
    `🗣️ **Voix TTS:**\n\n**Edge TTS (neural, gratuit):**\nFR: Denise/Henri | EN: Jenny/Guy | ES: Elvira | DE: Katja | IT: Elsa | PT: Francisca | JP: Nanami | CN: Xiaoxiao | AR: Zariyah | +40 langues\n\n**StreamElements (Polly):**\nFR: Celine/Mathieu | EN: Joanna/Matthew\n\n**ElevenLabs (premium):**\nConfigure ELEVENLABS_API_KEY\n\nLe bot répond en vocal automatiquement!`,
  );
}
