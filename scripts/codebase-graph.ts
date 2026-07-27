/**
 * codebase-graph.ts — Generate a knowledge graph of the codebase
 *
 * Scans all TypeScript files, extracts exports, imports, classes, functions,
 * and their relationships. Outputs a JSON file that can be visualized in
 * any graph viewer (D3.js, Cytoscape, etc.) or used for codebase understanding.
 *
 * Inspired by Understand-Anything (Egonex-AI) but self-contained for the bot.
 */

import { readdirSync, readFileSync, statSync } from "node:fs";
import { join, relative, extname } from "node:path";
import { writeFileSync } from "node:fs";

interface GraphNode {
  id: string;
  type: "file" | "function" | "class" | "interface" | "type" | "export";
  name: string;
  filePath: string;
  line?: number;
}

interface GraphEdge {
  source: string;
  target: string;
  type: "imports" | "calls" | "exports" | "implements" | "extends";
}

interface KnowledgeGraph {
  nodes: GraphNode[];
  edges: GraphEdge[];
  stats: {
    totalFiles: number;
    totalFunctions: number;
    totalClasses: number;
    totalInterfaces: number;
    totalImports: number;
  };
}

const SRC_DIR = join(process.cwd(), "src");
const OUTPUT_FILE = join(process.cwd(), ".codebase-graph.json");

function scanDirectory(dir: string): string[] {
  const files: string[] = [];
  try {
    const entries = readdirSync(dir);
    for (const entry of entries) {
      const fullPath = join(dir, entry);
      const stat = statSync(fullPath);
      if (stat.isDirectory()) {
        if (entry === "node_modules" || entry === ".git") continue;
        files.push(...scanDirectory(fullPath));
      } else if (extname(entry) === ".ts" && !entry.endsWith(".test.ts")) {
        files.push(fullPath);
      }
    }
  } catch {
    // ignore
  }
  return files;
}

function extractFromFile(filePath: string): { nodes: GraphNode[]; edges: GraphEdge[] } {
  const content = readFileSync(filePath, "utf-8");
  const relPath = relative(SRC_DIR, filePath);
  const fileId = `file:${relPath}`;
  const nodes: GraphNode[] = [{ id: fileId, type: "file", name: relPath, filePath: relPath }];
  const edges: GraphEdge[] = [];

  const lines = content.split("\n");

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];

    // Export functions
    const funcMatch = line.match(/export\s+(?:async\s+)?function\s+(\w+)/);
    if (funcMatch) {
      const name = funcMatch[1];
      const nodeId = `fn:${relPath}:${name}`;
      nodes.push({ id: nodeId, type: "function", name, filePath: relPath, line: i + 1 });
      edges.push({ source: fileId, target: nodeId, type: "exports" });
    }

    // Export classes
    const classMatch = line.match(/export\s+class\s+(\w+)/);
    if (classMatch) {
      const name = classMatch[1];
      const nodeId = `cls:${relPath}:${name}`;
      nodes.push({ id: nodeId, type: "class", name, filePath: relPath, line: i + 1 });
      edges.push({ source: fileId, target: nodeId, type: "exports" });
    }

    // Export interfaces
    const ifaceMatch = line.match(/export\s+interface\s+(\w+)/);
    if (ifaceMatch) {
      const name = ifaceMatch[1];
      const nodeId = `iface:${relPath}:${name}`;
      nodes.push({ id: nodeId, type: "interface", name, filePath: relPath, line: i + 1 });
      edges.push({ source: fileId, target: nodeId, type: "exports" });
    }

    // Export types
    const typeMatch = line.match(/export\s+type\s+(\w+)/);
    if (typeMatch) {
      const name = typeMatch[1];
      const nodeId = `type:${relPath}:${name}`;
      nodes.push({ id: nodeId, type: "type", name, filePath: relPath, line: i + 1 });
      edges.push({ source: fileId, target: nodeId, type: "exports" });
    }

    // Import statements
    const importMatch = line.match(/import\s+.*from\s+["']\.\/([^"']+)["']/);
    if (importMatch) {
      const importPath = importMatch[1];
      const targetFile = importPath.endsWith(".js") ? importPath : `${importPath}.ts`;
      edges.push({
        source: fileId,
        target: `file:${targetFile}`,
        type: "imports",
      });
    }
  }

  return { nodes, edges };
}

function generateGraph(): KnowledgeGraph {
  const files = scanDirectory(SRC_DIR);
  const allNodes: GraphNode[] = [];
  const allEdges: GraphEdge[] = [];

  for (const file of files) {
    const { nodes, edges } = extractFromFile(file);
    allNodes.push(...nodes);
    allEdges.push(...edges);
  }

  return {
    nodes: allNodes,
    edges: allEdges,
    stats: {
      totalFiles: files.length,
      totalFunctions: allNodes.filter((n) => n.type === "function").length,
      totalClasses: allNodes.filter((n) => n.type === "class").length,
      totalInterfaces: allNodes.filter((n) => n.type === "interface").length,
      totalImports: allEdges.filter((e) => e.type === "imports").length,
    },
  };
}

const graph = generateGraph();
writeFileSync(OUTPUT_FILE, JSON.stringify(graph, null, 2));
console.log(
  `[Codebase Graph] Generated: ${graph.stats.totalFiles} files, ${graph.stats.totalFunctions} functions, ${graph.stats.totalClasses} classes, ${graph.stats.totalInterfaces} interfaces, ${graph.stats.totalImports} imports`,
);
console.log(`[Codebase Graph] Output: ${OUTPUT_FILE}`);
