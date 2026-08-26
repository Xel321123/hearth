/** Supabase client factories. */
import { createClient, type SupabaseClient } from "jsr:@supabase/supabase-js@2";
import { ApiError } from "./errors.ts";

function env(name: string): string {
  const v = Deno.env.get(name);
  if (!v) throw new Error(`missing env var: ${name}`);
  return v;
}

/**
 * Publishable/anon key. Supabase injects the legacy SUPABASE_ANON_KEY and is
 * migrating to the SUPABASE_PUBLISHABLE_KEYS JSON dict — support both.
 * Safe in clients: RLS is the enforcement boundary.
 */
function publishableKey(): string {
  const legacy = Deno.env.get("SUPABASE_ANON_KEY");
  if (legacy) return legacy;
  const dict = Deno.env.get("SUPABASE_PUBLISHABLE_KEYS");
  if (dict) {
    try {
      const parsed = JSON.parse(dict) as Record<string, unknown>;
      const k = parsed["default"] ?? parsed["anon"] ?? Object.values(parsed)[0];
      if (typeof k === "string") return k;
    } catch {
      /* fall through to error */
    }
  }
  throw new Error("missing publishable key (SUPABASE_ANON_KEY / SUPABASE_PUBLISHABLE_KEYS)");
}

/** Service role key — server-side flows only, NEVER in client code. */
function secretKey(): string {
  const legacy = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");
  if (legacy) return legacy;
  const dict = Deno.env.get("SUPABASE_SECRET_KEYS");
  if (dict) {
    try {
      const parsed = JSON.parse(dict) as Record<string, unknown>;
      const k = parsed["default"] ?? parsed["service_role"] ?? Object.values(parsed)[0];
      if (typeof k === "string") return k;
    } catch {
      /* fall through to error */
    }
  }
  throw new Error("missing secret key (SUPABASE_SERVICE_ROLE_KEY / SUPABASE_SECRET_KEYS)");
}

/**
 * Client that runs as the CALLER (anon role) and forwards the original
 * Authorization + x-household-token headers, so PostgREST applies RLS with
 * the token's household scoping. Used by all CRUD/search handlers — the
 * database remains the enforcement boundary.
 */
export function callerClient(req: Request): SupabaseClient {
  return createClient(env("SUPABASE_URL"), publishableKey(), {
    // Shared-instance convention: never public — pin the project schema.
    db: { schema: "hearth" },
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
  return createClient(env("SUPABASE_URL"), secretKey(), {
    // Shared-instance convention: never public — pin the project schema.
    db: { schema: "hearth" },
  });
}

export function requireHouseholdToken(req: Request): string {
  const token = req.headers.get("x-household-token");
  if (!token) {
    throw new ApiError(401, "UNAUTHENTICATED", "missing x-household-token header");
  }
  return token;
}
