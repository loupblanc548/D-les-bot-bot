/**
 * autoRolePanel.ts — Panneaux "auto-role" à boutons
 *
 * Crée un embed dans un salon avec un bouton par rôle. Chaque clic
 * ajoute le rôle au membre s'il ne l'a pas, ou le retire sinon.
 *
 * - Discord limite à 5 boutons par ActionRow et 5 ActionRows par
 *   message (25 boutons max). On répartit automatiquement.
 * - L'identité du couple (panel, rôle) est portée par le `customId`
 *   `${AUTO_ROLE_PREFIX}:${panelId}:${roleId}`, facile à décoder
 *   depuis un ButtonInteraction.
 */

import {
  EmbedBuilder,
  ButtonBuilder,
  ButtonStyle,
  ActionRowBuilder,
  Guild,
  GuildMember,
} from "discord.js";
import logger from "../utils/logger.js";

// ─── Types ────────────────────────────────────────────────────────

export interface AutoRolePanelRole {
  roleId: string;
  label: string;
  emoji?: string;
}

export interface AutoRolePanel {
  id: string;
  guildId: string;
  channelId: string;
  messageId: string;
  title: string;
  roles: AutoRolePanelRole[];
}

interface AutoRolePanelEntry extends AutoRolePanel {}

// ─── Constantes ───────────────────────────────────────────────────

/** Préfixe des customId pour ne pas collisionner avec d'autres boutons. */
const AUTO_ROLE_PREFIX = "autoRole";
/** Limites imposées par Discord. */
const MAX_BUTTONS_PER_ROW = 5;
const MAX_ROWS_PER_MESSAGE = 5;

// ─── Store en mémoire ─────────────────────────────────────────────
// Clé = panelId. Suffisant car le panelId est unique côté application.
const panelsById = new Map<string, AutoRolePanelEntry>();

/**
 * Index secondaire `messageId → panelId` pour résoudre une interaction
 * sans devoir décoder le customId (plus rapide pour les routes chaudes).
 */
const panelIdByMessageId = new Map<string, string>();

// ─── API publique ─────────────────────────────────────────────────

/**
 * Crée un embed "auto-role" dans `channelId` avec un bouton par rôle.
 * Renvoie le panel persisté en mémoire après publication du message.
 *
 * Si `roles.length > 25`, on tronque et on log un warn — Discord refuse
 * davantage de boutons dans un seul message.
 */
