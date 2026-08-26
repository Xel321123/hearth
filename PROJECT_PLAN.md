# PROJECT_PLAN.md — Hearth architecture

> Companion to [README.md](README.md) (what & why), [TASKS.md](TASKS.md) (when & who),
> and [DOCS_DB.md](DOCS_DB.md) (database schema + RLS).
> This document is the *how*: data model, auth, modules, push, security.

## 1. Vision & principles

Hearth is a privacy-first PWA for shared households: a Todo list and a Freezer
inventory in one offline-capable, installable app. No accounts, no PII, no
recovery flows — a household is a random ID + password that the people in the
household share with each other.

**Principles**

1. **Privacy-first** — collect the minimum: household ID, password, names (per household), device identifiers. Nothing else. No analytics.
2. **Zero-trust** — the client is never trusted. Business rules live in PostgreSQL (CHECK constraints, triggers, FKs) and RLS is enabled on every table.
3. **Offline-first** — the PWA shell is cached; reads fall back to cache; mutations queue and sync.
4. **Household-scoped** — every table is scoped by `household_id`; the access token is the only credential.
5. **Simple > clever** — flat lists, ≤5 profiles, no invites, no memberships across households.

## 2. System architecture

```
┌────────────────────────────── PWA (browser / device) ──────────────────────────────┐
│ React app (mobile-first) · Service Worker (cache + push) · localStorage            │
│   persona: active_profile_id · device_id (UUID) · session: household_id + token    │
└──────────────┬───────────────────────────────────────────────┬─────────────────────┘
               │ PostgREST (anon key + x-household-token header)│ Browser Push API (VAPID)
               ▼                                               ▼
┌────────────────────────────── Supabase ────────────────────────┐   ┌──────────────────┐
│ PostgreSQL — schema `hearth`, RLS everywhere  ◄──┐  Edge Fn     │   │  Browser Push    │
│ households · household_tokens · profiles         │  push-notify ┼──►│  Service (Google/ │
│ todos · freezer_items · device_subscriptions    └── (invoke)    │   │  Mozilla/Apple)   │
└─────────────────────────────────────────────────────────────────┘   └──────────────────┘
```

Data path: PWA ⇄ PostgREST (RLS-enforced, token-gated) ⇄ Postgres.
Push path: client assigns todo → invokes `push-notify` Edge Function →
function looks up subscriptions for (household, assigned profile) → sends
VAPID-signed Web Push → only that profile's devices show the notification.

## 3. Stack decisions

| Choice | Why |
|---|---|
| Vite + React + TS (strict) | Fast dev, typed, standard PWA ecosystem via `vite-plugin-pwa` |
| Tailwind v4 | Utility-first, zero runtime, mobile-first |
| Supabase (shared instance) | Postgres + PostgREST + RLS + Edge Functions in one product; isolated schema per project (`hearth`) |
| Web Push + VAPID | Standards-based targeted notifications, no custom server needed |
| localStorage | Persona + device id + session: tiny, offline-capable, no PII sent anywhere |

## 4. Data model — schema `hearth` (implemented in 0002_core_schema.sql)

> Shared-instance rule: **never** the `public` schema. Client pins `db: { schema: "hearth" }`.
> Full column-level reference, constraints and RLS matrix: **DOCS_DB.md**.

| table | role | key rules |
|---|---|---|
| `households` | anonymous household identity | uuid PK; `display_code` (6-char Crockford base32, no I/L/O/U/0/1); `password_hash` (server-side only); **no reset** |
| `household_tokens` | hashed bearer tokens | `token_hash` (sha256 hex) PK; **deny-all** for anon; read only via SECURITY DEFINER helper |
| `profiles` | named personas (not logins) | ≤ 5/household — advisory-locked trigger; name UNIQUE per household; 1–40 chars |
| `todos` | tasks | title 1–200; `due_date`; assigned `profile_id` (same-household trigger); `tags text[]` (validated, ≤ 20, GIN-indexed); `completed` + `completed_at` consistency CHECK; completion = archive |
| `freezer_items` | freezer inventory | `added_date` DEFAULT today (FIFO); `quantity` free-form string (`2.5 kg`); `consumed` + `consumed_at` CHECK; tags as todos |
| `device_subscriptions` | push subscriptions | UNIQUE (household_id, profile_id, device_id); UNIQUE endpoint; `keys jsonb` {p256dh, auth}; same-household profile trigger |

**Cross-household integrity:** trigger `enforce_profile_household()` on
todos/freezer_items/device_subscriptions rejects any `profile_id` from a
different household — FKs alone can't express this.

