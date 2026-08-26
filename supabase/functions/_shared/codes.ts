/**
 * Code + password generation. Alphabet matches the DB CHECK on
 * households.display_code: Crockford base32 minus 0/1 (no I, L, O, U).
 * Passwords use a confusable-free alphabet. Both use crypto-secure,
 * UNBIASED random integers (rejection sampling — no modulo bias).
 */

export const DISPLAY_CODE_ALPHABET = "ABCDEFGHJKMNPQRSTVWXYZ23456789";
export const DISPLAY_CODE_LENGTH = 6;
export const DISPLAY_CODE_RE = /^[A-HJ-KM-NP-TV-Z2-9]{6}$/;

export const PASSWORD_ALPHABET = "ABCDEFGHJKMNPQRSTVWXYZabcdefghijkmnopqrstuvwxyz23456789";
export const PASSWORD_LENGTH = 16;

/** Unbiased random integer in [0, max). Injected in tests. */
export type RandInt = (max: number) => number;

export function cryptoRandInt(max: number): number {
  if (!Number.isInteger(max) || max <= 0 || max > 2 ** 32) {
    throw new Error("cryptoRandInt: max must be an integer in (0, 2^32]");
  }
  const limit = Math.floor(2 ** 32 / max) * max; // reject values >= limit
  const buf = new Uint32Array(1);
  for (;;) {
    crypto.getRandomValues(buf);
    if (buf[0] < limit) return buf[0] % max;
  }
}

export function randomChars(
  alphabet: string,
  length: number,
  randInt: RandInt = cryptoRandInt,
): string {
  let out = "";
  for (let i = 0; i < length; i++) out += alphabet[randInt(alphabet.length)];
  return out;
}

/** 6-char household join code, e.g. "K7M2QX". */
export function generateDisplayCode(randInt: RandInt = cryptoRandInt): string {
  return randomChars(DISPLAY_CODE_ALPHABET, DISPLAY_CODE_LENGTH, randInt);
}

/** 16-char cryptographically secure household password (~95 bits entropy). */
export function generateHouseholdPassword(randInt: RandInt = cryptoRandInt): string {
  return randomChars(PASSWORD_ALPHABET, PASSWORD_LENGTH, randInt);
}
