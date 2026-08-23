/**
 * toolExecutionGuard.test.ts — Tests pour le guard d'exécution des outils
 */
import { describe, it, expect, beforeEach } from "vitest";
import {
  getToolPermission,
  checkAuthorization,
  recordAuditEntry,
  getAuditLog,
  getAuditStats,
  checkIdempotency,
  recordIdempotency,
  generateIdempotencyKey,
} from "./toolExecutionGuard.js";

// Mock dependencies
vi.mock("./agentToolRouter.js", () => ({
  RESTRICTED_TOOLS: new Set(["ssh_command", "db_query", "docker_manage"]),
}));
vi.mock("./toolRiskRegistry.js", () => ({
  requiresApproval: (name: string) => ["ban_user", "kick_user", "ssh_command"].includes(name),
  getRiskLevel: (name: string) => {
    if (["ban_user", "ssh_command", "docker_manage"].includes(name)) return "high";
    if (["kick_user", "db_query"].includes(name)) return "medium";
    return "low";
  },
}));
vi.mock("../utils/logger.js", () => ({
  default: { info: vi.fn(), warn: vi.fn(), error: vi.fn(), debug: vi.fn() },
}));

import { vi } from "vitest";

describe("toolExecutionGuard", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  describe("getToolPermission", () => {
    it("should return permission for restricted tool", () => {
      const perm = getToolPermission("ssh_command");
      expect(perm.restricted).toBe(true);
      expect(perm.riskLevel).toBe("high");
      expect(perm.requiresApproval).toBe(true);
    });

    it("should return permission for low-risk tool", () => {
      const perm = getToolPermission("text_translate");
      expect(perm.restricted).toBe(false);
      expect(perm.riskLevel).toBe("low");
    });
  });

  describe("checkAuthorization", () => {
    it("should deny restricted tools in public channels", () => {
      const result = checkAuthorization({
        toolName: "ssh_command",
        userId: "123",
        guildId: "456",
        isPublicChannel: true,
      });
      expect(result.allowed).toBe(false);
      expect(result.reason).toContain("restricted");
    });

    it("should allow restricted tools in private channels with approval", () => {
      const result = checkAuthorization({
        toolName: "ssh_command",
        userId: "123",
        guildId: "456",
        isPublicChannel: false,
        hasApproval: true,
      });
      expect(result.allowed).toBe(true);
    });

    it("should deny high-risk tools without approval", () => {
      const result = checkAuthorization({
        toolName: "ban_user",
        userId: "123",
        guildId: "456",
        isPublicChannel: false,
        hasApproval: false,
      });
      expect(result.allowed).toBe(false);
      expect(result.reason).toContain("approval");
    });

    it("should allow low-risk tools without approval", () => {
      const result = checkAuthorization({
        toolName: "text_translate",
        userId: "123",
        guildId: "456",
        isPublicChannel: false,
      });
      expect(result.allowed).toBe(true);
    });
  });

  describe("audit log", () => {
    it("should record and retrieve audit entries", () => {
      recordAuditEntry({
        timestamp: Date.now(),
        toolName: "ssh_command",
        userId: "123",
        guildId: "456",
        riskLevel: "high",
        approved: true,
        dryRun: false,
        result: "success",
        durationMs: 500,
      });

      const log = getAuditLog({ toolName: "ssh_command" });
      expect(log.length).toBeGreaterThan(0);
      expect(log[0].toolName).toBe("ssh_command");
    });

    it("should return audit stats", () => {
      const stats = getAuditStats();
      expect(stats.totalExecutions).toBeGreaterThanOrEqual(0);
      expect(typeof stats.denied).toBe("number");
    });
  });

  describe("idempotency", () => {
    it("should generate consistent keys", () => {
      const key1 = generateIdempotencyKey("test_tool", "user1", { a: 1 });
      const key2 = generateIdempotencyKey("test_tool", "user1", { a: 1 });
      expect(key1).toBe(key2);
    });

    it("should detect recent idempotency", () => {
      const key = generateIdempotencyKey("test_tool", "user1", { a: 1 });
      recordIdempotency(key, "success");
      const result = checkIdempotency(key);
      expect(result.isRecent).toBe(true);
      expect(result.result).toBe("success");
    });

    it("should return not recent for unknown key", () => {
      const result = checkIdempotency("nonexistent-key");
      expect(result.isRecent).toBe(false);
      expect(result.result).toBeNull();
    });
  });
});
