package models

import (
	"database/sql"
	"fmt"

	_ "modernc.org/sqlite"
)

var DB *sql.DB

const schema = `
CREATE TABLE IF NOT EXISTS users (
	id            INTEGER PRIMARY KEY AUTOINCREMENT,
	email         TEXT NOT NULL UNIQUE,
	password_hash TEXT NOT NULL,
	created_at    DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS workspaces (
	id            INTEGER PRIMARY KEY AUTOINCREMENT,
	owner_user_id INTEGER,
	sync_code     TEXT NOT NULL UNIQUE,
	created_at    DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
	FOREIGN KEY (owner_user_id) REFERENCES users(id) ON DELETE CASCADE
);
CREATE UNIQUE INDEX IF NOT EXISTS idx_workspaces_owner
	ON workspaces(owner_user_id)
	WHERE owner_user_id IS NOT NULL;

CREATE TABLE IF NOT EXISTS templates (
	id           TEXT PRIMARY KEY,
	workspace_id INTEGER NOT NULL,
	name         TEXT NOT NULL,
	data_json    TEXT NOT NULL,
	updated_at   DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
	FOREIGN KEY (workspace_id) REFERENCES workspaces(id) ON DELETE CASCADE
);
CREATE INDEX IF NOT EXISTS idx_templates_workspace ON templates(workspace_id);

CREATE TABLE IF NOT EXISTS sessions (
	id         TEXT PRIMARY KEY,
	user_id    INTEGER NOT NULL,
	created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
	expires_at DATETIME NOT NULL,
	FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
);
CREATE INDEX IF NOT EXISTS idx_sessions_user ON sessions(user_id);
`

// InitDB opens the SQLite database and runs schema migration.
func InitDB(path string) error {
	db, err := sql.Open("sqlite", path+"?_pragma=foreign_keys(1)&_pragma=journal_mode(WAL)")
	if err != nil {
		return fmt.Errorf("open sqlite: %w", err)
	}
	if _, err := db.Exec(schema); err != nil {
		return fmt.Errorf("migrate: %w", err)
	}
	DB = db
	return nil
}
