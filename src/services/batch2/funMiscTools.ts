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

export async function toolTeraTermInfo(args: Record<string, unknown>): Promise<ToolCallResult> {
  const queryType = String(args.query_type || "info")
    .trim()
    .toLowerCase();
  const owner = "TeraTermProject";
  const repo = "teraterm";

  try {
    if (queryType === "release" || queryType === "download") {
      const res = await fetch(`https://api.github.com/repos/${owner}/${repo}/releases/latest`, {
        headers: { "User-Agent": "bot/1.0", Accept: "application/vnd.github.v3+json" },
        signal: AbortSignal.timeout(15_000),
      });
      if (!res.ok) return err(`GitHub API error: ${res.status}`);
      const d = (await res.json()) as {
        tag_name?: string;
        name?: string;
        published_at?: string;
        body?: string;
        html_url?: string;
        assets?: Array<{
          name: string;
          browser_download_url: string;
          size: number;
          download_count: number;
        }>;
      };
      const assets = (d.assets || []).slice(0, 10);
      const date = d.published_at ? new Date(d.published_at).toLocaleDateString("fr-FR") : "N/A";
      if (queryType === "download") {
        return ok(
          `📥 **Tera Term — Téléchargement**\nVersion: **${d.tag_name || "N/A"}** (${date})\n\n**Fichiers:**\n${assets.map((a) => `• [${a.name}](${a.browser_download_url}) — ${(a.size / 1048576).toFixed(1)} MB (${a.download_count} téléchargements)`).join("\n") || "Aucun fichier"}\n\n🔗 Page: ${d.html_url || `https://github.com/${owner}/${repo}/releases`}`,
        );
      }
      return ok(
        `🏷️ **Tera Term — Dernière Release**\nVersion: **${d.tag_name || "N/A"}**\nNom: ${d.name || "N/A"}\nDate: ${date}\n\n${d.body ? d.body.slice(0, 1500) : ""}\n\n🔗 ${d.html_url || `https://github.com/${owner}/${repo}/releases`}`,
      );
    }

    if (queryType === "issues") {
      const res = await fetch(
        `https://api.github.com/repos/${owner}/${repo}/issues?state=open&per_page=5&sort=updated`,
        {
          headers: { "User-Agent": "bot/1.0", Accept: "application/vnd.github.v3+json" },
          signal: AbortSignal.timeout(15_000),
        },
      );
      if (!res.ok) return err(`GitHub API error: ${res.status}`);
      const issues = (await res.json()) as Array<{
        number: number;
        title: string;
        user?: { login: string };
        created_at?: string;
        html_url?: string;
        labels?: Array<{ name: string }>;
      }>;
      if (!issues.length) return ok("✅ Aucun issue ouvert pour Tera Term!");
      return ok(
        `🐛 **Tera Term — Issues ouverts (${issues.length}+):**\n\n${issues.map((i) => `• **#${i.number}** ${i.title}\n  👤 ${i.user?.login || "N/A"} | 🏷️ ${(i.labels || []).map((l) => l.name).join(", ") || "aucun"}\n  🔗 ${i.html_url || ""}`).join("\n\n")}`,
      );
    }

    if (queryType === "docs") {
      return ok(
        `📚 **Tera Term — Documentation**\n\n🔗 **Wiki:** https://github.com/TeraTermProject/teraterm/wiki\n🔗 **Manuel:** https://teratermproject.github.io/manual/5/\n🔗 **README:** https://github.com/TeraTermProject/teraterm/blob/main/README.md\n🔗 **FAQ:** https://teratermproject.github.io/manual/5/faq/\n\nLangues supportées: JP, EN, FR, DE, CN, KR, RU, ES, IT, PT, PL, TR`,
      );
    }

    if (queryType === "features") {
      return ok(
        `⭐ **Tera Term — Fonctionnalités**\n\n🖥️ Émulateur de terminal: VT100/VT200/VT300, ANSI, xterm\n📡 Support: SSH1/SSH2, Telnet, Serial port\n📁 Transfert: Kermit, ZMODEM, B-Plus, Quick-VAN\n🇯🇵 Support Unicode et langues (JP/EN/FR/DE/CN/KR/RU/ES/IT/PT/PL/TR)\n🔌 Macros: scripting Tera Term Language (TTL)\n🎨 Personnalisation: couleurs, polices, raccourcis\n🔒 SSH: clés RSA/DSA/ECDSA/Ed25519, agent forwarding\n🌐 Proxy: SOCKS4/5, HTTP\n📊 Logging: capture de session, replay\n\n🔗 https://github.com/TeraTermProject/teraterm`,
      );
    }

    // Default: general info
    const res = await fetch(`https://api.github.com/repos/${owner}/${repo}`, {
      headers: { "User-Agent": "bot/1.0", Accept: "application/vnd.github.v3+json" },
      signal: AbortSignal.timeout(15_000),
    });
    if (!res.ok) return err(`GitHub API error: ${res.status}`);
    const d = (await res.json()) as {
      full_name?: string;
      description?: string;
      html_url?: string;
      stargazers_count?: number;
      forks_count?: number;
      open_issues_count?: number;
      language?: string;
      license?: { name: string };
      homepage?: string;
      created_at?: string;
      updated_at?: string;
      topics?: string[];
    };
    return ok(
      `🖥️ **Tera Term — Terminal Emulator**\n\n${d.description || "Émulateur de terminal open-source"}\n\n⭐ Stars: ${d.stargazers_count?.toLocaleString() || "N/A"} | 🍴 Forks: ${d.forks_count?.toLocaleString() || "N/A"}\n🐛 Issues: ${d.open_issues_count || 0} | 💻 Langage: ${d.language || "C/C++"}\n📄 Licence: ${d.license?.name || "BSD-3-Clause"}\n🏠 Homepage: ${d.homepage || "https://teratermproject.github.io/"}\n\n🔗 **Repo:** ${d.html_url || `https://github.com/${owner}/${repo}`}\n📥 **Download:** https://github.com/${owner}/${repo}/releases/latest\n📚 **Docs:** https://teratermproject.github.io/manual/5/\n\n**Topics:** ${(d.topics || []).join(", ") || "terminal, emulator, ssh, telnet, serial"}`,
    );
  } catch (e) {
    return err(`Erreur: ${e}`);
  }
}
