/**
 * systemDevopsToolkit.ts — System & DevOps utilities
 * Called by Quant (the AI brain) via tool handlers in agentToolsExtended.ts
 */

import { execSync } from "child_process";
import os from "os";
import fs from "fs";
import tls from "tls";

// ─── Process monitor ────────────────────────────────────────────────────────
export function processMonitor(): string {
  try {
    const cmd =
      process.platform === "win32"
        ? "tasklist /FO CSV /NH | sort /R /+52 | head -20"
        : "ps aux --sort=-%cpu | head -20";
    const output = execSync(cmd, { timeout: 10_000, encoding: "utf8" }).trim();
    return output;
  } catch (err) {
    return `Error: ${(err as Error).message}`;
  }
}

// ─── Disk usage analyzer ────────────────────────────────────────────────────
export function diskUsageAnalyzer(path: string): string {
  try {
    const usePath = path || ".";
    const cmd =
      process.platform === "win32"
        ? `powershell -Command "Get-ChildItem '${usePath}' | Select-Object Name, @{N='SizeMB';E={[math]::Round($_.Length/1MB,2)}} | Sort-Object SizeMB -Descending | Select-Object -First 20"`
        : `du -sh ${usePath}/* 2>/dev/null | sort -rh | head -20`;
    const output = execSync(cmd, { timeout: 15_000, encoding: "utf8" }).trim();
    return output || "No data";
  } catch (err) {
    return `Error: ${(err as Error).message}`;
  }
}

// ─── Network connections list ───────────────────────────────────────────────
export function networkConnectionsList(): string {
  try {
    const cmd =
      process.platform === "win32" ? "netstat -ano | findstr ESTABLISHED" : "ss -tunap | head -30";
    const output = execSync(cmd, { timeout: 10_000, encoding: "utf8" }).trim();
    return output;
  } catch (err) {
    return `Error: ${(err as Error).message}`;
  }
}

// ─── Firewall rules audit ───────────────────────────────────────────────────
export function firewallRulesAudit(): string {
  try {
    const cmd =
      process.platform === "win32"
        ? "netsh advfirewall firewall show rule name=all | findstr RuleName: | head -30"
        : "iptables -L -n --line-numbers 2>/dev/null || ufw status verbose 2>/dev/null";
    const output = execSync(cmd, { timeout: 10_000, encoding: "utf8" }).trim();
    return output || "No firewall rules found";
  } catch (err) {
    return `Error: ${(err as Error).message}`;
  }
}

// ─── Cron jobs list ─────────────────────────────────────────────────────────
export function cronJobsList(): string {
  try {
    const cmd =
      "crontab -l 2>/dev/null; ls /etc/cron.d/ 2>/dev/null; ls /etc/cron.daily/ 2>/dev/null";
    const output = execSync(cmd, { timeout: 10_000, encoding: "utf8" }).trim();
    return output || "No cron jobs found";
  } catch (err) {
    return `Error: ${(err as Error).message}`;
  }
}

// ─── Env vars inspect ───────────────────────────────────────────────────────
export function envVarsInspect(): string {
  const safe: string[] = [];
  for (const [key, value] of Object.entries(process.env)) {
    if (/key|token|secret|password|pass|auth|credential/i.test(key)) {
      safe.push(`${key}=[REDACTED]`);
    } else {
      safe.push(`${key}=${value?.slice(0, 50) || ""}`);
    }
  }
  return safe.slice(0, 50).join("\n");
}

// ─── Log tail ───────────────────────────────────────────────────────────────
export function logTail(logPath: string, lines: number): string {
  try {
    const n = lines || 50;
    const cmd =
      process.platform === "win32"
        ? `powershell -Command "Get-Content '${logPath}' -Tail ${n}"`
        : `tail -n ${n} ${logPath}`;
    const output = execSync(cmd, { timeout: 10_000, encoding: "utf8" }).trim();
    return output;
  } catch (err) {
    return `Error: ${(err as Error).message}`;
  }
}

// ─── Service status check ───────────────────────────────────────────────────
export function serviceStatusCheck(serviceName: string): string {
  try {
    const cmd =
      process.platform === "win32"
        ? `sc query ${serviceName} 2>&1`
        : `systemctl status ${serviceName} 2>&1 | head -15`;
    const output = execSync(cmd, { timeout: 10_000, encoding: "utf8" }).trim();
    return output;
  } catch (err) {
    return `Error: ${(err as Error).message}`;
  }
}

