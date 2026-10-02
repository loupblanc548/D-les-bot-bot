import { describe, expect, it } from "vitest";
import { evaluateMathExpression, integralCalculator, limitCalculator } from "./mathToolkit.js";

describe("evaluateMathExpression", () => {
  it("handles arithmetic, precedence and powers", () => {
    expect(evaluateMathExpression("2+3*4", "x", 0)).toBe(14);
    expect(evaluateMathExpression("(2+3)*4", "x", 0)).toBe(20);
    expect(evaluateMathExpression("2^3^2", "x", 0)).toBe(512);
    expect(evaluateMathExpression("x**2", "x", 3)).toBe(9);
    expect(evaluateMathExpression("-x^2", "x", 3)).toBe(-9);
    expect(evaluateMathExpression("1.5e2 / 3", "x", 0)).toBe(50);
  });

  it("supports whitelisted functions and constants", () => {
    expect(evaluateMathExpression("sin(0)+cos(0)", "x", 0)).toBe(1);
    expect(evaluateMathExpression("sqrt(x)", "x", 16)).toBe(4);
    expect(evaluateMathExpression("2*pi", "x", 0)).toBeCloseTo(2 * Math.PI);
    expect(evaluateMathExpression("ln(e)", "x", 0)).toBe(1);
  });

  it("only substitutes the whole variable name", () => {
    expect(evaluateMathExpression("exp(t)", "t", 0)).toBe(1);
    expect(() => evaluateMathExpression("xx", "x", 2)).toThrow();
  });

  it("rejects code injection attempts", () => {
    for (const payload of [
      "process.exit(1)",
      "import('child_process')",
      "require('fs')",
      "(()=>1)()",
      "constructor.constructor('return process')()",
      "x;1",
      "`id`",
    ]) {
      expect(() => evaluateMathExpression(payload, "x", 1)).toThrow();
    }
  });
});

describe("integral and limit calculators", () => {
  it("integrates without eval", () => {
    const result = JSON.parse(integralCalculator("x^2", "x", 0, 3));
    expect(result.result).toBeCloseTo(9, 4);
  });

  it("returns 0 contribution for injected expressions instead of executing them", () => {
    const result = JSON.parse(integralCalculator("process.exit(1)", "x", 0, 1));
    expect(result.result).toBe(0);
  });

  it("computes a limit", () => {
    expect(JSON.parse(limitCalculator("sin(x)/x", "x", 0)).limit).toBe(1);
  });
});
