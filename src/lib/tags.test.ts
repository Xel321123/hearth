import { test } from "node:test";
import assert from "node:assert/strict";
import { normalizeTags, parseTags, tagsToInput } from "./tags.ts";

test("parseTags: strips #, lowercases, dedupes, splits on spaces/commas", () => {
  assert.deepEqual(parseTags("Milk #Dairy, #milk #x #X"), ["milk", "dairy", "x"]);
  assert.deepEqual(parseTags(""), []);
  assert.deepEqual(parseTags("   "), []);
  assert.deepEqual(parseTags("#a#b"), ["a#b"]); // only leading # stripped
  assert.deepEqual(parseTags("a,b c"), ["a", "b", "c"]);
});

test("normalizeTags merges raw arrays", () => {
  assert.deepEqual(normalizeTags(["a", "#b", "A"]), ["a", "b"]);
});

test("tagsToInput renders #-prefixed", () => {
  assert.equal(tagsToInput(["errands", "urgent"]), "#errands #urgent");
});
