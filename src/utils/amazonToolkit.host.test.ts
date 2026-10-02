import { describe, expect, it } from "vitest";
import { isAllowedAmazonHost } from "./amazonToolkit.js";

describe("isAllowedAmazonHost", () => {
  it("allows Amazon retail hosts and Keepa", () => {
    expect(isAllowedAmazonHost("www.amazon.fr")).toBe(true);
    expect(isAllowedAmazonHost("amazon.com")).toBe(true);
    expect(isAllowedAmazonHost("www.amazon.co.uk")).toBe(true);
    expect(isAllowedAmazonHost("api.keepa.com")).toBe(true);
  });

  it("rejects lookalike and private hosts", () => {
    expect(isAllowedAmazonHost("www.amazon.com.evil.com")).toBe(false);
    expect(isAllowedAmazonHost("evil.com")).toBe(false);
    expect(isAllowedAmazonHost("169.254.169.254")).toBe(false);
    expect(isAllowedAmazonHost("amazon.com.attacker.com")).toBe(false);
  });
});