export async function createPanel(
  guild: Guild,
  channelId: string,
  title: string,
  roles: AutoRolePanelRole[],
): Promise<AutoRolePanel | null> {
  if (!guild) {
    logger.warn("[autoRolePanel] guild invalide — création annulée");
    return null;
  }
  if (roles.length === 0) {
    logger.warn("[autoRolePanel] Aucun rôle fourni — création annulée");
    return null;
  }

  const effectiveRoles = roles.slice(0, MAX_BUTTONS_PER_ROW * MAX_ROWS_PER_MESSAGE);
  if (effectiveRoles.length < roles.length) {
    logger.warn(
      `[autoRolePanel] ${roles.length - effectiveRoles.length} rôle(s) ignoré(s) (limite Discord 25 boutons)`,
    );
  }

  const channel = guild.channels.cache.get(channelId);
  if (!channel || !channel.isTextBased()) {
    logger.warn(`[autoRolePanel] Salon ${channelId} introuvable ou non textuel`);
    return null;
  }

  const panelId = `${guild.id}-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
  const embed = buildEmbed(title, effectiveRoles);
  const rows = buildActionRows(panelId, effectiveRoles);
  const message = await channel.send({ embeds: [embed], components: rows });

  const panel: AutoRolePanelEntry = {
    id: panelId,
    guildId: guild.id,
    channelId,
    messageId: message.id,
    title,
    roles: effectiveRoles,
  };
  panelsById.set(panelId, panel);
  panelIdByMessageId.set(message.id, panelId);
  logger.info(
    `[autoRolePanel] Panel créé ${panelId} (${effectiveRoles.length} rôles) sur ${guild.name}`,
  );
  return panel;
}

/**
 * Toggle un rôle : ajoute si absent, retire si présent. À brancher sur
 * `interactionCreate` en filtrant sur les customId `autoRole:*`.
 *
 * @returns `true` si le rôle a été ajouté, `false` s'il a été retiré,
 *         `null` si l'interaction ne concerne pas un panel connu.
 */
export async function handleButtonInteraction(
  customId: string,
  member: GuildMember,
): Promise<boolean | null> {
  const decoded = decodeCustomId(customId);
  if (!decoded) return null;

  const panel = panelsById.get(decoded.panelId);
  if (!panel) {
    logger.debug(`[autoRolePanel] Panel ${decoded.panelId} introuvable en mémoire`);
    return null;
  }
  if (panel.guildId !== member.guild.id) {
    logger.warn("[autoRolePanel] Mismatch guild sur une interaction autoRole");
    return null;
  }
  if (!panel.roles.some((r) => r.roleId === decoded.roleId)) {
    logger.warn(
      `[autoRolePanel] Rôle ${decoded.roleId} absent du panel ${decoded.panelId}`,
    );
    return null;
  }

  const has = member.roles.cache.has(decoded.roleId);
  try {
    if (has) {
      await member.roles.remove(decoded.roleId);
      logger.info(
        `[autoRolePanel] Rôle ${decoded.roleId} retiré à ${member.user.tag}`,
      );
      return false;
    }
    await member.roles.add(decoded.roleId);
    logger.info(
      `[autoRolePanel] Rôle ${decoded.roleId} ajouté à ${member.user.tag}`,
    );
    return true;
  } catch (error) {
    logger.error(
      `[autoRolePanel] Échec toggle rôle ${decoded.roleId} pour ${member.user.tag}: ${
        error instanceof Error ? error.message : String(error)
      }`,
    );
    return null;
  }
}

/** Inspection utilitaire — utile pour les tests et dashboards. */
export function getPanelById(id: string): AutoRolePanel | null {
  return panelsById.get(id) ?? null;
}

export function getPanelByMessageId(messageId: string): AutoRolePanel | null {
  const id = panelIdByMessageId.get(messageId);
  return id ? (panelsById.get(id) ?? null) : null;
}

/** Reset complet (utile pour tests). */
export function clearPanels(): void {
  panelsById.clear();
  panelIdByMessageId.clear();
}

// ─── Helpers ──────────────────────────────────────────────────────

function buildEmbed(title: string, roles: AutoRolePanelRole[]): EmbedBuilder {
  return new EmbedBuilder()
    .setTitle(title)
    .setDescription(
      "Clique sur un bouton ci-dessous pour obtenir ou retirer le rôle correspondant.",
    )
    .setColor(0x5865f2)
    .addFields(
      ...roles.map((role) => ({
        name: `${role.emoji ?? "🎭"} ${role.label}`,
        value: `<@&${role.roleId}>`,
        inline: true,
      })),
    )
    .setTimestamp();
}

function buildActionRows(
  panelId: string,
  roles: AutoRolePanelRole[],
): ActionRowBuilder<ButtonBuilder>[] {
  const rows: ActionRowBuilder<ButtonBuilder>[] = [];
  for (let i = 0; i < roles.length; i += MAX_BUTTONS_PER_ROW) {
    const slice = roles.slice(i, i + MAX_BUTTONS_PER_ROW);
    const row = new ActionRowBuilder<ButtonBuilder>();
    for (const role of slice) {
      const button = new ButtonBuilder()
        .setCustomId(encodeCustomId(panelId, role.roleId))
        .setLabel(role.label)
        .setStyle(ButtonStyle.Primary);
      if (role.emoji) button.setEmoji(role.emoji);
      row.addComponents(button);
    }
    rows.push(row);
  }
  return rows;
}

function encodeCustomId(panelId: string, roleId: string): string {
  return `${AUTO_ROLE_PREFIX}:${panelId}:${roleId}`;
}

function decodeCustomId(
  customId: string,
): { panelId: string; roleId: string } | null {
  if (!customId.startsWith(`${AUTO_ROLE_PREFIX}:`)) return null;
  const parts = customId.split(":");
  if (parts.length !== 3) return null;
  return { panelId: parts[1], roleId: parts[2] };
}
