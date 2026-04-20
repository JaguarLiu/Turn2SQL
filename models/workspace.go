package models

import (
	"crypto/rand"
	"database/sql"
	"encoding/base32"
	"encoding/json"
	"errors"
	"strings"
	"time"
)

type Workspace struct {
	ID          int64
	OwnerUserID *int64
	SyncCode    string
	CreatedAt   time.Time
}

type Template struct {
	ID          string          `json:"id"`
	WorkspaceID int64           `json:"-"`
	Name        string          `json:"name"`
	Data        json.RawMessage `json:"data"`
	UpdatedAt   time.Time       `json:"updatedAt"`
}

var (
	ErrWorkspaceNotFound = errors.New("workspace not found")
	ErrAlreadyClaimed    = errors.New("workspace already claimed by an account")
	ErrUserHasWorkspace  = errors.New("user already has a workspace")
	ErrStaleUpdate       = errors.New("template was updated elsewhere")
)

// genSyncCode produces a 10-char lowercase base32 code (50 bits entropy).
func genSyncCode() (string, error) {
	b := make([]byte, 7) // 56 bits → 12 base32 chars, trim to 10
	if _, err := rand.Read(b); err != nil {
		return "", err
	}
	enc := strings.ToLower(strings.TrimRight(base32.StdEncoding.EncodeToString(b), "="))
	if len(enc) > 10 {
		enc = enc[:10]
	}
	return enc, nil
}

// CreateAnonymousWorkspace makes a new workspace with no owner.
func CreateAnonymousWorkspace() (*Workspace, error) {
	for range 5 {
		code, err := genSyncCode()
		if err != nil {
			return nil, err
		}
		res, err := DB.Exec(`INSERT INTO workspaces (sync_code) VALUES (?)`, code)
		if err != nil {
			if strings.Contains(err.Error(), "UNIQUE") {
				continue
			}
			return nil, err
		}
		id, _ := res.LastInsertId()
		return &Workspace{ID: id, SyncCode: code, CreatedAt: time.Now()}, nil
	}
	return nil, errors.New("failed to generate unique sync code")
}

// GetOrCreateUserWorkspace returns the workspace owned by user, creating if absent.
func GetOrCreateUserWorkspace(userID int64) (*Workspace, error) {
	row := DB.QueryRow(`SELECT id, owner_user_id, sync_code, created_at FROM workspaces WHERE owner_user_id = ?`, userID)
	var w Workspace
	var owner sql.NullInt64
	err := row.Scan(&w.ID, &owner, &w.SyncCode, &w.CreatedAt)
	if err == nil {
		if owner.Valid {
			w.OwnerUserID = &owner.Int64
		}
		return &w, nil
	}
	if !errors.Is(err, sql.ErrNoRows) {
		return nil, err
	}
	// create
	for range 5 {
		code, err := genSyncCode()
		if err != nil {
			return nil, err
		}
		res, err := DB.Exec(`INSERT INTO workspaces (owner_user_id, sync_code) VALUES (?, ?)`, userID, code)
		if err != nil {
			if strings.Contains(err.Error(), "UNIQUE") {
				continue
			}
			return nil, err
		}
		id, _ := res.LastInsertId()
		return &Workspace{ID: id, OwnerUserID: &userID, SyncCode: code, CreatedAt: time.Now()}, nil
	}
	return nil, errors.New("failed to create workspace")
}

// GetWorkspaceBySyncCode looks up a workspace by code.
func GetWorkspaceBySyncCode(code string) (*Workspace, error) {
	code = strings.ToLower(strings.TrimSpace(code))
	row := DB.QueryRow(`SELECT id, owner_user_id, sync_code, created_at FROM workspaces WHERE sync_code = ?`, code)
	var w Workspace
	var owner sql.NullInt64
	if err := row.Scan(&w.ID, &owner, &w.SyncCode, &w.CreatedAt); err != nil {
		if errors.Is(err, sql.ErrNoRows) {
			return nil, ErrWorkspaceNotFound
		}
		return nil, err
	}
	if owner.Valid {
		w.OwnerUserID = &owner.Int64
	}
	return &w, nil
}

