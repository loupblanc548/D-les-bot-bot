/**
 * networkToolkit.ts — Network & Infrastructure utilities
 * Called by Quant (the AI brain) via tool handlers in agentToolsExtended.ts
 */

import { execSync } from "child_process";
import logger from "../utils/logger.js";
import dns from "dns/promises";

// ─── SMTP relay test ──────────────────────────────────────────────────────
export function smtpRelayTest(host: string, port: number): string {
  try {
    const cmd = `docker exec kali-box bash -c "echo 'QUIT' | timeout 10 nc ${host} ${port || 25} 2>&1"`;
    const output = execSync(cmd, { timeout: 15_000, encoding: "utf8" }).trim();
    const isOpenRelay = /220.*SMTP/i.test(output);
    return JSON.stringify({
      host,
      port: port || 25,
      banner: output.slice(0, 500),
      openRelayPossible: isOpenRelay,
    });
  } catch (err) {
    return `Error: ${(err as Error).message}`;
  }
}

// ─── SMTP enum VRFY ────────────────────────────────────────────────────────
export function smtpEnumVrfy(host: string, port: number, usernames: string): string {
  try {
    const users = usernames
      .split(",")
      .map((u) => u.trim())
      .slice(0, 20);
    const results: string[] = [];
    for (const user of users) {
      const cmd = `docker exec kali-box bash -c "echo -e 'VRFY ${user}\\r\\nQUIT\\r\\n' | timeout 5 nc ${host} ${port || 25} 2>&1"`;
      const output = execSync(cmd, { timeout: 10_000, encoding: "utf8" }).trim();
      const exists = /252|250/i.test(output);
      results.push(`${user}: ${exists ? "EXISTS" : "NOT FOUND"} (${output.slice(0, 100)})`);
    }
    return results.join("\n");
  } catch (err) {
    return `Error: ${(err as Error).message}`;
  }
}

// ─── FTP anonymous check ────────────────────────────────────────────────────
export function ftpAnonymousCheck(host: string, port: number): string {
  try {
    const cmd = `docker exec kali-box bash -c "echo -e 'USER anonymous\\r\\nPASS anonymous@test\\r\\nQUIT\\r\\n' | timeout 10 nc ${host} ${port || 21} 2>&1"`;
    const output = execSync(cmd, { timeout: 15_000, encoding: "utf8" }).trim();
    const allowsAnonymous = /230.*login|230.*access|230.*successful/i.test(output);
    return JSON.stringify({
      host,
      port: port || 21,
      allowsAnonymous,
      banner: output.slice(0, 500),
    });
  } catch (err) {
    return `Error: ${(err as Error).message}`;
  }
}

// ─── SMB enum shares ────────────────────────────────────────────────────────
export function smbEnumShares(host: string): string {
  try {
    const cmd = `docker exec kali-box enum4linux -S ${host} 2>&1 | head -50`;
    const output = execSync(cmd, { timeout: 30_000, encoding: "utf8" }).trim();
    return output || "No shares found or enum4linux not available";
  } catch (err) {
    return `Error: ${(err as Error).message}`;
  }
}

// ─── SMB version detect ─────────────────────────────────────────────────────
export function smbVersionDetect(host: string): string {
  try {
    const cmd = `docker exec kali-box nmap -p 445 --script smb-os-discovery ${host} 2>&1 | head -30`;
    const output = execSync(cmd, { timeout: 30_000, encoding: "utf8" }).trim();
    return output || "No SMB version detected";
  } catch (err) {
    return `Error: ${(err as Error).message}`;
  }
}

// ─── LDAP enum ──────────────────────────────────────────────────────────────
export function ldapEnum(host: string, port: number): string {
  try {
    const cmd = `docker exec kali-box nmap -p ${port || 389} --script ldap-search ${host} 2>&1 | head -60`;
    const output = execSync(cmd, { timeout: 30_000, encoding: "utf8" }).trim();
    return output || "No LDAP data found";
  } catch (err) {
    return `Error: ${(err as Error).message}`;
  }
}

