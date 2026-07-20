import type { ToolCallResult } from "../agentTools.js";

const ok = (d: string): ToolCallResult => ({ success: true, data: d });
const err = (d: string): ToolCallResult => ({ success: false, data: d });

export async function toolGeneratePassword(args: Record<string, unknown>): Promise<ToolCallResult> {
  const len = Math.min(Number(args.length) || 16, 128);
  let chars = "";
  if (args.lowercase !== false) chars += "abcdefghijklmnopqrstuvwxyz";
  if (args.uppercase !== false) chars += "ABCDEFGHIJKLMNOPQRSTUVWXYZ";
  if (args.numbers !== false) chars += "0123456789";
  if (args.symbols !== false) chars += "!@#$%^&*()_+-=[]{}|;:,.<>?";
  if (!chars) chars = "abcdefghijklmnopqrstuvwxyz";
  const crypto = await import("node:crypto");
  let pwd = "";
  for (let i = 0; i < len; i++) pwd += chars[crypto.randomInt(chars.length)];
  return ok(`🔐 Mot de passe (${len}):\n\`${pwd}\``);
}

export async function toolPasswordStrength(args: Record<string, unknown>): Promise<ToolCallResult> {
  const pwd = String(args.password || "");
  if (!pwd) return err("Paramètre: password");
  let score = 0;
  const checks: string[] = [];
  if (pwd.length >= 8) {
    score++;
    checks.push("✅ ≥8");
  } else checks.push("❌ <8");
  if (pwd.length >= 16) score++;
  if (/[a-z]/.test(pwd)) {
    score++;
    checks.push("✅ min");
  } else checks.push("❌ min");
  if (/[A-Z]/.test(pwd)) {
    score++;
    checks.push("✅ MAJ");
  } else checks.push("❌ MAJ");
  if (/[0-9]/.test(pwd)) {
    score++;
    checks.push("✅ chiffres");
  } else checks.push("❌ chiffres");
  if (/[^a-zA-Z0-9]/.test(pwd)) {
    score++;
    checks.push("✅ symboles");
  } else checks.push("❌ symboles");
  const labels = ["Très faible", "Faible", "Moyen", "Bon", "Fort", "Très fort", "Excellent"];
  return ok(`🔐 **${labels[Math.min(score, 6)]}** (${score}/6)\n${checks.join(" | ")}`);
}

export async function toolBmiCalculator(args: Record<string, unknown>): Promise<ToolCallResult> {
  const w = Number(args.weight),
    h = Number(args.height);
  if (!w || !h) return err("Paramètres: weight(kg), height(cm)");
  const bmi = w / (h / 100) ** 2;
  const cat = bmi < 18.5 ? "Insuffisant" : bmi < 25 ? "Normal" : bmi < 30 ? "Surpoids" : "Obésité";
  return ok(`⚖️ **IMC: ${bmi.toFixed(1)}** — ${cat}`);
}

export async function toolCalorieCalculator(
  args: Record<string, unknown>,
): Promise<ToolCallResult> {
  const w = Number(args.weight),
    h = Number(args.height),
    age = Number(args.age);
  const gender = String(args.gender || "male").trim();
  const act = String(args.activity || "moderate").trim();
  if (!w || !h || !age) return err("Paramètres manquants");
  const bmr =
    gender === "female"
      ? 447.593 + 9.247 * w + 3.098 * h - 4.33 * age
      : 88.362 + 13.397 * w + 4.799 * h - 5.677 * age;
  const mult: Record<string, number> = {
    sedentary: 1.2,
    light: 1.375,
    moderate: 1.55,
    active: 1.725,
    very_active: 1.9,
  };
  const tdee = Math.round(bmr * (mult[act] || 1.55));
  return ok(
    `🔥 **Calories**\nBMR: ${Math.round(bmr)} | TDEE: ${tdee} kcal/j\nPerte: ${tdee - 500} | Prise: ${tdee + 300} kcal/j`,
  );
}

export async function toolCompoundInterest(args: Record<string, unknown>): Promise<ToolCallResult> {
  const p = Number(args.principal),
    r = Number(args.rate),
    y = Number(args.years);
  const f = Number(args.frequency) || 12;
  if (!p || !r || !y) return err("Paramètres manquants");
  const amt = p * Math.pow(1 + r / 100 / f, f * y);
  return ok(
    `💰 **Intérêts composés**\nFinal: ${amt.toFixed(2)} | Intérêts: ${(amt - p).toFixed(2)}`,
  );
}

