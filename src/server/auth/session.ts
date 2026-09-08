/**
 * Stateless session tokens.
 *
 * A token is `v1.<userId>.<tokenVersion>.<issuedAt>.<hmac>`, signed with the app secret.
 * Nothing is stored server-side, so the proxy can check a request without touching the
 * database (which it cannot reach on the edge anyway) - and because Next's own guidance is
 * that the proxy is an optimistic check, the real check happens again in the data layer,
 * where `tokenVersion` is compared against the user row. Bumping that column is what signs
 * a user out everywhere; rotating the secret signs everyone out at once.
 *
 * Uses Web Crypto only, so it runs in Node, the proxy, or any other JS runtime. The token
 * doubles as a bearer credential for non-browser clients.
 */

export const SESSION_COOKIE = "yeschef_session";
export const SESSION_MAX_AGE_SECONDS = 60 * 60 * 24 * 30; // 30 days

const TOKEN_VERSION = "v1";

const encoder = new TextEncoder();

function toHex(bytes: ArrayBuffer): string {
  return Array.from(new Uint8Array(bytes), (b) => b.toString(16).padStart(2, "0")).join("");
}

async function hmacSha256(key: string, message: string): Promise<string> {
  const cryptoKey = await crypto.subtle.importKey(
    "raw",
    encoder.encode(key),
    { name: "HMAC", hash: "SHA-256" },
    false,
    ["sign"],
  );
  return toHex(await crypto.subtle.sign("HMAC", cryptoKey, encoder.encode(message)));
}

/** Constant-time string equality (hashes both sides so length differences don't leak timing). */
export async function safeEqual(a: string, b: string): Promise<boolean> {
  const [da, db] = await Promise.all([
    crypto.subtle.digest("SHA-256", encoder.encode(a)),
    crypto.subtle.digest("SHA-256", encoder.encode(b)),
  ]);
  const ua = new Uint8Array(da);
  const ub = new Uint8Array(db);
  let diff = 0;
  for (let i = 0; i < ua.length; i++) diff |= ua[i] ^ ub[i];
  return diff === 0 && a.length === b.length;
}

/**
 * The key session tokens are signed with. AUTH_SECRET is the real setting; APP_PASSPHRASE
 * is accepted as a fallback so a deployment that predates accounts keeps working after the
 * upgrade without a new environment variable.
 */
export function getAuthSecret(): string | null {
  const secret = process.env.AUTH_SECRET?.trim();
  if (secret) return secret;
  const legacy = process.env.APP_PASSPHRASE?.trim();
  return legacy ? legacy : null;
}

/** The passphrase that lets the very first account be created. See server/auth/service.ts. */
export function getBootstrapCode(): string | null {
  const explicit = process.env.OWNER_INVITE_CODE?.trim();
  if (explicit) return explicit;
  const legacy = process.env.APP_PASSPHRASE?.trim();
  return legacy ? legacy : null;
}

export type SessionClaims = {
  userId: number;
  /** Must still match the user row; see the module comment. */
  tokenVersion: number;
  /** Seconds since the epoch. */
  issuedAt: number;
};

function payload(claims: SessionClaims): string {
  return [TOKEN_VERSION, claims.userId, claims.tokenVersion, claims.issuedAt].join(".");
}

export async function createSessionToken(claims: Omit<SessionClaims, "issuedAt"> & { issuedAt?: number }): Promise<string> {
  const secret = getAuthSecret();
  if (!secret) throw new Error("AUTH_SECRET is not configured");
  const full: SessionClaims = { ...claims, issuedAt: claims.issuedAt ?? Math.floor(Date.now() / 1000) };
  const body = payload(full);
  return `${body}.${await hmacSha256(secret, body)}`;
}

/** Claims from a token whose signature is valid and whose age is inside the window, else null. */
export async function readSessionToken(token: string | null | undefined): Promise<SessionClaims | null> {
  const secret = getAuthSecret();
  if (!secret || !token) return null;

  const parts = token.split(".");
  if (parts.length !== 5) return null;
  const [version, userIdRaw, tokenVersionRaw, issuedAtRaw, signature] = parts;
  if (version !== TOKEN_VERSION) return null;

  const userId = Number(userIdRaw);
  const tokenVersion = Number(tokenVersionRaw);
  const issuedAt = Number(issuedAtRaw);
  if (!Number.isInteger(userId) || userId <= 0) return null;
  if (!Number.isInteger(tokenVersion) || tokenVersion <= 0) return null;
  if (!Number.isInteger(issuedAt) || issuedAt <= 0) return null;

  const claims: SessionClaims = { userId, tokenVersion, issuedAt };
  const expected = await hmacSha256(secret, payload(claims));
  if (!(await safeEqual(signature, expected))) return null;

  const age = Math.floor(Date.now() / 1000) - issuedAt;
  if (age > SESSION_MAX_AGE_SECONDS || age < -60) return null;
  return claims;
}

/** Pull a session token out of a request: cookie for browsers, bearer header for native clients. */
export function extractToken(input: { cookie?: string | null; authorization?: string | null }): string | null {
  const auth = input.authorization?.trim();
  if (auth?.toLowerCase().startsWith("bearer ")) return auth.slice(7).trim() || null;
  return input.cookie?.trim() || null;
}
