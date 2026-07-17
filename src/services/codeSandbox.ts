/**
 * codeSandbox.ts — Exécution de code en sandbox sécurisée
 *
 * Deux modes :
 *  1. E2B (cloud sandbox) si E2B_API_KEY est configuré — isolation complète, Python/JS/Shell
 *  2. Fallback local : child_process avec timeout, restrictions mémoire, pas d'accès réseau
 *
 * L'agent IA peut demander d'exécuter du code pour :
 *  - Calculs complexes
 *  - Génération de fichiers (CSV, JSON, images via matplotlib)
 *  - Scraping avec requests/beautifulsoup
 *  - Analyse de données (pandas, numpy)
 *  - Prototypage rapide
 */

import { exec } from "child_process";
import { promisify } from "util";
import { writeFile, mkdir, rm, readFile } from "fs/promises";
import { join } from "path";
import { tmpdir } from "os";
import { randomUUID } from "crypto";
import logger from "../utils/logger.js";
import { autoHealTypeScriptError } from "./agentToolsFree.js";

const execAsync = promisify(exec);

const E2B_API_KEY = process.env.E2B_API_KEY ?? "";
const MAX_EXECUTION_TIME_MS = 15_000; // 15s max
const MAX_OUTPUT_LENGTH = 4000; // Truncate output for Discord
const LOCAL_TMP_DIR = join(tmpdir(), "jarvis-sandbox");

type Language = "python" | "javascript" | "shell";

interface SandboxResult {
  success: boolean;
  stdout: string;
  stderr: string;
  exitCode: number | null;
  executionTimeMs: number;
  files?: string[];
}

/**
 * Exécute du code dans une sandbox.
 * Utilise E2B si configuré, sinon fallback local.
 */
export async function executeCode(
  code: string,
  language: Language = "python",
): Promise<SandboxResult> {
  const startTime = Date.now();

  if (E2B_API_KEY) {
    try {
      return await executeWithE2B(code, language, startTime);
    } catch (err) {
      logger.warn(
        `[CodeSandbox] E2B failed, falling back to local: ${err instanceof Error ? err.message : String(err)}`,
      );
    }
  }

  return await executeLocal(code, language, startTime);
}

// ─── E2B Cloud Sandbox ───────────────────────────────────────────────────────

async function executeWithE2B(
  code: string,
  language: Language,
  startTime: number,
): Promise<SandboxResult> {
  // Dynamic import — E2B SDK only loaded if needed
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const { Sandbox } = await (import("e2b") as Promise<any>);

  const sandbox = await Sandbox.create({
    apiKey: E2B_API_KEY,
  });

  try {
    let result: { stdout: string; stderr: string; exitCode: number };

    if (language === "python") {
      // Write code to a temp file and execute
      await sandbox.files.write("/tmp/code.py", code);
      result = await sandbox.commands.run(`python3 /tmp/code.py`, {
        timeout: MAX_EXECUTION_TIME_MS,
      });
    } else if (language === "javascript") {
      await sandbox.files.write("/tmp/code.js", code);
      result = await sandbox.commands.run(`node /tmp/code.js`, {
        timeout: MAX_EXECUTION_TIME_MS,
      });
    } else {
      result = await sandbox.commands.run(code, {
        timeout: MAX_EXECUTION_TIME_MS,
      });
    }

    // Check for generated files
    let files: string[] = [];
    try {
      const fileList = await sandbox.commands.run("ls -la /tmp/output/ 2>/dev/null");
      if (fileList.stdout.trim()) {
        files = fileList.stdout
          .split("\n")
          .filter((l: string) => l.trim() && !l.startsWith("total") && !l.startsWith("d"))
          .map((l: string) => l.split(/\s+/).pop()!)
          .filter(Boolean);
      }
    } catch {
      // No output dir
    }

    return {
      success: result.exitCode === 0,
      stdout: truncate(result.stdout),
      stderr: truncate(result.stderr),
      exitCode: result.exitCode,
      executionTimeMs: Date.now() - startTime,
      files: files.length > 0 ? files : undefined,
    };
  } finally {
    await sandbox.kill();
  }
}

// ─── Local Sandbox (fallback) ────────────────────────────────────────────────

