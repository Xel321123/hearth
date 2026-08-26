# DOCS_DB.md — Hearth database design, relations & RLS

The database is PostgreSQL on Supabase (shared instance). Everything lives in
the isolated **`hearth`** schema — never `public` (see AGENTS.md conventions).
This document describes the schema implemented by `supabase/migrations/0002_core_schema.sql`.

- **Data model** → tables, columns, constraints, relations
- **RLS enforcement** → how anonymous households are isolated at the database level
- **Indexes** → what's optimized and why
- **Operate** → apply migrations, seed, smoke-test RLS

---

## 1. Access model (no user accounts)

Hearth has **no `auth.users`**, no emails, no JWTs for end users. Every request
is authenticated by a **household access token**:

```
client ── x-household-token: <token> ──▶ PostgREST ──▶ request.headers GUC
                                                          │
                                     hearth_private.current_household_id()  (SECURITY DEFINER, unexposed schema)
                                          sha256(token) → household_tokens.token_hash → household_id
                                                          │
                                              RLS policies: WHERE <col>_id = that household_id
```

- Tokens are stored **hashed** (`sha256`, hex) in `household_tokens` — the raw
  token is returned to the client exactly once (create/join) by an Edge Function.
- `household_tokens` is **deny-all** for `anon`; only the SECURITY DEFINER helper
  reads it. Even a leaked DB dump exposes nothing usable.
- No token header → helper returns NULL → every policy evaluates false → **zero rows**.
  Deny-by-default.

## 2. Tables

| table | purpose | anon verbs (RLS-scoped) |
|---|---|---|
| `households` | household identity: display code + hashed password | SELECT own row only |
| `household_tokens` | hashed access tokens | none (deny-all) |
| `profiles` | named personas, ≤ 5 per household | CRUD own household |
| `todos` | tasks: title, due date, assigned profile, #tags, completed | CRUD own household |
| `freezer_items` | freezer inventory: name, added date, qty/unit, #tags | CRUD own household |
| `device_subscriptions` | Web Push subs keyed (household, profile, device) | CRUD own household |

### 2.1 households

| column | type | notes |
|---|---|---|
| `id` | uuid PK | `gen_random_uuid()` |
| `display_code` | text UNIQUE NOT NULL | 6 chars, `^[A-HJ-KM-NP-TV-Z2-9]{6}$` — Crockford base32 minus 0/1 (no I,L,O,U). Generator alphabet: `ABCDEFGHJKMNPQRSTVWXYZ23456789` |
| `password_hash` | text NOT NULL | server-hashed credential; **no reset by design** |
| `created_at` | timestamptz | |

Creation/password hashing/household wipe are **server-side only** (Edge Functions
with service role) — hence no anon INSERT/UPDATE/DELETE here.

### 2.2 household_tokens

| column | type | notes |
|---|---|---|
| `token_hash` | text PK | `^[a-f0-9]{64}$` — sha256 hex of the bearer token |
| `household_id` | uuid FK → households (CASCADE) | |
| `created_at` | timestamptz | |

### 2.3 profiles

| column | type | notes |
|---|---|---|
| `id` | uuid PK | |
| `household_id` | uuid FK → households (CASCADE) | |
| `name` | text NOT NULL | CHECK 1–40 chars; UNIQUE per household |
| `created_at` | timestamptz | |

**Cap:** ≤ 5 profiles per household, enforced by trigger
`hearth.enforce_profile_limit()` (advisory-locked count → correct under concurrency).

### 2.4 todos

| column | type | notes |
|---|---|---|
| `id` | uuid PK | |
| `household_id` | uuid FK → households (CASCADE) | RLS scope |
| `profile_id` | uuid FK → profiles (CASCADE) | assigned profile — same-household enforced by trigger |
| `created_by` | uuid FK → profiles (SET NULL) | who added it |
| `title` | text NOT NULL | CHECK 1–200 chars |
| `due_date` | date NULL | nearest-deadline sorting |
| `tags` | text[] NOT NULL DEFAULT '{}' | ≤ 20 tags, each `[a-zA-Z0-9_-]{1,30}` (stored without `#`) |
| `completed` | boolean NOT NULL DEFAULT false | completion = archive |
| `completed_at` | timestamptz NULL | consistency CHECK: completed ⇔ completed_at set |
| `created_at` | timestamptz | |

### 2.5 freezer_items

