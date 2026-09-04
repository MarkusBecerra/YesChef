/**
 * Single-user passphrase gate.
 *
 * The session token is HMAC-SHA256(passphrase, fixed label). It is deterministic,
 * so it doubles as a bearer token for non-browser clients, and rotating the
 * passphrase invalidates every session at once. Uses Web Crypto only, so it runs
 * in Node, the Next.js proxy, or any other JS runtime.
 */

export const SESSION_COOKIE = "yeschef_session";
export const SESSION_MAX_AGE_SECONDS = 60 * 60 * 24 * 365; // one year

const TOKEN_LABEL = "yeschef:session:v1";

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

/** The configured passphrase, or null when the app hasn't been set up yet. */
export function getConfiguredPassphrase(): string | null {
  const value = process.env.APP_PASSPHRASE?.trim();
  return value ? value : null;
}

export async function createSessionToken(passphrase: string): Promise<string> {
  return hmacSha256(passphrase, TOKEN_LABEL);
}

export async function verifyPassphrase(candidate: string): Promise<boolean> {
  const configured = getConfiguredPassphrase();
  if (!configured) return false;
  return safeEqual(candidate, configured);
}

export async function verifySessionToken(token: string | null | undefined): Promise<boolean> {
  const configured = getConfiguredPassphrase();
  if (!configured || !token) return false;
  const expected = await createSessionToken(configured);
  return safeEqual(token, expected);
}

/** Pull a session token out of a request: cookie for browsers, bearer header for native clients. */
export function extractToken(input: { cookie?: string | null; authorization?: string | null }): string | null {
  const auth = input.authorization?.trim();
  if (auth?.toLowerCase().startsWith("bearer ")) return auth.slice(7).trim() || null;
  return input.cookie?.trim() || null;
}
