import { and, asc, count, desc, eq, isNull, sql } from "drizzle-orm";
import { getDb } from "@/server/db/client";
import { inviteCodes, recipes, users } from "@/server/db/schema";
import { nowIso } from "@/server/recipes/values";
import { hashPassword, verifyPassword } from "./password";
import { getBootstrapCode, safeEqual } from "./session";
import {
  changePasswordSchema,
  createInviteSchema,
  signInSchema,
  signUpSchema,
  updateProfileSchema,
  AuthError,
  type Account,
  type ChangePasswordInput,
  type CreateInviteInput,
  type Invite,
  type InviteStatus,
  type SignInInput,
  type SignUpInput,
  type UpdateProfileInput,
} from "./types";

export { AuthError } from "./types";

const accountColumns = {
  id: users.id,
  email: users.email,
  name: users.name,
  role: users.role,
  createdAt: users.createdAt,
};

/* ---------- invite codes ---------- */

/** No I, O, 0 or 1: these get read aloud and typed on phones. */
const CODE_ALPHABET = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789";
const CODE_PREFIX = "YESCHEF";
const CODE_GROUPS = 2;
const CODE_GROUP_LENGTH = 4;

function randomCodeBody(): string {
  const bytes = crypto.getRandomValues(new Uint8Array(CODE_GROUPS * CODE_GROUP_LENGTH));
  const chars = Array.from(bytes, (b) => CODE_ALPHABET[b % CODE_ALPHABET.length]);
  const groups: string[] = [];
  for (let i = 0; i < CODE_GROUPS; i++) groups.push(chars.slice(i * CODE_GROUP_LENGTH, (i + 1) * CODE_GROUP_LENGTH).join(""));
  return groups.join("-");
}

export function generateInviteCode(): string {
  return `${CODE_PREFIX}-${randomCodeBody()}`;
}

/**
 * Accept a code however it was pasted back: lower case, spaces, missing dashes. Anything
 * that isn't shaped like one of our codes is returned upper-cased and simply won't match.
 */
export function normalizeInviteCode(raw: string): string {
  const compact = raw.toUpperCase().replace(/[^A-Z0-9]/g, "");
  const expected = CODE_PREFIX.length + CODE_GROUPS * CODE_GROUP_LENGTH;
  if (!compact.startsWith(CODE_PREFIX) || compact.length !== expected) return compact;
  const body = compact.slice(CODE_PREFIX.length);
  const groups: string[] = [];
  for (let i = 0; i < CODE_GROUPS; i++) groups.push(body.slice(i * CODE_GROUP_LENGTH, (i + 1) * CODE_GROUP_LENGTH));
  return `${CODE_PREFIX}-${groups.join("-")}`;
}

function inviteStatus(row: { usedAt: string | null; revokedAt: string | null }): InviteStatus {
  if (row.usedAt) return "used";
  if (row.revokedAt) return "revoked";
  return "open";
}

/* ---------- accounts ---------- */

export async function countAccounts(): Promise<number> {
  const db = getDb();
  const [row] = await db.select({ value: count() }).from(users);
  return row?.value ?? 0;
}

/** True before anybody has signed up: the sign-up form then asks for the bootstrap code. */
export async function needsOwner(): Promise<boolean> {
  return (await countAccounts()) === 0;
}

export async function listAccounts(): Promise<Account[]> {
  const db = getDb();
  return db.select(accountColumns).from(users).orderBy(asc(users.createdAt), asc(users.id));
}

export async function getAccount(id: number): Promise<Account | null> {
  const db = getDb();
  const [row] = await db.select(accountColumns).from(users).where(eq(users.id, id)).limit(1);
  return row ?? null;
}

/**
 * The account behind a session token: the token's version has to still match the row, so a
 * password change or a "sign out everywhere" invalidates tokens that are otherwise valid.
 */
export async function getAccountForSession(claims: { userId: number; tokenVersion: number }): Promise<Account | null> {
  const db = getDb();
  const [row] = await db
    .select({ ...accountColumns, tokenVersion: users.tokenVersion })
    .from(users)
    .where(eq(users.id, claims.userId))
    .limit(1);
  if (!row || row.tokenVersion !== claims.tokenVersion) return null;
  return { id: row.id, email: row.email, name: row.name, role: row.role, createdAt: row.createdAt };
}

/**
 * Did this write lose a race to the unique index on users.email?
 *
 * Drizzle wraps the driver error ("Failed query: insert into ..."), which wraps LibsqlError,
 * which wraps the SqliteError that actually names the constraint - so walk the cause chain
 * rather than reading the top-level message.
 */
