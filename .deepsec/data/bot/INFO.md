# bot

> Discord bot (TypeScript/Node.js) with 17 command groups, 150+ subcommands.
> Uses Discord.js v14, Prisma/PostgreSQL, OpenRouter AI, external APIs.

## What this codebase does

Discord moderation & gaming bot. Stack: TypeScript, discord.js v14, Prisma (PostgreSQL), Redis (rate limiting), OpenRouter (AI chat). Electron desktop-app for admin panel. External APIs: Twitch, YouTube, Steam, Epic, Reddit, Open-Meteo, GitHub, Speedrun.com — all keyless or env-configured. Serves multiple Discord guilds with per-guild config stored in DB.

## Auth shape

- config.ownerId — supreme bot owner, bypasses all permission checks
- getPermissionLevel(member) — returns enum PermissionLevel (OWNER/ADMIN/MODERATOR/USER)
- PermissionFlagsBits from discord.js used on slash command definitions (setDefaultMemberPermissions)
- checkRateLimit(userId, type, guildId, userRoles) — per-user/guild rate limiting with admin bypass
- sanitizeMentions(text) / sanitizeMassMentions(text) — strips @everyone/@here and role mentions from user input
- loadEnv() — Zod-validated env loading, throws on missing required vars
- Token-based auth for external APIs stored in env vars, never hardcoded

## Threat model

1. **Malicious Discord user** injecting mentions/links in bot responses (XSS-like via Discord markdown) — highest impact
2. **Prompt injection** via user messages reaching OpenRouter AI — could leak system prompt or produce harmful output
3. **API key leakage** — secrets in env vars, but could leak through error messages or logs
4. **Privilege escalation** — user exploiting command routing to access admin/mod commands
5. **DB injection** — Prisma parameterized queries mitigate, but raw query building could be risky

## Project-specific patterns to flag

- **Command routing**: commandRouter.ts maps command names to handlers via egisterGroup(). Check that all routes enforce permission checks before executing
- **AI prompt injection**: src/commands/ai.ts sends user messages to OpenRouter. User input reaches the LLM prompt — check for system prompt leakage or jailbreak vectors
- **Stub handlers**: src/commands/stubHandlers.ts has placeholder implementations for 100+ subcommands. Many use interaction.guild?. without null checks — potential crash vectors
- **Free APIs**: src/services/freeApis.ts makes HTTP requests to external APIs without response validation. Check for SSRF via user-provided URLs (weather city, IP info, GitHub search)
- **Desktop app**: desktop-app/ is an Electron app — check for 
odeIntegration, contextIsolation settings, IPC message validation

## Known false-positives

- stubHandlers.ts — intentionally minimal implementations, many catch {} blocks are placeholders
- shadow.ts — OSINT commands that intentionally make external HTTP requests to public APIs (whois, DNS, headers) — this is by design
- reeApis.ts — URL construction from user input is intentional (weather, IP, GitHub) but should validate/sanitize
- commandRouter.ts — Object.defineProperty(interaction,  commandName, ...) is intentional remapping for legacy handler compatibility
- desktop-app/preload.js — exposes IPC APIs to renderer; this is the intended Electron bridge pattern
