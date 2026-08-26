-- Hearth — RLS & integrity smoke test (psql).
--
-- Proves: household isolation via x-household-token, per-verb policies,
-- profile cap trigger, cross-household reference trigger, CHECK constraints,
-- and that household_tokens is deny-all for anon.
--
-- Setup (Supabase SQL editor or local Postgres):
--   1. apply migrations 0001 + 0002
--   2. run supabase/seed.sql (creates alpha + beta demo households)
--   3. locally only: CREATE ROLE anon NOLOGIN; CREATE ROLE authenticated NOLOGIN;
--      (Supabase has both built in)
--
-- Run: psql "$DATABASE_URL" -f supabase/scripts/smoke_test_rls.sql
--
-- Expected outcomes are printed next to each step. Errors shown for the
-- negative tests are the PASS signal.

\set ON_ERROR_STOP 0

\echo '── 1. anon + alpha token: sees alpha household row only (expect 1: HEARTH)'
SET "request.headers" = '{"x-household-token":"dev-token-alpha"}';
SET ROLE anon;
SELECT id, display_code FROM hearth.households;

\echo '── 2. alpha token: sees exactly alpha''s 5 profiles (expect 5)'
SELECT count(*) AS profiles_visible FROM hearth.profiles;

\echo '── 3. alpha token: sees alpha''s 4 todos, no beta rows (expect 4)'
SELECT count(*) AS todos_visible FROM hearth.todos;

\echo '── 4. beta token: sees only beta data (expect 2 profiles, 1 todo)'
SET "request.headers" = '{"x-household-token":"dev-token-beta"}';
SELECT count(*) AS profiles_visible FROM hearth.profiles;
SELECT count(*) AS todos_visible FROM hearth.todos;

\echo '── 5. alpha tries to INSERT into beta''s household (expect ERROR: RLS)'
SET "request.headers" = '{"x-household-token":"dev-token-alpha"}';
INSERT INTO hearth.todos (household_id, profile_id, title)
VALUES ('00000000-0000-0000-0000-000000000002',
        '00000000-0000-0000-0000-000000000111', 'sneaky task');

\echo '── 6. alpha tries to UPDATE beta''s todos (expect UPDATE 0)'
UPDATE hearth.todos SET title = 'hacked'
WHERE household_id = '00000000-0000-0000-0000-000000000002';

\echo '── 7. alpha tries to DELETE beta''s freezer items (expect DELETE 0)'
DELETE FROM hearth.freezer_items
WHERE household_id = '00000000-0000-0000-0000-000000000002';

\echo '── 8. 6th profile in alpha household (expect ERROR: profile limit)'
INSERT INTO hearth.profiles (household_id, name)
VALUES ('00000000-0000-0000-0000-000000000001', 'Sixth Person');

\echo '── 9. todo referencing a profile of another household (expect ERROR: trigger)'
INSERT INTO hearth.todos (household_id, profile_id, title)
VALUES ('00000000-0000-0000-0000-000000000001',
        '00000000-0000-0000-0000-000000000111', 'cross-household ref');

\echo '── 10. malformed tags rejected (expect ERROR: CHECK)'
INSERT INTO hearth.todos (household_id, profile_id, title, tags)
VALUES ('00000000-0000-0000-0000-000000000001',
        '00000000-0000-0000-0000-000000000101', 'bad tags', array['has space','ok']);

\echo '── 11. completed=true without completed_at (expect ERROR: CHECK)'
INSERT INTO hearth.todos (household_id, profile_id, title, completed)
VALUES ('00000000-0000-0000-0000-000000000001',
        '00000000-0000-0000-0000-000000000101', 'ghost done', true);

\echo '── 12. device subscription with another household''s profile (expect ERROR: trigger)'
INSERT INTO hearth.device_subscriptions
  (household_id, profile_id, device_id, endpoint, keys)
VALUES ('00000000-0000-0000-0000-000000000001',
        '00000000-0000-0000-0000-000000000111', 'device-x',
        'https://push.example.test/endpoint-x', '{"p256dh":"k","auth":"a"}'::jsonb);

\echo '── 13. household_tokens is deny-all for anon (expect ERROR: permission denied)'
SELECT count(*) FROM hearth.household_tokens;

\echo '── 14. anon can insert own-household todo (expect INSERT 0 1)'
INSERT INTO hearth.todos (household_id, profile_id, title, due_date, tags)
VALUES ('00000000-0000-0000-0000-000000000001',
        '00000000-0000-0000-0000-000000000102', 'RLS insert test',
        current_date + 2, array['test']);

\echo '── 15. active-deadline partial index used for open tasks (expect Index Scan on todos_active_deadline_idx)'
EXPLAIN (COSTS OFF)
SELECT * FROM hearth.todos
WHERE household_id = '00000000-0000-0000-0000-000000000001'
  AND NOT completed
ORDER BY due_date;

\echo '── 16. #tag search via GIN (expect 2 rows: bins + hallway light)'
SELECT title FROM hearth.todos WHERE tags @> array['chore'];

\echo '── 17. FIFO: freezer sorted oldest-first (expect chicken, peas, ice cream)'
SELECT name, added_date FROM hearth.freezer_items
WHERE household_id = '00000000-0000-0000-0000-000000000001'
  AND NOT consumed
ORDER BY added_date;

RESET ROLE;
\echo '── done (reset to superuser)'
