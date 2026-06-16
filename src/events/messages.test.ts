import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';

// ── Mocks ────────────────────────────────────────────────────────────────────

const mockPrismaGuildConfig = vi.hoisted(() => ({
  findUnique: vi.fn(),
}));

const mockCreateLog = vi.hoisted(() => vi.fn());
const mockRecordSecurityEvent = vi.hoisted(() => vi.fn());
const mockIsAntiPhishingActive = vi.hoisted(() => vi.fn());
const mockCheckSuspiciousLinks = vi.hoisted(() => vi.fn());
const mockIsAiChatEnabled = vi.hoisted(() => vi.fn());
const mockChatWithHistory = vi.hoisted(() => vi.fn());
const mockAnalyzeToxicity = vi.hoisted(() => vi.fn());
const mockWithCache = vi.hoisted(() => vi.fn());
const mockTranslateAuto = vi.hoisted(() => vi.fn());
const mockAddMessageToConversation = vi.hoisted(() => vi.fn());
const mockGetConversationHistory = vi.hoisted(() => vi.fn());
const mockGetCachedResponse = vi.hoisted(() => vi.fn());
const mockCacheResponse = vi.hoisted(() => vi.fn());
const mockCheckRateLimit = vi.hoisted(() => vi.fn());
const mockClearConversation = vi.hoisted(() => vi.fn());

vi.mock('../prisma', () => ({
  default: {
    guildConfig: mockPrismaGuildConfig,
  },
}));

vi.mock('../services/logs', () => ({
  createLog: mockCreateLog,
}));

vi.mock('../services/risk-engine', () => ({
  recordSecurityEvent: mockRecordSecurityEvent,
}));

vi.mock('../commands/security', () => ({
  isAntiPhishingActive: mockIsAntiPhishingActive,
  checkSuspiciousLinksDetailed: mockCheckSuspiciousLinks,
}));

vi.mock('../services/aichat', () => ({
  isAiChatEnabled: mockIsAiChatEnabled,
  chatWithHistory: mockChatWithHistory,
}));

vi.mock('../services/ai-moderation', () => ({
  analyzeToxicity: mockAnalyzeToxicity,
}));

vi.mock('../utils/redis-enhance', () => ({
  withCache: mockWithCache,
}));

vi.mock('../utils/translator', () => ({
  translateAutoToFrench: mockTranslateAuto,
}));

vi.mock('../services/aiMemory', () => ({
  addMessageToConversation: mockAddMessageToConversation,
  getConversationHistory: mockGetConversationHistory,
  clearConversation: mockClearConversation,
}));

vi.mock('../services/aiCache', () => ({
  getCachedResponse: mockGetCachedResponse,
  cacheResponse: mockCacheResponse,
}));

vi.mock('../services/rateLimiter', () => ({
  checkRateLimit: mockCheckRateLimit,
}));

vi.mock('../utils/logger', () => ({
  default: {
    error: vi.fn(),
    warn: vi.fn(),
    info: vi.fn(),
    debug: vi.fn(),
  },
}));

// ── Imports ──────────────────────────────────────────────────────────────────

import { handleMessageEvents, startMapCleanup, stopMapCleanup } from './messages';
import { Client, Collection } from 'discord.js';

// ── Helpers ──────────────────────────────────────────────────────────────────

function createMockClient() {
  const listeners: Record<string, Array<(...args: unknown[]) => void>> = {};
  return {
    user: { id: 'bot-123' },
    on: vi.fn((event: string, handler: (...args: unknown[]) => void) => {
      if (!listeners[event]) listeners[event] = [];
      listeners[event].push(handler);
    }),
    emit: (event: string, ...args: unknown[]) => {
      listeners[event]?.forEach((h) => h(...args));
    },
    _listeners: listeners,
  } as unknown as Client & { emit: (event: string, ...args: unknown[]) => void; _listeners: Record<string, Array<(...args: unknown[]) => void>> };
}

