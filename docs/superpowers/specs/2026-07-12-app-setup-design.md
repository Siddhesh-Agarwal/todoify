# Todoify — App Setup Design

- Date: 2026-07-12
- Status: Draft (pending user review)
- Scope: Foundational scaffold — bootable skeleton + data model + auth.

## Authority & context

- `docs/DESIGN.md` is the source of truth for **data model, status lifecycle, keybindings, quick-add syntax, and out-of-scope items**.
- `AGENTS.md` is authoritative for the **stack** and supersedes DESIGN.md §7 (Suggested Stack) and §8 (REST API sketch). DESIGN.md's Django/DRF/Postgres/REST proposal is **not** used. The real stack: TanStack Start on Cloudflare Workers + D1 + Drizzle + better-auth, **no REST layer**.
- Today the repo is empty except `AGENTS.md` + `docs/DESIGN.md`; it is not a git repo.

## Goal

Stand up a secure, bootable foundation that future task features build directly on: the app boots, the schema exists and is migrated, a user can sign up/log in, and protected routes require a session. No task UI in this spec.

## Non-goals (deferred to later specs)

- Task CRUD and task server functions.
- Kanban / list / project / activity / trash views.
- Quick-add parser, keyboard bindings, bulk operations.
- FTS5 virtual table + sync triggers (deferred to the search feature spec).
- OAuth providers (email/password only for setup).
- Remote `wrangler deploy` execution (scripts present, not run).

## Approach

Incremental vertical foundation in dependency order (Approach A), verifying each layer before the next:

1. Tooling/config scaffold (package.json, vite, wrangler, tsconfig, tailwind/shadcn, dir structure).
2. D1 + Drizzle schema + initial migration applied locally.
3. better-auth per-request factory + login/signup + protected routes.
4. Verification gate (see below).

Rationale: failures isolate cleanly — a D1 wiring bug surfaces before auth is built on top of it.

## Stack & versions

- Package manager: **pnpm**.
- **TanStack Start** (RC), pinned to a specific version (not `latest`), with TanStack Router + Vite. Deploys as a single Cloudflare Worker (static assets + server). Server functions are the data-access boundary — no REST/Hono layer.
- **Drizzle ORM** (`drizzle-orm` with the D1 driver) + `drizzle-kit` for migration generation.
- D1 binding name: **`DB`** (in `wrangler.jsonc`).
- **better-auth** + **better-auth-cloudflare**, session-based, email/password.
- **shadcn/ui** + **Tailwind CSS** (Vite plugin).
- **react-hook-form** + **Zod** (Zod schemas live in `app/lib/schemas`).
- **TanStack Query**: QueryClient provider wired at root (caching/optimistic updates used by later task features).
- Cloudflare binding types regenerated via `cf-typegen` after any `wrangler.jsonc` change.

> Known implementation detail to pin during planning: the exact TanStack Start → Cloudflare Workers adapter package/config, verified against official TanStack Start docs at planning time. (Capability confirmed: Start lists Workers as a deploy target, and the RC checklist mandates pinning versions.)

## Repo / dir layout

Per AGENTS.md:

```
app/
  routes/         # TanStack Router file-based routes (pages + colocated server functions)
  components/     # shadcn/ui components
  lib/
    db/           # Drizzle schema + per-request D1 client factory
    auth/         # better-auth-cloudflare per-request setup
    schemas/      # Zod schemas (shared by server fns + forms)
  server/         # server functions (empty for now; structure ready)
docs/
  DESIGN.md
  superpowers/specs/   # this spec + future specs
wrangler.jsonc
drizzle.config.ts
tsconfig.json
vite.config.ts
tailwind config + css
.gitignore
package.json
```

## Data model & migrations

Drizzle schema in `app/lib/db/schema.ts`. Per DESIGN.md §2.

### App tables

- **`project`**: id (UUID PK), name (text, required), description (text, nullable), color (text, nullable), owner_id (FK → user.id), archived (boolean default false). Displayed alphabetically by name; no manual ordering.
- **`task`**: id (UUID PK), title (text, required), description (text, nullable, markdown), status (enum: `PLANNING`/`IN_PROGRESS`/`COMPLETED`/`DROPPED`), priority (enum: `P0`–`P4`), **`priority_weight`** (integer: P0=100, P1=75, P2=50, P3=25, P4=10), project_id (FK → project.id, nullable), created_at, updated_at (auto), started_at (nullable), completed_at (nullable), due_date (date, nullable), owner_id (FK → user.id), is_trashed (boolean default false), trashed_at (nullable). **Sort/compare on `priority_weight`, never on the enum.**
- **`tag`**: id (UUID PK), name (text), owner_id (FK → user.id). Unique per user: unique constraint on `(owner_id, name)`.
- **`task_tags`**: join table — task_id (FK → task.id), tag_id (FK → tag.id), composite PK `(task_id, tag_id)`. Encodes the Task↔Tag M2M.

