# Excel Upload Website

A Go web application for uploading and viewing Excel files in a Google Sheets-like interface. Built with Gin, htmx, and Go standard `html/template`.

## Features

- Upload Excel files through drag-and-drop or file selection
- Parse and display Excel data in a Google Sheets-like interface
- Inline cell editing (double-click to edit, changes saved to Excel file)
- Delete rows and columns (right-click context menu or Delete key)
- Multi-select rows/columns with Shift key
- Sidebar file list for switching between uploaded files
- Upload progress bar with percentage display
- Browser history navigation (back/forward) when switching files
- Responsive design for desktop and mobile
- Client-side and server-side file validation

## Tech Stack

- **Backend**: Go with Gin framework
- **Frontend**: htmx (HTML over the wire, loaded locally)
- **Templates**: Go standard `html/template`
- **Excel Processing**: Excelize v2
- **Styling**: Custom CSS styled like Google Sheets
- **JS**: ES modules (`init.js`, `event.js`, `table.js`, `sidebar.js`, `api.js`)

## Project Structure

```
turn/
├── main.go                        # Route definitions, server entry point
├── go.mod
├── go.sum
├── handlers/
│   └── upload.go                  # HTTP handlers (upload, view, edit, delete)
├── models/
│   └── excel.go                   # Excel processing (read, edit cell, delete row/col)
├── templates/
│   ├── render.go                  # Template init + RenderIndex/DataTable/DataPage
│   ├── layout.html                # Base HTML layout (sidebar, head, scripts)
│   ├── index.html                 # Upload page content
│   ├── data_table.html            # Spreadsheet table partial (htmx fragment)
│   └── data_page.html             # Full page data view
├── static/
│   ├── css/
│   │   └── styles.css             # All styles
│   └── js/
│       ├── htmx.min.js            # htmx library (local)
│       ├── init.js                # Entry point, htmx event setup, error handling
│       ├── event.js               # Keyboard, mouse, editing, upload events
│       ├── table.js               # Table init, selection, delete via htmx
│       ├── sidebar.js             # Sidebar toggle, file list management
│       └── api.js                 # Shared utilities (getCurrentFilename)
└── uploads/                       # Uploaded Excel files (created automatically)
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

1. Visit the homepage at `http://localhost:8080`
2. Upload an Excel file either by:
   - Dragging and dropping the file onto the drop zone
   - Clicking "Choose File" and selecting a file
3. Click the "Upload" button
4. View your Excel data displayed in a Google Sheets-like interface
5. **Edit cells**: Double-click any cell to edit, press Enter to save or Escape to cancel
6. **Delete rows/columns**: Right-click a row/column header, or select and press Delete
7. **Multi-select**: Hold Shift and click multiple row/column headers, then Delete
8. **Switch files**: Click files in the sidebar to switch between uploaded spreadsheets

## Architecture

All server interactions use the htmx "HTML over the wire" pattern:

- **Upload**: `hx-post="/upload"` on the form, server returns `DataTable` HTML fragment
- **Edit cell**: `htmx.ajax('POST', '/api/edit-cell')`, server modifies Excel file and returns updated table
- **Delete row/column**: `htmx.ajax('DELETE', '/api/delete-row')`, server modifies Excel file and returns updated table
- **View file**: `htmx.ajax('GET', '/data/:filename')`, server returns `DataTable` fragment with `HX-Push-Url` for browser history

Handlers detect `HX-Request` header to decide between returning an HTML fragment (htmx) or a full page (direct browser navigation).

## Building for Production

```bash
go build -o excel-uploader
```

This will create an executable that you can run on your server. Make sure the `templates/` and `static/` directories are in the same directory as the binary.

## License

[MIT License](LICENSE)
