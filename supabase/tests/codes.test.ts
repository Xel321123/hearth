import { test } from "node:test";
import assert from "node:assert/strict";
import {
  DISPLAY_CODE_ALPHABET,
  DISPLAY_CODE_LENGTH,
  DISPLAY_CODE_RE,
  generateDisplayCode,
  generateHouseholdPassword,
  PASSWORD_ALPHABET,
  PASSWORD_LENGTH,
  randomChars,
} from "../functions/_shared/codes.ts";

test("display code: 6 chars from alphabet, matches the DB CHECK regex", () => {
  for (let i = 0; i < 200; i++) {
    const code = generateDisplayCode();
    assert.equal(code.length, DISPLAY_CODE_LENGTH);
    assert.match(code, DISPLAY_CODE_RE);
    for (const ch of code) assert.ok(DISPLAY_CODE_ALPHABET.includes(ch));
  }
});

test("display codes are unique across 100 samples", () => {
  const codes = new Set(Array.from({ length: 100 }, () => generateDisplayCode()));
  assert.equal(codes.size, 100);
});

test("deterministic with injected randInt", () => {
  assert.equal(generateDisplayCode(() => 0), "AAAAAA");
  assert.equal(randomChars("AB", 8, () => 1), "BBBBBBBB");
});

test("password: 16 chars, confusable-free alphabet only", () => {
  const seen = new Set<string>();
  for (let i = 0; i < 50; i++) {
    const p = generateHouseholdPassword();
    assert.equal(p.length, PASSWORD_LENGTH);
    for (const ch of p) assert.ok(PASSWORD_ALPHABET.includes(ch));
    seen.add(p);
  }
  assert.ok(seen.size > 49, "passwords should be unique");
});

test("password alphabet excludes confusables I/L/O/0/1", () => {
  for (const ch of ["I", "L", "O", "0", "1"]) {
    assert.ok(!PASSWORD_ALPHABET.includes(ch), `alphabet must not contain ${ch}`);
  }
});
