/**
 * toolRiskRegistry.test.ts — Guard tests for risk classification & autonomous execution
 *
 * Proves that:
 *  1. Low-risk tools are correctly classified and can execute autonomously
 *  2. Medium/high-risk tools require approval (SOAR gate)
 *  3. A chain starting with low-risk tools that attempts a high-risk tool is blocked
 *  4. The registry is frozen — no runtime reclassification is possible
 *  5. Unclassified tools default to safe behavior (not low-risk)
 */

import { describe, it, expect } from "vitest";
import {
  TOOL_RISK_REGISTRY,
  getRiskLevel,
  isLowRisk,
  isHighRisk,
  requiresApproval,
  getRegistrySummary,
} from "./toolRiskRegistry.js";
import { isRestrictedTool } from "./agentSoarGate.js";

describe("toolRiskRegistry — classification correctness", () => {
  it("classifies known low-risk tools correctly", () => {
    expect(isLowRisk("getWeather")).toBe(true);
    expect(isLowRisk("getCryptoPrice")).toBe(true);
    expect(isLowRisk("searchWeb")).toBe(true);
    expect(isLowRisk("getJoke")).toBe(true);
    expect(isLowRisk("getNasaApod")).toBe(true);
    expect(isLowRisk("getPokemon")).toBe(true);
    expect(isLowRisk("search_wikipedia")).toBe(true);
    expect(isLowRisk("detect_language")).toBe(true);
    expect(isLowRisk("getRedditPosts")).toBe(true);
  });

  it("classifies known high-risk tools correctly", () => {
    expect(isHighRisk("ssh_command")).toBe(true);
    expect(isHighRisk("db_query")).toBe(true);
    expect(isHighRisk("docker_manage")).toBe(true);
    expect(isHighRisk("execute_code")).toBe(true);
    expect(isHighRisk("deleteMessages")).toBe(true);
    expect(isHighRisk("runKaliPortAudit")).toBe(true);
    expect(isHighRisk("broadcast_notification")).toBe(true);
  });

  it("classifies known medium-risk tools correctly", () => {
    expect(getRiskLevel("sendDM")).toBe("medium");
    expect(getRiskLevel("createInvite")).toBe("medium");
    expect(getRiskLevel("saveMemoryFact")).toBe("medium");
    expect(getRiskLevel("osint_scan")).toBe("medium");
    expect(getRiskLevel("warnUser")).toBe("medium");
    expect(getRiskLevel("pinMessage")).toBe("medium");
  });

  it("requiresApproval returns true for medium and high, false for low", () => {
    expect(requiresApproval("getWeather")).toBe(false);
    expect(requiresApproval("ssh_command")).toBe(true);
    expect(requiresApproval("sendDM")).toBe(true);
    expect(requiresApproval("db_query")).toBe(true);
  });

  it("returns undefined for unclassified tools", () => {
    expect(getRiskLevel("nonexistent_tool_xyz")).toBeUndefined();
    expect(isLowRisk("nonexistent_tool_xyz")).toBe(false);
    expect(requiresApproval("nonexistent_tool_xyz")).toBe(false);
  });
});

describe("toolRiskRegistry — SOAR gate integration", () => {
  it("low-risk tools do NOT trigger SOAR gate", () => {
    expect(isRestrictedTool("getWeather")).toBe(false);
    expect(isRestrictedTool("searchWeb")).toBe(false);
    expect(isRestrictedTool("getCryptoPrice")).toBe(false);
    expect(isRestrictedTool("getJoke")).toBe(false);
  });

  it("high-risk tools DO trigger SOAR gate", () => {
    expect(isRestrictedTool("ssh_command")).toBe(true);
    expect(isRestrictedTool("db_query")).toBe(true);
    expect(isRestrictedTool("docker_manage")).toBe(true);
    expect(isRestrictedTool("execute_code")).toBe(true);
    expect(isRestrictedTool("deleteMessages")).toBe(true);
  });

  it("medium-risk tools DO trigger SOAR gate", () => {
    expect(isRestrictedTool("sendDM")).toBe(true);
    expect(isRestrictedTool("createInvite")).toBe(true);
    expect(isRestrictedTool("saveMemoryFact")).toBe(true);
    expect(isRestrictedTool("osint_scan")).toBe(true);
  });

  it("Kali tools (all high-risk) trigger SOAR gate", () => {
    expect(isRestrictedTool("runKaliPortAudit")).toBe(true);
    expect(isRestrictedTool("runWifiSecurityAudit")).toBe(true);
    expect(isRestrictedTool("runSystemHardeningAudit")).toBe(true);
  });
});

