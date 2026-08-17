/**
 * forensicsToolkit.ts — Forensique, cryptographie & analyse de fichiers
 *
 * Outils:
 * - Base64 encode/decode
 * - URL encode/decode
 * - AES-256-GCM encrypt/decrypt
 * - File hash (MD5/SHA1/SHA256)
 * - File metadata extractor
 * - Steganography detector (LSB)
 * - PII scanner (emails, phones, SSN, IBAN, credit cards)
 * - IOC parser (IPs, hashes, domains, URLs)
 * - Entropy analyzer (Shannon entropy)
 * - Hex dump generator
 * - String extractor (printable strings from binary)
 * - PE header parser (Windows executables)
 * - ELF header parser (Linux executables)
 * - APK info extractor
 * - Dependency vulnerability pattern checker
 */

import crypto from "crypto";
import fs from "fs/promises";
import path from "path";

// ─── 1. Base64 ───────────────────────────────────────────────────────────────

export function base64Encode(input: string): string {
  return Buffer.from(input, "utf8").toString("base64");
}

export function base64Decode(input: string): string {
  try {
    return Buffer.from(input, "base64").toString("utf8");
  } catch {
    return "❌ Base64 invalide";
  }
}

// ─── 2. URL Encode/Decode ────────────────────────────────────────────────────

export function urlEncode(input: string): string {
  return encodeURIComponent(input);
}

export function urlDecode(input: string): string {
  try {
    return decodeURIComponent(input);
  } catch {
    return "❌ URL encodage invalide";
  }
}

// ─── 3. AES-256-GCM ──────────────────────────────────────────────────────────

export interface AesResult {
  success: boolean;
  output: string;
  iv?: string;
  tag?: string;
  error?: string;
}

export function aesEncrypt(plaintext: string, password: string): AesResult {
  try {
    const salt = crypto.randomBytes(16);
    const key = crypto.scryptSync(password, salt, 32);
    const iv = crypto.randomBytes(12);
    const cipher = crypto.createCipheriv("aes-256-gcm", key, iv);
    const encrypted = Buffer.concat([cipher.update(plaintext, "utf8"), cipher.final()]);
    const tag = cipher.getAuthTag();
    return {
      success: true,
      output: encrypted.toString("hex"),
      iv: iv.toString("hex"),
      tag: tag.toString("hex"),
    };
  } catch (err) {
    return { success: false, output: "", error: err instanceof Error ? err.message : String(err) };
  }
}

export function aesDecrypt(
  ciphertextHex: string,
  password: string,
  ivHex: string,
  tagHex: string,
): AesResult {
  try {
    const salt = Buffer.from(ivHex.slice(0, 32), "hex");
    const key = crypto.scryptSync(password, salt, 32);
    const iv = Buffer.from(ivHex, "hex");
    const tag = Buffer.from(tagHex, "hex");
    const decipher = crypto.createDecipheriv("aes-256-gcm", key, iv);
    decipher.setAuthTag(tag);
    const decrypted = Buffer.concat([
      decipher.update(Buffer.from(ciphertextHex, "hex")),
      decipher.final(),
    ]);
    return { success: true, output: decrypted.toString("utf8") };
  } catch (err) {
    return { success: false, output: "", error: err instanceof Error ? err.message : String(err) };
  }
}

// ─── 4. File Hash ────────────────────────────────────────────────────────────

export interface FileHashResult {
  file: string;
  md5: string;
  sha1: string;
  sha256: string;
  size: number;
  success: boolean;
  error?: string;
}

export async function hashFile(filePath: string): Promise<FileHashResult> {
  try {
    const data = await fs.readFile(filePath);
    return {
      file: path.basename(filePath),
      md5: crypto.createHash("md5").update(data).digest("hex"),
      sha1: crypto.createHash("sha1").update(data).digest("hex"),
      sha256: crypto.createHash("sha256").update(data).digest("hex"),
      size: data.length,
      success: true,
    };
  } catch (err) {
    return {
      file: filePath,
      md5: "",
      sha1: "",
      sha256: "",
      size: 0,
      success: false,
      error: err instanceof Error ? err.message : String(err),
    };
  }
}

