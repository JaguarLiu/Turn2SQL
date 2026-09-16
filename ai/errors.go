package ai

import (
	"context"
	"errors"
	"fmt"
	"net/http"
)

// 各家 SDK 的錯誤都轉成這幾種，handler 據此對應 HTTP 狀態碼。
var (
	ErrAuth          = errors.New("ai: invalid credentials")
	ErrRateLimited   = errors.New("ai: rate limited")
	ErrRefused       = errors.New("ai: request refused by model")
	ErrInvalidOutput = errors.New("ai: output failed validation")
	ErrTimeout       = errors.New("ai: timeout")
	ErrUnavailable   = errors.New("ai: provider unavailable")
	ErrNotConfigured = errors.New("ai: provider not configured")
)

// Error 保留原始錯誤訊息，同時帶上正規化後的分類。
type Error struct {
	Kind     error // 上面其中一個 sentinel
	Provider string
	Detail   string
}

func (e *Error) Error() string {
	if e.Detail == "" {
		return fmt.Sprintf("%s: %v", e.Provider, e.Kind)
	}
	return fmt.Sprintf("%s: %v: %s", e.Provider, e.Kind, e.Detail)
}

func (e *Error) Unwrap() error { return e.Kind }

func wrapErr(provider string, kind error, detail string) error {
	return &Error{Kind: kind, Provider: provider, Detail: detail}
}

// classifyStatus 依 HTTP 狀態碼歸類錯誤，三家 adapter 共用。
func classifyStatus(code int) error {
	switch {
	case code == http.StatusUnauthorized || code == http.StatusForbidden:
		return ErrAuth
	case code == http.StatusTooManyRequests:
		return ErrRateLimited
	case code == http.StatusRequestTimeout || code == http.StatusGatewayTimeout:
		return ErrTimeout
	case code >= 500:
		return ErrUnavailable
	default:
		return ErrUnavailable
	}
}

// classifyCtx 把 context 逾時／取消轉成 ErrTimeout。
func classifyCtx(err error) (error, bool) {
	if errors.Is(err, context.DeadlineExceeded) || errors.Is(err, context.Canceled) {
		return ErrTimeout, true
	}
	return nil, false
}

// HTTPStatus 把正規化錯誤對應成 HTTP 狀態碼，給 handler 用。
func HTTPStatus(err error) int {
	switch {
	case errors.Is(err, ErrAuth):
		return http.StatusUnauthorized
	case errors.Is(err, ErrRateLimited):
		return http.StatusTooManyRequests
	case errors.Is(err, ErrRefused):
		return http.StatusUnprocessableEntity
	case errors.Is(err, ErrInvalidOutput):
		return http.StatusBadGateway
	case errors.Is(err, ErrTimeout):
		return http.StatusGatewayTimeout
	case errors.Is(err, ErrNotConfigured):
		return http.StatusServiceUnavailable
	default:
		return http.StatusBadGateway
	}
}
