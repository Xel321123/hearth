# 🔥 Hearth

**Privacy-first PWA for shared households: one Todo list + one Freezer Inventory.**
No accounts. No emails. No phones. No cloud identities — just a Household ID and a password your household shares.

## Why Hearth exists

Shared households (flatmates, families, cabins) need a tiny bit of coordination:
*who takes out the bins?* and *is that beef still safe to eat?* Existing apps demand
accounts and emails and invitations. Hearth deliberately does not.

## Privacy pillars

1. **No PII, ever.** Creating a household generates a random Household ID + password. No email, phone, or name is collected for auth — the only "identity" is a per-household person profile (a name you choose).
2. **No password reset — by design.** No recovery email exists to leak or phish. Lose the password? Start a fresh household.
3. **Household = trust boundary.** Every row is scoped to a household and locked down with Postgres Row-Level Security. Cross-household access is impossible at the database level.
4. **Secrets stay server-side.** Client bundles ship only Supabase's publishable anon key. The service role key and VAPID private key live in Edge Function secrets.
5. **Offline-first.** The app shell is a cached, installable PWA; reads and mutations queue for when connectivity returns.

## Features

| Module | Highlights |
|---|---|
| **Households** | Anonymous create/join via display code + password; up to 5 person profiles; 1 default profile on creation |
| **Device persona** | Each device picks its active profile (localStorage); views default to that persona |
| **Todo** | Title, due date, assigned profile, `#tags`; "My Tasks" / "Household" filters; sorted by nearest deadline; archived on completion |
| **Freezer** | Name, date added (defaults today), optional weight/quantity, `#tags`; FIFO (oldest first); archived when consumed |
| **Search** | Global free-text + `#tag` search across both modules |
| **Push** | Web Push (VAPID); subscriptions mapped to (household, profile, device) so a task assigned to Profile B notifies **only** Profile B's devices |
| **PWA** | Installable, mobile-first, service worker caching + offline queue |

## Stack

| Layer | Choice |
|---|---|
| Frontend | Vite + React 19 + TypeScript (strict) |
| Styling | Tailwind CSS v4 |
| PWA | `vite-plugin-pwa` (Workbox) |
| Backend | Supabase — PostgreSQL (`hearth` schema) + RLS + Edge Functions (Deno) |
| Notifications | Web Push API (VAPID) |

## Quickstart

```bash
cp .env.example .env      # fill in the Supabase URL + anon key
npm install
npm run dev               # → http://localhost:5173
```

- `npm run build` / `npm run preview` — production build with service worker + manifest.
- `npm run typecheck` — strict TS check.
- Supabase setup (Phase 1): apply `supabase/migrations/`, then add the `hearth`
  schema under **Project Settings → API → Exposed schemas**.
- Push setup (Phase 4): `npx web-push generate-vapid-keys` — public key → `VITE_VAPID_PUBLIC_KEY`, private key → Edge Function secret.

> **Conventions matter here.** If you (or an AI agent) write code in this repo,
> read [`AGENTS.md`](AGENTS.md) first — it codifies the secret-handling and
> Supabase zero-trust rules that keep this app private.

## Repository docs

- [`DOCS_DB.md`](DOCS_DB.md) — database schema: tables, relations, RLS enforcement, indexes.
- [`AGENTS.md`](AGENTS.md) — working conventions for humans and AI agents (secrets, Supabase schema rules, code style, definition of done).
- [`PROJECT_PLAN.md`](PROJECT_PLAN.md) — full architectural breakdown: data model, auth flow, module design, security checklist.
- [`TASKS.md`](TASKS.md) — the 4-phase execution roadmap with acceptance criteria.

## Roadmap (4 phases)

| Phase | Scope | Status |
|---|---|---|
| 0 | Workspace scaffold (this repo, tooling, docs, PWA shell) | ✅ done |
| 1 | Data layer: `hearth` schema, RLS, anonymous household auth | ⏳ next |
| 2 | Core modules: Todo, Freezer, Search, persona UI | ⬜ |
| 3 | PWA & offline: caching, offline queue, install UX | ⬜ |
| 4 | Push notifications (targeted VAPID delivery) + launch | ⬜ |

## Status

**Step 1 complete** — repository, workspace, tooling, and planning docs landed.
See [`TASKS.md`](TASKS.md) for what's next.
