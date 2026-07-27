import { describe, it, expect } from "vitest";
import { createHmac } from "node:crypto";
import { verifySignature } from "../services/webhookReceiver.js";

describe("webhookReceiver", () => {
  it("verifySignature validates correct HMAC", () => {
    const payload = Buffer.from('{"test":true}');
    const secret = "mysecret";
    const sig = "sha256=" + createHmac("sha256", secret).update(payload).digest("hex");
    expect(verifySignature(payload, sig, secret)).toBe(true);
  });

  it("verifySignature rejects wrong secret", () => {
    const payload = Buffer.from('{"test":true}');
    const sig = "sha256=" + createHmac("sha256", "wrong").update(payload).digest("hex");
    expect(verifySignature(payload, sig, "right")).toBe(false);
  });

  it("verifySignature rejects missing prefix", () => {
    const payload = Buffer.from("test");
    expect(verifySignature(payload, "abc123", "secret")).toBe(false);
  });

  it("verifySignature rejects wrong length", () => {
    const payload = Buffer.from("test");
    expect(verifySignature(payload, "sha256=short", "secret")).toBe(false);
  });
});