// ClaimWorkspace binds an anonymous workspace to a user.
// If user already has a workspace, their existing templates are merged in and the old workspace deleted.
func ClaimWorkspace(userID int64, syncCode string) (*Workspace, error) {
	target, err := GetWorkspaceBySyncCode(syncCode)
	if err != nil {
		return nil, err
	}
	if target.OwnerUserID != nil {
		if *target.OwnerUserID == userID {
			return target, nil
		}
		return nil, ErrAlreadyClaimed
	}

	tx, err := DB.Begin()
	if err != nil {
		return nil, err
	}
	defer tx.Rollback()

	// If user already has a workspace, move its templates into target, then delete old.
	var existingID int64
	err = tx.QueryRow(`SELECT id FROM workspaces WHERE owner_user_id = ?`, userID).Scan(&existingID)
	if err != nil && !errors.Is(err, sql.ErrNoRows) {
		return nil, err
	}
	if existingID != 0 {
		if _, err := tx.Exec(`UPDATE templates SET workspace_id = ? WHERE workspace_id = ?`, target.ID, existingID); err != nil {
			return nil, err
		}
		if _, err := tx.Exec(`DELETE FROM workspaces WHERE id = ?`, existingID); err != nil {
			return nil, err
		}
	}

	if _, err := tx.Exec(`UPDATE workspaces SET owner_user_id = ? WHERE id = ?`, userID, target.ID); err != nil {
		return nil, err
	}
	if err := tx.Commit(); err != nil {
		return nil, err
	}
	target.OwnerUserID = &userID
	return target, nil
}

// ListTemplates returns all templates for a workspace, newest first.
func ListTemplates(workspaceID int64) ([]Template, error) {
	rows, err := DB.Query(`SELECT id, workspace_id, name, data_json, updated_at FROM templates WHERE workspace_id = ? ORDER BY updated_at DESC`, workspaceID)
	if err != nil {
		return nil, err
	}
	defer rows.Close()
	out := []Template{}
	for rows.Next() {
		var t Template
		var data string
		if err := rows.Scan(&t.ID, &t.WorkspaceID, &t.Name, &data, &t.UpdatedAt); err != nil {
			return nil, err
		}
		t.Data = json.RawMessage(data)
		out = append(out, t)
	}
	return out, rows.Err()
}

// UpsertTemplate inserts or updates a template. Rejects write if client's updatedAt is older than stored.
func UpsertTemplate(workspaceID int64, id, name string, data json.RawMessage, clientUpdatedAt time.Time) (*Template, error) {
	var existingUpdated time.Time
	var existingWorkspace int64
	err := DB.QueryRow(`SELECT workspace_id, updated_at FROM templates WHERE id = ?`, id).Scan(&existingWorkspace, &existingUpdated)
	if err != nil && !errors.Is(err, sql.ErrNoRows) {
		return nil, err
	}
	if err == nil {
		if existingWorkspace != workspaceID {
			return nil, ErrWorkspaceNotFound
		}
		if clientUpdatedAt.Before(existingUpdated) {
			return nil, ErrStaleUpdate
		}
	}
	now := time.Now().UTC()
	if clientUpdatedAt.IsZero() || clientUpdatedAt.After(now) {
		clientUpdatedAt = now
	}
	_, err = DB.Exec(`
		INSERT INTO templates (id, workspace_id, name, data_json, updated_at) VALUES (?, ?, ?, ?, ?)
		ON CONFLICT(id) DO UPDATE SET name = excluded.name, data_json = excluded.data_json, updated_at = excluded.updated_at
	`, id, workspaceID, name, string(data), clientUpdatedAt)
	if err != nil {
		return nil, err
	}
	return &Template{ID: id, WorkspaceID: workspaceID, Name: name, Data: data, UpdatedAt: clientUpdatedAt}, nil
}

func DeleteTemplate(workspaceID int64, id string) error {
	_, err := DB.Exec(`DELETE FROM templates WHERE id = ? AND workspace_id = ?`, id, workspaceID)
	return err
}