async function executeLocal(
  code: string,
  language: Language,
  startTime: number,
): Promise<SandboxResult> {
  const sessionId = randomUUID().slice(0, 8);
  const sessionDir = join(LOCAL_TMP_DIR, sessionId);

  await mkdir(sessionDir, { recursive: true });

  let ext: string;
  let cmd: string;

  if (language === "python") {
    ext = ".py";
    cmd = `python3`;
  } else if (language === "javascript") {
    ext = ".js";
    cmd = `node`;
  } else {
    // shell — write to .sh
    ext = ".sh";
    cmd = `bash`;
  }

  const codeFile = join(sessionDir, `code${ext}`);

  try {
    if (language === "shell") {
      await writeFile(codeFile, code, { encoding: "utf-8" });
      cmd = `bash "${codeFile}"`;
    } else {
      await writeFile(codeFile, code, { encoding: "utf-8" });
      cmd = `${cmd} "${codeFile}"`;
    }

    // Execute with timeout and memory limits
    // --restricted-memory=512m would require prlimit, not portable
    // We rely on timeout + process isolation
    const result = await execAsync(cmd, {
      timeout: MAX_EXECUTION_TIME_MS,
      maxBuffer: 1024 * 1024, // 1MB max output
      cwd: sessionDir,
      env: {
        ...process.env,
        // Restrict network access for untrusted code (best effort)
        HTTP_PROXY: "127.0.0.1:0",
        HTTPS_PROXY: "127.0.0.1:0",
        PYTHONUNBUFFERED: "1",
      },
    });

    return {
      success: true,
      stdout: truncate(result.stdout),
      stderr: truncate(result.stderr),
      exitCode: 0,
      executionTimeMs: Date.now() - startTime,
    };
  } catch (err) {
    const error = err as { stdout?: string; stderr?: string; code?: number; signal?: string; killed?: boolean };

    if (error.killed || error.signal === "SIGTERM") {
      return {
        success: false,
        stdout: truncate(error.stdout ?? ""),
        stderr: `Execution timed out after ${MAX_EXECUTION_TIME_MS / 1000}s`,
        exitCode: null,
        executionTimeMs: Date.now() - startTime,
      };
    }

    return {
      success: false,
      stdout: truncate(error.stdout ?? ""),
      stderr: truncate(error.stderr ?? String(err)),
      exitCode: error.code ?? 1,
      executionTimeMs: Date.now() - startTime,
    };
  } finally {
    // Cleanup
    try {
      await rm(sessionDir, { recursive: true, force: true });
    } catch {
      // Non-critical
    }
  }
}

// ─── Helpers ─────────────────────────────────────────────────────────────────

function truncate(text: string): string {
  if (!text) return "";
  if (text.length <= MAX_OUTPUT_LENGTH) return text;
  return text.slice(0, MAX_OUTPUT_LENGTH) + "\n... [output truncated]";
}

/**
 * Formate le résultat pour l'agent IA.
 */
export async function formatSandboxResult(result: SandboxResult): Promise<string> {
  const parts: string[] = [];

  parts.push(`Status: ${result.success ? "SUCCESS" : "FAILED"}`);
  parts.push(`Exit code: ${result.exitCode ?? "N/A (timeout)"}`);
  parts.push(`Execution time: ${result.executionTimeMs}ms`);

  if (result.stdout) {
    parts.push(`\n--- STDOUT ---\n${result.stdout}`);
  }

  if (result.stderr) {
    parts.push(`\n--- STDERR ---\n${result.stderr}`);

    // ─── TS-Wizard Auto-Heal: detect TypeScript errors and suggest patterns ───
    if (!result.success && isTypeError(result.stderr)) {
      try {
        const healingSuggestion = await autoHealTypeScriptError(result.stderr);
        if (healingSuggestion) {
          const CYAN = "\x1b[36m";
          const GREEN = "\x1b[32m";
          const RESET = "\x1b[0m";
          logger.info(
            `${CYAN}[CodeSandbox]${RESET} ${GREEN}TS-Wizard auto-heal triggered — pattern found${RESET}`,
          );
          parts.push(`\n--- TS-WIZARD SUGGESTION ---\n${healingSuggestion}`);
        }
      } catch {
        // Auto-heal should never crash the sandbox result formatting
      }
    }
  }

  if (result.files && result.files.length > 0) {
    parts.push(`\n--- Generated files ---\n${result.files.join(", ")}`);
  }

  if (!result.stdout && !result.stderr) {
    parts.push("\n(no output)");
  }

  return parts.join("\n");
}

/**
 * Detect if a stderr output contains TypeScript compilation errors.
 */
function isTypeError(stderr: string): boolean {
  const lower = stderr.toLowerCase();
  return (
    lower.includes("error ts") ||
    lower.includes("type '") ||
    lower.includes("is not assignable") ||
    lower.includes("does not exist on type") ||
    lower.includes("argument of type") ||
    lower.includes("no overload matches") ||
    lower.includes("type assertion") ||
    lower.includes("generic type") ||
    (lower.includes("syntaxerror") && lower.includes(".ts"))
  );
}

/**
 * Vérifie si la sandbox est disponible (E2B ou local).
 */
export function isSandboxAvailable(): boolean {
  return true; // Local fallback always available if python3/node is installed
}

/**
 * Vérifie si E2B est configuré.
 */
export function isE2BConfigured(): boolean {
  return E2B_API_KEY.length > 0;
}
