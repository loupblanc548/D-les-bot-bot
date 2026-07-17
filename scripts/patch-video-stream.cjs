/**
 * Patch @dank074/discord-video-stream to fix "frame.free is not a function" error.
 * node-av 5.x doesn't always provide a .free() method on frames.
 * This script wraps all frame.free() calls in a typeof check.
 */
const fs = require("fs");
const path = require("path");

const target = path.join(
  __dirname,
  "..",
  "node_modules",
  "@dank074",
  "discord-video-stream",
  "dist",
  "media",
  "BaseMediaStream.js",
);

if (!fs.existsSync(target)) {
  console.log("[patch] BaseMediaStream.js not found, skipping");
  process.exit(0);
}

let content = fs.readFileSync(target, "utf8");
const before = content;

// Replace all "frame.free();" with safe version
content = content.replace(
  /frame\.free\(\);/g,
  "if (typeof frame.free === 'function') { frame.free(); }",
);

if (content === before) {
  console.log("[patch] Already patched or no frame.free() found");
} else {
  fs.writeFileSync(target, content, "utf8");
  console.log("[patch] Patched frame.free() calls in BaseMediaStream.js");
}
