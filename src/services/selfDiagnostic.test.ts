import { beforeEach, describe, expect, it, vi } from "vitest";
import {
  buildDiagnosticReport,
  closeWindow,
  extractLocation,
  extractModule,
  getWindowProblems,
  healthIssues,
  installDiagnosticCapture,
  normalizeMessage,
  recordProblem,
  resetDiagnosticState,
  type HealthChecks,
} from "./selfDiagnostic.js";

const healthy: HealthChecks = {
  rssMB: 400,
  heapMB: 200,
  memoryLevel: "OK",
  eventLoopP99Ms: 30,
  discordReady: true,
  discordPingMs: 80,
  dbLatencyMs: 40,
  dbError: null,
  uptimeSec: 7200,
};

function reportText(embeds: { toJSON(): any }[]): string {
  return JSON.stringify(embeds.map((e) => e.toJSON()));
}

beforeEach(() => resetDiagnosticState());

describe("normalizeMessage", () => {
  it("groups messages that only differ by ids, numbers and quoted values", () => {
    const a = normalizeMessage('[Feeds] timeout after 5032ms on 1497977006510440700 "abc"');
    const b = normalizeMessage("[Feeds] timeout after 812ms on 1133720050331832340 'xyz'");
    expect(a).toBe(b);
  });

  it("strips urls and hashes", () => {
    expect(normalizeMessage("GET https://x.y/z?a=1 failed 8e726e2f")).toBe(
      "GET <url> failed <hash>",
    );
  });
});

describe("extractModule / extractLocation", () => {
  it("reads the [Module] tag, even after an emoji", () => {
    expect(extractModule("[Feeds] boom")).toBe("Feeds");
    expect(extractModule("❌ [Wishlist] boom")).toBe("Wishlist");
    expect(extractModule("no tag", "Fortnite")).toBe("Fortnite");
  });

  it("returns the first bot source frame, skipping the logger", () => {
    const stack = [
      "Error: x",
      "    at proxy (/opt/discord-bot/dist/utils/logger.js:12:3)",
      "    at send (/opt/discord-bot/dist/services/feeds.js:345:11)",
      "    at node:internal/process/task_queues:95:5",
    ].join("\n");
    expect(extractLocation(stack)).toBe("dist/services/feeds.js:345");
    expect(extractLocation("Error\n    at D:\\bot\\src\\cron\\x.ts:9:1")).toBe("src/cron/x.ts:9");
  });
});

describe("recordProblem / capture", () => {
  it("counts repeated problems once with a window counter", () => {
    recordProblem("error", ["[Feeds] timeout after 100ms"]);
    recordProblem("error", ["[Feeds] timeout after 250ms"]);
    recordProblem("warn", ["[Feeds] slow"]);
    const problems = getWindowProblems();
    expect(problems).toHaveLength(2);
    expect(problems.find((p) => p.level === "error")?.windowCount).toBe(2);
  });

  it("keeps the location from an Error argument", () => {
    const err = new Error("db down");
    err.stack = "Error: db down\n    at q (/app/dist/services/monitor.js:451:2)";
    recordProblem("error", ["[Monitor] query failed", err]);
    expect(getWindowProblems()[0].location).toBe("dist/services/monitor.js:451");
    expect(getWindowProblems()[0].sample).toContain("db down");
  });

  it("closeWindow resets counts and marks problems as already reported", () => {
    recordProblem("error", ["[X] boom"]);
    closeWindow();
    expect(getWindowProblems()).toHaveLength(0);
    recordProblem("error", ["[X] boom"]);
    expect(getWindowProblems()[0].reported).toBe(true);
  });

  it("wraps a logger without changing what it forwards, and only once", () => {
    const error = vi.fn();
    const warn = vi.fn();
    const fake = { error, warn } as any;
    installDiagnosticCapture(fake);
    installDiagnosticCapture(fake);
    fake.error("[A] one", { k: 1 });
    fake.warn("[A] two");
    expect(error).toHaveBeenCalledWith("[A] one", { k: 1 });
    expect(warn).toHaveBeenCalledWith("[A] two");
    expect(getWindowProblems()).toHaveLength(2);
  });

  it("never throws on odd logger arguments", () => {
    expect(() => recordProblem("error", [undefined])).not.toThrow();
    expect(() =>
      recordProblem("error", [
        {
          toString: () => {
            throw new Error("x");
          },
        },
      ]),
    ).not.toThrow();
  });
});

describe("health + report", () => {
  it("flags critical health issues", () => {
    expect(healthIssues(healthy).status).toBe("ok");
    expect(healthIssues({ ...healthy, dbError: "timeout 5s", dbLatencyMs: null }).status).toBe(
      "critical",
    );
    expect(healthIssues({ ...healthy, eventLoopP99Ms: 300 }).status).toBe("warn");
    expect(healthIssues({ ...healthy, discordReady: false }).status).toBe("critical");
  });

  it("reports ok when nothing happened", () => {
    const { status, embeds } = buildDiagnosticReport(healthy, [], Date.now() - 6 * 3600_000);
    expect(status).toBe("ok");
    expect(embeds).toHaveLength(2);
    expect(reportText(embeds)).toContain("Aucun problème notable");
  });

  it("lists code errors with their location and marks new ones", () => {
    const err = new Error("x");
    err.stack = "Error: x\n    at f (/app/dist/services/feeds.js:345:1)";
    recordProblem("error", ["[Feeds] send failed", err]);
    recordProblem("warn", ["[Steam] rate limited"]);
    const { status, embeds } = buildDiagnosticReport(healthy, getWindowProblems(), Date.now());
    const text = reportText(embeds);
    expect(status).toBe("warn");
    expect(text).toContain("dist/services/feeds.js:345");
    expect(text).toContain("🆕");
    expect(text).toContain("Avertissements fréquents");
    expect(text).not.toMatch(/\|\s*-+\s*\|/);
  });

  it("goes critical on process crashes", () => {
    recordProblem("error", ["[PROCESS] Unhandled Rejection at: x, reason: y"]);
    const { status } = buildDiagnosticReport(healthy, getWindowProblems(), Date.now());
    expect(status).toBe("critical");
  });
});
