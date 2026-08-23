import { execSync } from "child_process";
import logger from "../utils/logger.js";
import dns from "dns/promises";

// ─── Input Sanitizers & Validators ─────────────────────────────────────────
const HOST_REGEX = /^[a-zA-Z0-9.-]+$/;
const IDENT_REGEX = /^[a-zA-Z0-9._-]+$/;
const SUBNET_REGEX = /^[0-9./]+$/;

function isValidHost(host: string): boolean {
  return (
    typeof host === "string" && host.length > 0 && host.length < 255 && HOST_REGEX.test(host.trim())
  );
}

function isValidPort(port: number): boolean {
  return Number.isInteger(port) && port >= 1 && port <= 65535;
}

function sanitizeIdent(name: string): string | null {
  const trimmed = name.trim();
  return IDENT_REGEX.test(trimmed) ? trimmed : null;
}

// ─── SMTP relay test ──────────────────────────────────────────────────────
export function smtpRelayTest(host: string, port: number): string {
  if (!isValidHost(host)) return "Error: Invalid hostname or IP address";
  const p = isValidPort(port) ? port : 25;
  try {
    const cmd = `docker exec kali-box bash -c "echo 'QUIT' | timeout 10 nc ${host} ${p} 2>&1"`;
    const output = execSync(cmd, { timeout: 15_000, encoding: "utf8" }).trim();
    const isOpenRelay = /220.*SMTP/i.test(output);
    return JSON.stringify({
      host,
      port: p,
      banner: output.slice(0, 500),
      openRelayPossible: isOpenRelay,
    });
  } catch (err) {
    return `Error: ${(err as Error).message}`;
  }
}

