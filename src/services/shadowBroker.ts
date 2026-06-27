/**
 * shadowBroker.ts — Shadow Broker Intelligence Engine
 *
 * Collecte et analyse d'intelligence sur les membres du serveur :
 *  - Profiling d'activité (messages, vocal, connexion, patterns)
 *  - Détection d'alt-accounts (corrélation de comportement, avatars, noms)
 *  - Cartographie des liens entre membres (interactions, mentions communes)
 *  - Détection de patterns suspects (activité anormale, coordination)
 *
 * Mode stealth : alertes en DM uniquement, aucun log visible dans le serveur.
 */

import { Client, GuildMember, EmbedBuilder, User } from "discord.js";
import prisma from "../prisma.js";
import logger from "../utils/logger.js";
import { config } from "../config.js";

// ─── Types ───────────────────────────────────────────────────────────────────

export interface MemberIntel {
  userId: string;
  tag: string;
  avatarUrl: string;
  accountCreatedAt: Date;
  joinedAt: Date | null;
  roles: string[];
  activityScore: number;
  messageCount: number;
  sanctionCount: number;
  riskScore: number;
  riskLevel: string;
  nameChanges: number;
  avatarChanges: number;
  lastActive: Date | null;
  suspiciousFlags: string[];
  linkedAccounts: LinkedAccount[];
}

export interface LinkedAccount {
  userId: string;
  tag: string;
  confidence: number;
  reasons: string[];
}

export interface MemberNetwork {
  userId: string;
  tag: string;
  connections: NetworkConnection[];
}

export interface NetworkConnection {
  targetId: string;
  targetTag: string;
  strength: number;
  reasons: string[];
}

export interface SuspiciousPattern {
  type: string;
  severity: "low" | "medium" | "high" | "critical";
  description: string;
  userId: string;
  userTag: string;
  detectedAt: Date;
}

// ─── Stealth Mode ────────────────────────────────────────────────────────────

const stealthMode = new Map<string, boolean>(); // guildId -> enabled

export function isStealthEnabled(guildId: string): boolean {
  return stealthMode.get(guildId) ?? false;
}

export function enableStealth(guildId: string): void {
  stealthMode.set(guildId, true);
  logger.info(`[ShadowBroker] Mode stealth activé pour ${guildId}`);
}

export function disableStealth(guildId: string): void {
  stealthMode.set(guildId, false);
  logger.info(`[ShadowBroker] Mode stealth désactivé pour ${guildId}`);
}

// ─── Alertes DM (stealth) ────────────────────────────────────────────────────

export async function sendStealthAlert(
  client: Client,
  title: string,
  description: string,
  color: number = 0x00ff41,
): Promise<void> {
  try {
    const owner = await client.users.fetch(config.ownerId);
    if (!owner) return;
    const embed = new EmbedBuilder()
      .setTitle(`🕵️ [Shadow Broker] ${title}`)
      .setDescription(description)
      .setColor(color)
      .setTimestamp();
    await owner.send({ embeds: [embed] });
  } catch {
    // DM might be closed
    logger.warn("[ShadowBroker] Impossible d'envoyer l'alerte DM stealth");
  }
}

// ─── Intelligence : Profiling membre ─────────────────────────────────────────

