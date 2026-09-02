/**
 * osintToolkit.ts — OSINT & Intelligence gathering utilities
 * Called by Quant (the AI brain) via tool handlers in agentToolsExtended.ts
 */

import { execSync } from "child_process";
import logger from "../utils/logger.js";
import dns from "dns/promises";
import https from "https";

function fetchJson(url: string, timeout = 10000): Promise<any> {
  return new Promise((resolve, reject) => {
    const req = https.get(
      url,
      { timeout, headers: { "User-Agent": "Mozilla/5.0 (compatible; QuantBot/1.0)" } },
      (res) => {
        let data = "";
        res.on("data", (chunk) => (data += chunk));
        res.on("end", () => {
          try {
            resolve(JSON.parse(data));
          } catch {
            resolve(data);
          }
        });
      },
    );
    req.on("error", reject);
    req.on("timeout", () => {
      req.destroy();
      reject(new Error("Timeout"));
    });
  });
}

// ─── Wayback Machine lookup ────────────────────────────────────────────────
export async function waybackMachineLookup(url: string): Promise<string> {
  try {
    const api = `https://web.archive.org/cdx/search/cdx?url=${encodeURIComponent(url)}&output=json&limit=20&fl=timestamp,original,statuscode,mimetype`;
    const data = await fetchJson(api);
    if (!Array.isArray(data) || data.length < 2) return "No snapshots found";
    const rows = data
      .slice(1)
      .map((r: any[]) => ({ timestamp: r[0], url: r[1], status: r[2], type: r[3] }));
    return JSON.stringify(rows, null, 2);
  } catch (err) {
    return `Error: ${(err as Error).message}`;
  }
}

// ─── Wayback diff ───────────────────────────────────────────────────────────
export async function waybackDiff(
  url: string,
  timestamp1: string,
  timestamp2: string,
): Promise<string> {
  try {
    const url1 = `https://web.archive.org/web/${timestamp1}/${url}`;
    const url2 = `https://web.archive.org/web/${timestamp2}/${url}`;
    return `Compare:\n  Version 1: ${url1}\n  Version 2: ${url2}\n\nUse readUrl on both URLs to compare content.`;
  } catch (err) {
    return `Error: ${(err as Error).message}`;
  }
}

// ─── crt.sh search ──────────────────────────────────────────────────────────
export async function crtshSearch(domain: string): Promise<string> {
  try {
    const data = await fetchJson(`https://crt.sh/?q=${encodeURIComponent(domain)}&output=json`);
    if (!Array.isArray(data)) return "No certificates found";
    const certs = data.slice(0, 30).map((c: any) => ({
      issuer: c.issuer_name,
      commonName: c.common_name,
      notBefore: c.not_before,
      notAfter: c.not_after,
    }));
    return JSON.stringify({ total: data.length, certificates: certs }, null, 2);
  } catch (err) {
    return `Error: ${(err as Error).message}`;
  }
}

// ─── Have I Been Pwned check ────────────────────────────────────────────────
export async function haveibeenpwnedCheck(email: string): Promise<string> {
  try {
    const data = await fetchJson(
      `https://haveibeenpwned.com/api/v3/breachedaccount/${encodeURIComponent(email)}?truncateResponse=true`,
      10000,
    );
    if (!data) return "No breaches found (or API key required)";
    return JSON.stringify(data, null, 2);
  } catch (err) {
    if (String(err).includes("404")) return "No breaches found for this email";
    return `Error: ${(err as Error).message}. Note: HIBP API v3 requires an API key (HIBP_API_KEY env var).`;
  }
}

// ─── DeHashed search ────────────────────────────────────────────────────────
export async function dehashedSearch(_query: string): Promise<string> {
  return "DeHashed requires API credentials. Set DEHASHED_API_KEY and DEHASHED_EMAIL in .env to use this tool.";
}

// ─── Hunter.io email ────────────────────────────────────────────────────────
export async function hunterIoEmail(domain: string): Promise<string> {
  try {
    const data = await fetchJson(
      `https://api.hunter.io/v2/domain-search?domain=${domain}&limit=20`,
    );
    return JSON.stringify(data, null, 2);
  } catch (err) {
    return `Error: ${(err as Error).message}. Hunter.io requires API key.`;
  }
}

