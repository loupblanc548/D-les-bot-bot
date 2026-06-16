"use strict";
var __createBinding = (this && this.__createBinding) || (Object.create ? (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    var desc = Object.getOwnPropertyDescriptor(m, k);
    if (!desc || ("get" in desc ? !m.__esModule : desc.writable || desc.configurable)) {
      desc = { enumerable: true, get: function() { return m[k]; } };
    }
    Object.defineProperty(o, k2, desc);
}) : (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    o[k2] = m[k];
}));
var __setModuleDefault = (this && this.__setModuleDefault) || (Object.create ? (function(o, v) {
    Object.defineProperty(o, "default", { enumerable: true, value: v });
}) : function(o, v) {
    o["default"] = v;
});
var __importStar = (this && this.__importStar) || (function () {
    var ownKeys = function(o) {
        ownKeys = Object.getOwnPropertyNames || function (o) {
            var ar = [];
            for (var k in o) if (Object.prototype.hasOwnProperty.call(o, k)) ar[ar.length] = k;
            return ar;
        };
        return ownKeys(o);
    };
    return function (mod) {
        if (mod && mod.__esModule) return mod;
        var result = {};
        if (mod != null) for (var k = ownKeys(mod), i = 0; i < k.length; i++) if (k[i] !== "default") __createBinding(result, mod, k[i]);
        __setModuleDefault(result, mod);
        return result;
    };
})();
Object.defineProperty(exports, "__esModule", { value: true });
const vitest_1 = require("vitest");
// Mock prisma before importing the module under test
vitest_1.vi.mock("../prisma", () => ({
    default: {
        guildConfig: {
            findUnique: vitest_1.vi.fn(),
        },
    },
}));
vitest_1.vi.mock("../config", () => ({
    config: {
        adminRoles: [],
        modRoles: [],
    },
}));
const permissions_1 = require("./permissions");
function mockMember(overrides = {}) {
    return {
        permissions: {
            has: vitest_1.vi.fn().mockReturnValue(overrides.admin ?? false),
        },
        roles: {
            cache: {
                has: vitest_1.vi.fn((roleId) => (overrides.roleIds ?? []).includes(roleId)),
            },
        },
        guild: {
            id: overrides.guildId ?? "guild-1",
        },
    };
}
function mockInteraction(member) {
    return {
        member: member ?? null,
        reply: vitest_1.vi.fn().mockResolvedValue(undefined),
    };
}
(0, vitest_1.describe)("PermissionLevel enum", () => {
    (0, vitest_1.it)("should have correct values", () => {
        (0, vitest_1.expect)(permissions_1.PermissionLevel.EVERYONE).toBe(0);
        (0, vitest_1.expect)(permissions_1.PermissionLevel.MODERATOR).toBe(1);
        (0, vitest_1.expect)(permissions_1.PermissionLevel.ADMIN).toBe(2);
    });
    (0, vitest_1.it)("should have hierarchical ordering", () => {
        (0, vitest_1.expect)(permissions_1.PermissionLevel.ADMIN).toBeGreaterThan(permissions_1.PermissionLevel.MODERATOR);
        (0, vitest_1.expect)(permissions_1.PermissionLevel.MODERATOR).toBeGreaterThan(permissions_1.PermissionLevel.EVERYONE);
    });
});
(0, vitest_1.describe)("getPermissionLevel", () => {
    (0, vitest_1.beforeEach)(() => {
        vitest_1.vi.clearAllMocks();
    });
    (0, vitest_1.it)("should return ADMIN for members with Administrator permission", async () => {
        const member = mockMember({ admin: true });
        const level = await (0, permissions_1.getPermissionLevel)(member);
        (0, vitest_1.expect)(level).toBe(permissions_1.PermissionLevel.ADMIN);
    });
    (0, vitest_1.it)("should return ADMIN for members with configured admin role", async () => {
        const prisma = await Promise.resolve().then(() => __importStar(require("../prisma")));
        const { config } = await Promise.resolve().then(() => __importStar(require("../config")));
        config.adminRoles = ["role-admin-1"];
        prisma.default.guildConfig.findUnique.mockResolvedValue({
            adminRoleId: "role-admin-db",
            modRoleId: null,
        });
        const member = mockMember({ roleIds: ["role-admin-db"] });
        const level = await (0, permissions_1.getPermissionLevel)(member);
        (0, vitest_1.expect)(level).toBe(permissions_1.PermissionLevel.ADMIN);
    });
    (0, vitest_1.it)("should return ADMIN for members with static config admin role", async () => {
        const { config } = await Promise.resolve().then(() => __importStar(require("../config")));
        config.adminRoles = ["role-static-admin"];
        config.modRoles = [];
        const member = mockMember({ roleIds: ["role-static-admin"] });
        const level = await (0, permissions_1.getPermissionLevel)(member);
        (0, vitest_1.expect)(level).toBe(permissions_1.PermissionLevel.ADMIN);
    });
    (0, vitest_1.it)("should return MODERATOR for members with configured mod role", async () => {
        const prisma = await Promise.resolve().then(() => __importStar(require("../prisma")));
        const { config } = await Promise.resolve().then(() => __importStar(require("../config")));
        config.adminRoles = [];
        config.modRoles = [];
        prisma.default.guildConfig.findUnique.mockResolvedValue({
            adminRoleId: null,
            modRoleId: "role-mod-db",
        });
        const member = mockMember({ roleIds: ["role-mod-db"] });
        const level = await (0, permissions_1.getPermissionLevel)(member);
        (0, vitest_1.expect)(level).toBe(permissions_1.PermissionLevel.MODERATOR);
    });
    (0, vitest_1.it)("should return MODERATOR for members with static config mod role", async () => {
        const { config } = await Promise.resolve().then(() => __importStar(require("../config")));
        config.adminRoles = [];
        config.modRoles = ["role-static-mod"];
        const member = mockMember({ roleIds: ["role-static-mod"] });
        const level = await (0, permissions_1.getPermissionLevel)(member);
        (0, vitest_1.expect)(level).toBe(permissions_1.PermissionLevel.MODERATOR);
    });
    (0, vitest_1.it)("should return EVERYONE for members with no special roles", async () => {
        const prisma = await Promise.resolve().then(() => __importStar(require("../prisma")));
        const { config } = await Promise.resolve().then(() => __importStar(require("../config")));
        config.adminRoles = [];
        config.modRoles = [];
        prisma.default.guildConfig.findUnique.mockResolvedValue(null);
        const member = mockMember({ roleIds: [] });
        const level = await (0, permissions_1.getPermissionLevel)(member);
        (0, vitest_1.expect)(level).toBe(permissions_1.PermissionLevel.EVERYONE);
    });
    (0, vitest_1.it)("should prioritize admin over mod when member has both", async () => {
        const prisma = await Promise.resolve().then(() => __importStar(require("../prisma")));
        const { config } = await Promise.resolve().then(() => __importStar(require("../config")));
        config.adminRoles = ["role-a"];
        config.modRoles = ["role-a"];
        const member = mockMember({ roleIds: ["role-a"] });
        const level = await (0, permissions_1.getPermissionLevel)(member);
        (0, vitest_1.expect)(level).toBe(permissions_1.PermissionLevel.ADMIN);
    });
});
(0, vitest_1.describe)("requireAdmin", () => {
    (0, vitest_1.beforeEach)(() => {
        vitest_1.vi.clearAllMocks();
    });
    (0, vitest_1.it)("should return false and reply for DM interactions (no member)", async () => {
        const interaction = mockInteraction(null);
        const result = await (0, permissions_1.requireAdmin)(interaction);
        (0, vitest_1.expect)(result).toBe(false);
        (0, vitest_1.expect)(interaction.reply).toHaveBeenCalledWith(vitest_1.expect.objectContaining({
            content: vitest_1.expect.stringContaining("serveur"),
        }));
    });
    (0, vitest_1.it)("should return true for admin members", async () => {
        const member = mockMember({ admin: true });
        const interaction = mockInteraction(member);
        const result = await (0, permissions_1.requireAdmin)(interaction);
        (0, vitest_1.expect)(result).toBe(true);
    });
    (0, vitest_1.it)("should return false and reply for non-admin members", async () => {
        const prisma = await Promise.resolve().then(() => __importStar(require("../prisma")));
        const { config } = await Promise.resolve().then(() => __importStar(require("../config")));
        config.adminRoles = [];
        config.modRoles = [];
        prisma.default.guildConfig.findUnique.mockResolvedValue(null);
        const member = mockMember({ roleIds: [] });
        const interaction = mockInteraction(member);
        const result = await (0, permissions_1.requireAdmin)(interaction);
        (0, vitest_1.expect)(result).toBe(false);
        (0, vitest_1.expect)(interaction.reply).toHaveBeenCalledWith(vitest_1.expect.objectContaining({
            content: vitest_1.expect.stringContaining("administrateurs"),
        }));
    });
});
(0, vitest_1.describe)("requireMod", () => {
    (0, vitest_1.beforeEach)(() => {
        vitest_1.vi.clearAllMocks();
    });
    (0, vitest_1.it)("should return false and reply for DM interactions (no member)", async () => {
        const interaction = mockInteraction(null);
        const result = await (0, permissions_1.requireMod)(interaction);
        (0, vitest_1.expect)(result).toBe(false);
        (0, vitest_1.expect)(interaction.reply).toHaveBeenCalledWith(vitest_1.expect.objectContaining({
            content: vitest_1.expect.stringContaining("serveur"),
        }));
    });
    (0, vitest_1.it)("should return true for admin members (admin >= mod)", async () => {
        const member = mockMember({ admin: true });
        const interaction = mockInteraction(member);
        const result = await (0, permissions_1.requireMod)(interaction);
        (0, vitest_1.expect)(result).toBe(true);
    });
    (0, vitest_1.it)("should return false and reply for everyone-level members", async () => {
        const prisma = await Promise.resolve().then(() => __importStar(require("../prisma")));
        const { config } = await Promise.resolve().then(() => __importStar(require("../config")));
        config.adminRoles = [];
        config.modRoles = [];
        prisma.default.guildConfig.findUnique.mockResolvedValue(null);
        const member = mockMember({ roleIds: [] });
        const interaction = mockInteraction(member);
        const result = await (0, permissions_1.requireMod)(interaction);
        (0, vitest_1.expect)(result).toBe(false);
        (0, vitest_1.expect)(interaction.reply).toHaveBeenCalledWith(vitest_1.expect.objectContaining({
            content: vitest_1.expect.stringContaining("moderateurs"),
        }));
    });
});
//# sourceMappingURL=permissions.test.js.map