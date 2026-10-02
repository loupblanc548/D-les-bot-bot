/**
 * selfDiagnostic.ts — Collecte des erreurs/avertissements générés par le code
 * et construction du rapport d'auto-diagnostic.
 *
 * En production rien n'est écrit sur disque (console PM2 seulement), donc la
 * collecte se fait en mémoire en enveloppant logger.error / logger.warn.
 */
import type { EmbedBuilder } from "discord.js";
import type winston from "winston";
import { buildFicheEmbeds, type FicheCard } from "./discordFiche.js";

export type DiagLevel = "error" | "warn";

export interface ProblemEntry {
  fingerprint: string;
  level: DiagLevel;
  module: string;
  sample: string;
  location: string | null;
  windowCount: number;
  totalCount: number;
  firstSeen: number;
  lastSeen: number;
  reported: boolean;
  burstStart: number;
  burstCount: number;
  lastBurstAlert: number;
}

export const BURST = { count: 20, windowMs: 10 * 60_000, cooldownMs: 60 * 60_000 };

type BurstHandler = (entry: ProblemEntry) => void;
let burstHandler: BurstHandler | null = null;

/** Appelé quand une même erreur explose (BURST.count en BURST.windowMs), au plus une fois par cooldown. */
export function setBurstHandler(handler: BurstHandler | null): void {
  burstHandler = handler;
}

function trackBurst(entry: ProblemEntry, now: number): void {
  if (entry.level !== "error") return;
  if (now - entry.burstStart > BURST.windowMs) {
    entry.burstStart = now;
    entry.burstCount = 0;
  }
  entry.burstCount++;
  if (entry.burstCount < BURST.count || now - entry.lastBurstAlert < BURST.cooldownMs) return;
  entry.lastBurstAlert = now;
  try {
    burstHandler?.(entry);
  } catch {
    // Le handler ne doit pas casser l'appel au logger.
  }
}

export interface HealthChecks {
  rssMB: number;
  heapMB: number;
  memoryLevel: string;
  eventLoopP99Ms: number | null;
  discordReady: boolean;
  discordPingMs: number;
  dbLatencyMs: number | null;
  dbError: string | null;
  uptimeSec: number;
}

const MAX_ENTRIES = 300;
const problems = new Map<string, ProblemEntry>();
let windowStart = Date.now();
const wrapped = new WeakSet<object>();

/** Réduit un message à sa « forme » pour regrouper les occurrences d'un même problème. */
export function normalizeMessage(message: string): string {
  return message
    .replace(/https?:\/\/\S+/g, "<url>")
    .replace(/\b\d{15,20}\b/g, "<id>")
    .replace(/0x[0-9a-f]+/gi, "<hex>")
    .replace(/\b(?=[0-9a-f]*\d)[0-9a-f]{8,}\b/gi, "<hash>")
    .replace(/"[^"]*"|'[^']*'|`[^`]*`/g, '"…"')
    .replace(/\d+(\.\d+)?/g, "#")
    .replace(/\s+/g, " ")
    .trim()
    .slice(0, 160);
}

export function extractModule(message: string, fallback = "?"): string {
  const m = /^\s*(?:[^\w[]{0,4}\s*)?\[([^\]]{1,40})\]/.exec(message);
  return m ? m[1].trim() : fallback;
}

/** Premier emplacement du code du bot dans la stack (hors logger lui-même). */
export function extractLocation(stack: string | undefined): string | null {
  if (!stack) return null;
  for (const line of stack.split("\n").slice(1)) {
    const m = /((?:src|dist)[\\/][^:()\s]+\.[jt]s):(\d+)/.exec(line);
    if (!m) continue;
    const file = m[1].replace(/\\/g, "/");
    if (/utils\/logger\.|services\/selfDiagnostic\./.test(file)) continue;
    return `${file}:${m[2]}`;
  }
  return null;
}

function messageAndStack(args: unknown[]): { message: string; stack?: string } {
  const [first, ...rest] = args;
  let message: string;
  let stack: string | undefined;
  if (first instanceof Error) {
    message = first.message || first.name;
    stack = first.stack;
  } else {
    message = typeof first === "string" ? first : String(first);
  }
  for (const extra of rest) {
    if (stack) break;
    if (extra instanceof Error) {
      stack = extra.stack;
      if (!message.includes(extra.message)) message = `${message} ${extra.message}`;
    } else if (extra && typeof extra === "object" && typeof (extra as any).stack === "string") {
      stack = (extra as any).stack;
    }
  }
  return { message, stack };
}