function isEmailCollision(err: unknown): boolean {
  let current: unknown = err;
  for (let depth = 0; current instanceof Error && depth < 5; depth++) {
    if (/unique constraint failed:\s*users\.email/i.test(current.message)) return true;
    current = current.cause;
  }
  return false;
}

async function findByEmail(email: string) {
  const db = getDb();
  const [row] = await db.select().from(users).where(eq(users.email, email)).limit(1);
  return row ?? null;
}

/**
 * Recipes written before accounts existed have no owner. The first account to be created -
 * the owner's - takes them, which is what turns a single-user install into user number one.
 */
async function claimUnownedRecipes(userId: number): Promise<number> {
  const db = getDb();
  const rows = await db.update(recipes).set({ userId }).where(isNull(recipes.userId)).returning({ id: recipes.id });
  return rows.length;
}

/**
 * Create an account. Invite-only in both directions: the very first account needs the
 * bootstrap code from the environment (OWNER_INVITE_CODE, or APP_PASSPHRASE) and becomes
 * the owner; every later account spends one of the codes the owner handed out.
 */
export async function signUp(input: SignUpInput): Promise<{ account: Account; tokenVersion: number; claimedRecipes: number }> {
  const db = getDb();
  const parsed = signUpSchema.parse(input);

  // There is no headcount to check: an account costs a single-use code that only the owner
  // can mint, so the code is the gate. How many people cook here is the owner's business.
  const isFirstAccount = (await countAccounts()) === 0;
  if (await findByEmail(parsed.email)) {
    throw new AuthError("There's already an account with that email.", 409, "email");
  }

  let inviteId: number | null = null;

  if (isFirstAccount) {
    const bootstrap = getBootstrapCode();
    if (!bootstrap) {
      throw new AuthError("The first account needs OWNER_INVITE_CODE set on the server.", 503, "inviteCode");
    }
    if (!(await safeEqual(parsed.inviteCode, bootstrap))) {
      throw new AuthError("That isn't the setup code for this server.", 403, "inviteCode");
    }
  } else {
    const code = normalizeInviteCode(parsed.inviteCode);
    const [invite] = await db.select().from(inviteCodes).where(eq(inviteCodes.code, code)).limit(1);
    if (!invite) throw new AuthError("That invite code isn't valid.", 403, "inviteCode");
    if (invite.usedAt) throw new AuthError("That invite code has already been used.", 403, "inviteCode");
    if (invite.revokedAt) throw new AuthError("That invite code was cancelled.", 403, "inviteCode");
    inviteId = invite.id;
  }

  const passwordHash = await hashPassword(parsed.password);
  const now = nowIso();
  let created: Account & { tokenVersion: number };
  try {
    // Hashing takes a quarter of a second, so the check above can go stale: the unique index
    // is what actually decides, and the cook should still read "that email is taken".
    [created] = await db
      .insert(users)
      .values({
        email: parsed.email,
        name: parsed.name,
        passwordHash,
        role: isFirstAccount ? "owner" : "member",
        createdAt: now,
        updatedAt: now,
      })
      .returning({ ...accountColumns, tokenVersion: users.tokenVersion });
  } catch (err) {
    if (isEmailCollision(err)) throw new AuthError("There's already an account with that email.", 409, "email");
    throw err;
  }

  if (inviteId !== null) {
    // Spend the code, but only if it is still unspent: two people racing the same invite
    // means the second one gets nothing to claim and is turned away below.
    const spent = await db
      .update(inviteCodes)
      .set({ usedByUserId: created.id, usedAt: now })
      .where(and(eq(inviteCodes.id, inviteId), isNull(inviteCodes.usedAt), isNull(inviteCodes.revokedAt)))
      .returning({ id: inviteCodes.id });
    if (spent.length === 0) {
      await db.delete(users).where(eq(users.id, created.id));
      throw new AuthError("That invite code has already been used.", 403, "inviteCode");
    }
  }

  const claimedRecipes = isFirstAccount ? await claimUnownedRecipes(created.id) : 0;
  const { tokenVersion, ...account } = created;
  return { account, tokenVersion, claimedRecipes };
}