// ─── 5. File Metadata ────────────────────────────────────────────────────────

export interface FileMetaResult {
  file: string;
  size: number;
  extension: string;
  mimeType: string;
  created: string;
  modified: string;
  success: boolean;
  error?: string;
}

const MIME_MAP: Record<string, string> = {
  ".exe": "application/x-executable",
  ".elf": "application/x-elf",
  ".apk": "application/vnd.android.package-archive",
  ".zip": "application/zip",
  ".tar": "application/x-tar",
  ".gz": "application/gzip",
  ".pdf": "application/pdf",
  ".js": "text/javascript",
  ".ts": "text/typescript",
  ".py": "text/x-python",
  ".json": "application/json",
  ".xml": "application/xml",
  ".html": "text/html",
  ".css": "text/css",
  ".png": "image/png",
  ".jpg": "image/jpeg",
  ".gif": "image/gif",
  ".svg": "image/svg+xml",
  ".mp4": "video/mp4",
  ".mp3": "audio/mpeg",
};

export async function getFileMetadata(filePath: string): Promise<FileMetaResult> {
  try {
    const stat = await fs.stat(filePath);
    const ext = path.extname(filePath).toLowerCase();
    return {
      file: path.basename(filePath),
      size: stat.size,
      extension: ext,
      mimeType: MIME_MAP[ext] || "application/octet-stream",
      created: stat.birthtime.toISOString(),
      modified: stat.mtime.toISOString(),
      success: true,
    };
  } catch (err) {
    return {
      file: filePath,
      size: 0,
      extension: "",
      mimeType: "",
      created: "",
      modified: "",
      success: false,
      error: err instanceof Error ? err.message : String(err),
    };
  }
}

// ─── 6. PII Scanner ──────────────────────────────────────────────────────────

export interface PiiResult {
  input: string;
  findings: { type: string; value: string; count: number }[];
  totalFound: number;
  success: boolean;
}

