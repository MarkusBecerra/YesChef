import { describe, expect, it } from "vitest";
import { hashPassword, verifyPassword } from "./password";

describe("password hashing", () => {
  it("verifies the right password and nothing else", async () => {
    const stored = await hashPassword("saffron risotto 2026");
    expect(await verifyPassword("saffron risotto 2026", stored)).toBe(true);
    expect(await verifyPassword("saffron risotto 2027", stored)).toBe(false);
    expect(await verifyPassword("", stored)).toBe(false);
  });

  it("salts every hash, so the same password stores differently twice", async () => {
    const [a, b] = await Promise.all([hashPassword("same password"), hashPassword("same password")]);
    expect(a).not.toBe(b);
    expect(await verifyPassword("same password", a)).toBe(true);
    expect(await verifyPassword("same password", b)).toBe(true);
  });

  it("records the parameters it used", async () => {
    const [algorithm, digest, iterations] = (await hashPassword("x")).split("$");
    expect(algorithm).toBe("pbkdf2");
    expect(digest).toBe("sha256");
    expect(Number(iterations)).toBeGreaterThanOrEqual(100_000);
  });

  it("treats a malformed stored hash as a failed check rather than throwing", async () => {
    for (const stored of ["", "nonsense", "pbkdf2$sha256$1000$", "bcrypt$sha256$1000$AAAA$AAAA", "pbkdf2$sha256$0$AAAA$AAAA", "pbkdf2$sha256$1000$!!$AAAA"]) {
      expect(await verifyPassword("x", stored)).toBe(false);
    }
  });
});
