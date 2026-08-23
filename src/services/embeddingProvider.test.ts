/**
 * embeddingProvider.test.ts — Tests pour l'embedding interchangeable et la recherche hybride
 */
import { describe, it, expect } from "vitest";
import {
  HybridSearch,
  BM25Index,
  LexicalEmbeddingProvider,
  getEmbeddingProvider,
} from "./embeddingProvider.js";

describe("embeddingProvider", () => {
  describe("LexicalEmbeddingProvider", () => {
    it("should embed text into a vector", async () => {
      const provider = new LexicalEmbeddingProvider();
      const result = await provider.embed("hello world test");
      expect(result.values.length).toBe(256);
      expect(result.dimensions).toBe(256);
    });

    it("should embed batch", async () => {
      const provider = new LexicalEmbeddingProvider();
      const results = await provider.embedBatch(["hello", "world"]);
      expect(results.length).toBe(2);
    });

    it("should always be available", () => {
      const provider = new LexicalEmbeddingProvider();
      expect(provider.isAvailable()).toBe(true);
    });
  });

  describe("BM25Index", () => {
    it("should rank documents by relevance", () => {
      const bm25 = new BM25Index();
      bm25.addDoc("1", "the quick brown fox");
      bm25.addDoc("2", "the lazy dog sleeps");
      bm25.addDoc("3", "quick fox jumps over dog");

      const results = bm25.search("quick fox", 2);
      expect(results.length).toBe(2);
      // Both doc 1 and 3 contain "quick" and "fox" — either can rank first
      expect(["1", "3"]).toContain(results[0].id);
      // Doc 2 should not be in results (no matching terms)
      expect(results.find((r) => r.id === "2")).toBeUndefined();
    });

    it("should return empty for no matches", () => {
      const bm25 = new BM25Index();
      bm25.addDoc("1", "hello world");
      const results = bm25.search("nonexistent");
      expect(results.length).toBe(0);
    });
  });

  describe("HybridSearch", () => {
    it("should combine lexical and vector search", async () => {
      const search = new HybridSearch();
      await search.addDocument("1", "The quick brown fox jumps");
      await search.addDocument("2", "Machine learning is fascinating");
      await search.addDocument("3", "The fox is a clever animal");

      const results = await search.search("fox animal", 2);
      expect(results.length).toBe(2);
      expect(results[0].rerankedScore).toBeGreaterThan(0);
    });

    it("should return empty for empty index", async () => {
      const search = new HybridSearch();
      const results = await search.search("test");
      expect(results.length).toBe(0);
    });

    it("should clear properly", async () => {
      const search = new HybridSearch();
      await search.addDocument("1", "test");
      expect(search.size).toBe(1);
      search.clear();
      expect(search.size).toBe(0);
    });
  });

  describe("getEmbeddingProvider", () => {
    it("should return lexical provider by default", () => {
      const provider = getEmbeddingProvider();
      expect(provider.name).toBe("lexical-tf");
    });
  });
});
