import type { HouseholdSession } from "../types";

/**
 * Anonymous household auth — no accounts, no password reset, no PII.
 * Session = { householdId, accessToken } stored in localStorage.
 * See PROJECT_PLAN.md §5.
 */

const SESSION_KEY = "hearth.session";

export function getSession(): HouseholdSession | null {
  try {
    const raw = localStorage.getItem(SESSION_KEY);
    return raw ? (JSON.parse(raw) as HouseholdSession) : null;
  } catch {
    return null;
  }
}

export function setSession(session: HouseholdSession): void {
  localStorage.setItem(SESSION_KEY, JSON.stringify(session));
}

export function clearSession(): void {
  localStorage.removeItem(SESSION_KEY);
}

/** Create a new household → returns session (Phase 1, via Edge Function). */
export async function createHousehold(): Promise<HouseholdSession> {
  throw new Error("Not implemented — see TASKS.md Phase 1");
}

/** Join an existing household with display code + password → returns session. */
export async function joinHousehold(
  _code: string,
  _password: string,
): Promise<HouseholdSession> {
  throw new Error("Not implemented — see TASKS.md Phase 1");
}
