/** Shared API types. */

export interface Session {
  household_id: string;
  display_code: string;
  access_token: string;
}

export interface ApiErrorBody {
  error: { code: string; message: string };
}

export interface PushRecipient {
  endpoint: string;
  keys: { p256dh: string; auth: string };
}

export interface PushPayload {
  title: string;
  body: string;
  data?: Record<string, string>;
}

export interface DispatchResult {
  recipients: number;
  sent: number;
  failed: number;
}

export interface TodoView {
  id: string;
  household_id: string;
  profile_id: string;
  title: string;
  due_date: string | null;
  tags: string[];
  completed: boolean;
  completed_at: string | null;
  created_at: string;
}

export interface FreezerView {
  id: string;
  household_id: string;
  profile_id: string | null;
  name: string;
  added_date: string;
  quantity: string | null;
  tags: string[];
  consumed: boolean;
  consumed_at: string | null;
  created_at: string;
}
