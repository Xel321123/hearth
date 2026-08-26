# TASKS.md — Hearth execution roadmap

Legend: `[x]` done · `[ ]` pending. Every phase has an explicit **Definition of Done (DoD)**.
Architecture context: `PROJECT_PLAN.md` · Conventions: `AGENTS.md`.

---

## Phase 0 — Workspace scaffold ✅ (Step 1)

- [x] GitHub repo created + initialized (main branch)
- [x] Directory structure: `src/{lib,types,components,pages}`, `supabase/{migrations,functions}`, `scripts`, `public/icons`
- [x] `.gitignore`, `.env.example` (+ gitignored local `.env`), `package.json`
- [x] PWA skeleton: Vite + React + TS strict + Tailwind v4 + `vite-plugin-pwa` (manifest, Workbox config, generated 192/512 icons)
- [x] Docs: `README.md`, `PROJECT_PLAN.md`, `AGENTS.md`, `TASKS.md`
- [x] `npm install` + `npm run build` verified green
- [ ] Generate VAPID keypair (`npx web-push generate-vapid-keys`) — needed in Phase 4

**DoD (Phase 0):** repo public-URL reachable, build passes, docs committed. ✅

---

## Phase 1 — Data layer & anonymous household auth

**Supabase (schema `hearth`)**
- [x] Migration `0002_core_schema.sql`: `households`, `household_tokens`, `profiles`, `todos`, `freezer_items`, `device_subscriptions` + indexes (active-deadline partial, FIFO added_date, subscription profile, GIN tags) + triggers (5-profile cap advisory-locked, cross-household profile guard) + CHECKs (tags, completed⇔completed_at, display_code)
- [x] RLS on every table (ENABLE + FORCE) + token-gated policies (`hearth_private.current_household_id()` SECURITY DEFINER in unexposed schema, `(SELECT …)`-wrapped for per-query evaluation) + GRANTs (anon + authenticated; `household_tokens` deny-all) — **verified 19/19 against a Postgres engine** (`supabase/scripts/smoke_test_rls.sql`)
- [x] `DOCS_DB.md` — tables, relations, RLS enforcement, operations
- [x] `supabase/seed.sql` — dev/demo seed (2 households, known tokens, cap-max profiles, real PBKDF2 hashes)
- [x] Edge Function `household-create`: display code (alphabet `ABCDEFGHJKMNPQRSTVWXYZ23456789`), 16-char secure password, PBKDF2-HMAC-SHA256 (600k iter), default profile, access token — collision-retry on insert
- [x] Edge Function `household-join`: verify code+password (constant-time, no enumeration), issue token, per-IP rate limit (10/10min)
- [x] Migration `0004_search_vectors.sql`: generated tsvector columns (IMMUTABLE wrapper — array_to_string is STABLE) + GIN indexes
- [x] Dashboard: expose `hearth` schema (Project Settings → API → Exposed schemas) — **done on live instance**

**Client**
- [ ] `src/lib/supabase.ts` wired (done in scaffold)
- [ ] Session store (localStorage: household_id + access_token; send `x-household-token` header via Supabase client `global.headers`)
- [ ] Create / Join screens (no PII fields), error + "write this down" UX for code/password
- [ ] Persona picker: list profiles, set `active_profile_id` per household

**DoD (Phase 1):** create household on device A → join on device B → shared data visible on both;
SQL probe proves cross-household SELECT/UPDATE returns zero rows.
✅ **LIVE-VERIFIED 2026-08-26**: all 7 Edge Functions deployed to the shared instance; 13/13 smoke steps pass (create → join → CRUD → complete → full-text + #tag search → profile rename → freezer FIFO → push dispatch → validation → isolation). Run `npm run check:functions` before deploying.

---

## Phase 2 — Core modules (Todo + Freezer + Search)

- [x] Backend service layer (Step 3): `profiles` / `todos` / `freezer` / `search` Edge Functions — strict input validation mirroring the DB CHECKs; CRUD runs as caller + RLS; FIFO + deadline ordering; full-text (`search_vector` wfts) + `#tag` search; **40/40 tests green** (`npm test`)
- [ ] Todo CRUD + complete→archive + sort by nearest deadline + "My Tasks"/"Household" filter
- [ ] Freezer CRUD + FIFO sort + consume→archive + optional weight/quantity
- [ ] Global search: free-text + `#tag` across todos and freezer items
- [ ] Mobile-first UI shell: bottom nav (Tasks / Freezer / Search / Household), tabs, safe-area, pull-to-refresh
- [ ] Tag input with autocomplete from existing household tags
- [ ] Profile badge on assigned items; switching persona re-filters views

**DoD (Phase 2):** full happy-path flows pass on mobile emulation (Chrome device toolbar + Safari); no offline requirement yet.

---

## Phase 3 — PWA & offline

- [ ] Install UX: `beforeinstallprompt` handling, install instructions for iOS
- [ ] Workbox runtime caching strategy (network-first for data, cache-first for static)
- [ ] Offline reads: cache latest household snapshot (IndexedDB)
- [ ] Offline mutation queue: enqueue in IndexedDB, flush on `online`, last-write-wins per row
- [ ] Update flow: autoUpdate + "reload to update" toast

**DoD (Phase 3):** airplane-mode on device: existing data readable, adds/edits queue,
flush on reconnect; Lighthouse PWA audit ≥ 90.

---

## Phase 4 — Push notifications & launch

- [x] VAPID keys generated (public → `VITE_VAPID_PUBLIC_KEY`; private → Edge Function secret)
- [ ] `push_subscriptions` upsert on persona change / permission grant (`src/lib/push.ts`)
- [x] Edge Function `push-notify`: targeted delivery for (household_id, profile_id) via caller token + RLS + per-household rate limit (60/10min)
- [ ] Service worker: `push` → `showNotification`; `notificationclick` → open app (deep-link to todo)
- [ ] Notification settings per device (e.g. mute assignment notifications)
- [ ] Household delete/wipe + token revocation
- [ ] Deploy static build (HTTPS host) + verify SW registration + Lighthouse audit
- [ ] End-to-end proof: device A assigns task to Profile B → **only** Profile B's devices receive the notification
- [ ] README final: screenshots, live URL, demo household

**DoD (Phase 4):** targeted push verified on 2 real phones; offline + PWA audits green;
no PII in network logs (browser devtools + server logs).

---

## Cross-cutting (any phase)

- [ ] Keep `PROJECT_PLAN.md` §4/§10 in sync as the schema evolves
- [ ] Update `AGENTS.md` when a convention changes (RLS patterns, env vars, scripts)
- [ ] No PII anywhere — grep before commits: emails, phone numbers, analytics