export async function getMemberIntel(member: GuildMember): Promise<MemberIntel> {
  const userId = member.id;
  const guildId = member.guild.id;

  // Données parallèles
  const [nameHistory, avatarHistory, sanctions, logs, riskProfile, commandLogs] = await Promise.all(
    [
      prisma.nameHistory.findMany({
        where: { userId, guildId },
        orderBy: { changedAt: "desc" },
        take: 50,
      }),
      prisma.avatarHistory.findMany({
        where: { userId, guildId },
        orderBy: { changedAt: "desc" },
        take: 50,
      }),
      prisma.sanction.findMany({
        where: { userId, guildId },
        orderBy: { createdAt: "desc" },
        take: 50,
      }),
      prisma.log.findMany({
        where: { userId },
        orderBy: { createdAt: "desc" },
        take: 100,
      }),
      prisma.riskProfile.findUnique({
        where: { userId_guildId: { userId, guildId } },
      }),
      prisma.commandLog.findMany({
        where: { userId },
        orderBy: { timestamp: "desc" },
        take: 100,
      }),
    ],
  );

  // Calcul du score d'activité
  const recentLogs = logs.filter(
    (l) => Date.now() - l.createdAt.getTime() < 7 * 24 * 60 * 60 * 1000,
  );
  const recentCommands = commandLogs.filter(
    (c) => Date.now() - c.timestamp.getTime() < 7 * 24 * 60 * 60 * 1000,
  );
  const activityScore = recentLogs.length + recentCommands.length * 2;

  // Détection de flags suspects
  const suspiciousFlags: string[] = [];
  const accountAgeDays = (Date.now() - member.user.createdTimestamp) / (1000 * 60 * 60 * 24);

  if (accountAgeDays < 7) suspiciousFlags.push("⚠️ Compte très récent (< 7 jours)");
  if (accountAgeDays < 30) suspiciousFlags.push("⚠️ Compte récent (< 30 jours)");
  if (nameHistory.length > 5)
    suspiciousFlags.push(`🔄 ${nameHistory.length} changements de pseudo`);
  if (avatarHistory.length > 5)
    suspiciousFlags.push(`🖼️ ${avatarHistory.length} changements d'avatar`);
  if (sanctions.length >= 3) suspiciousFlags.push(`⚖️ ${sanctions.length} sanctions`);
  if (riskProfile?.riskLevel === "CRITIQUE") suspiciousFlags.push("🔴 Niveau de risque CRITIQUE");
  if (riskProfile?.riskLevel === "ELEVE") suspiciousFlags.push("🟠 Niveau de risque ÉLEVÉ");

  // Pas d'avatar par défaut
  if (!member.user.avatar) suspiciousFlags.push("👻 Aucun avatar personnalisé");

  // Activité nulle mais présent depuis longtemps
  if (activityScore === 0 && accountAgeDays > 30) {
    suspiciousFlags.push("💤 Aucune activité enregistrée (lurker)");
  }

  // Activité soudaine intense
  if (activityScore > 50) {
    suspiciousFlags.push("🔥 Activité très intense (potentiel spam/raid)");
  }

  // Détection d'alt-accounts
  const linkedAccounts = await detectLinkedAccounts(member);

  return {
    userId,
    tag: member.user.tag,
    avatarUrl: member.user.displayAvatarURL(),
    accountCreatedAt: member.user.createdAt,
    joinedAt: member.joinedAt,
    roles: member.roles.cache.map((r) => r.name).filter((n) => n !== "@everyone"),
    activityScore,
    messageCount: logs.filter((l) => l.type === "member_join" || l.type === "message").length,
    sanctionCount: sanctions.length,
    riskScore: riskProfile?.riskScore ?? 0,
    riskLevel: riskProfile?.riskLevel ?? "FAIBLE",
    nameChanges: nameHistory.length,
    avatarChanges: avatarHistory.length,
    lastActive: logs[0]?.createdAt ?? null,
    suspiciousFlags,
    linkedAccounts,
  };
}

// ─── Détection d'alt-accounts ────────────────────────────────────────────────

