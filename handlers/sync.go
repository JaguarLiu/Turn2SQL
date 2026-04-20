package handlers

import (
	"encoding/json"
	"errors"
	"net/http"
	"time"
	"turn/models"

	"github.com/gin-gonic/gin"
)

func workspaceFromCtx(c *gin.Context) *models.Workspace {
	if v, ok := c.Get("workspace"); ok {
		return v.(*models.Workspace)
	}
	return nil
}

// CreateAnonymousWorkspace issues a new sync code for unauthenticated use.
func CreateAnonymousWorkspace(c *gin.Context) {
	ws, err := models.CreateAnonymousWorkspace()
	if err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": "failed to create workspace"})
		return
	}
	c.JSON(http.StatusOK, gin.H{"sync_code": ws.SyncCode})
}

// GetWorkspace returns info about the resolved workspace.
func GetWorkspace(c *gin.Context) {
	ws := workspaceFromCtx(c)
	c.JSON(http.StatusOK, gin.H{
		"id":        ws.ID,
		"sync_code": ws.SyncCode,
		"owned":     ws.OwnerUserID != nil,
	})
}

// ClaimWorkspace binds an anonymous workspace to the logged-in user.
func ClaimWorkspace(c *gin.Context) {
	var b struct {
		SyncCode string `json:"sync_code"`
	}
	if err := c.ShouldBindJSON(&b); err != nil || b.SyncCode == "" {
		c.JSON(http.StatusBadRequest, gin.H{"error": "sync_code required"})
		return
	}
	u := c.MustGet("user").(*models.User)
	ws, err := models.ClaimWorkspace(u.ID, b.SyncCode)
	if err != nil {
		switch {
		case errors.Is(err, models.ErrWorkspaceNotFound):
			c.JSON(http.StatusNotFound, gin.H{"error": "sync code not found"})
		case errors.Is(err, models.ErrAlreadyClaimed):
			c.JSON(http.StatusConflict, gin.H{"error": "workspace already claimed"})
		default:
			c.JSON(http.StatusInternalServerError, gin.H{"error": "failed to claim"})
		}
		return
	}
	c.JSON(http.StatusOK, gin.H{"sync_code": ws.SyncCode, "owned": true})
}

// ListTemplates returns all templates for the current workspace.
func ListTemplates(c *gin.Context) {
	ws := workspaceFromCtx(c)
	tmpls, err := models.ListTemplates(ws.ID)
	if err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": "failed to list"})
		return
	}
	c.JSON(http.StatusOK, gin.H{"templates": tmpls})
}

// PutTemplate upserts a template.
func PutTemplate(c *gin.Context) {
	ws := workspaceFromCtx(c)
	id := c.Param("id")
	var b struct {
		Name      string          `json:"name"`
		Data      json.RawMessage `json:"data"`
		UpdatedAt time.Time       `json:"updatedAt"`
	}
	if err := c.ShouldBindJSON(&b); err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": "invalid body"})
		return
	}
	if b.Name == "" || len(b.Data) == 0 {
		c.JSON(http.StatusBadRequest, gin.H{"error": "name and data required"})
		return
	}
	t, err := models.UpsertTemplate(ws.ID, id, b.Name, b.Data, b.UpdatedAt)
	if err != nil {
		if errors.Is(err, models.ErrStaleUpdate) {
			c.JSON(http.StatusConflict, gin.H{"error": "template was updated elsewhere"})
			return
		}
		c.JSON(http.StatusInternalServerError, gin.H{"error": "failed to save"})
		return
	}
	c.JSON(http.StatusOK, t)
}

// DeleteTemplate removes a template.
func DeleteTemplate(c *gin.Context) {
	ws := workspaceFromCtx(c)
	id := c.Param("id")
	if err := models.DeleteTemplate(ws.ID, id); err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": "failed to delete"})
		return
	}
	c.JSON(http.StatusOK, gin.H{"ok": true})
}
