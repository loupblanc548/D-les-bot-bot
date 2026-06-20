import {
  Client,
  MessageEmbed,
  TextChannel,
} from "discord.js";
import { createClient } from "redis";

const redis = createClient({
  url: process.env.REDIS_URL || "redis://localhost:6379",
});

redis.on("error", (err: Error) => console.error("[Redis] Error:", err));
redis.connect().catch((err) => console.error("[Redis] Connect error:", err));

const DIAGNOSTIC_INTERVAL = 24 * 60 * 60 * 1000; // 24 heures

export function startSystemDiagnostic(client: Client): void {
  console.log("[SystemDiagnostic] Starting daily system diagnostic");

  setInterval(async () => {
    await runDiagnostic(client);
  }, DIAGNOSTIC_INTERVAL);

  runDiagnostic(client);
}

async function runDiagnostic(client: Client): Promise<void> {
  try {
    const startTime = Date.now();

    const memoryUsage = process.memoryUsage();
    const heapUsedMB = (memoryUsage.heapUsed / 1024 / 1024).toFixed(2);
    const heapTotalMB = (memoryUsage.heapTotal / 1024 / 1024).toFixed(2);
    const rssMB = (memoryUsage.rss / 1024 / 1024).toFixed(2);

    const uptime = process.uptime();
    const uptimeFormatted = formatUptime(uptime);

    const discordPing = client.ws.ping ? Math.round(client.ws.ping) : 0;

    const redisPingStart = Date.now();
    await redis.ping();
    const redisPing = Date.now() - redisPingStart;

    const diagnosticTime = Date.now() - startTime;

    const embed = new MessageEmbed()
      .setTitle("⚡ SYSTEM DIAGNOSTIC - JOHN HELLDIVER")
      .setDescription("```fix\nSYSTEM STATUS REPORT\n```")
      .addFields(
        {
          name: "💾 MEMORY USAGE",
          value: `\`\`\`diff\n+ Heap Used: ${heapUsedMB} MB\n+ Heap Total: ${heapTotalMB} MB\n+ RSS: ${rssMB} MB\n\`\`\``,
          inline: false,
        },
        {
          name: "⏱️ UPTIME",
          value: `\`\`\`diff\n+ ${uptimeFormatted}\n\`\`\``,
          inline: true,
        },
        {
          name: "📡 DISCORD LATENCY",
          value: `\`\`\`diff\n+ ${discordPing} ms\n\`\`\``,
          inline: true,
        },
        {
          name: "🔴 REDIS LATENCY",
          value: `\`\`\`diff\n+ ${redisPing} ms\n\`\`\``,
          inline: true,
        },
        {
          name: "⚙️ DIAGNOSTIC TIME",
          value: `\`\`\`diff\n+ ${diagnosticTime} ms\n\`\`\``,
          inline: true,
        },
      )
      .setColor(0x00ff41)
      .setFooter({ text: "Super Earth Command • System Monitoring" })
      .setTimestamp();

    const logChannelId = process.env.LOG_CHANNEL_ID;
    if (!logChannelId) {
      console.error("[SystemDiagnostic] LOG_CHANNEL_ID not defined");
      return;
    }

    const channel = await client.channels.fetch(logChannelId);
    if (!channel || !(channel instanceof TextChannel)) {
      console.error(`[SystemDiagnostic] Invalid log channel: ${logChannelId}`);
      return;
    }

    await channel.send({ embeds: [embed] });
    console.log("[SystemDiagnostic] Diagnostic report sent");
  } catch (error) {
    console.error("[SystemDiagnostic] Error:", error);
  }
}

function formatUptime(seconds: number): string {
  const days = Math.floor(seconds / (24 * 60 * 60));
  const hours = Math.floor((seconds % (24 * 60 * 60)) / (60 * 60));
  const minutes = Math.floor((seconds % (60 * 60)) / 60);

  if (days > 0) {
    return `${days}d ${hours}h ${minutes}m`;
  } else if (hours > 0) {
    return `${hours}h ${minutes}m`;
  } else {
    return `${minutes}m`;
  }
}
