package middleware

import (
	"net/http"
	"turn2sql/models"

	"github.com/gin-gonic/gin"
)

const (
	SessionCookie = "t2s_session"
	SyncHeader    = "X-Sync-Code"
)

// CurrentUser attaches the logged-in user (if any) to the context, but does not require login.
func CurrentUser(c *gin.Context) {
	token, err := c.Cookie(SessionCookie)
	if err != nil || token == "" {
		c.Next()
		return
	}
	sess, err := models.GetSession(token)
	if err != nil {
		c.Next()
		return
	}
	u, err := models.GetUserByID(sess.UserID)
	if err != nil {
		c.Next()
		return
	}
	c.Set("user", u)
	c.Set("session", sess)
	c.Next()
}

// RequireWorkspace resolves a workspace from either session (user's own) or X-Sync-Code header.
// Aborts 401 if neither is valid.
func RequireWorkspace(c *gin.Context) {
	if uVal, ok := c.Get("user"); ok {
		u := uVal.(*models.User)
		ws, err := models.GetOrCreateUserWorkspace(u.ID)
		if err != nil {
			c.AbortWithStatusJSON(http.StatusInternalServerError, gin.H{"error": "workspace error"})
			return
		}
		c.Set("workspace", ws)
		c.Next()
		return
	}
	code := c.GetHeader(SyncHeader)
	if code == "" {
		c.AbortWithStatusJSON(http.StatusUnauthorized, gin.H{"error": "login or sync code required"})
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

// RequireUser aborts 401 unless a user is attached.
func RequireUser(c *gin.Context) {
	if _, ok := c.Get("user"); !ok {
		c.AbortWithStatusJSON(http.StatusUnauthorized, gin.H{"error": "login required"})
		return
	}
	c.Next()
}
