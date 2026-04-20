# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project Overview

Go web application that uploads Excel files and converts them into SQL DDL/DML across multiple dialects. Frontend is a Windows 95-themed UI (Turn2SQL) that parses Excel/CSV client-side via SheetJS and generates SQL in-browser. Stack: Gin (HTTP), html/template (Go standard lib), Excelize v2 (server-side Excel parsing), SheetJS (client-side parsing), htmx (loaded but not currently wired — reserved for future server integration).

## Build & Run Commands

```bash
# Install dependencies
go mod download

# Run the server (serves on :8080)
go run main.go

# Build production binary
go build -o excel-uploader
```

## Architecture

**Request flow:** Gin router (`main.go`) -> handlers (`handlers/upload.go`) -> models (`models/excel.go`) for Excel processing, html/template (`templates/*.html` + `templates/render.go`) for HTML rendering.

- **`main.go`** - Route definitions. Static files served from `static/`. Routes: `GET /` (index), `POST /upload` (file upload), `GET /data/:filename` (view previously uploaded file). API routes for cell editing (`POST /api/edit-cell`) and row/column deletion (`DELETE /api/delete-row`, `DELETE /api/delete-column`).
- **`handlers/upload.go`** - Upload handler reads Excel bytes into memory, saves to `uploads/`, processes with Excelize, then renders response. Detects htmx requests via `HX-Request` header to return partial HTML vs full page. Edit/delete handlers modify the Excel file and return updated table HTML.
- **`models/excel.go`** - `ExcelData` struct holds parsed spreadsheet data. `ProcessExcelFile` reads only the first sheet. `EditCell`, `DeleteRow`, `DeleteColumn` modify the Excel file on disk via Excelize. Column headers are generated as Excel-style letters (A, B, ..., AA, AB, ...), not from file content. Uploaded files are saved to `./uploads/`.
- **`templates/`** - Uses Go standard `html/template`. `layout.html` is the Turn2SQL Win95 shell (title-bar, nav-pane, sheet-pane `#sheet-root`, modal host, tweaks panel, inline boot script). `{{template "content" .}}` renders inside `#sheet-root` but is overwritten when the client-side `boot()` runs. `index.html` and `data_page.html` are server-side content blocks (legacy fallback); `data_table.html` is the spreadsheet fragment. `render.go` exports `RenderIndex`, `RenderDataTable`, `RenderDataPage`.

**Frontend** (`static/`):
- **CSS**: `win95.css` — Windows 95 aesthetic, theme variables (teal/navy/aubergine/olive).
- **JS**: `sql.js` (multi-dialect SQL generation: MySQL/Postgres/MSSQL/SQLite/ANSI), `app.js` (global `App` state, localStorage persistence of templates under `turn2sql.templates.v1`, rendering of nav + sheet), `dialogs.js` (upload/field-edit/confirm/SQL-preview modals). Loaded as classic scripts (not ES modules) in order: sql → app → dialogs. `htmx.min.js` is included locally but the current UI is client-side only.
- **External**: SheetJS (`xlsx.full.min.js`) from CDN for client-side `.xlsx`/`.xls`/`.csv` parsing.

## Key Conventions

- The project contains Chinese comments in some places (this is intentional)
- Go module name is `turn` (imports use `turn/handlers`, `turn/models`, `turn/templates`)
- Templates use Go standard `html/template` with `{{define}}` blocks for composition
- Turn2SQL UI state lives in `localStorage` (templates + active id); there is no server persistence for the SQL-generation flow — server handlers only serve the legacy Excel upload/edit/delete endpoints
- Frontend JS is intentionally vanilla (no build step); add new script tags to `layout.html` in the existing sql → app → dialogs order
