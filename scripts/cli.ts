#!/usr/bin/env node
/**
 * Unified CLI tool for code generation and file modifications
 * Replaces Python scripts with a single Node.js CLI
 */

import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

interface Manifest {
  operations: Operation[];
}

interface Operation {
  type: "write" | "modify" | "insert";
  file: string;
  content?: string;
  pattern?: string;
  replacement?: string;
  insertBefore?: string;
  insertAfter?: string;
}

function loadManifest(manifestPath: string): Manifest {
  const content = fs.readFileSync(manifestPath, "utf-8");
  return JSON.parse(content);
}

function writeOperation(op: Operation): void {
  if (!op.content) throw new Error("Write operation requires content");
  const dir = path.dirname(op.file);
  fs.mkdirSync(dir, { recursive: true });
  fs.writeFileSync(op.file, op.content, "utf-8");
  console.log(`✓ Written: ${op.file}`);
}

function modifyOperation(op: Operation): void {
  if (!op.pattern || !op.replacement) {
    throw new Error("Modify operation requires pattern and replacement");
  }
  const content = fs.readFileSync(op.file, "utf-8");
  const newContent = content.replace(new RegExp(op.pattern, "g"), op.replacement);
  fs.writeFileSync(op.file, newContent, "utf-8");
  console.log(`✓ Modified: ${op.file}`);
}

function insertOperation(op: Operation): void {
  if (!op.content) throw new Error("Insert operation requires content");
  const content = fs.readFileSync(op.file, "utf-8");
  let newContent: string;

  if (op.insertBefore) {
    const idx = content.indexOf(op.insertBefore);
    if (idx === -1) throw new Error(`Pattern not found: ${op.insertBefore}`);
    newContent = content.slice(0, idx) + op.content + content.slice(idx);
  } else if (op.insertAfter) {
    const idx = content.indexOf(op.insertAfter);
    if (idx === -1) throw new Error(`Pattern not found: ${op.insertAfter}`);
    newContent =
      content.slice(0, idx + op.insertAfter.length) +
      op.content +
      content.slice(idx + op.insertAfter.length);
  } else {
    throw new Error("Insert operation requires insertBefore or insertAfter");
  }

  fs.writeFileSync(op.file, newContent, "utf-8");
  console.log(`✓ Inserted into: ${op.file}`);
}

function executeManifest(manifest: Manifest): void {
  for (const op of manifest.operations) {
    try {
      switch (op.type) {
        case "write":
          writeOperation(op);
          break;
        case "modify":
          modifyOperation(op);
          break;
        case "insert":
          insertOperation(op);
          break;
        default:
          throw new Error(`Unknown operation type: ${(op as any).type}`);
      }
    } catch (error) {
      console.error(`✗ Error executing operation on ${op.file}:`, error);
      process.exit(1);
    }
  }
  console.log("\n✅ All operations completed successfully");
}

// CLI interface
const args = process.argv.slice(2);
if (args.length === 0) {
  console.log("Usage: node scripts/cli.ts <manifest.json>");
  console.log("\nExample manifests:");
  console.log("  - scripts/manifests/add-fortnite.json");
  console.log("  - scripts/manifests/generate-tests.json");
  process.exit(1);
}

const manifestPath = args[0];
if (!fs.existsSync(manifestPath)) {
  console.error(`Manifest not found: ${manifestPath}`);
  process.exit(1);
}

const manifest = loadManifest(manifestPath);
executeManifest(manifest);
