-- Hearth — migration 0003: service_role grants for server-side flows.
--
-- anon/authenticated grants landed in 0002. Edge Functions (household-create,
-- household-join, push-notify) run as `service_role`, which receives NO
-- automatic privileges on custom schemas (only `public` gets default grants).
-- service_role bypasses RLS (BYPASSRLS) by design — these grants are the
-- server-side data path, never used by client bundles.
--
-- Least privilege: same verbs as anon on data tables; household_tokens gets
-- SELECT (join verification), INSERT (token issuance) and DELETE (revocation)
-- but NO update — tokens are immutable.
--
-- Idempotent: GRANTs are naturally re-runnable.

begin;

grant usage on schema hearth to service_role;
grant usage on schema hearth_private to service_role;

grant select, insert, update, delete
  on hearth.households, hearth.profiles, hearth.todos,
     hearth.freezer_items, hearth.device_subscriptions
  to service_role;

grant select, insert, delete
  on hearth.household_tokens
  to service_role;

grant execute on function hearth_private.request_header(text) to service_role;
grant execute on function hearth_private.current_household_id() to service_role;
grant execute on function hearth_private.tags_valid(text[]) to service_role;
grant execute on function hearth_private.enforce_profile_limit() to service_role;
grant execute on function hearth_private.enforce_profile_household() to service_role;

commit;
