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

import { exec } from "child_process";
import { createHash } from "crypto";
import { promisify } from "util";
import { readFile, writeFile, access } from "fs/promises";
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

const execAsync = promisify(exec);
const rssParser = new Parser();

const SSH_ENABLED = process.env.AGENT_SSH_ENABLED === "true";
const DOCKER_ENABLED = process.env.AGENT_DOCKER_ENABLED === "true";
const GIT_ENABLED = process.env.AGENT_GIT_ENABLED === "true";
const DB_ENABLED = process.env.AGENT_DB_ENABLED !== "false"; // default true
const MAX_OUTPUT = 3000;

// Whitelist de commandes shell sûres
const SHELL_WHITELIST = [
  "uptime",
  "free",
  "df",
  "top -bn1",
  "ps aux",
  "htop",
  "systemctl status",
  "systemctl list-units",
  "pm2 list",
  "pm2 status",
  "pm2 info",
  "pm2 logs --nostream --lines 20",
  "docker ps",
  "docker stats --no-stream",
  "docker logs --tail 20",
  "git status",
  "git log --oneline -10",
  "git diff --stat",
  "curl -s",
  "wget -q -O -",
  "ls -la",
  "cat /etc/os-release",
  "uname -a",
  "netstat -tlnp",
  "ss -tlnp",
  "du -sh",
  "wc -l",
];

function isCommandAllowed(cmd: string): boolean {
  const trimmed = cmd.trim();
  return SHELL_WHITELIST.some((allowed) => trimmed.startsWith(allowed));
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
  args: Record<string, unknown>,
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

        const headers: Record<string, string> = {};
        if (args.headers && typeof args.headers === "object") {
          for (const [k, v] of Object.entries(args.headers as Record<string, unknown>)) {
            headers[k] = String(v);
          }
        }

        const res = await fetch(url, {
          method,
          headers,
          body: args.body ? String(args.body) : undefined,
          signal: AbortSignal.timeout(15_000),
        });

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
          const la = (process as unknown as { loadavg?: () => number[] }).loadavg?.();
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
        if (!isCommandAllowed(command)) {
          return {
            success: false,
            data: `Commande non autorisée. Whitelist: ${SHELL_WHITELIST.join(", ")}`,
          };
        }
        const { stdout, stderr } = await execAsync(command, {
          timeout: 10_000,
          maxBuffer: 1024 * 1024,
        });
        return { success: true, data: truncate(stdout + (stderr ? `\nSTDERR:\n${stderr}` : "")) };
      }

      // ─── 4. DB Query ─────────
      case "db_query": {
        if (!DB_ENABLED) return { success: false, data: "DB query désactivé" };
        const query = String(args.query ?? "").trim();
        if (!query.toUpperCase().startsWith("SELECT")) {
          return { success: false, data: "Seules les requêtes SELECT sont autorisées" };
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

        const res = await fetch(url, { signal: AbortSignal.timeout(10_000) });
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

        const res = await fetch(url, {
          headers: { "User-Agent": "Mozilla/5.0 (compatible; DiscordBot/1.0)" },
          signal: AbortSignal.timeout(10_000),
        });
        if (!res.ok) return { success: false, data: `Fetch ${res.status}` };
        const html = await res.text();
        const contentHash = createHash("md5").update(html).digest("hex").slice(0, 16);

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
          // Execute as shell command if SSH enabled, otherwise just log
          if (SSH_ENABLED && isCommandAllowed(command)) {
            execAsync(command, { timeout: 30_000 }).catch((err) =>
              logger.warn(
                `[DynamicCron] ${name} error: ${err instanceof Error ? err.message : String(err)}`,
              ),
            );
          } else {
            logger.info(`[DynamicCron] ${name} (log only — SSH disabled): ${command}`);
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

        const dockerCmd =
          {
            list: "docker ps -a --format 'table {{.Names}}\t{{.Status}}\t{{.Image}}'",
            logs: `docker logs --tail 30 ${container}`,
            restart: `docker restart ${container}`,
            stats:
              "docker stats --no-stream --format 'table {{.Name}}\t{{.CPUPerc}}\t{{.MemUsage}}'",
          }[action] ?? "docker ps";

        const { stdout } = await execAsync(dockerCmd, { timeout: 15_000, maxBuffer: 1024 * 1024 });
        return { success: true, data: `Docker ${action}:\n${truncate(stdout)}` };
      }

      // ─── 10. File Read ─────────
      case "check_vps_storage": {
        const { vpsMaintenanceCheck } = await import("./vpsMaintenance.js");
        return await vpsMaintenanceCheck();
      }
      // ─── 10b. File Read ─────────
      case "file_read": {
        const path = String(args.path ?? "");
        if (!path.startsWith("/"))
          return { success: false, data: "Chemin absolu requis (ex: /var/log/syslog)" };
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