export async function toolPercentageCalculator(
  args: Record<string, unknown>,
): Promise<ToolCallResult> {
  const mode = String(args.mode || "of").trim();
  const v1 = Number(args.value1),
    v2 = Number(args.value2);
  if (isNaN(v1) || isNaN(v2)) return err("Paramètres manquants");
  let r = "";
  if (mode === "of") r = `${v1}% de ${v2} = ${((v1 * v2) / 100).toFixed(2)}`;
  else if (mode === "is_what") r = `${v1} = ${((v1 / v2) * 100).toFixed(2)}% de ${v2}`;
  else if (mode === "increase") r = `Aug: ${(((v2 - v1) / v1) * 100).toFixed(2)}%`;
  else r = `Dim: ${(((v1 - v2) / v1) * 100).toFixed(2)}%`;
  return ok(`📊 ${r}`);
}

export async function toolTipCalculator(args: Record<string, unknown>): Promise<ToolCallResult> {
  const amt = Number(args.amount),
    tip = Number(args.tip_percent) || 15,
    ppl = Number(args.people) || 1;
  if (!amt) return err("Paramètre: amount");
  const total = amt + (amt * tip) / 100;
  return ok(
    `💵 Total: ${total.toFixed(2)} (tip ${tip}%)\nPar personne (${ppl}): ${(total / ppl).toFixed(2)}`,
  );
}

export async function toolDaysBetweenDates(args: Record<string, unknown>): Promise<ToolCallResult> {
  const d1 = String(args.date1),
    d2 = String(args.date2);
  if (!d1 || !d2) return err("Paramètres: date1, date2 (YYYY-MM-DD)");
  const days = Math.abs(Math.round((new Date(d2).getTime() - new Date(d1).getTime()) / 86400000));
  return ok(`📅 ${days} jour(s) entre ${d1} et ${d2}`);
}

export async function toolAgeCalculator(args: Record<string, unknown>): Promise<ToolCallResult> {
  const bd = String(args.birthdate);
  if (!bd) return err("Paramètre: birthdate (YYYY-MM-DD)");
  const b = new Date(bd),
    now = new Date();
  let y = now.getFullYear() - b.getFullYear(),
    m = now.getMonth() - b.getMonth(),
    d = now.getDate() - b.getDate();
  if (d < 0) {
    m--;
    d += new Date(now.getFullYear(), now.getMonth(), 0).getDate();
  }
  if (m < 0) {
    y--;
    m += 12;
  }
  return ok(`🎂 **Âge:** ${y} ans, ${m} mois, ${d} jour(s)`);
}

export async function toolDayOfWeek(args: Record<string, unknown>): Promise<ToolCallResult> {
  const ds = String(args.date);
  if (!ds) return err("Paramètre: date (YYYY-MM-DD)");
  const days = ["Dimanche", "Lundi", "Mardi", "Mercredi", "Jeudi", "Vendredi", "Samedi"];
  return ok(`📅 ${ds} = **${days[new Date(ds).getDay()]}**`);
}

export async function toolLeapYearCheck(args: Record<string, unknown>): Promise<ToolCallResult> {
  const year = Number(args.year);
  if (!year) return err("Paramètre: year");
  const leap = (year % 4 === 0 && year % 100 !== 0) || year % 400 === 0;
  return ok(`📅 ${year} ${leap ? "est" : "n'est pas"} bissextile`);
}

export async function toolWeekNumber(args: Record<string, unknown>): Promise<ToolCallResult> {
  const ds = String(args.date || new Date().toISOString().slice(0, 10));
  try {
    const d = new Date(ds);
    d.setHours(0, 0, 0, 0);
    d.setDate(d.getDate() + 3 - ((d.getDay() + 6) % 7));
    const w1 = new Date(d.getFullYear(), 0, 4);
    const wn =
      1 + Math.round(((d.getTime() - w1.getTime()) / 86400000 - 3 + ((w1.getDay() + 6) % 7)) / 7);
    return ok(`📅 Semaine **${wn}** (${ds})`);
  } catch {
    return err("Date invalide");
  }
}

export async function toolRandomNumber(args: Record<string, unknown>): Promise<ToolCallResult> {
  const min = Number(args.min) || 1,
    max = Number(args.max) || 100,
    count = Math.min(Number(args.count) || 1, 20);
  const nums = Array.from(
    { length: count },
    () => Math.floor(Math.random() * (max - min + 1)) + min,
  );
  return ok(`🎲 **Aléatoire (${min}-${max}):** ${nums.join(", ")}`);
}

