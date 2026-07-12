# Programmer Task Tracker — Requirements Doc

## 1. Overview

A web app for individual developers to track work-related tasks through a lifecycle: `PLANNING → IN_PROGRESS → COMPLETED`, with `DROPPED` as a terminal exit state from any point. Tasks are organized by project and tagged for filtering. Each task carries a priority (P0–P4).

## 2. Core Entities

### 2.1 Task

| Field        | Type                | Notes                                                                 |
| ------------ | ------------------- | --------------------------------------------------------------------- |
| id           | UUID/PK             |                                                                       |
| title        | string, required    | short summary                                                         |
| description  | text, optional      | markdown supported                                                    |
| status       | enum                | `PLANNING`, `IN_PROGRESS`, `COMPLETED`, `DROPPED`                     |
| priority     | enum + weight       | `P0`(critical)→`P4`(trivial); numeric weight below drives custom sort |
| project_id   | FK → Project        | nullable if unassigned                                                |
| tags         | M2M → Tag           |                                                                       |
| created_at   | timestamp           |                                                                       |
| updated_at   | timestamp           | auto                                                                  |
| started_at   | timestamp, nullable | set when status → IN_PROGRESS                                         |
| completed_at | timestamp, nullable | set when status → COMPLETED or DROPPED                                |
| due_date     | date, optional      |                                                                       |
| owner_id     | FK → User           |                                                                       |
| is_trashed   | bool, default false | soft-delete flag; trashed tasks excluded from all normal views        |
| trashed_at   | timestamp, nullable | set when moved to trash                                               |

### 2.2 Project

A user can create multiple projects; each project has its own independent task list (no sub-projects — flat structure by design). Projects are not manually reorderable — always displayed alphabetically by name.

| Field       | Type                | Notes           |
| ----------- | ------------------- | --------------- |
| id          | UUID/PK             |                 |
| name        | string, required    |                 |
| description | text, optional      |                 |
| color       | string, optional    | for UI grouping |
| owner_id    | FK → User           |                 |
| archived    | bool, default false |                 |

### 2.3 Tag

| Field    | Type                    | Notes |
| -------- | ----------------------- | ----- |
| id       | UUID/PK                 |       |
| name     | string, unique per user |       |
| owner_id | FK → User               |       |

### 2.4 User

Standard auth entity (email/password or OAuth). Single-tenant per user — no team/sharing in v1 unless flagged as future work.

## 3. Status Lifecycle

```
PLANNING ──► IN_PROGRESS ──► COMPLETED
    │              │
    └──────────────┴──────────► DROPPED
```

Rules:

- Any status can transition to `DROPPED` (task abandoned).
- `COMPLETED` and `DROPPED` are terminal — reopening requires an explicit "reopen" action that moves the task back to `PLANNING` and clears `completed_at`.
- Status changes are timestamped for basic velocity/reporting later (e.g., time-in-status).

## 4. Functional Requirements

### 4.1 Task Management

- Create, edit, delete tasks.
- Change status via drag-drop (kanban view) or dropdown.
- Set/change priority and project inline.
- Assign multiple tags; create tags on the fly.
- Set/clear due date.
- **Deletion**: soft delete only. Deleted tasks move to a dedicated Trash page — no auto-purge, no permanent delete. Restore is the only action available on a trashed task (moves it back to its original project/status).
- **Bulk actions**: multi-select via `x` key supports bulk status change, bulk trash, and bulk tag add/remove.

### 4.2 Views

- **Kanban board**: columns = 4 statuses, cards show title, priority badge, tags, due date.
- **List view**: sortable/filterable table (by project, tag, priority, due date, status).
- **Project view**: tasks scoped to one project, with progress summary (e.g., "6/10 completed").
- **Unified activity view**: single page aggregating tasks across all projects — the default landing view. Shows recent status changes, upcoming due dates, and in-progress work regardless of which project a task belongs to. Filterable by the same facets (status, priority, tag) as other views. Paginated (page 1, 2, 3...) — no infinite scroll, no saved/pinned filters in v1 (ad-hoc filtering only).
- **Trash page**: dedicated view listing soft-deleted tasks, kept fully separate from the unified activity view. Only action available: restore (→ back to original project/status). No auto-purge, no permanent delete — tasks stay in trash indefinitely until restored.

### 4.3 Filtering & Search

- Filter by: status, priority, project, tag, due date range.
- Full-text search on title/description.
- Combine filters (e.g., `project=X AND priority IN (P0,P1) AND status=IN_PROGRESS`).

### 4.4 Priority Handling

- P0–P4 scale, P0 = highest urgency.
- Default new task priority: P2 (configurable).
- Each priority level maps to a stored numeric weight (not just enum ordinal), so sort logic isn't hardcoded to the enum:

| Priority | Weight |
| -------- | ------ |
| P0       | 100    |
| P1       | 75     |
| P2       | 50     |
| P3       | 25     |
| P4       | 10     |

- Custom sort = `ORDER BY priority_weight DESC, due_date ASC NULLS LAST` (or any composite you want — weight being a stored int, not derived from enum index, means you can rebalance without a migration, e.g. inserting a P1.5-equivalent weight later without touching the enum).
- Sort option: priority-first ordering within any view, using `priority_weight`.

