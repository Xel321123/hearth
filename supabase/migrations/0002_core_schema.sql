-- Hearth — migration 0002: core schema (tables, functions, triggers, RLS, grants, indexes).
--
-- Shared-instance convention: everything lives in the isolated `hearth` schema (never `public`).
-- Auth model: anonymous households — there is NO auth.users. Every request is
-- authenticated by a bearer token sent in the `x-household-token` request header.
-- RLS policies resolve that token to a household via hearth.current_household_id()
-- (SECURITY DEFINER). Full explanation: DOCS_DB.md.
--
-- Re-runnable: CREATE ... IF NOT EXISTS / DROP POLICY IF EXISTS / OR REPLACE.

begin;

create schema if not exists hearth;

-- ─────────────────────────────────────────────────────────────────────────────
-- helpers
-- ─────────────────────────────────────────────────────────────────────────────

-- Case-insensitive read of a request header exposed by PostgREST via the
-- `request.headers` GUC (JSON text). NULL when absent.
create or replace function hearth.request_header(name text)
returns text
language sql
stable
as $$
  select kv.value
  from jsonb_each_text(
    nullif(current_setting('request.headers', true), '')::jsonb
  ) as kv(key, value)
  where lower(kv.key) = lower(request_header.name)
  limit 1
$$;

comment on function hearth.request_header(text) is
  'Reads a PostgREST request header from the request.headers GUC.';

-- Tag format rule used by CHECK constraints on todos.tags / freezer_items.tags.
-- Tags are stored WITHOUT the leading '#' (UI adds it); 1-30 chars of
-- a-z A-Z 0-9 _ -, no whitespace, max 20 tags per row.
create or replace function hearth.tags_valid(tags text[])
returns boolean
language sql
immutable
parallel safe
as $$
  select coalesce(bool_and(
    tag <> ''
    and tag = btrim(tag)
    and char_length(tag) <= 30
    and tag ~ '^[a-zA-Z0-9_-]+$'
  ), true)
  from unnest(coalesce(tags, array[]::text[])) as t(tag)
$$;

comment on function hearth.tags_valid(text[]) is
  'Validates tag arrays: 1-30 chars of [a-zA-Z0-9_-] each, no whitespace.';

-- ─────────────────────────────────────────────────────────────────────────────
-- tables
-- ─────────────────────────────────────────────────────────────────────────────

create table if not exists hearth.households (
  id            uuid primary key default gen_random_uuid(),
  -- human-friendly join code: 6 chars, Crockford base32 minus 0/1 (no I,L,O,U).
  -- Generator (Edge Function) MUST use alphabet: ABCDEFGHJKMNPQRSTVWXYZ23456789
  display_code  text not null unique check (display_code ~ '^[A-HJ-KM-NP-TV-Z2-9]{6}$'),
  -- Hashed credential (server-side hashing only; no plaintext, no reset).
  password_hash text not null check (char_length(password_hash) <= 255),
  created_at    timestamptz not null default now()
);

comment on table hearth.households is
  'Anonymous household: random display code + hashed password. No PII, no reset.';

-- Join/access tokens, stored HASHED (sha256 hex). The raw token is returned to
-- the client once at create/join time and sent as the x-household-token header.
-- No direct anon access: only hearth.current_household_id() (SECURITY DEFINER)
-- reads this table.
create table if not exists hearth.household_tokens (
  token_hash   text primary key check (token_hash ~ '^[a-f0-9]{64}$'),
  household_id uuid not null references hearth.households(id) on delete cascade,
  created_at   timestamptz not null default now()
);

comment on table hearth.household_tokens is
  'Hashed household access tokens; deny-all for anon (helper functions only).';

-- Person profiles (names only — NOT auth logins). Max 5 per household,
-- enforced by trigger hearth.enforce_profile_limit().
create table if not exists hearth.profiles (
  id           uuid primary key default gen_random_uuid(),
  household_id uuid not null references hearth.households(id) on delete cascade,
  name         text not null check (char_length(name) between 1 and 40),
  created_at   timestamptz not null default now(),
  unique (household_id, name)
);