export async function toolDiceRoll(args: Record<string, unknown>): Promise<ToolCallResult> {
  const sides = Number(args.sides) || 6,
    count = Math.min(Number(args.count) || 1, 20);
  if (sides < 2 || sides > 100) return err("2-100 faces");
  const rolls = Array.from({ length: count }, () => Math.floor(Math.random() * sides) + 1);
  return ok(
    `🎲 **d${sides}×${count}**\n${rolls.join(", ")}\nTotal: ${rolls.reduce((a, b) => a + b, 0)}`,
  );
}

export async function toolCoinFlip(args: Record<string, unknown>): Promise<ToolCallResult> {
  const count = Math.min(Number(args.count) || 1, 20);
  const flips = Array.from({ length: count }, () => (Math.random() < 0.5 ? "Pile" : "Face"));
  const h = flips.filter((f) => f === "Face").length;
  return ok(`🪙 **×${count}**\n${flips.join(", ")}\nFace: ${h} | Pile: ${flips.length - h}`);
}

export async function toolUuidGenerator(args: Record<string, unknown>): Promise<ToolCallResult> {
  const count = Math.min(Number(args.count) || 1, 10);
  const crypto = await import("node:crypto");
  return ok(
    `🆔 **UUID${count > 1 ? "s" : ""}:**\n${Array.from({ length: count }, () => crypto.randomUUID()).join("\n")}`,
  );
}

export async function toolNanoIdGenerator(args: Record<string, unknown>): Promise<ToolCallResult> {
  const size = Number(args.size) || 21;
  const chars = "ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789_-";
  const crypto = await import("node:crypto");
  return ok(
    `🆔 **Nano ID:** ${Array.from({ length: size }, () => chars[crypto.randomInt(chars.length)]).join("")}`,
  );
}

export async function toolSleepCalculator(args: Record<string, unknown>): Promise<ToolCallResult> {
  const mode = String(args.mode || "sleep_now").trim();
  const cycle = 90,
    fall = 15;
  if (mode === "wake_at") {
    const time = String(args.time || "07:00");
    const [h, m] = time.split(":").map(Number);
    if (isNaN(h) || isNaN(m)) return err("Format HH:MM");
    const wake = new Date();
    wake.setHours(h, m, 0, 0);
    const r: string[] = [];
    for (let c = 6; c >= 3; c--) {
      const bed = new Date(wake.getTime() - (c * cycle + fall) * 60000);
      r.push(
        `${c} cycles → ${bed.toLocaleTimeString("fr-FR", { hour: "2-digit", minute: "2-digit" })} (${c * 1.5}h)`,
      );
    }
    return ok(`😴 **Pour ${time}:**\n${r.join("\n")}`);
  }
  const now = new Date();
  const r: string[] = [];
  for (let c = 3; c <= 6; c++) {
    const w = new Date(now.getTime() + (c * cycle + fall) * 60000);
    r.push(
      `${c} cycles → ${w.toLocaleTimeString("fr-FR", { hour: "2-digit", minute: "2-digit" })} (${c * 1.5}h)`,
    );
  }
  return ok(`😴 **Si tu t'endors maintenant:**\n${r.join("\n")}`);
}

export async function toolGradientGenerator(
  args: Record<string, unknown>,
): Promise<ToolCallResult> {
  const colors = (args.colors as string[]) || ["#ff0000", "#0000ff"];
  const dir = String(args.direction || "to right").trim();
  if (colors.length < 2) return err("Au moins 2 couleurs");
  return ok(
    `🎨 **Dégradé:**\n\`\`\`css\nbackground: linear-gradient(${dir}, ${colors.join(", ")});\n\`\`\``,
  );
}

