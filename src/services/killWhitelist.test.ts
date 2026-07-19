/**
 * killWhitelist.test.ts — Unit tests for the centralized audit whitelist
 *
 * Proves that:
 *  1. Whitelisted IPs (localhost, VPS IP, CIDR ranges) are accepted
 *  2. Non-whitelisted IPs are rejected
 *  3. Encoding tricks (decimal, hex, octal, IPv6-mapped) are normalized and caught
 *  4. Hostnames are rejected (no DNS resolution trust)
 *  5. SSID whitelist works with exact match only
 *  6. Empty targets are rejected
 */

import { describe, it, expect, beforeAll } from "vitest";

// Set env vars BEFORE dynamic import (ESM hoists static imports above beforeAll)
process.env.AUDIT_ALLOWED_CIDRS = "192.168.1.0/24,10.0.0.0/8";
process.env.AUDIT_ALLOWED_SSID = "MyHomeWiFi";
process.env.MY_VPS_IP = "203.0.113.42";

// Dynamic imports to ensure env vars are set before module loads
let normalizeIp: typeof import("./killWhitelist.js").normalizeIp;
let ipInCidr: typeof import("./killWhitelist.js").ipInCidr;
let assertTargetInWhitelist: typeof import("./killWhitelist.js").assertTargetInWhitelist;
let assertSsidInWhitelist: typeof import("./killWhitelist.js").assertSsidInWhitelist;
let WhitelistViolationError: typeof import("./killWhitelist.js").WhitelistViolationError;
let getWhitelistSummary: typeof import("./killWhitelist.js").getWhitelistSummary;

beforeAll(async () => {
  const mod = await import("./killWhitelist.js");
  normalizeIp = mod.normalizeIp;
  ipInCidr = mod.ipInCidr;
  assertTargetInWhitelist = mod.assertTargetInWhitelist;
  assertSsidInWhitelist = mod.assertSsidInWhitelist;
  WhitelistViolationError = mod.WhitelistViolationError;
  getWhitelistSummary = mod.getWhitelistSummary;
});

describe("normalizeIp", () => {
  it("normalizes standard dotted-decimal IPv4", () => {
    expect(normalizeIp("192.168.1.1")).toBe("192.168.1.1");
    expect(normalizeIp("10.0.0.5")).toBe("10.0.0.5");
  });

  it("normalizes decimal integer encoding", () => {
    // 192.168.1.1 = 3232235777
    expect(normalizeIp("3232235777")).toBe("192.168.1.1");
  });

  it("normalizes hex encoding", () => {
    // 192.168.1.1 = 0xc0a80101
    expect(normalizeIp("0xc0a80101")).toBe("192.168.1.1");
  });

  it("normalizes octal encoding", () => {
    // 192 = 0300, 168 = 0250, 1 = 01, 1 = 01
    expect(normalizeIp("0300.0250.0001.0001")).toBe("192.168.1.1");
  });

  it("normalizes IPv6-mapped IPv4", () => {
    expect(normalizeIp("::ffff:192.168.1.1")).toBe("192.168.1.1");
  });

  it("returns null for invalid IPs", () => {
    expect(normalizeIp("999.999.999.999")).toBeNull();
    expect(normalizeIp("not-an-ip")).toBeNull();
    expect(normalizeIp("")).toBeNull();
  });
});

describe("ipInCidr", () => {
  it("matches IP within CIDR range", () => {
    expect(ipInCidr("192.168.1.50", "192.168.1.0/24")).toBe(true);
    expect(ipInCidr("10.0.5.100", "10.0.0.0/8")).toBe(true);
  });

  it("rejects IP outside CIDR range", () => {
    expect(ipInCidr("172.16.0.1", "192.168.1.0/24")).toBe(false);
    expect(ipInCidr("8.8.8.8", "10.0.0.0/8")).toBe(false);
  });

  it("handles single IP (no prefix)", () => {
    expect(ipInCidr("127.0.0.1", "127.0.0.1")).toBe(true);
    expect(ipInCidr("127.0.0.2", "127.0.0.1")).toBe(false);
  });

  it("handles /32 prefix", () => {
    expect(ipInCidr("192.168.1.1", "192.168.1.1/32")).toBe(true);
    expect(ipInCidr("192.168.1.2", "192.168.1.1/32")).toBe(false);
  });

  it("handles /0 (match all)", () => {
    expect(ipInCidr("8.8.8.8", "0.0.0.0/0")).toBe(true);
  });

  it("defeats encoding tricks via normalization", () => {
    // 3232235777 = 192.168.1.1, should match 192.168.1.0/24
    expect(ipInCidr("3232235777", "192.168.1.0/24")).toBe(true);
    // 0xc0a80101 = 192.168.1.1
    expect(ipInCidr("0xc0a80101", "192.168.1.0/24")).toBe(true);
  });
});

