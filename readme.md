# Turn2SQL

A Go web application for uploading Excel/CSV files and converting them to SQL statements across multiple dialects. The frontend is a Windows 95-themed UI that parses spreadsheets client-side and generates SQL DDL/DML in-browser.

## Features

- Upload Excel (`.xlsx`/`.xls`) or CSV files via drag-and-drop or file picker
- Client-side parsing with SheetJS — no round-trip required for preview
- Pick header row, rename/retype columns, edit cells inline
- Generate SQL for MySQL, PostgreSQL, SQL Server, SQLite, ANSI SQL
- Template library persisted in browser `localStorage` (multiple files, switch between them)
- Theming (Teal / Navy / Plum / Olive), font-smoothing toggle, sample-data loader
- Legacy server-side Excel endpoints retained for upload / edit-cell / delete-row / delete-column

## Tech Stack

- **Backend**: Go + Gin
- **Templates**: Go standard `html/template`
- **Excel (server)**: Excelize v2
- **Excel/CSV (client)**: SheetJS (`xlsx.full.min.js` via CDN)
- **UI**: Vanilla JS (no build step) + htmx loaded locally for future server integration
- **Styling**: Custom Windows 95 aesthetic (`win95.css`)

## Project Structure

```
turn/
├── main.go                        # Routes, server entry point
├── go.mod / go.sum
├── handlers/
│   └── upload.go                  # HTTP handlers (upload, view, edit, delete)
├── models/
│   └── excel.go                   # Excelize-based read/edit/delete
├── templates/
│   ├── render.go                  # Template init + Render{Index,DataTable,DataPage}
│   ├── layout.html                # Win95 shell: title-bar, nav-pane, sheet-pane, modals, boot
│   ├── index.html                 # Content block (legacy upload form, rendered inside sheet-root)
│   ├── data_page.html             # Full-page data view content block
│   └── data_table.html            # Spreadsheet table fragment
├── static/
│   ├── css/
│   │   └── win95.css              # Windows 95 styling + theme variables
│   └── js/
│       ├── htmx.min.js            # htmx library (local)
│       ├── sql.js                 # Multi-dialect SQL generation
│       ├── app.js                 # App state, localStorage, nav + sheet rendering
│       └── dialogs.js             # Upload / field-edit / confirm / SQL-preview modals
└── uploads/                       # Excel files uploaded via the legacy server endpoint
```

## Prerequisites

- Go 1.21 or higher

## Setup and Installation

1. Clone the repository:
   ```bash
   git clone <repo-url>
   cd turn
   ```

2. Install dependencies:
   ```bash
   go mod download
   ```

3. Run the application:
   ```bash
   go run main.go
   ```

4. Open your browser and navigate to:
   ```
   http://localhost:8080
   ```

## Usage

1. Visit the homepage — an upload dialog opens automatically when there are no saved templates.
2. Drop or choose an Excel/CSV file; pick the header row.
3. Edit columns, types, and cells directly in the sheet.
4. Click a template in the left nav to switch between files. Templates are stored in browser `localStorage` (`turn2sql.templates.v1`).
5. Use the SQL preview dialog to copy generated DDL/DML for your chosen dialect.

## Architecture Notes

- The Turn2SQL UI is client-side only: SheetJS parses files in the browser, `app.js` manages state, `sql.js` generates SQL. Nothing is sent to the server for the main flow.
- `layout.html` is the Win95 shell; its inline `boot()` script calls `renderNav()` / `renderSheet()` on load, overwriting `#sheet-root`. Server-rendered content blocks (`index.html`, `data_page.html`) still render inside `#sheet-root` briefly and act as a fallback.
- The legacy Go endpoints (`POST /upload`, `GET /data/:filename`, `POST /api/edit-cell`, `DELETE /api/delete-row`, `DELETE /api/delete-column`) remain available and use htmx-style HTML fragments — reserved for future server-backed persistence.

## Building for Production

```bash
go build -o excel-uploader
```

This creates an executable. Keep the `templates/` and `static/` directories beside the binary at runtime.

## License

[MIT License](LICENSE)
