# Todoify

Programmer-focused todo app. Full requirements/spec: **read `/docs/DESIGN.md` first, before implementing any feature.** It's the source of truth for data model, status lifecycle, keybindings, quick-add syntax, and out-of-scope items — don't re-derive requirements from scratch or guess at behavior it already specifies.

## Stack

Single full-stack TypeScript app — no separate frontend/backend split.

- **Framework**: TanStack Start (React, file-based routing via TanStack Router, SSR, server functions). RC — pinned version, not `latest`.
- **Runtime/deploy**: Cloudflare Workers. `wrangler deploy` ships the whole app (static assets + server) as one Worker.
- **DB**: Cloudflare D1 (SQLite) via Drizzle ORM.
- **Auth**: better-auth via `better-auth-cloudflare`, session-based.
- **UI**: shadcn/ui + Tailwind.
- **Forms/validation**: react-hook-form + Zod.
- **Server state**: TanStack Query on top of server functions where client caching/optimistic updates help (e.g. kanban drag-drop).

## Repo layout

```
app/
  routes/         # TanStack Router file-based routes (pages + server functions)
  components/     # shadcn components
  lib/
    db/           # Drizzle schema + per-request D1 client factory
    auth/         # better-auth-cloudflare setup
    schemas/      # Zod schemas — task, quick-add parser, priority weights (shared by server fns + forms)
  server/         # server functions (task CRUD, bulk ops, quick-add parsing)
docs/
  DESIGN.md       # full spec — read before implementing
wrangler.jsonc
```

No monorepo, no pnpm workspaces — it's one app, keep it flat.

## Critical constraints — do not violate

- **No REST API layer.** Data access goes through TanStack Start server functions called directly from loaders/components. Don't build parallel Hono/REST routes unless a non-browser client (CLI, mobile) actually shows up — don't build it speculatively.
- **No D1 transactions.** `db.transaction()` throws on D1. Use `db.batch([...])` for atomic multi-statement writes (bulk status change, bulk trash, bulk tag ops). Resolve all reads/validation *before* building the batch — batches can't branch mid-sequence.
- **better-auth + D1**: D1 bindings only exist inside the request handler. Never construct the better-auth instance at module scope — always build it per-request via `better-auth-cloudflare`'s factory pattern, or it'll work in dev and break in production.
- **Full-text search uses hand-written FTS5**, not a Drizzle-modeled table. Migrations must include `CREATE VIRTUAL TABLE ... USING FTS5(...)` + sync triggers (insert/update/delete) written directly in SQL.
- **Migrations run via `wrangler d1 migrations apply`**, not `drizzle-kit push`. Generate with `drizzle-kit generate`, then apply with wrangler — never hand-edit the D1 schema live.
- Soft-delete only, everywhere. Every task query must filter `is_trashed = false` unless explicitly querying the trash view. There is no permanent delete anywhere in this app.

## Code conventions

- Zod schemas in `app/lib/schemas` are the single source of truth for shape — used by server functions for validation and by react-hook-form on the client. Never duplicate a schema.
- Priority is stored as `enum + weight` (see DESIGN.md) — always sort/compare on `priority_weight`, never on the enum string.
- Status transitions and `started_at`/`completed_at`/`trashed_at` timestamp updates happen server-side only, never trusted from client input.
- Keybindings (DESIGN.md) are fixed, not user-remappable — don't build a settings/remapping UI for them.

## Commands

```bash
pnpm install
pnpm run dev                 # vite dev
pnpm run build               # vite build
pnpm run deploy              # build && wrangler deploy
pnpm run db:generate         # drizzle-kit generate
pnpm run db:migrate:local    # wrangler d1 migrations apply --local
pnpm run db:migrate:remote   # wrangler d1 migrations apply --remote
pnpm run cf-typegen          # regenerate Cloudflare binding types after wrangler.jsonc changes
```

(Adjust script names once `package.json` is actually set up — this is the intended shape.)

## When implementing a feature

1. Check `/docs/DESIGN.md` for the exact behavior spec first.
2. Update/add the Zod schema in `app/lib/schemas` if the data shape changes.
3. Write the Drizzle migration (if schema changes) → `drizzle-kit generate` → apply via wrangler.
4. Implement the server function in `app/server`, then wire it into the route loader/component via TanStack Query if client-side caching is useful.
5. If the feature involves multi-row writes, use `db.batch()` — not a loop of awaited single writes.
6. After any `wrangler.jsonc` binding change, run `npm run cf-typegen` before continuing.
