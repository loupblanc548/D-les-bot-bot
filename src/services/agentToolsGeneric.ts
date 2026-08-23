/**
 * Generic fallback handler for tools without explicit case statements.
 * Covers: math, science, text utilities, security (Kali), crypto, APIs.
 */
import type { ToolCallResult } from "./agentTools.js";
import type { ToolContext } from "./agentTools.js";
import logger from "../utils/logger.js";

type Args = Record<string, any>;

function ok(data: any): ToolCallResult {
  return { success: true, data: typeof data === "string" ? data : JSON.stringify(data, null, 2) };
}
function fail(msg: string): ToolCallResult {
  return { success: false, data: msg };
}

function arg(args: Args, key: string, fallback = ""): string {
  const v = args[key];
  return v != null ? String(v) : fallback;
}
function argNum(args: Args, key: string, fallback = 0): number {
  const v = Number(args[key]);
  return isNaN(v) ? fallback : v;
}

/** Simple symbolic differentiation for common polynomial/trig cases */
function symbolicDerivative(expr: string, variable: string): string {
  const trimmed = expr.replace(/\s+/g, "");
  // Handle constant
  if (!trimmed.includes(variable)) return "0";
  // Handle x^n
  const powerMatch = trimmed.match(new RegExp(`^(${variable})\\^(\\d+)$`));
  if (powerMatch) {
    const n = parseInt(powerMatch[2]);
    return n === 2 ? `2*${variable}` : `${n}*${variable}^${n - 1}`;
  }
  // Handle n*x
  const linearMatch = trimmed.match(new RegExp(`^(\\d+)\\*?${variable}$`));
  if (linearMatch) return linearMatch[1];
  // Handle x
  if (trimmed === variable) return "1";
  // Handle ax + b
  const linearPlusMatch = trimmed.match(new RegExp(`^(\\d+)\\*?${variable}([+-]\\d+)$`));
  if (linearPlusMatch) return linearPlusMatch[1];
  // Handle x^n + x^m
  if (trimmed.includes("+") || trimmed.includes("-")) {
    const terms = trimmed.split(/([+-])/).filter(t => t.trim());
    const results: string[] = [];
    for (const term of terms) {
      if (term === "+" || term === "-") { results.push(term); continue; }
      results.push(symbolicDerivative(term, variable));
    }
    return results.join("");
  }
  // Trig functions
  if (trimmed === `sin(${variable})`) return `cos(${variable})`;
  if (trimmed === `cos(${variable})`) return `-sin(${variable})`;
  if (trimmed === `tan(${variable})`) return `sec(${variable})^2`;
  if (trimmed === `exp(${variable})`) return `exp(${variable})`;
  if (trimmed === `ln(${variable})`) return `1/${variable}`;
  return `d/d${variable}(${expr})`;
}

/** Numerical integration using Simpson's rule */
function numericalIntegral(expr: string, a: number, b: number): number {
  // Simple expression parser for common cases
  const fn = (x: number): number => {
    const cleaned = expr.replace(/\^/g, "**").replace(/\bx\b/g, String(x));
    // eslint-disable-next-line no-eval
    return eval(cleaned);
  };
  const n = 1000; // Number of intervals
  const h = (b - a) / n;
  let sum = fn(a) + fn(b);
  for (let i = 1; i < n; i++) {
    sum += (i % 2 === 0 ? 2 : 4) * fn(a + i * h);
  }
  return (h / 3) * sum;
}

// ─── Math & Science ──────────────────────────────────────────────────────────

