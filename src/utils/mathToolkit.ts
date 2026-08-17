/**
 * mathToolkit.ts — Advanced mathematics utilities
 * Called by Quant (the AI brain) via tool handlers in agentToolsExtended.ts
 */

// ─── Matrix operations ──────────────────────────────────────────────────────
export function matrixOperations(matrixA: string, matrixB: string, operation: string): string {
  try {
    const parse = (s: string) => s.split(";").map((row) => row.split(",").map(Number));
    const A = parse(matrixA);
    const B = matrixB ? parse(matrixB) : null;

    if (operation === "add" && B) {
      const result = A.map((row, i) => row.map((val, j) => val + B[i][j]));
      return JSON.stringify(result);
    }
    if (operation === "multiply" && B) {
      const result = A.map((row, i) =>
        B[0].map((_, j) => row.reduce((sum, _, k) => sum + A[i][k] * B[k][j], 0)),
      );
      return JSON.stringify(result);
    }
    if (operation === "transpose") {
      const result = A[0].map((_, j) => A.map((row) => row[j]));
      return JSON.stringify(result);
    }
    if (operation === "determinant") {
      const n = A.length;
      if (n === 2) return String(A[0][0] * A[1][1] - A[0][1] * A[1][0]);
      if (n === 3) {
        return String(
          A[0][0] * (A[1][1] * A[2][2] - A[1][2] * A[2][1]) -
            A[0][1] * (A[1][0] * A[2][2] - A[1][2] * A[2][0]) +
            A[0][2] * (A[1][0] * A[2][1] - A[1][1] * A[2][0]),
        );
      }
      return "Determinant only supported for 2x2 and 3x3";
    }
    return `Unknown operation: ${operation}`;
  } catch (err) {
    return `Error: ${(err as Error).message}`;
  }
}

// ─── Vector calculus ────────────────────────────────────────────────────────
export function vectorCalculus(vectorA: string, vectorB: string, operation: string): string {
  try {
    const a = vectorA.split(",").map(Number);
    const b = vectorB.split(",").map(Number);

    if (operation === "dot") {
      return String(a.reduce((sum, val, i) => sum + val * b[i], 0));
    }
    if (operation === "cross" && a.length === 3) {
      return JSON.stringify([
        a[1] * b[2] - a[2] * b[1],
        a[2] * b[0] - a[0] * b[2],
        a[0] * b[1] - a[1] * b[0],
      ]);
    }
    if (operation === "magnitude") {
      return String(Math.sqrt(a.reduce((sum, v) => sum + v * v, 0)).toFixed(4));
    }
    if (operation === "normalize") {
      const mag = Math.sqrt(a.reduce((sum, v) => sum + v * v, 0));
      return JSON.stringify(a.map((v) => parseFloat((v / mag).toFixed(4))));
    }
    if (operation === "angle") {
      const dot = a.reduce((sum, val, i) => sum + val * b[i], 0);
      const magA = Math.sqrt(a.reduce((s, v) => s + v * v, 0));
      const magB = Math.sqrt(b.reduce((s, v) => s + v * v, 0));
      return `${((Math.acos(dot / (magA * magB)) * 180) / Math.PI).toFixed(2)} degrees`;
    }
    return `Unknown operation: ${operation}`;
  } catch (err) {
    return `Error: ${(err as Error).message}`;
  }
}