comment on table hearth.profiles is
  'Named person profiles inside a household (max 5, trigger-enforced).';

create table if not exists hearth.todos (
  id           uuid primary key default gen_random_uuid(),
  household_id uuid not null references hearth.households(id) on delete cascade,
  profile_id   uuid not null references hearth.profiles(id) on delete cascade,
  created_by   uuid references hearth.profiles(id) on delete set null,
  title        text not null check (char_length(title) between 1 and 200),
  due_date     date,
  tags         text[] not null default '{}'
                 check (cardinality(tags) <= 20 and hearth.tags_valid(tags)),
  completed    boolean not null default false,
  completed_at timestamptz,
  created_at   timestamptz not null default now(),
  constraint todos_completed_consistency check (
    (completed and completed_at is not null)
    or (not completed and completed_at is null)
  )
);

comment on table hearth.todos is
  'Tasks: title, due date, assigned profile, #tags. Completion archives (completed=true, completed_at).';

create table if not exists hearth.freezer_items (
  id           uuid primary key default gen_random_uuid(),
  household_id uuid not null references hearth.households(id) on delete cascade,
  profile_id   uuid references hearth.profiles(id) on delete set null,
  name         text not null check (char_length(name) between 1 and 200),
  added_date   date not null default current_date,
  -- free-form quantity/unit string, e.g. '2.5 kg', '1', '500 g'
  quantity     text check (quantity is null or char_length(quantity) between 1 and 30),
  tags         text[] not null default '{}'
                 check (cardinality(tags) <= 20 and hearth.tags_valid(tags)),
  consumed     boolean not null default false,
  consumed_at  timestamptz,
  created_at   timestamptz not null default now(),
  constraint freezer_consumed_consistency check (
    (consumed and consumed_at is not null)
    or (not consumed and consumed_at is null)
  )
);

comment on table hearth.freezer_items is
  'Freezer inventory: name, added date (FIFO), optional quantity/unit string, #tags.';

-- Web Push subscriptions, mapped to (household_id, profile_id, device_id) so
-- notifications for tasks assigned to Profile B reach only Profile B's devices.
create table if not exists hearth.device_subscriptions (
  id           uuid primary key default gen_random_uuid(),
  household_id uuid not null references hearth.households(id) on delete cascade,
  profile_id   uuid not null references hearth.profiles(id) on delete cascade,
  device_id    text not null check (char_length(device_id) between 1 and 64),
  endpoint     text not null,
  keys         jsonb not null check (
                  jsonb_typeof(keys) = 'object' and keys ? 'p256dh' and keys ? 'auth'
                ),
  user_agent   text,
  created_at   timestamptz not null default now(),
  last_seen_at timestamptz not null default now(),
  unique (household_id, profile_id, device_id),
  unique (endpoint)
);

comment on table hearth.device_subscriptions is
  'Push subscriptions keyed by (household, profile, device) for targeted notifications.';

-- ─────────────────────────────────────────────────────────────────────────────
-- integrity triggers
-- ─────────────────────────────────────────────────────────────────────────────

-- Max 5 profiles per household. Advisory-locked count makes it safe under
-- concurrent inserts (real constraint, not best-effort).
create or replace function hearth.enforce_profile_limit()
returns trigger
language plpgsql
security definer
set search_path = hearth, pg_catalog
as $$
begin
  perform pg_advisory_xact_lock(hashtextextended(new.household_id::text, 0));
  if (select count(*) from hearth.profiles where household_id = new.household_id) >= 5 then
    raise exception 'profile limit reached: a household can have at most 5 profiles';
  end if;
  return new;
end;
$$;

drop trigger if exists profiles_max_5 on hearth.profiles;
create trigger profiles_max_5
  before insert on hearth.profiles
  for each row
  execute function hearth.enforce_profile_limit();

