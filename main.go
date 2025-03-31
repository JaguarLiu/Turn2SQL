package main

import (
	"log"
	"net/http"
	"turn/handlers"

	"github.com/gin-contrib/static"
	"github.com/gin-gonic/gin"
)

func main() {
	router := gin.Default()

	// Serve static files
	router.Use(static.Serve("/static", static.LocalFile("./static", false)))

	// Routes
	router.GET("/", handlers.IndexHandler)
	router.POST("/upload", handlers.UploadExcel)
	router.GET("/data/:filename", handlers.GetExcelData)

	// API route for editing cells (will be implemented later)
	router.POST("/api/edit-cell", func(c *gin.Context) {
		// 這裡將來會實現單元格編輯的保存邏輯
		c.JSON(http.StatusOK, gin.H{"success": true})
	})

	// API routes for deleting rows and columns
	router.POST("/api/delete-row", func(c *gin.Context) {
		// 這裡將來會實現刪除行的邏輯
		c.JSON(http.StatusOK, gin.H{"success": true})
	})

	router.POST("/api/delete-column", func(c *gin.Context) {
		// 這裡將來會實現刪除列的邏輯
		c.JSON(http.StatusOK, gin.H{"success": true})
	})

	log.Println("Server starting on http://localhost:8080")
	if err := router.Run(":8080"); err != nil {
		log.Fatalf("Failed to start server: %v", err)
	}
}
