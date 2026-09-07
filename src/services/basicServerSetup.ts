/**
 * Salons Discord basiques + aménagement à l'arrivée.
 *
 * Discord a retiré POST /guilds : un bot ne peut plus créer le serveur.
 * On envoie un lien d'invite, puis on pose le layout dès que John rejoint
 * un serveur tout neuf (ou sur demande admin).
 */

import {
  ChannelType,
  PermissionFlagsBits,
  type Guild,
  type GuildBasedChannel,
  type OverwriteResolvable,
} from "discord.js";
import logger from "../utils/logger.js";
import type { ToolCallResult, ToolContext } from "./agentTools.js";

export type BasicChannelKind = "category" | "text" | "voice";

export interface BasicChannelSpec {
  name: string;
  kind: BasicChannelKind;
  parent?: string;
  topic?: string;
  staff?: boolean;
}

export const BASIC_SERVER_LAYOUT: readonly BasicChannelSpec[] = [
  { name: "Informations", kind: "category" },
  { name: "bienvenue", kind: "text", parent: "Informations", topic: "Arrivées et présentations" },
  { name: "règles", kind: "text", parent: "Informations", topic: "Les règles du serveur" },
  { name: "annonces", kind: "text", parent: "Informations", topic: "Annonces de l'équipe" },
  { name: "Salons", kind: "category" },
  { name: "général", kind: "text", parent: "Salons", topic: "Discussion principale" },
  { name: "media", kind: "text", parent: "Salons", topic: "Images, vidéos, liens" },
  { name: "bots", kind: "text", parent: "Salons", topic: "Commandes et bots" },
  { name: "Vocal", kind: "category" },
  { name: "Général", kind: "voice", parent: "Vocal" },
  { name: "AFK", kind: "voice", parent: "Vocal" },
  { name: "Staff", kind: "category", staff: true },
  { name: "staff", kind: "text", parent: "Staff", topic: "Discussion équipe", staff: true },
  { name: "logs", kind: "text", parent: "Staff", topic: "Journaux", staff: true },
] as const;

export const BASIC_WELCOME_TEXT =
  "Bienvenue. Présente-toi ici si tu veux — prénom, ce que tu fais là, un truc que tu aimes.";

export const BASIC_RULES_TEXT =
  "**Règles**\n" +
  "1. Pas de harcèlement ni d'insultes gratuites.\n" +
  "2. Pas de spam, pub, ou liens chelous.\n" +
  "3. Garde le NSFW hors des salons publics.\n" +
  "4. Le staff a le dernier mot.";

const PENDING_TTL_MS = 30 * 60 * 1000;
const pendingSetups = new Map<string, { name?: string; at: number }>();
const applyingGuilds = new Set<string>();

export function normalizeChannelName(name: string): string {
  return name.normalize("NFD").replace(/\p{M}/gu, "").toLowerCase().trim();
}

export function buildBotInviteUrl(clientId: string): string {
  const id = clientId.trim();
  if (!id) return "";
  return (
    `https://discord.com/oauth2/authorize?client_id=${encodeURIComponent(id)}` +
    "&permissions=8&scope=bot%20applications.commands"
  );
}

export function describeBasicLayout(): string[] {
  return BASIC_SERVER_LAYOUT.filter((spec) => spec.kind !== "category").map((spec) => {
    const prefix = spec.kind === "voice" ? "🔊" : "#";
    return `${spec.parent ?? "—"} / ${prefix}${spec.name}`;
  });
}

export function registerPendingServerSetup(userId: string, name?: string): void {
  pendingSetups.set(userId, { name: name?.trim() || undefined, at: Date.now() });
}

export function peekPendingServerSetup(userId: string): { name?: string; at: number } | null {
  const pending = pendingSetups.get(userId);
  if (!pending) return null;
  if (Date.now() - pending.at > PENDING_TTL_MS) {
    pendingSetups.delete(userId);
    return null;
  }
  return pending;
}

export function consumePendingServerSetup(userId: string): { name?: string } | null {
  const pending = peekPendingServerSetup(userId);
  if (!pending) return null;
  pendingSetups.delete(userId);
  return { name: pending.name };
}

export function clearPendingServerSetups(): void {
  pendingSetups.clear();
  applyingGuilds.clear();
}

export interface FreshGuildView {
  memberCount: number;
  channelCount: number;
}

export function looksLikeFreshGuild(guild: FreshGuildView): boolean {
  return guild.memberCount <= 8 && guild.channelCount <= 6;
}

function channelKindToType(kind: BasicChannelKind): ChannelType {
  if (kind === "category") return ChannelType.GuildCategory;
  if (kind === "voice") return ChannelType.GuildVoice;
  return ChannelType.GuildText;
}

function listChannels(guild: Guild): GuildBasedChannel[] {
  return [...guild.channels.cache.values()];
}

function findByName(
  guild: Guild,
  name: string,
  kind?: BasicChannelKind,
): GuildBasedChannel | undefined {
  const wanted = normalizeChannelName(name);
  const type = kind ? channelKindToType(kind) : undefined;
  return listChannels(guild).find((channel) => {
    if (type !== undefined && channel.type !== type) return false;
    return normalizeChannelName(channel.name) === wanted;
  });
}

function staffOverwrites(guild: Guild): OverwriteResolvable[] {
  const botId = guild.members.me?.id ?? guild.client.user?.id;
  const overwrites: OverwriteResolvable[] = [
    { id: guild.id, deny: [PermissionFlagsBits.ViewChannel] },
  ];
  if (botId) {
    overwrites.push({ id: botId, allow: [PermissionFlagsBits.ViewChannel] });
  }
  return overwrites;
}

