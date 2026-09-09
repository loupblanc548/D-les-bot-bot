import { describe, expect, it } from "vitest";
import { collectBotHealthIssues, shouldAlertMemory } from "./botHealthCheck.js";
import { MEMORY_CONFIG } from "../utils/memoryConfig.js";

describe("botHealthCheck alerts", () => {
  it("does not alert when memory is OK or SURVEILLANCE", () => {
    expect(shouldAlertMemory("OK")).toBe(false);
    expect(shouldAlertMemory("SURVEILLANCE")).toBe(false);
    expect(
      collectBotHealthIssues({
        heapMB: 532,
        rssMB: Math.max(0, MEMORY_CONFIG.LEVELS.SURVEILLANCE - 1),
        ping: 102,
      }),
    ).toEqual([]);
    expect(
      collectBotHealthIssues({
        heapMB: 800,
        rssMB: MEMORY_CONFIG.LEVELS.SURVEILLANCE,
        ping: 80,
      }),
    ).toEqual([]);
  });

  it("alerts only from WARNING memory or high latency", () => {
    expect(shouldAlertMemory("WARNING")).toBe(true);
    expect(shouldAlertMemory("CRITICAL")).toBe(true);

    const warning = collectBotHealthIssues({
      heapMB: 2000,
      rssMB: MEMORY_CONFIG.LEVELS.WARNING,
      ping: 50,
    });
    expect(warning).toHaveLength(1);
    expect(warning[0]).toContain("WARNING");
    expect(warning[0]).not.toMatch(/\bniveau: OK\b/);

    const latency = collectBotHealthIssues({ heapMB: 200, rssMB: 200, ping: 501 });
    expect(latency.some((line) => line.includes("Latence"))).toBe(true);
  });
});
