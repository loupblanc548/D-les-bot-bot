import { describe, it, expect } from "vitest";
import { checkUrlForSsrf, safeFetch } from "./ssrfGuard.js";

describe("ssrfGuard", () => {
  describe("checkUrlForSsrf", () => {
    it("blocks http://localhost", async () => {
      const result = await checkUrlForSsrf("http://localhost:9090/metrics", "test");
      expect(result.allowed).toBe(false);
    });

    it("blocks http://127.0.0.1", async () => {
      const result = await checkUrlForSsrf("http://127.0.0.1:3000/admin", "test");
      expect(result.allowed).toBe(false);
    });

    it("blocks http://169.254.169.254 (AWS metadata)", async () => {
      const result = await checkUrlForSsrf("http://169.254.169.254/latest/meta-data/", "test");
      expect(result.allowed).toBe(false);
    });

    it("blocks http://10.0.0.1 (private range)", async () => {
      const result = await checkUrlForSsrf("http://10.0.0.1:8080", "test");
      expect(result.allowed).toBe(false);
    });

    it("blocks http://192.168.1.1 (private range)", async () => {
      const result = await checkUrlForSsrf("http://192.168.1.1", "test");
      expect(result.allowed).toBe(false);
    });

    it("blocks http://172.16.0.1 (private range)", async () => {
      const result = await checkUrlForSsrf("http://172.16.0.1", "test");
      expect(result.allowed).toBe(false);
    });

    it("blocks http://0.0.0.0", async () => {
      const result = await checkUrlForSsrf("http://0.0.0.0:80", "test");
      expect(result.allowed).toBe(false);
    });

    it("blocks IPv6 loopback ::1", async () => {
      const result = await checkUrlForSsrf("http://[::1]:8080", "test");
      expect(result.allowed).toBe(false);
    });

    it("blocks IPv6 loopback in uncompressed form", async () => {
      const result = await checkUrlForSsrf("http://[0:0:0:0:0:0:0:1]:8080", "test");
      expect(result.allowed).toBe(false);
    });

    it("blocks IPv6 unspecified ::", async () => {
      const result = await checkUrlForSsrf("http://[::]:8080", "test");
      expect(result.allowed).toBe(false);
    });

    it("blocks IPv4-mapped IPv6 loopback ::ffff:127.0.0.1", async () => {
      const result = await checkUrlForSsrf("http://[::ffff:127.0.0.1]:8080", "test");
      expect(result.allowed).toBe(false);
    });

    it("blocks IPv4-mapped IPv6 AWS metadata ::ffff:169.254.169.254", async () => {
      const result = await checkUrlForSsrf("http://[::ffff:169.254.169.254]/latest/", "test");
      expect(result.allowed).toBe(false);
    });

    it("blocks IPv6 unique-local fc00::/7", async () => {
      const result = await checkUrlForSsrf("http://[fd00::1]:8080", "test");
      expect(result.allowed).toBe(false);
    });

    it("blocks IPv6 link-local fe80::/10", async () => {
      const result = await checkUrlForSsrf("http://[fe80::1]:8080", "test");
      expect(result.allowed).toBe(false);
    });

    it("allows public IPv6", async () => {
      const result = await checkUrlForSsrf("https://[2606:4700:4700::1111]", "test");
      expect(result.allowed).toBe(true);
    });

    it("blocks decimal IP notation (2130706433 = 127.0.0.1)", async () => {
      const result = await checkUrlForSsrf("http://2130706433:8080", "test");
      expect(result.allowed).toBe(false);
    });

    it("allows public URLs", async () => {
      const result = await checkUrlForSsrf("https://example.com", "test");
      expect(result.allowed).toBe(true);
    });

    it("allows public IPs", async () => {
      const result = await checkUrlForSsrf("https://1.1.1.1", "test");
      expect(result.allowed).toBe(true);
    });

    it("rejects invalid URLs", async () => {
      const result = await checkUrlForSsrf("not-a-url", "test");
      expect(result.allowed).toBe(false);
    });
  });

  describe("safeFetch", () => {
    it("throws on localhost URL", async () => {
      await expect(safeFetch("http://localhost:9090/metrics", {}, "test")).rejects.toThrow(/SSRF/);
    });

    it("throws on 127.0.0.1 URL", async () => {
      await expect(safeFetch("http://127.0.0.1:3000", {}, "test")).rejects.toThrow(/SSRF/);
    });

    it("throws on AWS metadata URL", async () => {
      await expect(
        safeFetch("http://169.254.169.254/latest/meta-data/", {}, "test"),
      ).rejects.toThrow(/SSRF/);
    });
  });
});
