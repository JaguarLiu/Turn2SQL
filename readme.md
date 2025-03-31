# Excel Upload Website

A Go web application for uploading and viewing Excel files in a Google Sheets-like interface. Built with Gin, htmx, and templ.

## Features

- Upload Excel files through drag-and-drop or file selection
- Parse and display Excel data in a Google Sheets-like interface
- Responsive design for desktop and mobile
- Client-side validation for file types
- Server-side processing of Excel files

## Tech Stack

- **Backend**: Go with Gin framework
- **Frontend**: htmx for interactivity, templ for templates
- **Excel Processing**: Excelize v2
- **Styling**: Custom CSS styled like Google Sheets

## Project Structure

```
excel-upload-website/
├── main.go                   # Main application entry point
├── go.mod                    # Go module definition
├── go.sum                    # Go module checksums
├── static/                   # Static assets
│   ├── css/
│   │   └── styles.css        # CSS styles
│   └── js/
│       └── upload.js         # JavaScript for drag-and-drop
├── templates/                # templ templates
│   └── index.templ           # Main page template
├── handlers/                 # HTTP handlers
│   └── upload.go             # File upload handler
├── models/                   # Data models
│   └── excel.go              # Excel processing logic
└── uploads/                  # Directory where uploaded files are stored
```

## Prerequisites

- Go 1.16 or higher
- templ CLI tool

## Setup and Installation

1. Clone the repository:
   ```
   git clone https://github.com/yourusername/excel-upload-website.git
   cd excel-upload-website
   ```

2. Install dependencies:
   ```
   go mod download
   ```

3. Install templ CLI tool:
   ```
   go install github.com/a-h/templ/cmd/templ@latest
   ```

4. Generate templ files:
   ```
   templ generate
   ```

5. Create required directories:
   ```
   mkdir -p static/css static/js uploads
   ```

6. Run the application:
   ```
   go run main.go
   ```

7. Open your browser and navigate to:
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

## Building for Production

To build the application for production:

```
go build -o excel-uploader
```

This will create an executable that you can run on your server.

## License

[MIT License](LICENSE)