// ─── Derivative calculator ──────────────────────────────────────────────────
export function derivativeCalculator(expression: string, variable: string): string {
  // Simple symbolic derivative for basic functions
  const expr = expression.trim();
  const v = variable || "x";
  const rules: { pattern: string; result: string }[] = [
    { pattern: `${v}^([0-9]+)`, result: "power" },
    { pattern: `sin\\(${v}\\)`, result: `cos(${v})` },
    { pattern: `cos\\(${v}\\)`, result: `-sin(${v})` },
    { pattern: `tan\\(${v}\\)`, result: `1/cos^2(${v})` },
    { pattern: `exp\\(${v}\\)`, result: `exp(${v})` },
    { pattern: `ln\\(${v}\\)`, result: `1/${v}` },
    { pattern: `log\\(${v}\\)`, result: `1/(${v}*ln(10))` },
  ];

  // Power rule
  const powerMatch = expr.match(new RegExp(`^${v}\\^([0-9]+)$`));
  if (powerMatch) {
    const n = parseInt(powerMatch[1]);
    return n === 1 ? "1" : `${n}*${v}^${n - 1}`;
  }

  // Check other rules
  for (const rule of rules) {
    if (new RegExp(`^${rule.pattern}$`).test(expr)) {
      if (rule.result === "power") continue;
      return `d/d${v} [${expr}] = ${rule.result}`;
    }
  }

  // Constant
  if (!expr.includes(v)) return "0 (constant)";

  // Sum rule: try to split on +
  if (expr.includes("+")) {
    const parts = expr.split("+").map((p) => p.trim());
    const derived = parts.map((p) => derivativeCalculator(p, v));
    return `d/d${v} [${expr}] = ${derived.join(" + ")}`;
  }

  return `Cannot derive '${expr}' symbolically. Use numerical differentiation with specific values.`;
}

// ─── Integral calculator ────────────────────────────────────────────────────
export function integralCalculator(
  expression: string,
  variable: string,
  lower: number,
  upper: number,
): string {
  try {
    const v = variable || "x";
    // Numerical integration using Simpson's rule
    const lo = lower ?? 0;
    const hi = upper ?? 1;
    const n = 1000;
    const h = (hi - lo) / n;
    const f = (x: number) => {
      try {
        const expr = expression.replace(new RegExp(v, "g"), String(x));
        return eval(expr);
      } catch {
        return 0;
      }
    };

    let sum = f(lo) + f(hi);
    for (let i = 1; i < n; i += 2) sum += 4 * f(lo + i * h);
    for (let i = 2; i < n; i += 2) sum += 2 * f(lo + i * h);
    const result = (h / 3) * sum;

    return JSON.stringify({
      expression,
      variable: v,
      lower: lo,
      upper: hi,
      result: parseFloat(result.toFixed(6)),
      method: "Simpson's rule (n=1000)",
    });
  } catch (err) {
    return `Error: ${(err as Error).message}`;
  }
}

// ─── Limit calculator ───────────────────────────────────────────────────────
export function limitCalculator(expression: string, variable: string, point: number): string {
  try {
    const v = variable || "x";
    const p = point ?? 0;
    const epsilon = 1e-7;
    const f = (x: number) => {
      try {
        const expr = expression.replace(new RegExp(v, "g"), String(x));
        return eval(expr);
      } catch {
        return NaN;
      }
    };

    const leftLimit = f(p - epsilon);
    const rightLimit = f(p + epsilon);

    if (Math.abs(leftLimit - rightLimit) < 1e-4) {
      return JSON.stringify({
        expression,
        variable: v,
        point: p,
        limit: parseFloat(rightLimit.toFixed(6)),
        twoSided: true,
      });
    }
    return JSON.stringify({
      expression,
      variable: v,
      point: p,
      leftLimit: parseFloat(leftLimit.toFixed(6)),
      rightLimit: parseFloat(rightLimit.toFixed(6)),
      twoSided: false,
      note: "Limit does not exist (left ≠ right)",
    });
  } catch (err) {
    return `Error: ${(err as Error).message}`;
  }
}

// ─── Series sum calculator ──────────────────────────────────────────────────
export function seriesSumCalculator(seriesType: string, params: string): string {
  try {
    const p = params.split(",").map(Number);
    if (seriesType === "arithmetic") {
      const [a1, d, n] = p;
      const sum = (n * (2 * a1 + (n - 1) * d)) / 2;
      return `Arithmetic series: S = ${sum}`;
    }
    if (seriesType === "geometric") {
      const [a1, r, n] = p;
      const sum = r === 1 ? a1 * n : (a1 * (1 - r ** n)) / (1 - r);
      return `Geometric series: S = ${sum}`;
    }
    return `Unknown series type: ${seriesType}`;
  } catch (err) {
    return `Error: ${(err as Error).message}`;
  }
}