-- A row referencing a profile must reference a profile of the SAME household.
-- (FKs alone can't express this; prevents cross-household reference smuggling.)
create or replace function hearth.enforce_profile_household()
returns trigger
language plpgsql
security definer
set search_path = hearth, pg_catalog
as $$
declare
  profile_household uuid;
begin
  if new.profile_id is null then
    return new;
  end if;
  select p.household_id into profile_household
  from hearth.profiles as p
  where p.id = new.profile_id;
  if profile_household is distinct from new.household_id then
    raise exception 'profile % does not belong to household %', new.profile_id, new.household_id;
  end if;
  return new;
end;
$$;

drop trigger if exists todos_profile_household_match on hearth.todos;
create trigger todos_profile_household_match
  before insert or update on hearth.todos
  for each row
  execute function hearth.enforce_profile_household();

drop trigger if exists freezer_profile_household_match on hearth.freezer_items;
create trigger freezer_profile_household_match
  before insert or update on hearth.freezer_items
  for each row
  execute function hearth.enforce_profile_household();

drop trigger if exists device_sub_profile_household_match on hearth.device_subscriptions;
create trigger device_sub_profile_household_match
  before insert or update on hearth.device_subscriptions
  for each row
  execute function hearth.enforce_profile_household();

-- ─────────────────────────────────────────────────────────────────────────────
-- RLS helper: current request's household, derived from the bearer token
-- ─────────────────────────────────────────────────────────────────────────────

create or replace function hearth.current_household_id()
returns uuid
language sql
stable
security definer
set search_path = hearth, pg_catalog
as $$
  select t.household_id
  from hearth.household_tokens as t
  where t.token_hash = encode(sha256(hearth.request_header('x-household-token')::bytea), 'hex')
  limit 1
$$;

comment on function hearth.current_household_id() is
  'RLS helper: hashes the x-household-token header and resolves it to a household id. NULL = no/invalid token.';

-- ─────────────────────────────────────────────────────────────────────────────
-- indexes
-- ─────────────────────────────────────────────────────────────────────────────

-- 1) active todos by deadline (partial index: open tasks only) — "My Tasks"/sort
create index if not exists todos_active_deadline_idx
  on hearth.todos (household_id, due_date)
  where not completed;

-- 2) freezer FIFO by date added
create index if not exists freezer_items_added_date_idx
  on hearth.freezer_items (household_id, added_date);

-- 3) push targeting by household + profile
create index if not exists device_subscriptions_profile_idx
  on hearth.device_subscriptions (household_id, profile_id);

-- #tag search across both modules
create index if not exists todos_tags_gin on hearth.todos using gin (tags);
create index if not exists freezer_items_tags_gin on hearth.freezer_items using gin (tags);

-- FK cascade/lookup support
create index if not exists profiles_household_idx on hearth.profiles (household_id);
create index if not exists household_tokens_household_idx on hearth.household_tokens (household_id);
create index if not exists todos_household_idx on hearth.todos (household_id);
create index if not exists freezer_items_household_idx on hearth.freezer_items (household_id);

-- ─────────────────────────────────────────────────────────────────────────────
-- row level security
-- ─────────────────────────────────────────────────────────────────────────────

alter table hearth.households enable row level security;
alter table hearth.household_tokens enable row level security;
alter table hearth.profiles enable row level security;
alter table hearth.todos enable row level security;
alter table hearth.freezer_items enable row level security;
alter table hearth.device_subscriptions enable row level security;

-- households: anon may read its own row only. Creation, password hashing and
-- wipe are server-side flows (Edge Functions, service role) — no anon INSERT/UPDATE/DELETE.
drop policy if exists households_select_own on hearth.households;
create policy households_select_own on hearth.households
  for select to anon
  using (id = hearth.current_household_id());

-- household_tokens: RLS enabled with ZERO policies = deny all for anon.
-- The SECURITY DEFINER helper reads it on the app's behalf.

-- profiles: full CRUD, strictly own-household.
drop policy if exists profiles_select_own on hearth.profiles;
create policy profiles_select_own on hearth.profiles
  for select to anon
  using (household_id = hearth.current_household_id());

drop policy if exists profiles_insert_own on hearth.profiles;
create policy profiles_insert_own on hearth.profiles
  for insert to anon
  with check (household_id = hearth.current_household_id());

