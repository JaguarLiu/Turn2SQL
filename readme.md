🌐 Language: **English** · [繁體中文](README.zh-TW.md)

# Turn2SQL

A Go web application for uploading Excel/CSV files and converting them to SQL statements across multiple dialects. The frontend is a Windows 95-themed UI that parses spreadsheets client-side and generates SQL DDL/DML in-browser. Templates can be synced across devices via an anonymous **sync code**.

## Features

- Upload Excel (`.xlsx`/`.xls`) or CSV files via drag-and-drop or file picker
- Client-side parsing with SheetJS — no round-trip needed for preview
- Pick header row, rename/retype columns, edit cells inline (debounced persistence — no full re-render on each keystroke)
- Generate SQL for MySQL, PostgreSQL, SQL Server, SQLite, ANSI SQL
- Output modes: **CREATE**, **INSERT**, **UPDATE** (pick WHERE columns via a listbox dialog — at least one required), **CREATE & INSERT**
- **Cross-device sync via Sync Code:**
  - Anonymous **Sync Code** (10-char token) — `🔗 Share` toolbar button shows the code + a shareable URL (`/sync/{code}`) with copy buttons
  - **`📥 Import`** toolbar button — paste a sync code on another device to adopt the workspace; templates merge with what's already on that device
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

Tests:

```bash
go test ./...                          # Go: AI providers, tasks, handlers
TZ=Asia/Taipei node test/sql.test.js   # SQL generation (dates are timezone-sensitive)
node test/rules.test.js                # Data-cleaning rule engine
node test/ai.test.js                   # Sampling + PII masking
```

Integration tests run the generated SQL against a real database in Docker (testcontainers):

```bash
go test -tags integration ./integration/...   # MySQL + PostgreSQL + SQL Server; needs Docker + node, ~30s
```

`test/e2e.test.js` drives the browser modules against a running server with the mock provider — see the header of that file for the command.

## Usage

### Basic editing

1. Open the site — an upload dialog opens automatically if there are no saved templates
2. Drop or choose an Excel/CSV file; pick the header row
3. Edit columns, types, and cells directly in the sheet
4. Pick an output mode; for **UPDATE**, a dialog opens asking which columns form the `WHERE` condition
5. Use **Preview SQL** or **Convert & Download .sql** to export

### Cross-device sync

**Share (generate / copy a sync code):** click **🔗 Share** in the toolbar → dialog shows the current sync code and a shareable URL like `http://host/sync/{code}`, each with a Copy button. If none yet, the dialog offers an inline *產生 Sync Code* button.

**Import (adopt a code from another device):** click **📥 Import** in the toolbar → paste the code. Your local client switches to sync against that workspace; existing local templates merge with whatever is on the remote.

**Shareable URL:** opening `http://host/sync/{code}` in a new browser automatically adopts the code (the URL is cleaned from the address bar).

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
| `TRUSTED_PROXIES` | _(none)_ | Comma-separated proxy IPs/CIDRs whose `X-Forwarded-For` is trusted. Set this when running behind a reverse proxy, otherwise all clients share one rate-limit bucket |
| `AI_PROVIDER` | `gemini` | Server-side AI provider: `claude`, `gemini`, `openai`, or `mock`. Server-side AI stays off until the matching key is set (BYOK requests still work) |
| `AI_MODEL` / `AI_MODEL_<PROVIDER>` / `AI_MODEL_<TASK>` | _(SDK default)_ | Model override, per provider or per task (`AI_MODEL_SCHEMA`, `AI_MODEL_CLEAN`) |
| `AI_FALLBACK` | _(none)_ | Provider to retry with when the primary one is rate-limited or down |
| `AI_TIMEOUT` | `60s` | Per-request AI timeout |
| `AI_PRICING_FILE` | _(none)_ | JSON file overriding the built-in per-model price table (used for cost logging only) |
| `AI_MOCK_DIR` | _(none)_ | With `AI_PROVIDER=mock`, directory of `<model>.json` fixtures |
| `ANTHROPIC_API_KEY` / `GEMINI_API_KEY` / `OPENAI_API_KEY` | _(none)_ | Credentials for the matching provider |
| `GOOGLE_CLOUD_PROJECT` + `GOOGLE_CLOUD_LOCATION` | _(none)_ | Use Vertex AI instead of the Gemini API |
| `TEMPLATES_DIR` | `templates` | HTML template directory |

## License

[MIT License](LICENSE)
