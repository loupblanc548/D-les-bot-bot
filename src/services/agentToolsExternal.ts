/**
 * agentToolsExternal.ts — Tools externes pour l'agent IA
 *
 * Permet à l'agent d'interagir avec le monde extérieur:
 *  1. http_request — n'importe quelle requête HTTP
 *  2. system_stats — CPU/RAM/disk/uptime du VPS
 *  3. ssh_command — exécuter des commandes shell
 *  4. db_query — interroger la DB PostgreSQL
 *  5. git_operations — pull/commit/push
 *  6. rss_monitor — surveiller un flux RSS
 *  7. website_diff — détecter changements sur un site
 *  8. cron_create — créer des cron jobs dynamiquement
 *  9. docker_manage — gérer containers Docker
 * 10. file_read — lire fichiers sur le VPS
 *
 * Sécurité: whitelist de commandes, timeout, output truncation.
 */

import { exec, execFile } from "child_process";
import { createHash } from "crypto";
import { promisify } from "util";
import { readFile, writeFile } from "fs/promises";
import { existsSync } from "fs";
import cron, { ScheduledTask } from "node-cron";
import Parser from "rss-parser";
import type { AgentToolDef, ToolCallResult, ToolContext } from "./agentTools.js";
import logger from "../utils/logger.js";
import prisma from "../prisma.js";
import {
  getSecurityTrailsDnsHistory,
  getCensysAttackSurface,
  getGreyNoiseClassification,
} from "./threatIntelExtended.js";
import { safeFetch, checkUrlForSsrf } from "../utils/ssrfGuard.js";

const execAsync = promisify(exec);
const execFileAsync = promisify(execFile);
const rssParser = new Parser();

const SSH_ENABLED = process.env.AGENT_SSH_ENABLED === "true";
const DOCKER_ENABLED = process.env.AGENT_DOCKER_ENABLED === "true";
const GIT_ENABLED = process.env.AGENT_GIT_ENABLED === "true";
const DB_ENABLED = process.env.AGENT_DB_ENABLED === "true"; // default false (opt-in)
const MAX_OUTPUT = 3000;

// Whitelist de commandes shell sûres — format: { cmd: binary, args: fixed args prefix }
// Only exact command + args match is allowed. No prefix matching.
const SHELL_WHITELIST: Array<{ cmd: string; args: string[] }> = [
  { cmd: "uptime", args: [] },
  { cmd: "free", args: [] },
  { cmd: "free", args: ["-h"] },
  { cmd: "df", args: [] },
  { cmd: "df", args: ["-h"] },
  { cmd: "top", args: ["-bn1"] },
  { cmd: "ps", args: ["aux"] },
  { cmd: "systemctl", args: ["status"] },
  { cmd: "systemctl", args: ["list-units"] },
  { cmd: "pm2", args: ["list"] },
  { cmd: "pm2", args: ["status"] },
  { cmd: "pm2", args: ["info"] },
  { cmd: "pm2", args: ["logs", "--nostream", "--lines", "20"] },
  { cmd: "docker", args: ["ps"] },
  { cmd: "docker", args: ["stats", "--no-stream"] },
  { cmd: "docker", args: ["logs", "--tail", "20"] },
  { cmd: "git", args: ["status"] },
  { cmd: "git", args: ["log", "--oneline", "-10"] },
  { cmd: "git", args: ["diff", "--stat"] },
  { cmd: "ls", args: ["-la"] },
  { cmd: "cat", args: ["/etc/os-release"] },
  { cmd: "uname", args: ["-a"] },
  { cmd: "netstat", args: ["-tlnp"] },
  { cmd: "ss", args: ["-tlnp"] },
  { cmd: "du", args: ["-sh"] },
  { cmd: "wc", args: ["-l"] },
];

