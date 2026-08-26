/**
 * Hearth API client — talks to the deployed Edge Functions (/functions/v1)
 * and, for profile listing + device subscriptions, directly to PostgREST
 * (/rest/v1) with the `hearth` schema pinned. Every scoped call carries the
 * household access token as `x-household-token`; RLS enforces isolation.
 */
import { ApiError } from "../types/index.ts";
import type {
  CreateHouseholdResponse,
  DeviceSubscriptionInput,
  FreezerView,
  JoinHouseholdResponse,
  ProfileRow,
  PushDispatchResult,
  SearchResponse,
  TodoView,
} from "../types/index.ts";
import { SUPABASE_ANON_KEY, SUPABASE_URL } from "./config.ts";

export const FN_BASE = `${SUPABASE_URL}/functions/v1`;
export const REST_BASE = `${SUPABASE_URL}/rest/v1`;

export interface QueryParams {
  [key: string]: string | number | boolean | null | undefined;
}

export interface RequestOptions {
  method?: "GET" | "POST" | "PATCH" | "DELETE";
  query?: QueryParams;
  body?: unknown;
  /** Household access token → sent as x-household-token (required for scoped calls). */
  token?: string | null;
  /** PostgREST upsert: ?on_conflict=cols + Prefer: resolution=merge-duplicates. */
  onConflict?: string;
  /** PostgREST Prefer header (e.g. return=representation for POST responses). */
  prefer?: string;
  /** PostgREST: Accept: application/vnd.pgrst.object+json (single object response). */
  acceptObject?: boolean;
}

export async function request<T>(base: string, path: string, opts: RequestOptions = {}): Promise<T> {
  const { method = "GET", query, body, token, onConflict, prefer, acceptObject } = opts;
  const params = new URLSearchParams();
  if (query) {
    for (const [key, value] of Object.entries(query)) {
      if (value !== undefined && value !== null) params.set(key, String(value));
    }
  }
  if (onConflict) params.set("on_conflict", onConflict);

  const url = `${base}${path}${params.size > 0 ? `?${params.toString()}` : ""}`;
  const headers: Record<string, string> = {
    apikey: SUPABASE_ANON_KEY,
    Authorization: `Bearer ${SUPABASE_ANON_KEY}`,
    "Content-Type": "application/json",
  };
  if (token) headers["x-household-token"] = token;
  if (base === REST_BASE) {
    headers["Accept-Profile"] = "hearth";
    headers["Content-Profile"] = "hearth";
  }
  if (prefer) headers["Prefer"] = prefer;
  if (acceptObject) headers["Accept"] = "application/vnd.pgrst.object+json";

  let res: Response;
  try {
    res = await fetch(url, { method, headers, body: body === undefined ? undefined : JSON.stringify(body) });
  } catch {
    throw new ApiError("NETWORK_ERROR", "No connection — are you online?", 0);
  }

  let data: unknown = null;
  const text = await res.text();
  if (text) {
    try {
      data = JSON.parse(text);
    } catch {
      data = null;
    }
  }

  if (!res.ok) {
    const err = (data as { error?: { code?: string; message?: string } } | null)?.error;
    throw new ApiError(err?.code ?? "REQUEST_FAILED", err?.message ?? `Request failed (HTTP ${res.status})`, res.status);
  }
  return data as T;
}

const fn = <T>(path: string, opts: RequestOptions = {}) => request<T>(FN_BASE, path, opts);
const rest = <T>(path: string, opts: RequestOptions = {}) => request<T>(REST_BASE, path, opts);

export interface TodoInput {
  household_id: string;
  profile_id: string;
  title: string;
  due_date?: string | null;
  tags?: string[];
}

export type TodoPatch = Partial<Pick<TodoInput, "title" | "due_date" | "tags" | "profile_id">> & {
  completed?: boolean;
};

export interface FreezerInput {
  household_id: string;
  name: string;
  added_date?: string | null;
  quantity?: string | null;
  tags?: string[];
  profile_id?: string | null;
}

export type FreezerPatch = Partial<Pick<FreezerInput, "name" | "quantity" | "tags" | "added_date">> & {
  consumed?: boolean;
};

export interface ListTodosOptions {
  filter?: "mine" | "household";
  activeProfileId?: string;
  completed?: boolean;
  tags?: string[];
  limit?: number;
}

export interface ListFreezerOptions {
  consumed?: boolean;
  limit?: number;
}

