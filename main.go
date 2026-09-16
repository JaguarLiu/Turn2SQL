package main

import (
	"log"
	"os"
	"strings"
	"turn2sql/handlers"
	"turn2sql/middleware"
	"turn2sql/models"
	"turn2sql/templates"

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
	// 啟動時就確認模板讀得到，而不是等第一個請求才失敗
	if err := templates.Load(); err != nil {
		log.Fatalf("Failed to load templates: %v", err)
	}

	router := gin.Default()

	// 預設不信任任何 proxy（ClientIP = 連線來源）；放在反向代理後面時用
	// TRUSTED_PROXIES（逗號分隔的 IP/CIDR）指定，否則所有人會共用同一個限流額度。
	if err := router.SetTrustedProxies(trustedProxies()); err != nil {
		log.Fatalf("Invalid TRUSTED_PROXIES: %v", err)
	}

	// Static files
	router.Use(static.Serve("/static", static.LocalFile("./static", false)))

	// Pages
	router.GET("/", handlers.IndexHandler)
	router.GET("/sync/:code", handlers.IndexHandler)

	// API：body 上限 20MB；每 IP 每秒 20 個請求，可瞬間累積 100 個
	api := router.Group("/api",
		middleware.BodyLimit(middleware.MaxBodyBytes),
		middleware.NewIPLimiter(20, 100).Middleware(),
	)

	// Workspace — anon create is public（每 IP 最多連續 5 次，之後每 12 秒 1 次）
	api.POST("/workspace/anon", middleware.NewIPLimiter(1.0/12, 5).Middleware(), handlers.CreateAnonymousWorkspace)
	api.GET("/workspace", middleware.RequireWorkspace, handlers.GetWorkspace)

	// AI：body 上限比一般 API 小（只收抽樣資料），流量限制也更嚴格
	aiHandler := handlers.NewAIHandler()
	aiGroup := api.Group("/ai",
		middleware.BodyLimit(middleware.MaxAIBodyBytes),
		middleware.NewIPLimiter(1.0/3, 10).Middleware(),
	)
	{
		aiGroup.GET("/providers", aiHandler.ListProviders)
		aiGroup.POST("/schema", aiHandler.SuggestSchema)
		aiGroup.POST("/clean-rules", aiHandler.SuggestCleanRules)
	}

	// Template sync
	tmpl := api.Group("/templates", middleware.RequireWorkspace)
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

func trustedProxies() []string {
	var out []string
	for _, p := range strings.Split(os.Getenv("TRUSTED_PROXIES"), ",") {
		if p = strings.TrimSpace(p); p != "" {
			out = append(out, p)
		}
	}
	return out
}