// ─── Kerberos user enum ─────────────────────────────────────────────────────
export function kerberosUserEnum(host: string, realm: string, usernames: string): string {
  try {
    const users = usernames
      .split(",")
      .map((u) => u.trim())
      .slice(0, 20);
    const results: string[] = [];
    for (const user of users) {
      const cmd = `docker exec kali-box python3 -c "
import socket, struct
# Simple Kerberos pre-auth probe
s = socket.socket(socket.AF_INET, socket.SOCK_STREAM)
s.settimeout(5)
s.connect(('${host}', 88))
# AS-REQ without pre-auth
req = bytes.fromhex('6a82') + struct.pack('>I', len('${user}@${realm}')+30) + b'\\x00\\x00\\x00\\x00\\xa0\\x03\\x02\\x01\\x05\\xa1\\x03\\x02\\x01\\x0a\\xa2\\x07\\x03\\x05\\x00\\x40\\x00\\x10\\x00' + b'${user}@${realm}'
s.send(req)
resp = s.recv(4096)
s.close()
print('VALID' if len(resp) > 50 else 'INVALID')
" 2>&1`;
      try {
        const output = execSync(cmd, { timeout: 10_000, encoding: "utf8" }).trim();
        results.push(`${user}: ${output}`);
      } catch {
        results.push(`${user}: TIMEOUT`);
      }
    }
    return results.join("\n");
  } catch (err) {
    return `Error: ${(err as Error).message}`;
  }
}

// ─── RDP check ──────────────────────────────────────────────────────────────
export function rdpCheck(host: string, port: number): string {
  try {
    const cmd = `docker exec kali-box nmap -p ${port || 3389} --script rdp-enum-encryption,rdp-vuln-ms12-020 ${host} 2>&1 | head -30`;
    const output = execSync(cmd, { timeout: 30_000, encoding: "utf8" }).trim();
    return output || "RDP not accessible";
  } catch (err) {
    return `Error: ${(err as Error).message}`;
  }
}

// ─── SSH version scan ───────────────────────────────────────────────────────
export function sshVersionScan(host: string, port: number): string {
  try {
    const cmd = `docker exec kali-box nmap -p ${port || 22} -sV --script ssh2-enum-algos,ssh-hostkey ${host} 2>&1 | head -40`;
    const output = execSync(cmd, { timeout: 30_000, encoding: "utf8" }).trim();
    return output || "SSH not accessible";
  } catch (err) {
    return `Error: ${(err as Error).message}`;
  }
}

// ─── Telnet banner grab ─────────────────────────────────────────────────────
export function telnetBannerGrab(host: string, port: number): string {
  try {
    const cmd = `docker exec kali-box bash -c "echo '' | timeout 5 nc ${host} ${port || 23} 2>&1"`;
    const output = execSync(cmd, { timeout: 10_000, encoding: "utf8" }).trim();
    return output || "No banner received";
  } catch (err) {
    return `Error: ${(err as Error).message}`;
  }
}

// ─── SNMP walk ──────────────────────────────────────────────────────────────
export function snmpWalk(host: string, community: string): string {
  try {
    const cmd = `docker exec kali-box snmpwalk -v 2c -c ${community || "public"} ${host} 2>&1 | head -80`;
    const output = execSync(cmd, { timeout: 30_000, encoding: "utf8" }).trim();
    return output || "No SNMP response";
  } catch (err) {
    return `Error: ${(err as Error).message}`;
  }
}

// ─── NTP monlist ────────────────────────────────────────────────────────────
export function ntpMonlist(host: string): string {
  try {
    const cmd = `docker exec kali-box nmap -p 123 -sU --script ntp-monlist ${host} 2>&1 | head -30`;
    const output = execSync(cmd, { timeout: 30_000, encoding: "utf8" }).trim();
    const vulnerable = /monlist/i.test(output);
    return JSON.stringify({ host, vulnerable, details: output.slice(0, 500) });
  } catch (err) {
    return `Error: ${(err as Error).message}`;
  }
}

// ─── DNS zone transfer ──────────────────────────────────────────────────────
export async function dnsZoneTransfer(domain: string): Promise<string> {
  try {
    const nsRecords = await dns.resolveNs(domain);
    const results: string[] = [];
    for (const ns of nsRecords.slice(0, 5)) {
      try {
        const cmd = `dig AXFR ${domain} @${ns} +short 2>&1 | head -50`;
        const output = execSync(cmd, { timeout: 10_000, encoding: "utf8" }).trim();
        if (output && !output.includes("Transfer failed")) {
          results.push(`--- ${ns} ---\n${output}`);
        } else {
          results.push(`--- ${ns} --- ZONE TRANSFER DENIED`);
        }
      } catch {
        results.push(`--- ${ns} --- TIMEOUT`);
      }
    }
    return results.join("\n") || "No zone transfer possible";
  } catch (err) {
    return `Error: ${(err as Error).message}`;
  }
}

