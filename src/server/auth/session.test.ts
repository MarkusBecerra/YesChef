import { afterEach, beforeEach, describe, expect, it } from "vitest";
import {
  createSessionToken,
  extractToken,
  getConfiguredPassphrase,
  safeEqual,
  verifyPassphrase,
  verifySessionToken,
} from "./session";

describe("session", () => {
  const original = process.env.APP_PASSPHRASE;
  beforeEach(() => {
    process.env.APP_PASSPHRASE = "correct horse battery staple";
  });
  afterEach(() => {
    if (original === undefined) delete process.env.APP_PASSPHRASE;
    else process.env.APP_PASSPHRASE = original;
  });

  it("reads the configured passphrase, treating blank as unset", () => {
    expect(getConfiguredPassphrase()).toBe("correct horse battery staple");
    process.env.APP_PASSPHRASE = "   ";
    expect(getConfiguredPassphrase()).toBeNull();
  });

  it("accepts the right passphrase and rejects everything else", async () => {
    expect(await verifyPassphrase("correct horse battery staple")).toBe(true);
    expect(await verifyPassphrase("correct horse battery stapl")).toBe(false);
    expect(await verifyPassphrase("")).toBe(false);
  });

  it("issues a stable token that verifies until the passphrase changes", async () => {
    const token = await createSessionToken("correct horse battery staple");
    expect(token).toMatch(/^[0-9a-f]{64}$/);
    expect(await createSessionToken("correct horse battery staple")).toBe(token);
    expect(await verifySessionToken(token)).toBe(true);
    expect(await verifySessionToken(token.slice(0, -1) + "0")).toBe(false);
    expect(await verifySessionToken(null)).toBe(false);

    process.env.APP_PASSPHRASE = "something else";
    expect(await verifySessionToken(token)).toBe(false);
  });

  it("rejects everything when no passphrase is configured", async () => {
    delete process.env.APP_PASSPHRASE;
    expect(await verifyPassphrase("anything")).toBe(false);
    expect(await verifySessionToken("anything")).toBe(false);
  });

  it("prefers a bearer header over the cookie", () => {
    expect(extractToken({ cookie: "c", authorization: "Bearer  b " })).toBe("b");
    expect(extractToken({ cookie: "c", authorization: "Basic xyz" })).toBe("c");
    expect(extractToken({ cookie: "c" })).toBe("c");
    expect(extractToken({})).toBeNull();
    expect(extractToken({ authorization: "Bearer " })).toBeNull();
  });

  it("safeEqual compares exact strings only", async () => {
    expect(await safeEqual("abc", "abc")).toBe(true);
    expect(await safeEqual("abc", "abd")).toBe(false);
    expect(await safeEqual("abc", "abcd")).toBe(false);
  });
});
