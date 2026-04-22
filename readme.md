🌐 Language: **English** · [繁體中文](README.zh-TW.md)

# Turn2SQL

A Go web application for uploading Excel/CSV files and converting them to SQL statements across multiple dialects. The frontend is a Windows 95-themed UI that parses spreadsheets client-side and generates SQL DDL/DML in-browser. Templates can be synced across devices via an anonymous **sync code** or a **registered account**.

## Features

- Upload Excel (`.xlsx`/`.xls`) or CSV files via drag-and-drop or file picker
- Client-side parsing with SheetJS — no round-trip needed for preview
- Pick header row, rename/retype columns, edit cells inline (debounced persistence — no full re-render on each keystroke)
- Generate SQL for MySQL, PostgreSQL, SQL Server, SQLite, ANSI SQL
- Output modes: **CREATE**, **INSERT**, **UPDATE** (pick WHERE columns via a listbox dialog — at least one required), **CREATE & INSERT**
- **Cross-device sync:**
  - Anonymous **Sync Code** (10-char token) — `🔗 Share` toolbar button shows the code + a shareable URL (`/sync/{code}`) with copy buttons
  - **`📥 Import`** toolbar button — paste a sync code to adopt a workspace; when logged in it merges the remote workspace into your account (claim) and deletes the anonymous source
  - **Account login** (stepped dialog) — enter email, backend checks existence, then either asks for password (existing) or lets you register inline (new). Workspace auto-bound to the account across any logged-in browser
- Offline-first: all edits save locally first, queued for background sync, retry on reconnect
- Theming (Teal / Navy / Plum / Olive), font-smoothing toggle, sample-data loader

## Prerequisites

- Go 1.21 or higher

## Setup and Installation

```bash
git clone <repo-url>
cd turn2sql
go mod download
go run main.go
```

Visit `http://localhost:8000`. SQLite database (`data.db`) is created automatically on first run.

## Usage

### Basic editing

1. Open the site — an upload dialog opens automatically if there are no saved templates
2. Drop or choose an Excel/CSV file; pick the header row
3. Edit columns, types, and cells directly in the sheet
4. Pick an output mode; for **UPDATE**, a dialog opens asking which columns form the `WHERE` condition
5. Use **Preview SQL** or **Convert & Download .sql** to export

### Cross-device sync

**Share (generate / copy a sync code):** click **🔗 Share** in the toolbar → dialog shows the current sync code and a shareable URL like `http://host/sync/{code}`, each with a Copy button. If none yet, the dialog offers an inline *產生 Sync Code* button.

**Import (adopt someone else's code, or a code from another device):** click **📥 Import** in the toolbar → paste the code.
- When **logged in** → merges that workspace's templates into your account (claim), source is deleted
- When **anonymous** → switches your local client to sync against that workspace

**Shareable URL:** opening `http://host/sync/{code}` in a new browser automatically adopts the code (the URL is cleaned from the address bar; skipped if you're already logged in).

**Account:** click the 👤 button in the template nav pane.
1. Enter your email → **Next →**
2. Backend reports whether the account exists
3. Enter password and hit **Login** (existing) or **Register** (new). On register, current local templates upload to the new account automatically

## Building for Production

### Plain Go binary

```bash
go build -o turn2sql
```

Deploy the binary alongside `templates/` and `static/`. `data.db` is created in the working directory on first run (or wherever `DATABASE_PATH` points) — mount it on a persistent volume.

### Docker / Docker Compose

```bash
docker compose up -d --build
# → http://localhost:8000
```

- Image is built via a multi-stage `Dockerfile` (pure-Go SQLite, no CGO)
- Data is persisted in the named volume `turn2sql-data` mounted at `/app/data` (`DATABASE_PATH=/app/data/data.db`)
- To use a host directory instead of a named volume, replace the `volumes:` entry in `docker-compose.yml` with `- ./data:/app/data`
- Tail logs / stop:
  ```bash
  docker compose logs -f
  docker compose down         # keeps the data volume
  docker compose down -v      # also removes the data volume (destructive)
  ```

### Environment variables

| Variable | Default | Description |
|---|---|---|
| `DATABASE_PATH` | `./data.db` | SQLite file path |
| `GIN_MODE` | `debug` | Set to `release` in production |

## License

[MIT License](LICENSE)
