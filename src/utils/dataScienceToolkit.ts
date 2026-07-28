/**
 * dataScienceToolkit.ts — Data Science & Analytics utilities
 * Called by Quant (the AI brain) via tool handlers in agentToolsExtended.ts
 */

// ─── CSV analyzer ──────────────────────────────────────────────────────────
export function csvAnalyzer(csvData: string): string {
  try {
    const lines = csvData.trim().split("\n");
    if (lines.length < 2) return "CSV needs at least a header and one row";
    const headers = lines[0].split(",").map((h) => h.trim());
    const rows = lines.slice(1).map((r) => r.split(","));
    const columns: Record<
      string,
      { type: string; missing: number; unique: number; sample: string }[]
    > = {};
    headers.forEach((h, i) => {
      const values = rows.map((r) => r[i]?.trim() || "");
      const nonEmpty = values.filter((v) => v);
      const isNumeric = nonEmpty.every((v) => !isNaN(parseFloat(v)));
      const unique = new Set(nonEmpty).size;
      const missing = values.length - nonEmpty.length;
      columns[h] = [
        {
          type: isNumeric ? "number" : "string",
          missing,
          unique,
          sample: nonEmpty[0] || "",
        },
      ];
    });
    return JSON.stringify({ totalRows: rows.length, totalCols: headers.length, columns }, null, 2);
  } catch (err) {
    return `Error: ${(err as Error).message}`;
  }
}

