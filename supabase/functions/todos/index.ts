// todos: CRUD + complete (archive), scoped to the caller's household.
// Runs as the CALLER (anon) with x-household-token forwarded → RLS isolates.
//
//   GET    /todos?filter=mine|household&active_profile_id=&completed=&tags=a,b&limit=&offset=
//   POST   /todos        { household_id, profile_id, title, due_date?, tags? }   → 201
//   PATCH  /todos?id=    { title?, due_date?, tags?, profile_id?, completed? }   → 200
//   DELETE /todos?id=                                                            → 200
//
// completing=true sets completed_at=now(); false clears it (consistency CHECK).
import { handle, readJson } from "../_shared/handlers.ts";
import { json } from "../_shared/cors.ts";
import { ApiError, mapDbError } from "../_shared/errors.ts";
import {
  validateBooleanParam,
  validateDueDate,
  validateTags,
  validateTodoTitle,
  validateUuid,
} from "../_shared/validation.ts";
import { callerClient, requireHouseholdToken } from "../_shared/supabase.ts";
import type { TodoView } from "../_shared/types.ts";

const DEFAULT_LIMIT = 50;
const MAX_LIMIT = 100;

function parsePaging(url: URL): { limit: number; offset: number } {
  const rawLimit = url.searchParams.get("limit");
  const rawOffset = url.searchParams.get("offset");
  const limit = rawLimit ? Number(rawLimit) : DEFAULT_LIMIT;
  const offset = rawOffset ? Number(rawOffset) : 0;
  if (!Number.isInteger(limit) || limit < 1 || limit > MAX_LIMIT) {
    throw new ApiError(400, "VALIDATION_ERROR", `limit must be 1-${MAX_LIMIT}`);
  }
  if (!Number.isInteger(offset) || offset < 0) {
    throw new ApiError(400, "VALIDATION_ERROR", "offset must be a non-negative integer");
  }
  return { limit, offset };
}

Deno.serve(
  handle(async (req) => {
    requireHouseholdToken(req);
    const supabase = callerClient(req);
    const url = new URL(req.url);

    if (req.method === "GET") {
      const { limit, offset } = parsePaging(url);
      const filter = url.searchParams.get("filter") ?? "household";
      const completed = validateBooleanParam(url.searchParams.get("completed"), "completed");
      const tagsParam = url.searchParams.get("tags");

      let query = supabase
        .from("todos")
        .select("*")
        .order("due_date", { ascending: true, nullsFirst: false })
        .range(offset, offset + limit - 1);

      if (filter === "mine") {
        const profileId = validateUuid(url.searchParams.get("active_profile_id"), "active_profile_id");
        query = query.eq("profile_id", profileId);
      } else if (filter !== "household") {
        throw new ApiError(400, "VALIDATION_ERROR", "filter must be 'mine' or 'household'");
      }
      if (completed !== null) query = query.eq("completed", completed);
      if (tagsParam) {
        const tags = validateTags(tagsParam.split(",").filter((t) => t !== ""));
        if (tags.length > 0) query = query.contains("tags", tags);
      }

      const { data, error } = await query;
      if (error) throw mapDbError(error, "TODOS_LIST_FAILED");
      return json({ todos: data as TodoView[] });
    }

    if (req.method === "POST") {
      const body = await readJson(req);
      const householdId = validateUuid(body.household_id, "household_id");
      const profileId = validateUuid(body.profile_id, "profile_id");
      const title = validateTodoTitle(body.title);
      const dueDate = validateDueDate(body.due_date ?? null);
      const tags = validateTags(body.tags ?? []);

      const { data, error } = await supabase
        .from("todos")
        .insert({ household_id: householdId, profile_id: profileId, title, due_date: dueDate, tags })
        .select("*")
        .single();
      if (error) throw mapDbError(error, "TODO_CREATE_FAILED");
      return json(data as TodoView, 201);
    }

    const id = validateUuid(url.searchParams.get("id"), "id");

    if (req.method === "PATCH") {
      const body = await readJson(req);
      const patch: Record<string, unknown> = {};
      if ("title" in body) patch.title = validateTodoTitle(body.title);
      if ("due_date" in body) patch.due_date = validateDueDate(body.due_date ?? null);
      if ("tags" in body) patch.tags = validateTags(body.tags ?? []);
      if ("profile_id" in body) patch.profile_id = validateUuid(body.profile_id, "profile_id");
      if ("completed" in body) {
        const completed = validateBooleanParam(body.completed === true ? "true" : body.completed === false ? "false" : null, "completed");
        if (completed === null) throw new ApiError(400, "VALIDATION_ERROR", "completed must be a boolean");
        patch.completed = completed;
        patch.completed_at = completed ? new Date().toISOString() : null;
      }
      if ("completed_at" in body && !("completed" in body)) {
        throw new ApiError(400, "VALIDATION_ERROR", "completed_at requires completed=true");
      }
      if (Object.keys(patch).length === 0) {
        throw new ApiError(400, "VALIDATION_ERROR", "no fields to update");
      }

      const { data, error } = await supabase
        .from("todos")
        .update(patch)
        .eq("id", id)
        .select("*")
        .maybeSingle();
      if (error) throw mapDbError(error, "TODO_UPDATE_FAILED");
      if (!data) throw new ApiError(404, "NOT_FOUND", "todo not found");
      return json(data as TodoView);
    }

    if (req.method === "DELETE") {
      const { data, error } = await supabase
        .from("todos")
        .delete()
        .eq("id", id)
        .select("id")
        .maybeSingle();
      if (error) throw mapDbError(error, "TODO_DELETE_FAILED");
      if (!data) throw new ApiError(404, "NOT_FOUND", "todo not found");
      return json({ deleted: true });
    }

    throw new ApiError(405, "METHOD_NOT_ALLOWED", "method not allowed");
  }),
);
