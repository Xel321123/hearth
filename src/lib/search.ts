import type { SearchResult } from "../types";

/**
 * Global search across todos + freezer items: free-text and #tag matching.
 * See PROJECT_PLAN.md §7.
 */

export async function globalSearch(_householdId: string, _query: string): Promise<SearchResult[]> {
  throw new Error("Not implemented — see TASKS.md Phase 2");
}
