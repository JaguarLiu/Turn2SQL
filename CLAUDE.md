# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project Overview

Go web application for uploading and viewing Excel files in a Google Sheets-like interface. Uses Gin (HTTP framework), htmx (frontend interactivity), html/template (Go standard library templating), and Excelize v2 (Excel parsing).

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
- **`templates/`** - Uses Go standard `html/template`. `layout.html` (base HTML with sidebar), `index.html` (upload form), `data_table.html` (spreadsheet grid partial for htmx), `data_page.html` (full page data view). `render.go` initializes templates and exports `RenderIndex`, `RenderDataTable`, `RenderDataPage` functions.

**Frontend JS modules** (`static/js/`): `init.js` (entry point), `table.js` (spreadsheet interactions), `sidebar.js` (sidebar toggle), `event.js` (event handling), `api.js` (shared utilities). Uses ES module imports. htmx loaded from local `htmx.min.js`.

## Key Conventions

- The project contains Chinese comments in some places (this is intentional)
- Go module name is `turn` (imports use `turn/handlers`, `turn/models`, `turn/templates`)
- Templates use Go standard `html/template` with `{{define}}` blocks for composition
- htmx handles all AJAX interactions; server returns HTML fragments, not JSON
