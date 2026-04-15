package handlers

import (
	"io"
	"log"
	"net/http"
	"path/filepath"
	"strconv"
	"turn/models"
	"turn/templates"

	"github.com/gin-gonic/gin"
)

// IndexHandler renders the index page
func IndexHandler(c *gin.Context) {
	if err := templates.RenderIndex(c.Writer); err != nil {
		log.Printf("Error rendering index: %v", err)
	}
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
		templates.RenderDataTable(c.Writer, excelData)
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

	// htmx 請求只回傳 DataTable 片段，一般請求回傳完整頁面
	if c.GetHeader("HX-Request") == "true" {
		// 推送 URL 到瀏覽器歷史，讓使用者可以用上/下一頁導航
		c.Header("HX-Push-Url", "/data/"+filename)
		templates.RenderDataTable(c.Writer, excelData)
	} else {
		templates.RenderDataPage(c.Writer, excelData)
	}
}

// EditCell 處理儲存格編輯
func EditCell(c *gin.Context) {
	filename := c.PostForm("filename")
	rowStr := c.PostForm("row")
	colStr := c.PostForm("col")
	value := c.PostForm("value")

	if filename == "" || rowStr == "" || colStr == "" {
		c.String(http.StatusBadRequest, "缺少必要參數")
		return
	}

	row, err := strconv.Atoi(rowStr)
	if err != nil {
		c.String(http.StatusBadRequest, "無效的行索引")
		return
	}
	col, err := strconv.Atoi(colStr)
	if err != nil {
		c.String(http.StatusBadRequest, "無效的列索引")
		return
	}

	filePath := filepath.Join("./uploads", filename)
	excelData, err := models.EditCell(filePath, row, col, value)
	if err != nil {
		log.Printf("Error editing cell: %v", err)
		c.String(http.StatusInternalServerError, "編輯儲存格失敗")
		return
	}

	templates.RenderDataTable(c.Writer, excelData)
}

// DeleteRow 處理刪除行
func DeleteRow(c *gin.Context) {
	filename := c.Query("filename")
	rowStr := c.Query("row")

	if filename == "" || rowStr == "" {
		c.String(http.StatusBadRequest, "缺少必要參數")
		return
	}

	row, err := strconv.Atoi(rowStr)
	if err != nil {
		c.String(http.StatusBadRequest, "無效的行索引")
		return
	}

	filePath := filepath.Join("./uploads", filename)
	excelData, err := models.DeleteRow(filePath, row)
	if err != nil {
		log.Printf("Error deleting row: %v", err)
		c.String(http.StatusInternalServerError, "刪除行失敗")
		return
	}

	templates.RenderDataTable(c.Writer, excelData)
}

// DeleteColumn 處理刪除列
func DeleteColumn(c *gin.Context) {
	filename := c.Query("filename")
	colStr := c.Query("column")

	if filename == "" || colStr == "" {
		c.String(http.StatusBadRequest, "缺少必要參數")
		return
	}

	col, err := strconv.Atoi(colStr)
	if err != nil {
		c.String(http.StatusBadRequest, "無效的列索引")
		return
	}

	filePath := filepath.Join("./uploads", filename)
	excelData, err := models.DeleteColumn(filePath, col)
	if err != nil {
		log.Printf("Error deleting column: %v", err)
		c.String(http.StatusInternalServerError, "刪除列失敗")
		return
	}

	templates.RenderDataTable(c.Writer, excelData)
}
