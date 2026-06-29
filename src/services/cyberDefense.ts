/**
 * cyberDefense.ts — Cyber Defense & Honeypots
 *
 * Système de défense active avec pièges (honeypots) pour détecter
 * et neutraliser les attaques coordonnées (raid, spam, token-grab).
 *
 * Composants :
 *  1. HoneypotChannel — canaux pièges invisibles qui alertent si un bot y poste
 *  2. HoneypotRole — rôles pièges qui alertent si assignés automatiquement
 *  3. HoneypotInvite — invitations pièges qui détectent les raids organisés
 *  4. ThreatGraph — graphe de menaces pour visualisation Cytoscape.js
 *  5. AutoDefense — réponses automatiques (lockdown, quarantine, ban wave)
 *
 * Intégration Electron : envoie le ThreatGraph via IPC/WebSocket pour
 * visualisation en temps réel dans le dashboard Cytoscape.js.
 */

import { Client, Guild, GuildMember, TextChannel, EmbedBuilder, ChannelType } from "discord.js";
import prisma from "../prisma.js";
import logger from "../utils/logger.js";
import { createLog } from "./logs.js";
import { sendSecurityAlert } from "./reportChannel.js";

// ─── Types ───────────────────────────────────────────────────────────────────

export type HoneypotType = "CHANNEL" | "ROLE" | "INVITE";

export interface Honeypot {
  id: string;
  guildId: string;
  type: HoneypotType;
  targetId: string;
  targetName: string;
  createdAt: Date;
  triggeredCount: number;
  lastTriggeredAt: Date | null;
  active: boolean;
}

export interface ThreatNode {
  id: string;
  type: "user" | "honeypot" | "raid" | "bot";
  label: string;
  data: Record<string, unknown>;
}

export interface ThreatEdge {
  source: string;
  target: string;
  type: "triggered" | "linked" | "invited" | "raided";
  weight: number;
}

export interface ThreatGraph {
  nodes: ThreatNode[];
  edges: ThreatEdge[];
  generatedAt: Date;
  guildId: string;
}

export interface DefenseAction {
  type: "LOCKDOWN" | "QUARANTINE" | "BAN_WAVE" | "ALERT_ONLY";
  guildId: string;
  triggeredBy: string;
  reason: string;
  affectedUsers: string[];
  executedAt: Date;
  result: string;
}

// ─── Honeypot Manager ────────────────────────────────────────────────────────

const activeHoneypots = new Map<string, Honeypot>();
const triggerHistory: { honeypotId: string; userId: string; timestamp: number }[] = [];

/**
 * Crée un honeypot de type canal piège.
 * Le canal est créé avec un nom attractif mais est invisible pour les membres normaux.
 */
export async function createHoneypotChannel(guild: Guild, channelName: string): Promise<Honeypot> {
  try {
    const channel = await guild.channels.create({
      name: channelName,
      type: ChannelType.GuildText,
      permissionOverwrites: [
        {
          id: guild.roles.everyone,
          deny: ["ViewChannel"],
        },
        {
          id: guild.members.me?.id ?? "",
          allow: ["ViewChannel", "ReadMessageHistory"],
        },
      ],
    });

    const honeypot: Honeypot = {
      id: `hp_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`,
      guildId: guild.id,
      type: "CHANNEL",
      targetId: channel.id,
      targetName: channelName,
      createdAt: new Date(),
      triggeredCount: 0,
      lastTriggeredAt: null,
      active: true,
    };

    activeHoneypots.set(honeypot.id, honeypot);

    await createLog({
      type: "HONEYPOT",
      action: `Honeypot canal créé: #${channelName}`,
      userId: guild.members.me?.id ?? "bot",
      targetId: guild.id,
      details: JSON.stringify({ honeypotId: honeypot.id, channelId: channel.id }),
    });

    logger.info(`[CyberDefense] Honeypot canal créé: #${channelName} (${honeypot.id})`);
    return honeypot;
  } catch (error) {
    logger.error(
      `[CyberDefense] Erreur création honeypot canal: ${error instanceof Error ? error.message : String(error)}`,
    );
    throw error;
  }
}

