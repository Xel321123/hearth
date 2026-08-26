import { test } from "node:test";
import assert from "node:assert/strict";
import { ApiError } from "../functions/_shared/errors.ts";
import {
  validateDisplayCodeInput,
  validateDueDate,
  validatePasswordInput,
  validateProfileName,
  validateQuantity,
  validateSearchQuery,
  validateTags,
  validateTodoTitle,
  validateUuid,
} from "../functions/_shared/validation.ts";

function expectInvalid(fn: () => unknown, code = "VALIDATION_ERROR"): void {
  try {
    fn();
    assert.fail("expected ApiError to be thrown");
  } catch (e) {
    assert.ok(e instanceof ApiError, `expected ApiError, got ${e}`);
    assert.equal(e.code, code);
    assert.equal(e.status, 400);
  }
}

test("display code: normalizes and validates against the DB alphabet", () => {
  assert.equal(validateDisplayCodeInput(" hearth "), "HEARTH");
  assert.equal(validateDisplayCodeInput("K7m2QX"), "K7M2QX");
  expectInvalid(() => validateDisplayCodeInput("HEART")); // 5 chars
  expectInvalid(() => validateDisplayCodeInput("HEARTO")); // O not in alphabet
  expectInvalid(() => validateDisplayCodeInput("HEAR1O")); // 1 not allowed
});

test("profile name: trimmed, 1-40 chars", () => {
  assert.equal(validateProfileName("  Alex "), "Alex");
  expectInvalid(() => validateProfileName(""));
  expectInvalid(() => validateProfileName("x".repeat(41)));
  expectInvalid(() => validateProfileName(42));
});

test("todo title: trimmed, 1-200 chars", () => {
  assert.equal(validateTodoTitle("  Take out bins "), "Take out bins");
  expectInvalid(() => validateTodoTitle(""));
  expectInvalid(() => validateTodoTitle("x".repeat(201)));
});

test("tags: strips leading '#', validates charset, caps at 20", () => {
  assert.deepEqual(validateTags(["#chore", "recurring"]), ["chore", "recurring"]);
  assert.deepEqual(validateTags(["##double"]), ["double"]);
  expectInvalid(() => validateTags(["has space"]));
  expectInvalid(() => validateTags(["a".repeat(31)]));
  expectInvalid(() => validateTags(Array.from({ length: 21 }, (_, i) => `t${i}`)));
  expectInvalid(() => validateTags(["ok", 42]));
  expectInvalid(() => validateTags("not-an-array"));
});

test("quantity: null allowed, ≤30 chars when set", () => {
  assert.equal(validateQuantity(null), null);
  assert.equal(validateQuantity("2.5 kg"), "2.5 kg");
  expectInvalid(() => validateQuantity("x".repeat(31)));
});

test("due date: real calendar dates only, YYYY-MM-DD", () => {
  assert.equal(validateDueDate("2026-08-26"), "2026-08-26");
  assert.equal(validateDueDate(null), null);
  expectInvalid(() => validateDueDate("2026-13-01"));
  expectInvalid(() => validateDueDate("2026-02-30"));
  expectInvalid(() => validateDueDate("26-08-2026"));
});

test("uuid, password input, search query", () => {
  assert.equal(
    validateUuid("00000000-0000-0000-0000-000000000001"),
    "00000000-0000-0000-0000-000000000001",
  );
  expectInvalid(() => validateUuid("nope"));
  assert.equal(validatePasswordInput("hunter2!!"), "hunter2!!");
  expectInvalid(() => validatePasswordInput("short"));
  assert.equal(validateSearchQuery("  milk  "), "milk");
  expectInvalid(() => validateSearchQuery(""));
});