### 4.5 Projects & Tags

- CRUD for both.
- Archive (not delete) projects to preserve historical tasks.
- Tag autocomplete on task creation.

### 4.6 Quick Add (Shorthand Parsing)

Single input field parses a raw string into a structured task on submit.

**Syntax:**

```
<title text> [#project] [@tag ...] [P0-P4] [due:+N]
```

**Rules:**

- Everything not matching a token below is joined (in order) to form `title`.
- `#project` — matches an existing project by name (case-insensitive); if no match, prompt to create it. Only one `#project` token allowed; extras are ignored/warned.
- `@tag` — repeatable; unmatched tags are auto-created.
- `P0`–`P4` — sets priority; last one wins if repeated; defaults to P2 if absent.
- `due:+N` — `N` = number of days from today (integer, e.g. `due:+0` = today, `due:+3` = 3 days out). No natural-language dates (`today`/`tomorrow`/weekday names) — keep parsing deterministic and trivial. Invalid/non-numeric values are dropped with a UI warning (task still saves).
- Tokens can appear anywhere in the string, in any order.

**Example:**

```
Input:  Fix login race condition #auth-service @bug @urgent P0 due:+1
Parsed: title="Fix login race condition"
        project="auth-service"
        tags=["bug", "urgent"]
        priority="P0"
        due_date=<today + 1 day>
```

**Implementation note:** simple regex/token-scan is sufficient — no NLP needed. Order of extraction: `due:+N` → priority (`P[0-4]` as standalone word) → `#project` → `@tags` → remainder = title.

## 5. Keyboard Bindings

Target users are programmers — the app should be fully operable without a mouse.

| Key                   | Action                                                                                  |
| --------------------- | --------------------------------------------------------------------------------------- |
| `c`                   | Create new task (opens quick-add input, focused)                                        |
| `/`                   | Focus search bar                                                                        |
| `j` / `k`             | Move selection down / up (list or board, vim-style)                                     |
| `h` / `l`             | Move focus left / right across board columns                                            |
| `Enter`               | Open selected task detail                                                               |
| `e`                   | Edit selected task                                                                      |
| `1` – `4`             | Set selected task's status directly (1=PLANNING, 2=IN_PROGRESS, 3=COMPLETED, 4=DROPPED) |
| `Shift+0` – `Shift+4` | Set selected task's priority (P0–P4)                                                    |
| `x`                   | Toggle select (for multi-select/bulk actions)                                           |
| `d`                   | Move selected task to trash                                                             |
| `g` then `p`          | Go to a project (opens project switcher)                                                |
| `g` then `a`          | Go to unified activity view (all projects)                                              |
| `g` then `i`          | Go to inbox / unassigned tasks                                                          |
| `g` then `t`          | Go to trash page                                                                        |
| `?`                   | Show keybinding cheat sheet                                                             |
| `Esc`                 | Close modal / clear selection                                                           |

**Notes:**

- Bindings should be non-conflicting with browser defaults and standard within input fields (don't hijack `j`/`k` while a text field is focused).
- Cheat sheet (`?`) is a non-negotiable — programmers expect discoverability without leaving the keyboard.
- Bindings are fixed in v1 — no remapping/customization.

## 6. Non-Functional Requirements

- **Auth**: session-based (Django's built-in auth) — no strong preference given, defaulting to this since it's the simplest fit for a Django/DRF backend and a non-multi-client (browser-only) app. Switch to JWT later if a mobile/CLI client gets added.
- **Performance**: task list/board should load in <300ms for up to ~2k tasks per user.
- **Data integrity**: status transitions and timestamp updates must be atomic (DB transaction).
- **Persistence**: Postgres as source of truth; no client-only state.

## 7. Suggested Stack

Given typical Django/DRF/Postgres/Celery experience:

- **Backend**: Django + DRF for REST API, Postgres for storage.
- **Async**: Celery not required for v1 (no background jobs yet) — reserve for future (e.g., due-date reminder emails).
- **Frontend**: React (or HTMX if you want to stay server-rendered and skip a JS build step).
- **Auth**: Django's built-in auth + session-based DRF auth (`SessionAuthentication`).

## 8. API Sketch (REST)

```
GET    /api/tasks/                 ?status=&priority=&project=&tag=&search=&page=
POST   /api/tasks/
GET    /api/tasks/{id}/
PATCH  /api/tasks/{id}/            (status, priority, etc.)
DELETE /api/tasks/{id}/            (soft delete → trash)

POST   /api/tasks/bulk/            (bulk status/tag/trash ops, body: {task_ids: [...], action: ...})

GET    /api/trash/                 (list soft-deleted tasks)
POST   /api/trash/{id}/restore/

GET    /api/projects/
POST   /api/projects/
PATCH  /api/projects/{id}/archive/

GET    /api/tags/
POST   /api/tags/
```

## 9. Data Model Diagram

```
User 1───* Project 1───* Task *───* Tag
                          │
                       (status, priority enums)
```

## 10. Out of Scope (v1)

- Team collaboration / task assignment to others.
- Notifications/reminders.
- Time tracking (start/stop timers).
- Recurring tasks.
- Git integration (commit/branch linking).

## 11. Open Questions

None outstanding — all v1 decisions above are settled. Revisit this section if scope changes during implementation.
