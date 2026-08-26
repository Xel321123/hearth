/**
 * Client API DTOs — mirror the Edge Function contracts
 * (supabase/functions/_shared/types.ts). The backend speaks snake_case.
 */

/** Anonymous household session persisted in localStorage — no email/phone/PII. */
export interface HouseholdSession {
  householdId: string;
  /** 6-char human join code (display only; not secret by itself). */
  displayCode: string;
  /** Opaque join token — sent as `x-household-token`; stored hashed server-side. */
  accessToken: string;
}

/** A named person profile inside a household (max 5). Not an auth login. */
export interface ProfileRow {
  id: string;
  household_id: string;
  name: string;
}

export interface TodoView {
  id: string;
  household_id: string;
  /** Profile the task is assigned to. */
  profile_id: string;
  title: string;
  /** ISO date (YYYY-MM-DD) or null when undated. */
  due_date: string | null;
  tags: string[];
  /** Completion archives the task (completed=true). */
  completed: boolean;
  completed_at: string | null;
  created_at: string;
}

export interface FreezerView {
  id: string;
  household_id: string;
  /** Profile that added the item (null = household default). */
  profile_id: string | null;
  name: string;
  /** ISO date (YYYY-MM-DD), defaults to today. */
  added_date: string;
  /** Free-form quantity/unit string, e.g. "2.5 kg", "1", "500 g". */
  quantity: string | null;
  tags: string[];
  /** Consuming archives the item (consumed=true). */
  consumed: boolean;
  consumed_at: string | null;
  created_at: string;
}

export type SearchTodo = Pick<TodoView, "id" | "title" | "tags" | "profile_id" | "due_date" | "completed">;
export type SearchFreezer = Pick<FreezerView, "id" | "name" | "tags" | "added_date" | "quantity" | "consumed">;

export interface SearchResponse {
  todos: SearchTodo[];
  freezer: SearchFreezer[];
}

export interface CreateHouseholdResponse {
  household_id: string;
  display_code: string;
  password: string;
  access_token: string;
  profile: { id: string; name: string };
}

export interface JoinHouseholdResponse {
  household_id: string;
  display_code: string;
  access_token: string;
}

/** Browser PushSubscription mapped to (household, active profile, device). */
export interface DeviceSubscriptionInput {
  household_id: string;
  profile_id: string;
  device_id: string;
  endpoint: string;
  keys: { p256dh: string; auth: string };
}

export interface PushDispatchResult {
  recipients: number;
  sent: number;
  failed: number;
  profile_id: string;
}

/** Normalized API failure — thrown by every client call. */
export class ApiError extends Error {
  readonly code: string;
  readonly status: number;

  constructor(code: string, message: string, status: number) {
    super(message);
    this.name = "ApiError";
    this.code = code;
    this.status = status;
  }
}
