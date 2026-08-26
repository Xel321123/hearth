-- Hearth — migration 0004: full-text search vectors.
--
-- Generated tsvector columns over (title|name + tags) so the /search
-- endpoint can use websearch_to_tsquery (GIN-indexed). The 'simple' text
-- search config keeps tokens as-is (no stemming) — right for short
-- household labels.
--
-- to_tsvector(), array_to_string(), concat() and array→text casts are STABLE,
-- which generated columns reject (42P17). The whole expression therefore
-- lives inside an IMMUTABLE wrapper (standard Postgres pattern) — Postgres
-- trusts the declared volatility.
begin;

create or replace function hearth_private.immutable_tsvector(title text, tags text[])
returns tsvector
language sql
immutable
parallel safe
as $$
  select to_tsvector('simple', title || ' ' || coalesce(array_to_string(tags, ' '), ''))
$$;

revoke all on function hearth_private.immutable_tsvector(text, text[]) from public;
grant execute on function hearth_private.immutable_tsvector(text, text[])
  to anon, authenticated, service_role; -- evaluated as the DML role

alter table hearth.todos
  add column if not exists search_vector tsvector
  generated always as (hearth_private.immutable_tsvector(title, tags)) stored;

create index if not exists todos_search_gin
  on hearth.todos using gin (search_vector);

alter table hearth.freezer_items
  add column if not exists search_vector tsvector
  generated always as (hearth_private.immutable_tsvector(name, tags)) stored;

create index if not exists freezer_items_search_gin
  on hearth.freezer_items using gin (search_vector);

commit;
