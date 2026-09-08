import { describe, expect, it } from "vitest";
import { formatShellWhitelist, isCommandAllowed } from "./agentToolsExternal.js";

describe("isCommandAllowed", () => {
  it("allows exact whitelist commands", () => {
    expect(isCommandAllowed("uptime").allowed).toBe(true);
    expect(isCommandAllowed("pm2 list").allowed).toBe(true);
    expect(isCommandAllowed("df -h").allowed).toBe(true);
    expect(isCommandAllowed("hostname").allowed).toBe(true);
  });

  it("rejects injection and unknown binaries", () => {
    expect(isCommandAllowed("uptime; rm -rf /").allowed).toBe(false);
    expect(isCommandAllowed("cat /etc/passwd").allowed).toBe(false);
    expect(isCommandAllowed("bash -c id").allowed).toBe(false);
    expect(isCommandAllowed("cmd /c dir").allowed).toBe(false);
  });

  it("lists allowed commands", () => {
    expect(formatShellWhitelist()).toContain("uptime");
    expect(formatShellWhitelist()).toContain("pm2 list");
  });
});
