import { test } from "node:test";
import assert from "node:assert/strict";
import type { FreezerView, TodoView } from "../types/index.ts";
import { compareTsDesc, compareDueDate, filterAssignedTo, sortFreezerFifo, sortTodosByDeadline } from "./sort.ts";

function todo(partial: Partial<TodoView>): TodoView {
  return {
    id: "id",
    household_id: "hh",
    profile_id: "p1",
    title: "t",
    due_date: null,
    tags: [],
    completed: false,
    completed_at: null,
    created_at: "2026-01-01T00:00:00Z",
    ...partial,
  };
}

function freezer(partial: Partial<FreezerView>): FreezerView {
  return {
    id: "id",
    household_id: "hh",
    profile_id: null,
    name: "n",
    added_date: "2026-01-01",
    quantity: null,
    tags: [],
    consumed: false,
    consumed_at: null,
    created_at: "2026-01-01T00:00:00Z",
    ...partial,
  };
}

test("sortTodosByDeadline: nearest deadline first, undated last (stable)", () => {
  const later = todo({ id: "a", due_date: "2026-06-02" });
  const undated1 = todo({ id: "b", due_date: null });
  const soon = todo({ id: "c", due_date: "2026-06-01" });
  const undated2 = todo({ id: "d", due_date: null });
  const sorted = sortTodosByDeadline([later, undated1, soon, undated2]);
  assert.deepEqual(
    sorted.map((t) => t.id),
    ["c", "a", "b", "d"],
  );
});

test("compareDueDate: nulls sort last", () => {
  assert.ok(compareDueDate(todo({ due_date: null }), todo({ due_date: "2026-01-01" })) > 0);
  assert.ok(compareDueDate(todo({ due_date: "2026-01-01" }), todo({ due_date: null })) < 0);
  assert.equal(compareDueDate(todo({ due_date: null }), todo({ due_date: null })), 0);
});

test("sortFreezerFifo: oldest added first", () => {
  const old = freezer({ id: "a", added_date: "2026-01-01" });
  const mid = freezer({ id: "b", added_date: "2026-03-15" });
  const new_ = freezer({ id: "c", added_date: "2026-05-01" });
  assert.deepEqual(
    sortFreezerFifo([new_, old, mid]).map((i) => i.id),
    ["a", "b", "c"],
  );
});

test("filterAssignedTo: only the given profile's tasks; null → empty", () => {
  const mine = todo({ id: "a", profile_id: "p1" });
  const theirs = todo({ id: "b", profile_id: "p2" });
  assert.deepEqual(filterAssignedTo([mine, theirs], "p1").map((t) => t.id), ["a"]);
  assert.deepEqual(filterAssignedTo([mine, theirs], null), []);
});

test("compareTsDesc: newest timestamp first, nulls last", () => {
  assert.ok(compareTsDesc("2026-06-02T10:00:00Z", "2026-06-01T10:00:00Z") < 0);
  assert.ok(compareTsDesc(null, "2026-06-01T10:00:00Z") > 0);
  assert.equal(compareTsDesc(null, null), 0);
});
