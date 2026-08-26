// search: global full-text + #tag search across todos and freezer items,
// scoped to the caller's household (RLS via forwarded token).
//
//   GET /search?q=<query>
//     "cheese"   → full-text over search_vector (title/name + tags), websearch
//                  syntax, with ILIKE fallback for 1-2 char queries
//     "#meat"    → exact tag containment
// Returns { todos: [...], freezer: [...] }, max 20 rows each.
import { handle } from "../_shared/handlers.ts";
import { json } from "../_shared/cors.ts";
import { ApiError, mapDbError } from "../_shared/errors.ts";
import { buildSearchSpec } from "../_shared/search.ts";
import { callerClient } from "../_shared/supabase.ts";

const RESULT_LIMIT = 20;

Deno.serve(
  handle(async (req) => {
    if (req.method !== "GET") {
      throw new ApiError(405, "METHOD_NOT_ALLOWED", "GET required");
    }
    const spec = buildSearchSpec(new URL(req.url).searchParams.get("q"));
    const supabase = callerClient(req);

    if (spec.kind === "tag") {
      const [todos, freezer] = await Promise.all([
        supabase
          .from("todos")
          .select("id, title, tags, profile_id, due_date, completed")
          .contains("tags", [spec.tag])
          .limit(RESULT_LIMIT),
        supabase
          .from("freezer_items")
          .select("id, name, tags, added_date, quantity, consumed")
          .contains("tags", [spec.tag])
          .limit(RESULT_LIMIT),
      ]);
      if (todos.error) throw mapDbError(todos.error, "SEARCH_FAILED");
      if (freezer.error) throw mapDbError(freezer.error, "SEARCH_FAILED");
      return json({ todos: todos.data, freezer: freezer.data });
    }

    const baseTodo = supabase.from("todos").select("id, title, tags, profile_id, due_date, completed");
    const baseFreezer = supabase.from("freezer_items").select("id, name, tags, added_date, quantity, consumed");

    const todoQuery = spec.tsquery
      ? baseTodo.textSearch("search_vector", spec.tsquery, { type: "websearch", config: "simple" })
      : baseTodo.ilike("title", spec.ilike);
    const freezerQuery = spec.tsquery
      ? baseFreezer.textSearch("search_vector", spec.tsquery, { type: "websearch", config: "simple" })
      : baseFreezer.ilike("name", spec.ilike);

    const [todos, freezer] = await Promise.all([todoQuery.limit(RESULT_LIMIT), freezerQuery.limit(RESULT_LIMIT)]);
    if (todos.error) throw mapDbError(todos.error, "SEARCH_FAILED");
    if (freezer.error) throw mapDbError(freezer.error, "SEARCH_FAILED");
    return json({ todos: todos.data, freezer: freezer.data });
  }),
);
