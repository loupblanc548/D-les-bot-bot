import { describe, it, expect, vi, beforeEach } from "vitest";

// Mock prisma before importing the module under test
vi.mock("../prisma", () => ({
  default: {
    guildConfig: {
      findUnique: vi.fn(),
    },
  },
}));

vi.mock("../config", () => ({
  config: {
    adminRoles: [] as string[],
    modRoles: [] as string[],
    ownerId: "",
  },
}));

import { getPermissionLevel, requireAdmin, requireMod, PermissionLevel } from "./permissions.js";
import type { GuildMember, CommandInteraction, Guild } from "discord.js";

let _memberIdCounter = 0;

function mockMember(
  overrides: {
    admin?: boolean;
    roleIds?: string[];
    guildId?: string;
    modPermissions?: boolean;
    id?: string;
  } = {},
): GuildMember {
  return {
    id: overrides.id ?? `member-${++_memberIdCounter}`,
    permissions: {
      has: vi.fn().mockImplementation((perm: bigint) => {
        if (overrides.admin) return true;
        if (overrides.modPermissions && perm) return true;
        return false;
      }),
    },
    roles: {
      cache: {
        has: vi.fn((roleId: string) => (overrides.roleIds ?? []).includes(roleId)),
      },
    },
    guild: {
      id: overrides.guildId ?? "guild-1",
      roles: {
        cache: {
          get: vi.fn((roleId: string) =>
            (overrides.roleIds ?? []).includes(roleId)
              ? { name: `Role-${roleId}`, permissions: { has: vi.fn().mockReturnValue(true) } }
              : undefined,
          ),
        },
      },
    } as unknown as Guild,
  } as unknown as GuildMember;
}

function mockInteraction(member?: GuildMember | null): CommandInteraction {
  return {
    member: member ?? null,
    // Default to a guild-context interaction (not a DM) so these tests
    // exercise the member-permission path rather than the DM-only
    // ("owner only") branch added to requireAdmin/requireMod.
    guild: member?.guild ?? { id: "guild-1" },
    user: { id: "user-non-owner" },
    reply: vi.fn().mockResolvedValue(undefined),
  } as unknown as CommandInteraction;
}

function mockDmInteraction(userId: string): CommandInteraction {
  return {
    member: null,
    guild: null,
    user: { id: userId },
    reply: vi.fn().mockResolvedValue(undefined),
  } as unknown as CommandInteraction;
}

describe("PermissionLevel enum", () => {
  it("should have correct values", () => {
    expect(PermissionLevel.EVERYONE).toBe(0);
    expect(PermissionLevel.MODERATOR).toBe(1);
    expect(PermissionLevel.ADMIN).toBe(2);
  });

  it("should have hierarchical ordering", () => {
    expect(PermissionLevel.ADMIN).toBeGreaterThan(PermissionLevel.MODERATOR);
    expect(PermissionLevel.MODERATOR).toBeGreaterThan(PermissionLevel.EVERYONE);
  });
});

describe("getPermissionLevel", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("should return ADMIN for members with Administrator permission", async () => {
    const member = mockMember({ admin: true });
    const level = await getPermissionLevel(member);
    expect(level).toBe(PermissionLevel.ADMIN);
  });

  it("should return ADMIN for members with configured admin role", async () => {
    const prisma = await import("../prisma.js");
    const { config } = await import("../config.js");

    config.adminRoles = ["role-admin-1"];
    (prisma.default.guildConfig.findUnique as any).mockResolvedValue({
      adminRoleId: "role-admin-db",
      modRoleId: null,
    });

    const member = mockMember({ roleIds: ["role-admin-db"] });
    const level = await getPermissionLevel(member);
    expect(level).toBe(PermissionLevel.ADMIN);
  });

  it("should return ADMIN for members with static config admin role", async () => {
    const { config } = await import("../config.js");
    config.adminRoles = ["role-static-admin"];
    config.modRoles = [];

    const member = mockMember({ roleIds: ["role-static-admin"] });
    const level = await getPermissionLevel(member);
    expect(level).toBe(PermissionLevel.ADMIN);
  });

  it("should return MODERATOR for members with configured mod role", async () => {
    const prisma = await import("../prisma.js");
    const { config } = await import("../config.js");

    config.adminRoles = [];
    config.modRoles = [];
    (prisma.default.guildConfig.findUnique as any).mockResolvedValue({
      adminRoleId: null,
      modRoleId: "role-mod-db",
    });

    const member = mockMember({ roleIds: ["role-mod-db"] });
    const level = await getPermissionLevel(member);
    expect(level).toBe(PermissionLevel.MODERATOR);
  });

  it("should return MODERATOR for members with static config mod role", async () => {
    const { config } = await import("../config.js");
    config.adminRoles = [];
    config.modRoles = ["role-static-mod"];

    const member = mockMember({ roleIds: ["role-static-mod"] });
    const level = await getPermissionLevel(member);
    expect(level).toBe(PermissionLevel.MODERATOR);
  });

  it("should return EVERYONE for members with no special roles", async () => {
    const prisma = await import("../prisma.js");
    const { config } = await import("../config.js");

    config.adminRoles = [];
    config.modRoles = [];
    (prisma.default.guildConfig.findUnique as any).mockResolvedValue(null);

    const member = mockMember({ roleIds: [] });
    const level = await getPermissionLevel(member);
    expect(level).toBe(PermissionLevel.EVERYONE);
  });

  it("should return ADMIN for the bot owner without Discord Administrator", async () => {
    const prisma = await import("../prisma.js");
    const { config } = await import("../config.js");
    config.adminRoles = [];
    config.modRoles = [];
    (config as any).ownerId = "owner-123";
    (prisma.default.guildConfig.findUnique as any).mockResolvedValue(null);

    const member = mockMember({ id: "owner-123", roleIds: [] });
    const level = await getPermissionLevel(member);
    expect(level).toBe(PermissionLevel.ADMIN);
  });

  it("should prioritize admin over mod when member has both", async () => {
    const _prisma = await import("../prisma.js");
    const { config } = await import("../config.js");

    config.adminRoles = ["role-a"];
    config.modRoles = ["role-a"];

    const member = mockMember({ roleIds: ["role-a"] });
    const level = await getPermissionLevel(member);
    expect(level).toBe(PermissionLevel.ADMIN);
  });
});