**RLS strategy (zero-trust).** Every table `ENABLE + FORCE ROW LEVEL SECURITY`;
explicit per-verb policies `TO anon, authenticated` gated on
`hearth_private.current_household_id()` — a SECURITY DEFINER helper (in the
**unexposed** `hearth_private` schema, per Supabase skill guidance) that
sha256-hashes the `x-household-token` request header and looks it up in
`household_tokens` (no `auth.uid()`: there are no user accounts). Policy calls
are wrapped in `(SELECT …)` so the lookup runs once per query, not per row.
Grants limited to needed verbs; `household_tokens` gets none. Verified 19/19
against a real Postgres engine (see `supabase/scripts/smoke_test_rls.sql`).

## 5. Anonymous household auth

1. **Create** — client calls Edge Function `household-create` (never trusts the client to pick the ID/password):
   - generates `display_code` (6-char base32, unambiguous alphabet — see DOCS_DB §2.1) and a strong random password,
   - hashes the password, inserts `households` + default `profile` ("Household"),
   - inserts one `household_token` and returns `{ household_id, display_code, password, access_token }`.
2. **Join** — Edge Function `household-join(code, password)` verifies the hash and issues a fresh token.
3. **Session** — client persists `{ household_id, access_token }` in localStorage and sends the token as the `x-household-token` header on every request.
4. **No reset, no recovery** — deliberate. Passwords are only ever hashed; support story is "start a new household".
5. **Delete** — household wipe (CASCADE) + token revocation (Phase 4).

## 6. Device persona

- `device_id`: `crypto.randomUUID()` generated once per device, stored in localStorage, used to map push subscriptions.
- `active_profile_id`: per-household localStorage value; every view defaults/filters to this persona; user can switch.
- A device may register push subscriptions for *its currently active profile* — changing persona re-registers the subscription (Phase 4).

## 7. Modules

**Todo** — CRUD via `src/lib/todos.ts`. Sort: nearest `due_date` first, undated last (partial index `todos_active_deadline_idx` serves exactly this). Filters: `mine` (active persona) / `household`. Tags autocomplete from existing tags. Completing a task sets `completed = true, completed_at = now()` (archive on completion).

**Freezer** — CRUD via `src/lib/freezer.ts`. `added_date` defaults to today. Sort FIFO by `added_date` (oldest first). Consuming sets `consumed = true, consumed_at = now()` (archive to history). Quantity is an optional free-form string (`2.5 kg`, `1`, `500 g`).

**Search** — global across todos + freezer: free-text (ILIKE on title/name) and `#tag` containment (GIN `@>`). Start client-side over loaded data; move to a Postgres RPC if data volume grows.

**Push** — see §8.

## 8. Push notifications (targeted)

- VAPID keypair: `npx web-push generate-vapid-keys`. Public → `VITE_VAPID_PUBLIC_KEY`; private → Edge Function secret.
- Registration: `PushManager.subscribe({ userVisibleOnly: true, applicationServerKey })` → upsert `device_subscriptions` for `(household_id, active_profile_id, device_id)`.
- Targeting: assigning a todo to Profile B invokes `push-notify` with `{ household_id, profile_id, todo }`. The function queries subscriptions scoped to that household **and** profile (index `device_subscriptions_profile_idx`), then sends each endpoint a VAPID-signed push with a minimal payload (todo id + title).
- Service worker handles `push` → `showNotification`; `notificationclick` → focus/open the app (deep-link to the todo in Phase 4).
- Anti-abuse: rate-limit invocations per household in the function (Phase 4).

## 9. PWA & offline

- Manifest + icons already scaffolded (`vite.config.ts`, `public/icons/`, generated by `scripts/gen-icons.py`).
- Workbox: precache app shell; network-first for reads with cache fallback; offline mutation queue (IndexedDB) flushed on `online` event, last-write-wins per row.
- `beforeinstallprompt` UX (Phase 3), update toast via `registerType: "autoUpdate"`.

## 10. Security checklist

- [x] No secrets in client bundles (anon key only) — enforced by convention in AGENTS.md
- [x] RLS enabled + policies on all 6 tables — verified 19/19 (smoke test)
- [x] Cross-household reference guard (profile → same household) via triggers
- [x] Tokens stored hashed (sha256); `household_tokens` deny-all for anon
- [x] `display_code` format constrained at the DB level (generator must match)
- [ ] Password hashing with a strong algorithm (Edge Function, Phase 1)
- [ ] Brute-force protection on join (rate limit in Edge Function)
- [ ] Household wipe + token revocation UI (Phase 4)
- [ ] No PII anywhere (no emails/phones/analytics)
- [ ] Edge Functions: CORS restricted, secrets via env only

## 11. Roadmap

Phase 0 (workspace) ✅ → Phase 1 (data layer + auth — **schema done**, client + Edge Functions next) → Phase 2 (modules + UI) →
Phase 3 (PWA/offline) → Phase 4 (push + launch). Detailed tasks & acceptance
criteria: [`TASKS.md`](TASKS.md).

## 12. Out of scope for v1

Multi-household memberships, invitations by email, recurring tasks, expiry dates,
photos, comments/chat, cloud accounts, cross-device sync of persona.
