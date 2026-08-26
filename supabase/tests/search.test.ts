import { test } from "node:test";
import assert from "node:assert/strict";
import { buildSearchSpec } from "../functions/_shared/search.ts";
import { ApiError } from "../functions/_shared/errors.ts";

test("#tag queries → exact tag containment", () => {
  assert.deepEqual(buildSearchSpec("#meat"), { kind: "tag", tag: "meat" });
  assert.deepEqual(buildSearchSpec("  #meat "), { kind: "tag", tag: "meat" });
});

test("invalid #tag rejected", () => {
  try {
    buildSearchSpec("#has space");
    assert.fail("expected ApiError");
  } catch (e) {
    assert.ok(e instanceof ApiError);
    assert.equal(e.code, "VALIDATION_ERROR");
  }
});

test("text queries → websearch tsquery + ilike fallback", () => {
  const spec = buildSearchSpec("chicken thighs");
  assert.equal(spec.kind, "text");
  if (spec.kind === "text") {
    assert.equal(spec.tsquery, "chicken thighs");
    assert.equal(spec.ilike, "%chicken thighs%");
  }
});

test("short text query (1-2 chars) → ilike only (websearch is useless there)", () => {
  const spec = buildSearchSpec("m");
  assert.equal(spec.kind, "text");
  if (spec.kind === "text") {
    assert.equal(spec.tsquery, null);
    assert.equal(spec.ilike, "%m%");
  }
});

test("empty and oversized queries rejected", () => {
  for (const bad of ["   ", "x".repeat(101)]) {
    try {
      buildSearchSpec(bad);
      assert.fail(`expected ApiError for ${JSON.stringify(bad)}`);
    } catch (e) {
      assert.ok(e instanceof ApiError);
      assert.equal(e.code, "VALIDATION_ERROR");
    }
  }
});