// ─── JSON Path query ────────────────────────────────────────────────────────
export function jsonPathQuery(jsonStr: string, path: string): string {
  try {
    const data = JSON.parse(jsonStr);
    const parts = path
      .replace(/^\$\.?/, "")
      .split(/[.\[]/)
      .filter(Boolean);
    let current: any = data;
    for (const part of parts) {
      const key = part.replace(/["'\]]/g, "");
      current = current[key];
      if (current === undefined) return `Path not found: ${path}`;
    }
    return JSON.stringify(current, null, 2);
  } catch (err) {
    return `Error: ${(err as Error).message}`;
  }
}

// ─── SQL query explainer ────────────────────────────────────────────────────
export function sqlQueryExplainer(query: string): string {
  const upperQuery = query.toUpperCase().trim();
  const explanations: string[] = [];

  if (upperQuery.startsWith("SELECT"))
    explanations.push("SELECT: Retrieves data from one or more tables");
  if (upperQuery.includes(" JOIN ")) explanations.push("JOIN: Combines rows from multiple tables");
  if (upperQuery.includes(" INNER JOIN "))
    explanations.push("INNER JOIN: Only matching rows from both tables");
  if (upperQuery.includes(" LEFT JOIN "))
    explanations.push("LEFT JOIN: All rows from left table + matching from right");
  if (upperQuery.includes(" RIGHT JOIN "))
    explanations.push("RIGHT JOIN: All rows from right table + matching from left");
  if (upperQuery.includes(" FULL JOIN ")) explanations.push("FULL JOIN: All rows from both tables");
  if (upperQuery.includes(" WHERE ")) explanations.push("WHERE: Filters rows based on condition");
  if (upperQuery.includes(" GROUP BY "))
    explanations.push("GROUP BY: Groups rows with same values");
  if (upperQuery.includes(" HAVING ")) explanations.push("HAVING: Filters groups after GROUP BY");
  if (upperQuery.includes(" ORDER BY ")) explanations.push("ORDER BY: Sorts result set");
  if (upperQuery.includes(" LIMIT ")) explanations.push("LIMIT: Restricts number of rows returned");
  if (upperQuery.includes(" UNION "))
    explanations.push("UNION: Combines result sets of two queries");
  if (upperQuery.includes(" SUBQUERY") || upperQuery.includes("("))
    explanations.push("Possible subquery detected");
  if (upperQuery.includes(" INDEX "))
    explanations.push("INDEX hint: Forces or suggests index usage");
  if (upperQuery.includes(" DISTINCT")) explanations.push("DISTINCT: Removes duplicate rows");

  const warnings: string[] = [];
  if (upperQuery.includes("SELECT *"))
    warnings.push("⚠️ SELECT * is inefficient — specify columns");
  if (!upperQuery.includes(" WHERE ") && upperQuery.startsWith("SELECT"))
    warnings.push("⚠️ No WHERE clause — full table scan");
  if (upperQuery.includes("LIKE '%"))
    warnings.push("⚠️ Leading wildcard LIKE prevents index usage");

  return `Query Analysis:\n${explanations.map((e) => `  ${e}`).join("\n")}\n\nWarnings:\n${warnings.map((w) => `  ${w}`).join("\n") || "  None"}`;
}

// ─── Data anonymizer ────────────────────────────────────────────────────────
export function dataAnonymizer(data: string, columnsToAnonymize: string): string {
  try {
    const lines = data.trim().split("\n");
    if (lines.length < 2) return "Need at least header + 1 row";
    const headers = lines[0].split(",").map((h) => h.trim());
    const cols = columnsToAnonymize.split(",").map((c) => c.trim());
    const rows = lines.slice(1).map((row) => {
      const values = row.split(",");
      cols.forEach((col) => {
        const idx = headers.indexOf(col);
        if (idx >= 0 && values[idx]) {
          values[idx] = `[REDACTED-${values[idx].length}]`;
        }
      });
      return values.join(",");
    });
    return [lines[0], ...rows].join("\n");
  } catch (err) {
    return `Error: ${(err as Error).message}`;
  }
}

// ─── Outlier detector ───────────────────────────────────────────────────────
export function outlierDetector(numbers: string, method: string): string {
  try {
    const nums = numbers
      .split(",")
      .map(Number)
      .filter((n) => !isNaN(n));
    if (nums.length < 4) return "Need at least 4 numbers";

    const sorted = [...nums].sort((a, b) => a - b);
    const q1 = sorted[Math.floor(sorted.length * 0.25)];
    const q3 = sorted[Math.floor(sorted.length * 0.75)];
    const iqr = q3 - q1;
    const lowerBound = q1 - 1.5 * iqr;
    const upperBound = q3 + 1.5 * iqr;

    const mean = nums.reduce((a, b) => a + b, 0) / nums.length;
    const stdDev = Math.sqrt(nums.reduce((a, b) => a + (b - mean) ** 2, 0) / nums.length);

    const useMethod = method || "iqr";
    let outliers: { value: number; index: number; reason: string }[] = [];

    if (useMethod === "iqr") {
      outliers = nums
        .map((n, i) => ({
          value: n,
          index: i,
          reason: n < lowerBound ? "below Q1-1.5*IQR" : n > upperBound ? "above Q3+1.5*IQR" : "",
        }))
        .filter((o) => o.reason);
    } else {
      // Z-score method
      outliers = nums
        .map((n, i) => ({
          value: n,
          index: i,
          reason:
            Math.abs((n - mean) / stdDev) > 2 ? `Z-score: ${((n - mean) / stdDev).toFixed(2)}` : "",
        }))
        .filter((o) => o.reason);
    }

    return JSON.stringify(
      {
        method: useMethod,
        total: nums.length,
        mean: mean.toFixed(2),
        stdDev: stdDev.toFixed(2),
        q1,
        q3,
        iqr,
        outliers,
      },
      null,
      2,
    );
  } catch (err) {
    return `Error: ${(err as Error).message}`;
  }
}

// ─── Correlation matrix ─────────────────────────────────────────────────────
export function correlationMatrix(data: string): string {
  try {
    const lines = data.trim().split("\n");
    const headers = lines[0].split(",").map((h) => h.trim());
    const rows = lines.slice(1).map((r) => r.split(",").map(Number));
    const cols = headers.length;
    const matrix: number[][] = Array(cols)
      .fill(0)
      .map(() => Array(cols).fill(0));

    for (let i = 0; i < cols; i++) {
      for (let j = 0; j < cols; j++) {
        const xi = rows.map((r) => r[i]);
        const xj = rows.map((r) => r[j]);
        const meanI = xi.reduce((a, b) => a + b, 0) / xi.length;
        const meanJ = xj.reduce((a, b) => a + b, 0) / xj.length;
        let num = 0,
          denomI = 0,
          denomJ = 0;
        for (let k = 0; k < xi.length; k++) {
          num += (xi[k] - meanI) * (xj[k] - meanJ);
          denomI += (xi[k] - meanI) ** 2;
          denomJ += (xj[k] - meanJ) ** 2;
        }
        matrix[i][j] = denomI && denomJ ? num / Math.sqrt(denomI * denomJ) : 0;
      }
    }

    const result: Record<string, Record<string, number>> = {};
    headers.forEach((h, i) => {
      result[h] = {};
      headers.forEach((h2, j) => {
        result[h][h2] = parseFloat(matrix[i][j].toFixed(3));
      });
    });
    return JSON.stringify(result, null, 2);
  } catch (err) {
    return `Error: ${(err as Error).message}`;
  }
}

// ─── Histogram generator ────────────────────────────────────────────────────
export function histogramGenerator(numbers: string, bins: number): string {
  try {
    const nums = numbers
      .split(",")
      .map(Number)
      .filter((n) => !isNaN(n));
    const useBins = bins || 10;
    const min = Math.min(...nums);
    const max = Math.max(...nums);
    const binSize = (max - min) / useBins || 1;
    const histogram: { range: string; count: number; bar: string }[] = [];

    for (let i = 0; i < useBins; i++) {
      const lo = min + i * binSize;
      const hi = lo + binSize;
      const count = nums.filter((n) => n >= lo && (i === useBins - 1 ? n <= hi : n < hi)).length;
      histogram.push({
        range: `[${lo.toFixed(1)} - ${hi.toFixed(1)})`,
        count,
        bar:
          "█".repeat(Math.ceil((count / Math.max(...histogram.map((h) => h.count), 1)) * 20)) ||
          "▏",
      });
    }
    return JSON.stringify({ bins: useBins, min, max, histogram }, null, 2);
  } catch (err) {
    return `Error: ${(err as Error).message}`;
  }
}

// ─── Scatter plot generator ─────────────────────────────────────────────────
export function scatterPlotGenerator(xValues: string, yValues: string): string {
  try {
    const x = xValues.split(",").map(Number);
    const y = yValues.split(",").map(Number);
    if (x.length !== y.length) return "X and Y must have same length";
    const xMin = Math.min(...x),
      xMax = Math.max(...x);
    const yMin = Math.min(...y),
      yMax = Math.max(...y);
    const points = x.map((xi, i) => ({ x: xi, y: y[i] }));
    const correlation = (() => {
      const mx = x.reduce((a, b) => a + b, 0) / x.length;
      const my = y.reduce((a, b) => a + b, 0) / y.length;
      let num = 0,
        dx = 0,
        dy = 0;
      for (let i = 0; i < x.length; i++) {
        num += (x[i] - mx) * (y[i] - my);
        dx += (x[i] - mx) ** 2;
        dy += (y[i] - my) ** 2;
      }
      return num / Math.sqrt(dx * dy);
    })();
    return JSON.stringify(
      {
        points: points.slice(0, 50),
        xRange: [xMin, xMax],
        yRange: [yMin, yMax],
        correlation: parseFloat(correlation.toFixed(3)),
      },
      null,
      2,
    );
  } catch (err) {
    return `Error: ${(err as Error).message}`;
  }
}

// ─── Time series decompose ──────────────────────────────────────────────────
export function timeSeriesDecompose(values: string, period: number): string {
  try {
    const data = values.split(",").map(Number);
    const p = period || 7;
    if (data.length < p * 2) return `Need at least ${p * 2} data points for period ${p}`;

    // Simple moving average for trend
    const trend: number[] = [];
    for (let i = 0; i < data.length; i++) {
      const start = Math.max(0, i - Math.floor(p / 2));
      const end = Math.min(data.length, i + Math.ceil(p / 2));
      const window = data.slice(start, end);
      trend.push(parseFloat((window.reduce((a, b) => a + b, 0) / window.length).toFixed(2)));
    }

    // Seasonal component
    const seasonal: number[] = [];
    for (let i = 0; i < data.length; i++) {
      seasonal.push(parseFloat((data[i] - trend[i]).toFixed(2)));
    }

    // Residual
    const residual = data.map((v, i) => parseFloat((v - trend[i] - seasonal[i]).toFixed(2)));

    return JSON.stringify(
      {
        period: p,
        trend: trend.slice(0, 20),
        seasonal: seasonal.slice(0, 20),
        residual: residual.slice(0, 20),
      },
      null,
      2,
    );
  } catch (err) {
    return `Error: ${(err as Error).message}`;
  }
}

// ─── Moving average calc ────────────────────────────────────────────────────
export function movingAverageCalc(values: string, window: number, type: string): string {
  try {
    const data = values.split(",").map(Number);
    const w = window || 5;
    const useType = type || "sma";
    const result: number[] = [];

    if (useType === "sma") {
      for (let i = w - 1; i < data.length; i++) {
        result.push(
          parseFloat((data.slice(i - w + 1, i + 1).reduce((a, b) => a + b, 0) / w).toFixed(2)),
        );
      }
    } else if (useType === "ema") {
      const k = 2 / (w + 1);
      let ema = data[0];
      for (let i = 0; i < data.length; i++) {
        ema = i === 0 ? data[0] : data[i] * k + ema * (1 - k);
        if (i >= w - 1) result.push(parseFloat(ema.toFixed(2)));
      }
    }

    return JSON.stringify(
      { type: useType, window: w, values: result.slice(0, 30), totalPoints: data.length },
      null,
      2,
    );
  } catch (err) {
    return `Error: ${(err as Error).message}`;
  }
}

// ─── Linear regression ──────────────────────────────────────────────────────
export function linearRegression(xValues: string, yValues: string): string {
  try {
    const x = xValues.split(",").map(Number);
    const y = yValues.split(",").map(Number);
    if (x.length !== y.length) return "X and Y must have same length";
    const n = x.length;
    const sumX = x.reduce((a, b) => a + b, 0);
    const sumY = y.reduce((a, b) => a + b, 0);
    const sumXY = x.reduce((a, xi, i) => a + xi * y[i], 0);
    const sumX2 = x.reduce((a, b) => a + b * b, 0);
    const slope = (n * sumXY - sumX * sumY) / (n * sumX2 - sumX * sumX);
    const intercept = (sumY - slope * sumX) / n;
    const r2 = (() => {
      const meanY = sumY / n;
      let ssRes = 0,
        ssTot = 0;
      for (let i = 0; i < n; i++) {
        ssRes += (y[i] - (slope * x[i] + intercept)) ** 2;
        ssTot += (y[i] - meanY) ** 2;
      }
      return 1 - ssRes / ssTot;
    })();
    return JSON.stringify(
      {
        slope: parseFloat(slope.toFixed(4)),
        intercept: parseFloat(intercept.toFixed(4)),
        r2: parseFloat(r2.toFixed(4)),
        equation: `y = ${slope.toFixed(4)}x + ${intercept.toFixed(4)}`,
      },
      null,
      2,
    );
  } catch (err) {
    return `Error: ${(err as Error).message}`;
  }
}

// ─── Hypothesis test ────────────────────────────────────────────────────────
export function hypothesisTest(sample1: string, sample2: string, testType: string): string {
  try {
    const s1 = sample1.split(",").map(Number);
    const s2 = sample2.split(",").map(Number);
    const useType = testType || "ttest";

    const mean = (arr: number[]) => arr.reduce((a, b) => a + b, 0) / arr.length;
    const variance = (arr: number[]) => {
      const m = mean(arr);
      return arr.reduce((a, b) => a + (b - m) ** 2, 0) / (arr.length - 1);
    };

    if (useType === "ttest") {
      const m1 = mean(s1),
        m2 = mean(s2);
      const v1 = variance(s1),
        v2 = variance(s2);
      const t = (m1 - m2) / Math.sqrt(v1 / s1.length + v2 / s2.length);
      const df = s1.length + s2.length - 2;
      return JSON.stringify(
        {
          test: "t-test",
          t: parseFloat(t.toFixed(4)),
          df,
          mean1: parseFloat(m1.toFixed(2)),
          mean2: parseFloat(m2.toFixed(2)),
          interpretation:
            Math.abs(t) > 2 ? "Significant difference likely" : "No significant difference",
        },
        null,
        2,
      );
    }

    return `Test type ${useType} not implemented. Available: ttest`;
  } catch (err) {
    return `Error: ${(err as Error).message}`;
  }
}

// ─── Confidence interval ────────────────────────────────────────────────────
export function confidenceInterval(values: string, confidence: number): string {
  try {
    const nums = values.split(",").map(Number);
    const conf = confidence || 95;
    const mean = nums.reduce((a, b) => a + b, 0) / nums.length;
    const stdDev = Math.sqrt(nums.reduce((a, b) => a + (b - mean) ** 2, 0) / (nums.length - 1));
    const zScores: Record<number, number> = { 90: 1.645, 95: 1.96, 99: 2.576 };
    const z = zScores[conf] || 1.96;
    const margin = z * (stdDev / Math.sqrt(nums.length));
    return JSON.stringify(
      {
        confidence: `${conf}%`,
        mean: parseFloat(mean.toFixed(2)),
        lowerBound: parseFloat((mean - margin).toFixed(2)),
        upperBound: parseFloat((mean + margin).toFixed(2)),
        margin: parseFloat(margin.toFixed(2)),
      },
      null,
      2,
    );
  } catch (err) {
    return `Error: ${(err as Error).message}`;
  }
}

// ─── Permutation generator ──────────────────────────────────────────────────
export function permutationGenerator(items: string, maxResults: number): string {
  try {
    const arr = items.split(",").map((s) => s.trim());
    const max = maxResults || 100;
    const results: string[] = [];
    const permute = (current: string[], remaining: string[]) => {
      if (results.length >= max) return;
      if (remaining.length === 0) {
        results.push(current.join(","));
        return;
      }
      for (let i = 0; i < remaining.length; i++) {
        permute([...current, remaining[i]], [...remaining.slice(0, i), ...remaining.slice(i + 1)]);
      }
    };
    permute([], arr);
    return JSON.stringify({ total: results.length, permutations: results }, null, 2);
  } catch (err) {
    return `Error: ${(err as Error).message}`;
  }
}

// ─── Combinatorics calc ─────────────────────────────────────────────────────
export function combinatoricsCalc(n: number, k: number, type: string): string {
  const factorial = (x: number): number => (x <= 1 ? 1 : x * factorial(x - 1));
  const useType = type || "combination";

  if (useType === "combination") {
    const result = factorial(n) / (factorial(k) * factorial(n - k));
    return `C(${n},${k}) = ${result}`;
  } else if (useType === "arrangement") {
    const result = factorial(n) / factorial(n - k);
    return `A(${n},${k}) = ${result}`;
  } else if (useType === "factorial") {
    return `${n}! = ${factorial(n)}`;
  }
  return `Unknown type: ${useType}`;
}