| column | type | notes |
|---|---|---|
| `id` | uuid PK | |
| `household_id` | uuid FK → households (CASCADE) | RLS scope |
| `profile_id` | uuid FK → profiles (SET NULL) | who added it (optional) |
| `name` | text NOT NULL | CHECK 1–200 chars |
| `added_date` | date NOT NULL DEFAULT current_date | FIFO key |
| `quantity` | text NULL | free-form qty/unit string, e.g. `2.5 kg`, `1`, `500 g` (≤ 30 chars) |
| `tags` | text[] NOT NULL DEFAULT '{}' | same rule as todos |
| `consumed` | boolean NOT NULL DEFAULT false | consumed = archive |
| `consumed_at` | timestamptz NULL | consistency CHECK: consumed ⇔ consumed_at set |
| `created_at` | timestamptz | |

### 2.6 device_subscriptions

| column | type | notes |
|---|---|---|
| `id` | uuid PK | |
| `household_id` | uuid FK → households (CASCADE) | |
| `profile_id` | uuid FK → profiles (CASCADE) | device's active persona → **targeted push** |
| `device_id` | text NOT NULL | stable per-device UUID from localStorage |
| `endpoint` | text NOT NULL | UNIQUE — one endpoint can't be double-registered |
| `keys` | jsonb NOT NULL | `{ p256dh, auth }` (checked via jsonb existence + type) |
| `user_agent` | text NULL | debug |
| `created_at` / `last_seen_at` | timestamptz | |
| UNIQUE | `(household_id, profile_id, device_id)` | one subscription per device per persona |

## 3. Relations

```
households 1──∞ profiles                 (max 5, trigger)
households 1──∞ household_tokens         (deny-all table)
households 1──∞ todos                    (todos.profile_id → profiles, same household)
households 1──∞ freezer_items            (freezer_items.profile_id → profiles, nullable)
households 1──∞ device_subscriptions     (device_subscriptions.profile_id → profiles, same household)
```

**Cross-household reference guard:** FKs alone can't express "profile must belong
to the same household", so trigger `hearth.enforce_profile_household()` runs on
INSERT/UPDATE of `todos`, `freezer_items` and `device_subscriptions` and rejects
any `profile_id` whose household differs from the row's `household_id`. This
closes the "reference smuggling" hole a pure FK/RLS design leaves open.

## 4. RLS enforcement

Every table: `ENABLE ROW LEVEL SECURITY` **+ `FORCE`** (RLS applies even to the
table owner; superusers/service_role with BYPASSRLS remain exempt — that's how
migrations and Edge Functions work). Explicit per-verb policies **TO anon,
authenticated** (no `auth.uid()` — there are no users). All policies derive the
household from the request header via `hearth_private.current_household_id()`,
**wrapped in `(SELECT …)` so it is evaluated once per query, not per row**
(verified: plan shows an InitPlan, not a per-row filter).

### Policy matrix

| table | policy | clause | effect |
|---|---|---|---|
| `households` | `households_select_own` | `id = current_household_id()` | read own row |
| `household_tokens` | *(none — deny all)* | — | no anon access at all |
| `profiles` | select/insert/update/delete `_own` | `household_id = current_household_id()` | full CRUD, own household |
| `todos` | select/insert/update/delete `_own` | `household_id = current_household_id()` | full CRUD, own household |
| `freezer_items` | select/insert/update/delete `_own` | `household_id = current_household_id()` | full CRUD, own household |
| `device_subscriptions` | select/insert/update/delete `_own` | `household_id = current_household_id()` | full CRUD, own household |

INSERT uses `WITH CHECK`; SELECT/UPDATE/DELETE use `USING` (UPDATE also re-checks
`WITH CHECK` on the new row).

### Helper functions (all in `hearth_private` — NOT exposed to the Data API)

| function | kind | purpose |
|---|---|---|
| `hearth_private.request_header(text)` | STABLE, plain | case-insensitive read of a PostgREST header from the `request.headers` GUC |
| `hearth_private.current_household_id()` | STABLE, **SECURITY DEFINER**, search_path pinned | sha256(header) → `household_tokens` → household uuid; NULL = unauthenticated |
| `hearth_private.tags_valid(text[])` | IMMUTABLE | CHECK-constraint validator for tag arrays |
| `hearth_private.enforce_profile_limit()` | plpgsql, **SECURITY DEFINER** | trigger: ≤ 5 profiles, advisory-locked |
| `hearth_private.enforce_profile_household()` | plpgsql, **SECURITY DEFINER** | trigger: profile belongs to same household |

