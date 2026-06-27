/**
 * clean-duplicates.ts — Commande /clean-duplicates
 *
 * Slash Command d'administration qui scanne le salon actuel,
 * detecte les messages en doublon (par URL ou contenu identique)
 * et les supprime pour ne garder que le plus ancien.
 *
 * Securite : strictement reserve aux Administrateurs du serveur
 * ou au proprietaire du bot (PermissionFlagsBits.Administrator).
 */

import {
  SlashCommandBuilder,
  ChatInputCommandInteraction,
  EmbedBuilder,
  PermissionFlagsBits,
  TextChannel,
  Collection,
  Message,
} from "discord.js";
import logger from "../utils/logger.js";
import { requireAdmin } from "../services/permissions.js";
import { LoadingAnimation } from "../utils/loadingAnimation.js";

// ─── Definition Slash Command ──────────────────────────────────────────────

export const commands = [
  new SlashCommandBuilder()
    .setName("clean-duplicates")
    .setDescription(
      "🧹 Analyse le salon et supprime tous les messages en doublon (Admin uniquement)",
    )
    .setDefaultMemberPermissions(PermissionFlagsBits.Administrator)
    .toJSON(),
];

// ─── Types ─────────────────────────────────────────────────────────────────

interface DuplicateGroup {
  key: string;
  oldest: Message;
  duplicates: Message[];
}

// ─── Helpers ───────────────────────────────────────────────────────────────

function extractDedupKey(msg: Message): string {
  const urlMatch = msg.content.match(/https?:\/\/[^\s]+/);
  if (urlMatch) {
    return urlMatch[0].replace(/[?&](utm_|fbclid|ref|source|tracking)=[^&\s]*/gi, "");
  }
  return msg.content.trim().replace(/\s+/g, " ").toLowerCase();
}

function isOlderThan14Days(msg: Message): boolean {
  const ageMs = Date.now() - msg.createdTimestamp;
  return ageMs > 14 * 24 * 60 * 60 * 1000;
}

// ─── Handler Principal ─────────────────────────────────────────────────────

async function handleCleanDuplicates(interaction: ChatInputCommandInteraction): Promise<void> {
  const isAdmin = await requireAdmin(interaction);
  if (!isAdmin) return;

  const anim = new LoadingAnimation(interaction, "🔍 Analyse des doublons");
  await anim.start();

  const channel = interaction.channel;
  if (!channel || !channel.isTextBased()) {
    await anim.stop("❌ Cette commande ne peut etre utilisee que dans un salon textuel.");
    return;
  }

  const textChannel = channel as TextChannel;

  try {
    const messages: Collection<string, Message> = await textChannel.messages.fetch({ limit: 100 });

    if (messages.size < 2) {
      await anim.stop("✅ Le salon contient moins de 2 messages — aucun doublon possible.");
      return;
    }

    await anim.update(30, `${messages.size} messages analysés`);
    const groups = new Map<string, DuplicateGroup>();

    for (const [, msg] of messages) {
      if (msg.author.id === interaction.client.user?.id) continue;
      const key = extractDedupKey(msg);
      if (!key) continue;

      const existing = groups.get(key);
      if (!existing) {
        groups.set(key, { key, oldest: msg, duplicates: [] });
      } else {
        if (msg.createdTimestamp < existing.oldest.createdTimestamp) {
          existing.duplicates.push(existing.oldest);
          existing.oldest = msg;
        } else {
          existing.duplicates.push(msg);
        }
      }
    }

    // Collecter tous les doublons
    const allDuplicates: Message[] = [];
    for (const [, group] of groups) {
      allDuplicates.push(...group.duplicates);
    }

    await anim.update(60, `${allDuplicates.length} doublon(s) detecté(s)`);

    if (allDuplicates.length === 0) {
      await anim.stop(
        "✅ Aucun doublon detecte parmi les 100 derniers messages. Le salon est propre !",
      );
      return;
    }

    // Separer recents (< 14j) et anciens (>= 14j)
    const recent: Message[] = [];
    const old: Message[] = [];
    for (const dup of allDuplicates) {
      if (isOlderThan14Days(dup)) old.push(dup);
      else recent.push(dup);
    }

    let deletedCount = 0;

    // Bulk delete pour les recents
    if (recent.length > 0) {
      try {
        const bulkDeleted = await textChannel.bulkDelete(recent, true);
        deletedCount += bulkDeleted.size;
        logger.info(`[CleanDuplicates] Bulk delete: ${bulkDeleted.size} messages`);
      } catch (err) {
        logger.error(
          `[CleanDuplicates] Echec bulkDelete: ${err instanceof Error ? err.message : String(err)}`,
        );
      }
    }

    await anim.update(80, `Suppression: ${deletedCount}/${allDuplicates.length}`);
    if (old.length > 0) {
      for (const msg of old) {
        try {
          await msg.delete();
          deletedCount++;
          await new Promise((resolve) => setTimeout(resolve, 500));
        } catch (_err) {
          logger.debug(`[CleanDuplicates] Echec suppression message ${msg.id}`);
        }
      }
    }

    // Bilan final
    const embed = new EmbedBuilder()
      .setColor(0x00ff88)
      .setTitle("🧹 Nettoyage termine !")
      .setDescription(
        `J'ai analyse les **100 derniers messages** et supprime **${deletedCount} doublon(s)**.\nLe salon est maintenant propre !`,
      )
      .setFooter({
        text: `Cles de doublons detectees : ${[...groups.values()].filter((g) => g.duplicates.length > 0).length}`,
      })
      .setTimestamp();

    await anim.stop(embed);
  } catch (error) {
    logger.error(
      `[CleanDuplicates] Erreur critique: ${error instanceof Error ? error.message : String(error)}`,
      { stack: error instanceof Error ? error.stack : undefined },
    );
    await anim.stop("❌ Une erreur est survenue pendant le nettoyage.");
  }
}

// ─── Dispatcher ────────────────────────────────────────────────────────────

export async function handleCommand(interaction: ChatInputCommandInteraction): Promise<void> {
  const { commandName } = interaction;
  switch (commandName) {
    case "clean-duplicates":
      await handleCleanDuplicates(interaction);
      break;
  }
}