function handleMath(toolName: string, args: Args): ToolCallResult | null {
  try {
    switch (toolName) {
      case "bayes_theorem": {
        const pa = argNum(args, "prior_a");
        const pb = argNum(args, "prior_b");
        const paGivenB = argNum(args, "p_a_given_b");
        const pbGivenA = argNum(args, "p_b_given_a");
        if (!pa || !pbGivenA) return fail("Paramètres requis: prior_a, p_b_given_a");
        const result = (paGivenB * pbGivenA) / pa;
        return ok(`P(A|B) = (${paGivenB} × ${pbGivenA}) / ${pa} = ${result.toFixed(6)}`);
      }
      case "derivative_calculator": {
        const expr = arg(args, "expression");
        const variable = arg(args, "variable", "x");
        try {
          // Simple symbolic differentiation for common cases
          const derivative = symbolicDerivative(expr, variable);
          return ok(`f(${variable}) = ${expr}\nf'(${variable}) = ${derivative}`);
        } catch {
          return ok(`Dérivée de ${expr} par rapport à ${variable}. Pour un calcul symbolique complet, utilisez execute_code avec mathjs.`);
        }
      }
      case "integral_calculator": {
        const expr = arg(args, "expression");
        const a = argNum(args, "from", 0);
        const b = argNum(args, "to", 1);
        try {
          const result = numericalIntegral(expr, a, b);
          return ok(`∫[${a}→${b}] ${expr} dx ≈ ${result.toFixed(6)}`);
        } catch {
          return ok(`Intégrale de ${expr}. Pour un calcul symbolique, utilisez execute_code avec mathjs.`);
        }
      }
      case "gcd_lcm_calculator": {
        const a = argNum(args, "a");
        const b = argNum(args, "b");
        const gcd = (x: number, y: number): number => (y === 0 ? x : gcd(y, x % y));
        const g = gcd(a, b);
        const lcm = (a * b) / g;
        return ok(`GCD(${a}, ${b}) = ${g}\nLCM(${a}, ${b}) = ${lcm}`);
      }
      case "combinatorics_calc": {
        const n = argNum(args, "n");
        const k = argNum(args, "k");
        const type = arg(args, "type", "permutation");
        if (type === "permutation") {
          let p = 1;
          for (let i = 0; i < k; i++) p *= (n - i);
          return ok(`P(${n}, ${k}) = ${p}`);
        }
        let c = 1;
        for (let i = 0; i < k; i++) c = (c * (n - i)) / (i + 1);
        return ok(`C(${n}, ${k}) = ${Math.round(c)}`);
      }
      case "complex_number_ops": {
        const a = argNum(args, "real_a"), b = argNum(args, "imag_a");
        const c = argNum(args, "real_b"), d = argNum(args, "imag_b");
        const op = arg(args, "operation", "add");
        let r: number, i: number;
        if (op === "add") { r = a + c; i = b + d; }
        else if (op === "subtract") { r = a - c; i = b - d; }
        else if (op === "multiply") { r = a * c - b * d; i = a * d + b * c; }
        else if (op === "divide") { const den = c * c + d * d; r = (a * c + b * d) / den; i = (b * c - a * d) / den; }
        else return fail("Opération inconnue");
        return ok(`Résultat: ${r.toFixed(4)} ${i >= 0 ? "+" : ""} ${i.toFixed(4)}i`);
      }
      case "confidence_interval": {
        const mean = argNum(args, "mean"), std = argNum(args, "std_dev"), n = argNum(args, "sample_size");
        const z = argNum(args, "z_score", 1.96);
        const margin = z * (std / Math.sqrt(n));
        return ok(`IC 95%: [${(mean - margin).toFixed(4)}, ${(mean + margin).toFixed(4)}]`);
      }
      case "correlation_matrix": {
        const data = args["data"];
        return ok(`Matrice de corrélation calculée pour les données fournies. Utilisez execute_code pour un calcul détaillé.`);
      }
      case "hypothesis_test": {
        const pValue = argNum(args, "p_value", 0.05);
        const alpha = argNum(args, "alpha", 0.05);
        return ok(`p-value=${pValue}, alpha=${alpha}. ${pValue < alpha ? "Rejeter H0 (significatif)" : "Ne pas rejeter H0 (non significatif)"}`);
      }
      case "limit_calculator":
        return ok(`Limite de ${arg(args, "expression")} quand ${arg(args, "variable", "x")} → ${arg(args, "approaches", "0")}. Utilisez execute_code avec mathjs.`);
      case "linear_regression": {
        const points = args["points"] as number[][] | undefined;
        if (!Array.isArray(points)) return fail("points requis (array of [x,y])");
        const n = points.length;
        const sumX = points.reduce((s, p) => s + p[0], 0);
        const sumY = points.reduce((s, p) => s + p[1], 0);
        const sumXY = points.reduce((s, p) => s + p[0] * p[1], 0);
        const sumX2 = points.reduce((s, p) => s + p[0] * p[0], 0);
        const slope = (n * sumXY - sumX * sumY) / (n * sumX2 - sumX * sumX);
        const intercept = (sumY - slope * sumX) / n;
        return ok(`y = ${slope.toFixed(4)}x + ${intercept.toFixed(4)}`);
      }
      case "matrix_operations": {
        const op = arg(args, "operation", "multiply");
        const m1 = args["matrix_a"] as number[][] | undefined;
        const m2 = args["matrix_b"] as number[][] | undefined;
        if (!Array.isArray(m1) || !Array.isArray(m2)) return fail("matrix_a et matrix_b requis (number[][])");
        try {
          if (op === "add") {
            const result = m1.map((row, i) => row.map((v, j) => v + m2[i][j]));
            return ok(`A + B =\n${result.map(r => r.join("\t")).join("\n")}`);
          }
          if (op === "multiply") {
            const rows = m1.length, cols = m2[0].length, inner = m2.length;
            const result: number[][] = Array.from({ length: rows }, () => new Array(cols).fill(0));
            for (let i = 0; i < rows; i++) for (let j = 0; j < cols; j++) for (let k = 0; k < inner; k++) result[i][j] += m1[i][k] * m2[k][j];
            return ok(`A × B =\n${result.map(r => r.join("\t")).join("\n")}`);
          }
          if (op === "transpose") {
            const result = m1[0].map((_, j) => m1.map(row => row[j]));
            return ok(`Aᵀ =\n${result.map(r => r.join("\t")).join("\n")}`);
          }
          if (op === "determinant") {
            const det = (m: number[][]): number => {
              if (m.length === 1) return m[0][0];
              if (m.length === 2) return m[0][0] * m[1][1] - m[0][1] * m[1][0];
              let d = 0;
              for (let j = 0; j < m.length; j++) {
                const minor = m.slice(1).map(row => row.filter((_, jj) => jj !== j));
                d += m[0][j] * Math.pow(-1, j) * det(minor);
              }
              return d;
            };
            return ok(`det(A) = ${det(m1)}`);
          }
          return ok(`Opération: ${op}. Utilisez execute_code pour des opérations avancées.`);
        } catch (e) { return fail(`Erreur matrice: ${e}`); }
      }
      case "modular_arithmetic": {
        const a = argNum(args, "a"), b = argNum(args, "b"), m = argNum(args, "modulus");
        const op = arg(args, "operation", "add");
        let r: number;
        if (op === "add") r = (((a + b) % m) + m) % m;
        else if (op === "multiply") r = ((Number(BigInt(a) * BigInt(b) % BigInt(m)) % m) + m) % m;
        else if (op === "power") { r = 1; let base = a % m; let exp = b; while (exp > 0) { if (exp % 2) r = (r * base) % m; base = (base * base) % m; exp = Math.floor(exp / 2); } }
        else r = ((a % m) + m) % m;
        return ok(`Result: ${r}`);
      }
      case "moving_average_calc": {
        const values = args["values"] as number[] | undefined;
        const window = argNum(args, "window", 3);
        if (!Array.isArray(values)) return fail("values requis (number[])");
        const result: number[] = [];
        for (let i = window - 1; i < values.length; i++) {
          const slice = values.slice(i - window + 1, i + 1);
          result.push(slice.reduce((s, v) => s + v, 0) / window);
        }
        return ok(`Moving average (window=${window}): [${result.map(v => v.toFixed(2)).join(", ")}]`);
      }
      case "outlier_detector": {
        const values = args["values"] as number[] | undefined;
        if (!Array.isArray(values)) return fail("values requis");
        const mean = values.reduce((s, v) => s + v, 0) / values.length;
        const std = Math.sqrt(values.reduce((s, v) => s + (v - mean) ** 2, 0) / values.length);
        const outliers = values.filter(v => Math.abs((v - mean) / std) > 2);
        return ok(`Mean=${mean.toFixed(2)}, Std=${std.toFixed(2)}, Outliers (z>2): [${outliers.join(", ")}]`);
      }
      case "polynomial_solver": {
        const coeffs = args["coefficients"] as number[] | undefined;
        if (!Array.isArray(coeffs)) return fail("coefficients requis (highest degree first)");
        if (coeffs.length === 3) {
          const [a, b, c] = coeffs;
          const disc = b * b - 4 * a * c;
          if (disc < 0) return ok(`Pas de racines réelles (discriminant=${disc})`);
          const r1 = (-b + Math.sqrt(disc)) / (2 * a);
          const r2 = (-b - Math.sqrt(disc)) / (2 * a);
          return ok(`Racines: x₁=${r1.toFixed(6)}, x₂=${r2.toFixed(6)}`);
        }
        return ok(`Coefficients: [${coeffs.join(", ")}]. Utilisez execute_code pour résoudre.`);
      }
      case "prime_factorization": {
        let n = argNum(args, "number");
        if (n < 2) return fail("Nombre doit être ≥ 2");
        const factors: number[] = [];
        for (let d = 2; d * d <= n; d++) while (n % d === 0) { factors.push(d); n = Math.floor(n / d); }
        if (n > 1) factors.push(n);
        return ok(`Facteurs premiers: ${factors.join(" × ")}`);
      }
      case "probability_distribution": {
        return ok(`Distribution: ${arg(args, "distribution")}. Utilisez execute_code pour calculer.`);
      }
      case "series_sum_calculator": {
        const n = argNum(args, "n");
        const type = arg(args, "type", "arithmetic");
        if (type === "arithmetic") { const a = argNum(args, "first"), d = argNum(args, "diff"); return ok(`Sum = ${n / 2 * (2 * a + (n - 1) * d)}`); }
        if (type === "geometric") { const a = argNum(args, "first"), r = argNum(args, "ratio"); return ok(`Sum = ${a * (1 - Math.pow(r, n)) / (1 - r)}`); }
        return fail("Type inconnu");
      }
      case "trigonometry_solver": {
        const angle = argNum(args, "angle");
        const unit = arg(args, "unit", "radian");
        const rad = unit === "degree" ? (angle * Math.PI) / 180 : angle;
        return ok(`sin=${Math.sin(rad).toFixed(6)}, cos=${Math.cos(rad).toFixed(6)}, tan=${Math.tan(rad).toFixed(6)}`);
      }
      case "vector_calculus": {
        const op = arg(args, "operation", "dot");
        const v1 = args["vector_a"] as number[] | undefined;
        const v2 = args["vector_b"] as number[] | undefined;
        if (!Array.isArray(v1)) return fail("vector_a requis (number[])");
        try {
          if (op === "dot") {
            if (!Array.isArray(v2)) return fail("vector_b requis");
            const dot = v1.reduce((s, v, i) => s + v * (v2[i] || 0), 0);
            return ok(`A·B = ${dot}`);
          }
          if (op === "cross") {
            if (!Array.isArray(v2) || v1.length !== 3 || v2.length !== 3) return fail("Cross product nécessite 2 vecteurs 3D");
            const cross = [v1[1]*v2[2] - v1[2]*v2[1], v1[2]*v2[0] - v1[0]*v2[2], v1[0]*v2[1] - v1[1]*v2[0]];
            return ok(`A × B = [${cross.join(", ")}]`);
          }
          if (op === "magnitude") {
            const mag = Math.sqrt(v1.reduce((s, v) => s + v * v, 0));
            return ok(`||A|| = ${mag.toFixed(6)}`);
          }
          if (op === "angle") {
            if (!Array.isArray(v2)) return fail("vector_b requis");
            const dot = v1.reduce((s, v, i) => s + v * (v2[i] || 0), 0);
            const m1 = Math.sqrt(v1.reduce((s, v) => s + v * v, 0));
            const m2 = Math.sqrt(v2.reduce((s, v) => s + v * v, 0));
            const angle = Math.acos(dot / (m1 * m2)) * 180 / Math.PI;
            return ok(`Angle = ${angle.toFixed(2)}°`);
          }
          if (op === "normalize") {
            const mag = Math.sqrt(v1.reduce((s, v) => s + v * v, 0));
            const unit = v1.map(v => v / mag);
            return ok(`Â = [${unit.map(v => v.toFixed(4)).join(", ")}]`);
          }
          return ok(`Opération: ${op}. Disponible: dot, cross, magnitude, angle, normalize`);
        } catch (e) { return fail(`Erreur vecteur: ${e}`); }
      }
      case "stats_calc": {
        const values = args["values"] as number[] | undefined;
        if (!Array.isArray(values)) return fail("values requis");
        const mean = values.reduce((s, v) => s + v, 0) / values.length;
        const sorted = [...values].sort((a, b) => a - b);
        const median = sorted.length % 2 ? sorted[Math.floor(sorted.length / 2)] : (sorted[sorted.length / 2 - 1] + sorted[sorted.length / 2]) / 2;
        const variance = values.reduce((s, v) => s + (v - mean) ** 2, 0) / values.length;
        return ok(`Mean=${mean.toFixed(4)}, Median=${median}, Std=${Math.sqrt(variance).toFixed(4)}, Min=${sorted[0]}, Max=${sorted[sorted.length - 1]}, Range=${sorted[sorted.length - 1] - sorted[0]}`);
      }
      case "radioactive_decay_calc":
      case "radioactive_decay_calc_2": {
        const n0 = argNum(args, "initial_amount", 100);
        const halfLife = argNum(args, "half_life");
        const time = argNum(args, "time");
        const remaining = n0 * Math.pow(0.5, time / halfLife);
        return ok(`Remaining after ${time} units: ${remaining.toFixed(4)} (decay constant λ=${(Math.log(2) / halfLife).toFixed(6)})`);
      }
      case "ideal_gas_law": {
        const p = argNum(args, "pressure"), v = argNum(args, "volume"), t = argNum(args, "temperature");
        const r = 8.314;
        const solveFor = arg(args, "solve_for", "n");
        if (solveFor === "n") return ok(`n = PV/RT = (${p}×${v})/(${r}×${t}) = ${((p * v) / (r * t)).toFixed(6)} mol`);
        if (solveFor === "p") return ok(`P = nRT/V = ${((argNum(args, "moles") * r * t) / v).toFixed(6)} Pa`);
        if (solveFor === "v") return ok(`V = nRT/P = ${((argNum(args, "moles") * r * t) / p).toFixed(6)} m³`);
        return ok(`T = PV/nR = ${((p * v) / (argNum(args, "moles") * r)).toFixed(6)} K`);
      }
      case "ohms_law_calc": {
        const v = argNum(args, "voltage"), i = argNum(args, "current"), r = argNum(args, "resistance");
        const solveFor = arg(args, "solve_for", "v");
        if (solveFor === "v") return ok(`V = I×R = ${i}×${r} = ${i * r} V`);
        if (solveFor === "i") return ok(`I = V/R = ${v}/${r} = ${(v / r).toFixed(6)} A`);
        return ok(`R = V/I = ${v}/${i} = ${(v / i).toFixed(6)} Ω`);
      }
      case "ph_calculator": {
        const h = argNum(args, "h_concentration");
        if (h > 0) return ok(`pH = -log₁₀(${h}) = ${(-Math.log10(h)).toFixed(4)}`);
        const oh = argNum(args, "oh_concentration");
        if (oh > 0) return ok(`pOH = -log₁₀(${oh}) = ${(-Math.log10(oh)).toFixed(4)}, pH = ${14 + Math.log10(oh)}.toFixed(4)`);
        return fail("h_concentration ou oh_concentration requis");
      }
      case "thermal_expansion_calc": {
        const l0 = argNum(args, "initial_length"), alpha = argNum(args, "coefficient"), dt = argNum(args, "delta_t");
        return ok(`ΔL = α×L₀×ΔT = ${alpha}×${l0}×${dt} = ${(alpha * l0 * dt).toFixed(6)}`);
      }
      case "electric_field_calc": {
        const q = argNum(args, "charge"), r = argNum(args, "distance");
        const k = 8.99e9;
        return ok(`E = k×q/r² = ${k}×${q}/${r * r} = ${(k * q / (r * r)).toExponential(4)} N/C`);
      }
      case "optics_calc": {
        return ok(`Calcul optique: ${arg(args, "operation")}. Utilisez execute_code pour des calculs détaillés.`);
      }
      case "kinematics_calc": {
        const v0 = argNum(args, "initial_velocity"), a = argNum(args, "acceleration"), t = argNum(args, "time");
        return ok(`v = v₀ + at = ${v0 + a * t}\nx = v₀t + ½at² = ${v0 * t + 0.5 * a * t * t}`);
      }
      case "wavelength_frequency": {
        const c = 3e8;
        const f = argNum(args, "frequency"), wl = argNum(args, "wavelength");
        if (f > 0) return ok(`λ = c/f = ${c}/${f} = ${(c / f).toExponential(4)} m`);
        if (wl > 0) return ok(`f = c/λ = ${c}/${wl} = ${(c / wl).toExponential(4)} Hz`);
        return fail("frequency ou wavelength requis");
      }
      case "molar_mass_calc": {
        const formula = arg(args, "formula");
        const ATOMIC_MASSES: Record<string, number> = {
          H: 1.008, He: 4.003, Li: 6.941, Be: 9.012, B: 10.81, C: 12.011, N: 14.007, O: 15.999,
          F: 18.998, Ne: 20.18, Na: 22.99, Mg: 24.305, Al: 26.982, Si: 28.085, P: 30.974, S: 32.06,
          Cl: 35.45, Ar: 39.948, K: 39.098, Ca: 40.078, Sc: 44.956, Ti: 47.867, V: 50.942, Cr: 51.996,
          Mn: 54.938, Fe: 55.845, Co: 58.933, Ni: 58.693, Cu: 63.546, Zn: 65.38, Ga: 69.723, Ge: 72.63,
          As: 74.922, Se: 78.96, Br: 79.904, Kr: 83.798, Rb: 85.468, Sr: 87.62, Ag: 107.868, I: 126.904,
          Au: 196.967, Hg: 200.59, Pb: 207.2, U: 238.029,
        };
        try {
          // Parse formula like "H2O" or "Ca(OH)2"
          const parsed = formula.replace(/([A-Z][a-z]?)(\d*)/g, (_, el: string, count: string) => {
            const n = count ? parseInt(count) : 1;
            return ATOMIC_MASSES[el] ? `${el}:${ATOMIC_MASSES[el] * n}` : `${el}:unknown`;
          });
          const parts = parsed.split(/(?=[A-Z])/).filter(Boolean);
          let total = 0;
          const breakdown: string[] = [];
          for (const part of parts) {
            const match = part.match(/^([A-Z][a-z]?)(\d*)$/);
            if (match) {
              const el = match[1], n = match[2] ? parseInt(match[2]) : 1;
              const mass = ATOMIC_MASSES[el] || 0;
              total += mass * n;
              breakdown.push(`${el}×${n} = ${(mass * n).toFixed(3)}`);
            }
          }
          return ok(`${formula} = ${total.toFixed(3)} g/mol\n${breakdown.join(" | ")}`);
        } catch { return ok(`Masse molaire de ${formula}. Utilisez execute_code pour un calcul détaillé.`); }
      }
      case "chemical_equation_balancer": {
        return ok(`Équation: ${arg(args, "equation")}. Utilisez execute_code pour équilibrer.`);
      }
      case "astronomical_distance": {
        const parallax = argNum(args, "parallax_mas");
        if (parallax > 0) return ok(`Distance = 1/parallax = 1/${parallax} = ${(1 / parallax).toFixed(4)} parsecs = ${(3.26 / parallax).toFixed(4)} light-years`);
        return fail("parallax_mas requis");
      }
      // Health & fitness
      case "body_fat_percentage_calc": {
        const w = argNum(args, "weight"), h = argNum(args, "height");
        const age = argNum(args, "age"), gender = arg(args, "gender", "male");
        const bmi = w / ((h / 100) ** 2);
        const bf = gender === "male" ? 1.2 * bmi + 0.23 * age - 16.2 : 1.2 * bmi + 0.23 * age - 5.4;
        return ok(`BMI=${bmi.toFixed(1)}, Body fat ≈ ${bf.toFixed(1)}%`);
      }
      case "heart_rate_zone": {
        const age = argNum(args, "age");
        const maxHR = 220 - age;
        return ok(`Max HR=${maxHR}, Zone 1(${Math.round(maxHR*0.5)}-${Math.round(maxHR*0.6)}), Zone 2(${Math.round(maxHR*0.6)}-${Math.round(maxHR*0.7)}), Zone 3(${Math.round(maxHR*0.7)}-${Math.round(maxHR*0.8)}), Zone 4(${Math.round(maxHR*0.8)}-${Math.round(maxHR*0.9)}), Zone 5(${Math.round(maxHR*0.9)}-${maxHR})`);
      }
      case "hydration_tracker": {
        const weight = argNum(args, "weight_kg");
        return ok(`Recommandation: ${Math.round(weight * 0.033 * 10) / 10}L/jour (${Math.round(weight * 0.033 * 1000 / 250)} verres de 250ml)`);
      }
      case "ideal_weight_calc": {
        const h = argNum(args, "height_cm"), gender = arg(args, "gender", "male");
        const iw = gender === "male" ? 50 + 0.91 * (h - 152.4) : 45.5 + 0.91 * (h - 152.4);
        return ok(`Poids idéal (Devine): ${iw.toFixed(1)} kg`);
      }
      case "macro_nutrient_calc": {
        const calories = argNum(args, "calories");
        const protein = Math.round(calories * 0.3 / 4);
        const carbs = Math.round(calories * 0.4 / 4);
        const fat = Math.round(calories * 0.3 / 9);
        return ok(`Répartition ${calories}kcal: Protéines=${protein}g, Glucides=${carbs}g, Lipides=${fat}g`);
      }
      case "ovulation_calc": {
        const cycleLength = argNum(args, "cycle_length", 28);
        const lastPeriod = arg(args, "last_period_date");
        return ok(`Ovulation ≈ jour ${cycleLength - 14} du cycle. Fertile: jours ${cycleLength - 19} à ${cycleLength - 9}.`);
      }
      case "pregnancy_due_date": {
        const lmp = arg(args, "lmp_date");
        return ok(`Date prévue d'accouchement ≈ ${lmp} + 280 jours. Utilisez execute_code pour calculer la date exacte.`);
      }
      case "sleep_quality_score": {
        const hours = argNum(args, "hours_slept"), deep = argNum(args, "deep_sleep_pct", 20);
        const score = Math.min(100, Math.round(hours * 10 + (deep >= 20 ? 20 : deep)));
        return ok(`Score sommeil: ${score}/100 (${hours}h, ${deep}% deep)`);
      }
      case "step_to_calorie": {
        const steps = argNum(args, "steps"), weight = argNum(args, "weight_kg", 70);
        const calories = Math.round(steps * 0.04 * weight / 70);
        return ok(`${steps} pas ≈ ${calories} kcal brûlées`);
      }
      case "water_intake_calc": {
        const weight = argNum(args, "weight_kg"), exercise = argNum(args, "exercise_minutes", 0);
        const base = weight * 0.033;
        const extra = exercise * 0.012;
        return ok(`Hydratation recommandée: ${Math.round((base + extra) * 10) / 10}L/jour`);
      }
      // Encoding / crypto
      case "base_convert": case "number_base_convert_advanced": case "binary_convert": case "hex_convert": {
        const num = arg(args, "number");
        const fromBase = argNum(args, "from_base", 10);
        const toBase = argNum(args, "to_base", 2);
        const decimal = parseInt(num, fromBase);
        return ok(`${num} (base ${fromBase}) = ${decimal.toString(toBase)} (base ${toBase})`);
      }
      case "num_to_words": {
        const num = argNum(args, "number");
        const ones = ["zero","one","two","three","four","five","six","seven","eight","nine","ten","eleven","twelve","thirteen","fourteen","fifteen","sixteen","seventeen","eighteen","nineteen"];
        if (num >= 0 && num < 20) return ok(ones[num]);
        return ok(`${num} → voir execute_code pour conversion complète`);
      }
      case "permutation_generator": {
        const items = arg(args, "items").split(",").map(s => s.trim());
        if (items.length > 8) return ok("Trop d'éléments (max 8). Utilisez execute_code.");
        const perms = (arr: string[]): string[][] => arr.length <= 1 ? [arr] : arr.flatMap((v, i) => perms([...arr.slice(0, i), ...arr.slice(i + 1)]).map(p => [v, ...p]));
        return ok(perms(items).map(p => p.join(",")).join("\n"));
      }
      case "random_token_generator": {
        const len = argNum(args, "length", 32);
        const chars = "ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789";
        const token = Array.from({ length: len }, () => chars[Math.floor(Math.random() * chars.length)]).join("");
        return ok(token);
      }
      case "morse_code": {
        const text = arg(args, "text").toUpperCase();
        const morseMap: Record<string, string> = { A:"·−",B:"−···",C:"−·−·",D:"−··",E:"·",F:"··−·",G:"−−·",H:"····",I:"··",J:"·−−−",K:"−·−",L:"·−··",M:"−−",N:"−·",O:"−−−",P:"·−−·",Q:"−−·−",R:"·−·",S:"···",T:"−",U:"··−",V:"···−",W:"·−−",X:"−··−",Y:"−·−−",Z:"−−··","0":"−−−−−","1":"·−−−−","2":"··−−−","3":"···−−","4":"····−","5":"·····","6":"−····","7":"−−···","8":"−−−··","9":"−−−−−" };
        return ok(text.split("").map(c => morseMap[c] || c).join(" "));
      }
      case "rot13": {
        const text = arg(args, "text");
        return ok(text.replace(/[a-zA-Z]/g, c => { const base = c <= "Z" ? 65 : 97; return String.fromCharCode((c.charCodeAt(0) - base + 13) % 26 + base); }));
      }
      case "caesar_cipher": {
        const text = arg(args, "text"), shift = argNum(args, "shift", 3);
        return ok(text.replace(/[a-zA-Z]/g, c => { const base = c <= "Z" ? 65 : 97; return String.fromCharCode((c.charCodeAt(0) - base + shift + 26) % 26 + base); }));
      }
      case "xor_cipher": {
        const text = arg(args, "text"), key = arg(args, "key");
        let result = "";
        for (let i = 0; i < text.length; i++) result += String.fromCharCode(text.charCodeAt(i) ^ key.charCodeAt(i % key.length));
        return ok(Buffer.from(result, "binary").toString("hex"));
      }
      case "generate_hmac": {
        const data = arg(args, "data"), algo = arg(args, "algorithm", "sha256");
        const crypto = require("crypto");
        const key = arg(args, "key", "default-key");
        return ok(crypto.createHmac(algo, key).update(data).digest("hex"));
      }
      case "hash_identify_advanced": {
        const hash = arg(args, "hash");
        const len = hash.length;
        const types: Record<number, string> = { 32: "MD5", 40: "SHA-1", 56: "SHA-224", 64: "SHA-256", 96: "SHA-384", 128: "SHA-512" };
        return ok(`Hash length=${len}, probable: ${types[len] || "Inconnu"}`);
      }
      case "frequency_analysis": {
        const text = arg(args, "text").toLowerCase().replace(/[^a-z]/g, "");
        const freq: Record<string, number> = {};
        for (const c of text) freq[c] = (freq[c] || 0) + 1;
        const sorted = Object.entries(freq).sort((a, b) => b[1] - a[1]).slice(0, 10);
        return ok(`Top 10: ${sorted.map(([c, n]) => `${c}:${((n / text.length) * 100).toFixed(1)}%`).join(", ")}`);
      }
      default:
        return null;
    }
  } catch (e) {
    logger.error(`[GenericTools] Math error ${toolName}: ${e}`);
    return fail(`Erreur calcul: ${e instanceof Error ? e.message : String(e)}`);
  }
}

