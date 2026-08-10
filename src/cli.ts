#!/usr/bin/env node
/**
 * CLI admin tool for Discord Bot
 * Usage: npx tsx src/cli.ts <command>
 *
 * Commands:
 *   db:push        - Push Prisma schema to database
 *   db:generate    - Generate Prisma client
 *   register       - Register Discord slash commands
 *   check-llm      - Check local LLM availability
 *   health         - Run health checks
 *   rotate-secret  - Print secret rotation instructions
 */

import { execSync } from "child_process";

const command = process.argv[2];

const commands: Record<string, () => void> = {
  "db:push": () => {
    console.log("📦 Pushing Prisma schema...");
    execSync("npx prisma db push", { stdio: "inherit" });
    console.log("✅ Schema pushed");
  },

  "db:generate": () => {
    console.log("📦 Generating Prisma client...");
    execSync("npx prisma generate", { stdio: "inherit" });
    console.log("✅ Prisma client generated");
  },

  register: () => {
    console.log("📝 Registering Discord slash commands...");
    execSync("node --import tsx src/index.ts --register", { stdio: "inherit" });
    console.log("✅ Commands registered");
  },

  "check-llm": async () => {
    const url = process.env.LOCAL_LLM_URL || "http://127.0.0.1:11434";
    console.log(`🔍 Checking LLM at ${url}...`);
    try {
      const res = await fetch(`${url}/v1/models`);
      if (res.ok) {
        const data = await res.json() as any;
        console.log("✅ LLM available. Models:", data.models?.map((m: any) => m.name).join(", ") || "none");
      } else {
        console.log("❌ LLM responded with status:", res.status);
      }
    } catch (err) {
      console.log("❌ LLM not reachable:", err instanceof Error ? err.message : String(err));
    }
  },

  health: () => {
    console.log("🏥 Running health checks...");
    execSync("node --import tsx -e \"import('./src/services/healthcheck.js').then(h => h.runHealthCheck())\"", { stdio: "inherit" });
  },

  "rotate-secret": () => {
    console.log(`
🔐 Secret Rotation Instructions
================================

1. DISCORD_TOKEN
   - Go to https://discord.com/developers/applications
   - Select bot → Token → Reset Token
   - Update DISCORD_TOKEN in .env
   - Restart: docker compose restart bot

2. DATABASE_URL (Neon)
   - Neon Console → Branch → Reset password
   - Update DATABASE_URL in .env
   - Restart: docker compose restart bot

3. TELEGRAM_BOT_TOKEN
   - @BotFather → /revoke → select bot
   - Update TELEGRAM_BOT_TOKEN in .env
   - Restart: docker compose restart bot

4. OPENROUTER_API_KEY
   - https://openrouter.ai/keys → Create new key
   - Update OPENROUTER_API_KEY in .env
   - Restart: docker compose restart bot

5. GROQ_API_KEY
   - https://console.groq.com/keys → Create new key
   - Update GROQ_API_KEY in .env
   - Restart: docker compose restart bot

⚠️  After rotation, verify with: npm run cli -- health
`);
  },
};

if (!command || !commands[command]) {
  console.log("Usage: npx tsx src/cli.ts <command>");
  console.log("");
  console.log("Commands:");
  Object.keys(commands).forEach(cmd => console.log(`  ${cmd}`));
  process.exit(1);
}

commands[command]();
