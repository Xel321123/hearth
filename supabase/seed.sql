-- Hearth — DEV SEED (idempotent; ON CONFLICT DO NOTHING).
--
-- Creates two demo households so RLS isolation can be exercised:
--   alpha: display code HEARTH, token  dev-token-alpha  (5 profiles, at the cap)
--   beta : display code BETAMN, token  dev-token-beta   (2 profiles)
--
-- IMPORTANT: this is a DEV/DEMO seed. Password hashes are real PBKDF2 outputs
-- for the KNOWN dev passwords 'dev-password-alpha'/'dev-password-beta'
-- (tokens are sha256 of the known dev tokens), so RLS and the join flow can be
-- exercised without the Edge Functions. Never ship this seed to production data.
--
-- Usage: psql "$DATABASE_URL" -f supabase/seed.sql
--        (or paste into the Supabase SQL editor; RLS is bypassed for the owner)

begin;

-- ── households ────────────────────────────────────────────────────────────────
-- password_hash values are REAL PBKDF2 outputs (pbkdf2$sha256$600000$...) —
-- generated with the production hasher (scripts/gen-seed-hash.mjs), so the
-- join flow verifies them exactly like a real household. Re-running upgrades
-- existing placeholder hashes (DO UPDATE).
insert into hearth.households (id, display_code, password_hash) values
  ('00000000-0000-0000-0000-000000000001', 'HEARTH',
   'pbkdf2$sha256$600000$EF6Yb7l0IUM+0903lHv/QQ==$vz38RsOaxj0fgH1ZkKQmd0xoz2c8XZXKDIVLDja525g='),
  ('00000000-0000-0000-0000-000000000002', 'BETAMN',
   'pbkdf2$sha256$600000$vl3DE9OwMwEHu/GIK0Y7Tw==$u8Fene2UX/JuYYLeOLg5A4f7srMz+S8haBWxqluVBxc=')
on conflict (id) do update set password_hash = excluded.password_hash;

-- ── access tokens (hashed) ────────────────────────────────────────────────────
insert into hearth.household_tokens (token_hash, household_id) values
  (encode(sha256('dev-token-alpha'::bytea), 'hex'), '00000000-0000-0000-0000-000000000001'),
  (encode(sha256('dev-token-beta'::bytea), 'hex'),  '00000000-0000-0000-0000-000000000002')
on conflict (token_hash) do nothing;

-- ── profiles (alpha: 5 = the cap; beta: 2) ────────────────────────────────────
-- WHERE NOT EXISTS instead of ON CONFLICT: the 5-profile BEFORE INSERT trigger
-- fires BEFORE conflict resolution, so re-running an ON CONFLICT insert would
-- raise 'profile limit reached' on a household already at the cap.
insert into hearth.profiles (id, household_id, name)
select v.id, v.household_id, v.name
from (values
  ('00000000-0000-0000-0000-000000000101'::uuid, '00000000-0000-0000-0000-000000000001'::uuid, 'Alex'),
  ('00000000-0000-0000-0000-000000000102'::uuid, '00000000-0000-0000-0000-000000000001'::uuid, 'Sam'),
  ('00000000-0000-0000-0000-000000000103'::uuid, '00000000-0000-0000-0000-000000000001'::uuid, 'Jamie'),
  ('00000000-0000-0000-0000-000000000104'::uuid, '00000000-0000-0000-0000-000000000001'::uuid, 'Riley'),
  ('00000000-0000-0000-0000-000000000105'::uuid, '00000000-0000-0000-0000-000000000001'::uuid, 'Casey'),
  ('00000000-0000-0000-0000-000000000111'::uuid, '00000000-0000-0000-0000-000000000002'::uuid, 'Beta One'),
  ('00000000-0000-0000-0000-000000000112'::uuid, '00000000-0000-0000-0000-000000000002'::uuid, 'Beta Two')
) as v(id, household_id, name)
where not exists (select 1 from hearth.profiles p where p.id = v.id);

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