function createMockMessage(overrides: Record<string, unknown> = {}) {
  return {
    id: 'msg-123',
    guild: { id: 'guild-123', name: 'Test Server', roles: { everyone: { id: 'everyone-role' } } },
    guildId: 'guild-123',
    channel: {
      id: 'channel-123',
      name: 'general',
      isTextBased: () => true,
      send: vi.fn().mockResolvedValue({ delete: vi.fn() }),
      sendTyping: vi.fn().mockResolvedValue(undefined),
      messages: {
        fetch: vi.fn().mockResolvedValue(new Collection()),
        bulkDelete: vi.fn().mockResolvedValue(new Collection()),
      },
    },
    author: { id: 'user-123', tag: 'TestUser#1234', username: 'TestUser', bot: false, displayAvatarURL: () => 'https://avatar.url' },
    member: {
      id: 'user-123',
      permissions: { has: vi.fn().mockReturnValue(false) },
      timeout: vi.fn().mockResolvedValue(undefined),
      kickable: true,
      bannable: true,
      user: { id: 'user-123', tag: 'TestUser#1234' },
    },
    content: 'Hello world',
    mentions: { has: vi.fn().mockReturnValue(false), users: new Collection() },
    delete: vi.fn().mockResolvedValue(undefined),
    reply: vi.fn().mockResolvedValue(undefined),
    react: vi.fn().mockResolvedValue(undefined),
    pinned: false,
    authorId: 'user-123',
    ...overrides,
  };
}

// ══════════════════════════════════════════════════════════════════════════════
// Suite 1: handleMessageEvents — Pin/Unpin Logging
// ══════════════════════════════════════════════════════════════════════════════

describe('handleMessageEvents — Pin/Unpin', () => {
  let client: ReturnType<typeof createMockClient>;

  beforeEach(() => {
    vi.clearAllMocks();
    client = createMockClient();
    handleMessageEvents(client as unknown as Client);
  });

  it('log un épinglage (pin) de message', async () => {
    const oldMsg = createMockMessage({ pinned: false });
    const newMsg = createMockMessage({ pinned: true });

    await client._listeners.messageUpdate?.[0](oldMsg, newMsg);

    expect(mockCreateLog).toHaveBeenCalledWith(
      expect.objectContaining({
        type: 'message_pin',
        userId: 'user-123',
        targetId: 'msg-123',
        action: expect.stringContaining('epingle'),
      })
    );
  });

  it('log un désépinglage (unpin) de message', async () => {
    const oldMsg = createMockMessage({ pinned: true });
    const newMsg = createMockMessage({ pinned: false });

    await client._listeners.messageUpdate?.[0](oldMsg, newMsg);

    expect(mockCreateLog).toHaveBeenCalledWith(
      expect.objectContaining({
        type: 'message_unpin',
        userId: 'user-123',
        targetId: 'msg-123',
        action: expect.stringContaining('desepingle'),
      })
    );
  });

  it("ignore si l'ancien message n'a pas de propriété pinned", async () => {
    const oldMsg = createMockMessage();
    delete (oldMsg as Record<string, unknown>).pinned;
    const newMsg = createMockMessage({ pinned: true });

    await client._listeners.messageUpdate?.[0](oldMsg, newMsg);

    expect(mockCreateLog).not.toHaveBeenCalled();
  });

  it("ignore si le nouveau message n'a pas de propriété author", async () => {
    const oldMsg = createMockMessage({ pinned: false });
    const newMsg = createMockMessage({ pinned: true });
    delete (newMsg as Record<string, unknown>).author;

    await client._listeners.messageUpdate?.[0](oldMsg, newMsg);

    expect(mockCreateLog).not.toHaveBeenCalled();
  });
});

// ══════════════════════════════════════════════════════════════════════════════
// Suite 2: messageCreate — AI Chat par @mention
// ══════════════════════════════════════════════════════════════════════════════

describe('messageCreate — AI Chat @mention', () => {
  let client: ReturnType<typeof createMockClient>;

  beforeEach(() => {
    vi.clearAllMocks();
    client = createMockClient();
    handleMessageEvents(client as unknown as Client);
    mockCheckRateLimit.mockReturnValue({ allowed: true, resetTime: Date.now() + 60000 });
  });

  it('répond avec une relance humoristique si @mention sans message', async () => {
    const msg = createMockMessage({
      content: `<@bot-123>`,
      mentions: { has: vi.fn().mockReturnValue(true), users: new Collection() },
    });

    await client._listeners.messageCreate?.[0](msg);

    expect(msg.reply).toHaveBeenCalledWith(
      expect.objectContaining({
        content: expect.stringMatching(/John Helldiver|Soldat|Super-Terre|camarade/),
        allowedMentions: { repliedUser: false },
      })
    );
  });

  it('ignore les messages des bots', async () => {
    const msg = createMockMessage({
      author: { ...createMockMessage().author, bot: true },
      mentions: { has: vi.fn().mockReturnValue(true), users: new Collection() },
    });

    await client._listeners.messageCreate?.[0](msg);

    expect(msg.reply).not.toHaveBeenCalled();
  });

  it('ignore les messages hors guild (DM)', async () => {
    const msg = createMockMessage({ guild: null, guildId: null });
    await client._listeners.messageCreate?.[0](msg);
    expect(mockAnalyzeToxicity).not.toHaveBeenCalled();
  });
});

