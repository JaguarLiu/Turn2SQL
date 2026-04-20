package handlers

import (
	"errors"
	"net/http"
	"turn/middleware"
	"turn/models"

	"github.com/gin-gonic/gin"
)

type authBody struct {
	Email    string `json:"email"`
	Password string `json:"password"`
}

func setSessionCookie(c *gin.Context, sess *models.Session) {
	maxAge := int(models.SessionDuration.Seconds())
	c.SetSameSite(http.SameSiteLaxMode)
	c.SetCookie(middleware.SessionCookie, sess.ID, maxAge, "/", "", false, true)
}

func clearSessionCookie(c *gin.Context) {
	c.SetSameSite(http.SameSiteLaxMode)
	c.SetCookie(middleware.SessionCookie, "", -1, "/", "", false, true)
}

// Register creates a new account and logs in.
func Register(c *gin.Context) {
	var b authBody
	if err := c.ShouldBindJSON(&b); err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": "invalid body"})
		return
	}
	u, err := models.CreateUser(b.Email, b.Password)
	if err != nil {
		switch {
		case errors.Is(err, models.ErrEmailTaken):
			c.JSON(http.StatusConflict, gin.H{"error": "email already registered"})
		case errors.Is(err, models.ErrWeakPassword):
			c.JSON(http.StatusBadRequest, gin.H{"error": "password must be at least 8 characters"})
		case errors.Is(err, models.ErrInvalidEmail):
			c.JSON(http.StatusBadRequest, gin.H{"error": "invalid email"})
		default:
			c.JSON(http.StatusInternalServerError, gin.H{"error": "failed to create user"})
		}
		return
	}
	// auto-create the user's workspace
	if _, err := models.GetOrCreateUserWorkspace(u.ID); err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": "failed to create workspace"})
		return
	}
	sess, err := models.CreateSession(u.ID)
	if err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": "failed to create session"})
		return
	}
	setSessionCookie(c, sess)
	c.JSON(http.StatusOK, gin.H{"id": u.ID, "email": u.Email})
}

// Login authenticates and issues a session cookie.
func Login(c *gin.Context) {
	var b authBody
	if err := c.ShouldBindJSON(&b); err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": "invalid body"})
		return
	}
	u, err := models.AuthenticateUser(b.Email, b.Password)
	if err != nil {
		c.JSON(http.StatusUnauthorized, gin.H{"error": "invalid email or password"})
		return
	}
	sess, err := models.CreateSession(u.ID)
	if err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": "failed to create session"})
		return
	}
	setSessionCookie(c, sess)
	c.JSON(http.StatusOK, gin.H{"id": u.ID, "email": u.Email})
}

// Logout deletes the session and clears the cookie.
func Logout(c *gin.Context) {
	if sVal, ok := c.Get("session"); ok {
		_ = models.DeleteSession(sVal.(*models.Session).ID)
	}
	clearSessionCookie(c)
	c.JSON(http.StatusOK, gin.H{"ok": true})
}

// Me returns current user info (or 204 if anonymous).
func Me(c *gin.Context) {
	uVal, ok := c.Get("user")
	if !ok {
		c.JSON(http.StatusOK, gin.H{"authenticated": false})
		return
	}
	u := uVal.(*models.User)
	c.JSON(http.StatusOK, gin.H{"authenticated": true, "id": u.ID, "email": u.Email})
}
