package main

import (
	"log"
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

	// API routes - 回傳 HTML 片段供 htmx swap
	router.POST("/api/edit-cell", handlers.EditCell)
	router.DELETE("/api/delete-row", handlers.DeleteRow)
	router.DELETE("/api/delete-column", handlers.DeleteColumn)

	log.Println("Server starting on http://localhost:8080")
	if err := router.Run(":8080"); err != nil {
		log.Fatalf("Failed to start server: %v", err)
	}
}