// ─── Phone number lookup full ───────────────────────────────────────────────
export async function phoneNumberLookupFull(phone: string): Promise<string> {
  try {
    const data = await fetchJson(
      `https://api.veriphone.io/v2/verify?phone=${encodeURIComponent(phone)}`,
    );
    return JSON.stringify(data, null, 2);
  } catch (err) {
    return `Error: ${(err as Error).message}. Try numlookup.com or twilio API as alternatives.`;
  }
}

// ─── Social media checker ──────────────────────────────────────────────────
export async function socialMediaChecker(username: string): Promise<string> {
  const platforms = [
    { name: "GitHub", url: `https://github.com/${username}` },
    { name: "Twitter/X", url: `https://x.com/${username}` },
    { name: "Instagram", url: `https://instagram.com/${username}` },
    { name: "TikTok", url: `https://tiktok.com/@${username}` },
    { name: "YouTube", url: `https://youtube.com/@${username}` },
    { name: "Twitch", url: `https://twitch.tv/${username}` },
    { name: "Reddit", url: `https://reddit.com/user/${username}` },
    { name: "Steam", url: `https://steamcommunity.com/id/${username}` },
    { name: "Spotify", url: `https://open.spotify.com/user/${username}` },
    { name: "Pinterest", url: `https://pinterest.com/${username}` },
    { name: "Medium", url: `https://medium.com/@${username}` },
    { name: "DeviantArt", url: `https://${username}.deviantart.com` },
    { name: "SoundCloud", url: `https://soundcloud.com/${username}` },
    { name: "Vimeo", url: `https://vimeo.com/${username}` },
    { name: "Patreon", url: `https://patreon.com/${username}` },
    { name: "Keybase", url: `https://keybase.io/${username}` },
    { name: "GitLab", url: `https://gitlab.com/${username}` },
    { name: "DockerHub", url: `https://hub.docker.com/u/${username}` },
    { name: "NPM", url: `https://npmjs.com/~${username}` },
    { name: "PyPI", url: `https://pypi.org/user/${username}` },
  ];

  const results: string[] = [];
  for (const p of platforms) {
    try {
      const resp = await fetch(p.url, {
        method: "HEAD",
        signal: AbortSignal.timeout(5000),
        redirect: "manual",
      });
      const found = resp.status !== 404;
      results.push(`${found ? "✅" : "❌"} ${p.name}: ${p.url} (HTTP ${resp.status})`);
    } catch {
      results.push(`❓ ${p.name}: ${p.url} (timeout/blocked)`);
    }
  }
  return results.join("\n");
}

// ─── Gravatar lookup ────────────────────────────────────────────────────────
export async function gravatarLookup(email: string): Promise<string> {
  try {
    const crypto = await import("crypto");
    const hash = crypto.createHash("md5").update(email.trim().toLowerCase()).digest("hex");
    const avatarUrl = `https://www.gravatar.com/avatar/${hash}?d=404&s=200`;
    const profileUrl = `https://www.gravatar.com/${hash}.json`;
    let profile: any = null;
    try {
      profile = await fetchJson(profileUrl);
    } catch {
      logger.error("[Silent catch]");
    }
    return JSON.stringify(
      {
        email,
        hash,
        avatarUrl,
        profile: profile?.entry?.[0] || null,
      },
      null,
      2,
    );
  } catch (err) {
    return `Error: ${(err as Error).message}`;
  }
}

// ─── GitHub dorks search ────────────────────────────────────────────────────
export async function githubDorksSearch(query: string): Promise<string> {
  try {
    const data = await fetchJson(
      `https://api.github.com/search/code?q=${encodeURIComponent(query)}&per_page=10`,
    );
    if (!data.items) return "No results found";
    const results = data.items.map((item: any) => ({
      repo: item.repository?.full_name,
      file: item.path,
      url: item.html_url,
    }));
    return JSON.stringify({ total: data.total_count, results }, null, 2);
  } catch (err) {
    return `Error: ${(err as Error).message}`;
  }
}

// ─── GitHub commit history ──────────────────────────────────────────────────
export async function githubCommitHistory(owner: string, repo: string): Promise<string> {
  try {
    const data = await fetchJson(
      `https://api.github.com/repos/${owner}/${repo}/commits?per_page=20`,
    );
    if (!Array.isArray(data)) return "No commits found";
    const commits = data.map((c: any) => ({
      sha: c.sha?.slice(0, 7),
      author: c.commit?.author?.name,
      date: c.commit?.author?.date,
      message: c.commit?.message?.slice(0, 100),
    }));
    return JSON.stringify(commits, null, 2);
  } catch (err) {
    return `Error: ${(err as Error).message}`;
  }
}