export async function detectLinkedAccounts(member: GuildMember): Promise<LinkedAccount[]> {
  const guildId = member.guild.id;
  const userId = member.id;
  const linked: LinkedAccount[] = [];

  // 1. Même hash d'avatar
  const myAvatars = await prisma.avatarHistory.findMany({
    where: { userId, guildId },
    select: { newHash: true },
  });
  const myAvatarHashes = new Set(myAvatars.map((a) => a.newHash));

  if (myAvatarHashes.size > 0) {
    const matchingAvatars = await prisma.avatarHistory.findMany({
      where: {
        guildId,
        userId: { not: userId },
        newHash: { in: Array.from(myAvatarHashes) },
      },
      take: 20,
    });

    for (const match of matchingAvatars) {
      const existing = linked.find((l) => l.userId === match.userId);
      if (existing) {
        existing.confidence = Math.min(100, existing.confidence + 40);
        existing.reasons.push("Avatar identique");
      } else {
        linked.push({
          userId: match.userId,
          tag: match.userId, // Will be resolved by caller
          confidence: 40,
          reasons: ["Avatar identique"],
        });
      }
    }
  }

  // 2. Même pattern de pseudo (similarity)
  const myNames = await prisma.nameHistory.findMany({
    where: { userId, guildId },
    select: { newName: true, oldName: true },
  });
  const myNameParts = new Set(myNames.flatMap((n) => [n.newName, n.oldName]).filter(Boolean));

  if (myNameParts.size > 0) {
    const matchingNames = await prisma.nameHistory.findMany({
      where: {
        guildId,
        userId: { not: userId },
        OR: [
          { newName: { in: Array.from(myNameParts) } },
          { oldName: { in: Array.from(myNameParts) } },
        ],
      },
      take: 20,
    });

    for (const match of matchingNames) {
      const existing = linked.find((l) => l.userId === match.userId);
      if (existing) {
        existing.confidence = Math.min(100, existing.confidence + 30);
        existing.reasons.push("Pseudo identique");
      } else {
        linked.push({
          userId: match.userId,
          tag: match.userId,
          confidence: 30,
          reasons: ["Pseudo identique"],
        });
      }
    }
  }

  // 3. Comptes créés dans la même fenêtre (±24h)
  const memberCreatedAt = member.user.createdAt;
  const windowStart = new Date(memberCreatedAt.getTime() - 24 * 60 * 60 * 1000);
  const windowEnd = new Date(memberCreatedAt.getTime() + 24 * 60 * 60 * 1000);

  try {
    const guildMembers = await member.guild.members.fetch({ limit: 200 });
    for (const [otherId, otherMember] of guildMembers) {
      if (otherId === userId) continue;
      const otherCreated = otherMember.user.createdAt;
      if (otherCreated >= windowStart && otherCreated <= windowEnd) {
        const existing = linked.find((l) => l.userId === otherId);
        if (existing) {
          existing.confidence = Math.min(100, existing.confidence + 20);
          existing.reasons.push("Compte créé dans la même fenêtre (±24h)");
        } else {
          linked.push({
            userId: otherId,
            tag: otherMember.user.tag,
            confidence: 20,
            reasons: ["Compte créé dans la même fenêtre (±24h)"],
          });
        }
      }
    }
  } catch {
    // Fetch might fail
  }

  // Résoudre les tags
  for (const link of linked) {
    if (link.tag === link.userId) {
      try {
        const user = await member.guild.client.users.fetch(link.userId);
        link.tag = user.tag;
      } catch {
        // Keep ID
      }
    }
  }

  // Filtrer par confiance minimum et trier
  return linked
    .filter((l) => l.confidence >= 20)
    .sort((a, b) => b.confidence - a.confidence)
    .slice(0, 5);
}

// ─── Cartographie réseau ─────────────────────────────────────────────────────

