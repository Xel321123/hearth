/** Supabase client factories. */
import { createClient, type SupabaseClient } from "jsr:@supabase/supabase-js@2";

function env(name: string): string {
  const v = Deno.env.get(name);
  if (!v) throw new Error(`missing env var: ${name}`);
  return v;
}

/**
 * Client that runs as the CALLER (anon role) and forwards the original
 * Authorization + x-household-token headers, so PostgREST applies RLS with
 * the token's household scoping. Used by all CRUD/search handlers — the
 * database remains the enforcement boundary.
 */
export function callerClient(req: Request): SupabaseClient {
  return createClient(env("SUPABASE_URL"), env("SUPABASE_ANON_KEY"), {
    global: {
      headers: {
        Authorization: req.headers.get("authorization") ?? "",
        "x-household-token": req.headers.get("x-household-token") ?? "",
      },
    },
  });
}

/** Server-side client (BYPASSRLS). ONLY for flows that must bypass RLS:
 * household-create / household-join. Never in client bundles. */
export function serviceClient(): SupabaseClient {
  return createClient(env("SUPABASE_URL"), env("SUPABASE_SERVICE_ROLE_KEY"));
}

export function requireHouseholdToken(req: Request): string {
  const token = req.headers.get("x-household-token");
  if (!token) {
    throw new Error("missing x-household-token header");
  }
  return token;
}