export function recordProblem(
  level: DiagLevel,
  args: unknown[],
  moduleFallback = "?",
  now = Date.now(),
): void {
  try {
    const { message, stack } = messageAndStack(args);
    if (!message) return;
    const module = extractModule(message, moduleFallback);
    const fingerprint = `${level}|${module}|${normalizeMessage(message)}`;
    const existing = problems.get(fingerprint);
    if (existing) {
      existing.windowCount++;
      existing.totalCount++;
      existing.lastSeen = now;
      if (!existing.location) existing.location = extractLocation(stack);
      trackBurst(existing, now);
      return;
    }
    if (problems.size >= MAX_ENTRIES) evictOldest();
    const entry: ProblemEntry = {
      fingerprint,
      level,
      module,
      sample: message.replace(/\s+/g, " ").slice(0, 300),
      location: extractLocation(stack ?? new Error().stack),
      windowCount: 1,
      totalCount: 1,
      firstSeen: now,
      lastSeen: now,
      reported: false,
      burstStart: now,
      burstCount: 0,
      lastBurstAlert: 0,
    };
    problems.set(fingerprint, entry);
    trackBurst(entry, now);
  } catch {
    // La collecte ne doit jamais casser un appel au logger.
  }
}

function evictOldest(): void {
  let oldest: ProblemEntry | null = null;
  for (const entry of problems.values()) {
    if (!oldest || entry.lastSeen < oldest.lastSeen) oldest = entry;
  }
  if (oldest) problems.delete(oldest.fingerprint);
}

/** Enveloppe error/warn d'un logger winston pour alimenter le diagnostic. Idempotent. */
export function installDiagnosticCapture(target: winston.Logger, moduleFallback = "?"): void {
  if (wrapped.has(target)) return;
  wrapped.add(target);
  const t = target as any;
  const originalError = t.error.bind(target);
  const originalWarn = t.warn.bind(target);
  t.error = (...args: unknown[]) => {
    recordProblem("error", args, moduleFallback);
    return originalError(...args);
  };
  t.warn = (...args: unknown[]) => {
    recordProblem("warn", args, moduleFallback);
    return originalWarn(...args);
  };
}

export function getWindowProblems(): ProblemEntry[] {
  return [...problems.values()].filter((p) => p.windowCount > 0);
}

/** Clôt la fenêtre courante : remet les compteurs à zéro, marque les problèmes comme déjà signalés. */
export function closeWindow(now = Date.now()): void {
  for (const entry of problems.values()) {
    if (entry.windowCount > 0) entry.reported = true;
    entry.windowCount = 0;
  }
  windowStart = now;
}

export function getWindowStart(): number {
  return windowStart;
}

export function resetDiagnosticState(): void {
  problems.clear();
  windowStart = Date.now();
  burstHandler = null;
}

export function buildBurstAlert(entry: ProblemEntry): EmbedBuilder[] {
  return buildFicheEmbeds({
    title: "🚨 Erreur en rafale",
    description: `**[${entry.module}]** s'est produite **${entry.burstCount} fois en moins de ${Math.round(BURST.windowMs / 60_000)} min**.`,
    footer: "Auto-diagnostic · alerte immédiate · 1 alerte max par heure pour ce problème",
    color: STATUS_COLOR.critical,
    cards: [
      {
        title: "Détail",
        color: STATUS_COLOR.critical,
        fields: [
          { name: "Message", value: entry.sample.slice(0, 1000) },
          { name: "Code", value: entry.location ? `\`${entry.location}\`` : "—", inline: true },
          { name: "Total depuis le démarrage", value: `${entry.totalCount}`, inline: true },
        ],
      },
    ],
  });
}

// ─── Rapport ────────────────────────────────────────────────────────────────

export type DiagStatus = "ok" | "warn" | "critical";

const STATUS_COLOR: Record<DiagStatus, number> = {
  ok: 0x2ecc71,
  warn: 0xf39c12,
  critical: 0xe74c3c,
};
const STATUS_LABEL: Record<DiagStatus, string> = {
  ok: "🟢 Aucun problème notable",
  warn: "🟠 Problèmes à surveiller",
  critical: "🔴 Problèmes critiques",
};

export const DIAG_THRESHOLDS = {
  eventLoopWarnMs: 200,
  eventLoopCriticalMs: 1000,
  pingWarnMs: 500,
  dbWarnMs: 1000,
  errorBurst: 50,
};

export function healthIssues(h: HealthChecks): { status: DiagStatus; lines: string[] } {
  const lines: string[] = [];
  let status: DiagStatus = "ok";
  const bump = (s: DiagStatus) => {
    if (s === "critical" || (s === "warn" && status === "ok")) status = s;
  };

  if (h.memoryLevel === "CRITICAL") {
    bump("critical");
    lines.push(`Mémoire critique (${h.rssMB} MB RSS)`);
  } else if (h.memoryLevel === "WARNING") {
    bump("warn");
    lines.push(`Mémoire élevée (${h.rssMB} MB RSS)`);
  }
  if (h.eventLoopP99Ms != null && h.eventLoopP99Ms >= DIAG_THRESHOLDS.eventLoopCriticalMs) {
    bump("critical");
    lines.push(`Boucle Node bloquée jusqu'à ${h.eventLoopP99Ms} ms (p99)`);
  } else if (h.eventLoopP99Ms != null && h.eventLoopP99Ms >= DIAG_THRESHOLDS.eventLoopWarnMs) {
    bump("warn");
    lines.push(`Boucle Node lente (${h.eventLoopP99Ms} ms p99)`);
  }
  if (!h.discordReady) {
    bump("critical");
    lines.push("Connexion Discord pas prête");
  } else if (h.discordPingMs > DIAG_THRESHOLDS.pingWarnMs) {
    bump("warn");
    lines.push(`Latence Discord élevée (${h.discordPingMs} ms)`);
  }
  if (h.dbError) {
    bump("critical");
    lines.push(`Base de données injoignable : ${h.dbError}`);
  } else if (h.dbLatencyMs != null && h.dbLatencyMs > DIAG_THRESHOLDS.dbWarnMs) {
    bump("warn");
    lines.push(`Base de données lente (${h.dbLatencyMs} ms)`);
  }
  return { status, lines };
}

