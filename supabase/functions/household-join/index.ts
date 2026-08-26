// household-join: verify display code + password, issue a fresh access token.
// Same error for unknown code and wrong password (no enumeration).
// Rate-limited per client IP (best-effort, per edge isolate).
import { handle, readJson } from "../_shared/handlers.ts";
import { json } from "../_shared/cors.ts";
import { ApiError, mapDbError } from "../_shared/errors.ts";
import { generateAccessToken, tokenHash, verifyPassword } from "../_shared/auth.ts";
import { validateDisplayCodeInput, validatePasswordInput } from "../_shared/validation.ts";
import { rateLimit } from "../_shared/rate-limit.ts";
import { serviceClient } from "../_shared/supabase.ts";

Deno.serve(
  handle(async (req) => {
    if (req.method !== "POST") {
      throw new ApiError(405, "METHOD_NOT_ALLOWED", "POST required");
    }
    const body = await readJson(req);
    const displayCode = validateDisplayCodeInput(body.display_code);
    const password = validatePasswordInput(body.password);

    const ip = (req.headers.get("x-forwarded-for") ?? "unknown").split(",")[0].trim();
    if (!rateLimit(`join:${ip}`, 10, 10 * 60 * 1000)) {
      throw new ApiError(429, "RATE_LIMITED", "too many attempts — try again later");
    }

    const supabase = serviceClient();
    const { data: household, error } = await supabase
      .from("households")
      .select("id, display_code, password_hash")
      .eq("display_code", displayCode)
      .maybeSingle();
    if (error) throw mapDbError(error, "JOIN_FAILED");

    if (!household || !(await verifyPassword(password, household.password_hash))) {
      throw new ApiError(401, "INVALID_CREDENTIALS", "invalid household code or password");
    }

    const accessToken = generateAccessToken();
    const { error: tokenErr } = await supabase
      .from("household_tokens")
      .insert({ token_hash: await tokenHash(accessToken), household_id: household.id });
    if (tokenErr) throw mapDbError(tokenErr, "TOKEN_CREATE_FAILED");

    return json(
      {
        household_id: household.id,
        display_code: household.display_code,
        access_token: accessToken,
      },
      201,
    );
  }),
);
