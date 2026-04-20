# Turn2SQL

A Go web application for uploading Excel/CSV files and converting them to SQL statements across multiple dialects. The frontend is a Windows 95-themed UI that parses spreadsheets client-side and generates SQL DDL/DML in-browser. Templates can be synced across devices via an anonymous **sync code** or a **registered account**.

## Features

- Upload Excel (`.xlsx`/`.xls`) or CSV files via drag-and-drop or file picker
- Client-side parsing with SheetJS — no round-trip needed for preview
- Pick header row, rename/retype columns, edit cells inline
- Generate SQL for MySQL, PostgreSQL, SQL Server, SQLite, ANSI SQL
- **Cross-device sync:**
  - Anonymous **Sync Code** (10-char lowercase token) — share between your own devices, no signup
  - **Account login** (email + password) — workspace auto-bound to account; works across any logged-in browser
  - **Claim flow** — convert an anonymous workspace into an account-owned one (templates merged in)
- Offline-first: all edits save locally first, queued for background sync, retry on reconnect
- Theming (Teal / Navy / Plum / Olive), font-smoothing toggle, sample-data loader

## Tech Stack

- **Backend**: Go + Gin
- **Database**: SQLite via `modernc.org/sqlite` (pure Go, no CGO — single-binary deploy)
- **Auth**: bcrypt password hashing, HttpOnly session cookie (30-day), server-side session table
- **Templates**: Go standard `html/template`
- **Excel/CSV (client)**: SheetJS (`xlsx.full.min.js`, served locally)
- **UI**: Vanilla JS, no build step. Classic scripts loaded in order
- **Styling**: Custom Windows 95 aesthetic (`win95.css`), fonts served locally

## Project Structure

```
turn/
├── main.go                    # DB init, routes, middleware registration
├── go.mod / go.sum
├── handlers/
│   ├── index.go               # Shell page renderer
│   ├── auth.go                # Register / login / logout / me
│   └── sync.go                # Workspace + template CRUD
├── middleware/
│   └── auth.go                # CurrentUser, RequireWorkspace, RequireUser
├── models/
│   ├── db.go                  # SQLite open + migrations (WAL, FK on)
│   ├── user.go                # bcrypt user CRUD
│   ├── session.go             # Session tokens
│   └── workspace.go           # Workspace + template CRUD, claim, optimistic lock
├── templates/
│   ├── render.go              # Template init
│   ├── layout.html            # Win95 shell + boot script
│   └── index.html             # Loading placeholder (overwritten by client boot)
├── static/
│   ├── css/
│   │   └── win95.css
│   ├── fonts/
│   │   ├── ms_sans_serif.woff2
│   │   └── ms_sans_serif_bold.woff2
│   └── js/
│       ├── xlsx.full.min.js   # SheetJS (local)
│       ├── sql.js             # SQL generation
│       ├── app.js             # App state, localStorage, rendering
│       ├── sync.js            # Sync module (pull/push/auth)
│       └── dialogs.js         # Modals (upload / field / account / ...)
└── data.db                    # SQLite DB (created on first run, gitignored)
```

## Prerequisites

- Go 1.21 or higher

## Setup and Installation

```bash
git clone <repo-url>
cd turn
go mod download
go run main.go
```

Visit `http://localhost:8000`. SQLite database (`data.db`) is created automatically on first run.

## Usage

### Basic editing

1. Open the site — an upload dialog opens automatically if there are no saved templates.
2. Drop or choose an Excel/CSV file; pick the header row.
3. Edit columns, types, and cells directly in the sheet.
4. Use the SQL preview dialog to copy generated DDL/DML for your chosen dialect.

### Cross-device sync

Click the 👤 button in the title bar to open the Account dialog.

**Anonymous sync (no signup):**
- `🔗 Sync Code` tab → **產生新的 Sync Code** → copy the code
- On another device, same dialog → **Use code** → paste → all templates sync

**Account-based sync:**
- `Register` tab → email + password (≥ 8 chars) → current local templates auto-upload
- Login on any other browser with the same credentials to see the same workspace

**Migrating from anonymous to account:**
- Generate a sync code on device A, register/login on device B with the same email
- On device B's Account dialog, click **認領 Sync Code 到此帳號**, enter the code
- Templates from the anonymous workspace are merged into your account's workspace

## API Reference

| Method | Path | Auth | Description |
|---|---|---|---|
| POST | `/api/auth/register` | — | Create account, auto-login |
| POST | `/api/auth/login` | — | Login, set session cookie |
| POST | `/api/auth/logout` | cookie | Revoke session |
| GET  | `/api/auth/me` | — | Current auth state |
| POST | `/api/workspace/anon` | — | Create new anonymous workspace + sync code |
| POST | `/api/workspace/claim` | user | Claim sync code into account (merges templates) |
| GET  | `/api/workspace` | user or `X-Sync-Code` | Current workspace info |
| GET  | `/api/templates` | user or `X-Sync-Code` | List templates |
| PUT  | `/api/templates/:id` | user or `X-Sync-Code` | Upsert (409 on stale `updatedAt`) |
| DELETE | `/api/templates/:id` | user or `X-Sync-Code` | Delete |

Sync code workspaces pass `X-Sync-Code: <code>` header. Logged-in requests use the `t2s_session` HttpOnly cookie.

## Architecture Notes

- **Client-side first.** SheetJS parses files, `app.js` manages `App` state, `sql.js` generates SQL. Nothing hits the server in the core flow.
- **Sync is opt-in.** No code / no login = purely local (`localStorage` only). Enabling either triggers an initial pull + ongoing background push.
- **Optimistic updates.** Mutations write to `localStorage` first; `Sync.markDirty(id)` debounces 600ms, then flushes. Offline writes queue and retry on reconnect.
- **Optimistic locking.** Each template carries `updatedAt`; the server rejects writes older than the stored value with `409 Conflict`.
- **One workspace per user.** Enforced by a partial unique index on `workspaces.owner_user_id`. Anonymous workspaces (NULL owner) can be created freely.

## Security Notes

- Passwords hashed with bcrypt (default cost). Min 8 chars enforced.
- Session cookies are `HttpOnly`, `SameSite=Lax`. `Secure` is **not** set — enable it behind TLS in production.
- Sync codes are not authentication — they are bearer capabilities. Anyone with the code can read/write that workspace. Treat like a Google Docs share link.
- No email verification or password reset flow yet.
- CSRF: state-changing endpoints accept JSON; rely on `SameSite=Lax` cookie for basic CSRF protection. Add a token if exposing cross-origin.

## Building for Production

```bash
go build -o turn2sql
```

Deploy the binary alongside `templates/` and `static/`. `data.db` is created in the working directory on first run — mount it on a persistent volume.

## License

[MIT License](LICENSE)
