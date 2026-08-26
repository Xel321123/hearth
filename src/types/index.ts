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
  /** Set when the task is completed → archived. */
  archivedAt: string | null;
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
  quantity: number | null;
  unit: string | null;
  tags: string[];
  /** Set when consumed → archived (FIFO history). */
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
