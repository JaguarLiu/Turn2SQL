package middleware

import (
	"net/http"
	"turn2sql/models"

	"github.com/gin-gonic/gin"
)

const SyncHeader = "X-Sync-Code"

// authFailures 限制每個 IP 猜 sync code 的次數：最多連續 10 次，之後每 6 秒恢復 1 次。
var authFailures = NewIPLimiter(1.0/6, 10)

// RequireWorkspace resolves a workspace from the X-Sync-Code header.
// Aborts 401 if missing or invalid; 429 if the IP has too many failed attempts.
func RequireWorkspace(c *gin.Context) {
	ip := c.ClientIP()
	if authFailures.Exhausted(ip) {
		abortTooMany(c)
		return
	}
	code := c.GetHeader(SyncHeader)
	if code == "" {
		c.AbortWithStatusJSON(http.StatusUnauthorized, gin.H{"error": "sync code required"})
		return
	}
	ws, err := models.GetWorkspaceBySyncCode(code)
	if err != nil {
		authFailures.Allow(ip)
		c.AbortWithStatusJSON(http.StatusUnauthorized, gin.H{"error": "invalid sync code"})
		return
	}
	c.Set("workspace", ws)
	c.Next()
}
