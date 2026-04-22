package main

import (
	"log"
	"os"
	"turn2sql/handlers"
	"turn2sql/middleware"
	"turn2sql/models"

	"github.com/gin-contrib/static"
	"github.com/gin-gonic/gin"
)

func main() {
	dbPath := os.Getenv("DATABASE_PATH")
	if dbPath == "" {
		dbPath = "./data.db"
	}
	if err := models.InitDB(dbPath); err != nil {
		log.Fatalf("Failed to initialize database: %v", err)
	}

	router := gin.Default()

	// Static files
	router.Use(static.Serve("/static", static.LocalFile("./static", false)))

	// Attach current user (if any) to every request
	router.Use(middleware.CurrentUser)

	// Pages
	router.GET("/", handlers.IndexHandler)
	router.GET("/sync/:code", handlers.IndexHandler)

	// Auth API
	auth := router.Group("/api/auth")
	{
		auth.POST("/check", handlers.CheckEmail)
		auth.POST("/register", handlers.Register)
		auth.POST("/login", handlers.Login)
		auth.POST("/logout", handlers.Logout)
		auth.GET("/me", handlers.Me)
	}

	// Workspace — anon create is public; claim requires login
	router.POST("/api/workspace/anon", handlers.CreateAnonymousWorkspace)
	router.POST("/api/workspace/claim", middleware.RequireUser, handlers.ClaimWorkspace)
	router.GET("/api/workspace", middleware.RequireWorkspace, handlers.GetWorkspace)

	// Template sync
	tmpl := router.Group("/api/templates", middleware.RequireWorkspace)
	{
		tmpl.GET("", handlers.ListTemplates)
		tmpl.PUT("/:id", handlers.PutTemplate)
		tmpl.DELETE("/:id", handlers.DeleteTemplate)
	}

	log.Println("Server starting on http://localhost:8000")
	if err := router.Run(":8000"); err != nil {
		log.Fatalf("Failed to start server: %v", err)
	}
}
