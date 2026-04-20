package handlers

import (
	"log"
	"turn/templates"

	"github.com/gin-gonic/gin"
)

// IndexHandler renders the Turn2SQL shell page.
func IndexHandler(c *gin.Context) {
	if err := templates.RenderIndex(c.Writer); err != nil {
		log.Printf("Error rendering index: %v", err)
	}
}
