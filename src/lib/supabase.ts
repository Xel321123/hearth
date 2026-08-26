import { createClient } from "@supabase/supabase-js";

const url = import.meta.env.VITE_SUPABASE_URL as string | undefined;
const anonKey = import.meta.env.VITE_SUPABASE_ANON_KEY as string | undefined;

if (!url || !anonKey) {
  throw new Error(
    "Missing Supabase env vars — copy .env.example to .env first (see AGENTS.md).",
  );
}

/**
 * Shared-instance convention: every project lives in its own PostgreSQL schema,
 * NEVER the public schema. The client pins it via `db.schema`.
 * Only the publishable anon key is ever used client-side.
 */
export const supabase = createClient(url, anonKey, {
  db: { schema: "hearth" },
});
