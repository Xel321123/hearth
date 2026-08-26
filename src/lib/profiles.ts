import type { Profile } from "../types";

/**
 * Household person profiles (max 5 per household; names only — not auth logins).
 * Each device picks its active profile via localStorage persona.
 * See PROJECT_PLAN.md §6.
 */

const PERSONA_KEY = "hearth.active_profile_id";

export function getActiveProfileId(householdId: string): string | null {
  return localStorage.getItem(`${PERSONA_KEY}.${householdId}`);
}

export function setActiveProfileId(householdId: string, profileId: string): void {
  localStorage.setItem(`${PERSONA_KEY}.${householdId}`, profileId);
}

/** Stable per-device identifier (generated once, used for push subscriptions). */
const DEVICE_KEY = "hearth.device_id";

export function getDeviceId(): string {
  let id = localStorage.getItem(DEVICE_KEY);
  if (!id) {
    id = crypto.randomUUID();
    localStorage.setItem(DEVICE_KEY, id);
  }
  return id;
}

export async function listProfiles(_householdId: string): Promise<Profile[]> {
  throw new Error("Not implemented — see TASKS.md Phase 1");
}