describe("requireAdmin", () => {
  beforeEach(async () => {
    vi.clearAllMocks();
    const { config } = await import("../config.js");
    (config as any).ownerId = "";
    config.adminRoles = [];
    config.modRoles = [];
  });

  it("should return false and reply for DM interactions (no member)", async () => {
    const interaction = mockInteraction(null);
    const result = await requireAdmin(interaction);
    expect(result).toBe(false);
    expect(interaction.reply).toHaveBeenCalledWith(
      expect.objectContaining({
        content: expect.stringContaining("serveur"),
      }),
    );
  });

  it("should return true for the bot owner in DMs", async () => {
    const { config } = await import("../config.js");
    (config as any).ownerId = "owner-123";
    const interaction = mockDmInteraction("owner-123");
    const result = await requireAdmin(interaction);
    expect(result).toBe(true);
  });

  it("should return false and reply for non-owners in DMs", async () => {
    const { config } = await import("../config.js");
    (config as any).ownerId = "owner-123";
    const interaction = mockDmInteraction("someone-else");
    const result = await requireAdmin(interaction);
    expect(result).toBe(false);
    expect(interaction.reply).toHaveBeenCalledWith(
      expect.objectContaining({
        content: expect.stringContaining("propriétaire"),
      }),
    );
  });

  it("should return true for the bot owner on a guild without Administrator", async () => {
    const { config } = await import("../config.js");
    (config as any).ownerId = "owner-123";
    const member = mockMember({ id: "owner-123", roleIds: [] });
    const interaction = mockInteraction(member);
    (interaction as { user: { id: string } }).user = { id: "owner-123" };
    const result = await requireAdmin(interaction);
    expect(result).toBe(true);
  });

  it("should return true for admin members", async () => {
    const member = mockMember({ admin: true });
    const interaction = mockInteraction(member);
    const result = await requireAdmin(interaction);
    expect(result).toBe(true);
  });

  it("should return false and reply for non-admin members", async () => {
    const prisma = await import("../prisma.js");
    const { config } = await import("../config.js");

    config.adminRoles = [];
    config.modRoles = [];
    (prisma.default.guildConfig.findUnique as any).mockResolvedValue(null);

    const member = mockMember({ roleIds: [] });
    const interaction = mockInteraction(member);
    const result = await requireAdmin(interaction);
    expect(result).toBe(false);
    expect(interaction.reply).toHaveBeenCalledWith(
      expect.objectContaining({
        content: expect.stringContaining("administrateurs"),
      }),
    );
  });
});

describe("requireMod", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("should return false and reply for DM interactions (no member)", async () => {
    const interaction = mockInteraction(null);
    const result = await requireMod(interaction);
    expect(result).toBe(false);
    expect(interaction.reply).toHaveBeenCalledWith(
      expect.objectContaining({
        content: expect.stringContaining("serveur"),
      }),
    );
  });

  it("should return true for admin members (admin >= mod)", async () => {
    const member = mockMember({ admin: true });
    const interaction = mockInteraction(member);
    const result = await requireMod(interaction);
    expect(result).toBe(true);
  });

  it("should return false and reply for everyone-level members", async () => {
    const prisma = await import("../prisma.js");
    const { config } = await import("../config.js");

    config.adminRoles = [];
    config.modRoles = [];
    (prisma.default.guildConfig.findUnique as any).mockResolvedValue(null);

    const member = mockMember({ roleIds: [] });
    const interaction = mockInteraction(member);
    const result = await requireMod(interaction);
    expect(result).toBe(false);
    expect(interaction.reply).toHaveBeenCalledWith(
      expect.objectContaining({
        content: expect.stringContaining("moderateurs"),
      }),
    );
  });
});