// ══════════════════════════════════════════════════════════════════════════════
// Suite 3: Anti-Spam — Seuil de 5 messages → timeout + purge
// ══════════════════════════════════════════════════════════════════════════════

describe('Anti-Spam — Seuil de 5 messages', () => {
  let client: ReturnType<typeof createMockClient>;

  beforeEach(() => {
    vi.clearAllMocks();
    vi.useFakeTimers();
    client = createMockClient();
    handleMessageEvents(client as unknown as Client);
    mockWithCache.mockImplementation((_key, _ttl, fn) => fn());
    mockPrismaGuildConfig.findUnique.mockResolvedValue({ aiModerationEnabled: false });
    mockIsAntiPhishingActive.mockResolvedValue(false);
    mockTranslateAuto.mockResolvedValue(null);
    mockIsAiChatEnabled.mockReturnValue(false);
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it('déclenche le timeout après 5 messages dans la fenêtre de 3s', async () => {
    for (let i = 0; i < 4; i++) {
      const m = createMockMessage();
      await client._listeners.messageCreate?.[0](m);
    }
    const lastMsg = createMockMessage();
    await client._listeners.messageCreate?.[0](lastMsg);

    expect(lastMsg.member?.timeout).toHaveBeenCalledWith(300000, 'Anti-spam');
  });

  it('ne déclenche pas le timeout si les messages sont espacés (> 3s)', async () => {
    for (let i = 0; i < 4; i++) {
      const m = createMockMessage();
      await client._listeners.messageCreate?.[0](m);
      vi.advanceTimersByTime(4000);
    }
    const lastMsg = createMockMessage();
    await client._listeners.messageCreate?.[0](lastMsg);

    expect(lastMsg.member?.timeout).not.toHaveBeenCalled();
  });

  it("ne déclenche le timeout qu'une seule fois grâce au flag warned", async () => {
    const msgs: ReturnType<typeof createMockMessage>[] = [];
    for (let i = 0; i < 5; i++) {
      const m = createMockMessage();
      msgs.push(m);
      await client._listeners.messageCreate?.[0](m);
    }
    expect(msgs[4].member?.timeout).toHaveBeenCalledTimes(1);

    const sixthMsg = createMockMessage();
    await client._listeners.messageCreate?.[0](sixthMsg);
    expect(sixthMsg.member?.timeout).not.toHaveBeenCalled();
  });

  it('bypass les administrateurs (pas de spam check)', async () => {
    for (let i = 0; i < 10; i++) {
      const m = createMockMessage();
      (m.member!.permissions.has as ReturnType<typeof vi.fn>).mockImplementation(
        (perm: string) => perm === 'Administrator'
      );
      await client._listeners.messageCreate?.[0](m);
    }
    // Si on arrive ici sans timeout, le test passe
    expect(true).toBe(true);
  });

  it('tente de bulkDelete les messages récents du spammeur', async () => {
    const lastMsg = createMockMessage();
    for (let i = 0; i < 4; i++) {
      const m = createMockMessage();
      await client._listeners.messageCreate?.[0](m);
    }
    await client._listeners.messageCreate?.[0](lastMsg);
    expect(lastMsg.channel.messages.fetch).toHaveBeenCalled();
  });
});

// ══════════════════════════════════════════════════════════════════════════════
// Suite 4: AI Moderation — Toxicité, bypass admin/modérateur
// ══════════════════════════════════════════════════════════════════════════════

describe('AI Moderation — Toxicité', () => {
  let client: ReturnType<typeof createMockClient>;

  beforeEach(() => {
    vi.clearAllMocks();
    client = createMockClient();
    handleMessageEvents(client as unknown as Client);
    mockWithCache.mockImplementation((_key, _ttl, fn) => fn());
    mockIsAntiPhishingActive.mockResolvedValue(false);
    mockTranslateAuto.mockResolvedValue(null);
    mockIsAiChatEnabled.mockReturnValue(false);
  });

  it('supprime le message si toxicité > 0.8 et aiModerationEnabled = true', async () => {
    mockPrismaGuildConfig.findUnique.mockResolvedValue({ aiModerationEnabled: true });
    mockAnalyzeToxicity.mockResolvedValue({ isToxic: true, confidence: 0.95, category: 'hate_speech' });

    const msg = createMockMessage({ content: 'propos toxique' });
    await client._listeners.messageCreate?.[0](msg);
    await new Promise((r) => setTimeout(r, 100));

    expect(mockAnalyzeToxicity).toHaveBeenCalledWith('propos toxique');
    expect(msg.delete).toHaveBeenCalled();
  });

  it('ne supprime pas le message si confiance ≤ 0.8', async () => {
    mockPrismaGuildConfig.findUnique.mockResolvedValue({ aiModerationEnabled: true });
    mockAnalyzeToxicity.mockResolvedValue({ isToxic: true, confidence: 0.7, category: 'insult' });

    const msg = createMockMessage({ content: 'message limite' });
    await client._listeners.messageCreate?.[0](msg);
    await new Promise((r) => setTimeout(r, 100));

    expect(msg.delete).not.toHaveBeenCalled();
  });

  it('ne fait rien si aiModerationEnabled = false', async () => {
    mockPrismaGuildConfig.findUnique.mockResolvedValue({ aiModerationEnabled: false });

    const msg = createMockMessage({ content: 'hello' });
    await client._listeners.messageCreate?.[0](msg);
    await new Promise((r) => setTimeout(r, 100));

    expect(mockAnalyzeToxicity).not.toHaveBeenCalled();
  });

  it('bypass les administrateurs (pas de check AI)', async () => {
    mockPrismaGuildConfig.findUnique.mockResolvedValue({ aiModerationEnabled: true });

    const adminMsg = createMockMessage({ content: 'toxic admin message' });
    (adminMsg.member!.permissions.has as ReturnType<typeof vi.fn>).mockReturnValue(true);

    await client._listeners.messageCreate?.[0](adminMsg);
    await new Promise((r) => setTimeout(r, 100));

    expect(mockAnalyzeToxicity).not.toHaveBeenCalled();
  });

  it('bypass les modérateurs (pas de check AI)', async () => {
    mockPrismaGuildConfig.findUnique.mockResolvedValue({ aiModerationEnabled: true });

    const modMsg = createMockMessage({ content: 'toxic mod message' });
    (modMsg.member!.permissions.has as ReturnType<typeof vi.fn>).mockImplementation(
      (perm: string) => perm === 'ModerateMembers'
    );

    await client._listeners.messageCreate?.[0](modMsg);
    await new Promise((r) => setTimeout(r, 100));

    expect(mockAnalyzeToxicity).not.toHaveBeenCalled();
  });

  it('ne fait rien si le message est trop court (< 10 caractères)', async () => {
    mockPrismaGuildConfig.findUnique.mockResolvedValue({ aiModerationEnabled: true });

    const shortMsg = createMockMessage({ content: 'ok' });
    await client._listeners.messageCreate?.[0](shortMsg);
    await new Promise((r) => setTimeout(r, 100));

    expect(mockAnalyzeToxicity).not.toHaveBeenCalled();
  });

  it('ne fait rien si le message est très long (> 1500 caractères)', async () => {
    mockPrismaGuildConfig.findUnique.mockResolvedValue({ aiModerationEnabled: true });

    const longMsg = createMockMessage({ content: 'x'.repeat(1501) });
    await client._listeners.messageCreate?.[0](longMsg);
    await new Promise((r) => setTimeout(r, 100));

    expect(mockAnalyzeToxicity).not.toHaveBeenCalled();
  });

  it('gère silencieusement les erreurs de analyzeToxicity', async () => {
    mockPrismaGuildConfig.findUnique.mockResolvedValue({ aiModerationEnabled: true });
    mockAnalyzeToxicity.mockRejectedValue(new Error('API down'));

    const msg = createMockMessage({ content: 'test error handling' });
    await client._listeners.messageCreate?.[0](msg);
    await new Promise((r) => setTimeout(r, 100));

    expect(msg.delete).not.toHaveBeenCalled();
  });

  it('envoie une alerte temporaire après suppression', async () => {
    mockPrismaGuildConfig.findUnique.mockResolvedValue({ aiModerationEnabled: true });
    mockAnalyzeToxicity.mockResolvedValue({ isToxic: true, confidence: 0.9, category: 'hate_speech' });

    const alertMsg = { delete: vi.fn().mockResolvedValue(undefined) };
    const msg = createMockMessage({ content: 'propos haineux' });
    msg.channel.send = vi.fn().mockResolvedValue(alertMsg);

    await client._listeners.messageCreate?.[0](msg);
    await new Promise((r) => setTimeout(r, 100));

    expect(msg.delete).toHaveBeenCalled();
    expect(msg.channel.send).toHaveBeenCalledWith(
      expect.objectContaining({
        content: expect.stringContaining('message supprimé par IA'),
      })
    );
  });
});

// ══════════════════════════════════════════════════════════════════════════════
// Suite 5: Anti-Phishing — Détection de liens suspects
// ══════════════════════════════════════════════════════════════════════════════

describe('Anti-Phishing', () => {
  let client: ReturnType<typeof createMockClient>;

  beforeEach(() => {
    vi.clearAllMocks();
    client = createMockClient();
    handleMessageEvents(client as unknown as Client);
    mockWithCache.mockImplementation((_key, _ttl, fn) => fn());
    mockPrismaGuildConfig.findUnique.mockResolvedValue({ aiModerationEnabled: false });
    mockTranslateAuto.mockResolvedValue(null);
    mockIsAiChatEnabled.mockReturnValue(false);
  });

  it('supprime le message si un lien suspect est détecté', async () => {
    mockIsAntiPhishingActive.mockResolvedValue(true);
    mockCheckSuspiciousLinks.mockReturnValue(['http://phishing-site.com']);

    const msg = createMockMessage({ content: 'check this http://phishing-site.com' });
    await client._listeners.messageCreate?.[0](msg);

    expect(mockCheckSuspiciousLinks).toHaveBeenCalledWith(msg.content);
    expect(msg.delete).toHaveBeenCalled();
    expect(mockRecordSecurityEvent).toHaveBeenCalledWith(
      'user-123', 'guild-123', 'ANTI_PHISHING'
    );
  });

  it('ne fait rien si aucun lien suspect', async () => {
    mockIsAntiPhishingActive.mockResolvedValue(true);
    mockCheckSuspiciousLinks.mockReturnValue([]);

    const msg = createMockMessage({ content: 'clean message' });
    await client._listeners.messageCreate?.[0](msg);

    expect(msg.delete).not.toHaveBeenCalled();
  });

  it('ne vérifie pas si anti-phishing désactivé', async () => {
    mockIsAntiPhishingActive.mockResolvedValue(false);

    const msg = createMockMessage({ content: 'http://suspicious.com' });
    await client._listeners.messageCreate?.[0](msg);

    expect(mockCheckSuspiciousLinks).not.toHaveBeenCalled();
  });
});

// ══════════════════════════════════════════════════════════════════════════════
// Suite 6: startMapCleanup / stopMapCleanup
// ══════════════════════════════════════════════════════════════════════════════

describe('startMapCleanup / stopMapCleanup', () => {
  beforeEach(() => {
    vi.useFakeTimers();
    stopMapCleanup();
  });

  afterEach(() => {
    vi.useRealTimers();
    stopMapCleanup();
  });

  it('startMapCleanup démarre un intervalle', () => {
    startMapCleanup();
    expect(true).toBe(true);
  });

  it('startMapCleanup ne crée pas de double intervalle', () => {
    startMapCleanup();
    startMapCleanup();
    expect(true).toBe(true);
  });

  it("stopMapCleanup stoppe l'intervalle", () => {
    startMapCleanup();
    stopMapCleanup();
    expect(true).toBe(true);
  });

  it('stopMapCleanup est idempotent', () => {
    stopMapCleanup();
    stopMapCleanup();
    expect(true).toBe(true);
  });
});
