/**
 * codeDevToolkit.ts — Code & Development utilities
 * Called by Quant (the AI brain) via tool handlers in agentToolsExtended.ts
 */

import { execSync } from "child_process";

// ─── Code complexity analyzer ───────────────────────────────────────────────
export function codeComplexityAnalyzer(code: string, language: string): string {
  const lines = code.split("\n");
  const codeLines = lines.filter(
    (l) => l.trim() && !l.trim().startsWith("//") && !l.trim().startsWith("#"),
  );
  const branches = (code.match(/\b(if|else|for|while|switch|case|catch|&&|\|\|)\b/g) || []).length;
  const functions = (
    code.match(/\b(function|def|func|void|int|public|private|protected)\s+\w+\s*\(/g) || []
  ).length;
  const cyclomatic = branches + 1;
  const grade =
    cyclomatic <= 5
      ? "A (Simple)"
      : cyclomatic <= 10
        ? "B (Moderate)"
        : cyclomatic <= 20
          ? "C (Complex)"
          : "D (Very Complex)";
  return JSON.stringify(
    {
      language: language || "unknown",
      totalLines: lines.length,
      codeLines: codeLines.length,
      branches,
      functions,
      cyclomaticComplexity: cyclomatic,
      grade,
    },
    null,
    2,
  );
}

// ─── Code format beautifier ─────────────────────────────────────────────────
export function codeFormatBeautifier(code: string, language: string): string {
  // Basic indentation beautifier
  let indent = 0;
  const indentSize = 2;
  const lines = code.split("\n");
  const formatted: string[] = [];
  for (const line of lines) {
    const trimmed = line.trim();
    if (trimmed.startsWith("}") || trimmed.startsWith("]") || trimmed.startsWith(")"))
      indent = Math.max(0, indent - 1);
    formatted.push(" ".repeat(indent * indentSize) + trimmed);
    if (trimmed.endsWith("{") || trimmed.endsWith("[") || trimmed.endsWith("(")) indent++;
  }
  return formatted.join("\n");
}

// ─── Code minifier ──────────────────────────────────────────────────────────
export function codeMinifier(code: string, language: string): string {
  const minified = code
    .replace(/\/\*[\s\S]*?\*\//g, "")
    .replace(/\/\/.*$/gm, "")
    .replace(/#.*$/gm, "")
    .replace(/\s+/g, " ")
    .replace(/\s*([{}();,:=<>+\-*/])\s*/g, "$1")
    .trim();
  const originalSize = code.length;
  const minifiedSize = minified.length;
  const reduction = ((1 - minifiedSize / originalSize) * 100).toFixed(1);
  return `${minified}\n\n--- ${originalSize} bytes -> ${minifiedSize} bytes (${reduction}% reduction) ---`;
}

// ─── Code diff unified ──────────────────────────────────────────────────────
export function codeDiffUnified(code1: string, code2: string): string {
  const lines1 = code1.split("\n");
  const lines2 = code2.split("\n");
  const maxLen = Math.max(lines1.length, lines2.length);
  const diff: string[] = [];
  for (let i = 0; i < maxLen; i++) {
    const l1 = lines1[i] || "";
    const l2 = lines2[i] || "";
    if (l1 === l2) {
      diff.push(`  ${l1}`);
    } else {
      if (l1) diff.push(`- ${l1}`);
      if (l2) diff.push(`+ ${l2}`);
    }
  }
  return diff.join("\n");
}

// ─── Code linter check ──────────────────────────────────────────────────────
export function codeLinterCheck(filePath: string, linter: string): string {
  try {
    let cmd: string;
    switch (linter) {
      case "eslint":
        cmd = `npx eslint ${filePath} --format json 2>&1 | head -50`;
        break;
      case "pylint":
        cmd = `pylint ${filePath} --output-format=json 2>&1 | head -50`;
        break;
      case "tsc":
        cmd = `npx tsc --noEmit ${filePath} 2>&1 | head -30`;
        break;
      default:
        cmd = `npx eslint ${filePath} --format json 2>&1 | head -50`;
    }
    const output = execSync(cmd, { timeout: 30_000, encoding: "utf8" }).trim();
    return output || "No lint errors found";
  } catch (err) {
    return `Error: ${(err as Error).message}`;
  }
}

// ─── Regex debugger ─────────────────────────────────────────────────────────
export function regexDebugger(pattern: string, testString: string): string {
  try {
    const re = new RegExp(pattern, "g");
    const explanation: string[] = [];
    // Basic regex explanation
    const tokens = pattern.match(/\\?.|[^\\]/g) || [];
    for (const token of tokens) {
      const explanations: Record<string, string> = {
        "^": "Start of string",
        $: "End of string",
        ".": "Any character",
        "*": "Zero or more",
        "+": "One or more",
        "?": "Zero or one",
        "\\d": "Digit [0-9]",
        "\\w": "Word character [a-zA-Z0-9_]",
        "\\s": "Whitespace",
        "\\b": "Word boundary",
        "[": "Character class start",
        "]": "Character class end",
        "(": "Capture group start",
        ")": "Capture group end",
        "|": "Alternation (OR)",
      };
      if (explanations[token]) explanation.push(`  ${token} -> ${explanations[token]}`);
    }
    const matches: string[] = [];
    let m: RegExpExecArray | null;
    while ((m = re.exec(testString)) !== null) {
      matches.push(
        `Match: "${m[0]}" at position ${m.index}${m.length > 1 ? ` (groups: ${m.slice(1).join(", ")})` : ""}`,
      );
      if (!re.global) break;
    }
    return `Pattern: /${pattern}/\n\nExplanation:\n${explanation.join("\n") || "  (complex pattern)"}\n\nMatches in test string:\n${matches.join("\n") || "  No matches"}`;
  } catch (err) {
    return `Error: ${(err as Error).message}`;
  }
}

// ─── API endpoint tester ────────────────────────────────────────────────────
export async function apiEndpointTester(
  url: string,
  method: string,
  headers: string,
  body: string,
): Promise<string> {
  try {
    const headerObj: Record<string, string> = {};
    if (headers) {
      headers.split(",").forEach((h) => {
        const [k, v] = h.split(":").map((s) => s.trim());
        if (k && v) headerObj[k] = v;
      });
    }
    const resp = await fetch(url, {
      method: method || "GET",
      headers: { "Content-Type": "application/json", ...headerObj },
      body: body || undefined,
      signal: AbortSignal.timeout(15000),
    });
    const respBody = await resp.text();
    return JSON.stringify(
      {
        status: resp.status,
        statusText: resp.statusText,
        headers: Object.fromEntries(resp.headers.entries()),
        body: respBody.slice(0, 500),
      },
      null,
      2,
    );
  } catch (err) {
    return `Error: ${(err as Error).message}`;
  }
}

// ─── JSON schema validate ───────────────────────────────────────────────────
export function jsonSchemaValidate(jsonStr: string, schemaStr: string): string {
  try {
    const data = JSON.parse(jsonStr);
    const schema = JSON.parse(schemaStr);
    const errors: string[] = [];
    const validate = (obj: any, schema: any, path: string): void => {
      if (schema.type) {
        if (schema.type === "object" && typeof obj !== "object")
          errors.push(`${path}: expected object, got ${typeof obj}`);
        if (schema.type === "array" && !Array.isArray(obj)) errors.push(`${path}: expected array`);
        if (schema.type === "string" && typeof obj !== "string")
          errors.push(`${path}: expected string`);
        if (schema.type === "number" && typeof obj !== "number")
          errors.push(`${path}: expected number`);
        if (schema.type === "boolean" && typeof obj !== "boolean")
          errors.push(`${path}: expected boolean`);
      }
      if (schema.required && typeof obj === "object") {
        for (const req of schema.required) {
          if (!(req in obj)) errors.push(`${path}: missing required property "${req}"`);
        }
      }
      if (schema.properties && typeof obj === "object") {
        for (const [key, subSchema] of Object.entries(schema.properties)) {
          if (key in obj) validate(obj[key], subSchema, `${path}.${key}`);
        }
      }
    };
    validate(data, schema, "$");
    return errors.length === 0
      ? "✅ Valid against schema"
      : `❌ Validation errors:\n${errors.map((e) => `  ${e}`).join("\n")}`;
  } catch (err) {
    return `Error: ${(err as Error).message}`;
  }
}

// ─── YAML validate ──────────────────────────────────────────────────────────
export function yamlValidate(yamlStr: string): string {
  try {
    // Basic YAML validation without external library
    const lines = yamlStr.split("\n");
    const valid = true;
    const errors: string[] = [];
    let lastIndent = -1;
    for (let i = 0; i < lines.length; i++) {
      const line = lines[i];
      if (!line.trim() || line.trim().startsWith("#")) continue;
      const indent = line.length - line.trimStart().length;
      if (lastIndent >= 0 && indent > lastIndent + 2)
        errors.push(`Line ${i + 1}: Indentation jump too large`);
      if (!line.trim().includes(":") && !line.trim().startsWith("-"))
        errors.push(`Line ${i + 1}: Missing colon or dash`);
      lastIndent = indent;
    }
    return errors.length === 0
      ? "✅ YAML appears valid"
      : `⚠️ Potential issues:\n${errors.map((e) => `  ${e}`).join("\n")}`;
  } catch (err) {
    return `Error: ${(err as Error).message}`;
  }
}

// ─── XML to JSON ────────────────────────────────────────────────────────────
export function xmlToJson(xmlStr: string): string {
  try {
    const result: any = {};
    const regex = /<(\w+)([^>]*)>([\s\S]*?)<\/\1>|<(\w+)([^>]*)\/>/g;
    let m: RegExpExecArray | null;
    while ((m = regex.exec(xmlStr)) !== null) {
      const tag = m[1] || m[4];
      const content = m[3]?.trim();
      if (content && !/<\//.test(content)) {
        result[tag] = content;
      } else if (content) {
        result[tag] = JSON.parse(xmlToJson(content));
      } else {
        result[tag] = null;
      }
    }
    return JSON.stringify(result, null, 2);
  } catch (err) {
    return `Error: ${(err as Error).message}`;
  }
}

// ─── SQL format beautify ────────────────────────────────────────────────────
export function sqlFormatBeautify(sql: string): string {
  const keywords = [
    "SELECT",
    "FROM",
    "WHERE",
    "JOIN",
    "INNER JOIN",
    "LEFT JOIN",
    "RIGHT JOIN",
    "FULL JOIN",
    "GROUP BY",
    "ORDER BY",
    "HAVING",
    "LIMIT",
    "UNION",
    "INSERT INTO",
    "VALUES",
    "UPDATE",
    "SET",
    "DELETE FROM",
    "CREATE TABLE",
    "ALTER TABLE",
    "DROP TABLE",
  ];
  let formatted = sql;
  for (const kw of keywords) {
    formatted = formatted.replace(new RegExp(`\\b${kw}\\b`, "gi"), kw);
  }
  for (const kw of [
    "FROM",
    "WHERE",
    "JOIN",
    "INNER JOIN",
    "LEFT JOIN",
    "RIGHT JOIN",
    "GROUP BY",
    "ORDER BY",
    "HAVING",
    "LIMIT",
    "UNION",
    "VALUES",
    "SET",
  ]) {
    formatted = formatted.replace(new RegExp(`\\s+${kw}\\b`, "gi"), `\n${kw}`);
  }
  formatted = formatted.replace(/,\s+/g, ",\n  ");
  return formatted.trim();
}

// ─── Dockerfile lint ────────────────────────────────────────────────────────
export function dockerfileLint(dockerfile: string): string {
  const lines = dockerfile.split("\n");
  const issues: string[] = [];
  const hasFrom = lines.some((l) => /^FROM\s/i.test(l.trim()));
  if (!hasFrom) issues.push("⚠️ Missing FROM instruction");
  const hasWorkdir = lines.some((l) => /^WORKDIR\s/i.test(l.trim()));
  if (!hasWorkdir) issues.push("⚠️ Consider using WORKDIR instead of cd");
  const usesLatest = lines.some((l) => /:latest/i.test(l.trim()));
  if (usesLatest) issues.push("⚠️ Avoid using :latest tag — pin specific versions");
  const rootUser = !lines.some((l) => /^USER\s/i.test(l.trim()));
  if (rootUser) issues.push("⚠️ No USER instruction — container runs as root");
  const hasHealthcheck = lines.some((l) => /^HEALTHCHECK\s/i.test(l.trim()));
  if (!hasHealthcheck) issues.push("ℹ️ Consider adding HEALTHCHECK instruction");
  return issues.length === 0 ? "✅ Dockerfile looks good" : issues.join("\n");
}

// ─── Changelog generator ────────────────────────────────────────────────────
export function changelogGenerator(commits: string, version: string): string {
  const commitList = commits.split("\n").filter(Boolean);
  const categories: Record<string, string[]> = {
    Features: [],
    "Bug Fixes": [],
    "Breaking Changes": [],
    Improvements: [],
    Other: [],
  };
  for (const commit of commitList) {
    const lower = commit.toLowerCase();
    if (lower.startsWith("feat:") || lower.startsWith("add:"))
      categories["Features"].push(commit.replace(/^(feat|add):\s*/i, ""));
    else if (lower.startsWith("fix:") || lower.startsWith("bugfix:"))
      categories["Bug Fixes"].push(commit.replace(/^(fix|bugfix):\s*/i, ""));
    else if (lower.startsWith("break:") || lower.startsWith("breaking:"))
      categories["Breaking Changes"].push(commit.replace(/^(break|breaking):\s*/i, ""));
    else if (
      lower.startsWith("refactor:") ||
      lower.startsWith("improve:") ||
      lower.startsWith("perf:")
    )
      categories["Improvements"].push(commit.replace(/^(refactor|improve|perf):\s*/i, ""));
    else categories["Other"].push(commit);
  }
  let output = `## ${version || "Unreleased"} (${new Date().toISOString().slice(0, 10)})\n\n`;
  for (const [cat, items] of Object.entries(categories)) {
    if (items.length > 0) {
      output += `### ${cat}\n`;
      items.forEach((item) => {
        output += `- ${item}\n`;
      });
      output += "\n";
    }
  }
  return output.trim();
}
