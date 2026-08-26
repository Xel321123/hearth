import type { FreezerView, TodoView } from "../types/index.ts";

/** Deadline ascending, undated tasks last (matches the backend ordering). */
export function compareDueDate(a: TodoView, b: TodoView): number {
  if (a.due_date === null && b.due_date === null) return 0;
  if (a.due_date === null) return 1;
  if (b.due_date === null) return -1;
  return a.due_date < b.due_date ? -1 : a.due_date > b.due_date ? 1 : 0;
}

export function sortTodosByDeadline(todos: TodoView[]): TodoView[] {
  return [...todos].sort(compareDueDate);
}

/** FIFO: oldest added first (matches the backend ordering). */
export function compareAddedDate(a: FreezerView, b: FreezerView): number {
  return a.added_date < b.added_date ? -1 : a.added_date > b.added_date ? 1 : 0;
}

export function sortFreezerFifo(items: FreezerView[]): FreezerView[] {
  return [...items].sort(compareAddedDate);
}

/** "My Tasks" — tasks assigned to the active profile. */
export function filterAssignedTo(todos: TodoView[], profileId: string | null): TodoView[] {
  return profileId ? todos.filter((t) => t.profile_id === profileId) : [];
}

/** Most recent timestamp first (history views). Field-agnostic so todos
 *  (completed_at) and freezer items (consumed_at) share one comparator. */
export function compareTsDesc(a: string | null, b: string | null): number {
  const at = (x: string | null) => x ?? "";
  return at(b) < at(a) ? -1 : at(b) > at(a) ? 1 : 0;
}
