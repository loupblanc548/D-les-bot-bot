import os

path = r"D:\les bot\bot\src\managers\executeScraper.test.ts"

content = """/**
 * Tests unitaires pour executeScraper (ScraperManager)
 * Mock complet de Playwright (chromium.launch, page.goto, page.$$eval, etc.)
 * et mock de fetch pour le mode RSS.
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';

const {
  mockPage,
  mockBrowser,
  mockChromiumLaunch,
} = vi.hoisted(() => {
  const p = {
    goto: vi.fn(),
    dollar: vi.fn(),
    dollarDollarEval: vi.fn(),
    dollarEval: vi.fn(),
    close: vi.fn(),
  };
  const b = {
    isConnected: vi.fn(),
    newPage: vi.fn(),
  };
  return { mockPage: p, mockBrowser: b, mockChromiumLaunch: vi.fn() };
});

vi.mock('playwright', () => ({
  chromium: { launch: mockChromiumLaunch },
}));

vi.mock('../utils/logger', () => ({
  default: { info: vi.fn(), error: vi.fn(), warn: vi.fn(), debug: vi.fn() },
}));

import { executeScraper } from './ScraperManager';

const TEST_URL = 'https://example.com/article';

function setupSuccessfulScrape(overrides?: Record<string, string>) {
  const over = overrides || {};
  const t = over.title !== undefined ? over.title : 'Test Title';
  const c = over.content || 'Test content paragraph.';
  const d = over.pubDate !== undefined ? over.pubDate : '2025-06-15T10:00:00Z';
  const img = over.image !== undefined ? over.image : 'https://example.com/img.jpg';
  const og = over.ogTitle || '';

  mockPage.goto.mockResolvedValue(undefined);
  mockPage.dollar.mockImplementation(async (selector: string) => {
    if (selector === 'h1') return { textContent: async () => t };
    return null;
  });
  mockPage.dollarDollarEval.mockResolvedValue(c);
  mockPage.dollarEval.mockImplementation(async (selector: string, _fn: unknown) => {
    if (selector.includes('og:title')) return og || 'OG Fallback';
    if (selector === 'time') return d;
    if (selector === 'img') return img;
    return '';
  });
  mockPage.close.mockResolvedValue(undefined);
}

describe('executeScraper', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockBrowser.isConnected.mockReturnValue(false);
    mockBrowser.newPage.mockResolvedValue(mockPage);
    mockChromiumLaunch.mockResolvedValue(mockBrowser);
    delete process.env.CHROMIUM_PATH;
  });

  afterEach(() => { delete process.env.CHROMIUM_PATH; });

  describe('HTML mode (default)', () => {
    it('should scrape a page successfully', async () => {
      setupSuccessfulScrape();
      const result = await executeScraper({ url: TEST_URL });
      expect(result.success).toBe(true);
      expect(result.title).toBe('Test Title');
      expect(result.content).toBe('Test content paragraph.');
      expect(result.pubDate).toBe('2025-06-15T10:00:00Z');
      expect(result.image).toBe('https://example.com/img.jpg');
      expect(result.link).toBe(TEST_URL);
    });

    it('should truncate content to 5000 chars', async () => {
      setupSuccessfulScrape({ content: 'x'.repeat(6000) });
      const result = await executeScraper({ url: TEST_URL });
      expect(result.success).toBe(true);
      expect(result.content.length).toBeLessThanOrEqual(5000);
    });

    it('should use custom selectors when provided', async () => {
      setupSuccessfulScrape();
      await executeScraper({ url: TEST_URL, selectors: { title: '.custom-title', content: '.custom-body', date: '.custom-date', image: '.custom-img' } });
      expect(mockPage.dollar).toHaveBeenCalledWith('.custom-title');
    });

    it('should fallback to og:title', async () => {
      setupSuccessfulScrape({ title: '', ogTitle: 'Fallback OG Title' });
      const result = await executeScraper({ url: TEST_URL });
      expect(result.title).toBe('Fallback OG Title');
    });

    it('should return empty for missing optional fields', async () => {
      setupSuccessfulScrape({ pubDate: '', image: '' });
      mockPage.dollarEval.mockResolvedValue('');
      const result = await executeScraper({ url: TEST_URL });
      expect(result.pubDate).toBe('');
      expect(result.image).toBe('');
    });

    it('should call page.goto with waitUntil networkidle', async () => {
      setupSuccessfulScrape();
      await executeScraper({ url: TEST_URL, timeout: 5000 });
      expect(mockPage.goto).toHaveBeenCalledWith(TEST_URL, { waitUntil: 'networkidle', timeout: 5000 });
    });

    it('should handle Playwright timeout error', async () => {
      mockPage.goto.mockRejectedValue(new Error('page.goto: Timeout 30000ms exceeded.'));
      mockPage.close.mockResolvedValue(undefined);
      const result = await executeScraper({ url: TEST_URL });
      expect(result.success).toBe(false);
      expect(result.error).toContain('timeout');
    });

    it('should handle generic scraping error', async () => {
      mockPage.goto.mockRejectedValue(new Error('net::ERR_CONNECTION_REFUSED'));
      mockPage.close.mockResolvedValue(undefined);
      const result = await executeScraper({ url: TEST_URL });
      expect(result.success).toBe(false);
      expect(result.error).toContain('ERR_CONNECTION_REFUSED');
    });

    it('should close page in finally block on error', async () => {
      mockPage.goto.mockRejectedValue(new Error('Boom'));
      mockPage.close.mockResolvedValue(undefined);
      await executeScraper({ url: TEST_URL });
      expect(mockPage.close).toHaveBeenCalled();
    });
  });

  describe('chromium.launch configuration', () => {
    it('should pass executablePath when CHROMIUM_PATH is set', async () => {
      process.env.CHROMIUM_PATH = '/usr/bin/chromium-browser';
      setupSuccessfulScrape();
      await executeScraper({ url: TEST_URL });
      expect(mockChromiumLaunch).toHaveBeenCalledWith(expect.objectContaining({ executablePath: '/usr/bin/chromium-browser', headless: true }));
    });

    it('should NOT pass executablePath when CHROMIUM_PATH is unset', async () => {
      delete process.env.CHROMIUM_PATH;
      setupSuccessfulScrape();
      await executeScraper({ url: TEST_URL });
      const callArgs = mockChromiumLaunch.mock.calls[0]?.[0] || {};
      expect(callArgs.executablePath).toBeUndefined();
    });

    it('should launch with security args', async () => {
      setupSuccessfulScrape();
      await executeScraper({ url: TEST_URL });
      expect(mockChromiumLaunch).toHaveBeenCalledWith(expect.objectContaining({ args: expect.arrayContaining(['--no-sandbox', '--disable-setuid-sandbox', '--disable-dev-shm-usage']) }));
    });
  });

  describe('RSS mode', () => {
    it('should fetch RSS feed successfully', async () => {
      const rssXml = '<rss><channel><item><title>News</title></item></channel></rss>';
      global.fetch = vi.fn().mockResolvedValue({ text: async () => rssXml });
      const result = await executeScraper({ url: 'https://example.com/feed.xml', mode: 'rss' });
      expect(result.success).toBe(true);
      expect(result.content).toBe(rssXml);
      expect(result.raw).toBe(rssXml);
    });

    it('should handle RSS fetch error', async () => {
      global.fetch = vi.fn().mockRejectedValue(new Error('Network error'));
      const result = await executeScraper({ url: 'https://example.com/feed.xml', mode: 'rss' });
      expect(result.success).toBe(false);
      expect(result.error).toContain('RSS fetch failed');
    });
  });

  describe('singleton browser', () => {
    it('should reuse connected browser', async () => {
      mockBrowser.isConnected.mockReturnValueOnce(false);
      setupSuccessfulScrape();
      await executeScraper({ url: TEST_URL });
      expect(mockChromiumLaunch).toHaveBeenCalledTimes(1);
      mockBrowser.isConnected.mockReturnValue(true);
      setupSuccessfulScrape();
      await executeScraper({ url: 'https://example.com/article2' });
      expect(mockChromiumLaunch).toHaveBeenCalledTimes(1);
    });

    it('should relaunch disconnected browser', async () => {
      mockBrowser.isConnected.mockReturnValueOnce(false);
      setupSuccessfulScrape();
      await executeScraper({ url: TEST_URL });
      expect(mockChromiumLaunch).toHaveBeenCalledTimes(1);
      mockBrowser.isConnected.mockReturnValue(false);
      setupSuccessfulScrape();
      await executeSc
