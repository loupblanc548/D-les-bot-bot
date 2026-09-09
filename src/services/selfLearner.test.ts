import { describe, expect, it } from "vitest";
import { listUnlearnedSubjects, subjectHash } from "./selfLearner.js";

describe("selfLearner queue", () => {
  it("returns the last remaining subject instead of resetting the hash set", () => {
    const topics = [{ category: "tech", subjects: ["alpha", "beta", "gamma"] }];
    const learned = new Set([subjectHash("alpha"), subjectHash("beta")]);
    const rest = listUnlearnedSubjects(topics, learned);
    expect(rest).toEqual([{ category: "tech", subject: "gamma" }]);
  });

  it("returns empty when every predefined subject is hashed (no wipe)", () => {
    const topics = [{ category: "tech", subjects: ["only-one"] }];
    const learned = new Set([subjectHash("only-one")]);
    expect(listUnlearnedSubjects(topics, learned)).toEqual([]);
  });

  it("dedupes the same subject listed in two categories", () => {
    const topics = [
      { category: "a", subjects: ["Docker"] },
      { category: "b", subjects: ["docker"] },
    ];
    const rest = listUnlearnedSubjects(topics, new Set());
    expect(rest).toHaveLength(1);
  });
});