describe("toolRiskRegistry — chain safety (low-risk → high-risk blocked)", () => {
  it("simulates a chain: getWeather (low) → searchWeb (low) → ssh_command (high) — high must be gated", () => {
    // Step 1: low-risk tool — should pass autonomously
    const step1Tool = "getWeather";
    expect(isLowRisk(step1Tool)).toBe(true);
    expect(isRestrictedTool(step1Tool)).toBe(false);

    // Step 2: another low-risk tool — should also pass
    const step2Tool = "searchWeb";
    expect(isLowRisk(step2Tool)).toBe(true);
    expect(isRestrictedTool(step2Tool)).toBe(false);

    // Step 3: high-risk tool — MUST be blocked even after low-risk chain
    const step3Tool = "ssh_command";
    expect(isLowRisk(step3Tool)).toBe(false);
    expect(isRestrictedTool(step3Tool)).toBe(true);
    expect(requiresApproval(step3Tool)).toBe(true);
  });

  it("simulates a chain: getCryptoPrice (low) → db_query (high) — high must be gated", () => {
    const step1 = "getCryptoPrice";
    const step2 = "db_query";

    expect(isLowRisk(step1)).toBe(true);
    expect(isRestrictedTool(step1)).toBe(false);

    // The high-risk tool must require approval regardless of prior low-risk context
    expect(isLowRisk(step2)).toBe(false);
    expect(isRestrictedTool(step2)).toBe(true);
  });

  it("simulates a chain: getJoke (low) → sendDM (medium) — medium must be gated", () => {
    const step1 = "getJoke";
    const step2 = "sendDM";

    expect(isLowRisk(step1)).toBe(true);
    expect(isRestrictedTool(step1)).toBe(false);

    expect(isLowRisk(step2)).toBe(false);
    expect(isRestrictedTool(step2)).toBe(true);
  });

  it("a non-admin user cannot bypass the gate by chaining low-risk tools before a high-risk one", () => {
    // The gate check is per-tool, not per-chain — each tool is evaluated independently
    const chain = ["getWeather", "searchWeb", "getCryptoPrice", "ssh_command"];

    // First three are low-risk — autonomous
    for (let i = 0; i < 3; i++) {
      expect(isLowRisk(chain[i])).toBe(true);
      expect(isRestrictedTool(chain[i])).toBe(false);
    }

    // Fourth is high-risk — MUST be gated, regardless of what came before
    expect(isLowRisk(chain[3])).toBe(false);
    expect(isRestrictedTool(chain[3])).toBe(true);
    expect(requiresApproval(chain[3])).toBe(true);
  });
});

describe("toolRiskRegistry — immutability", () => {
  it("registry is a frozen ReadonlyMap — cannot add entries at runtime", () => {
    expect(Object.isFrozen(TOOL_RISK_REGISTRY)).toBe(true);

    // Mutating methods have been removed — .set is undefined, calling it throws TypeError
    const map = TOOL_RISK_REGISTRY as unknown as { set?: (...args: unknown[]) => void };
    expect(map.set).toBeUndefined();
    expect(() => {
      (map as unknown as { set: (...args: unknown[]) => void }).set("malicious_tool", {});
    }).toThrow(TypeError);
    expect(getRiskLevel("malicious_tool")).toBeUndefined();
  });

  it("agent cannot reclassify a high-risk tool to low-risk at runtime", () => {
    expect(getRiskLevel("ssh_command")).toBe("high");

    const map = TOOL_RISK_REGISTRY as unknown as { set?: (...args: unknown[]) => void };
    expect(map.set).toBeUndefined();
    expect(() => {
      (map as unknown as { set: (...args: unknown[]) => void }).set("ssh_command", {
        level: "low",
      });
    }).toThrow(TypeError);

    expect(getRiskLevel("ssh_command")).toBe("high");
  });

  it("agent cannot reclassify a medium-risk tool to low-risk at runtime", () => {
    expect(getRiskLevel("sendDM")).toBe("medium");

    const map = TOOL_RISK_REGISTRY as unknown as { set?: (...args: unknown[]) => void };
    expect(map.set).toBeUndefined();
    expect(() => {
      (map as unknown as { set: (...args: unknown[]) => void }).set("sendDM", { level: "low" });
    }).toThrow(TypeError);

    expect(getRiskLevel("sendDM")).toBe("medium");
  });

  it("registry summary counts are consistent", () => {
    const summary = getRegistrySummary();
    expect(summary.total).toBe(summary.low + summary.medium + summary.high);
    expect(summary.low).toBeGreaterThan(50); // majority of tools are low-risk
    expect(summary.high).toBeGreaterThan(10);
    expect(summary.unclassified).toHaveLength(0);
  });
});

describe("toolRiskRegistry — OSINT is NOT low-risk (personal data criterion)", () => {
  it("OSINT tools targeting individuals are medium-risk, not low", () => {
    expect(getRiskLevel("osint_scan")).toBe("medium");
    expect(getRiskLevel("username_search")).toBe("medium");
    expect(getRiskLevel("email_reputation")).toBe("medium");
    expect(getRiskLevel("phone_lookup")).toBe("medium");
    expect(getRiskLevel("detect_disposable_email")).toBe("medium");
    expect(getRiskLevel("track_avatar_hash")).toBe("medium");
  });

  it("read-only OSINT on public data IS low-risk", () => {
    expect(getRiskLevel("reddit_get_posts")).toBe("low");
    expect(getRiskLevel("reddit_search")).toBe("low");
    expect(getRiskLevel("domain_age")).toBe("low");
    expect(getRiskLevel("ip_geolocation")).toBe("low");
  });
});
