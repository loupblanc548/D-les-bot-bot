import fs from "node:fs";
import path from "node:path";

const STATE_FILE = path.join("/tmp", "bot-last-fortnite-shop.json");

let lastPostedShopDate: string | null = loadLastPosted();

function loadLastPosted(): string | null {
  try {
    if (!fs.existsSync(STATE_FILE)) return null;
    const raw = JSON.parse(fs.readFileSync(STATE_FILE, "utf-8")) as { date?: string };
    return raw.date || null;
  } catch {
    return null;
  }
}

export function getLastPostedShopDate(): string | null {
  return lastPostedShopDate;
}

export function saveLastPostedShopDate(date: string): void {
  lastPostedShopDate = date;
  try {
    fs.writeFileSync(STATE_FILE, JSON.stringify({ date }), "utf-8");
  } catch {
    // non-critical
  }
}
