import { test } from "node:test";
import assert from "node:assert/strict";
import { formatRelativeDate, todayIso } from "./dates.ts";

const NOW = new Date(2026, 5, 15, 14, 0, 0); // 2026-06-15 local

test("formatRelativeDate: today/tomorrow/yesterday/days/absolute", () => {
  assert.equal(formatRelativeDate("2026-06-15", NOW), "today");
  assert.equal(formatRelativeDate("2026-06-16", NOW), "tomorrow");
  assert.equal(formatRelativeDate("2026-06-14", NOW), "yesterday");
  assert.equal(formatRelativeDate("2026-06-12", NOW), "3d ago");
  assert.equal(formatRelativeDate("2026-06-20", NOW), "in 5d");
  assert.equal(formatRelativeDate("2026-09-01", NOW), "Sep 1");
});

test("todayIso matches the local calendar date", () => {
  const d = new Date();
  const expected = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
  assert.equal(todayIso(), expected);
});
