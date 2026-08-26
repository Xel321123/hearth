import { test } from "node:test";
import assert from "node:assert/strict";
import {
  generateAccessToken,
  hashPassword,
  PREFIX,
  sha256Hex,
  tokenHash,
  verifyPassword,
} from "../functions/_shared/auth.ts";

test("hashPassword produces the self-describing pbkdf2 format", async () => {
  const h = await hashPassword("correct horse battery staple");
  assert.ok(h.startsWith(PREFIX));
  const parts = h.split("$");
  assert.equal(parts.length, 5); // pbkdf2, sha256, iterations, salt, hash
  assert.equal(parts[1], "sha256");
  assert.equal(parts[2], "600000");
  assert.ok(parts[3].length >= 20, "salt base64 present");
  assert.ok(parts[4].length >= 40, "hash base64 present");
});

test("verify roundtrip: correct password passes, wrong fails", async () => {
  const h = await hashPassword("secret-pass");
  assert.equal(await verifyPassword("secret-pass", h), true);
  assert.equal(await verifyPassword("wrong-pass", h), false);
});

test("tampered stored hash fails verification", async () => {
  const h = await hashPassword("secret-pass");
  const tampered = h.slice(0, -2) + (h.endsWith("==") ? "AA" : "==");
  assert.equal(await verifyPassword("secret-pass", tampered), false);
});

test("legacy sha256-hex placeholder still verifies (dev seed compat)", async () => {
  const legacy = await sha256Hex("dev-password-alpha");
  assert.equal(await verifyPassword("dev-password-alpha", legacy), true);
  assert.equal(await verifyPassword("nope", legacy), false);
});

test("access tokens: 32 bytes base64url, unpadded, unique", () => {
  const a = generateAccessToken();
  const b = generateAccessToken();
  assert.match(a, /^[A-Za-z0-9_-]{43}$/);
  assert.notEqual(a, b);
});

test("tokenHash is lowercase sha256 hex — same primitive as the SQL RLS helper", async () => {
  const h = await tokenHash("dev-token-alpha");
  assert.match(h, /^[a-f0-9]{64}$/);
  const { createHash } = await import("node:crypto");
  const expected = createHash("sha256").update("dev-token-alpha").digest("hex");
  assert.equal(h, expected);
});
