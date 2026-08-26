-- Hearth — DEV SEED (idempotent; ON CONFLICT DO NOTHING).
--
-- Creates two demo households so RLS isolation can be exercised:
--   alpha: display code HEARTH, token  dev-token-alpha  (5 profiles, at the cap)
--   beta : display code BETAMN, token  dev-token-beta   (2 profiles)
--
-- IMPORTANT: this is a DEV/DEMO seed. Password and token hashes below are
-- plain sha256 placeholders so RLS can be tested without the Edge Functions.
-- Production households are created by the `household-create` Edge Function,
-- which hashes a strong random password/token with a proper algorithm.
-- Never ship this seed to production data.
--
-- Usage: psql "$DATABASE_URL" -f supabase/seed.sql
--        (or paste into the Supabase SQL editor; RLS is bypassed for the owner)

begin;

-- ── households ────────────────────────────────────────────────────────────────
insert into hearth.households (id, display_code, password_hash) values
  ('00000000-0000-0000-0000-000000000001', 'HEARTH',
   encode(sha256('dev-password-alpha'::bytea), 'hex')),
  ('00000000-0000-0000-0000-000000000002', 'BETAMN',
   encode(sha256('dev-password-beta'::bytea), 'hex'))
on conflict (id) do nothing;

-- ── access tokens (hashed) ────────────────────────────────────────────────────
insert into hearth.household_tokens (token_hash, household_id) values
  (encode(sha256('dev-token-alpha'::bytea), 'hex'), '00000000-0000-0000-0000-000000000001'),
  (encode(sha256('dev-token-beta'::bytea), 'hex'),  '00000000-0000-0000-0000-000000000002')
on conflict (token_hash) do nothing;

-- ── profiles (alpha: 5 = the cap; beta: 2) ────────────────────────────────────
insert into hearth.profiles (id, household_id, name) values
  ('00000000-0000-0000-0000-000000000101', '00000000-0000-0000-0000-000000000001', 'Alex'),
  ('00000000-0000-0000-0000-000000000102', '00000000-0000-0000-0000-000000000001', 'Sam'),
  ('00000000-0000-0000-0000-000000000103', '00000000-0000-0000-0000-000000000001', 'Jamie'),
  ('00000000-0000-0000-0000-000000000104', '00000000-0000-0000-0000-000000000001', 'Riley'),
  ('00000000-0000-0000-0000-000000000105', '00000000-0000-0000-0000-000000000001', 'Casey'),
  ('00000000-0000-0000-0000-000000000111', '00000000-0000-0000-0000-000000000002', 'Beta One'),
  ('00000000-0000-0000-0000-000000000112', '00000000-0000-0000-0000-000000000002', 'Beta Two')
on conflict (id) do nothing;

-- ── todos (alpha: 3 active + 1 completed) ─────────────────────────────────────
insert into hearth.todos (id, household_id, profile_id, created_by, title, due_date, tags) values
  ('00000000-0000-0000-0000-000000000201', '00000000-0000-0000-0000-000000000001',
   '00000000-0000-0000-0000-000000000102', '00000000-0000-0000-0000-000000000101',
   'Take out the bins', current_date + 1, array['chore','recurring']),
  ('00000000-0000-0000-0000-000000000202', '00000000-0000-0000-0000-000000000001',
   '00000000-0000-0000-0000-000000000101', '00000000-0000-0000-0000-000000000102',
   'Pay electricity bill', current_date + 5, array['bills']),
  ('00000000-0000-0000-0000-000000000203', '00000000-0000-0000-0000-000000000001',
   '00000000-0000-0000-0000-000000000103', '00000000-0000-0000-0000-000000000101',
   'Restock dishwasher tablets', null, array['errands']),
  ('00000000-0000-0000-0000-000000000204', '00000000-0000-0000-0000-000000000001',
   '00000000-0000-0000-0000-000000000101', '00000000-0000-0000-0000-000000000101',
   'Fix hallway light', null, array['chore'])
on conflict (id) do nothing;

update hearth.todos
set completed = true, completed_at = now()
where id = '00000000-0000-0000-0000-000000000204';

-- beta: 1 todo
insert into hearth.todos (id, household_id, profile_id, title) values
  ('00000000-0000-0000-0000-000000000211', '00000000-0000-0000-0000-000000000002',
   '00000000-0000-0000-0000-000000000111', 'Beta task')
on conflict (id) do nothing;

-- ── freezer (alpha: 3 active FIFO + 1 consumed) ───────────────────────────────
insert into hearth.freezer_items (id, household_id, profile_id, name, added_date, quantity, tags) values
  ('00000000-0000-0000-0000-000000000301', '00000000-0000-0000-0000-000000000001',
   '00000000-0000-0000-0000-000000000101', 'Chicken thighs', '2026-07-20', '2 kg', array['meat']),
  ('00000000-0000-0000-0000-000000000302', '00000000-0000-0000-0000-000000000001',
   '00000000-0000-0000-0000-000000000102', 'Peas', '2026-08-01', '500 g', array['veg']),
  ('00000000-0000-0000-0000-000000000303', '00000000-0000-0000-0000-000000000001',
   null, 'Ice cream', '2026-08-10', '1 tub', array['treats']),
  ('00000000-0000-0000-0000-000000000304', '00000000-0000-0000-0000-000000000001',
   '00000000-0000-0000-0000-000000000103', 'Leftover stew', '2026-07-01', '1', array['leftovers'])
on conflict (id) do nothing;

update hearth.freezer_items
set consumed = true, consumed_at = now()
where id = '00000000-0000-0000-0000-000000000304';

-- ── device subscriptions (alpha: Sam's phone) ─────────────────────────────────
insert into hearth.device_subscriptions
  (id, household_id, profile_id, device_id, endpoint, keys, user_agent) values
  ('00000000-0000-0000-0000-000000000401', '00000000-0000-0000-0000-000000000001',
   '00000000-0000-0000-0000-000000000102', 'device-sam-phone-1',
   'https://push.example.test/endpoint-1',
   '{"p256dh":"BElfJz0bEXAMPLEp256dhKey","auth":"aXRoEXAMPLEauthKey"}'::jsonb,
   'HearthTest/1.0')
on conflict (id) do nothing;

commit;
