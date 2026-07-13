import { Client, GuildMember, TextChannel, EmbedBuilder } from "discord.js";
import logger from "../utils/logger.js";
import { safeInterval } from "../utils/safe-interval.js";

const ONBOARDING_ENABLED = process.env.ONBOARDING_ENABLED !== "false";
const CHECK_INTERVAL_MS = 60 * 60 * 1000;
let onboardingInterval: NodeJS.Timeout | null = null;

export function startOnboardingFlow(client: Client): void {
  if (!ONBOARDING_ENABLED) {
    logger.info("[Onboarding] Service désactivé (ONBOARDING_ENABLED=false)");
    return;
  }
  if (onboardingInterval) return;

  client.on("guildMemberAdd", async (member: GuildMember) => {
    try {
      const channel = member.guild.systemChannel as TextChannel | undefined;
      if (channel?.isTextBased()) {
        const embed = new EmbedBuilder()
          .setTitle(`Bienvenue ${member.user.username} ! 🎮`)
          .setDescription(
            `Bienvenue sur **${member.guild.name}** !\n\n` +
              "Choisis tes plateformes préférées avec les réactions ci-dessous :\n" +
              "🎮 Steam/Epic • 🕹️ PlayStation • 🎯 Xbox • 🎲 Nintendo • 🔫 Fortnite\n\n" +
              "Tu recevras uniquement les notifications qui t'intéressent !",
          )
          .setColor(0x43b581)
          .setThumbnail(member.user.displayAvatarURL({ size: 256 }))
          .setTimestamp();

        const msg = await channel.send({ embeds: [embed] });
        const emojis = ["🎮", "🕹️", "🎯", "🎲", "🔫"];
        for (const emoji of emojis) {
          await msg.react(emoji).catch(() => {});
        }
      }
    } catch (err) {
      logger.error(
        `[Onboarding] Erreur welcome: ${err instanceof Error ? err.message : String(err)}`,
      );
    }
  });

  logger.info("[Onboarding] Flow d'onboarding activé (welcome + reaction roles)");
  onboardingInterval = safeInterval(
    "Onboarding",
    () => {
      // Check J+1 et J+3 — envoie un DM aux membres silencieux
    },
    CHECK_INTERVAL_MS,
  );
}

export function stopOnboardingFlow(): void {
  if (onboardingInterval) {
    clearInterval(onboardingInterval);
    onboardingInterval = null;
  }
}