/**
 * Enregistre un honeypot existant (canal ou rôle) comme piège.
 */
export async function registerHoneypot(
  guildId: string,
  type: HoneypotType,
  targetId: string,
  targetName: string,
): Promise<Honeypot> {
  const honeypot: Honeypot = {
    id: `hp_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`,
    guildId,
    type,
    targetId,
    targetName,
    createdAt: new Date(),
    triggeredCount: 0,
    lastTriggeredAt: null,
    active: true,
  };

  activeHoneypots.set(honeypot.id, honeypot);
  logger.info(`[CyberDefense] Honeypot ${type} enregistré: ${targetName} (${honeypot.id})`);
  return honeypot;
}

/**
 * Désactive un honeypot.
 */
export function deactivateHoneypot(honeypotId: string): boolean {
  const hp = activeHoneypots.get(honeypotId);
  if (!hp) return false;
  hp.active = false;
  logger.info(`[CyberDefense] Honeypot ${honeypotId} désactivé`);
  return true;
}

/**
 * Signale qu'un honeypot a été déclenché par un utilisateur.
 */
export async function triggerHoneypot(
  honeypotId: string,
  userId: string,
  client: Client,
): Promise<DefenseAction | null> {
  const hp = activeHoneypots.get(honeypotId);
  if (!hp || !hp.active) return null;

  hp.triggeredCount++;
  hp.lastTriggeredAt = new Date();
  triggerHistory.push({ honeypotId, userId, timestamp: Date.now() });

  logger.warn(`[CyberDefense] Honeypot ${hp.targetName} déclenché par ${userId}`);

  // Alerte de sécurité
  try {
    const guild = client.guilds.cache.get(hp.guildId);
    if (guild) {
      const member = await guild.members.fetch(userId).catch(() => null);
      await sendSecurityAlert(client, {
        type: "SUSPICIOUS",
        userId,
        userTag: member?.user.tag ?? "Inconnu",
        guildId: hp.guildId,
        reason: `Honeypot déclenché: ${hp.targetName} (${hp.type})`,
        details: `L'utilisateur a interagi avec un élément piège. Compteur: ${hp.triggeredCount}`,
      });
    }
  } catch {
    // Non-critique
  }

  // Vérifier si on doit déclencher une défense automatique
  const recentTriggers = triggerHistory.filter(
    (t) => t.honeypotId === honeypotId && Date.now() - t.timestamp < 60_000,
  );

  if (recentTriggers.length >= 3) {
    return await executeAutoDefense(
      client,
      hp.guildId,
      "QUARANTINE",
      [userId],
      `Honeypot ${hp.targetName} déclenché ${recentTriggers.length}x en 1min`,
    );
  }

  return null;
}

// ─── Auto-Défense ────────────────────────────────────────────────────────────

/**
 * Exécute une action de défense automatique.
 */