// Shell metacharacters that allow command chaining/injection
const SHELL_METACHARS = /[;|`$()><\n\r]/;

function isCommandAllowed(cmd: string): { allowed: boolean; binary: string; args: string[] } {
  const trimmed = cmd.trim();

  // Reject if any shell metacharacter is present
  if (SHELL_METACHARS.test(trimmed)) {
    logger.warn(`[SSH] Rejected command containing shell metacharacters: ${trimmed.slice(0, 80)}`);
    return { allowed: false, binary: "", args: [] };
  }

  // Parse command into binary + args
  const parts = trimmed.split(/\s+/);
  const binary = parts[0];
  const args = parts.slice(1);

  // Check against whitelist with exact match
  for (const entry of SHELL_WHITELIST) {
    if (entry.cmd === binary && entry.args.length === args.length) {
      const match = entry.args.every((a, i) => a === args[i]);
      if (match) return { allowed: true, binary, args };
    }
  }

  // Special case: pm2 info <name> and docker logs --tail 20 <name> allow one variable arg
  if (binary === "pm2" && args[0] === "info" && args.length === 2) {
    return { allowed: true, binary, args };
  }
  if (
    binary === "docker" &&
    args[0] === "logs" &&
    args[1] === "--tail" &&
    args[2] === "20" &&
    args.length === 4
  ) {
    return { allowed: true, binary, args };
  }
  if (binary === "du" && args[0] === "-sh" && args.length === 2) {
    return { allowed: true, binary, args };
  }
  if (binary === "wc" && args[0] === "-l" && args.length === 2) {
    return { allowed: true, binary, args };
  }

  logger.warn(`[SSH] Rejected command not in whitelist: ${trimmed.slice(0, 80)}`);
  return { allowed: false, binary: "", args: [] };
}

function truncate(s: string): string {
  return s.length > MAX_OUTPUT ? s.slice(0, MAX_OUTPUT) + "\n... (truncated)" : s;
}

// ─── Tool Definitions ────────────────────────────────────────────────────────

export const EXTERNAL_TOOLS: AgentToolDef[] = [
  {
    type: "function",
    function: {
      name: "http_request",
      description:
        "Effectue une requête HTTP vers n'importe quelle URL (GET, POST, PUT, DELETE). Retourne status code, headers et body. Utile pour interagir avec des APIs externes non couvertes par les tools dédiés.",
      parameters: {
        type: "object",
        properties: {
          url: { type: "string", description: "URL complète (ex: https://api.example.com/data)" },
          method: {
            type: "string",
            enum: ["GET", "POST", "PUT", "DELETE"],
            description: "Méthode HTTP (défaut: GET)",
          },
          headers: { type: "object", description: "Headers personnalisés (JSON)" },
          body: { type: "string", description: "Body pour POST/PUT (JSON string)" },
        },
        required: ["url"],
      },
    },
  },
  {
    type: "function",
    function: {
      name: "system_stats",
      description:
        "Récupère les statistiques du VPS : CPU, RAM, disk, uptime, load average. Aucun paramètre. Gratuit.",
      parameters: { type: "object", properties: {}, required: [] },
    },
  },
  {
    type: "function",
    function: {
      name: "ssh_command",
      description:
        "Exécute une commande shell sur le VPS. Whitelist de commandes sûres (uptime, free, df, pm2, docker, git, etc.). Nécessite AGENT_SSH_ENABLED=true.",
      parameters: {
        type: "object",
        properties: {
          command: {
            type: "string",
            description: "Commande à exécuter (ex: 'pm2 list', 'df -h', 'docker ps')",
          },
        },
        required: ["command"],
      },
    },
  },
  {
    type: "function",
    function: {
      name: "db_query",
      description:
        "Exécute une requête SQL en lecture seule (SELECT) sur la base PostgreSQL du bot. Retourne les résultats. Nécessite AGENT_DB_ENABLED != false.",
      parameters: {
        type: "object",
        properties: {
          query: { type: "string", description: "Requête SQL SELECT (lecture seule)" },
        },
        required: ["query"],
      },
    },
  },
  {
    type: "function",
    function: {
      name: "git_operations",
      description:
        "Opérations Git sur le repo du bot : status, log, pull, diff. Nécessite AGENT_GIT_ENABLED=true.",
      parameters: {
        type: "object",
        properties: {
          action: {
            type: "string",
            enum: ["status", "log", "pull", "diff"],
            description: "Action Git à effectuer",
          },
        },
        required: ["action"],
      },
    },
  },
  {
    type: "function",
    function: {
      name: "rss_monitor",
      description:
        "Surveille un flux RSS arbitraire et retourne les derniers articles. Gratuit, pas de clé.",
      parameters: {
        type: "object",
        properties: {
          url: {
            type: "string",
            description: "URL du flux RSS (ex: https://blog.example.com/feed.xml)",
          },
          limit: { type: "number", description: "Nombre max d'articles (défaut 5)" },
        },
        required: ["url"],
      },
    },
  },
  {
    type: "function",
    function: {
      name: "website_diff",
      description:
        "Détecte les changements sur une page web. Compare le contenu actuel avec la dernière vérification. Retourne 'CHANGED' ou 'UNCHANGED' + un diff.",
      parameters: {
        type: "object",
        properties: {
          url: { type: "string", description: "URL de la page à surveiller" },
        },
        required: ["url"],
      },
    },
  },
  {
    type: "function",
    function: {
      name: "cron_create",
      description:
        "Crée un cron job dynamique qui exécute une commande à intervalle régulier. Ex: vérifier un site toutes les heures. Le cron est stocké en mémoire.",
      parameters: {
        type: "object",
        properties: {
          name: { type: "string", description: "Nom unique du cron job" },
          schedule: {
            type: "string",
            description: "Expression cron (ex: '0 * * * *' = toutes les heures)",
          },
          command: {
            type: "string",
            description: "Commande à exécuter (ex: 'http_request GET https://example.com')",
          },
        },
        required: ["name", "schedule", "command"],
      },
    },
  },
  {
    type: "function",
    function: {
      name: "docker_manage",
      description:
        "Gère les containers Docker : list, logs, restart, stats. Nécessite AGENT_DOCKER_ENABLED=true.",
      parameters: {
        type: "object",
        properties: {
          action: {
            type: "string",
            enum: ["list", "logs", "restart", "stats"],
            description: "Action Docker",
          },
          container: { type: "string", description: "Nom du container (pour logs/restart)" },
        },
        required: ["action"],
      },
    },
  },
  {
    type: "function",
    function: {
      name: "file_read",
      description: "Lit le contenu d'un fichier sur le VPS. Chemin absolu requis. Taille max 10KB.",
      parameters: {
        type: "object",
        properties: {
          path: { type: "string", description: "Chemin absolu du fichier (ex: /var/log/syslog)" },
        },
        required: ["path"],
      },
    },
  },
  {
    type: "function",
    function: {
      name: "control_stream",
      description:
        "Contrôle le Go Live (stream des jeux en direct). Actions: start, stop, restart, status. Le stream utilise le selfbot johnhelldivers26 pour diffuser la page showcase des sorties de jeux.",
      parameters: {
        type: "object",
        properties: {
          action: {
            type: "string",
            description: "Action: start, stop, restart, status",
          },
        },
        required: ["action"],
      },
    },
  },
  {
    type: "function",
    function: {
      name: "check_vps_storage",
      description:
        "Vérifie l'état du disque VPS (utilisation, espace libre), la mémoire RAM, le load average, et les top processes. ⚠️ UTILISE CECI quand l'utilisateur demande l'état du VPS, l'espace disque, ou si le bot est lent. Déclenche une alerte critique si le disque dépasse 90%.",
      parameters: {
        type: "object",
        properties: {},
        required: [],
      },
    },
  },
  // ═══ New Tools (Part A) ═══
  {
    type: "function",
    function: {
      name: "sendAlertEmail",
      description:
        "Envoie un email d'alerte transactionnel aux admin via SendGrid ou SMTP. High risk — contacts des destinataires. Utilise alertDispatcher existant.",
      parameters: {
        type: "object",
        properties: {
          subject: { type: "string", description: "Sujet de l'email" },
          message: { type: "string", description: "Corps du message (texte brut)" },
          severity: {
            type: "string",
            enum: ["LOW", "MEDIUM", "HIGH", "CRITICAL"],
            description: "Niveau de sévérité de l'alerte",
          },
        },
        required: ["subject", "message", "severity"],
      },
    },
  },
  // ─── Threat Intel Extended (read-only enrichment) ───
  {
    type: "function",
    function: {
      name: "securityTrailsDnsHistory",
      description:
        "Récupère l'historique DNS (enregistrements A) d'un domaine via SecurityTrails. Utile pour investiguer un incident (changement d'IP, infrastructure). Lecture seule.",
      parameters: {
        type: "object",
        properties: {
          domain: { type: "string", description: "Nom de domaine à investiguer (ex: example.com)" },
        },
        required: ["domain"],
      },
    },
  },
  {
    type: "function",
    function: {
      name: "censysAttackSurface",
      description:
        "Récupère la surface d'attaque exposée d'une IP via Censys (ports ouverts, services, localisation, ASN). Lecture seule — aucun scan actif. Complète les outils Kali.",
      parameters: {
        type: "object",
        properties: {
          ip: { type: "string", description: "Adresse IP à analyser (ex: 1.2.3.4)" },
        },
        required: ["ip"],
      },
    },
  },
  {
    type: "function",
    function: {
      name: "greyNoiseClassify",
      description:
        "Classifie une IP via GreyNoise: distingue le bruit de scan Internet (benign/malicious) d'une menace ciblée. Réduit les faux positifs du pipeline SOAR.",
      parameters: {
        type: "object",
        properties: {
          ip: { type: "string", description: "Adresse IP à classifier (ex: 1.2.3.4)" },
        },
        required: ["ip"],
      },
    },
  },
];

// ─── Cron jobs dynamiques ────────────────────────────────────────────────────

const dynamicCrons = new Map<string, ScheduledTask>();

// ─── Dispatcher ──────────────────────────────────────────────────────────────

export async function executeExternalTool(
  toolName: string,
  args: Record<string, any>,
  _ctx: ToolContext,
): Promise<ToolCallResult | null> {
  logger.info(`[AgentToolsExt] 🔧 ${toolName} args=${JSON.stringify(args).slice(0, 150)}`);

  try {
    switch (toolName) {
      // ─── 1. HTTP Request ─────────
      case "http_request": {
        const url = String(args.url ?? "");
        const method = String(args.method ?? "GET").toUpperCase() as
          "GET" | "POST" | "PUT" | "DELETE";
        if (!url.startsWith("http")) return { success: false, data: "URL invalide" };

        const ssrfCheck = await checkUrlForSsrf(url, "http_request");
        if (!ssrfCheck.allowed) {
          return { success: false, data: `URL bloquée (SSRF): ${ssrfCheck.reason}` };
        }

        const headers: Record<string, string> = {};
        if (args.headers && typeof args.headers === "object") {
          for (const [k, v] of Object.entries(args.headers as Record<string, any>)) {
            headers[k] = String(v);
          }
        }

        const res = await safeFetch(
          url,
          {
            method,
            headers,
            body: args.body ? String(args.body) : undefined,
            signal: AbortSignal.timeout(15_000),
          },
          "http_request",
        );

        const text = await res.text();
        return {
          success: true,
          data: `Status: ${res.status}\nHeaders: ${JSON.stringify(Object.fromEntries(res.headers.entries())).slice(0, 500)}\nBody:\n${truncate(text)}`,
        };
      }

      // ─── 2. System Stats ─────────
      case "system_stats": {
        const mem = process.memoryUsage();
        const memMB = mem.rss / 1024 / 1024;
        const heapUsed = mem.heapUsed / 1024 / 1024;
        const heapTotal = mem.heapTotal / 1024 / 1024;
        const uptime = process.uptime();
        const cpuUsage = process.cpuUsage();
        const cpuPercent = (((cpuUsage.user + cpuUsage.system) / 1000000 / uptime) * 100).toFixed(
          1,
        );

        let diskInfo = "N/A";
        try {
          const { stdout } = await execAsync("df -h / 2>/dev/null | tail -1");
          diskInfo = stdout.trim();
        } catch {
          /* Windows fallback */
        }

        let loadAvg = "N/A";
        try {
          const la = (process as any as { loadavg?: () => number[] }).loadavg?.();
          if (la) loadAvg = la.join(", ");
        } catch {
          /* non-critique */
        }

        return {
          success: true,
          data: `📊 **VPS Stats**\nRAM: ${memMB.toFixed(0)}MB (heap: ${heapUsed.toFixed(0)}/${heapTotal.toFixed(0)}MB)\nCPU: ${cpuPercent}%\nUptime: ${(uptime / 3600).toFixed(1)}h\nLoad: ${loadAvg}\nDisk: ${diskInfo}`,
        };
      }

      // ─── 3. SSH Command ─────────
      case "ssh_command": {
        if (!SSH_ENABLED)
          return { success: false, data: "SSH désactivé. Set AGENT_SSH_ENABLED=true" };
        const command = String(args.command ?? "");
        const check = isCommandAllowed(command);
        if (!check.allowed) {
          return {
            success: false,
            data: `Commande non autorisée. Whitelist: ${SHELL_WHITELIST.map((w) => `${w.cmd} ${w.args.join(" ")}`).join(", ")}`,
          };
        }
        // Use execFile (no shell interpretation) instead of exec (passes through shell)
        const { stdout, stderr } = await execFileAsync(check.binary, check.args, {
          timeout: 10_000,
          maxBuffer: 1024 * 1024,
        });
        return { success: true, data: truncate(stdout + (stderr ? `\nSTDERR:\n${stderr}` : "")) };
      }

      // ─── 4. DB Query ─────────
      case "db_query": {
        if (!DB_ENABLED)
          return {
            success: false,
            data: "DB query désactivé. Set AGENT_DB_ENABLED=true pour activer.",
          };
        const query = String(args.query ?? "").trim();
        const upperQuery = query.toUpperCase();
        if (!upperQuery.startsWith("SELECT")) {
          return { success: false, data: "Seules les requêtes SELECT sont autorisées" };
        }
        if (
          upperQuery.includes(";") ||
          upperQuery.includes("DROP") ||
          upperQuery.includes("DELETE") ||
          upperQuery.includes("INSERT") ||
          upperQuery.includes("UPDATE") ||
          upperQuery.includes("ALTER") ||
          upperQuery.includes("TRUNCATE") ||
          upperQuery.includes("CREATE") ||
          upperQuery.includes("GRANT") ||
          upperQuery.includes("--") ||
          upperQuery.includes("/*")
        ) {
          return {
            success: false,
            data: "Requête non-autorisée (seul SELECT simple est permis, pas de commentaires ni d'empilement)",
          };
        }
        const FORBIDDEN_TABLES = [
          "_prisma_migrations",
          "session",
          "token",
          "apikey",
          "credential",
          "secret",
          "password",
        ];
        for (const ft of FORBIDDEN_TABLES) {
          if (upperQuery.includes(ft.toUpperCase())) {
            return {
              success: false,
              data: `Accès à la table '${ft}' interdit pour des raisons de sécurité`,
            };
          }
        }

        // "SELECT seulement" ne suffit pas: en PostgreSQL un SELECT peut lire
        // des fichiers de l'hôte, ouvrir des connexions sortantes, ou dormir.
        // Ces primitives-là ne sont jamais légitimes pour cet outil.
        const FORBIDDEN_FUNCTIONS = [
          "pg_read_file",
          "pg_read_binary_file",
          "pg_stat_file",
          "pg_ls_dir",
          "pg_ls_logdir",
          "pg_ls_waldir",
          "lo_import",
          "lo_export",
          "dblink",
          "pg_sleep",
          "pg_authid",
          "pg_shadow",
          "pg_read_all_settings",
          "pg_terminate_backend",
          "pg_cancel_backend",
          "query_to_xml",
        ];
        const forbiddenFn = FORBIDDEN_FUNCTIONS.find((fn) =>
          new RegExp(`\\b${fn}\\b`, "i").test(query),
        );
        if (forbiddenFn) {
          return {
            success: false,
            data: `Fonction '${forbiddenFn}' interdite (accès fichier/réseau/DoS depuis la base)`,
          };
        }

        const rows = await prisma.$queryRawUnsafe(query);
        return { success: true, data: truncate(JSON.stringify(rows, null, 2)) };
      }

      // ─── 5. Git Operations ─────────
      case "git_operations": {
        if (!GIT_ENABLED)
          return { success: false, data: "Git désactivé. Set AGENT_GIT_ENABLED=true" };
        const action = String(args.action ?? "status");
        const gitCmd =
          {
            status: "git status --short",
            log: "git log --oneline -10",
            pull: "git pull --ff-only 2>&1",
            diff: "git diff --stat",
          }[action] ?? "git status --short";

        const { stdout } = await execAsync(gitCmd, { timeout: 15_000, maxBuffer: 1024 * 1024 });
        return { success: true, data: `Git ${action}:\n${truncate(stdout)}` };
      }

      // ─── 6. RSS Monitor ─────────
      case "rss_monitor": {
        const url = String(args.url ?? "");
        const limit = Number(args.limit) || 5;
        if (!url.startsWith("http")) return { success: false, data: "URL RSS invalide" };

        const res = await safeFetch(url, { signal: AbortSignal.timeout(10_000) }, "rss_monitor");
        if (!res.ok) return { success: false, data: `RSS fetch ${res.status}` };
        const text = await res.text();
        const feed = await rssParser.parseString(text);
        const items = feed.items
          .slice(0, limit)
          .map(
            (item) =>
              `📰 ${item.title ?? "No title"}\n${item.link ?? ""}\n${(item.contentSnippet ?? "").slice(0, 200)}`,
          )
          .join("\n\n");
        return { success: true, data: `Flux RSS (${feed.title ?? url}):\n${items}` };
      }

      // ─── 7. Website Diff ─────────
      case "website_diff": {
        const url = String(args.url ?? "");
        if (!url.startsWith("http")) return { success: false, data: "URL invalide" };

        const ssrfCheck = await checkUrlForSsrf(url, "website_diff");
        if (!ssrfCheck.allowed)
          return { success: false, data: `URL bloquée (SSRF): ${ssrfCheck.reason}` };

        const res = await safeFetch(
          url,
          {
            headers: { "User-Agent": "Mozilla/5.0 (compatible; DiscordBot/1.0)" },
            signal: AbortSignal.timeout(10_000),
          },
          "website_diff",
        );
        if (!res.ok) return { success: false, data: `Fetch ${res.status}` };
        const html = await res.text();
        const contentHash = createHash("sha256").update(html).digest("hex").slice(0, 16);

        // Check previous hash
        const hashFile = `/tmp/website_diff_${Buffer.from(url).toString("base64").slice(0, 20)}.txt`;
        let previousHash = "";
        try {
          previousHash = (await readFile(hashFile, "utf-8")).trim();
        } catch {
          /* first check */
        }

        // Save current
        await writeFile(hashFile, contentHash).catch(() => {});

        if (previousHash === contentHash) {
          return { success: true, data: `UNCHANGED — ${url} (hash: ${contentHash})` };
        }
        return {
          success: true,
          data: `CHANGED — ${url}\nPrevious: ${previousHash || "none"} → Current: ${contentHash}\nContent size: ${html.length} bytes`,
        };
      }

      // ─── 8. Cron Create ─────────
      case "cron_create": {
        const name = String(args.name ?? "");
        const schedule = String(args.schedule ?? "");
        const command = String(args.command ?? "");
        if (!name || !schedule || !command) return { success: false, data: "Paramètres manquants" };
        if (!cron.validate(schedule))
          return { success: false, data: `Expression cron invalide: ${schedule}` };

        // Stop existing cron with same name
        const existing = dynamicCrons.get(name);
        if (existing) existing.stop();

        const task = cron.schedule(schedule, () => {
          logger.info(`[DynamicCron] ${name}: ${command}`);
          // Execute as shell command if SSH enabled AND whitelisted, otherwise just log
          const cronCheck = isCommandAllowed(command);
          if (SSH_ENABLED && cronCheck.allowed) {
            execFileAsync(cronCheck.binary, cronCheck.args, { timeout: 30_000 }).catch((err) =>
              logger.warn(
                `[DynamicCron] ${name} error: ${err instanceof Error ? err.message : String(err)}`,
              ),
            );
          } else {
            logger.info(
              `[DynamicCron] ${name} (log only — SSH disabled or command not whitelisted): ${command}`,
            );
          }
        });

        dynamicCrons.set(name, task);
        return { success: true, data: `Cron '${name}' créé: ${schedule} → ${command}` };
      }

      // ─── 9. Docker Manage ─────────
      case "docker_manage": {
        if (!DOCKER_ENABLED)
          return { success: false, data: "Docker désactivé. Set AGENT_DOCKER_ENABLED=true" };
        const action = String(args.action ?? "list");
        const container = String(args.container ?? "");

        if (container && !/^[a-zA-Z0-9][a-zA-Z0-9_.-]*$/.test(container)) {
          return {
            success: false,
            data: "Nom de container invalide (caractères autorisés: alphanumérique, -, _, .)",
          };
        }

        let dockerBinary: string;
        let dockerArgs: string[];
        switch (action) {
          case "logs":
            if (!container)
              return { success: false, data: "Paramètre 'container' requis pour 'logs'" };
            dockerBinary = "docker";
            dockerArgs = ["logs", "--tail", "30", container];
            break;
          case "restart":
            if (!container)
              return { success: false, data: "Paramètre 'container' requis pour 'restart'" };
            dockerBinary = "docker";
            dockerArgs = ["restart", container];
            break;
          case "stats":
            dockerBinary = "docker";
            dockerArgs = [
              "stats",
              "--no-stream",
              "--format",
              "table {{.Name}}\t{{.CPUPerc}}\t{{.MemUsage}}",
            ];
            break;
          default:
            dockerBinary = "docker";
            dockerArgs = ["ps", "-a", "--format", "table {{.Names}}\t{{.Status}}\t{{.Image}}"];
        }

        const { stdout } = await execFileAsync(dockerBinary, dockerArgs, {
          timeout: 15_000,
          maxBuffer: 1024 * 1024,
        });
        return { success: true, data: `Docker ${action}:\n${truncate(stdout)}` };
      }

      // ─── 10. File Read ─────────
      case "check_vps_storage": {
        const { vpsMaintenanceCheck } = await import("./vpsMaintenance.js");
        return await vpsMaintenanceCheck();
      }
      // ─── 10b. File Read ─────────
      case "file_read": {
        if (!SSH_ENABLED)
          return { success: false, data: "file_read désactivé. Set AGENT_SSH_ENABLED=true" };
        const path = String(args.path ?? "");
        if (!path.startsWith("/"))
          return { success: false, data: "Chemin absolu requis (ex: /var/log/syslog)" };
        if (path.includes("..")) {
          return { success: false, data: "Chemin invalide (path traversal détecté)" };
        }
        const FORBIDDEN_PATH_PATTERNS = [
          /\.env(\.|$)/i,
          /\/\.ssh\//i,
          /id_rsa/i,
          /id_ed25519/i,
          /\/etc\/shadow/i,
          /\/etc\/passwd/i,
          /\/etc\/gshadow/i,
          /\.pem$/i,
          /\.key$/i,
          /credentials/i,
          /\/root\/\.aws\//i,
          /\/proc\/self\//i,
          /docker\/config\.json/i,
        ];
        if (FORBIDDEN_PATH_PATTERNS.some((p) => p.test(path))) {
          logger.warn(`[file_read] Blocked sensitive path access attempt: ${path}`);
          return {
            success: false,
            data: "Accès à ce fichier interdit pour des raisons de sécurité",
          };
        }
        if (!existsSync(path)) return { success: false, data: "Fichier introuvable" };

        const content = await readFile(path, "utf-8");
        return { success: true, data: truncate(content) };
      }

      // ─── 11. Stream Control ─────────
      case "control_stream": {
        const action = String(args.action ?? "status");
        const { startVideoStream, stopVideoStream, isStreamActive } =
          await import("./videoStream.js");
        const active = isStreamActive();
        switch (action) {
          case "start":
            if (active) return { success: true, data: "Le stream est déjà en cours." };
            startVideoStream();
            return {
              success: true,
              data: "▶️ Go Live démarré — johnhelldivers26 rejoint le salon vocal.",
            };
          case "stop":
            if (!active) return { success: true, data: "Le stream n'est pas en cours." };
            stopVideoStream();
            return { success: true, data: "⏹️ Stream arrêté." };
          case "restart":
            stopVideoStream();
            setTimeout(() => startVideoStream(), 3000);
            return { success: true, data: "🔄 Redémarrage du stream en cours..." };
          case "status":
            return {
              success: true,
              data: `Stream: ${active ? "🟢 En cours" : "🔴 Arrêté"}\nSelfbot: johnhelldivers26\nContrôlé par: Bot #6851`,
            };
          default:
            return {
              success: false,
              data: "Action invalide. Utilise: start, stop, restart, status",
            };
        }
      }

      // ─── 12. Send Alert Email (Part A) ─────────
      case "sendAlertEmail": {
        const subject = String(args.subject ?? "").trim();
        const message = String(args.message ?? "").trim();
        const severity = String(args.severity ?? "MEDIUM").toUpperCase() as
          "LOW" | "MEDIUM" | "HIGH" | "CRITICAL";

        if (!subject || !message) {
          return { success: false, data: "Sujet et message requis." };
        }

        const { dispatchAlert, createAlertPayload, isChannelAvailable } =
          await import("./alertDispatcher.js");

        if (!isChannelAvailable("EMAIL")) {
          return {
            success: false,
            data: "Email non configuré. Configurez SENDGRID_API_KEY ou SMTP_URL + EMAIL_RECIPIENTS dans .env",
          };
        }

        const payload = createAlertPayload(subject, message, severity, "0", "agent_tool");
        await dispatchAlert(null as never, payload);

        return {
          success: true,
          data: `📧 Email d'alerte envoyé (sévérité: ${severity})\nSujet: ${subject}`,
        };
      }

      // ─── Threat Intel Extended ─────────
      case "securityTrailsDnsHistory": {
        const domain = String(args.domain ?? "").trim();
        if (!domain) return { success: false, data: "Domaine requis" };
        const history = await getSecurityTrailsDnsHistory(domain);
        if (!history)
          return {
            success: false,
            data: "SecurityTrails indisponible (clé API manquante ou erreur)",
          };
        if (history.length === 0)
          return { success: true, data: `Aucun historique DNS trouvé pour ${domain}` };
        const formatted = history
          .map((h) => `${h.firstSeen} → ${h.lastSeen}: ${h.type} = ${h.value}`)
          .join("\n");
        return { success: true, data: `📋 Historique DNS pour ${domain}:\n${formatted}` };
      }

      case "censysAttackSurface": {
        const ip = String(args.ip ?? "").trim();
        if (!ip) return { success: false, data: "IP requise" };
        const surface = await getCensysAttackSurface(ip);
        if (!surface)
          return { success: false, data: "Censys indisponible (credentials manquants ou erreur)" };
        const services = surface.services.map((s) => `${s.port}/${s.service}`).join(", ");
        return {
          success: true,
          data: `🔍 ${surface.ip} — ${surface.location ?? "?"} ${surface.asn ?? ""}\nServices: ${services || "aucun"}`,
        };
      }

      case "greyNoiseClassify": {
        const ip = String(args.ip ?? "").trim();
        if (!ip) return { success: false, data: "IP requise" };
        const result = await getGreyNoiseClassification(ip);
        if (!result)
          return { success: false, data: "GreyNoise indisponible (clé API manquante ou erreur)" };
        const tag = result.noise ? "🌐 Internet noise" : "🎯 Targeted";
        return {
          success: true,
          data: `${tag} — ${result.ip}: ${result.classification}${result.name ? ` (${result.name})` : ""}${result.riot ? " [RIOT]" : ""}`,
        };
      }

      default:
        return null;
    }
  } catch (err) {
    const errMsg = err instanceof Error ? err.message : String(err);
    logger.warn(`[AgentToolsExt] ❌ ${toolName} failed: ${errMsg}`);
    return { success: false, data: `Erreur ${toolName}: ${errMsg}` };
  }
}
