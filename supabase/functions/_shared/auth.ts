/**
 * Password hashing (PBKDF2-HMAC-SHA256 via WebCrypto — works in Deno Edge
 * Functions and Node) and access-token primitives.
 *
 * Stored format (self-describing, upgradeable):
 *   pbkdf2$sha256$<iterations>$<salt b64>$<hash b64>
 *
 * Legacy dev format (old seed placeholders) is still verified: plain
 * sha256-hex. Detected by the missing "pbkdf2$" prefix.
 */

export const PBKDF2_ITERATIONS = 600_000; // OWASP-recommended for PBKDF2-HMAC-SHA256
export const SALT_BYTES = 16;
export const HASH_BYTES = 32;
export const PREFIX = "pbkdf2$sha256$";

const encoder = new TextEncoder();

function bytesToBase64(bytes: Uint8Array): string {
  let bin = "";
  for (const b of bytes) bin += String.fromCharCode(b);
  return btoa(bin);
}

function base64ToBytes(b64: string): Uint8Array {
  const bin = atob(b64);
  const out = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) out[i] = bin.charCodeAt(i);
  return out;
}

function bytesToBase64Url(bytes: Uint8Array): string {
  return bytesToBase64(bytes).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
}

function timingSafeEqual(a: Uint8Array, b: Uint8Array): boolean {
  if (a.length !== b.length) return false;
  let diff = 0;
  for (let i = 0; i < a.length; i++) diff |= a[i] ^ b[i];
  return diff === 0;
}

export async function sha256Hex(input: string): Promise<string> {
  const digest = await crypto.subtle.digest("SHA-256", encoder.encode(input));
  return Array.from(new Uint8Array(digest))
    .map((b) => b.toString(16).padStart(2, "0"))
    .join("");
}

async function pbkdf2(password: string, salt: Uint8Array, iterations: number): Promise<Uint8Array> {
  const keyMaterial = await crypto.subtle.importKey(
    "raw",
    encoder.encode(password),
    "PBKDF2",
    false,
    ["deriveBits"],
  );
  const bits = await crypto.subtle.deriveBits(
    { name: "PBKDF2", hash: "SHA-256", salt: salt as BufferSource, iterations },
    keyMaterial,
    HASH_BYTES * 8,
  );
  return new Uint8Array(bits);
}

/** Hash a password into the self-describing pbkdf2$ format. */
export async function hashPassword(password: string): Promise<string> {
  const salt = crypto.getRandomValues(new Uint8Array(SALT_BYTES));
  const hash = await pbkdf2(password, salt, PBKDF2_ITERATIONS);
  return `${PREFIX}${PBKDF2_ITERATIONS}$${bytesToBase64(salt)}$${bytesToBase64(hash)}`;
}

/** Constant-time password verification (pbkdf2$ format + legacy sha256-hex). */
export async function verifyPassword(password: string, stored: string): Promise<boolean> {
  if (stored.startsWith(PREFIX)) {
    const parts = stored.split("$"); // [pbkdf2, sha256, iter, salt, hash]
    if (parts.length !== 5 || parts[1] !== "sha256") return false;
    const iterations = Number(parts[2]);
    if (!Number.isInteger(iterations) || iterations < 1) return false;
    try {
      const actual = await pbkdf2(password, base64ToBytes(parts[3]), iterations);
      return timingSafeEqual(actual, base64ToBytes(parts[4]));
    } catch {
      return false;
    }
  }
  // Legacy dev format: plain sha256 hex (old seed placeholders).
  return (await sha256Hex(password)) === stored;
}

/** 32 random bytes, base64url (43 chars). The bearer token returned to clients. */
export function generateAccessToken(): string {
  return bytesToBase64Url(crypto.getRandomValues(new Uint8Array(32)));
}

/** Hash a bearer token for storage — MUST match the SQL helper
 * `encode(sha256(...), 'hex')` used by hearth_private.current_household_id(). */
export function tokenHash(token: string): Promise<string> {
  return sha256Hex(token);
}
