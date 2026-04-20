package models

import (
	"database/sql"
	"errors"
	"strings"
	"time"

	"golang.org/x/crypto/bcrypt"
)

type User struct {
	ID        int64
	Email     string
	CreatedAt time.Time
}

var (
	ErrEmailTaken    = errors.New("email already registered")
	ErrInvalidCred   = errors.New("invalid email or password")
	ErrUserNotFound  = errors.New("user not found")
	ErrWeakPassword  = errors.New("password must be at least 8 characters")
	ErrInvalidEmail  = errors.New("invalid email")
)

func CreateUser(email, password string) (*User, error) {
	email = strings.TrimSpace(strings.ToLower(email))
	if !strings.Contains(email, "@") || len(email) < 3 {
		return nil, ErrInvalidEmail
	}
	if len(password) < 8 {
		return nil, ErrWeakPassword
	}
	hash, err := bcrypt.GenerateFromPassword([]byte(password), bcrypt.DefaultCost)
	if err != nil {
		return nil, err
	}
	res, err := DB.Exec(`INSERT INTO users (email, password_hash) VALUES (?, ?)`, email, string(hash))
	if err != nil {
		if strings.Contains(err.Error(), "UNIQUE") {
			return nil, ErrEmailTaken
		}
		return nil, err
	}
	id, _ := res.LastInsertId()
	return &User{ID: id, Email: email, CreatedAt: time.Now()}, nil
}

func AuthenticateUser(email, password string) (*User, error) {
	email = strings.TrimSpace(strings.ToLower(email))
	row := DB.QueryRow(`SELECT id, email, password_hash, created_at FROM users WHERE email = ?`, email)
	var u User
	var hash string
	if err := row.Scan(&u.ID, &u.Email, &hash, &u.CreatedAt); err != nil {
		if errors.Is(err, sql.ErrNoRows) {
			return nil, ErrInvalidCred
		}
		return nil, err
	}
	if err := bcrypt.CompareHashAndPassword([]byte(hash), []byte(password)); err != nil {
		return nil, ErrInvalidCred
	}
	return &u, nil
}

func GetUserByID(id int64) (*User, error) {
	row := DB.QueryRow(`SELECT id, email, created_at FROM users WHERE id = ?`, id)
	var u User
	if err := row.Scan(&u.ID, &u.Email, &u.CreatedAt); err != nil {
		if errors.Is(err, sql.ErrNoRows) {
			return nil, ErrUserNotFound
		}
		return nil, err
	}
	return &u, nil
}