// ─── Google dorks generator ─────────────────────────────────────────────────
export function googleDorksGenerator(domain: string): string {
  const dorks = [
    `site:${domain}`,
    `site:${domain} filetype:pdf`,
    `site:${domain} filetype:doc`,
    `site:${domain} filetype:xls`,
    `site:${domain} filetype:sql`,
    `site:${domain} filetype:conf`,
    `site:${domain} filetype:bak`,
    `site:${domain} filetype:env`,
    `site:${domain} inurl:admin`,
    `site:${domain} inurl:login`,
    `site:${domain} inurl:dashboard`,
    `site:${domain} inurl:config`,
    `site:${domain} inurl:wp-admin`,
    `site:${domain} inurl:phpinfo`,
    `site:${domain} intitle:"index of"`,
    `site:${domain} intitle:"admin"`,
    `site:${domain} intext:"password"`,
    `site:${domain} intext:"api key"`,
    `site:${domain} intext:"BEGIN RSA PRIVATE KEY"`,
    `site:${domain} cache:`,
  ];
  return `Google Dorks for ${domain}:\n\n${dorks.map((d) => `  ${d}`).join("\n")}`;
}

// ─── Google cache lookup ────────────────────────────────────────────────────
export function googleCacheLookup(url: string): string {
  return `Google Cache URL:\n  https://webcache.googleusercontent.com/search?q=cache:${encodeURIComponent(url)}\n\nNote: Google Cache may be deprecated. Use Wayback Machine as alternative.`;
}

// ─── Reverse image search ───────────────────────────────────────────────────
export function reverseImageSearch(imageUrl: string): string {
  return `Reverse image search URLs:\n  Google: https://lens.google.com/uploadbyurl?url=${encodeURIComponent(imageUrl)}\n  TinEye: https://tineye.com/search/?url=${encodeURIComponent(imageUrl)}\n  Bing: https://www.bing.com/images/searchbyimage?cbir=ssbi&imgurl=${encodeURIComponent(imageUrl)}`;
}

// ─── EXIF extract full ──────────────────────────────────────────────────────
export function exifExtractFull(imagePath: string): string {
  try {
    const cmd = `docker exec kali-box exiftool -j '${imagePath}' 2>&1`;
    const output = execSync(cmd, { timeout: 15_000, encoding: "utf8" }).trim();
    return output || "No EXIF data found";
  } catch (err) {
    return `Error: ${(err as Error).message}. Install exiftool in Kali container.`;
  }
}

// ─── Metadata strip ─────────────────────────────────────────────────────────
export function metadataStrip(filePath: string): string {
  try {
    const cmd = `docker exec kali-box exiftool -all= -overwrite_original '${filePath}' 2>&1`;
    const output = execSync(cmd, { timeout: 15_000, encoding: "utf8" }).trim();
    return output || "Metadata stripped successfully";
  } catch (err) {
    return `Error: ${(err as Error).message}`;
  }
}

// ─── Darkweb monitor ────────────────────────────────────────────────────────
export async function darkwebMonitor(email: string): Promise<string> {
  return `Dark web monitoring for ${email}:\n  - Use HaveIBeenPwned API for breach data\n  - Use DeHashed for leaked credentials\n  - Use IntelligenceX for darknet forums\n  - Use darksearch.io for onion service search\n\nNote: Direct darkweb monitoring requires specialized APIs (IntelligenceX, DarkOwl, etc.)`;
}

// ─── Leaked source search ───────────────────────────────────────────────────
export function leakedSourceSearch(query: string): Promise<string> {
  return Promise.resolve(
    `Leaked source search for "${query}":\n  - Check IntelligenceX: https://intelx.io\n  - Check LeakIX: https://leakix.net\n  - Check DeHashed: https://dehashed.com\n  - Check Snusbase: https://snusbase.com\n\nNote: These services require API keys.`,
  );
}