### Auth tables (owned by better-auth)

- `user`, `session`, `account`, `verification` — provided by better-auth's schema/generator. Applied as D1 migrations (not hand-redefined in Drizzle), but referenced: app tables' `owner_id` FK → better-auth `user.id`.
- Exact generation path (better-auth CLI vs. Drizzle-modeled auth tables) is resolved during planning. Migrations applied via wrangler, never live schema edits.

### Migration discipline

- Generate with `drizzle-kit generate`; apply with `wrangler d1 migrations apply --local` (local) / `--remote` (remote).
- Never `drizzle-kit push`. Never hand-edit the live D1 schema.
- FTS5 virtual table + sync triggers **not** in this migration — deferred to the search feature spec.

## Auth

- better-auth instance constructed **per-request** via the `better-auth-cloudflare` factory (D1 binding only exists inside the request handler; never at module scope).
- Email/password only (no OAuth) for setup.
- Routes: `/login`, `/signup` (react-hook-form + Zod, shadcn/ui form components).
- Session cookie-based; route guard: `/` and future app routes require a session; unauthenticated → redirect `/login`.
- Session checks are authoritative server-side (TanStack Start middleware / `beforeLoad` on protected routes).

## Routes / UI (setup only)

- Root layout with TanStack Query provider + TanStack Router context.
- `/login`, `/signup` forms.
- Protected `/` placeholder showing the signed-in user's email + a logout button. No task UI.
- shadcn/ui base components installed: button, input, label, card (enough for auth forms). Tailwind themed.
- Server functions for setup: a `logout` server fn; sign-up/sign-in go through better-auth's handlers.

## Commands (package.json scripts, matching AGENTS.md)

| Script              | Purpose                                  |
| ------------------- | ---------------------------------------- |
| `dev`               | vite dev                                 |
| `build`             | vite build                               |
| `deploy`            | build && wrangler deploy                 |
| `db:generate`       | drizzle-kit generate                     |
| `db:migrate:local`  | wrangler d1 migrations apply --local     |
| `db:migrate:remote` | wrangler d1 migrations apply --remote    |
| `cf-typegen`         | regenerate Cloudflare binding types      |

## Critical constraints (from AGENTS.md, enforced here)

- **No REST API layer** — data via server functions only.
- **No `db.transaction()` on D1** — use `db.batch([...])` for multi-row writes. (Not exercised in setup; pattern established for later.)
- **better-auth built per-request**, never at module scope.
- **Soft-delete only** — every task query filters `is_trashed = false` unless explicitly in the trash view. (Schema default false; enforced in later task queries.)
- **Sort on `priority_weight`**, not the enum.

## Verification gate (definition of done)

1. `pnpm install` succeeds.
2. `pnpm run cf-typegen` generates Cloudflare binding types (no binding type errors).
3. `pnpm run db:generate` produces the initial migration SQL; `pnpm run db:migrate:local` applies it to local D1 cleanly.
4. `pnpm run dev` boots; root route renders; `/signup` → create user → `/login` → session → protected `/` shows signed-in user; logout works; protected route redirects when unauthenticated. All against local D1.
5. `pnpm run build` succeeds (production build, no type errors).
6. `wrangler.jsonc` declares the `DB` D1 binding; binding types present after `cf-typegen`.

Remote deploy is **not** run.

## Git

- `git init` + `.gitignore` (node_modules, `.wrangler`, `.output`, `.vinyl`, `.env`, `.dev.vars`, `dist`, etc.).
- **No commits unless explicitly requested** by the user (per repo convention). This spec file is saved but not committed.

## Risks / open items to resolve during planning

- Exact TanStack Start Cloudflare adapter package/config — pin from official docs.
- better-auth-cloudflare + D1 schema/migration generation pattern — confirm whether better-auth CLI emits D1-compatible SQL or whether Drizzle models the auth tables.
- Pin specific RC versions of `@tanstack/start`, `@tanstack/react-router`, `drizzle-orm`, `better-auth` at planning.
