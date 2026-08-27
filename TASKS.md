# TASKS.md — Hearth execution roadmap

Legend: `[x]` done · `[ ]` pending. Every phase has an explicit **Definition of Done (DoD)**.
Architecture context: `PROJECT_PLAN.md` · Conventions: `AGENTS.md`.

---

## Phase 0 — Workspace scaffold ✅ (Step 1)

- [x] GitHub repo created + initialized (main branch)
- [x] Directory structure: `src/{lib,types,views,components,hooks}`, `supabase/{migrations,functions,tests}`, `scripts`, `public/icons`
- [x] `.gitignore`, `.env.example` (+ gitignored local `.env`), `package.json`
- [x] PWA skeleton: Vite + React + TS strict + Tailwind v4 + `vite-plugin-pwa` (manifest, Workbox config, generated 192/512 icons)
- [x] Docs: `README.md`, `PROJECT_PLAN.md`, `AGENTS.md`, `TASKS.md`
- [x] `npm install` + `npm run build` verified green
- [x] Generate VAPID keypair (`npx web-push generate-vapid-keys`) — public → `VITE_VAPID_PUBLIC_KEY`, private → Edge Function secret

**DoD (Phase 0):** repo public-URL reachable, build passes, docs committed. ✅

---

## Phase 1 — Data layer & anonymous household auth ✅ (Steps 2–3)

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
- [x] `src/lib/api.ts` — unified client (Edge Functions + PostgREST, `x-household-token`, `hearth` schema pinned via `Accept/Content-Profile`) replacing the scaffold's supabase-js stub
- [x] Session store (`src/lib/session.ts`: household_id + access_token + device_id in localStorage)
- [x] Create / Join screens (no PII fields), one-time code/password reveal with copy buttons + "no recovery" warning
- [x] Persona picker (`src/lib/persona.ts` + `ProfileSwitcher`): list profiles, set active profile per household (localStorage)

**DoD (Phase 1):** create household on device A → join on device B → shared data visible on both;
SQL probe proves cross-household SELECT/UPDATE returns zero rows.
✅ **LIVE-VERIFIED 2026-08-26**: all 7 Edge Functions deployed to the shared instance; 13/13 smoke steps pass (create → join → CRUD → complete → full-text + #tag search → profile rename → freezer FIFO → push dispatch → validation → isolation). Run `npm run check:functions` before deploying.

---

## Phase 2 — Core modules (Todo + Freezer + Search) ✅ (Step 4)

- [x] Backend service layer (Step 3): `profiles` / `todos` / `freezer` / `search` Edge Functions — strict input validation mirroring the DB CHECKs; CRUD runs as caller + RLS; FIFO + deadline ordering; full-text (`search_vector` websearch) + `#tag` search; **40/40 backend tests green**
- [x] Todo CRUD + complete→archive (optimistic) + sort by nearest deadline (server + client) + "My Tasks"/"Household" toggle (server-side `filter=mine|household`)
- [x] Freezer CRUD + FIFO sort + consume→archive + optional weight/quantity
- [x] Global search: debounced live free-text + `#tag` across todos and freezer items (`SearchView`)
- [x] Mobile-first UI shell: bottom nav (Tasks / Freezer / Search / History), bottom-sheet modals, safe-area padding, FABs, empty/error/loading states, toasts
- [x] Tag input with autocomplete from existing household tags (`TagInput` + datalist)
- [x] Profile badge on assigned items; switching persona re-filters views (My Tasks uses active profile; assignment defaults to it)

**DoD (Phase 2):** full happy-path flows pass on mobile emulation (Chrome device toolbar + Safari); no offline requirement yet.
✅ **LIVE-VERIFIED 2026-08-26**: 19/19 client unit tests (`npm run test:client`), 18/18 live client e2e against the deployed backend (`npm run e2e:client`), 18/18 Playwright browser e2e incl. persona switch + filtering (`npm run e2e:ui`).

---

## Phase 3 — PWA & offline ✅ (Step 4)

- [x] Install UX: iOS Safari install banner (Share → Add to Home Screen, dismissible); default browser install prompt retained
- [x] Custom service worker (`src/sw.ts`, injectManifest): precache app shell (9 entries), network-first API reads with cache fallback, network-first SPA navigation with shell fallback, `clientsClaim` + autoUpdate
- [x] Offline reads: SW cache serves the last-loaded household data (Cache Storage; network-timeout 4s)
- [x] Offline mutation queue: localStorage outbox (`src/lib/offline.ts`), flush on `online` + reconnect (drop 4xx, keep network/5xx), pending-count-aware reload
- [x] Update flow: `registerSW({ immediate: true })` autoUpdate + SKIP_WAITING handler

**DoD (Phase 3):** airplane-mode on device: existing data readable, adds/edits queue,
flush on reconnect; Lighthouse PWA audit ≥ 90.
✅ **AUDITED 2026-08-27**: headless-Chromium e2e at the `/hearth/` subpath (18/18) +
**Lighthouse 11 PWA category on the live site: 100/100** (installable-manifest,
maskable-icon, splash-screen, themed-omnibox, content-width, viewport).

---

## Phase 4 — Push notifications & launch

- [x] VAPID keys generated (public → `VITE_VAPID_PUBLIC_KEY`; private → Edge Function secret)
- [x] Device subscription upsert on permission grant + persona change (`usePush` → `api.registerDevice`: deletes this device's old rows, upserts for the active profile — move, not duplicate)
- [x] Edge Function `push-notify`: targeted delivery for (household_id, profile_id) via caller token + RLS + per-household rate limit (60/10min)
- [x] Service worker: `push` → `showNotification` (icon/badge/data), `notificationclick` → focus/open app
- [ ] Notification settings per device (e.g. mute assignment notifications)
- [ ] Household delete/wipe + token revocation (backend: households are select-only by design today)
- [x] Deploy static build to HTTPS: **GitHub Pages live at https://xel321123.github.io/hearth/** — repo made public, Pages enabled (workflow source), `base: /hearth/`, relative manifest scope, SW scope-aware paths, `404.html` SPA fallback, env injected from repo secrets; SW registration + manifest + icons verified in-browser at the subpath (18/18 e2e:ui)
- [x] End-to-end proof of targeting: **live-verified** — register a device for Profile B → `push-notify` to B reports `recipients=1`, to another profile `recipients=0` (client e2e, 18/18)
- [ ] README final: screenshots, live URL, demo household

**DoD (Phase 4):** targeted push verified on 2 real phones; offline + PWA audits green;
no PII in network logs (browser devtools + server logs).

---

## Cross-cutting (any phase)

- [ ] Keep `PROJECT_PLAN.md` §4/§10 in sync as the schema evolves
- [ ] Update `AGENTS.md` when a convention changes (RLS patterns, env vars, scripts)
- [ ] No PII anywhere — grep before commits: emails, phone numbers, analytics

## Verification commands (Step 4)

```bash
npm run typecheck        # tsc strict over src + sw.ts
npm run build            # tsc + vite build (injectManifest SW + manifest)
npm test                 # 59/59 — backend (40) + client (19) unit tests
npm run test:client      # client-only unit tests
npm run e2e:client       # live e2e: real src/lib code vs deployed backend (needs .env)
npm run e2e:ui           # Playwright browser e2e + PWA audit (needs npm run build first)
```
