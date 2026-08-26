import type { HouseholdSession } from "../types/index.ts";
import { storage } from "./storage.ts";

const SESSION_KEY = "hearth:session";
const DEVICE_KEY = "hearth:device_id";

export function loadSession(): HouseholdSession | null {
  const raw = storage.getItem(SESSION_KEY);
  if (!raw) return null;
  try {
    const parsed = JSON.parse(raw) as HouseholdSession;
    if (!parsed.householdId || !parsed.accessToken) return null;
    return parsed;
  } catch {
    return null;
  }
}

export function saveSession(session: HouseholdSession): void {
  storage.setItem(SESSION_KEY, JSON.stringify(session));
}

export function clearSession(): void {
  storage.removeItem(SESSION_KEY);
}

/** Stable per-browser device id (push subscriptions are keyed on it). */
export function getDeviceId(): string {
  let id = storage.getItem(DEVICE_KEY);
  if (!id) {
    id = globalThis.crypto?.randomUUID?.() ?? `dev-${Math.random().toString(36).slice(2)}`;
    storage.setItem(DEVICE_KEY, id);
  }
  return id;
}
