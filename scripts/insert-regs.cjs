const fs = require("fs");
const f = "src/services/agentToolsExtended.ts";
let c = fs.readFileSync(f, "utf8");
const imp = fs.readFileSync("src/services/_new_imports.txt", "utf8");
const def = fs.readFileSync("src/services/_new_defs.txt", "utf8");
const sw = fs.readFileSync("src/services/_new_switch.txt", "utf8");
const hd = fs.readFileSync("src/services/_new_handlers.txt", "utf8");

// 1. Insert imports after googleCalendar import
const importMarker = 'import { listUpcomingEvents, createCalendarEvent } from "./googleCalendar.js";';
c = c.replace(importMarker, importMarker + "\n" + imp);

// 2. Insert tool defs before the closing '];' of EXTENDED_TOOLS
const dispIdx = c.indexOf("// ─── Dispatcher");
const closeIdx = c.lastIndexOf("];", dispIdx);
c = c.slice(0, closeIdx) + "  // ── NEW TOOLKITS (241 tools) ──\n" + def + c.slice(closeIdx);

// 3. Insert switch cases before 'default:' in the dispatcher
c = c.replace("      default:\n        return null;", "      // ── NEW TOOLKITS CASES ──\n" + sw + "      default:\n        return null;");

// 4. Append handler functions at end of file
c = c.trimEnd() + "\n\n// ─── NEW TOOLKIT HANDLERS (241 tools) ──────────────────────────────────────\n\n" + hd;

fs.writeFileSync(f, c);
console.log("Done. File size:", c.length);