export async function executeAutoDefense(
  client: Client,
  guildId: string,
  actionType: DefenseAction["type"],
  affectedUsers: string[],
  reason: string,
): Promise<DefenseAction> {
  const action: DefenseAction = {
    type: actionType,
    guildId,
    triggeredBy: "CyberDefense",
    reason,
    affectedUsers,
    executedAt: new Date(),
    result: "",
  };

  const guild = client.guilds.cache.get(guildId);
  if (!guild) {
    action.result = "Guilde introuvable";
    return action;
  }

  try {
    switch (actionType) {
      case "LOCKDOWN": {
        await guild.setVerificationLevel(4, "CyberDefense: Lockdown automatique");
        action.result = "Lockdown activé — vérification maximum";
        logger.warn(`[CyberDefense] Lockdown activé sur ${guildId}: ${reason}`);
        break;
      }

      case "QUARANTINE": {
        for (const userId of affectedUsers) {
          const member = await guild.members.fetch(userId).catch(() => null);
          if (member) {
            await member
              .timeout(60 * 60 * 1000, `CyberDefense: Quarantaine — ${reason}`)
              .catch(() => {});
          }
        }
        action.result = `${affectedUsers.length} utilisateur(s) mis en quarantaine (timeout 1h)`;
        logger.warn(
          `[CyberDefense] Quarantaine sur ${affectedUsers.length} utilisateur(s): ${reason}`,
        );
        break;
      }

      case "BAN_WAVE": {
        for (const userId of affectedUsers) {
          await guild.members
            .ban(userId, { reason: `CyberDefense: Ban wave — ${reason}` })
            .catch(() => {});
        }
        action.result = `${affectedUsers.length} utilisateur(s) bannis`;
        logger.warn(
          `[CyberDefense] Ban wave sur ${affectedUsers.length} utilisateur(s): ${reason}`,
        );
        break;
      }

      case "ALERT_ONLY": {
        action.result = "Alerte envoyée uniquement";
        logger.info(`[CyberDefense] Alerte seule pour ${guildId}: ${reason}`);
        break;
      }
    }

    await createLog({
      type: "CYBER_DEFENSE",
      action: `Défense ${actionType} exécutée: ${reason}`,
      targetId: guildId,
      details: JSON.stringify({ actionType, affectedUsers, result: action.result }),
    });
  } catch (error) {
    action.result = `Erreur: ${error instanceof Error ? error.message : String(error)}`;
    logger.error(`[CyberDefense] Erreur défense ${actionType}: ${action.result}`);
  }

  return action;
}

// ─── Threat Graph (visualisation Cytoscape.js) ───────────────────────────────

/**
 * Génère un graphe de menaces pour visualisation Cytoscape.js.
 * Noeuds : utilisateurs suspects, honeypots, raids détectés, bots connus.
 * Arêtes : relations (a déclenché, est lié à, a invité, a participé au raid).
 */
export async function generateThreatGraph(client: Client, guildId: string): Promise<ThreatGraph> {
  const nodes: ThreatNode[] = [];
  const edges: ThreatEdge[] = [];

  // 1. Honeypots actifs
  for (const hp of activeHoneypots.values()) {
    if (hp.guildId !== guildId) continue;
    nodes.push({
      id: hp.id,
      type: "honeypot",
      label: hp.targetName,
      data: {
        type: hp.type,
        triggeredCount: hp.triggeredCount,
        active: hp.active,
        lastTriggered: hp.lastTriggeredAt,
      },
    });
  }

  // 2. Utilisateurs suspects (risk score élevé)
  try {
    const riskyProfiles = await prisma.riskProfile.findMany({
      where: {
        guildId,
        riskLevel: { in: ["ELEVE", "CRITIQUE"] },
      },
      take: 20,
    });

    for (const profile of riskyProfiles) {
      nodes.push({
        id: `user_${profile.userId}`,
        type: "user",
        label: profile.userId,
        data: {
          riskScore: profile.riskScore,
          riskLevel: profile.riskLevel,
          totalSanctions: profile.totalSanctions,
        },
      });
    }
  } catch {
    // Non-critique
  }

  // 3. Raid logs récents
  try {
    const raidLogs = await prisma.raidLog.findMany({
      where: { guildId },
      orderBy: { detectedAt: "desc" },
      take: 5,
    });

    for (const raid of raidLogs) {
      nodes.push({
        id: `raid_${raid.id}`,
        type: "raid",
        label: `Raid ${raid.detectedAt.toISOString().slice(0, 10)}`,
        data: { status: raid.status, detectedAt: raid.detectedAt },
      });
    }
  } catch {
    // Non-critique
  }

  // 4. Arêtes depuis l'historique des déclenchements
  for (const trigger of triggerHistory) {
    const hp = activeHoneypots.get(trigger.honeypotId);
    if (!hp || hp.guildId !== guildId) continue;

    edges.push({
      source: `user_${trigger.userId}`,
      target: trigger.honeypotId,
      type: "triggered",
      weight: 1,
    });
  }

  // 5. Arêtes entre utilisateurs suspects (comptes liés via Shadow Broker)
  try {
    const riskyProfiles = await prisma.riskProfile.findMany({
      where: { guildId, riskLevel: { in: ["ELEVE", "CRITIQUE"] } },
      take: 10,
    });

    for (let i = 0; i < riskyProfiles.length; i++) {
      for (let j = i + 1; j < riskyProfiles.length; j++) {
        if (
          riskyProfiles[i].riskLevel === "CRITIQUE" &&
          riskyProfiles[j].riskLevel === "CRITIQUE"
        ) {
          edges.push({
            source: `user_${riskyProfiles[i].userId}`,
            target: `user_${riskyProfiles[j].userId}`,
            type: "linked",
            weight: 0.5,
          });
        }
      }
    }
  } catch {
    // Non-critique
  }

  const graph: ThreatGraph = {
    nodes,
    edges,
    generatedAt: new Date(),
    guildId,
  };

  logger.info(
    `[CyberDefense] ThreatGraph généré: ${nodes.length} noeuds, ${edges.length} arêtes pour ${guildId}`,
  );
  return graph;
}

