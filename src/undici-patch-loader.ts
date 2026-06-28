// ESM loader for undici-patch.cjs
// Ensures the patch runs before any other module that might use fetch/Headers.
// When loaded via --require (npm start / Docker), the CJS patch runs first.
// When loaded via tsx/npx directly, this ESM side-effect import runs first
// because it's the first import in index.ts (ESM evaluates depth-first, left-to-right).
import { createRequire } from "module";
const __require = createRequire(import.meta.url);
__require("./undici-patch.cjs");
