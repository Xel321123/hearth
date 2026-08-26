# PROJECT_PLAN.md — Hearth architecture

> Companion to [README.md](README.md) (what & why) and [TASKS.md](TASKS.md) (when & who).
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
│ todos · freezer_items · push_subscriptions      └── (invoke)    │   │  Mozilla/Apple)   │
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

## 4. Data model — schema `hearth`

> Shared-instance rule: **never** the `public` schema. Client pins `db: { schema: "hearth" }`.

**households**
| column | notes |
|---|---|
| `id` uuid PK | internal id, `gen_random_uuid()` |
| `display_code` text UNIQUE | human-friendly join code (e.g. 6-char base32) |
| `password_hash` text NOT NULL | hashed via Edge Function (scrypt/argon2-style); **no reset** |
| `created_at` timestamptz | |

**household_tokens** — join tokens, stored hashed.
| column | notes |
|---|---|
| `token_hash` text PK | hash of the access token the client holds |
| `household_id` uuid FK → households (CASCADE) | |
| `created_at` timestamptz | |

**profiles** — person profiles, *not* auth logins; max 5 per household (trigger-enforced).
| column | notes |
|---|---|
| `id` uuid PK | |
| `household_id` uuid FK → households (CASCADE) | |
| `name` text NOT NULL | CHECK length 1..40 |
| `created_at` timestamptz | |

**todos**
| column | notes |
|---|---|
| `id` uuid PK · `household_id` uuid FK (CASCADE) | |
| `profile_id` uuid FK → profiles | assigned to |
| `created_by` uuid FK → profiles | |
| `title` text NOT NULL | CHECK 1..200 |
| `due_date` date NULL | |
| `tags` text[] DEFAULT '{}' | |
| `archived_at` timestamptz NULL | completing = archive |
| `created_at` timestamptz | |
| index | `(household_id, archived_at, due_date)` |

**freezer_items**
| column | notes |
|---|---|
| `id` uuid PK · `household_id` uuid FK (CASCADE) | |
| `profile_id` uuid FK NULL | who added it |
| `name` text NOT NULL | CHECK 1..200 |
| `added_date` date NOT NULL DEFAULT CURRENT_DATE | FIFO key |
| `quantity` numeric(8,2) NULL · `unit` text NULL | optional weight/qty |
| `tags` text[] DEFAULT '{}' | |
| `consumed_at` timestamptz NULL | consuming = archive |
| index | `(household_id, consumed_at NULLS FIRST, added_date)` |

**push_subscriptions**
| column | notes |
|---|---|
| `id` uuid PK · `household_id` uuid FK (CASCADE) | |
| `profile_id` uuid FK → profiles | device's active persona at registration |
| `device_id` text NOT NULL | stable UUID from localStorage |
| `endpoint` text NOT NULL UNIQUE | Push service endpoint |
| `keys` jsonb NOT NULL | `{ p256dh, auth }` |
| `user_agent` text NULL | debug only |
| `created_at` / `last_seen_at` timestamptz | |
| UNIQUE | `(household_id, profile_id, device_id)` |

**RLS strategy (zero-trust).** Every table:
- `ALTER TABLE hearth.<t> ENABLE ROW LEVEL SECURITY`
- policies via a SECURITY DEFINER helper `hearth.has_access(token) → household_id`
  that looks up `household_tokens` — the client's token arrives in the
  `x-household-token` request header (PostgREST exposes it via
  `current_setting('request.headers', true)`), and all `WHERE household_id = ...`
  clauses are derived from the token, never from client-supplied params.
- `GRANT USAGE ON SCHEMA hearth TO anon` + table-level GRANTs limited to needed verbs (`anon` role only — no `auth.users` in this app).

## 5. Anonymous household auth

1. **Create** — client calls Edge Function `household-create` (never trusts the client to pick the ID/password):
   - generates `display_code` (6-char base32, unambiguous alphabet) and a strong random password,
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

**Todo** — CRUD via `src/lib/todos.ts`. Sort: nearest `due_date` first, undated last. Filters: `mine` (active persona) / `household`. Tags autocomplete from existing tags. Completing a task sets `archived_at` (archive on completion).

**Freezer** — CRUD via `src/lib/freezer.ts`. `added_date` defaults to today. Sort FIFO by `added_date` (oldest first). Consuming sets `consumed_at` (archive to history). Quantity is optional `(numeric, unit)`.

**Search** — global across todos + freezer: free-text (ILIKE on title/name) and `#tag` containment. Start client-side over loaded data; move to a Postgres RPC if data volume grows.

**Push** — see §8.

## 8. Push notifications (targeted)

- VAPID keypair: `npx web-push generate-vapid-keys`. Public → `VITE_VAPID_PUBLIC_KEY`; private → Edge Function secret.
- Registration: `PushManager.subscribe({ userVisibleOnly: true, applicationServerKey })` → upsert `push_subscriptions` for `(household_id, active_profile_id, device_id)`.
- Targeting: assigning a todo to Profile B invokes `push-notify` with `{ household_id, profile_id, todo }`. The function queries subscriptions scoped to that household **and** profile, then sends each endpoint a VAPID-signed push with a minimal payload (todo id + title).
- Service worker handles `push` → `showNotification`; `notificationclick` → focus/open the app (deep-link to the todo in Phase 4).
- Anti-abuse: rate-limit invocations per household in the function (Phase 4).

## 9. PWA & offline

- Manifest + icons already scaffolded (`vite.config.ts`, `public/icons/`, generated by `scripts/gen-icons.py`).
- Workbox: precache app shell; network-first for reads with cache fallback; offline mutation queue (IndexedDB) flushed on `online` event, last-write-wins per row.
- `beforeinstallprompt` UX (Phase 3), update toast via `registerType: "autoUpdate"`.

## 10. Security checklist

- [x] No secrets in client bundles (anon key only) — enforced by convention in AGENTS.md
- [ ] RLS enabled + policies on all 6 tables
- [ ] Passwords hashed server-side; tokens stored hashed
- [ ] `display_code`/password generated server-side (not client-chosen)
- [ ] Brute-force protection on join (rate limit in Edge Function)
- [ ] Cross-household access impossible (token-derived scoping)
- [ ] No PII anywhere (no emails/phones/analytics)
- [ ] Edge Functions: CORS restricted, secrets via env only

## 11. Roadmap

Phase 0 (workspace) ✅ → Phase 1 (data layer + auth) → Phase 2 (modules + UI) →
Phase 3 (PWA/offline) → Phase 4 (push + launch). Detailed tasks & acceptance
criteria: [`TASKS.md`](TASKS.md).

## 12. Out of scope for v1

Multi-household memberships, invitations by email, recurring tasks, expiry dates,
photos, comments/chat, cloud accounts, cross-device sync of persona.