// ─── Docker PS audit ────────────────────────────────────────────────────────
export function dockerPsAudit(): string {
  try {
    const cmd =
      "docker ps -a --format 'table {{.Names}}\\t{{.Image}}\\t{{.Status}}\\t{{.Ports}}\\t{{.Names}}' 2>&1";
    const output = execSync(cmd, { timeout: 15_000, encoding: "utf8" }).trim();
    return output || "No Docker containers found";
  } catch (err) {
    return `Error: ${(err as Error).message}`;
  }
}

// ─── Docker image vuln scan ─────────────────────────────────────────────────
export function dockerImageVulnScan(image: string): string {
  try {
    const cmd = `docker exec kali-box trivy image --quiet ${image} 2>&1 | head -50 || echo "Trivy not available"`;
    const output = execSync(cmd, { timeout: 120_000, encoding: "utf8" }).trim();
    return output || "No vulnerabilities found or Trivy not available";
  } catch (err) {
    return `Error: ${(err as Error).message}`;
  }
}

// ─── K8s pod inspect ────────────────────────────────────────────────────────
export function k8sPodInspect(namespace: string): string {
  try {
    const ns = namespace || "default";
    const cmd = `kubectl get pods -n ${ns} -o wide 2>&1 | head -30`;
    const output = execSync(cmd, { timeout: 15_000, encoding: "utf8" }).trim();
    return output || "No pods found or kubectl not available";
  } catch (err) {
    return `Error: ${(err as Error).message}`;
  }
}

// ─── Nginx config check ─────────────────────────────────────────────────────
export function nginxConfigCheck(configPath: string): string {
  try {
    const cmd = `nginx -t ${configPath ? `-c ${configPath}` : ""} 2>&1`;
    const output = execSync(cmd, { timeout: 10_000, encoding: "utf8" }).trim();
    return output || "Config OK";
  } catch (err) {
    return `Error: ${(err as Error).message}`;
  }
}

// ─── Apache config check ────────────────────────────────────────────────────
export function apacheConfigCheck(): string {
  try {
    const cmd = "apachectl configtest 2>&1 || httpd -t 2>&1";
    const output = execSync(cmd, { timeout: 10_000, encoding: "utf8" }).trim();
    return output || "Config OK";
  } catch (err) {
    return `Error: ${(err as Error).message}`;
  }
}

// ─── SSL cert expiry check ──────────────────────────────────────────────────
export async function sslCertExpiryCheck(domains: string): Promise<string> {
  const tls = await import("tls");
  const domainList = domains.split(",").map((d) => d.trim());
  const results: { domain: string; daysLeft: number; validTo: string }[] = [];

  for (const domain of domainList) {
    try {
      const info = await new Promise<tls.PeerCertificate>((resolve, reject) => {
        const socket = tls.connect(
          443,
          domain,
          { servername: domain, rejectUnauthorized: false },
          () => {
            resolve(socket.getPeerCertificate());
            socket.destroy();
          },
        );
        socket.setTimeout(5000);
        socket.on("error", reject);
        socket.on("timeout", () => {
          socket.destroy();
          reject(new Error("Timeout"));
        });
      });
      const validTo = new Date(info.valid_to);
      const daysLeft = Math.floor((validTo.getTime() - Date.now()) / 86400000);
      results.push({ domain, daysLeft, validTo: validTo.toISOString() });
    } catch (err) {
      results.push({ domain, daysLeft: -1, validTo: `Error: ${(err as Error).message}` });
    }
  }
  return JSON.stringify(results, null, 2);
}

// ─── DNS propagation check ──────────────────────────────────────────────────
export async function dnsPropagationCheck(domain: string, recordType: string): Promise<string> {
  const dns = await import("dns/promises");
  const servers = ["8.8.8.8", "1.1.1.1", "8.8.4.4", "9.9.9.9", "208.67.222.222"];
  const type = recordType || "A";
  const results: { server: string; records: string[] }[] = [];

  for (const server of servers) {
    try {
      dns.setServers([server]);
      let records: string[];
      if (type === "A") records = (await dns.resolve4(domain)) as string[];
      else if (type === "AAAA") records = (await dns.resolve6(domain)) as string[];
      else if (type === "MX") records = (await dns.resolveMx(domain)).map((m) => m.exchange);
      else if (type === "TXT") records = (await dns.resolveTxt(domain)).map((t) => t.join(""));
      else if (type === "NS") records = (await dns.resolveNs(domain)) as string[];
      else records = ["Unsupported type"];
      results.push({ server, records });
    } catch (err) {
      results.push({ server, records: [`Error: ${(err as Error).message}`] });
    }
  }
  return JSON.stringify({ domain, recordType: type, results }, null, 2);
}