export async function getMemberNetwork(member: GuildMember): Promise<MemberNetwork> {
  const guildId = member.guild.id;
  const userId = member.id;

  // Analyser les logs partagés (même type, même période)
  const myLogs = await prisma.log.findMany({
    where: { userId },
    orderBy: { createdAt: "desc" },
    take: 50,
  });

  const connectionsMap = new Map<string, { strength: number; reasons: Set<string> }>();

  // 1. Sanctions par le même modérateur
  const mySanctions = await prisma.sanction.findMany({
    where: { userId, guildId },
    take: 20,
  });
  const myModerators = new Set(mySanctions.map((s) => s.moderatorId).filter(Boolean));

  if (myModerators.size > 0) {
    for (const modId of myModerators) {
      if (!modId || modId === userId) continue;
      const otherSanctions = await prisma.sanction.findMany({
        where: { guildId, moderatorId: modId, userId: { not: userId } },
        take: 20,
        distinct: ["userId"],
      });
      for (const s of otherSanctions) {
        const existing = connectionsMap.get(s.userId) ?? { strength: 0, reasons: new Set() };
        existing.strength += 15;
        existing.reasons.add("Sanctionné par le même modérateur");
        connectionsMap.set(s.userId, existing);
      }
    }
  }

  // 2. Mêmes changements de pseudo (pattern similaire)
  const myNames = await prisma.nameHistory.findMany({
    where: { userId, guildId },
    select: { newName: true },
  });
  const myNameSet = new Set(myNames.map((n) => n.newName.toLowerCase()));

  if (myNameSet.size > 0) {
    const matchingNames = await prisma.nameHistory.findMany({
      where: {
        guildId,
        userId: { not: userId },
        newName: { in: Array.from(myNameSet) },
      },
      take: 30,
    });
    for (const n of matchingNames) {
      const existing = connectionsMap.get(n.userId) ?? { strength: 0, reasons: new Set() };
      existing.strength += 25;
      existing.reasons.add("A utilisé le même pseudo");
      connectionsMap.set(n.userId, existing);
    }
  }

  // 3. Comptes créés dans la même fenêtre
  try {
    const members = await member.guild.members.fetch({ limit: 200 });
    const myCreated = member.user.createdAt;
    const windowMs = 48 * 60 * 60 * 1000; // 48h

    for (const [otherId, otherMember] of members) {
      if (otherId === userId) continue;
      const otherCreated = otherMember.user.createdAt;
      const diff = Math.abs(otherCreated.getTime() - myCreated.getTime());
      if (diff < windowMs) {
        const existing = connectionsMap.get(otherId) ?? { strength: 0, reasons: new Set() };
        existing.strength += 20;
        existing.reasons.add("Compte créé dans la même fenêtre (±48h)");
        connectionsMap.set(otherId, existing);
      }
    }
  } catch {
    // Fetch might fail
  }

  // Convertir en array
  const connections: NetworkConnection[] = [];
  for (const [targetId, data] of connectionsMap) {
    let targetTag = targetId;
    try {
      const user = await member.guild.client.users.fetch(targetId);
      targetTag = user.tag;
    } catch {
      // Keep ID
    }
    connections.push({
      targetId,
      targetTag,
      strength: data.strength,
      reasons: Array.from(data.reasons),
    });
  }

  return {
    userId,
    tag: member.user.tag,
    connections: connections.sort((a, b) => b.strength - a.strength).slice(0, 10),
  };
}

// ─── Détection de patterns suspects ──────────────────────────────────────────