// ─── Prime factorization ────────────────────────────────────────────────────
export function primeFactorization(n: number): string {
  try {
    const factors: number[] = [];
    let num = n;
    for (let i = 2; i * i <= num; i++) {
      while (num % i === 0) {
        factors.push(i);
        num /= i;
      }
    }
    if (num > 1) factors.push(num);
    return `${n} = ${factors.join(" × ")}`;
  } catch (err) {
    return `Error: ${(err as Error).message}`;
  }
}

// ─── GCD/LCM calculator ─────────────────────────────────────────────────────
export function gcdLcmCalculator(numbers: string, operation: string): string {
  try {
    const nums = numbers.split(",").map(Number);
    const gcd = (a: number, b: number): number => (b === 0 ? a : gcd(b, a % b));
    const lcm = (a: number, b: number): number => (a * b) / gcd(a, b);

    if (operation === "gcd") {
      return String(nums.reduce(gcd));
    } else {
      return String(nums.reduce(lcm));
    }
  } catch (err) {
    return `Error: ${(err as Error).message}`;
  }
}

// ─── Modular arithmetic ─────────────────────────────────────────────────────
export function modularArithmetic(
  base: number,
  exponent: number,
  modulus: number,
  operation: string,
): string {
  if (operation === "powermod") {
    let result = 1n;
    let b = BigInt(base) % BigInt(modulus);
    let e = BigInt(exponent);
    const m = BigInt(modulus);
    while (e > 0n) {
      if (e % 2n === 1n) result = (result * b) % m;
      e = e / 2n;
      b = (b * b) % m;
    }
    return `${base}^${exponent} mod ${modulus} = ${result}`;
  }
  if (operation === "inverse") {
    const extendedGcd = (a: number, b: number): [number, number, number] => {
      if (b === 0) return [a, 1, 0];
      const [g, x, y] = extendedGcd(b, a % b);
      return [g, y, x - Math.floor(a / b) * y];
    };
    const [g, x] = extendedGcd(base, modulus);
    if (g !== 1) return `Inverse doesn't exist (gcd=${g})`;
    return `${base}^(-1) mod ${modulus} = ${((x % modulus) + modulus) % modulus}`;
  }
  return `Unknown operation: ${operation}`;
}

// ─── Probability distribution ───────────────────────────────────────────────
export function probabilityDistribution(distribution: string, params: string, x: number): string {
  try {
    const p = params.split(",").map(Number);
    if (distribution === "binomial") {
      const [n, prob] = p;
      const factorial = (n: number): number => (n <= 1 ? 1 : n * factorial(n - 1));
      const comb = factorial(n) / (factorial(x) * factorial(n - x));
      const pmf = comb * prob ** x * (1 - prob) ** (n - x);
      return `P(X=${x}) = ${pmf.toFixed(6)}`;
    }
    if (distribution === "normal") {
      const [mean, stdDev] = p;
      const pdf =
        (1 / (stdDev * Math.sqrt(2 * Math.PI))) * Math.exp(-((x - mean) ** 2) / (2 * stdDev ** 2));
      return `f(${x}) = ${pdf.toFixed(6)}`;
    }
    if (distribution === "poisson") {
      const [lambda] = p;
      const factorial = (n: number): number => (n <= 1 ? 1 : n * factorial(n - 1));
      const pmf = (Math.exp(-lambda) * lambda ** x) / factorial(x);
      return `P(X=${x}) = ${pmf.toFixed(6)}`;
    }
    return `Unknown distribution: ${distribution}`;
  } catch (err) {
    return `Error: ${(err as Error).message}`;
  }
}

