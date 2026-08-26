// Hearth `push-notify` Edge Function (Deno, server-side only).
//
// Phase 4 (TASKS.md): when a todo is assigned to a profile, send a Web Push
// notification to every device whose push_subscriptions row matches
// (household_id, profile_id) — targeted delivery, nothing else.
//
// Secrets (Edge Function env — NEVER in client code or the repo):
//   SUPABASE_SERVICE_ROLE_KEY
//   VAPID_PUBLIC_KEY
//   VAPID_PRIVATE_KEY

Deno.serve(() => new Response("push-notify stub — implemented in Phase 4", { status: 501 }));