describe("assertTargetInWhitelist", () => {
  const tool = "test_tool";
  const invokedBy = "test_user_123";

  it("accepts localhost", async () => {
    await expect(assertTargetInWhitelist("127.0.0.1", tool, invokedBy)).resolves.toBeUndefined();
    await expect(assertTargetInWhitelist("localhost", tool, invokedBy)).resolves.toBeUndefined();
  });

  it("accepts IPs within configured CIDR ranges", async () => {
    await expect(assertTargetInWhitelist("192.168.1.50", tool, invokedBy)).resolves.toBeUndefined();
    await expect(assertTargetInWhitelist("10.0.0.1", tool, invokedBy)).resolves.toBeUndefined();
  });

  it("rejects IPs outside whitelist", async () => {
    await expect(assertTargetInWhitelist("8.8.8.8", tool, invokedBy)).rejects.toThrow(
      WhitelistViolationError,
    );
    await expect(assertTargetInWhitelist("172.16.0.1", tool, invokedBy)).rejects.toThrow(
      WhitelistViolationError,
    );
  });

  it("rejects encoding tricks that resolve to non-whitelisted IPs", async () => {
    // 134744072 = 8.8.8.8 (decimal encoding of Google DNS)
    await expect(assertTargetInWhitelist("134744072", tool, invokedBy)).rejects.toThrow(
      WhitelistViolationError,
    );
    // 0x08080808 = 8.8.8.8 (hex encoding)
    await expect(assertTargetInWhitelist("0x08080808", tool, invokedBy)).rejects.toThrow(
      WhitelistViolationError,
    );
  });

  it("accepts encoding tricks that resolve to whitelisted IPs", async () => {
    // 3232235777 = 192.168.1.1 (within 192.168.1.0/24)
    await expect(assertTargetInWhitelist("3232235777", tool, invokedBy)).resolves.toBeUndefined();
  });

  it("rejects hostnames (no DNS resolution trust)", async () => {
    await expect(assertTargetInWhitelist("google.com", tool, invokedBy)).rejects.toThrow(
      WhitelistViolationError,
    );
    await expect(assertTargetInWhitelist("evil.com", tool, invokedBy)).rejects.toThrow(
      WhitelistViolationError,
    );
  });

  it("rejects empty targets", async () => {
    await expect(assertTargetInWhitelist("", tool, invokedBy)).rejects.toThrow(
      WhitelistViolationError,
    );
    await expect(assertTargetInWhitelist("   ", tool, invokedBy)).rejects.toThrow(
      WhitelistViolationError,
    );
  });

  it("rejects IPv6 addresses (not in whitelist)", async () => {
    await expect(assertTargetInWhitelist("2001:db8::1", tool, invokedBy)).rejects.toThrow(
      WhitelistViolationError,
    );
  });

  it("WhitelistViolationError contains target and tool info", async () => {
    try {
      await assertTargetInWhitelist("8.8.8.8", tool, invokedBy);
      expect.fail("Should have thrown");
    } catch (err) {
      expect(err).toBeInstanceOf(WhitelistViolationError);
      const e = err as InstanceType<typeof WhitelistViolationError>;
      expect(e.target).toBe("8.8.8.8");
      expect(e.tool).toBe(tool);
      expect(e.message).toContain("not in the allowed audit whitelist");
    }
  });
});

describe("assertSsidInWhitelist", () => {
  const tool = "runWifiSecurityAudit";
  const invokedBy = "test_user_123";

  it("accepts whitelisted SSID (exact match)", async () => {
    await expect(assertSsidInWhitelist("MyHomeWiFi", tool, invokedBy)).resolves.toBeUndefined();
  });

  it("rejects non-whitelisted SSID", async () => {
    await expect(assertSsidInWhitelist("EvilTwin", tool, invokedBy)).rejects.toThrow(
      WhitelistViolationError,
    );
  });

  it("rejects empty SSID", async () => {
    await expect(assertSsidInWhitelist("", tool, invokedBy)).rejects.toThrow(
      WhitelistViolationError,
    );
  });

  it("is case-sensitive (no case tricks)", async () => {
    await expect(assertSsidInWhitelist("myhomewifi", tool, invokedBy)).rejects.toThrow(
      WhitelistViolationError,
    );
    await expect(assertSsidInWhitelist("MYHOMEWIFI", tool, invokedBy)).rejects.toThrow(
      WhitelistViolationError,
    );
  });
});

describe("getWhitelistSummary", () => {
  it("returns frozen CIDR and SSID lists", () => {
    const summary = getWhitelistSummary();
    expect(summary.cidrs).toContain("192.168.1.0/24");
    expect(summary.cidrs).toContain("127.0.0.0/8");
    expect(summary.ssids).toContain("MyHomeWiFi");
  });
});
