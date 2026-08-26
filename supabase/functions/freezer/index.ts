// freezer: CRUD + consume (archive), scoped to the caller's household.
// Runs as the CALLER (anon) with x-household-token forwarded → RLS isolates.
// List is FIFO: ordered by added_date ascending (oldest first).
//
//   GET    /freezer?consumed=true|false&limit=&offset=      (default: active only)
//   POST   /freezer   { household_id, name, added_date?, quantity?, tags?, profile_id? } → 201
//   PATCH  /freezer?id=  { name?, quantity?, tags?, added_date?, consumed? }            → 200
//   DELETE /freezer?id=                                                                    → 200
//
// consumed=true sets consumed_at=now(); false clears it (consistency CHECK).
import { handle, readJson } from "../_shared/handlers.ts";
import { json } from "../_shared/cors.ts";
import { ApiError, mapDbError } from "../_shared/errors.ts";
import {
  validateBooleanParam,
  validateItemName,
  validateQuantity,
  validateTags,
  validateDueDate,
  validateUuid,
} from "../_shared/validation.ts";
import { callerClient } from "../_shared/supabase.ts";
import type { FreezerView } from "../_shared/types.ts";

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
      const consumed = validateBooleanParam(url.searchParams.get("consumed"), "consumed");
      let query = supabase
        .from("freezer_items")
        .select("*")
        .order("added_date", { ascending: true })
        .range(offset, offset + limit - 1);
      if (consumed !== null) query = query.eq("consumed", consumed);
      else query = query.eq("consumed", false); // default: active items (FIFO)

      const { data, error } = await query;
      if (error) throw mapDbError(error, "FREEZER_LIST_FAILED");
      return json({ items: data as FreezerView[] });
    }

    if (req.method === "POST") {
      const body = await readJson(req);
      const householdId = validateUuid(body.household_id, "household_id");
      const name = validateItemName(body.name);
      const addedDate = validateDueDate(body.added_date ?? null);
      const quantity = validateQuantity(body.quantity ?? null);
      const tags = validateTags(body.tags ?? []);
      const profileId = body.profile_id === undefined || body.profile_id === null
        ? null
        : validateUuid(body.profile_id, "profile_id");

      const { data, error } = await supabase
        .from("freezer_items")
        .insert({
          household_id: householdId,
          profile_id: profileId,
          name,
          added_date: addedDate ?? undefined,
          quantity,
          tags,
        })
        .select("*")
        .single();
      if (error) throw mapDbError(error, "FREEZER_CREATE_FAILED");
      return json(data as FreezerView, 201);
    }

    const id = validateUuid(url.searchParams.get("id"), "id");

    if (req.method === "PATCH") {
      const body = await readJson(req);
      const patch: Record<string, unknown> = {};
      if ("name" in body) patch.name = validateItemName(body.name);
      if ("quantity" in body) patch.quantity = validateQuantity(body.quantity ?? null);
      if ("tags" in body) patch.tags = validateTags(body.tags ?? []);
      if ("added_date" in body) patch.added_date = validateDueDate(body.added_date ?? null);
      if ("consumed" in body) {
        const consumed = validateBooleanParam(
          body.consumed === true ? "true" : body.consumed === false ? "false" : null,
          "consumed",
        );
        if (consumed === null) throw new ApiError(400, "VALIDATION_ERROR", "consumed must be a boolean");
        patch.consumed = consumed;
        patch.consumed_at = consumed ? new Date().toISOString() : null;
      }
      if ("consumed_at" in body && !("consumed" in body)) {
        throw new ApiError(400, "VALIDATION_ERROR", "consumed_at requires consumed=true");
      }
      if (Object.keys(patch).length === 0) {
        throw new ApiError(400, "VALIDATION_ERROR", "no fields to update");
      }

      const { data, error } = await supabase
        .from("freezer_items")
        .update(patch)
        .eq("id", id)
        .select("*")
        .maybeSingle();
      if (error) throw mapDbError(error, "FREEZER_UPDATE_FAILED");
      if (!data) throw new ApiError(404, "NOT_FOUND", "item not found");
      return json(data as FreezerView);
    }

    if (req.method === "DELETE") {
      const { data, error } = await supabase
        .from("freezer_items")
        .delete()
        .eq("id", id)
        .select("id")
        .maybeSingle();
      if (error) throw mapDbError(error, "FREEZER_DELETE_FAILED");
      if (!data) throw new ApiError(404, "NOT_FOUND", "item not found");
      return json({ deleted: true });
    }

    throw new ApiError(405, "METHOD_NOT_ALLOWED", "method not allowed");
  }),
);