drop policy if exists profiles_update_own on hearth.profiles;
create policy profiles_update_own on hearth.profiles
  for update to anon
  using (household_id = hearth.current_household_id())
  with check (household_id = hearth.current_household_id());

drop policy if exists profiles_delete_own on hearth.profiles;
create policy profiles_delete_own on hearth.profiles
  for delete to anon
  using (household_id = hearth.current_household_id());

-- todos: full CRUD, strictly own-household.
drop policy if exists todos_select_own on hearth.todos;
create policy todos_select_own on hearth.todos
  for select to anon
  using (household_id = hearth.current_household_id());

drop policy if exists todos_insert_own on hearth.todos;
create policy todos_insert_own on hearth.todos
  for insert to anon
  with check (household_id = hearth.current_household_id());

drop policy if exists todos_update_own on hearth.todos;
create policy todos_update_own on hearth.todos
  for update to anon
  using (household_id = hearth.current_household_id())
  with check (household_id = hearth.current_household_id());

drop policy if exists todos_delete_own on hearth.todos;
create policy todos_delete_own on hearth.todos
  for delete to anon
  using (household_id = hearth.current_household_id());

-- freezer_items: full CRUD, strictly own-household.
drop policy if exists freezer_items_select_own on hearth.freezer_items;
create policy freezer_items_select_own on hearth.freezer_items
  for select to anon
  using (household_id = hearth.current_household_id());

drop policy if exists freezer_items_insert_own on hearth.freezer_items;
create policy freezer_items_insert_own on hearth.freezer_items
  for insert to anon
  with check (household_id = hearth.current_household_id());

drop policy if exists freezer_items_update_own on hearth.freezer_items;
create policy freezer_items_update_own on hearth.freezer_items
  for update to anon
  using (household_id = hearth.current_household_id())
  with check (household_id = hearth.current_household_id());

drop policy if exists freezer_items_delete_own on hearth.freezer_items;
create policy freezer_items_delete_own on hearth.freezer_items
  for delete to anon
  using (household_id = hearth.current_household_id());

-- device_subscriptions: full CRUD, strictly own-household.
drop policy if exists device_subscriptions_select_own on hearth.device_subscriptions;
create policy device_subscriptions_select_own on hearth.device_subscriptions
  for select to anon
  using (household_id = hearth.current_household_id());

drop policy if exists device_subscriptions_insert_own on hearth.device_subscriptions;
create policy device_subscriptions_insert_own on hearth.device_subscriptions
  for insert to anon
  with check (household_id = hearth.current_household_id());

drop policy if exists device_subscriptions_update_own on hearth.device_subscriptions;
create policy device_subscriptions_update_own on hearth.device_subscriptions
  for update to anon
  using (household_id = hearth.current_household_id())
  with check (household_id = hearth.current_household_id());

drop policy if exists device_subscriptions_delete_own on hearth.device_subscriptions;
create policy device_subscriptions_delete_own on hearth.device_subscriptions
  for delete to anon
  using (household_id = hearth.current_household_id());

-- ─────────────────────────────────────────────────────────────────────────────
-- privileges (anon role only — this app never issues JWTs)
-- ─────────────────────────────────────────────────────────────────────────────

grant usage on schema hearth to anon;

grant select on hearth.households to anon;

grant select, insert, update, delete
  on hearth.profiles, hearth.todos, hearth.freezer_items, hearth.device_subscriptions
  to anon;

-- household_tokens deliberately gets NO grants: deny-all (helper functions only).

revoke all on function hearth.request_header(text) from public;
revoke all on function hearth.current_household_id() from public;
revoke all on function hearth.tags_valid(text[]) from public;
revoke all on function hearth.enforce_profile_limit() from public;
revoke all on function hearth.enforce_profile_household() from public;

grant execute on function hearth.request_header(text) to anon;
grant execute on function hearth.current_household_id() to anon;
grant execute on function hearth.tags_valid(text[]) to anon;           -- used by CHECK constraints as anon
grant execute on function hearth.enforce_profile_limit() to anon;      -- trigger fires as anon
grant execute on function hearth.enforce_profile_household() to anon;  -- trigger fires as anon

commit;
