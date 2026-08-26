-- Hearth — migration 0001: schema bootstrap.
--
-- Shared-instance convention: NEVER use the public schema; every project
-- gets its own isolated schema (see AGENTS.md §Supabase conventions).
CREATE SCHEMA IF NOT EXISTS hearth;

-- One-time dashboard step (per instance): Project Settings → API →
-- Exposed schemas → add "hearth".

-- Phase 1 delivers the full schema in 0002_core_schema.sql (tables, triggers,
-- RLS, grants, indexes): households, household_tokens, profiles, todos,
-- freezer_items, device_subscriptions — see DOCS_DB.md.