SECURITY DEFINER + pinned `search_path` (`hearth, pg_catalog`) = the helper can
read `household_tokens` on behalf of anon without exposing it, and can't be
hijacked via search_path manipulation. **The private schema means these
functions are never callable as PostgREST RPC endpoints** (only exposed schemas
produce RPCs). Execution privileges: REVOKE from PUBLIC, GRANT to
anon/authenticated only (tags_valid is needed by CHECKs that run as the DML
role; trigger functions fire as the inserting role).

### Grants (anon + authenticated)

```
GRANT USAGE ON SCHEMA hearth TO anon, authenticated;
GRANT USAGE ON SCHEMA hearth_private TO anon, authenticated;
GRANT SELECT ON hearth.households TO anon, authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON hearth.profiles, hearth.todos,
      hearth.freezer_items, hearth.device_subscriptions TO anon, authenticated;
-- household_tokens: NO grants

-- service_role (server-side only, migration 0003): same verbs as anon on data
-- tables + SELECT/INSERT/DELETE on household_tokens (no UPDATE — immutable);
-- USAGE + EXECUTE on hearth_private helpers. BYPASSRLS by design.
```

## 5. Indexes

| index | table | purpose |
|---|---|---|
| `todos_active_deadline_idx` | todos `(household_id, due_date) WHERE NOT completed` | **active todos by deadline** — partial index, tiny, covers the main list query |
| `freezer_items_added_date_idx` | freezer_items `(household_id, added_date)` | **FIFO by date added** |
| `device_subscriptions_profile_idx` | device_subscriptions `(household_id, profile_id)` | **push targeting by profile** |
| `todos_tags_gin` | todos `USING gin (tags)` | `#tag` search (`@>`, `&&`) |
| `freezer_items_tags_gin` | freezer_items `USING gin (tags)` | `#tag` search |
| `todos_search_gin` / `freezer_items_search_gin` | `USING gin (search_vector)` | full-text search (migration 0004) |
| `profiles_household_idx`, `household_tokens_household_idx`, `todos_household_idx`, `freezer_items_household_idx` | FK columns | cascade deletes + joins |

`search_vector` is a generated column (migration 0004) over title/name + tags,
built by the IMMUTABLE wrapper `hearth_private.immutable_tsvector(text, text[])`
— required because `to_tsvector`, `array_to_string` and `concat` are STABLE and
generated columns only accept immutable expressions (42P17).

## 6. Operating

### Apply migrations

```bash
# Supabase CLI (project-link + db push), or paste each file into
# Dashboard → SQL Editor in order: 0001_bootstrap.sql, 0002_core_schema.sql
supabase db push
```

One-time dashboard step: **Project Settings → API → Exposed schemas → add `hearth`**.

### Seed (dev/demo only)

```bash
psql "$DATABASE_URL" -f supabase/seed.sql
```

Creates two households with known tokens so RLS can be exercised without the
Edge Functions: **alpha** (`HEARTH` / `dev-token-alpha`, 5 profiles at the cap)
and **beta** (`BETAMN` / `dev-token-beta`, 2 profiles). Password/token hashes in
the seed are sha256 placeholders — production values come from the
`household-create` Edge Function. **Never ship the seed to production data.**

### Smoke test RLS

```bash
psql "$DATABASE_URL" -f supabase/scripts/smoke_test_rls.sql
```

17 steps covering: per-token visibility, cross-household INSERT/UPDATE/DELETE
blocked, profile cap, cross-household reference guard, CHECK constraints,
deny-all tokens table, index usage. The schema has been verified 19/19 against a
Postgres engine via the PGlite harness (migrations + seed + all scenarios).

### Manual PostgREST probe

```bash
curl -s https://<project-ref>.supabase.co/rest/v1/todos?select=title \
  -H "apikey: $ANON_KEY" \
  -H "Authorization: Bearer $ANON_KEY" \
  -H "x-household-token: dev-token-alpha"
```

Returns only alpha's rows; omitting the header returns `[]`.

## 7. Security notes

- **Deny-by-default**: no token → NULL household → no rows; missing policies → no access.
- **No PII**: no emails/phones anywhere; names are household-local and user-chosen.
- **Secrets**: anon key is publishable; service role key + VAPID private key live in Edge Function secrets only.
- **Rate limiting / brute force**: join attempts must be throttled in the Edge Function (Phase 1 client work) — the DB layer is not a rate limiter.
- **Token revocation**: deleting a `household_tokens` row revokes that device instantly; deleting the household cascades everything.
- **Password reset**: intentionally impossible at the schema level (no recovery columns, no auth.users).
