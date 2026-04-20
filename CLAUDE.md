# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project Overview

Turn2SQL — a Go web application that converts Excel/CSV files into SQL DDL/DML across multiple dialects. The UI is a Windows 95-themed client-side SPA that parses files in-browser with SheetJS. Templates (field schema + row data + table name + dialect + mode) are stored locally and optionally synced across devices via an anonymous **sync code** or a **registered account**.

The server's only job is serving the static shell and persisting synced templates. All Excel/CSV parsing and SQL generation happens in the browser.

Stack: Gin (HTTP), SQLite via `modernc.org/sqlite` (pure Go, no CGO), `html/template`, SheetJS (client-side parsing, served locally), bcrypt (`golang.org/x/crypto/bcrypt`).

## Build & Run Commands

```bash
go mod download
go run main.go              # serves :8080, creates ./data.db on first run
go build -o excel-uploader
```

## Architecture

### Request flow

Gin router (`main.go`) → global `CurrentUser` middleware (attaches user if session cookie valid) → handlers. Most sync routes are gated by `RequireWorkspace` (resolves either the logged-in user's workspace or one matched by the `X-Sync-Code` header).

### Go packages

- **`main.go`** — DB init, route registration. Static at `/static`, page at `/`, auth (`/api/auth/{register,login,logout,me}`), workspace (`/api/workspace`, `/api/workspace/anon`, `/api/workspace/claim`), template sync (`GET|PUT|DELETE /api/templates[/:id]`). Runs on `:8000`.
- **`handlers/`**
  - `index.go` — renders the shell page via `templates.RenderIndex`.
  - `auth.go` — register/login/logout/me. Issues `t2s_session` HttpOnly cookie with a 32-byte hex token.
  - `sync.go` — workspace + template CRUD. `PutTemplate` performs optimistic-lock check against stored `updated_at` (rejects with 409 on `ErrStaleUpdate`).
- **`middleware/auth.go`** — `CurrentUser` (always-run, best-effort user attach), `RequireWorkspace` (user's own workspace or `X-Sync-Code`), `RequireUser` (403 if anonymous).
- **`models/`**
  - `db.go` — opens SQLite with `foreign_keys=1` and `journal_mode=WAL`, runs schema migrations on startup. Global `models.DB`.
  - `user.go` — bcrypt (DefaultCost). `ErrEmailTaken`, `ErrInvalidCred`, `ErrWeakPassword` (min 8 chars), `ErrInvalidEmail`.
  - `session.go` — 30-day sessions in the `sessions` table.
  - `workspace.go` — `CreateAnonymousWorkspace` / `GetOrCreateUserWorkspace` / `GetWorkspaceBySyncCode` / `ClaimWorkspace` (transactional: merges the claimer's existing workspace templates into the target then deletes the old). `UpsertTemplate` rejects stale writes. Sync codes are 10-char lowercase base32 (~50 bits entropy).
- **`templates/`** — `layout.html` is the Win95 shell (title-bar with 👤 Account button, nav-pane, sheet-pane `#sheet-root`, modal host, tweaks panel, inline boot script). `index.html` is a minimal loading placeholder rendered inside `#sheet-root` until client `boot()` overwrites it. `render.go` exports only `RenderIndex`.

### Database schema (SQLite at `./data.db`)

```
users       (id, email UNIQUE, password_hash, created_at)
sessions    (id PK, user_id FK, expires_at)
workspaces  (id, owner_user_id FK NULLABLE, sync_code UNIQUE)
            -- unique index on owner_user_id WHERE NOT NULL → 1 workspace per user
templates   (id PK client-generated, workspace_id FK, name, data_json, updated_at)
```

### Frontend (`static/`)

- **CSS**: `win95.css` — Windows 95 aesthetic + theme variables. Fonts served locally from `static/fonts/`.
- **JS** (loaded in order as classic scripts, no ES modules, no build step):
  1. `xlsx.full.min.js` — SheetJS (local copy)
  2. `sql.js` — multi-dialect SQL generation (MySQL/Postgres/MSSQL/SQLite/ANSI)
  3. `app.js` — global `App` state object, localStorage persistence (`turn2sql.templates.v1`, `turn2sql.ui.v1`), nav + sheet rendering, cell/col/row selection & editing
  4. `sync.js` — `Sync` module: `init()` (pull on boot if session or code exists), `markDirty(id)` / `markDeleted(id)` (debounced 600ms batch flush), `register/login/logout/claimSyncCode/createSyncCode/useSyncCode`. Hooks into `online`/`offline` events to retry on reconnect.
  5. `dialogs.js` — upload / field-edit / confirm / SQL-preview / **account** dialogs. Account dialog has three tabs: Sync Code / Login / Register.

### Sync integration points in `app.js`

Only three mutation sites call `Sync.markDirty` / `Sync.markDeleted`:
- `updateActive()` → `Sync.markDirty(t.id)` after local save (covers all field/cell edits)
- `createTemplateFromData()` → `Sync.markDirty(t.id)` on upload
- `deleteTemplate()` → `Sync.markDeleted(id)` inside the confirm callback

All three also bump `t.updatedAt` to an ISO string so the server's optimistic-lock check works.

## Key Conventions

- Chinese comments/strings are intentional
- Go module is `turn2sql` (imports: `turn2sql/handlers`, `turn2sql/middleware`, `turn2sql/models`, `turn2sql/templates`)
- Frontend is vanilla JS (no build step). Add new scripts to `layout.html` in the existing order (sql → app → sync → dialogs)
- Server endpoints return JSON, not HTML fragments — frontend is state-driven
- Sync code workspaces have `owner_user_id = NULL`. Logging in always uses the user's own workspace (ignores any local sync code). Claim merges an anonymous workspace's templates into the user's workspace
- Offline-first: all mutations write to localStorage first, then queue for background push. Failed pushes (except 409 conflicts) are retried on reconnect
