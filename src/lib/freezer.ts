import type { FreezerItem } from "../types";

/**
 * Freezer module. Items: name, date added (defaults to today), optional
 * weight/quantity, #tags. Sort FIFO (oldest first). Consuming archives the
 * item to history. See PROJECT_PLAN.md §7.
 */

export function sortFifo(items: FreezerItem[]): FreezerItem[] {
  return [...items].sort((a, b) => a.addedDate.localeCompare(b.addedDate));
}

export async function listFreezerItems(_householdId: string): Promise<FreezerItem[]> {
  throw new Error("Not implemented — see TASKS.md Phase 2");
}

export async function addFreezerItem(_input: Partial<FreezerItem>): Promise<FreezerItem> {
  throw new Error("Not implemented — see TASKS.md Phase 2");
}

export async function consumeFreezerItem(_id: string): Promise<void> {
  throw new Error("Not implemented — see TASKS.md Phase 2");
}
