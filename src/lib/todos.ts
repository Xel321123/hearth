import type { TodoItem } from "../types";

/**
 * Todo module. Tasks: title, due date, assigned profile, #tags.
 * Filters: "My Tasks" (active persona) / "Household". Sort: nearest deadline.
 * Completion archives the task. See PROJECT_PLAN.md §7.
 */

export type TodoFilter = "mine" | "household";

export function sortByNearestDeadline(todos: TodoItem[]): TodoItem[] {
  // Undated tasks sort last.
  return [...todos].sort((a, b) => {
    if (!a.dueDate) return 1;
    if (!b.dueDate) return -1;
    return a.dueDate.localeCompare(b.dueDate);
  });
}

export async function listTodos(
  _householdId: string,
  _filter: TodoFilter,
): Promise<TodoItem[]> {
  throw new Error("Not implemented — see TASKS.md Phase 2");
}

export async function createTodo(_input: Partial<TodoItem>): Promise<TodoItem> {
  throw new Error("Not implemented — see TASKS.md Phase 2");
}

export async function archiveTodo(_id: string): Promise<void> {
  throw new Error("Not implemented — see TASKS.md Phase 2");
}
