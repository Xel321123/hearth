// household-create: anonymous household bootstrap (server-side only).
// Generates display code + cryptographically secure password, hashes the
// password (PBKDF2), creates the household + default profile + access token.
// Returns the session material exactly once. Rate: no limit (fresh creation);
// join is rate-limited instead.
import { handle, readJson } from "../_shared/handlers.ts";
import { json } from "../_shared/cors.ts";
import { ApiError, mapDbError } from "../_shared/errors.ts";
import { generateDisplayCode, generateHouseholdPassword } from "../_shared/codes.ts";
import { generateAccessToken, hashPassword, tokenHash } from "../_shared/auth.ts";
import { validateProfileName } from "../_shared/validation.ts";
import { serviceClient } from "../_shared/supabase.ts";

Deno.serve(
  handle(async (req) => {
    if (req.method !== "POST") {
      throw new ApiError(405, "METHOD_NOT_ALLOWED", "POST required");
    }
    const body = await readJson(req);
    const profileName =
      body.profile_name === undefined || body.profile_name === null
        ? "Household"
        : validateProfileName(body.profile_name);

    const supabase = serviceClient();
    const password = generateHouseholdPassword();
    const passwordHash = await hashPassword(password);
    const accessToken = generateAccessToken();
    const tokenHashValue = await tokenHash(accessToken);

    // Insert household; retry on display-code collision (unique constraint 23505).
    let householdId: string | null = null;
    let displayCode = "";
    for (let attempt = 0; attempt < 5 && !householdId; attempt++) {
      displayCode = generateDisplayCode();
      const { data, error } = await supabase
        .from("households")
        .insert({ display_code: displayCode, password_hash: passwordHash })
        .select("id")
        .single();
      if (error) {
        if (error.code === "23505") continue; // code collision — regenerate
        throw mapDbError(error, "HOUSEHOLD_CREATE_FAILED");
      }
      householdId = data.id;
    }
    if (!householdId) {
      throw new ApiError(500, "CODE_EXHAUSTED", "could not allocate a display code");
    }

    // Default profile (fresh household — cannot hit the 5-profile cap).
    const { data: profile, error: profileErr } = await supabase
      .from("profiles")
      .insert({ household_id: householdId, name: profileName })
      .select("id, name")
      .single();
    if (profileErr) {
      await supabase.from("households").delete().eq("id", householdId); // rollback
      throw mapDbError(profileErr, "PROFILE_CREATE_FAILED");
    }

    const { error: tokenErr } = await supabase
      .from("household_tokens")
      .insert({ token_hash: tokenHashValue, household_id: householdId });
    if (tokenErr) {
      await supabase.from("households").delete().eq("id", householdId); // rollback
      throw mapDbError(tokenErr, "TOKEN_CREATE_FAILED");
    }

    return json(
      {
        household_id: householdId,
        display_code: displayCode,
        password,
        access_token: accessToken,
        profile,
      },
      201,
    );
  }),
);