export interface ApplyBasicServerResult {
  guildId: string;
  created: string[];
  reused: string[];
  announced: boolean;
}

export async function applyBasicServerLayout(guild: Guild): Promise<ApplyBasicServerResult> {
  const created: string[] = [];
  const reused: string[] = [];
  const categories = new Map<string, GuildBasedChannel>();

  await guild.channels.fetch().catch(() => undefined);

  for (const spec of BASIC_SERVER_LAYOUT) {
    const existing = findByName(guild, spec.name, spec.kind);
    if (existing) {
      reused.push(spec.name);
      if (spec.kind === "category") categories.set(spec.name, existing);
      const parent = spec.parent ? categories.get(spec.parent) : undefined;
      if (parent && "setParent" in existing && existing.parentId !== parent.id) {
        await (existing as { setParent: (id: string) => Promise<unknown> })
          .setParent(parent.id)
          .catch(() => undefined);
      }
      if (spec.topic && "setTopic" in existing) {
        await (existing as { setTopic: (topic: string) => Promise<unknown> })
          .setTopic(spec.topic)
          .catch(() => undefined);
      }
      continue;
    }

    const parent = spec.parent ? categories.get(spec.parent) : undefined;
    const overwrites = spec.staff ? staffOverwrites(guild) : undefined;
    const channel =
      spec.kind === "category"
        ? await guild.channels.create({
            name: spec.name,
            type: ChannelType.GuildCategory,
            permissionOverwrites: overwrites,
          })
        : spec.kind === "voice"
          ? await guild.channels.create({
              name: spec.name,
              type: ChannelType.GuildVoice,
              parent: parent?.id,
              permissionOverwrites: overwrites,
            })
          : await guild.channels.create({
              name: spec.name,
              type: ChannelType.GuildText,
              topic: spec.topic,
              parent: parent?.id,
              permissionOverwrites: overwrites,
            });
    created.push(spec.name);
    if (spec.kind === "category") categories.set(spec.name, channel);
  }

  const system = findByName(guild, "bienvenue", "text");
  if (system && "setSystemChannel" in guild) {
    await guild.setSystemChannel(system.id).catch(() => undefined);
  }
  const afk = findByName(guild, "AFK", "voice");
  if (afk && "setAFKChannel" in guild) {
    await guild.setAFKChannel(afk.id).catch(() => undefined);
    await guild.setAFKTimeout(300).catch(() => undefined);
  }

  let announced = false;
  if (created.includes("bienvenue")) {
    const welcome = findByName(guild, "bienvenue", "text");
    if (welcome && "send" in welcome) {
      await (welcome as { send: (content: string) => Promise<unknown> })
        .send(BASIC_WELCOME_TEXT)
        .catch(() => undefined);
      announced = true;
    }
  }
  if (created.includes("règles")) {
    const rules = findByName(guild, "règles", "text");
    if (rules && "send" in rules) {
      await (rules as { send: (content: string) => Promise<unknown> })
        .send(BASIC_RULES_TEXT)
        .catch(() => undefined);
    }
  }

  return { guildId: guild.id, created, reused, announced };
}

export async function maybeSetupJoinedGuild(guild: Guild): Promise<ApplyBasicServerResult | null> {
  if (applyingGuilds.has(guild.id)) return null;
  await guild.channels.fetch().catch(() => undefined);
  const pending = consumePendingServerSetup(guild.ownerId);
  const fresh = looksLikeFreshGuild({
    memberCount: guild.memberCount,
    channelCount: guild.channels.cache.size,
  });
  if (!pending && !fresh) return null;

  applyingGuilds.add(guild.id);
  try {
    if (pending?.name && pending.name !== guild.name) {
      await guild.setName(pending.name.slice(0, 100)).catch((err) => {
        logger.warn(
          `[BasicServer] rename failed on ${guild.id}: ${err instanceof Error ? err.message : String(err)}`,
        );
      });
    }
    logger.info(
      `[BasicServer] aménagement ${guild.id} (${guild.name}) pending=${Boolean(pending)} fresh=${fresh}`,
    );
    return await applyBasicServerLayout(guild);
  } finally {
    applyingGuilds.delete(guild.id);
  }
}

export async function runSetupBasicServerTool(
  args: Record<string, unknown>,
  ctx: ToolContext,
): Promise<ToolCallResult> {
  const name = typeof args.name === "string" ? args.name.trim().slice(0, 100) : "";
  const applyHere = args.applyHere === true || args.apply_here === true;
  const clientId = ctx.client.user?.id || process.env.DISCORD_CLIENT_ID || "";
  const inviteUrl = buildBotInviteUrl(clientId);
  const layout = describeBasicLayout();

  if (applyHere) {
    const guild = ctx.client.guilds?.cache.get(ctx.guildId);
    if (!guild?.channels?.create) {
      return { success: false, data: "Serveur introuvable — je ne peux pas poser les salons ici." };
    }
    const result = await applyBasicServerLayout(guild);
    return {
      success: true,
      data: JSON.stringify({
        mode: "applyHere",
        guildId: result.guildId,
        created: result.created,
        reused: result.reused,
        layout,
      }),
    };
  }

  registerPendingServerSetup(ctx.userId, name || undefined);
  return {
    success: true,
    data: JSON.stringify({
      mode: "invite",
      discordBlocksBotGuildCreate: true,
      name: name || "Communauté",
      inviteUrl,
      pending: true,
      layout,
      instructions:
        "Discord ne laisse plus un bot créer le serveur. La personne crée un serveur vide, clique le lien pour m'ajouter. Dès que je rentre, je pose les salons basiques.",
    }),
  };
}
