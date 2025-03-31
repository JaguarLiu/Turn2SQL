package handlers

import (
	"io"
	"log"
	"net/http"
	"path/filepath"
	"turn/models"
	"turn/templates"

	"github.com/gin-gonic/gin"
)

// IndexHandler renders the index page
func IndexHandler(c *gin.Context) {
	component := templates.Index()
	component.Render(c.Request.Context(), c.Writer)
}

// UploadExcel handles Excel file uploads
func UploadExcel(c *gin.Context) {
	// Get file from request
	file, header, err := c.Request.FormFile("excelFile")
	if err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": "No file uploaded"})
		return
	}
	defer file.Close()

	filename := header.Filename
	ext := filepath.Ext(filename)

	// Check if file is an Excel file
	if ext != ".xlsx" && ext != ".xls" {
		c.JSON(http.StatusBadRequest, gin.H{"error": "Invalid file format. Only Excel files (.xlsx, .xls) are allowed."})
		return
	}

	// Read file contents
	fileBytes, err := io.ReadAll(file)
	if err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": "Failed to read file"})
		return
	}

	// Save file
	filePath, err := models.SaveUploadedFile(fileBytes, filename)
	if err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": "Failed to save file"})
		return
	}

	// Process Excel file
	excelData, err := models.ProcessExcelFile(filePath)
	if err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": "Failed to process Excel file: " + err.Error()})
		return
	}

	// Check if the request is an HTMX request
	if c.GetHeader("HX-Request") == "true" {
		// Return the data to be displayed
		component := templates.DataTable(excelData)
		component.Render(c.Request.Context(), c.Writer)
	} else {
		// Redirect to the data view page for non-HTMX requests
		c.Redirect(http.StatusFound, "/data/"+filename)
	}
}

// GetExcelData retrieves previously processed Excel data
func GetExcelData(c *gin.Context) {
	filename := c.Param("filename")
	if filename == "" {
		c.JSON(http.StatusBadRequest, gin.H{"error": "No filename provided"})
		return
	}

	filePath := filepath.Join("./uploads", filename)

	// Process Excel file
	excelData, err := models.ProcessExcelFile(filePath)
	if err != nil {
		log.Printf("Error processing Excel file: %v", err)
		c.JSON(http.StatusInternalServerError, gin.H{"error": "Failed to process Excel file"})
		return
	}

	// Render the data page
	component := templates.DataPage(excelData)
	component.Render(c.Request.Context(), c.Writer)
}