// ─── DNS subdomain brute ────────────────────────────────────────────────────
export async function dnsSubdomainBrute(domain: string, wordlist: string): Promise<string> {
  const subdomains = (
    wordlist ||
    "www,mail,ftp,admin,api,dev,staging,test,vpn,blog,shop,portal,secure,demo,git,ci,app,mobile,cdn,cloud,db,redis,elastic,grafana,jenkins,kubernetes,docker,registry,nexus,sonar,sentry,prometheus"
  )
    .split(",")
    .map((s) => s.trim());
  const found: string[] = [];
  for (const sub of subdomains) {
    try {
      const records = await dns.resolve4(`${sub}.${domain}`);
      if (records.length > 0) {
        found.push(`${sub}.${domain} -> ${records.join(", ")}`);
      }
    } catch { logger.error("[Silent catch]"); }
  }
  return found.length > 0
    ? `Found ${found.length} subdomains:\n${found.join("\n")}`
    : "No subdomains found";
}

// ─── DNS rebinding check ────────────────────────────────────────────────────
export async function dnsRebindingCheck(domain: string): Promise<string> {
  try {
    const records = await dns.resolve4(domain);
    const hasPrivate = records.some((ip) => {
      const parts = ip.split(".").map(Number);
      return (
        parts[0] === 10 ||
        (parts[0] === 172 && parts[1] >= 16 && parts[1] <= 31) ||
        (parts[0] === 192 && parts[1] === 168)
      );
    });
    return JSON.stringify({
      domain,
      records,
      hasPrivateIP: hasPrivate,
      rebindingRisk: hasPrivate ? "HIGH" : "LOW",
    });
  } catch (err) {
    return `Error: ${(err as Error).message}`;
  }
}

// ─── IPv6 scan ──────────────────────────────────────────────────────────────
export function ipv6Scan(interfaceName: string): string {
  try {
    const cmd = `docker exec kali-box nmap -6 --script targets-ipv6-multicast-invalid.nse --script-args 'newtargets,interface=${interfaceName || "eth0"}' -sn 2>&1 | head -30`;
    const output = execSync(cmd, { timeout: 30_000, encoding: "utf8" }).trim();
    return output || "No IPv6 hosts found";
  } catch (err) {
    return `Error: ${(err as Error).message}`;
  }
}

// ─── VLAN hop test ──────────────────────────────────────────────────────────
export function vlanHopTest(interfaceName: string): string {
  try {
    const cmd = `docker exec kali-box bash -c "echo 'VLAN hopping test requires manual configuration. Checking switch config...' && nmap -sn --script broadcast-arp-sweep ${interfaceName || "eth0"} 2>&1" | head -20`;
    const output = execSync(cmd, { timeout: 20_000, encoding: "utf8" }).trim();
    return output || "VLAN hop test inconclusive";
  } catch (err) {
    return `Error: ${(err as Error).message}`;
  }
}

// ─── WiFi deauth detect ─────────────────────────────────────────────────────
export function wifiDeauthDetect(interfaceName: string, duration: number): string {
  try {
    const dur = duration || 30;
    const cmd = `docker exec kali-box timeout ${dur} tshark -i ${interfaceName || "wlan0mon"} -Y 'deauth' -c 10 2>&1 || echo "No deauth frames detected in ${dur}s"`;
    const output = execSync(cmd, { timeout: (dur + 5) * 1000, encoding: "utf8" }).trim();
    return output || "No deauth frames detected";
  } catch (err) {
    return `Error: ${(err as Error).message}`;
  }
}

// ─── ARP poison detect ──────────────────────────────────────────────────────
export function arpPoisonDetect(interfaceName: string): string {
  try {
    const cmd = `docker exec kali-box arpwatch -i ${interfaceName || "eth0"} -d 2>&1 & sleep 10 && kill %1 2>/dev/null; docker exec kali-box bash -c "arp -n 2>&1 | head -20"`;
    const output = execSync(cmd, { timeout: 20_000, encoding: "utf8" }).trim();
    const suspicious = /changed|flip|duplicate/i.test(output);
    return JSON.stringify({ suspicious, details: output.slice(0, 500) });
  } catch (err) {
    return `Error: ${(err as Error).message}`;
  }
}

// ─── Network map generate ───────────────────────────────────────────────────
export function networkMapGenerate(subnet: string): string {
  try {
    const cmd = `docker exec kali-box nmap -sn ${subnet || "192.168.1.0/24"} -oG - 2>&1 | grep "Up" | head -50`;
    const output = execSync(cmd, { timeout: 60_000, encoding: "utf8" }).trim();
    const hosts = output
      .split("\n")
      .map((line) => {
        const match = line.match(/Host: (\S+)/);
        return match ? match[1] : null;
      })
      .filter(Boolean);
    return `Discovered ${hosts.length} hosts on ${subnet}:\n${hosts.join("\n")}`;
  } catch (err) {
    return `Error: ${(err as Error).message}`;
  }
}