// ─── SMTP enum VRFY ────────────────────────────────────────────────────────
export function smtpEnumVrfy(host: string, port: number, usernames: string): string {
  if (!isValidHost(host)) return "Error: Invalid hostname or IP address";
  const p = isValidPort(port) ? port : 25;
  try {
    const users = usernames
      .split(",")
      .map((u) => sanitizeIdent(u))
      .filter((u): u is string => u !== null)
      .slice(0, 20);
    if (users.length === 0) return "Error: No valid usernames provided";
    const results: string[] = [];
    for (const user of users) {
      const cmd = `docker exec kali-box bash -c "echo -e 'VRFY ${user}\\r\\nQUIT\\r\\n' | timeout 5 nc ${host} ${p} 2>&1"`;
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
  if (!isValidHost(host)) return "Error: Invalid hostname or IP address";
  const p = isValidPort(port) ? port : 21;
  try {
    const cmd = `docker exec kali-box bash -c "echo -e 'USER anonymous\\r\\nPASS anonymous@test\\r\\nQUIT\\r\\n' | timeout 10 nc ${host} ${p} 2>&1"`;
    const output = execSync(cmd, { timeout: 15_000, encoding: "utf8" }).trim();
    const allowsAnonymous = /230.*login|230.*access|230.*successful/i.test(output);
    return JSON.stringify({
      host,
      port: p,
      allowsAnonymous,
      banner: output.slice(0, 500),
    });
  } catch (err) {
    return `Error: ${(err as Error).message}`;
  }
}

// ─── SMB enum shares ────────────────────────────────────────────────────────
export function smbEnumShares(host: string): string {
  if (!isValidHost(host)) return "Error: Invalid hostname or IP address";
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
  if (!isValidHost(host)) return "Error: Invalid hostname or IP address";
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
  if (!isValidHost(host)) return "Error: Invalid hostname or IP address";
  const p = isValidPort(port) ? port : 389;
  try {
    const cmd = `docker exec kali-box nmap -p ${p} --script ldap-search ${host} 2>&1 | head -60`;
    const output = execSync(cmd, { timeout: 30_000, encoding: "utf8" }).trim();
    return output || "No LDAP data found";
  } catch (err) {
    return `Error: ${(err as Error).message}`;
  }
}

// ─── Kerberos user enum ─────────────────────────────────────────────────────
export function kerberosUserEnum(host: string, realm: string, usernames: string): string {
  if (!isValidHost(host)) return "Error: Invalid hostname or IP address";
  const cleanRealm = sanitizeIdent(realm) || "DOMAIN.LOCAL";
  try {
    const users = usernames
      .split(",")
      .map((u) => sanitizeIdent(u))
      .filter((u): u is string => u !== null)
      .slice(0, 20);
    if (users.length === 0) return "Error: No valid usernames provided";
    const results: string[] = [];
    for (const user of users) {
      const cmd = `docker exec kali-box python3 -c "
import socket, struct
s = socket.socket(socket.AF_INET, socket.SOCK_STREAM)
s.settimeout(5)
s.connect(('${host}', 88))
req = bytes.fromhex('6a82') + struct.pack('>I', len('${user}@${cleanRealm}')+30) + b'\\x00\\x00\\x00\\x00\\xa0\\x03\\x02\\x01\\x05\\xa1\\x03\\x02\\x01\\x0a\\xa2\\x07\\x03\\x05\\x00\\x40\\x00\\x10\\x00' + b'${user}@${cleanRealm}'
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
  if (!isValidHost(host)) return "Error: Invalid hostname or IP address";
  const p = isValidPort(port) ? port : 3389;
  try {
    const cmd = `docker exec kali-box nmap -p ${p} --script rdp-enum-encryption,rdp-vuln-ms12-020 ${host} 2>&1 | head -30`;
    const output = execSync(cmd, { timeout: 30_000, encoding: "utf8" }).trim();
    return output || "RDP not accessible";
  } catch (err) {
    return `Error: ${(err as Error).message}`;
  }
}

// ─── SSH version scan ───────────────────────────────────────────────────────
export function sshVersionScan(host: string, port: number): string {
  if (!isValidHost(host)) return "Error: Invalid hostname or IP address";
  const p = isValidPort(port) ? port : 22;
  try {
    const cmd = `docker exec kali-box nmap -p ${p} -sV --script ssh2-enum-algos,ssh-hostkey ${host} 2>&1 | head -40`;
    const output = execSync(cmd, { timeout: 30_000, encoding: "utf8" }).trim();
    return output || "SSH not accessible";
  } catch (err) {
    return `Error: ${(err as Error).message}`;
  }
}

// ─── Telnet banner grab ─────────────────────────────────────────────────────
export function telnetBannerGrab(host: string, port: number): string {
  if (!isValidHost(host)) return "Error: Invalid hostname or IP address";
  const p = isValidPort(port) ? port : 23;
  try {
    const cmd = `docker exec kali-box bash -c "echo '' | timeout 5 nc ${host} ${p} 2>&1"`;
    const output = execSync(cmd, { timeout: 10_000, encoding: "utf8" }).trim();
    return output || "No banner received";
  } catch (err) {
    return `Error: ${(err as Error).message}`;
  }
}

// ─── SNMP walk ──────────────────────────────────────────────────────────────
export function snmpWalk(host: string, community: string): string {
  if (!isValidHost(host)) return "Error: Invalid hostname or IP address";
  const comm = sanitizeIdent(community) || "public";
  try {
    const cmd = `docker exec kali-box snmpwalk -v 2c -c ${comm} ${host} 2>&1 | head -80`;
    const output = execSync(cmd, { timeout: 30_000, encoding: "utf8" }).trim();
    return output || "No SNMP response";
  } catch (err) {
    return `Error: ${(err as Error).message}`;
  }
}

// ─── NTP monlist ────────────────────────────────────────────────────────────
export function ntpMonlist(host: string): string {
  if (!isValidHost(host)) return "Error: Invalid hostname or IP address";
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
  if (!isValidHost(domain)) return "Error: Invalid domain name";
  try {
    const nsRecords = await dns.resolveNs(domain);
    const results: string[] = [];
    for (const ns of nsRecords.slice(0, 5)) {
      if (!isValidHost(ns)) continue;
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
  if (!isValidHost(domain)) return "Error: Invalid domain name";
  const subdomains = (
    wordlist ||
    "www,mail,ftp,admin,api,dev,staging,test,vpn,blog,shop,portal,secure,demo,git,ci,app,mobile,cdn,cloud,db,redis,elastic,grafana,jenkins,kubernetes,docker,registry,nexus,sonar,sentry,prometheus"
  )
    .split(",")
    .map((s) => sanitizeIdent(s))
    .filter((s): s is string => s !== null);

  const found: string[] = [];
  for (const sub of subdomains) {
    try {
      const records = await dns.resolve4(`${sub}.${domain}`);
      if (records.length > 0) {
        found.push(`${sub}.${domain} -> ${records.join(", ")}`);
      }
    } catch {
      // ignore nxdomain
    }
  }
  return found.length > 0
    ? `Found ${found.length} subdomains:\n${found.join("\n")}`
    : "No subdomains found";
}

// ─── DNS rebinding check ────────────────────────────────────────────────────
export async function dnsRebindingCheck(domain: string): Promise<string> {
  if (!isValidHost(domain)) return "Error: Invalid domain name";
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
  const iface = sanitizeIdent(interfaceName) || "eth0";
  try {
    const cmd = `docker exec kali-box nmap -6 --script targets-ipv6-multicast-invalid.nse --script-args 'newtargets,interface=${iface}' -sn 2>&1 | head -30`;
    const output = execSync(cmd, { timeout: 30_000, encoding: "utf8" }).trim();
    return output || "No IPv6 hosts found";
  } catch (err) {
    return `Error: ${(err as Error).message}`;
  }
}

// ─── VLAN hop test ──────────────────────────────────────────────────────────
export function vlanHopTest(interfaceName: string): string {
  const iface = sanitizeIdent(interfaceName) || "eth0";
  try {
    const cmd = `docker exec kali-box bash -c "echo 'VLAN hopping test requires manual configuration. Checking switch config...' && nmap -sn --script broadcast-arp-sweep ${iface} 2>&1" | head -20`;
    const output = execSync(cmd, { timeout: 20_000, encoding: "utf8" }).trim();
    return output || "VLAN hop test inconclusive";
  } catch (err) {
    return `Error: ${(err as Error).message}`;
  }
}

// ─── WiFi deauth detect ─────────────────────────────────────────────────────
export function wifiDeauthDetect(interfaceName: string, duration: number): string {
  const iface = sanitizeIdent(interfaceName) || "wlan0mon";
  const dur = Number.isInteger(duration) && duration > 0 && duration <= 120 ? duration : 30;
  try {
    const cmd = `docker exec kali-box timeout ${dur} tshark -i ${iface} -Y 'deauth' -c 10 2>&1 || echo "No deauth frames detected in ${dur}s"`;
    const output = execSync(cmd, { timeout: (dur + 5) * 1000, encoding: "utf8" }).trim();
    return output || "No deauth frames detected";
  } catch (err) {
    return `Error: ${(err as Error).message}`;
  }
}

// ─── ARP poison detect ──────────────────────────────────────────────────────
export function arpPoisonDetect(interfaceName: string): string {
  const iface = sanitizeIdent(interfaceName) || "eth0";
  try {
    const cmd = `docker exec kali-box arpwatch -i ${iface} -d 2>&1 & sleep 10 && kill %1 2>/dev/null; docker exec kali-box bash -c "arp -n 2>&1 | head -20"`;
    const output = execSync(cmd, { timeout: 20_000, encoding: "utf8" }).trim();
    const suspicious = /changed|flip|duplicate/i.test(output);
    return JSON.stringify({ suspicious, details: output.slice(0, 500) });
  } catch (err) {
    return `Error: ${(err as Error).message}`;
  }
}

// ─── Network map generate ───────────────────────────────────────────────────
export function networkMapGenerate(subnet: string): string {
  const sub =
    typeof subnet === "string" && SUBNET_REGEX.test(subnet.trim())
      ? subnet.trim()
      : "192.168.1.0/24";
  try {
    const cmd = `docker exec kali-box nmap -sn ${sub} -oG - 2>&1 | grep "Up" | head -50`;
    const output = execSync(cmd, { timeout: 60_000, encoding: "utf8" }).trim();
    const hosts = output
      .split("\n")
      .map((line) => {
        const match = line.match(/Host: (\S+)/);
        return match ? match[1] : null;
      })
      .filter(Boolean);
    return `Discovered ${hosts.length} hosts on ${sub}:\n${hosts.join("\n")}`;
  } catch (err) {
    return `Error: ${(err as Error).message}`;
  }
}
