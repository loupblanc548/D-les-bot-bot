/**
 * serverRules.ts — Application automatique du règlement du serveur
 *
 * Règles automatisées :
 * 1. Publicité → détection invitations Discord + liens sociaux
 * 2. Mentions → blocage @everyone/@here
 * 3. Soundboard → détection Voicemod/apps externes en vocal
 * 4. Profil → vérification pseudo à l'entrée
 *
 * Note: Le word filter est géré exclusivement via /security word-filter (manuel).
 */

import { Message, TextChannel, ChannelType, GuildMember, EmbedBuilder } from "discord.js";
import logger from "../utils/logger.js";
import { config } from "../config.js";

// ─── 2. Anti-publicité ────────────────────────────────────────────────────────

const DISCORD_INVITE_REGEX =
  /(?:https?:\/\/)?(?:www\.)?(?:discord\.gg|discord\.com\/invite|dis\.gg)\/([a-zA-Z0-9-]+)/gi;
const SOCIAL_LINK_REGEX =
  /(?:https?:\/\/)?(?:www\.)?(?:twitter\.com|x\.com|instagram\.com|tiktok\.com|facebook\.com|snapchat\.com|twitch\.tv\/videos|youtube\.com\/@|youtu\.be)\/[a-zA-Z0-9_-]+/gi;

/**
 * Détecte la publicité dans un message (invitations Discord + liens sociaux).
 */
export function detectAdvertising(content: string): { type: string; match: string } | null {
  const inviteMatch = content.match(DISCORD_INVITE_REGEX);
  if (inviteMatch) {
    return { type: "discord_invite", match: inviteMatch[0] };
  }

  const socialMatch = content.match(SOCIAL_LINK_REGEX);
  if (socialMatch) {
    return { type: "social_link", match: socialMatch[0] };
  }

  return null;
}

// ─── 3. Anti-mentions @everyone/@here ──────────────────────────────────────────

const EVERYONE_HERE_REGEX = /@(everyone|here)/gi;

/**
 * Détecte les tentatives de mention @everyone ou @here.
 */
export function detectMassMention(content: string): string | null {
  const match = content.match(EVERYONE_HERE_REGEX);
  return match ? match[0] : null;
}

// ─── 4. Anti-soundboard (Voicemod et apps externes) ─────────────────────────────

const KNOWN_SOUNDBOARD_APPS = [
  "voicemod",
  "soundpad",
  "clownfish",
  "morphvox",
  "voxal",
  "rovecaster",
];

/**
 * Détecte si un membre utilise une application de soundboard externe.
 * Vérifie le statut de streaming et les activités.
 */
export function detectSoundboardApp(member: GuildMember): boolean {
  // Vérifier les activités du membre
  const activities = member.presence?.activities;
  if (!activities) return false;

  for (const activity of activities) {
    const name = activity.name.toLowerCase();
    if (KNOWN_SOUNDBOARD_APPS.some((app) => name.includes(app))) {
      return true;
    }
  }

  return false;
}

// ─── 5. Vérification de profil à l'entrée ───────────────────────────────────────

const INAPPROPRIATE_NAME_PATTERNS = [
  /n[i1]gg[ae3]r?/i,
  /f[a4]gg?[o0]t/i,
  /n[a4]z[i1]/i,
  /h[i1]tl[e3]r/i,
  /c[o0]nn[a4]rd/i,
  /[e3]ncul[e3]/i,
  /p[e3]d[e3]/i,
  /s[a4]l[o0]p[e3]/i,
  /put[e3]/i,
];

/**
 * Vérifie si un pseudo est inapproprié selon le règlement.
 */
export function isInappropriateName(name: string): boolean {
  const lower = name.toLowerCase();
  return INAPPROPRIATE_NAME_PATTERNS.some((pattern) => pattern.test(lower));
}

/**
 * Vérifie le profil d'un nouveau membre et prend des actions si nécessaire.
 */
