// push-notify: targeted Web Push dispatch.
//
// When a task is assigned to a profile, the client invokes this function:
//   POST /push-notify { household_id, profile_id, todo: { id, title } }
//
// Device subscriptions are queried via the CALLER's token (RLS scopes them to
// the caller's household), then filtered to the target profile — so a task
// assigned to Profile B notifies ONLY Profile B's registered devices, and a
// caller can never read or notify another household's devices.
//
// Secrets (Edge Function env, never client code):
//   VAPID_PUBLIC_KEY, VAPID_PRIVATE_KEY, VAPID_SUBJECT (mailto:)
import webpush from "npm:web-push@3.6.7";
import { handle, readJson } from "../_shared/handlers.ts";
import { json } from "../_shared/cors.ts";
import { ApiError, mapDbError } from "../_shared/errors.ts";
import { validateTodoTitle, validateUuid } from "../_shared/validation.ts";
import { rateLimit } from "../_shared/rate-limit.ts";
import { dispatchPush, type PushSender } from "../_shared/push.ts";
import { callerClient } from "../_shared/supabase.ts";

function env(name: string): string {
  const v = Deno.env.get(name);
  if (!v) throw new ApiError(500, "MISSING_CONFIG", `${name} is not configured`);
  return v;
}

Deno.serve(
  handle(async (req) => {
    if (req.method !== "POST") {
      throw new ApiError(405, "METHOD_NOT_ALLOWED", "POST required");
    }
    if (!req.headers.get("x-household-token")) {
      throw new ApiError(401, "UNAUTHENTICATED", "missing x-household-token header");
    }

    const body = await readJson(req);
    const householdId = validateUuid(body.household_id, "household_id");
    const profileId = validateUuid(body.profile_id, "profile_id");
    const todo = body.todo as Record<string, unknown> | null | undefined;
    if (typeof todo !== "object" || todo === null) {
      throw new ApiError(400, "VALIDATION_ERROR", "todo is required");
    }
    const todoId = validateUuid(todo.id, "todo.id");
    const title = validateTodoTitle(todo.title);

    // Best-effort per-household anti-abuse.
    if (!rateLimit(`push:${householdId}`, 60, 10 * 60 * 1000)) {
      throw new ApiError(429, "RATE_LIMITED", "too many notifications — try again later");
    }

    // RLS-scoped: only the caller's household subscriptions are visible,
    // filtered to the target profile.
    const supabase = callerClient(req);
    const { data: subscriptions, error } = await supabase
      .from("device_subscriptions")
      .select("endpoint, keys")
      .eq("profile_id", profileId);
    if (error) throw mapDbError(error, "SUBSCRIPTIONS_QUERY_FAILED");

    const subject = env("VAPID_SUBJECT") ?? "mailto:hearth@localhost";
    webpush.setVapidDetails(subject, env("VAPID_PUBLIC_KEY"), env("VAPID_PRIVATE_KEY"));

    const sender: PushSender = {
      sendNotification(subscription, payload, options) {
        return webpush.sendNotification(subscription, payload, options);
      },
    };

    const result = await dispatchPush(
      subscriptions as Array<{ endpoint: string; keys: { p256dh: string; auth: string } }>,
      {
        title: "Hearth — new task",
        body: title,
        data: { type: "todo_assigned", todo_id: todoId, household_id: householdId },
      },
      sender,
      { ttl: 86400, urgency: "high" },
    );

    return json({ ...result, profile_id: profileId });
  }),
);
