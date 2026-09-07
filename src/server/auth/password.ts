/**
 * Password hashing with PBKDF2-SHA256 over Web Crypto only - no native modules, so this
 * runs anywhere the rest of `src/server` does (Node, Vercel functions, a future worker).
 *
 * Stored form: `pbkdf2$sha256$<iterations>$<saltB64>$<hashB64>`. The iteration count travels
 * with the hash so it can be raised later without stranding existing accounts.
 */

const ALGORITHM = "pbkdf2";
const DIGEST = "sha256";
const ITERATIONS = 210_000;
const KEY_BITS = 256;
const SALT_BYTES = 16;

/** Long enough to matter, short enough that people pick a passphrase rather than "Pa$$w0rd". */
export const MIN_PASSWORD_LENGTH = 10;
export const MAX_PASSWORD_LENGTH = 200;

const encoder = new TextEncoder();

function toBase64(bytes: Uint8Array): string {
  let binary = "";
  for (const byte of bytes) binary += String.fromCharCode(byte);
  return btoa(binary);
}

function fromBase64(value: string): Uint8Array {
  const binary = atob(value);
  const bytes = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i++) bytes[i] = binary.charCodeAt(i);
  return bytes;
}

async function derive(password: string, salt: Uint8Array, iterations: number): Promise<Uint8Array> {
  const key = await crypto.subtle.importKey("raw", encoder.encode(password), "PBKDF2", false, ["deriveBits"]);
  const bits = await crypto.subtle.deriveBits(
    { name: "PBKDF2", salt: salt as BufferSource, iterations, hash: "SHA-256" },
    key,
    KEY_BITS,
  );
  return new Uint8Array(bits);
}

export async function hashPassword(password: string): Promise<string> {
  const salt = crypto.getRandomValues(new Uint8Array(SALT_BYTES));
  const hash = await derive(password, salt, ITERATIONS);
  return [ALGORITHM, DIGEST, ITERATIONS, toBase64(salt), toBase64(hash)].join("$");
}

/** Constant-time over the digest bytes; a malformed stored hash is a failed check, not a throw. */
export async function verifyPassword(password: string, stored: string): Promise<boolean> {
  const parts = stored.split("$");
  if (parts.length !== 5) return false;
  const [algorithm, digest, iterationsRaw, saltB64, hashB64] = parts;
  if (algorithm !== ALGORITHM || digest !== DIGEST) return false;
  const iterations = Number(iterationsRaw);
  if (!Number.isInteger(iterations) || iterations < 1000 || iterations > 5_000_000) return false;

  let expected: Uint8Array;
  let salt: Uint8Array;
  try {
    salt = fromBase64(saltB64);
    expected = fromBase64(hashB64);
  } catch {
    return false;
  }
  if (salt.length === 0 || expected.length === 0) return false;

  const actual = await derive(password, salt, iterations);
  if (actual.length !== expected.length) return false;
  let diff = 0;
  for (let i = 0; i < actual.length; i++) diff |= actual[i] ^ expected[i];
  return diff === 0;
}
