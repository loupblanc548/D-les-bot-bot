import { describe, expect, it } from "vitest";
import { inspectHostCertificate, sslWatchHosts } from "./sslInspect.js";

describe("sslInspect", () => {
  it("rejects junk hosts without opening a socket", async () => {
    const info = await inspectHostCertificate("not a host");
    expect(info.error).toMatch(/invalide/i);
    expect(info.daysUntilExpiry).toBeNull();
  });

  it("parses SSL_WATCH_HOSTS", () => {
    const prev = process.env.SSL_WATCH_HOSTS;
    process.env.SSL_WATCH_HOSTS = "example.com, discord.com";
    expect(sslWatchHosts()).toEqual(["example.com", "discord.com"]);
    if (prev === undefined) delete process.env.SSL_WATCH_HOSTS;
    else process.env.SSL_WATCH_HOSTS = prev;
  });
});
