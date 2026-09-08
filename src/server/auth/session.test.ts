import { afterEach, beforeEach, describe, expect, it } from "vitest";
import {
  createSessionToken,
  extractToken,
  getAuthSecret,
  getBootstrapCode,
  readSessionToken,
  safeEqual,
  SESSION_MAX_AGE_SECONDS,
} from "./session";

describe("session", () => {
  const originalSecret = process.env.AUTH_SECRET;
  const originalPassphrase = process.env.APP_PASSPHRASE;
  const originalOwnerCode = process.env.OWNER_INVITE_CODE;

  beforeEach(() => {
    process.env.AUTH_SECRET = "correct horse battery staple";
    delete process.env.APP_PASSPHRASE;
    delete process.env.OWNER_INVITE_CODE;
  });

  afterEach(() => {
    for (const [key, value] of [
      ["AUTH_SECRET", originalSecret],
      ["APP_PASSPHRASE", originalPassphrase],
      ["OWNER_INVITE_CODE", originalOwnerCode],
    ] as const) {
      if (value === undefined) delete process.env[key];
      else process.env[key] = value;
    }
  });

  it("reads the secret, treating blank as unset and falling back to the old passphrase", () => {
    expect(getAuthSecret()).toBe("correct horse battery staple");
    process.env.AUTH_SECRET = "   ";
    expect(getAuthSecret()).toBeNull();
    process.env.APP_PASSPHRASE = "legacy gate";
    expect(getAuthSecret()).toBe("legacy gate");
  });

  it("prefers OWNER_INVITE_CODE over the old passphrase for the first account", () => {
    expect(getBootstrapCode()).toBeNull();
    process.env.APP_PASSPHRASE = "legacy gate";
    expect(getBootstrapCode()).toBe("legacy gate");
    process.env.OWNER_INVITE_CODE = "let me in";
    expect(getBootstrapCode()).toBe("let me in");
  });

  it("round-trips the claims it signed", async () => {
    const token = await createSessionToken({ userId: 7, tokenVersion: 3 });
    expect(token).toMatch(/^v1\.7\.3\.\d+\.[0-9a-f]{64}$/);
    expect(await readSessionToken(token)).toMatchObject({ userId: 7, tokenVersion: 3 });
  });

  it("rejects a token that was tampered with, truncated, or signed with another secret", async () => {
    const token = await createSessionToken({ userId: 7, tokenVersion: 3 });
    // Flip the last character of the signature, whatever it happens to be.
    expect(await readSessionToken(token.slice(0, -1) + (token.endsWith("0") ? "1" : "0"))).toBeNull();
    expect(await readSessionToken(token.replace("v1.7.3", "v1.8.3"))).toBeNull();
    expect(await readSessionToken(token.split(".").slice(0, 4).join("."))).toBeNull();
    expect(await readSessionToken(null)).toBeNull();
    expect(await readSessionToken("")).toBeNull();

    process.env.AUTH_SECRET = "something else";
    expect(await readSessionToken(token)).toBeNull();
  });

  it("rejects a token older than the window, or dated in the future", async () => {
    const now = Math.floor(Date.now() / 1000);
    const stale = await createSessionToken({ userId: 1, tokenVersion: 1, issuedAt: now - SESSION_MAX_AGE_SECONDS - 60 });
    expect(await readSessionToken(stale)).toBeNull();

    const fresh = await createSessionToken({ userId: 1, tokenVersion: 1, issuedAt: now - 10 });
    expect(await readSessionToken(fresh)).not.toBeNull();

    const future = await createSessionToken({ userId: 1, tokenVersion: 1, issuedAt: now + 600 });
    expect(await readSessionToken(future)).toBeNull();
  });

  it("refuses to sign anything when no secret is configured", async () => {
    delete process.env.AUTH_SECRET;
    await expect(createSessionToken({ userId: 1, tokenVersion: 1 })).rejects.toThrow();
    expect(await readSessionToken("v1.1.1.1.abc")).toBeNull();
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
