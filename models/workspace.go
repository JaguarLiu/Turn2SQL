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
	ID        int64
	SyncCode  string
	CreatedAt time.Time
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

// CreateAnonymousWorkspace makes a new workspace.
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

// GetWorkspaceBySyncCode looks up a workspace by code.
func GetWorkspaceBySyncCode(code string) (*Workspace, error) {
	code = strings.ToLower(strings.TrimSpace(code))
	row := DB.QueryRow(`SELECT id, sync_code, created_at FROM workspaces WHERE sync_code = ?`, code)
	var w Workspace
	if err := row.Scan(&w.ID, &w.SyncCode, &w.CreatedAt); err != nil {
		if errors.Is(err, sql.ErrNoRows) {
			return nil, ErrWorkspaceNotFound
		}
		return nil, err
	}
	return &w, nil
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
// 讀取檢查與寫入在同一個 transaction 內（DSN 設 _txlock=immediate，一開始就拿寫鎖），並發寫入會排隊而不會互相覆蓋。
func UpsertTemplate(workspaceID int64, id, name string, data json.RawMessage, clientUpdatedAt time.Time) (*Template, error) {
	tx, err := DB.Begin()
	if err != nil {
		return nil, err
	}
	defer tx.Rollback()

	var existingUpdated time.Time
	var existingWorkspace int64
	err = tx.QueryRow(`SELECT workspace_id, updated_at FROM templates WHERE id = ?`, id).Scan(&existingWorkspace, &existingUpdated)
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
	// DO UPDATE 帶 workspace 條件：就算 id 已屬於別的 workspace 也不會被覆蓋
	res, err := tx.Exec(`
		INSERT INTO templates (id, workspace_id, name, data_json, updated_at) VALUES (?, ?, ?, ?, ?)
		ON CONFLICT(id) DO UPDATE SET name = excluded.name, data_json = excluded.data_json, updated_at = excluded.updated_at
		WHERE templates.workspace_id = excluded.workspace_id
	`, id, workspaceID, name, string(data), clientUpdatedAt)
	if err != nil {
		return nil, err
	}
	if n, err := res.RowsAffected(); err != nil {
		return nil, err
	} else if n == 0 {
		return nil, ErrWorkspaceNotFound
	}
	if err := tx.Commit(); err != nil {
		return nil, err
	}
	return &Template{ID: id, WorkspaceID: workspaceID, Name: name, Data: data, UpdatedAt: clientUpdatedAt}, nil
}

func DeleteTemplate(workspaceID int64, id string) error {
	_, err := DB.Exec(`DELETE FROM templates WHERE id = ? AND workspace_id = ?`, id, workspaceID)
	return err
}