const PII_PATTERNS: { type: string; regex: RegExp }[] = [
  { type: "Email", regex: /[\w.+-]+@[\w.-]+\.\w{2,}/g },
  { type: "Phone (FR)", regex: /(?:\+33|0)[1-9](?:[\s.-]\d{2}){4}/g },
  { type: "Phone (US)", regex: /\+1\d{10}|\(\d{3}\)\s?\d{3}-\d{4}/g },
  { type: "Credit Card", regex: /\b(?:\d[ -]*?){13,16}\b/g },
  { type: "SSN (US)", regex: /\b\d{3}-\d{2}-\d{4}\b/g },
  { type: "IBAN", regex: /\b[A-Z]{2}\d{2}[A-Z0-9]{10,30}\b/g },
  { type: "IPv4", regex: /\b\d{1,3}\.\d{1,3}\.\d{1,3}\.\d{1,3}\b/g },
  { type: "IPv6", regex: /\b[0-9a-fA-F:]{2,39}\b/g },
  { type: "API Key (AWS)", regex: /AKIA[0-9A-Z]{16}/g },
  { type: "API Key (Google)", regex: /AIza[0-9A-Za-z_-]{35}/g },
  { type: "JWT", regex: /eyJ[A-Za-z0-9_-]+\.eyJ[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+/g },
  { type: "Private Key", regex: /-----BEGIN[A-Z\s]+PRIVATE KEY-----/g },
];

export function scanPii(input: string): PiiResult {
  const findings: { type: string; value: string; count: number }[] = [];

  for (const { type, regex } of PII_PATTERNS) {
    const matches = input.match(regex);
    if (matches && matches.length > 0) {
      const unique = [...new Set(matches)];
      for (const val of unique) {
        findings.push({
          type,
          value: val.slice(0, 50),
          count: matches.filter((m) => m === val).length,
        });
      }
    }
  }

  return { input: input.slice(0, 50), findings, totalFound: findings.length, success: true };
}

// ─── 7. IOC Parser ───────────────────────────────────────────────────────────

export interface IocResult {
  input: string;
  iocs: { type: string; value: string }[];
  count: number;
  success: boolean;
}

export function parseIocs(input: string): IocResult {
  const iocs: { type: string; value: string }[] = [];

  const ipv4Matches = input.matchAll(/\b(\d{1,3}\.\d{1,3}\.\d{1,3}\.\d{1,3})\b/g);
  for (const m of ipv4Matches) iocs.push({ type: "IPv4", value: m[1] });

  const hashMatches = input.matchAll(/\b([a-f0-9]{32}|[a-f0-9]{40}|[a-f0-9]{64})\b/gi);
  for (const m of hashMatches) {
    const h = m[1].toLowerCase();
    const type = h.length === 32 ? "MD5" : h.length === 40 ? "SHA1" : "SHA256";
    iocs.push({ type, value: h });
  }

  const domainMatches = input.matchAll(
    /\b([a-z0-9](?:[a-z0-9-]*[a-z0-9])?\.[a-z]{2,}(?:\.[a-z]{2,})?)\b/gi,
  );
  for (const m of domainMatches) iocs.push({ type: "Domain", value: m[1].toLowerCase() });

  const urlMatches = input.matchAll(/https?:\/\/[^\s<>"']+/gi);
  for (const m of urlMatches) iocs.push({ type: "URL", value: m[0].slice(0, 100) });

  const emailMatches = input.matchAll(/[\w.+-]+@[\w.-]+\.\w{2,}/g);
  for (const m of emailMatches) iocs.push({ type: "Email", value: m[0] });

  return { input: input.slice(0, 50), iocs: iocs.slice(0, 30), count: iocs.length, success: true };
}

// ─── 8. Entropy Analyzer ─────────────────────────────────────────────────────

export interface EntropyResult {
  input: string;
  entropy: number;
  rating: string;
  charsetSize: number;
  success: boolean;
}

export function analyzeEntropy(input: string): EntropyResult {
  if (!input) return { input: "", entropy: 0, rating: "N/A", charsetSize: 0, success: false };

  const freq = new Map<string, number>();
  for (const char of input) {
    freq.set(char, (freq.get(char) || 0) + 1);
  }

  let entropy = 0;
  for (const count of freq.values()) {
    const p = count / input.length;
    entropy -= p * Math.log2(p);
  }

  const charsetSize = freq.size;
  let rating = "Très faible";
  if (entropy > 4) rating = "Faible";
  if (entropy > 5) rating = "Moyenne";
  if (entropy > 6) rating = "Forte";
  if (entropy > 7) rating = "Très forte (potentiel chiffré/compressé)";

  return {
    input: input.slice(0, 50),
    entropy: Math.round(entropy * 100) / 100,
    rating,
    charsetSize,
    success: true,
  };
}

// ─── 9. Hex Dump ─────────────────────────────────────────────────────────────

export interface HexDumpResult {
  input: string;
  dump: string;
  lines: number;
  success: boolean;
}

export function hexDump(input: string, bytesPerLine: number = 16): HexDumpResult {
  const buf = Buffer.from(input, "utf8");
  const lines: string[] = [];

  for (let offset = 0; offset < buf.length; offset += bytesPerLine) {
    const slice = buf.subarray(offset, offset + bytesPerLine);
    const hexPart = Array.from(slice)
      .map((b) => b.toString(16).padStart(2, "0"))
      .join(" ");
    const asciiPart = Array.from(slice)
      .map((b) => (b >= 32 && b <= 126 ? String.fromCharCode(b) : "."))
      .join("");
    lines.push(
      `${offset.toString(16).padStart(8, "0")}  ${hexPart.padEnd(bytesPerLine * 3)}  ${asciiPart}`,
    );
  }

  return {
    input: input.slice(0, 30),
    dump: lines.slice(0, 50).join("\n"),
    lines: lines.length,
    success: true,
  };
}

// ─── 10. String Extractor ────────────────────────────────────────────────────

export interface StringExtractResult {
  input: string;
  strings: string[];
  count: number;
  success: boolean;
}

export function extractStrings(input: string, minLength: number = 4): StringExtractResult {
  const buf = Buffer.from(input, "utf8");
  const strings: string[] = [];
  let current = "";

  for (const byte of buf) {
    if (byte >= 32 && byte <= 126) {
      current += String.fromCharCode(byte);
    } else {
      if (current.length >= minLength) strings.push(current);
      current = "";
    }
  }
  if (current.length >= minLength) strings.push(current);

  return {
    input: input.slice(0, 30),
    strings: strings.slice(0, 50),
    count: strings.length,
    success: true,
  };
}

// ─── 11. PE Header Parser ────────────────────────────────────────────────────

export interface PeHeaderResult {
  machine: string;
  sections: number;
  timestamp: string;
  characteristics: string[];
  subsystem: string;
  success: boolean;
  error?: string;
}

export async function parsePeHeader(filePath: string): Promise<PeHeaderResult> {
  try {
    const data = await fs.readFile(filePath);
    if (data.length < 64 || data[0] !== 0x4d || data[1] !== 0x5a) {
      return {
        machine: "",
        sections: 0,
        timestamp: "",
        characteristics: [],
        subsystem: "",
        success: false,
        error: "Not a PE file (no MZ header)",
      };
    }

    const peOffset = data.readUInt32LE(0x3c);
    if (data[peOffset] !== 0x50 || data[peOffset + 1] !== 0x45) {
      return {
        machine: "",
        sections: 0,
        timestamp: "",
        characteristics: [],
        subsystem: "",
        success: false,
        error: "Invalid PE signature",
      };
    }

    const machine = data.readUInt16LE(peOffset + 4);
    const numSections = data.readUInt16LE(peOffset + 6);
    const timestamp = data.readUInt32LE(peOffset + 8);
    const characteristics = data.readUInt16LE(peOffset + 22);

    const machineTypes: Record<number, string> = {
      0x14c: "x86 (32-bit)",
      0x8664: "x64 (64-bit)",
      0xaa64: "ARM64",
      0x1c0: "ARM (32-bit)",
    };

    const charList: string[] = [];
    if (characteristics & 0x0002) charList.push("Executable");
    if (characteristics & 0x0020) charList.push("Large address aware");
    if (characteristics & 0x0100) charList.push("32-bit");
    if (characteristics & 0x2000) charList.push("DLL");

    return {
      machine: machineTypes[machine] || `Unknown (0x${machine.toString(16)})`,
      sections: numSections,
      timestamp: new Date(timestamp * 1000).toISOString(),
      characteristics: charList,
      subsystem: "Windows",
      success: true,
    };
  } catch (err) {
    return {
      machine: "",
      sections: 0,
      timestamp: "",
      characteristics: [],
      subsystem: "",
      success: false,
      error: err instanceof Error ? err.message : String(err),
    };
  }
}

// ─── 12. ELF Header Parser ───────────────────────────────────────────────────

export interface ElfHeaderResult {
  class: string;
  endian: string;
  machine: string;
  type: string;
  entry: string;
  sections: number;
  success: boolean;
  error?: string;
}

export async function parseElfHeader(filePath: string): Promise<ElfHeaderResult> {
  try {
    const data = await fs.readFile(filePath);
    if (
      data.length < 64 ||
      data[0] !== 0x7f ||
      data[1] !== 0x45 ||
      data[2] !== 0x4c ||
      data[3] !== 0x46
    ) {
      return {
        class: "",
        endian: "",
        machine: "",
        type: "",
        entry: "",
        sections: 0,
        success: false,
        error: "Not an ELF file",
      };
    }

    const is64 = data[4] === 2;
    const isLE = data[5] === 1;
    const type = isLE ? data.readUInt16LE(16) : data.readUInt16BE(16);
    const machine = isLE ? data.readUInt16LE(18) : data.readUInt16BE(18);

    const types: Record<number, string> = {
      1: "Relocatable",
      2: "Executable",
      3: "Shared object",
      4: "Core dump",
    };

    const machines: Record<number, string> = {
      0x03: "x86 (32-bit)",
      0x3e: "x86-64 (64-bit)",
      0x28: "ARM (32-bit)",
      0xb7: "AArch64 (ARM64)",
      0x183: "RISC-V",
    };

    const entry = is64
      ? isLE
        ? data.readBigUInt64LE(24)
        : data.readBigUInt64BE(24)
      : isLE
        ? data.readUInt32LE(24)
        : data.readUInt32BE(24);

    const sectionCount = is64
      ? isLE
        ? data.readUInt16LE(60)
        : data.readUInt16BE(60)
      : isLE
        ? data.readUInt16LE(48)
        : data.readUInt16BE(48);

    return {
      class: is64 ? "ELF64" : "ELF32",
      endian: isLE ? "Little-endian" : "Big-endian",
      machine: machines[machine] || `Unknown (0x${machine.toString(16)})`,
      type: types[type] || `Unknown (0x${type.toString(16)})`,
      entry: `0x${entry.toString(16)}`,
      sections: sectionCount,
      success: true,
    };
  } catch (err) {
    return {
      class: "",
      endian: "",
      machine: "",
      type: "",
      entry: "",
      sections: 0,
      success: false,
      error: err instanceof Error ? err.message : String(err),
    };
  }
}

// ─── 13. APK Info ────────────────────────────────────────────────────────────

export interface ApkInfoResult {
  file: string;
  size: number;
  packageName: string | null;
  version: string | null;
  minSdk: string | null;
  permissions: string[];
  success: boolean;
  error?: string;
}

export async function getApkInfo(filePath: string): Promise<ApkInfoResult> {
  try {
    const stat = await fs.stat(filePath);
    const data = await fs.readFile(filePath);

    // Search for package name pattern in binary
    const pkgMatch = data.toString("latin1").match(/Landroid\/(\w+\/)*\w+;/);
    const verMatch = data.toString("latin1").match(/versionName=([\x20-\x7E]+)/);
    const sdkMatch = data.toString("latin1").match(/minSdkVersion=(\d+)/);

    // Extract permissions
    const permMatches = data.toString("latin1").matchAll(/android\.permission\.\w+/g);
    const permissions = [...new Set(Array.from(permMatches).map((m) => m[0]))].slice(0, 20);

    return {
      file: path.basename(filePath),
      size: stat.size,
      packageName: pkgMatch ? pkgMatch[0].replace(/L|;/g, "").replace(/\//g, ".") : null,
      version: verMatch ? verMatch[1] : null,
      minSdk: sdkMatch ? `API ${sdkMatch[1]}` : null,
      permissions,
      success: true,
    };
  } catch (err) {
    return {
      file: filePath,
      size: 0,
      packageName: null,
      version: null,
      minSdk: null,
      permissions: [],
      success: false,
      error: err instanceof Error ? err.message : String(err),
    };
  }
}

// ─── 14. Dependency Vulnerability Patterns ───────────────────────────────────

export interface DepVulnResult {
  file: string;
  vulnerabilities: { package: string; version: string; severity: string; pattern: string }[];
  count: number;
  success: boolean;
}

const VULN_PATTERNS: { pattern: string; severity: string; regex: RegExp }[] = [
  {
    pattern: "Known vulnerable lodash <4.17.21",
    severity: "high",
    regex: /"lodash":\s*"[~^]?(\d+\.\d+\.\d+)"/,
  },
  {
    pattern: "Known vulnerable axios <0.21.1",
    severity: "medium",
    regex: /"axios":\s*"[~^]?0\.\d+\.\d+"/,
  },
  {
    pattern: "Known vulnerable minimist <1.2.6",
    severity: "high",
    regex: /"minimist":\s*"[~^]?0\.\d+|1\.[01]\.\d+"/,
  },
  {
    pattern: "Known vulnerable handlebars <4.7.7",
    severity: "high",
    regex: /"handlebars":\s*"[~^]?[0-3]\.\d+\.\d+|4\.[0-6]\.\d+"/,
  },
  {
    pattern: "Known vulnerable ws <7.4.6",
    severity: "medium",
    regex: /"ws":\s*"[~^]?[0-6]\.\d+\.\d+"/,
  },
  {
    pattern: "Known vulnerable node-forge <1.3.0",
    severity: "high",
    regex: /"node-forge":\s*"[~^]?0\.\d+\.\d+|1\.[0-2]\.\d+"/,
  },
  { pattern: "Eval in dependency", severity: "medium", regex: /"eval"/ },
  { pattern: "Shell script in dependency", severity: "low", regex: /"shelljs"/ },
];

export async function checkDependencyVulns(filePath: string): Promise<DepVulnResult> {
  try {
    const content = await fs.readFile(filePath, "utf8");
    const vulnerabilities: {
      package: string;
      version: string;
      severity: string;
      pattern: string;
    }[] = [];

    for (const { pattern, severity, regex } of VULN_PATTERNS) {
      const match = content.match(regex);
      if (match) {
        vulnerabilities.push({
          package: match[0].split(":")[0].replace(/["']/g, ""),
          version: match[1] || "unknown",
          severity,
          pattern,
        });
      }
    }

    return {
      file: path.basename(filePath),
      vulnerabilities,
      count: vulnerabilities.length,
      success: true,
    };
  } catch (_err) {
    return {
      file: filePath,
      vulnerabilities: [],
      count: 0,
      success: false,
    };
  }
}

// ─── 15. Steganography Detector (LSB) ────────────────────────────────────────

export interface StegoResult {
  file: string;
  suspicious: boolean;
  reason: string;
  lsbVariance: number;
  success: boolean;
  error?: string;
}

export async function detectSteganography(filePath: string): Promise<StegoResult> {
  try {
    const data = await fs.readFile(filePath);
    if (data.length < 54 || (data[0] !== 0x42 && data[0] !== 0x89)) {
      return {
        file: path.basename(filePath),
        suspicious: false,
        reason: "Not a BMP or PNG file (steganography LSB check skipped)",
        lsbVariance: 0,
        success: true,
      };
    }

    // Check LSB variance in pixel data (simplified)
    const pixelStart = data[0] === 0x42 ? 54 : 8 + (data.readUInt32BE(8) || 0) + 13;
    const samples: number[] = [];
    for (let i = pixelStart; i < Math.min(data.length, pixelStart + 1000); i++) {
      samples.push(data[i] & 1);
    }

    const ones = samples.filter((b) => b === 1).length;
    const zeros = samples.length - ones;
    const ratio = samples.length > 0 ? Math.abs(ones - zeros) / samples.length : 0;

    // If LSB is very evenly distributed (close to 50/50), it might contain hidden data
    const suspicious = ratio < 0.05 && samples.length > 100;

    return {
      file: path.basename(filePath),
      suspicious,
      reason: suspicious
        ? "LSB distribution is suspiciously uniform — possible hidden data"
        : "LSB distribution appears normal",
      lsbVariance: Math.round(ratio * 1000) / 1000,
      success: true,
    };
  } catch (err) {
    return {
      file: filePath,
      suspicious: false,
      reason: "",
      lsbVariance: 0,
      success: false,
      error: err instanceof Error ? err.message : String(err),
    };
  }
}
