// profiles: create / rename / delete, scoped to the caller's household.
// Runs as the CALLER (anon) with the x-household-token forwarded, so RLS
// enforces household isolation; this handler only validates input.
//
//   POST   /profiles                    { household_id, name }        → 201
//   PATCH  /profiles?id=<uuid>          { name }                      → 200
//   DELETE /profiles?id=<uuid>                                        → 200
//
// Deleting a profile cascades: its todos and device subscriptions are
// removed, freezer items become unassigned (created_by → NULL).
import { handle, readJson } from "../_shared/handlers.ts";
import { json } from "../_shared/cors.ts";
import { ApiError, mapDbError } from "../_shared/errors.ts";
import { validateProfileName, validateUuid } from "../_shared/validation.ts";
import { callerClient } from "../_shared/supabase.ts";

Deno.serve(
  handle(async (req) => {
    const supabase = callerClient(req);
    const url = new URL(req.url);

    if (req.method === "POST") {
      const body = await readJson(req);
      const householdId = validateUuid(body.household_id, "household_id");
      const name = validateProfileName(body.name);
      const { data, error } = await supabase
        .from("profiles")
        .insert({ household_id: householdId, name })
        .select("id, household_id, name")
        .single();
      if (error) throw mapDbError(error, "PROFILE_CREATE_FAILED");
      return json(data, 201);
    }

    const id = validateUuid(url.searchParams.get("id"), "id");

    if (req.method === "PATCH") {
      const body = await readJson(req);
      if (!("name" in body)) {
        throw new ApiError(400, "VALIDATION_ERROR", "name is required");
      }
      const name = validateProfileName(body.name);
      const { data, error } = await supabase
        .from("profiles")
        .update({ name })
        .eq("id", id)
        .select("id, household_id, name")
        .maybeSingle();
      if (error) throw mapDbError(error, "PROFILE_UPDATE_FAILED");
      if (!data) throw new ApiError(404, "NOT_FOUND", "profile not found");
      return json(data);
    }

    if (req.method === "DELETE") {
      const { data, error } = await supabase
        .from("profiles")
        .delete()
        .eq("id", id)
        .select("id")
        .maybeSingle();
      if (error) throw mapDbError(error, "PROFILE_DELETE_FAILED");
      if (!data) throw new ApiError(404, "NOT_FOUND", "profile not found");
      return json({ deleted: true });
    }

    throw new ApiError(405, "METHOD_NOT_ALLOWED", "method not allowed");
  }),
);