function formatDuration(sec: number): string {
  const d = Math.floor(sec / 86400);
  const h = Math.floor((sec % 86400) / 3600);
  const m = Math.floor((sec % 3600) / 60);
  return d > 0 ? `${d}j ${h}h` : h > 0 ? `${h}h ${m}min` : `${m}min`;
}

function problemLine(p: ProblemEntry): string {
  const tag = p.reported ? "" : "🆕 ";
  const where = p.location ? `\n  ↳ \`${p.location}\`` : "";
  const text = p.sample.replace(/^\s*(?:[^\w[]{0,4}\s*)?\[[^\]]{1,40}\]\s*/, "") || p.sample;
  return `${tag}**[${p.module}]** ×${p.windowCount} — ${text.slice(0, 140)}${where}`;
}

function joinWithinLimit(lines: string[], max = 1000): string {
  const out: string[] = [];
  let size = 0;
  for (const line of lines) {
    if (size + line.length + 1 > max) {
      out.push(`… +${lines.length - out.length} autre(s)`);
      break;
    }
    out.push(line);
    size += line.length + 1;
  }
  return out.join("\n");
}

export function buildDiagnosticReport(
  health: HealthChecks,
  windowProblems: ProblemEntry[],
  windowStartMs: number,
  now = Date.now(),
): { status: DiagStatus; embeds: EmbedBuilder[] } {
  const errors = windowProblems
    .filter((p) => p.level === "error")
    .sort((a, b) => b.windowCount - a.windowCount);
  const warns = windowProblems
    .filter((p) => p.level === "warn")
    .sort((a, b) => b.windowCount - a.windowCount);
  const errorCount = errors.reduce((n, p) => n + p.windowCount, 0);
  const warnCount = warns.reduce((n, p) => n + p.windowCount, 0);
  const newCount = windowProblems.filter((p) => !p.reported).length;

  const hi = healthIssues(health);
  let status = hi.status;
  const crash = errors.some((p) => p.module === "PROCESS");
  if (crash || errorCount >= DIAG_THRESHOLDS.errorBurst) status = "critical";
  else if (errorCount > 0 && status === "ok") status = "warn";

  const windowLabel = formatDuration(Math.max(0, Math.round((now - windowStartMs) / 1000)));
  const summary = [
    `**${STATUS_LABEL[status]}** — fenêtre des dernières ${windowLabel}.`,
    `Erreurs : **${errorCount}** (${errors.length} distinctes) · Avertissements : **${warnCount}** (${warns.length} distincts)` +
      (newCount > 0 ? ` · 🆕 ${newCount} nouveau(x)` : ""),
    ...(hi.lines.length ? ["", ...hi.lines.map((l) => `⚠️ ${l}`)] : []),
  ].join("\n");

  const cards: FicheCard[] = [
    {
      title: "Santé du système",
      color: STATUS_COLOR[hi.status],
      fields: [
        {
          name: "Mémoire",
          value: `${health.rssMB} MB RSS · ${health.heapMB} MB heap (${health.memoryLevel})`,
          inline: true,
        },
        {
          name: "Boucle Node (p99)",
          value: health.eventLoopP99Ms == null ? "—" : `${health.eventLoopP99Ms} ms`,
          inline: true,
        },
        {
          name: "Discord",
          value: health.discordReady ? `${health.discordPingMs} ms` : "❌ pas prêt",
          inline: true,
        },
        {
          name: "Base de données",
          value: health.dbError
            ? `❌ ${health.dbError}`
            : health.dbLatencyMs == null
              ? "—"
              : `${health.dbLatencyMs} ms`,
          inline: true,
        },
        { name: "Uptime", value: formatDuration(health.uptimeSec), inline: true },
      ],
    },
  ];

  if (errors.length > 0) {
    cards.push({
      title: `Erreurs générées par le code (${errors.length})`,
      color: STATUS_COLOR.critical,
      description: joinWithinLimit(errors.slice(0, 10).map(problemLine), 4000),
      fields: [],
    });
  }
  if (warns.length > 0) {
    cards.push({
      title: `Avertissements fréquents (${warns.length})`,
      color: STATUS_COLOR.warn,
      description: joinWithinLimit(warns.slice(0, 6).map(problemLine), 3000),
      fields: [],
    });
  }

  const embeds = buildFicheEmbeds({
    title: "🩺 Auto-diagnostic du bot",
    description: summary,
    footer: "Auto-diagnostic · erreurs regroupées par forme · 🆕 = jamais signalé",
    color: STATUS_COLOR[status],
    cards,
  });
  return { status, embeds };
}