// ─── Bayes theorem ──────────────────────────────────────────────────────────
export function bayesTheorem(prior: number, likelihood: number, evidence: number): string {
  try {
    const posterior = (likelihood * prior) / evidence;
    return JSON.stringify({
      prior,
      likelihood,
      evidence,
      posterior: parseFloat(posterior.toFixed(6)),
    });
  } catch (err) {
    return `Error: ${(err as Error).message}`;
  }
}

// ─── Trigonometry solver ────────────────────────────────────────────────────
export function trigonometrySolver(operation: string, angle: number, unit: string): string {
  try {
    const useUnit = unit || "radians";
    const radians = useUnit === "degrees" ? (angle * Math.PI) / 180 : angle;
    const results: Record<string, number> = {
      sin: Math.sin(radians),
      cos: Math.cos(radians),
      tan: Math.tan(radians),
      asin: Math.asin(angle),
      acos: Math.acos(angle),
      atan: Math.atan(angle),
      sinh: Math.sinh(radians),
      cosh: Math.cosh(radians),
      tanh: Math.tanh(radians),
    };
    const result = results[operation];
    if (result === undefined) return `Unknown operation: ${operation}`;
    return `${operation}(${angle} ${useUnit}) = ${result.toFixed(6)}`;
  } catch (err) {
    return `Error: ${(err as Error).message}`;
  }
}

// ─── Complex number operations ──────────────────────────────────────────────
export function complexNumberOps(
  aReal: number,
  aImag: number,
  bReal: number,
  bImag: number,
  operation: string,
): string {
  try {
    const results: Record<string, { real: number; imag: number }> = {
      add: { real: aReal + bReal, imag: aImag + bImag },
      subtract: { real: aReal - bReal, imag: aImag - bImag },
      multiply: { real: aReal * bReal - aImag * bImag, imag: aReal * bImag + aImag * bReal },
      conjugate: { real: aReal, imag: -aImag },
    };
    const r = results[operation];
    if (!r) return `Unknown operation: ${operation}`;
    const mod = Math.sqrt(r.real ** 2 + r.imag ** 2);
    const arg = Math.atan2(r.imag, r.real);
    return JSON.stringify({
      result: `${r.real} + ${r.imag}i`,
      module: parseFloat(mod.toFixed(4)),
      argument: `${parseFloat(((arg * 180) / Math.PI).toFixed(2))}°`,
    });
  } catch (err) {
    return `Error: ${(err as Error).message}`;
  }
}

// ─── Polynomial solver ──────────────────────────────────────────────────────
export function polynomialSolver(coefficients: string): string {
  try {
    const coeffs = coefficients.split(",").map(Number);
    const n = coeffs.length - 1;

    if (n === 2) {
      const [a, b, c] = coeffs;
      const disc = b * b - 4 * a * c;
      if (disc < 0) {
        const real = -b / (2 * a);
        const imag = Math.sqrt(-disc) / (2 * a);
        return `Roots: ${real.toFixed(4)} ± ${imag.toFixed(4)}i`;
      }
      const x1 = (-b + Math.sqrt(disc)) / (2 * a);
      const x2 = (-b - Math.sqrt(disc)) / (2 * a);
      return `Roots: x1 = ${x1.toFixed(6)}, x2 = ${x2.toFixed(6)}`;
    }
    if (n === 1) {
      return `Root: x = ${-coeffs[1] / coeffs[0]}`;
    }
    return `Polynomial solver supports degree 1 and 2 only (got degree ${n})`;
  } catch (err) {
    return `Error: ${(err as Error).message}`;
  }
}

// ─── Number base convert advanced ───────────────────────────────────────────
export function numberBaseConvertAdvanced(value: string, fromBase: number, toBase: number): string {
  try {
    const decimal = parseInt(value, fromBase);
    return `${value} (base ${fromBase}) = ${decimal.toString(toBase).toUpperCase()} (base ${toBase}) = ${decimal} (decimal)`;
  } catch (err) {
    return `Error: ${(err as Error).message}`;
  }
}