/** Check an email and password. Returns null for both "no such user" and "wrong password". */
export async function signIn(input: SignInInput): Promise<{ account: Account; tokenVersion: number } | null> {
  const parsed = signInSchema.parse(input);
  const row = await findByEmail(parsed.email);
  if (!row) {
    // Spend roughly the same time as a real check so the response doesn't reveal who has an account.
    await hashPassword(parsed.password);
    return null;
  }
  if (!(await verifyPassword(parsed.password, row.passwordHash))) return null;
  return {
    account: { id: row.id, email: row.email, name: row.name, role: row.role, createdAt: row.createdAt },
    tokenVersion: row.tokenVersion,
  };
}

/** Returns the new token version, which every other session's token will fail against. */
export async function changePassword(userId: number, input: ChangePasswordInput): Promise<number> {
  const db = getDb();
  const parsed = changePasswordSchema.parse(input);
  const [row] = await db.select().from(users).where(eq(users.id, userId)).limit(1);
  if (!row) throw new AuthError("Account not found", 404);
  if (!(await verifyPassword(parsed.currentPassword, row.passwordHash))) {
    throw new AuthError("That isn't your current password.", 403, "currentPassword");
  }
  if (await verifyPassword(parsed.newPassword, row.passwordHash)) {
    throw new AuthError("Pick a password you aren't already using.", 400, "newPassword");
  }

  const [updated] = await db
    .update(users)
    .set({
      passwordHash: await hashPassword(parsed.newPassword),
      tokenVersion: sql`${users.tokenVersion} + 1`,
      updatedAt: nowIso(),
    })
    .where(eq(users.id, userId))
    .returning({ tokenVersion: users.tokenVersion });
  return updated.tokenVersion;
}

export async function updateProfile(userId: number, input: UpdateProfileInput): Promise<Account> {
  const db = getDb();
  const parsed = updateProfileSchema.parse(input);
  if (parsed.email) {
    const existing = await findByEmail(parsed.email);
    if (existing && existing.id !== userId) throw new AuthError("There's already an account with that email.", 409, "email");
  }
  let row: Account | undefined;
  try {
    [row] = await db
      .update(users)
      .set({
        ...(parsed.name !== undefined ? { name: parsed.name } : {}),
        ...(parsed.email !== undefined ? { email: parsed.email } : {}),
        updatedAt: nowIso(),
      })
      .where(eq(users.id, userId))
      .returning(accountColumns);
  } catch (err) {
    if (isEmailCollision(err)) throw new AuthError("There's already an account with that email.", 409, "email");
    throw err;
  }
  if (!row) throw new AuthError("Account not found", 404);
  return row;
}

/* ---------- invites (owner only; the caller checks the role) ---------- */

export async function listInvites(): Promise<Invite[]> {
  const db = getDb();
  const rows = await db
    .select({
      id: inviteCodes.id,
      code: inviteCodes.code,
      label: inviteCodes.label,
      createdAt: inviteCodes.createdAt,
      usedAt: inviteCodes.usedAt,
      revokedAt: inviteCodes.revokedAt,
      usedByName: users.name,
    })
    .from(inviteCodes)
    .leftJoin(users, eq(users.id, inviteCodes.usedByUserId))
    .orderBy(desc(inviteCodes.createdAt), desc(inviteCodes.id));
  return rows.map(({ revokedAt, ...row }) => ({ ...row, status: inviteStatus({ ...row, revokedAt }) }));
}

/** Mint a code. The code itself is the gate: single use, and only the owner can make one. */
export async function createInvite(createdByUserId: number, input: CreateInviteInput = {}): Promise<Invite> {
  const db = getDb();
  const parsed = createInviteSchema.parse(input);

  const now = nowIso();
  for (let attempt = 0; attempt < 5; attempt++) {
    const code = generateInviteCode();
    const [existing] = await db.select({ id: inviteCodes.id }).from(inviteCodes).where(eq(inviteCodes.code, code)).limit(1);
    if (existing) continue;
    const [row] = await db
      .insert(inviteCodes)
      .values({ code, label: parsed.label ?? null, createdByUserId, createdAt: now })
      .returning();
    return { id: row.id, code: row.code, label: row.label, status: "open", createdAt: row.createdAt, usedAt: null, usedByName: null };
  }
  throw new AuthError("Couldn't mint a unique code - try again.", 500);
}

/** Cancel an unused code. Used codes stay as a record of who joined with what. */
export async function revokeInvite(id: number): Promise<boolean> {
  const db = getDb();
  const rows = await db
    .update(inviteCodes)
    .set({ revokedAt: nowIso() })
    .where(and(eq(inviteCodes.id, id), isNull(inviteCodes.usedAt), isNull(inviteCodes.revokedAt)))
    .returning({ id: inviteCodes.id });
  return rows.length > 0;
}