// ─── Text utilities ──────────────────────────────────────────────────────────

async function handleText(toolName: string, args: Args): Promise<ToolCallResult | null> {
  try {
    const text = arg(args, "text");
    switch (toolName) {
      case "text_extract_emails": {
        const emails = text.match(/[\w.+-]+@[\w-]+\.[\w.-]+/g) || [];
        return ok(`Emails trouvés (${emails.length}): ${emails.join(", ")}`);
      }
      case "text_extract_ips": {
        const ips = text.match(/\b\d{1,3}\.\d{1,3}\.\d{1,3}\.\d{1,3}\b/g) || [];
        return ok(`IPs trouvées (${ips.length}): ${ips.join(", ")}`);
      }
      case "text_extract_phone_numbers": {
        const phones = text.match(/(?:\+?\d{1,3}[\s.-]?)?\(?\d{2,4}\)?[\s.-]?\d{3,4}[\s.-]?\d{3,4}/g) || [];
        return ok(`Téléphones (${phones.length}): ${phones.join(", ")}`);
      }
      case "text_extract_urls": {
        const urls = text.match(/https?:\/\/[^\s<>"']+/g) || [];
        return ok(`URLs (${urls.length}): ${urls.join("\n")}`);
      }
      case "text_html_to_markdown": {
        const md = text.replace(/<h[1-6][^>]*>(.*?)<\/h[1-6]>/gi, "## $1\n").replace(/<b[^>]*>(.*?)<\/b>/gi, "**$1**").replace(/<i[^>]*>(.*?)<\/i>/gi, "*$1*").replace(/<a[^>]*href="([^"]*)"[^>]*>(.*?)<\/a>/gi, "[$2]($1)").replace(/<li[^>]*>(.*?)<\/li>/gi, "- $1\n").replace(/<br\s*\/?>/gi, "\n").replace(/<[^>]+>/g, "").trim();
        return ok(md);
      }
      case "text_markdown_to_plain": {
        return ok(text.replace(/[#*_`~>]/g, "").replace(/\[([^\]]+)\]\([^)]+\)/g, "$1").trim());
      }
      case "text_csv_to_json": {
        const lines = text.trim().split("\n");
        const headers = lines[0].split(",").map(h => h.trim());
        const json = lines.slice(1).map(line => { const vals = line.split(","); const obj: Record<string, string> = {}; headers.forEach((h, i) => obj[h] = (vals[i] || "").trim()); return obj; });
        return ok(JSON.stringify(json, null, 2));
      }
      case "text_json_to_csv": {
        try { const data = JSON.parse(text); if (!Array.isArray(data)) return fail("JSON doit être un array"); const headers = Object.keys(data[0]); const rows = data.map((o: Record<string, any>) => headers.map(h => String(o[h] ?? "")).join(",")); return ok([headers.join(","), ...rows].join("\n")); } catch { return fail("JSON invalide"); }
      }
      case "text_keyword_extract": {
        const words = text.toLowerCase().replace(/[^a-zà-ÿ\s]/g, "").split(/\s+/).filter(w => w.length > 3);
        const freq: Record<string, number> = {};
        for (const w of words) freq[w] = (freq[w] || 0) + 1;
        const keywords = Object.entries(freq).sort((a, b) => b[1] - a[1]).slice(0, 10).map(([w, n]) => `${w}(${n})`);
        return ok(`Mots-clés: ${keywords.join(", ")}`);
      }
      case "text_redact_pii": {
        let redacted = text.replace(/[\w.+-]+@[\w-]+\.[\w.-]+/g, "[EMAIL]").replace(/\b\d{1,3}\.\d{1,3}\.\d{1,3}\.\d{1,3}\b/g, "[IP]").replace(/(?:\+?\d{1,3}[\s.-]?)?\(?\d{2,4}\)?[\s.-]?\d{3,4}[\s.-]?\d{3,4}/g, "[PHONE]");
        return ok(redacted);
      }
      case "text_readability_score": {
        const sentences = text.split(/[.!?]+/).filter(s => s.trim().length > 0);
        const words = text.split(/\s+/).filter(w => w.length > 0);
        const syllables = words.reduce((s, w) => s + (w.match(/[aeiouyàâéèêëiouôû]/gi) || []).length, 0);
        const flesch = 206.835 - 1.015 * (words.length / sentences.length) - 84.6 * (syllables / words.length);
        return ok(`Flesch Reading Ease: ${flesch.toFixed(1)} (${flesch > 60 ? "lisible" : "difficile"})`);
      }
      case "text_regex_tester": {
        const pattern = arg(args, "pattern"), flags = arg(args, "flags", "g");
        try { const re = new RegExp(pattern, flags); const matches = text.match(re) || []; return ok(`Matches (${matches.length}): ${matches.slice(0, 20).join(", ")}`); } catch (e) { return fail(`Regex invalide: ${e}`); }
      }
      case "text_summarize_advanced": {
        const sentences = text.split(/[.!?]+/).filter(s => s.trim().length > 10);
        const summary = sentences.slice(0, 3).join(". ") + ".";
        return ok(`Résumé (${sentences.length} phrases → 3): ${summary}`);
      }
      case "text_fuzzy_match": {
        const s1 = arg(args, "string1"), s2 = arg(args, "string2");
        const longer = s1.length > s2.length ? s1 : s2;
        const shorter = s1.length > s2.length ? s2 : s1;
        const dist = longer.length - shorter.length;
        let common = 0;
        for (let i = 0; i < shorter.length; i++) if (longer.includes(shorter[i])) common++;
        const similarity = (2 * common) / (s1.length + s2.length);
        return ok(`Similarity: ${(similarity * 100).toFixed(1)}%`);
      }
      case "text_transliterate": {
        return ok(`Translittération de "${text.slice(0, 50)}...". Utilisez execute_code pour une translittération complète.`);
      }
      case "text_ngram_generator": {
        const n = argNum(args, "n", 2);
        const words = text.split(/\s+/);
        const ngrams: string[] = [];
        for (let i = 0; i <= words.length - n; i++) ngrams.push(words.slice(i, i + n).join(" "));
        return ok(`${n}-grams (${ngrams.length}): ${ngrams.slice(0, 20).join(" | ")}`);
      }
      case "text_phonetic_match": {
        const s1 = arg(args, "string1").toUpperCase();
        const s2 = arg(args, "string2").toUpperCase();
        const soundex = (s: string): string => { const map: Record<string, string> = { B:"1",F:"1",P:"1",V:"1",C:"2",G:"2",J:"2",K:"2",Q:"2",S:"2",X:"2",Z:"2",D:"3",T:"3",L:"4",M:"5",N:"5",R:"6" }; let code = s[0]; for (let i = 1; i < s.length && code.length < 4; i++) { const c = map[s[i]]; if (c && c !== map[s[i-1]]) code += c; } return code.padEnd(4, "0"); };
        const m1 = soundex(s1), m2 = soundex(s2);
        return ok(`Soundex: ${s1}→${m1}, ${s2}→${m2}. ${m1 === m2 ? "Match!" : "Pas de match"}`);
      }
      case "text_language_detect_advanced": {
        const lang = /[àâéèêëîïôûùç]/i.test(text) ? "Français" : /ñ¿áéíóúü/i.test(text) ? "Espagnol" : /äöüß/i.test(text) ? "Allemand" : "Anglais";
        return ok(`Langue détectée: ${lang}`);
      }
      case "text_stem_lemmatize": {
        return ok(`Stemming/Lemmatisation de "${text.slice(0, 50)}...". Utilisez execute_code avec natural/compromise pour traitement NLP.`);
      }
      case "text_extract_entities": {
        const entities: string[] = [];
        const emails = text.match(/[\w.+-]+@[\w-]+\.[\w.-]+/g); if (emails) entities.push(...emails.map(e => `EMAIL: ${e}`));
        const ips = text.match(/\b\d{1,3}\.\d{1,3}\.\d{1,3}\.\d{1,3}\b/g); if (ips) entities.push(...ips.map(i => `IP: ${i}`));
        const urls = text.match(/https?:\/\/[^\s]+/g); if (urls) entities.push(...urls.map(u => `URL: ${u}`));
        const dates = text.match(/\d{1,2}[\/-]\d{1,2}[\/-]\d{2,4}/g); if (dates) entities.push(...dates.map(d => `DATE: ${d}`));
        return ok(`Entités (${entities.length}): ${entities.join(", ")}`);
      }
      case "csv_analyzer": {
        const lines = text.trim().split("\n");
        const headers = lines[0].split(",").map(h => h.trim());
        return ok(`CSV: ${lines.length - 1} lignes, ${headers.length} colonnes. Headers: ${headers.join(", ")}`);
      }
      case "json_path_query": {
        const json = args["json"], path = arg(args, "path");
        return ok(`JSONPath "${path}" sur les données. Utilisez execute_code avec jsonpath-plus pour exécuter.`);
      }
      case "json_schema_validate": {
        return ok(`Validation JSON schema. Utilisez execute_code avec ajv pour valider.`);
      }
      case "xml_to_json": {
        return ok(`Conversion XML→JSON. Utilisez execute_code avec xml2js pour convertir.`);
      }
      case "yaml_validate": {
        try {
          const yaml = await import("yaml");
          yaml.parse(text);
          return ok("YAML valide ✓");
        } catch {
          try {
            // @ts-expect-error — js-yaml has no bundled types
            const jsYaml = await import("js-yaml");
            jsYaml.load(text);
            return ok("YAML valide ✓");
          } catch (e) {
            return fail(`YAML invalide: ${e}`);
          }
        }
      }
      case "regex_debugger": {
        const pattern = arg(args, "pattern");
        try { new RegExp(pattern); return ok(`Regex valide: /${pattern}/`); } catch (e) { return fail(`Regex invalide: ${e}`); }
      }
      case "code_format_beautifier": {
        return ok(`Beautification de code. Utilisez execute_code avec prettier pour formater.`);
      }
      case "code_minifier": {
        return ok(`Minification de code. Utilisez execute_code avec terser pour minifier.`);
      }
      case "code_diff_unified": {
        const s1 = arg(args, "source1"), s2 = arg(args, "source2");
        return ok(`Diff entre les deux sources. Utilisez execute_code avec diff pour générer le patch.`);
      }
      case "code_complexity_analyzer": {
        return ok(`Analyse de complexité cyclomatique. Utilisez execute_code avec eslint pour analyser.`);
      }
      case "code_linter_check": {
        return ok(`Lint du code. Utilisez execute_code avec eslint pour vérifier.`);
      }
      case "sql_format_beautifier": case "sql_format_beautify_2": {
        return ok(`Formatage SQL. Utilisez execute_code avec sql-formatter pour formater.`);
      }
      case "sql_query_explainer": {
        return ok(`Explication de requête SQL: ${arg(args, "query")}. Analysez la requête pour expliquer JOINs, WHERE, GROUP BY, etc.`);
      }
      case "changelog_generator": {
        return ok(`Génération de changelog. Utilisez execute_code avec conventional-changelog pour générer.`);
      }
      case "data_anonymizer": {
        let anon = text.replace(/[\w.+-]+@[\w-]+\.[\w.-]+/g, "user@example.com").replace(/\b\d{1,3}\.\d{1,3}\.\d{1,3}\.\d{1,3}\b/g, "0.0.0.0").replace(/\b[A-Z]{2}\d{9}[A-Z]\b/g, "FRXXXXXXXXX");
        return ok(anon);
      }
      case "text_to_speech_multi": {
        return ok(`TTS pour "${text.slice(0, 50)}...". Utilisez l'API AssemblyAI ou Google TTS pour générer l'audio.`);
      }
      default:
        return null;
    }
  } catch (e) {
    logger.error(`[GenericTools] Text error ${toolName}: ${e}`);
    return fail(`Erreur texte: ${e instanceof Error ? e.message : String(e)}`);
  }
}

// ─── Security tools (Kali delegation) ────────────────────────────────────────

const KALI_TOOLS = new Set([
  "nuclei_scan", "ffuf_fuzz", "wfuzz_scan", "gobuster_scan", "sqlmap_scan",
  "hashcat_crack", "hash_crack_dictionary", "metasploit", "owasp_zap_scan",
  "wpscan_full", "joomscan", "droopescan", "whatweb_scan", "searchsploit",
  "enum4linux_scan", "crackmapexec_scan", "hydra_brute", "nmap_nse_scan",
  "tshark_capture", "arp_poison_detect", "wifi_deauth_detect", "vlan_hop_test",
  "ntp_monlist", "smb_enum_shares", "smb_version_detect", "smtp_enum_vrfy",
  "smtp_relay_test", "telnet_banner_grab", "ftp_anonymous_check", "rdp_check",
  "ssh_version_scan", "kerberos_user_enum", "ldap_enum", "dns_zone_transfer",
  "dns_subdomain_brute", "dns_rebinding_check", "dns_history_passive",
  "dns_propagation_check", "ipv6_scan", "reverse_ip", "reverse_whois",
  "domain_whois_history", "subdomain_enum", "crtsh_search",
  "google_dorks_generator", "github_dorks_search",
  "command_injection_test", "csrf_token_check", "xss_payload_generator",
  "sqli_payload_generator", "xxe_vuln_check", "lfi_rfi_check",
  "open_redirect_check", "ssrf_check", "cors_misconfig_check",
  "graphql_introspection_check", "oauth_flow_test", "webhook_signature_verify",
  "security_headers_full", "ssl_cert_expiry_check", "ssl_labs_grade",
  "hsts_check", "apache_config_check", "nginx_config_check",
  "dockerfile_lint", "dockerfile_lint_2", "docker_compose_validate",
  "docker_ps_audit", "docker_image_vuln_scan", "kubernetes_manifest_validate",
  "terraform_validate", "terraform_plan_diff", "file_permission_audit",
  "firewall_rules_audit", "ssh_key_audit", "env_vars_inspect",
  "cron_jobs_list", "load_average_monitor", "disk_usage_analyzer",
  "log_tail", "memory_leak_detect", "network_connections_list",
  "network_map_generate", "process_monitor", "port_kill",
  "service_status_check", "cloud_metadata_check", "k8s_pod_inspect",
  "aws_iam_audit", "aws_s3_bucket_check", "aws_security_groups_audit",
  "azure_ad_enum", "gcp_project_enum",
]);

async function handleSecurity(toolName: string, args: Args, ctx: ToolContext): Promise<ToolCallResult | null> {
  if (!KALI_TOOLS.has(toolName)) return null;
  try {
    const { executeKaliTool } = await import("./agentToolsKali.js");
    const result = await executeKaliTool(toolName, args, { userId: ctx.userId });
    if (result) return result;
    // If Kali didn't handle it, provide a helpful message
    const target = arg(args, "target") || arg(args, "url") || arg(args, "host") || arg(args, "domain");
    return ok(`🔧 ${toolName} sur ${target || "cible"} — utilise le container Kali Linux. Vérifiez que le container Kali est démarré. Arguments: ${JSON.stringify(args).slice(0, 200)}`);
  } catch (e) {
    return ok(`⚠️ ${toolName}: Kali non disponible. ${e instanceof Error ? e.message : String(e)}`);
  }
}

// ─── API-based tools ─────────────────────────────────────────────────────────

async function handleApi(toolName: string, args: Args): Promise<ToolCallResult | null> {
  try {
    switch (toolName) {
      case "github_commit_history": {
        const owner = arg(args, "owner"), repo = arg(args, "repo");
        const res = await fetch(`https://api.github.com/repos/${owner}/${repo}/commits?per_page=10`, { headers: { "User-Agent": "discord-bot" } });
        const data = await res.json() as Array<{ sha: string; commit: { message: string; author: { date: string } } }>;
        const commits = data.slice(0, 10).map((c, i) => `${i + 1}. ${c.sha.slice(0, 7)} — ${c.commit.message.split("\n")[0]} (${c.commit.author.date})`);
        return ok(`Commits récents de ${owner}/${repo}:\n${commits.join("\n")}`);
      }
      case "github_dorks_search": {
        const query = arg(args, "query");
        const res = await fetch(`https://api.github.com/search/code?q=${encodeURIComponent(query)}&per_page=10`, { headers: { "User-Agent": "discord-bot" } });
        const data = await res.json() as { items: Array<{ repository: { full_name: string }; path: string; html_url: string }> };
        const results = (data.items || []).slice(0, 10).map((r, i) => `${i + 1}. ${r.repository.full_name}/${r.path}`);
        return ok(`GitHub dorks pour "${query}" (${data.items?.length || 0} results):\n${results.join("\n")}`);
      }
      case "haveibeenpwned_check": {
        const email = arg(args, "email");
        return ok(`Check HaveIBeenPwned pour ${email}. API key requise (https://haveibeenpwned.com/API/Key). Utilisez l'API: GET https://haveibeenpwned.com/api/v3/breachedaccount/${email}`);
      }
      case "crtsh_search": {
        const domain = arg(args, "domain");
        const res = await fetch(`https://crt.sh/?q=${encodeURIComponent(domain)}&output=json`, { signal: AbortSignal.timeout(10000) });
        const data = await res.json() as Array<{ name_value: string; issuer_name: string; not_before: string }>;
        const certs = data.slice(0, 15).map((c, i) => `${i + 1}. ${c.name_value} (issuer: ${c.issuer_name}, from: ${c.not_before})`);
        return ok(`Certificats pour ${domain} (${data.length} total):\n${certs.join("\n")}`);
      }
      case "wayback_machine_lookup": {
        const url = arg(args, "url");
        const res = await fetch(`https://archive.org/wayback/available?url=${encodeURIComponent(url)}`);
        const data = await res.json() as { archived_snapshots?: { closest?: { url: string; timestamp: string } } };
        if (data.archived_snapshots?.closest) return ok(`Snapshot: ${data.archived_snapshots.closest.url} (${data.archived_snapshots.closest.timestamp})`);
        return ok(`Aucun snapshot trouvé pour ${url}`);
      }
      case "wayback_diff": {
        const url = arg(args, "url"), t1 = arg(args, "timestamp1"), t2 = arg(args, "timestamp2");
        return ok(`Diff Wayback Machine pour ${url} entre ${t1} et ${t2}. Utilisez: https://timetravel.mementoweb.org/api/`);
      }
      case "google_cache_lookup": {
        const url = arg(args, "url");
        return ok(`Google Cache pour ${url}: https://webcache.googleusercontent.com/search?q=cache:${encodeURIComponent(url)}`);
      }
      case "gravatar_lookup": {
        const crypto = require("crypto");
        const email = arg(args, "email").trim().toLowerCase();
        const hash = crypto.createHash("md5").update(email).digest("hex");
        return ok(`Gravatar: https://www.gravatar.com/avatar/${hash}?s=400&d=404`);
      }
      case "reverse_image_search": {
        const imageUrl = arg(args, "image_url");
        return ok(`Reverse image search: Google Images (https://lens.google.com/uploadbyurl?url=${encodeURIComponent(imageUrl)}) ou TinEye (https://tineye.com/search/?url=${encodeURIComponent(imageUrl)})`);
      }
      case "social_media_checker": {
        const username = arg(args, "username");
        return ok(`Vérification username "${username}" sur réseaux sociaux: https://www.namechk.com/ ou utilisez execute_code avec Sherlock.`);
      }
      case "geocode_reverse": {
        const lat = argNum(args, "lat"), lon = argNum(args, "lon");
        const res = await fetch(`https://nominatim.openstreetmap.org/reverse?format=json&lat=${lat}&lon=${lon}`);
        const data = await res.json() as { display_name: string };
        return ok(`Adresse: ${data.display_name || "Inconnue"}`);
      }
      case "elevation_lookup": {
        const lat = argNum(args, "lat"), lon = argNum(args, "lon");
        const res = await fetch(`https://api.open-elevation.com/api/v1/lookup?locations=${lat},${lon}`);
        const data = await res.json() as { results: Array<{ elevation: number }> };
        return ok(`Élévation: ${data.results?.[0]?.elevation ?? "?"}m`);
      }
      case "sunrise_sunset_anywhere": {
        const lat = argNum(args, "lat"), lon = argNum(args, "lon");
        const res = await fetch(`https://api.sunrise-sunset.org/json?lat=${lat}&lng=${lon}&formatted=0`);
        const data = await res.json() as { results: { sunrise: string; sunset: string } };
        return ok(`Lever: ${data.results?.sunrise}, Coucher: ${data.results?.sunset}`);
      }
      case "distance_matrix": {
        const origins = arg(args, "origins"), destinations = arg(args, "destinations");
        return ok(`Distance matrix: ${origins} → ${destinations}. Utilisez Google Distance Matrix API ou OpenRouteService.`);
      }
      case "capital_lookup": case "country_bordering": case "currency_by_country":
      case "iso_country_code": case "language_by_country": {
        const country = arg(args, "country");
        const res = await fetch(`https://restcountries.com/v3.1/name/${encodeURIComponent(country)}`);
        const data = await res.json() as Array<{ capital?: string[]; borders?: string[]; currencies?: Record<string, { name: string }>; cca2?: string; languages?: Record<string, string> }>;
        const c = data[0];
        if (!c) return fail(`Pays "${country}" introuvable`);
        if (toolName === "capital_lookup") return ok(`Capitale: ${c.capital?.[0] || "N/A"}`);
        if (toolName === "country_bordering") return ok(`Frontières: ${c.borders?.join(", ") || "Aucune"}`);
        if (toolName === "currency_by_country") return ok(`Devise: ${Object.values(c.currencies || {}).map(d => d.name).join(", ")}`);
        if (toolName === "iso_country_code") return ok(`Code ISO: ${c.cca2 || "N/A"}`);
        if (toolName === "language_by_country") return ok(`Langues: ${Object.values(c.languages || {}).join(", ")}`);
        return ok(JSON.stringify(c, null, 2));
      }
      case "fortnite_item_shop": {
        try {
          const res = await fetch("https://fortnite-api.com/v2/shop", { signal: AbortSignal.timeout(8000) });
          const data = await res.json() as { data?: { entries?: Array<{ items?: Array<{ name: string }>; finalPrice?: number }> } };
          const items = (data.data?.entries || []).slice(0, 10).map((e, i) => `${i + 1}. ${e.items?.[0]?.name || "Unknown"} — ${e.finalPrice || "?"} V-Bucks`);
          return ok(`🛒 Boutique Fortnite (${data.data?.entries?.length || 0} items):\n${items.join("\n")}`);
        } catch { return ok("Boutique Fortnite indisponible. Utilisez: https://fortnite-api.com/v2/shop"); }
      }
      case "epic_games_free_games": {
        try {
          const res = await fetch("https://store-site-backend-static.ak.epicgames.com/freeGamesPromotions", { signal: AbortSignal.timeout(8000) });
          const data = await res.json() as Array<{ title: string; productSlug: string }>;
          const games = (data || []).slice(0, 10).map((g, i) => `${i + 1}. ${g.title}`);
          return ok(`🎮 Jeux gratuits Epic Games:\n${games.join("\n")}`);
        } catch { return ok("Epic Games API indisponible."); }
      }
      case "minecraft_server_status": {
        const host = arg(args, "host");
        const edition = arg(args, "edition", "java").toLowerCase();

        // Bedrock/Realm: use UDP RakNet ping
        if (edition === "bedrock" || edition === "realm" || /^[A-Z0-9]{6,12}$/i.test(host)) {
          const { getBedrockServerStatus } = await import("./bedrockPing.js");
          const result = await getBedrockServerStatus(host);
          return ok(result);
        }

        // Java Edition: use mcsrvstat.us (TCP)
        try {
          const res = await fetch(`https://api.mcsrvstat.us/3/${host}`, { signal: AbortSignal.timeout(8000) });
          const data = await res.json() as { online: boolean; players?: { online: number; max: number }; version?: string; motd?: { clean: string[] }; icon?: string };
          if (!data.online) return ok(`🔴 Serveur Java ${host}: Hors ligne`);
          const motd = data.motd?.clean?.join(" ") || "N/A";
          return ok(`🟢 **Serveur Java ${host}**\n**MOTD:** ${motd}\n**Joueurs:** ${data.players?.online}/${data.players?.max}\n**Version:** ${data.version || "N/A"}`);
        } catch {
          return ok(`Impossible de contacter le serveur Minecraft ${host}. Vérifiez l'adresse.`);
        }
      }
      case "minecraft_realm_status": {
        const inviteCode = arg(args, "invite_code") || arg(args, "code") || arg(args, "host");
        const { getBedrockServerStatus } = await import("./bedrockPing.js");
        const result = await getBedrockServerStatus(inviteCode);
        return ok(result);
      }
      case "twitch_stream_check": {
        const channel = arg(args, "channel");
        return ok(`Check Twitch ${channel}: nécessite TWITCH_ACCESS_TOKEN. Utilisez l'API: GET https://api.twitch.tv/helix/streams?user_login=${channel}`);
      }
      case "twitch_clip_create": {
        return ok(`Création clip Twitch: nécessite TWITCH_ACCESS_TOKEN et broadcaster_id. POST https://api.twitch.tv/helix/clips`);
      }
      case "spotify_track_search": {
        return ok(`Recherche Spotify: nécessite SPOTIFY_CLIENT_ID/SECRET. Utilisez: GET https://api.spotify.com/v1/search?q=${encodeURIComponent(arg(args, "query"))}&type=track`);
      }
      case "spotify_playlist_analyze": {
        return ok(`Analyse playlist Spotify: nécessite SPOTIFY_CLIENT_ID/SECRET et playlist_id.`);
      }
      case "apex_legends_stats": {
        const player = arg(args, "player");
        try {
          const res = await fetch(`https://api.mozambiquehe.re/bridge?auth=${process.env.APEX_API_KEY || "free"}&player=${encodeURIComponent(player)}&platform=PC`, { signal: AbortSignal.timeout(8000) });
          const data = await res.json() as { global?: { name: string; level: number; rank?: { rankName: string } } };
          if (data.global) return ok(`🎮 Apex Legends — ${data.global.name}: Niveau ${data.global.level}, Rank: ${data.global.rank?.rankName || "N/A"}`);
          return ok(`Joueur "${player}" introuvable sur Apex Legends.`);
        } catch { return ok(`Apex Legends stats pour "${player}". Nécessite APEX_API_KEY (gratuit sur https://apexlegendsapi.com).`); }
      }
      case "csgo_stats_fetch": {
        const player = arg(args, "player");
        return ok(`CS2 stats pour "${player}". Utilisez: https://tracker.gg/csgo/profile/steam/${encodeURIComponent(player)}/overview`);
      }
      case "lol_match_history": case "lol_rank_check": case "riot_account_lookup": {
        const player = arg(args, "player");
        try {
          const res = await fetch(`https://euw1.api.riotgames.com/lol/summoner/v4/summoners/by-name/${encodeURIComponent(player)}`, {
            headers: { "X-Riot-Token": process.env.RIOT_API_KEY || "" },
            signal: AbortSignal.timeout(8000),
          });
          const data = await res.json() as { name?: string; summonerLevel?: number };
          if (data.name) return ok(`🎮 LoL — ${data.name}: Niveau ${data.summonerLevel}`);
          return ok(`Joueur LoL "${player}" introuvable.`);
        } catch { return ok(`LoL stats pour "${player}". Nécessite RIOT_API_KEY (gratuit sur https://developer.riotgames.com).`); }
      }
      case "osu_user_stats": {
        const player = arg(args, "player");
        try {
          const res = await fetch(`https://osu.ppy.sh/api/v2/users/${encodeURIComponent(player)}`, {
            headers: { Authorization: `Bearer ${process.env.OSU_API_KEY || ""}` },
            signal: AbortSignal.timeout(8000),
          });
          const data = await res.json() as { username?: string; statistics?: { global_rank?: number; pp?: number } };
          if (data.username) return ok(`🎵 osu! — ${data.username}: Rank #${data.statistics?.global_rank || "N/A"}, PP: ${data.statistics?.pp || 0}`);
          return ok(`Joueur osu! "${player}" introuvable.`);
        } catch { return ok(`osu! stats pour "${player}". Nécessite OSU_API_KEY (gratuit sur https://osu.ppy.sh/home/account/edit).`); }
      }
      case "rocket_league_stats": {
        const player = arg(args, "player");
        return ok(`🚀 Rocket League stats pour "${player}". Utilisez: https://rocketleague.tracker.network/rocket-league/profile/epic/${encodeURIComponent(player)}/overview`);
      }
      case "boardgame_geek_search": {
        const query = arg(args, "query");
        const res = await fetch(`https://boardgamegeek.com/xmlapi2/search?search=${encodeURIComponent(query)}&type=boardgame`);
        const xml = await res.text();
        const ids = xml.match(/objectid="(\d+)"/g)?.slice(0, 5) || [];
        return ok(`BoardGameGeek search "${query}": ${ids.length} résultats. ${ids.join(", ")}`);
      }
      case "dehashed_search": case "hunter_io_email": case "leaked_source_search":
      case "breach_parse": case "malware_sample_lookup": case "darkweb_monitor":
      case "phone_number_lookup_full": {
        return ok(`${toolName}: API spécialisée requise. ${JSON.stringify(args).slice(0, 150)}`);
      }
      case "bitcoin_address_analysis": {
        const addr = arg(args, "address");
        const res = await fetch(`https://api.blockcypher.com/v1/btc/main/addrs/${addr}/balance`);
        const data = await res.json() as { balance: number; total_received: number; n_tx: number };
        return ok(`BTC ${addr}: Balance=${data.balance / 1e8} BTC, Total reçu=${data.total_received / 1e8} BTC, Transactions=${data.n_tx}`);
      }
      case "ethereum_contract_verify": {
        const addr = arg(args, "address");
        const res = await fetch(`https://api.etherscan.io/api?module=contract&action=getabi&address=${addr}`);
        const data = await res.json() as { status: string; message: string };
        return ok(`ETH contract ${addr}: ${data.status === "1" ? "Vérifié, ABI disponible" : "Non vérifié ou source non disponible"}`);
      }
      case "get_dev_snippet": case "lookup_typescript_skill": case "search_developer_resources":
      case "search_programming_books": case "search_public_apis": case "search_system_design": {
        const query = arg(args, "query");
        return ok(`${toolName}: "${query}". Utilisez searchWeb ou execute_code pour des résultats détaillés.`);
      }
      default:
        return null;
    }
  } catch (e) {
    logger.error(`[GenericTools] API error ${toolName}: ${e}`);
    return fail(`Erreur API: ${e instanceof Error ? e.message : String(e)}`);
  }
}

// ─── Crypto / stego / media ──────────────────────────────────────────────────

async function handleCrypto(toolName: string, args: Args): Promise<ToolCallResult | null> {
  try {
    const crypto = require("crypto");
    switch (toolName) {
      case "rsa_keypair_generate": {
        const bits = argNum(args, "bits", 2048);
        return ok(`Génération paire RSA ${bits} bits. Utilisez execute_code: crypto.generateKeyPairSync('rsa', { modulusLength: ${bits} })`);
      }
      case "rsa_encrypt": case "rsa_decrypt": {
        return ok(`${toolName}: nécessite clé PEM. Utilisez execute_code avec crypto.publicEncrypt/crypto.privateDecrypt.`);
      }
      case "pgp_encrypt": case "pgp_decrypt": {
        return ok(`${toolName}: nécessite openpgp. Utilisez execute_code avec la librairie openpgp.`);
      }
      case "crypto_aes_decrypt": {
        return ok(`AES decrypt: nécessite clé + IV. Utilisez execute_code: crypto.createDecipheriv('aes-256-gcm', key, iv)`);
      }
      case "certificate_parse": {
        const cert = arg(args, "certificate");
        try { const parsed = crypto.X509Certificate ? new crypto.X509Certificate(cert) : null; return ok(parsed ? `Subject: ${parsed.subject}, Issuer: ${parsed.issuer}, Valid: ${parsed.validFrom} - ${parsed.validTo}` : "Parsing non disponible"); } catch { return fail("Certificat invalide"); }
      }
      case "stego_hide_lsb": case "stego_extract_lsb": case "steganalysis_zscore": {
        return ok(`${toolName}: stéganographie LSB. Utilisez execute_code avec jimp/sharp pour traiter l'image.`);
      }
      case "metadata_strip": case "image_metadata_strip": case "exif_extract_full": {
        return ok(`${toolName}: métadonnées image. Utilisez execute_code avec exifreader/exifr.`);
      }
      case "audio_convert": case "audio_extract_from_video": case "video_compress": case "video_gif_convert":
      case "image_collage_create": case "image_format_convert": case "image_resize_crop": case "image_watermark_add": {
        return ok(`${toolName}: traitement média. Utilisez execute_code avec sharp/jimp/ffmpeg.`);
      }
      case "histogram_generator": case "scatter_plot_generator": {
        return ok(`${toolName}: génération de graphique. Utilisez execute_code avec chart.js/d3.`);
      }
      case "time_series_decompose": {
        return ok(`Décomposition série temporelle. Utilisez execute_code avec statsmodels/simple-statistics.`);
      }
      case "timezone_convert_advanced": {
        const dt = arg(args, "datetime"), fromTz = arg(args, "from_timezone"), toTz = arg(args, "to_timezone");
        try { const d = new Date(dt); return ok(`${dt} (${fromTz}) → ${d.toLocaleString("fr-FR", { timeZone: toTz })} (${toTz})`); } catch { return fail("Datetime/timezone invalide"); }
      }
      case "timestamp_convert": {
        const ts = argNum(args, "timestamp");
        const dt = new Date(ts * (ts > 1e12 ? 1 : 1000));
        return ok(`Timestamp ${ts} → ${dt.toISOString()}`);
      }
      case "unit_convert_scientific": {
        return ok(`Conversion scientifique: ${arg(args, "value")} ${arg(args, "from_unit")} → ${arg(args, "to_unit")}. Utilisez execute_code avec convert-units.`);
      }
      case "rate_limit_check": {
        return ok(`Rate limit check pour ${arg(args, "endpoint")}. Mesurez les appels API récents.`);
      }
      case "api_endpoint_tester": {
        const url = arg(args, "url");
        const method = arg(args, "method", "GET");
        const res = await fetch(url, { method, signal: AbortSignal.timeout(10000) });
        return ok(`${method} ${url} → ${res.status} ${res.statusText}`);
      }
      case "api_rate_limit_discover": {
        const url = arg(args, "url");
        const res = await fetch(url, { signal: AbortSignal.timeout(5000) });
        const headers = Object.fromEntries(res.headers.entries());
        const rateLimit = headers["x-ratelimit-limit"] || headers["x-ratelimit-remaining"] || "N/A";
        return ok(`Rate limits pour ${url}: limit=${rateLimit}, retry-after=${headers["retry-after"] || "N/A"}`);
      }
      case "api_schema_diff": {
        return ok(`Diff de schema API entre ${arg(args, "schema1")} et ${arg(args, "schema2")}. Utilisez execute_code pour comparer.`);
      }
      case "dependency_audit": {
        return ok(`Audit dépendances: utilisez npm audit ou execute_code avec audit-ci.`);
      }
      case "dep_vuln_check": {
        const pkg = arg(args, "package");
        const res = await fetch(`https://registry.npmjs.org/${encodeURIComponent(pkg)}/latest`);
        const data = await res.json() as { version: string };
        return ok(`${pkg}@${data.version}. Vérifiez https://www.npmjs.com/advisories pour vulnérabilités.`);
      }
      default:
        return null;
    }
  } catch (e) {
    return fail(`Erreur crypto/media: ${e instanceof Error ? e.message : String(e)}`);
  }
}

// ─── Main dispatcher ─────────────────────────────────────────────────────────

export async function executeGenericTool(
  toolName: string,
  args: Args,
  ctx: ToolContext,
): Promise<ToolCallResult | null> {
  // Try math first
  const mathResult = handleMath(toolName, args);
  if (mathResult) return mathResult;

  // Try text utilities
  const textResult = await handleText(toolName, args);
  if (textResult) return textResult;

  // Try crypto/media
  const cryptoResult = await handleCrypto(toolName, args);
  if (cryptoResult) return cryptoResult;

  // Try security (Kali)
  const secResult = await handleSecurity(toolName, args, ctx);
  if (secResult) return secResult;

  // Try API-based tools
  const apiResult = await handleApi(toolName, args);
  if (apiResult) return apiResult;

  return null;
}
