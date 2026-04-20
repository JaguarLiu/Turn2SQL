package models

import (
	"crypto/rand"
	"database/sql"
	"encoding/hex"
	"errors"
	"time"
)

const SessionDuration = 30 * 24 * time.Hour // 30 days

type Session struct {
	ID        string
	UserID    int64
	ExpiresAt time.Time
}

var ErrSessionNotFound = errors.New("session not found or expired")

func randomToken(n int) (string, error) {
	b := make([]byte, n)
	if _, err := rand.Read(b); err != nil {
		return "", err
	}
	return hex.EncodeToString(b), nil
}

func CreateSession(userID int64) (*Session, error) {
	token, err := randomToken(32)
	if err != nil {
		return nil, err
	}
	expires := time.Now().Add(SessionDuration)
	_, err = DB.Exec(`INSERT INTO sessions (id, user_id, expires_at) VALUES (?, ?, ?)`, token, userID, expires)
	if err != nil {
		return nil, err
	}
	return &Session{ID: token, UserID: userID, ExpiresAt: expires}, nil
}

func GetSession(token string) (*Session, error) {
	row := DB.QueryRow(`SELECT id, user_id, expires_at FROM sessions WHERE id = ? AND expires_at > CURRENT_TIMESTAMP`, token)
	var s Session
	if err := row.Scan(&s.ID, &s.UserID, &s.ExpiresAt); err != nil {
		if errors.Is(err, sql.ErrNoRows) {
			return nil, ErrSessionNotFound
		}
		return nil, err
	}
	return &s, nil
}

func DeleteSession(token string) error {
	_, err := DB.Exec(`DELETE FROM sessions WHERE id = ?`, token)
	return err
}
