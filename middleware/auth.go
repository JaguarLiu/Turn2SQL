package middleware

import (
	"net/http"
	"turn2sql/models"

	"github.com/gin-gonic/gin"
)

const SyncHeader = "X-Sync-Code"

// RequireWorkspace resolves a workspace from the X-Sync-Code header.
// Aborts 401 if missing or invalid.
func RequireWorkspace(c *gin.Context) {
	code := c.GetHeader(SyncHeader)
	if code == "" {
		c.AbortWithStatusJSON(http.StatusUnauthorized, gin.H{"error": "sync code required"})
		return
	}
	ws, err := models.GetWorkspaceBySyncCode(code)
	if err != nil {
		c.AbortWithStatusJSON(http.StatusUnauthorized, gin.H{"error": "invalid sync code"})
		return
	}
	c.Set("workspace", ws)
	c.Next()
}