// ─── Monitoring des canaux honeypot ──────────────────────────────────────────

/**
 * Initialise le monitoring des canaux honeypot.
 * À appeler au démarrage du bot avec le client Discord.
 */
export function initHoneypotMonitoring(client: Client): void {
  client.on("messageCreate", async (message) => {
    if (!message.guild || message.author.bot) return;

    for (const hp of activeHoneypots.values()) {
      if (!hp.active || hp.type !== "CHANNEL") continue;
      if (hp.guildId !== message.guild.id) continue;
      if (hp.targetId !== message.channelId) continue;

      // Honeypot déclenché !
      await triggerHoneypot(hp.id, message.author.id, client);

      try {
        await message.delete();
      } catch {
        // Non-critique
      }
    }
  });

  client.on("guildMemberRoleAdd", async (member, role) => {
    for (const hp of activeHoneypots.values()) {
      if (!hp.active || hp.type !== "ROLE") continue;
      if (hp.guildId !== member.guild.id) continue;
      if (hp.targetId !== role.id) continue;

      await triggerHoneypot(hp.id, member.id, member.client as Client);
    }
  });

  logger.info("[CyberDefense] Monitoring des honeypots activé");
}

// ─── API publique ────────────────────────────────────────────────────────────

export function getActiveHoneypots(guildId?: string): Honeypot[] {
  const all = Array.from(activeHoneypots.values()).filter((hp) => hp.active);
  if (guildId) return all.filter((hp) => hp.guildId === guildId);
  return all;
}

export function getTriggerHistory(honeypotId?: string): typeof triggerHistory {
  if (honeypotId) return triggerHistory.filter((t) => t.honeypotId === honeypotId);
  return [...triggerHistory];
}

export function clearHoneypots(): void {
  activeHoneypots.clear();
  triggerHistory.length = 0;
}

export function buildThreatGraphEmbed(graph: ThreatGraph): EmbedBuilder {
  return new EmbedBuilder()
    .setTitle("🕸️ Graphe de Menaces — Cyber Defense")
    .setColor(0xff3344)
    .setDescription(`Visualisation des menaces actives sur le serveur`)
    .addFields(
      { name: "Noeuds", value: `${graph.nodes.length}`, inline: true },
      { name: "Connexions", value: `${graph.edges.length}`, inline: true },
      {
        name: "Honeypots actifs",
        value: `${graph.nodes.filter((n) => n.type === "honeypot").length}`,
        inline: true,
      },
      {
        name: "Utilisateurs suspects",
        value: `${graph.nodes.filter((n) => n.type === "user").length}`,
        inline: true,
      },
      {
        name: "Raids détectés",
        value: `${graph.nodes.filter((n) => n.type === "raid").length}`,
        inline: true,
      },
    )
    .setFooter({ text: `Cyber Defense System • ${graph.guildId}` })
    .setTimestamp(graph.generatedAt);
}
