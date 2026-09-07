import { beforeAll, beforeEach, describe, expect, it } from "vitest";
import { getDb } from "@/server/db/client";
import { recipes } from "@/server/db/schema";
import { nowIso } from "@/server/recipes/values";
import { migrateTestDb, resetTestDb } from "@/test/db";
import {
  AuthError,
  changePassword,
  createInvite,
  getAccountForSession,
  getSeats,
  listInvites,
  needsOwner,
  normalizeInviteCode,
  revokeInvite,
  signIn,
  signUp,
} from "./service";

const OWNER_CODE = "open-sesame-please";

const owner = {
  name: "Markus",
  email: "Markus@Example.com",
  password: "sourdough starter 1",
  inviteCode: OWNER_CODE,
};

/** Sign up the owner, then mint a code for the next person. */
async function inviteFrom(ownerId: number, label?: string) {
  return createInvite(ownerId, { label });
}

describe("auth service", () => {
  beforeAll(migrateTestDb);
  beforeEach(async () => {
    await resetTestDb();
    process.env.AUTH_SECRET = "test secret";
    process.env.OWNER_INVITE_CODE = OWNER_CODE;
    delete process.env.MAX_ACCOUNTS;
  });

  it("makes the first account the owner and turns down the wrong setup code", async () => {
    expect(await needsOwner()).toBe(true);
    await expect(signUp({ ...owner, inviteCode: "guessing" })).rejects.toBeInstanceOf(AuthError);

    const { account } = await signUp(owner);
    expect(account.role).toBe("owner");
    expect(account.email).toBe("markus@example.com"); // stored lower-cased
    expect(await needsOwner()).toBe(false);
    expect(await getSeats()).toEqual({ used: 1, max: 6, remaining: 5 });
  });

  it("hands the recipes that predate accounts to the owner", async () => {
    const db = getDb();
    const now = nowIso();
    await db.insert(recipes).values({ title: "Grandma's arroz con pollo", createdAt: now, updatedAt: now });

    const { account, claimedRecipes } = await signUp(owner);
    expect(claimedRecipes).toBe(1);
    const [row] = await db.select({ userId: recipes.userId }).from(recipes);
    expect(row.userId).toBe(account.id);
  });

  it("only lets the second account in with a code the owner minted", async () => {
    const { account: ownerAccount } = await signUp(owner);
    const friend = { name: "Sam", email: "sam@example.com", password: "braised short ribs" };

    await expect(signUp({ ...friend, inviteCode: OWNER_CODE })).rejects.toBeInstanceOf(AuthError);
    await expect(signUp({ ...friend, inviteCode: "YESCHEF-AAAA-BBBB" })).rejects.toBeInstanceOf(AuthError);

    const invite = await inviteFrom(ownerAccount.id, "Sam");
    // typed back in lower case, without the dashes
    const { account } = await signUp({ ...friend, inviteCode: invite.code.toLowerCase().replace(/-/g, "") });
    expect(account.role).toBe("member");

    // and the code is spent
    await expect(
      signUp({ name: "Interloper", email: "nope@example.com", password: "not happening 1", inviteCode: invite.code }),
    ).rejects.toBeInstanceOf(AuthError);

    const [listed] = await listInvites();
    expect(listed).toMatchObject({ status: "used", usedByName: "Sam", label: "Sam" });
  });

  it("refuses a cancelled code, and refuses to cancel a spent one", async () => {
    const { account: ownerAccount } = await signUp(owner);
    const invite = await inviteFrom(ownerAccount.id);
    expect(await revokeInvite(invite.id)).toBe(true);
    expect(await revokeInvite(invite.id)).toBe(false);
    await expect(
      signUp({ name: "Sam", email: "sam@example.com", password: "braised short ribs", inviteCode: invite.code }),
    ).rejects.toBeInstanceOf(AuthError);
  });

  it("won't issue more open invites than there are places, or let the last place double-book", async () => {
    process.env.MAX_ACCOUNTS = "2";
    const { account: ownerAccount } = await signUp(owner);
    expect(await getSeats()).toEqual({ used: 1, max: 2, remaining: 1 });

    await inviteFrom(ownerAccount.id);
    await expect(inviteFrom(ownerAccount.id)).rejects.toBeInstanceOf(AuthError);
  });

  it("stops sign-ups once every place is taken", async () => {
    process.env.MAX_ACCOUNTS = "1";
    await signUp(owner);
    await expect(
      signUp({ name: "Sam", email: "sam@example.com", password: "braised short ribs", inviteCode: "YESCHEF-AAAA-BBBB" }),
    ).rejects.toMatchObject({ status: 403 });
  });

  it("refuses an email that already has an account, however it is capitalised", async () => {
    const { account: ownerAccount } = await signUp(owner);
    const invite = await inviteFrom(ownerAccount.id);
    await expect(
      signUp({ name: "Markus again", email: "MARKUS@example.com", password: "another password", inviteCode: invite.code }),
    ).rejects.toMatchObject({ status: 409, field: "email" });
  });

  it("signs in with the right password only", async () => {
    await signUp(owner);
    expect(await signIn({ email: "markus@example.com", password: "wrong password" })).toBeNull();
    expect(await signIn({ email: "nobody@example.com", password: owner.password })).toBeNull();

    const result = await signIn({ email: "MARKUS@example.com", password: owner.password });
    expect(result?.account.name).toBe("Markus");
    expect(result?.tokenVersion).toBe(1);
  });

  it("invalidates existing sessions when the password changes", async () => {
    const { account, tokenVersion } = await signUp(owner);
    expect(await getAccountForSession({ userId: account.id, tokenVersion })).toMatchObject({ id: account.id });

    await expect(changePassword(account.id, { currentPassword: "not it", newPassword: "brand new password" })).rejects.toBeInstanceOf(AuthError);
    await expect(changePassword(account.id, { currentPassword: owner.password, newPassword: owner.password })).rejects.toBeInstanceOf(AuthError);

    const next = await changePassword(account.id, { currentPassword: owner.password, newPassword: "brand new password" });
    expect(next).toBe(tokenVersion + 1);
    expect(await getAccountForSession({ userId: account.id, tokenVersion })).toBeNull();
    expect(await getAccountForSession({ userId: account.id, tokenVersion: next })).toMatchObject({ id: account.id });
    expect(await signIn({ email: owner.email, password: "brand new password" })).not.toBeNull();
  });

  it("normalises codes the way people retype them", () => {
    expect(normalizeInviteCode(" yeschef-7k2q-9f4m ")).toBe("YESCHEF-7K2Q-9F4M");
    expect(normalizeInviteCode("yeschef 7k2q 9f4m")).toBe("YESCHEF-7K2Q-9F4M");
    expect(normalizeInviteCode("YESCHEF7K2Q9F4M")).toBe("YESCHEF-7K2Q-9F4M");
    expect(normalizeInviteCode("something else")).toBe("SOMETHINGELSE");
  });
});