// ─── Load average monitor ───────────────────────────────────────────────────
export function loadAverageMonitor(): string {
  const load = os.loadavg();
  const cpus = os.cpus();
  const totalMem = os.totalmem();
  const freeMem = os.freemem();
  return JSON.stringify(
    {
      loadAverage: { "1min": load[0], "5min": load[1], "15min": load[2] },
      cpuCount: cpus.length,
      cpuModel: cpus[0]?.model,
      memory: {
        total: `${(totalMem / 1e9).toFixed(1)} GB`,
        free: `${(freeMem / 1e9).toFixed(1)} GB`,
        used: `${((totalMem - freeMem) / 1e9).toFixed(1)} GB`,
      },
      uptime: `${(os.uptime() / 3600).toFixed(1)} hours`,
      platform: `${os.platform()} ${os.release()}`,
    },
    null,
    2,
  );
}

// ─── Memory leak detect ─────────────────────────────────────────────────────
export function memoryLeakDetect(): string {
  const snapshots: number[] = [];
  for (let i = 0; i < 5; i++) {
    const mem = process.memoryUsage();
    snapshots.push(mem.heapUsed);
    if (i < 4) execSync("sleep 1", { timeout: 2000 });
  }
  const trend = snapshots[4] - snapshots[0];
  return JSON.stringify(
    {
      heapSnapshots: snapshots.map((s) => `${(s / 1e6).toFixed(1)} MB`),
      trend: trend > 0 ? `⚠️ Growing by ${(trend / 1e6).toFixed(1)} MB over 5s` : "✅ Stable",
    },
    null,
    2,
  );
}

// ─── Port kill ──────────────────────────────────────────────────────────────
export function portKill(port: number): string {
  try {
    const cmd =
      process.platform === "win32"
        ? `for /f "tokens=5" %a in ('netstat -ano ^| findstr :${port}') do taskkill /PID %a /F`
        : `fuser -k ${port}/tcp 2>&1 || lsof -ti:${port} | xargs kill -9 2>&1`;
    const output = execSync(cmd, { timeout: 10_000, encoding: "utf8" }).trim();
    return output || `Port ${port} freed`;
  } catch (err) {
    return `Error: ${(err as Error).message}`;
  }
}

// ─── File permission audit ──────────────────────────────────────────────────
export function filePermissionAudit(dirPath: string): string {
  try {
    const cmd =
      process.platform === "win32"
        ? `powershell -Command "Get-ChildItem '${dirPath}' -Recurse | Where-Object { $_.Attributes -match 'World' } | Select-Object FullName | head -20"`
        : `find ${dirPath || "."} -type f -perm /o+w 2>/dev/null | head -20; find ${dirPath || "."} -type f -perm /u+s 2>/dev/null | head -20`;
    const output = execSync(cmd, { timeout: 15_000, encoding: "utf8" }).trim();
    return output || "No suspicious permissions found";
  } catch (err) {
    return `Error: ${(err as Error).message}`;
  }
}

// ─── SSH key audit ──────────────────────────────────────────────────────────
export function sshKeyAudit(): string {
  try {
    const sshDir = `${os.homedir()}/.ssh`;
    if (!fs.existsSync(sshDir)) return "No .ssh directory found";
    const files = fs.readdirSync(sshDir);
    const results: { file: string; type: string; bits: number; fingerprint: string }[] = [];
    for (const file of files) {
      if (file.endsWith(".pub")) {
        try {
          const content = fs.readFileSync(`${sshDir}/${file}`, "utf8");
          const parts = content.trim().split(" ");
          results.push({
            file,
            type: parts[0] || "unknown",
            bits: parts[0]?.includes("rsa") ? 0 : 0,
            fingerprint: parts[1]?.slice(0, 30) + "...",
          });
        } catch {}
      }
    }
    return JSON.stringify({ totalKeys: results.length, keys: results }, null, 2);
  } catch (err) {
    return `Error: ${(err as Error).message}`;
  }
}
