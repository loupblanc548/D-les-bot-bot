import {
  SlashCommandBuilder,
  EmbedBuilder,
  ChatInputCommandInteraction,
} from "discord.js";
import logger from "../utils/logger.js";
import { prisma } from "../prisma.js";
import redis from "../utils/redis.js";

export const commands = [
  new SlashCommandBuilder()
    .setName("healthz")
    .setDescription("V\u00e9rifie la connectivit\u00e9 aux services critiques (BD, Redis)")
    .toJSON(),
];

interface CheckResult {
  name: string;
  ok: boolean;
  detail: string;
  latencyMs: number;
}

async function checkDatabase(): Promise<CheckResult> {
  const start = Date.now();
  try {
    await prisma.$queryRaw`SELECT 1`;
    return {
      name: "PostgreSQL",
      ok: true,
      detail: "OK",
      latencyMs: Date.now() - start,
    };
  } catch (error) {
    return {
      name: "PostgreSQL",
      ok: false,
      detail: error instanceof Error ? error.message.slice(0, 80) : "inconnu",
      latencyMs: Date.now() - start,
    };
  }
}

async function checkRedis(): Promise<CheckResult> {
  const start = Date.now();
  try {
    if (!redis) {
      return { name: "Redis", ok: false, detail: "non initialis\u00e9", latencyMs: 0 };
    }
    const pong = await redis.ping();
    return {
      name: "Redis",
      ok: pong === "PONG",
      detail: pong === "PONG" ? "PONG re\u00e7u" : `r\u00e9ponse inattendue: ${pong}`,
      latencyMs: Date.now() - start,
    };
  } catch (error) {
    return {
      name: "Redis",
      ok: false,
      detail: error instanceof Error ? error.message.slice(0, 80) : "inconnu",
      latencyMs: Date.now() - start,
    };
  }
}

export async function handleCommand(
  interaction: ChatInputCommandInteraction,
): Promise<void> {
  const [db, rd] = await Promise.all([checkDatabase(), checkRedis()]);
  const checks = [db, rd];
  const failed = checks.filter((c) => !c.ok);

  const embed = new EmbedBuilder()
    .setTitle(
      failed.length === 0
        ? "\u2705 Healthcheck: tous les services sont OK"
        : `\u274c Healthcheck: ${failed.length} service(s) en \u00e9chec`,
    )
    .setColor(failed.length === 0 ? 0x57f287 : 0xed4245)
    .setTimestamp(new Date());

  for (const c of checks) {
    embed.addFields({
      name: `${c.ok ? "\ud83d\udfe2" : "\ud83d\udd34"} ${c.name}`,
      value: `${c.detail} \u2014 ${c.latencyMs} ms`,
      inline: false,
    });
  }

  logger.info("event", {
      cmd: "healthz",
      user: interaction.user.id,
      results: checks.map((c) => ({ name: c.name, ok: c.ok, ms: c.latencyMs })),
    },
    "/healthz invoked",
  );
  await interaction.reply({ embeds: [embed], ephemeral: true });
}