export async function checkMemberProfile(member: GuildMember): Promise<void> {
  const displayName = member.displayName;
  const username = member.user.username;

  // Vérifier le pseudo
  if (isInappropriateName(displayName) || isInappropriateName(username)) {
    try {
      await member.setNickname(null, "AutoMod: pseudo inapproprié selon le règlement");
      logger.info(
        `[ServerRules] Pseudo inapproprié détecté pour ${member.user.tag} — réinitialisé`,
      );

      // Avertir dans le salon général
      const generalChannel = member.guild.channels.cache.get("1134242473334554774");
      if (generalChannel?.type === ChannelType.GuildText) {
        const warnMsg = await (generalChannel as TextChannel).send({
          content: `⚠️ ${member}, ton pseudo a été réinitialisé car il ne respecte pas le règlement. Merci de choisir un pseudo approprié.`,
        });
        setTimeout(() => warnMsg.delete().catch(() => {}), 10000);
      }
    } catch (error) {
      logger.error("[ServerRules] Erreur reset pseudo:", error);
    }
  }
}

// ─── Application globale des règles sur un message ──────────────────────────────

/**
 * Applique toutes les règles du règlement sur un message.
 * Retourne true si le message a été traité (et ne doit pas être traité plus loin).
 */
export async function enforceServerRules(message: Message): Promise<boolean> {
  if (!message.guild || message.author.bot) return false;

  // Ignorer les admins
  if (message.member?.permissions?.has("Administrator" as any)) return false;

  const content = message.content;
  let violated = false;

  // ─── Règle 6: Publicité ───
  const ad = detectAdvertising(content);
  if (ad) {
    await message.delete().catch(() => {});
    if (message.channel.type === ChannelType.GuildText) {
      const warnMsg = await (message.channel as TextChannel).send({
        content: `⚠️ ${message.author}, la publicité est interdite sur ce serveur (règlement).`,
      });
      setTimeout(() => warnMsg.delete().catch(() => {}), 5000);
    }

    await logRuleViolation(message, "Publicité", ad.match);
    violated = true;
  }

  // ─── Règle 8: Mentions @everyone/@here ───
  const mention = detectMassMention(content);
  if (mention) {
    await message.delete().catch(() => {});
    if (message.channel.type === ChannelType.GuildText) {
      const warnMsg = await (message.channel as TextChannel).send({
        content: `⚠️ ${message.author}, les mentions @everyone et @here sont interdites (règlement).`,
      });
      setTimeout(() => warnMsg.delete().catch(() => {}), 5000);
    }

    await logRuleViolation(message, "Mention de masse", mention);
    violated = true;
  }

  return violated;
}

// ─── Logging des violations ─────────────────────────────────────────────────────

async function logRuleViolation(message: Message, rule: string, detail: string): Promise<void> {
  try {
    const logChannelId = config.logChannel;
    if (!logChannelId) return;

    const channel = message.guild!.channels.cache.get(logChannelId);
    if (!channel?.isTextBased()) return;

    const embed = new EmbedBuilder()
      .setTitle("🚨 Violation du règlement")
      .setColor(0xff3344)
      .setTimestamp()
      .addFields(
        { name: "Règle", value: rule, inline: true },
        {
          name: "Utilisateur",
          value: `${message.author.tag} (\`${message.author.id}\`)`,
          inline: true,
        },
        { name: "Salon", value: `<#${message.channelId}>`, inline: true },
        { name: "Détail", value: `\`${detail}\`` },
        { name: "Message (extrait)", value: message.content.slice(0, 500) || "(vide)" },
      );

    await (channel as TextChannel).send({ embeds: [embed] });
  } catch (error) {
    logger.error("[ServerRules] Erreur log violation:", error);
  }
}

// ─── Détection soundboard en vocal ──────────────────────────────────────────────

/**
 * Vérifie les membres en vocal pour l'utilisation de soundboards externes.
 * À appeler sur voiceStateUpdate.
 */
export async function checkVoiceSoundboard(member: GuildMember): Promise<void> {
  if (!member.voice.channel) return;

  if (detectSoundboardApp(member)) {
    try {
      // Déconnecter le membre du vocal
      await member.voice.disconnect("Utilisation de soundboard externe interdite (règlement)");
      logger.info(`[ServerRules] ${member.user.tag} déconnecté pour soundboard externe`);

      // Avertir dans le salon général
      const generalChannel = member.guild.channels.cache.get("1134242473334554774");
      if (generalChannel?.type === ChannelType.GuildText) {
        const warnMsg = await (generalChannel as TextChannel).send({
          content: `⚠️ ${member}, les soundboards externes (Voicemod, etc.) sont interdits en vocal (règlement).`,
        });
        setTimeout(() => warnMsg.delete().catch(() => {}), 10000);
      }
    } catch (error) {
      logger.error("[ServerRules] Erreur déconnexion soundboard:", error);
    }
  }
}