export async function detectSuspiciousPatterns(
  client: Client,
  guildId: string,
): Promise<SuspiciousPattern[]> {
  const patterns: SuspiciousPattern[] = [];

  // 1. Rush de nouveaux membres (potentiel raid)
  const recentJoins = await prisma.log.findMany({
    where: {
      type: "member_join",
      createdAt: { gte: new Date(Date.now() - 60 * 60 * 1000) }, // 1h
    },
  });

  if (recentJoins.length >= 10) {
    patterns.push({
      type: "mass_join",
      severity: recentJoins.length >= 20 ? "critical" : "high",
      description: `${recentJoins.length} nouveaux membres en 1 heure — possible raid`,
      userId: "server",
      userTag: "N/A",
      detectedAt: new Date(),
    });
  }

  // 2. Membres avec risque critique
  const criticalMembers = await prisma.riskProfile.findMany({
    where: { guildId, riskLevel: "CRITIQUE" },
    take: 10,
  });

  for (const member of criticalMembers) {
    patterns.push({
      type: "critical_risk",
      severity: "critical",
      description: `Membre avec risque critique (score: ${member.riskScore}, ${member.totalSanctions} sanctions)`,
      userId: member.userId,
      userTag: member.userId,
      detectedAt: member.updatedAt,
    });
  }

  // 3. Changements massifs de pseudo/avatar (potentiel evasion)
  const recentNameChanges = await prisma.nameHistory.findMany({
    where: {
      guildId,
      changedAt: { gte: new Date(Date.now() - 24 * 60 * 60 * 1000) },
    },
  });

  const nameChangeByUser = new Map<string, number>();
  for (const change of recentNameChanges) {
    nameChangeByUser.set(change.userId, (nameChangeByUser.get(change.userId) ?? 0) + 1);
  }

  for (const [userId, count] of nameChangeByUser) {
    if (count >= 3) {
      let tag = userId;
      try {
        const user = await client.users.fetch(userId);
        tag = user.tag;
      } catch {
        // Keep ID
      }
      patterns.push({
        type: "mass_name_change",
        severity: count >= 5 ? "high" : "medium",
        description: `${count} changements de pseudo en 24h — possible évasion d'identité`,
        userId,
        userTag: tag,
        detectedAt: new Date(),
      });
    }
  }

  // 4. Comptes très récents avec activité intense
  try {
    const guild = await client.guilds.fetch(guildId);
    const members = await guild.members.fetch({ limit: 100 });
    for (const [, member] of members) {
      const accountAgeDays = (Date.now() - member.user.createdTimestamp) / (1000 * 60 * 60 * 24);
      if (accountAgeDays < 7 && member.roles.cache.size > 3) {
        patterns.push({
          type: "new_account_with_roles",
          severity: "medium",
          description: `Compte de ${Math.round(accountAgeDays)}j avec ${member.roles.cache.size - 1} rôles — possible escalade`,
          userId: member.id,
          userTag: member.user.tag,
          detectedAt: new Date(),
        });
      }
    }
  } catch {
    // Fetch might fail
  }

  return patterns.sort((a, b) => {
    const severityOrder = { critical: 0, high: 1, medium: 2, low: 3 };
    return severityOrder[a.severity] - severityOrder[b.severity];
  });
}

// ─── Rapport global d'intelligence ───────────────────────────────────────────

export async function generateIntelReport(
  client: Client,
  guildId: string,
): Promise<{
  totalMembers: number;
  highRiskCount: number;
  criticalRiskCount: number;
  totalSanctions: number;
  recentJoins: number;
  suspiciousPatterns: SuspiciousPattern[];
  topRiskMembers: {
    userId: string;
    riskScore: number;
    riskLevel: string;
    totalSanctions: number;
  }[];
}> {
  const [riskProfiles, recentJoinLogs, totalSanctionsResult, patterns] = await Promise.all([
    prisma.riskProfile.findMany({
      where: { guildId },
      orderBy: { riskScore: "desc" },
      take: 100,
    }),
    prisma.log.findMany({
      where: {
        type: "member_join",
        createdAt: { gte: new Date(Date.now() - 24 * 60 * 60 * 1000) },
      },
    }),
    prisma.sanction.count({ where: { guildId } }),
    detectSuspiciousPatterns(client, guildId),
  ]);

  const highRiskCount = riskProfiles.filter((r) => r.riskLevel === "ELEVE").length;
  const criticalRiskCount = riskProfiles.filter((r) => r.riskLevel === "CRITIQUE").length;

  let totalMembers = 0;
  try {
    const guild = await client.guilds.fetch(guildId);
    totalMembers = guild.memberCount;
  } catch {
    // Keep 0
  }

  return {
    totalMembers,
    highRiskCount,
    criticalRiskCount,
    totalSanctions: totalSanctionsResult,
    recentJoins: recentJoinLogs.length,
    suspiciousPatterns: patterns,
    topRiskMembers: riskProfiles.slice(0, 10).map((r) => ({
      userId: r.userId,
      riskScore: r.riskScore,
      riskLevel: r.riskLevel,
      totalSanctions: r.totalSanctions,
    })),
  };
}
