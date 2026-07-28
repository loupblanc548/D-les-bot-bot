/**
 * cryptoToolkit.ts — Cryptography & Steganography utilities
 * Called by Quant (the AI brain) via tool handlers in agentToolsExtended.ts
 */

import crypto from "crypto";
import { execSync } from "child_process";
import fs from "fs";
import path from "path";
import os from "os";

// ─── Hash crack (dictionary attack via Kali) ──────────────────────────────
export function hashCrackDictionary(hash: string, hashType: string, wordlist: string): string {
  try {
    const cmd = `docker exec kali-box hashcat -a 0 -m ${hashType} '${hash}' ${wordlist} --force --quiet 2>&1 || echo "hashcat not available, trying john"`;
    const output = execSync(cmd, { timeout: 60_000, encoding: "utf8" }).trim();
    return output || "No match found in wordlist";
  } catch (err) {
    return `Error: ${(err as Error).message}`;
  }
}

// ─── Hash identify advanced ────────────────────────────────────────────────
export function hashIdentifyAdvanced(hash: string): string {
  const h = hash.trim();
  const results: string[] = [];

  if (/^[a-f0-9]{32}$/i.test(h)) results.push("MD5, NTLM, MD4, LM, RAdmin v2.x, MD2");
  if (/^[a-f0-9]{40}$/i.test(h)) results.push("SHA-1, SHA-0, RIPEMD-160, HAS-160");
  if (/^[a-f0-9]{56}$/i.test(h)) results.push("SHA-224, SHA3-224");
  if (/^[a-f0-9]{64}$/i.test(h)) results.push("SHA-256, SHA3-256, BLAKE2s-256, Skein-256");
  if (/^[a-f0-9]{96}$/i.test(h)) results.push("SHA-384, SHA3-384");
  if (/^[a-f0-9]{128}$/i.test(h)) results.push("SHA-512, SHA3-512, BLAKE2b-512, Whirlpool");
  if (/^\$2[aby]\$\d{2}\$[./A-Za-z0-9]{53}$/i.test(h)) results.push("bcrypt");
  if (/^\$argon2[id]?\$/i.test(h)) results.push("Argon2 (id/i/d)");
  if (/^\$scrypt\$/i.test(h)) results.push("scrypt");
  if (/^\$6\$[./A-Za-z0-9]{1,16}\$[./A-Za-z0-9]{86}$/i.test(h))
    results.push("SHA-512 crypt (Unix)");
  if (/^\$5\$[./A-Za-z0-9]{1,16}\$[./A-Za-z0-9]{43}$/i.test(h))
    results.push("SHA-256 crypt (Unix)");
  if (/^\$1\$[./A-Za-z0-9]{1,8}\$[./A-Za-z0-9]{22}$/i.test(h)) results.push("MD5 crypt (Unix)");
  if (/^[a-f0-9]{16}$/i.test(h)) results.push("MySQL 323, DES (Oracle)");
  if (/^\*[A-F0-9]{40}$/i.test(h)) results.push("MySQL 5.x (SHA1)");
  if (/^[a-f0-9]{41}$/i.test(h)) results.push("MySQL 5.x (SHA1, no asterisk)");
  if (/^[a-f0-9]{32}:.{32}$/i.test(h)) results.push("NTLMv2 (NetNTLMv2)");
  if (/^[a-f0-9]{32}:[a-f0-9]{16}$/i.test(h)) results.push("NetNTLM");
  if (/^[a-zA-Z0-9+/]{27}=$/.test(h)) results.push("MS-CHAPv2");
  if (/^[a-f0-9]{70}$/i.test(h)) results.push("WPA-PBKDF2 (HMAC-SHA1)");

  if (results.length === 0)
    return `Unknown hash format (length=${h.length}, charset=${/^[a-f0-9]+$/i.test(h) ? "hex" : "mixed"})`;
  return `Possible types:\n${results.map((r) => `  - ${r}`).join("\n")}`;
}

// ─── Generate HMAC ──────────────────────────────────────────────────────────
export function generateHmac(message: string, key: string, algorithm: string): string {
  const alg = algorithm || "sha256";
  const validAlgs = ["sha256", "sha512", "sha384", "sha1", "md5"];
  const useAlg = validAlgs.includes(alg) ? alg : "sha256";
  const hmac = crypto.createHmac(useAlg, key);
  hmac.update(message);
  return hmac.digest("hex");
}