export interface NotifyInput {
  household_id: string;
  profile_id: string;
  todo_id: string;
  title: string;
}

/** Every backend call. Scoped calls require `token` (household access token). */
export const api = {
  // ── Auth ──────────────────────────────────────────────────────────────
  createHousehold(profileName?: string): Promise<CreateHouseholdResponse> {
    return fn("/household-create", { method: "POST", body: { profile_name: profileName ?? null } });
  },
  joinHousehold(displayCode: string, password: string): Promise<JoinHouseholdResponse> {
    return fn("/household-join", { method: "POST", body: { display_code: displayCode, password } });
  },

  // ── Profiles (list via REST — the Edge Function is create/rename/delete only) ──
  listProfiles(token: string): Promise<ProfileRow[]> {
    return rest("/profiles", { query: { select: "id,household_id,name", order: "name.asc" }, token });
  },
  createProfile(token: string, householdId: string, name: string): Promise<ProfileRow> {
    return rest("/profiles", {
      method: "POST",
      body: { household_id: householdId, name },
      prefer: "return=representation",
      acceptObject: true,
      token,
    });
  },

  // ── Todos ─────────────────────────────────────────────────────────────
  listTodos(token: string, opts: ListTodosOptions = {}): Promise<{ todos: TodoView[] }> {
    const { filter, activeProfileId, completed, tags, limit } = opts;
    return fn("/todos", {
      query: {
        filter: filter ?? "household",
        active_profile_id: filter === "mine" ? activeProfileId : null,
        completed: completed === undefined ? null : completed,
        tags: tags && tags.length > 0 ? tags.join(",") : null,
        limit: limit ?? 50,
      },
      token,
    });
  },
  createTodo(token: string, input: TodoInput): Promise<TodoView> {
    return fn("/todos", { method: "POST", body: input, token });
  },
  updateTodo(token: string, id: string, patch: TodoPatch): Promise<TodoView> {
    return fn("/todos", { method: "PATCH", query: { id }, body: patch, token });
  },
  deleteTodo(token: string, id: string): Promise<{ deleted: boolean }> {
    return fn("/todos", { method: "DELETE", query: { id }, token });
  },

  // ── Freezer ───────────────────────────────────────────────────────────
  listFreezer(token: string, opts: ListFreezerOptions = {}): Promise<{ items: FreezerView[] }> {
    const { consumed, limit } = opts;
    return fn("/freezer", {
      query: { consumed: consumed === undefined ? null : consumed, limit: limit ?? 50 },
      token,
    });
  },
  createFreezerItem(token: string, input: FreezerInput): Promise<FreezerView> {
    return fn("/freezer", { method: "POST", body: input, token });
  },
  updateFreezerItem(token: string, id: string, patch: FreezerPatch): Promise<FreezerView> {
    return fn("/freezer", { method: "PATCH", query: { id }, body: patch, token });
  },
  deleteFreezerItem(token: string, id: string): Promise<{ deleted: boolean }> {
    return fn("/freezer", { method: "DELETE", query: { id }, token });
  },

  // ── Search ────────────────────────────────────────────────────────────
  search(token: string, q: string): Promise<SearchResponse> {
    return fn("/search", { query: { q }, token });
  },

  // ── Push ──────────────────────────────────────────────────────────────
  /**
   * Register this device for (household, active profile). Any older rows for
   * this device+household are deleted first, then the row is upserted — so
   * switching the active profile MOVES the subscription instead of duplicating
   * it (unique on household_id, profile_id, device_id and on endpoint).
   */
  async registerDevice(token: string, sub: DeviceSubscriptionInput): Promise<unknown> {
    await rest("/device_subscriptions", {
      method: "DELETE",
      query: { household_id: `eq.${sub.household_id}`, device_id: `eq.${sub.device_id}` },
      token,
    }).catch(() => undefined);
    return rest("/device_subscriptions", {
      method: "POST",
      onConflict: "household_id,profile_id,device_id",
      prefer: "resolution=merge-duplicates,return=representation",
      body: sub,
      token,
    });
  },
  /** Fire-and-forget targeted push when a task is assigned to a profile. */
  notifyTaskAssigned(token: string, input: NotifyInput): Promise<PushDispatchResult> {
    return fn("/push-notify", {
      method: "POST",
      body: {
        household_id: input.household_id,
        profile_id: input.profile_id,
        todo: { id: input.todo_id, title: input.title },
      },
      token,
    });
  },
};
