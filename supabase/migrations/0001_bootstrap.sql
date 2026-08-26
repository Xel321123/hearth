-- Hearth — migration 0001: schema bootstrap.
--
-- Shared-instance convention: NEVER use the public schema; every project
-- gets its own isolated schema (see AGENTS.md §Supabase conventions).
CREATE SCHEMA IF NOT EXISTS hearth;

-- One-time dashboard step (per instance): Project Settings → API →
-- Exposed schemas → add "hearth".

-- Phase 1 (TASKS.md) adds the following tables inside `hearth`, each with
-- RLS enabled, explicit policies gated on the household access token, and
-- minimal GRANTs:
--   households          (id, display_code, password_hash, created_at)
--   household_tokens    (token_hash, household_id, created_at)
--   profiles            (id, household_id, name, created_at)  — max 5/household
--   todos               (id, household_id, profile_id, title, due_date, tags, archived_at, ...)
--   freezer_items       (id, household_id, profile_id, name, added_date, quantity, unit, tags, consumed_at)
--   push_subscriptions  (id, household_id, profile_id, device_id, endpoint, keys, ...)
