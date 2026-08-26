import { storage } from "./storage.ts";

/**
 * Local device persona: which household member "is" this device.
 * Persisted per household in localStorage so each device can pick its own.
 */

const key = (householdId: string) => `hearth:active_profile:${householdId}`;

export function loadActiveProfileId(householdId: string): string | null {
  return storage.getItem(key(householdId));
}

export function saveActiveProfileId(householdId: string, profileId: string): void {
  storage.setItem(key(householdId), profileId);
}

export function clearActiveProfileId(householdId: string): void {
  storage.removeItem(key(householdId));
}