// ─── AES decrypt ────────────────────────────────────────────────────────────
export function aesDecrypt(encryptedData: string, key: string, iv: string, mode: string): string {
  try {
    const useMode = mode || "gcm";
    if (useMode === "gcm") {
      const decipher = crypto.createDecipheriv(
        "aes-256-gcm",
        Buffer.from(key, "hex"),
        Buffer.from(iv, "hex"),
      );
      const tag = encryptedData.slice(-32);
      const data = encryptedData.slice(0, -32);
      decipher.setAuthTag(Buffer.from(tag, "hex"));
      let decrypted = decipher.update(Buffer.from(data, "hex"));
      decrypted = Buffer.concat([decrypted, decipher.final()]);
      return decrypted.toString("utf8");
    }
    // CBC mode
    const decipher = crypto.createDecipheriv(
      "aes-256-cbc",
      Buffer.from(key, "hex"),
      Buffer.from(iv, "hex"),
    );
    let decrypted = decipher.update(Buffer.from(encryptedData, "hex"));
    decrypted = Buffer.concat([decrypted, decipher.final()]);
    return decrypted.toString("utf8");
  } catch (err) {
    return `Decryption error: ${(err as Error).message}`;
  }
}

// ─── RSA keypair generate ───────────────────────────────────────────────────
export function rsaKeypairGenerate(bits: number): { publicKey: string; privateKey: string } {
  const useBits = bits || 2048;
  const { publicKey, privateKey } = crypto.generateKeyPairSync("rsa", {
    modulusLength: useBits,
    publicKeyEncoding: { type: "spki", format: "pem" },
    privateKeyEncoding: { type: "pkcs8", format: "pem" },
  });
  return { publicKey, privateKey };
}

// ─── RSA encrypt/decrypt ────────────────────────────────────────────────────
export function rsaEncrypt(message: string, publicKeyPem: string): string {
  try {
    const encrypted = crypto.publicEncrypt(
      { key: publicKeyPem, padding: crypto.constants.RSA_PKCS1_OAEP_PADDING },
      Buffer.from(message, "utf8"),
    );
    return encrypted.toString("base64");
  } catch (err) {
    return `Encryption error: ${(err as Error).message}`;
  }
}

export function rsaDecrypt(encryptedBase64: string, privateKeyPem: string): string {
  try {
    const decrypted = crypto.privateDecrypt(
      { key: privateKeyPem, padding: crypto.constants.RSA_PKCS1_OAEP_PADDING },
      Buffer.from(encryptedBase64, "base64"),
    );
    return decrypted.toString("utf8");
  } catch (err) {
    return `Decryption error: ${(err as Error).message}`;
  }
}

// ─── PGP encrypt/decrypt (via Kali gpg) ─────────────────────────────────────
export function pgpEncrypt(message: string, recipientKey: string): string {
  try {
    const tmpFile = path.join(os.tmpdir(), `pgp_msg_${Date.now()}.txt`);
    fs.writeFileSync(tmpFile, message);
    const cmd = `docker exec kali-box bash -c "echo '${message.replace(/'/g, "'\\''")}' | gpg --encrypt --armor --recipient '${recipientKey}' 2>&1"`;
    const output = execSync(cmd, { timeout: 15_000, encoding: "utf8" }).trim();
    fs.unlinkSync(tmpFile);
    return output;
  } catch (err) {
    return `PGP encrypt error: ${(err as Error).message}`;
  }
}

export function pgpDecrypt(encryptedMessage: string): string {
  try {
    const cmd = `docker exec kali-box bash -c "echo '${encryptedMessage.replace(/'/g, "'\\''")}' | gpg --decrypt 2>&1"`;
    const output = execSync(cmd, { timeout: 15_000, encoding: "utf8" }).trim();
    return output;
  } catch (err) {
    return `PGP decrypt error: ${(err as Error).message}`;
  }
}

// ─── Steganography LSB extract ──────────────────────────────────────────────
export function stegoExtractLsb(imagePath: string): string {
  try {
    const cmd = `docker exec kali-box steghide extract -sf '${imagePath}' -p '' -f 2>&1 || docker exec kali-box zsteg '${imagePath}' 2>&1`;
    const output = execSync(cmd, { timeout: 30_000, encoding: "utf8" }).trim();
    return output || "No hidden message found";
  } catch (err) {
    return `Stego extract error: ${(err as Error).message}`;
  }
}

