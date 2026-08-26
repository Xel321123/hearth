/**
 * Core domain types for Hearth.
 * All persisted rows live in the `hearth` PostgreSQL schema (see AGENTS.md).
 */

/** Anonymous household session persisted in localStorage — no email/phone/PII. */
export interface HouseholdSession {
  householdId: string;
  /** Opaque join token (sent as `x-household-token` header; stored hashed server-side). */
  accessToken: string;
}

/** A named person profile inside a household (max 5 per household). Not an auth login. */
export interface Profile {
  id: string;
  householdId: string;
  name: string;
}

export interface TodoItem {
  id: string;
  householdId: string;
  /** Profile the task is assigned to. */
  profileId: string;
  title: string;
  /** ISO date (YYYY-MM-DD) or null when undated. */
  dueDate: string | null;
  tags: string[];
  /** Completion archives the task (completed=true). */
  completed: boolean;
  completedAt: string | null;
  createdAt: string;
}

export interface FreezerItem {
  id: string;
  householdId: string;
  /** Profile that added the item (null = household default). */
  profileId: string | null;
  name: string;
  /** ISO date (YYYY-MM-DD), defaults to today. */
  addedDate: string;
  /** Free-form quantity/unit string, e.g. "2.5 kg", "1", "500 g". */
  quantity: string | null;
  tags: string[];
  /** Consuming archives the item (consumed=true). */
  consumed: boolean;
  consumedAt: string | null;
}

/** Browser PushSubscription mapped to (household, active profile, device). */
export interface PushSubscriptionRow {
  id: string;
  householdId: string;
  profileId: string;
  deviceId: string;
  endpoint: string;
  keys: { p256dh: string; auth: string };
}

export type SearchResult =
  | { kind: "todo"; item: TodoItem }
  | { kind: "freezer"; item: FreezerItem };