export async function toolCronGenerator(args: Record<string, unknown>): Promise<ToolCallResult> {
  const d = String(args.description || "")
    .trim()
    .toLowerCase();
  if (!d) return err("Paramètre: description");
  let cron = "0 9 * * *";
  if (d.includes("chaque minute") || d.includes("every minute")) cron = "* * * * *";
  else if (d.includes("toutes les heures") || d.includes("hourly")) cron = "0 * * * *";
  else if (d.includes("tous les jours") || d.includes("daily")) {
    const h = d.match(/(\d+)h/);
    cron = `0 ${h ? h[1] : 9} * * *`;
  } else if (d.includes("chaque semaine") || d.includes("weekly")) cron = "0 9 * * 0";
  else if (d.includes("chaque mois") || d.includes("monthly")) cron = "0 9 1 * *";
  else if (d.includes("5 minutes")) cron = "*/5 * * * *";
  else if (d.includes("10 minutes")) cron = "*/10 * * * *";
  else if (d.includes("30 minutes")) cron = "*/30 * * * *";
  else if (d.includes("minuit")) cron = "0 0 * * *";
  else if (d.includes("midi")) cron = "0 12 * * *";
  return ok(`⏰ **Cron pour "${d}":** \`${cron}\``);
}

export async function toolLicenseGenerator(args: Record<string, unknown>): Promise<ToolCallResult> {
  const type = String(args.type || "mit")
    .trim()
    .toLowerCase();
  const author = String(args.author || "Your Name").trim();
  const year = Number(args.year) || new Date().getFullYear();
  const licenses: Record<string, string> = {
    mit: `MIT License\n\nCopyright (c) ${year} ${author}\n\nPermission is hereby granted, free of charge... (MIT standard)`,
    apache: `Apache License 2.0\n\nCopyright (c) ${year} ${author}\n\nLicensed under the Apache License, Version 2.0...`,
    gpl: `GNU GPL v3.0\n\nCopyright (c) ${year} ${author}\n\nThis program is free software...`,
    bsd: `BSD 3-Clause\n\nCopyright (c) ${year}, ${author}\n\nRedistribution and use in source and binary forms...`,
    lgpl: `GNU LGPL v3.0\n\nCopyright (c) ${year} ${author}\n\nThis library is free software...`,
    mpl: `Mozilla Public License 2.0\n\nCopyright (c) ${year} ${author}\n\nThis Source Code Form is subject to the terms...`,
  };
  return ok(
    `📄 **Licence ${type.toUpperCase()}:**\n\`\`\`\n${(licenses[type] || licenses.mit).slice(0, 1800)}\n\`\`\``,
  );
}

export async function toolHttpStatusInfo(args: Record<string, unknown>): Promise<ToolCallResult> {
  const code = Number(args.code);
  if (!code) return err("Paramètre: code");
  const s: Record<number, string> = {
    200: "OK — Requête réussie",
    201: "Created — Ressource créée",
    204: "No Content",
    301: "Moved Permanently",
    302: "Found — Redirection",
    304: "Not Modified",
    400: "Bad Request",
    401: "Unauthorized — Auth requise",
    403: "Forbidden — Accès refusé",
    404: "Not Found",
    405: "Method Not Allowed",
    408: "Request Timeout",
    409: "Conflict",
    418: "I'm a teapot 🫖",
    429: "Too Many Requests — Rate limit",
    500: "Internal Server Error",
    502: "Bad Gateway",
    503: "Service Unavailable",
    504: "Gateway Timeout",
  };
  return ok(`📊 **HTTP ${code}** — ${s[code] || "Inconnu"}`);
}

export async function toolMimeTypeLookup(args: Record<string, unknown>): Promise<ToolCallResult> {
  const ext = String(args.extension || "")
    .trim()
    .toLowerCase()
    .replace(/^\./, "");
  if (!ext) return err("Paramètre: extension");
  const types: Record<string, string> = {
    pdf: "application/pdf",
    jpg: "image/jpeg",
    jpeg: "image/jpeg",
    png: "image/png",
    gif: "image/gif",
    webp: "image/webp",
    svg: "image/svg+xml",
    mp4: "video/mp4",
    webm: "video/webm",
    mp3: "audio/mpeg",
    wav: "audio/wav",
    ogg: "audio/ogg",
    json: "application/json",
    xml: "application/xml",
    html: "text/html",
    css: "text/css",
    js: "text/javascript",
    ts: "text/typescript",
    py: "text/x-python",
    java: "text/x-java",
    zip: "application/zip",
    txt: "text/plain",
    csv: "text/csv",
  };
  return ok(`📎 .${ext} → **${types[ext] || "unknown"}**`);
}

export async function toolCanIUse(args: Record<string, unknown>): Promise<ToolCallResult> {
  const f = String(args.feature || "")
    .trim()
    .toLowerCase();
  if (!f) return err("Paramètre: feature");
  return ok(`🔍 **Can I Use: ${f}**\n🔗 https://caniuse.com/${f}`);
}