// ─── Steganography LSB hide ──────────────────────────────────────────────────
export function stegoHideLsb(imagePath: string, message: string, outputFile: string): string {
  try {
    const msgFile = path.join(os.tmpdir(), `stego_msg_${Date.now()}.txt`);
    fs.writeFileSync(msgFile, message);
    const cmd = `docker exec kali-box steghide embed -cf '${imagePath}' -ef '${msgFile}' -sf '${outputFile}' -p '' -f 2>&1`;
    const output = execSync(cmd, { timeout: 30_000, encoding: "utf8" }).trim();
    fs.unlinkSync(msgFile);
    return output || `Message hidden in ${outputFile}`;
  } catch (err) {
    return `Stego hide error: ${(err as Error).message}`;
  }
}

// ─── Steganalysis z-score ────────────────────────────────────────────────────
export function steganalysisZscore(imagePath: string): string {
  try {
    const cmd = `docker exec kali-box zsteg -a '${imagePath}' 2>&1 | head -50`;
    const output = execSync(cmd, { timeout: 30_000, encoding: "utf8" }).trim();
    return output || "No steganographic content detected";
  } catch (err) {
    return `Steganalysis error: ${(err as Error).message}`;
  }
}

// ─── XOR cipher ──────────────────────────────────────────────────────────────
export function xorCipher(data: string, key: string): string {
  let result = "";
  for (let i = 0; i < data.length; i++) {
    result += String.fromCharCode(data.charCodeAt(i) ^ key.charCodeAt(i % key.length));
  }
  return result;
}

// ─── Frequency analysis ──────────────────────────────────────────────────────
export function frequencyAnalysis(text: string): string {
  const freq: Record<string, number> = {};
  const cleanText = text.toLowerCase().replace(/[^a-z]/g, "");

  for (const char of cleanText) {
    freq[char] = (freq[char] || 0) + 1;
  }

  const total = cleanText.length;
  const sorted = Object.entries(freq)
    .sort((a, b) => b[1] - a[1])
    .map(([char, count]) => ({
      char,
      count,
      percentage: ((count / total) * 100).toFixed(2),
    }));

  const englishFreq: Record<string, number> = {
    e: 12.7,
    t: 9.1,
    a: 8.2,
    o: 7.5,
    i: 7.0,
    n: 6.7,
    s: 6.3,
    h: 6.1,
    r: 6.0,
    d: 4.3,
    l: 4.0,
    c: 2.8,
    u: 2.8,
    m: 2.4,
    w: 2.4,
    f: 2.2,
    g: 2.0,
    y: 2.0,
    p: 1.9,
    b: 1.5,
    v: 1.0,
    k: 0.8,
    j: 0.2,
    x: 0.2,
    q: 0.1,
    z: 0.1,
  };

  const analysis = sorted.map((s) => ({
    char: s.char,
    observed: `${s.percentage}%`,
    english: `${englishFreq[s.char] || 0}%`,
    shift: (s.char.charCodeAt(0) - "e".charCodeAt(0) + 26) % 26,
  }));

  return JSON.stringify({ totalChars: total, frequencies: analysis.slice(0, 10) }, null, 2);
}

// ─── Random token generator ──────────────────────────────────────────────────
export function randomTokenGenerator(length: number, encoding: string): string {
  const useLen = length || 32;
  const bytes = crypto.randomBytes(useLen);
  switch (encoding) {
    case "base64":
      return bytes.toString("base64");
    case "base64url":
      return bytes.toString("base64url");
    case "base32":
      return bytes.toString("base64").replace(/[+/=]/g, "").toUpperCase().slice(0, useLen);
    case "hex":
      return bytes.toString("hex");
    default:
      return bytes.toString("hex");
  }
}

// ─── Certificate parse ───────────────────────────────────────────────────────
export function certificateParse(certPem: string): string {
  try {
    const cert = new crypto.X509Certificate(certPem);
    return JSON.stringify(
      {
        subject: cert.subject,
        issuer: cert.issuer,
        validFrom: cert.validFrom,
        validTo: cert.validTo,
        serialNumber: cert.serialNumber,
        fingerprint: cert.fingerprint,
        keyUsage: cert.keyUsage,
        subjectAltName: cert.subjectAltName,
        publicKey: cert.publicKey.export({ type: "spki", format: "pem" }).slice(0, 100) + "...",
      },
      null,
      2,
    );
  } catch (err) {
    return `Certificate parse error: ${(err as Error).message}`;
  }
}