// ─── Bitcoin address analysis ───────────────────────────────────────────────
export async function bitcoinAddressAnalysis(address: string): Promise<string> {
  try {
    const data = await fetchJson(
      `https://api.blockcypher.com/v1/btc/main/addrs/${address}/balance`,
    );
    return JSON.stringify(
      {
        address,
        balance: data.balance ? `${data.balance / 1e8} BTC` : "0 BTC",
        totalReceived: data.total_received ? `${data.total_received / 1e8} BTC` : "0 BTC",
        totalSent: data.total_sent ? `${data.total_sent / 1e8} BTC` : "0 BTC",
        txCount: data.n_tx,
      },
      null,
      2,
    );
  } catch (err) {
    return `Error: ${(err as Error).message}`;
  }
}

// ─── Ethereum contract verify ───────────────────────────────────────────────
export async function ethereumContractVerify(address: string): Promise<string> {
  try {
    const data = await fetchJson(
      `https://api.etherscan.io/api?module=contract&action=getsourcecode&address=${address}`,
    );
    if (data.status === "1" && data.result?.[0]) {
      const c = data.result[0];
      return JSON.stringify(
        {
          contractName: c.ContractName,
          compiler: c.CompilerVersion,
          verified: c.SourceCode ? true : false,
          abi: c.ABI?.slice(0, 200) + "...",
          sourceCodeLength: c.SourceCode?.length || 0,
        },
        null,
        2,
      );
    }
    return "Contract not verified or not found on Etherscan";
  } catch (err) {
    return `Error: ${(err as Error).message}`;
  }
}

// ─── Domain WHOIS history ───────────────────────────────────────────────────
export async function domainWhoisHistory(domain: string): Promise<string> {
  try {
    const cmd = `docker exec kali-box whois ${domain} 2>&1 | head -60`;
    const output = execSync(cmd, { timeout: 15_000, encoding: "utf8" }).trim();
    return output || "No WHOIS data available";
  } catch (err) {
    return `Error: ${(err as Error).message}`;
  }
}

// ─── Reverse WHOIS ──────────────────────────────────────────────────────────
export async function reverseWhois(email: string): Promise<string> {
  return `Reverse WHOIS for ${email}:\n  - Use DomainTools: https://research.domaintools.com/reverse-whois\n  - Use WhoisXML API: https://whoisxmlapi.com/\n  - Use viewdns.info: https://viewdns.info/reversewhois/\n\nNote: These services require API keys or paid subscriptions.`;
}

// ─── DNS history passive ────────────────────────────────────────────────────
export async function dnsHistoryPassive(domain: string): Promise<string> {
  try {
    const records = await dns.resolve4(domain);
    const mxRecords = await dns.resolveMx(domain).catch((): [] => []);
    const txtRecords = await dns.resolveTxt(domain).catch((): [] => []);
    const nsRecords = await dns.resolveNs(domain).catch((): [] => []);
    return JSON.stringify(
      {
        domain,
        currentA: records,
        currentMX: mxRecords.map((m) => m.exchange),
        currentTXT: txtRecords.map((t) => t.join("")),
        currentNS: nsRecords,
        note: "For historical DNS data, use SecurityTrails API (requires API key)",
      },
      null,
      2,
    );
  } catch (err) {
    return `Error: ${(err as Error).message}`;
  }
}

// ─── Breach parse ───────────────────────────────────────────────────────────
export function breachParse(filePath: string, format: string): string {
  try {
    const cmd = `docker exec kali-box bash -c "head -20 '${filePath}' | ${format === "csv" ? "cut -d, -f1-3" : format === "sql" ? "grep -i 'INSERT\\|VALUES' | head -20" : "cat"}" 2>&1`;
    const output = execSync(cmd, { timeout: 15_000, encoding: "utf8" }).trim();
    return output || "File empty or not accessible";
  } catch (err) {
    return `Error: ${(err as Error).message}`;
  }
}

// ─── Malware sample lookup ──────────────────────────────────────────────────
export async function malwareSampleLookup(hash: string): Promise<string> {
  try {
    return `Malware hash lookup for ${hash}:\n  - VirusTotal: https://www.virustotal.com/gui/search/${hash}\n  - MalwareBazaar: https://bazaar.abuse.ch/sample/${hash}\n  - AlienVault OTX: https://otx.alienvault.com/indicator/file/${hash}\n  - Hybrid Analysis: https://hybrid-analysis.com/search?query=${hash}`;
  } catch (err) {
    return `Error: ${(err as Error).message}`;
  }
}
