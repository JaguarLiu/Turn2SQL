// Package ai 提供可抽換的 AI provider 介面。
//
// 設計原則：provider 只是薄薄一層轉接（把 Request 轉成各家 SDK 的呼叫），
// 所有功能邏輯（prompt、JSON schema、輸出驗證）都放在 ai/tasks，跟 provider 無關。
// 新增一家 AI 只需要多寫一個 adapter。
package ai

import (
	"context"
	"encoding/json"
	"net/http"
	"time"
)

// Provider 是所有 AI 廠商轉接層的共同介面。
type Provider interface {
	// Name 回傳 provider 名稱（claude / gemini / openai / mock）。
	Name() string
	// DefaultModel 回傳這個 provider 未指定模型時使用的模型。
	DefaultModel() string
	// GenerateJSON 送出 prompt，要求回傳符合 req.Schema 的 JSON。
	GenerateJSON(ctx context.Context, req Request) (*Response, error)
}

// Request 是與廠商無關的請求描述。
type Request struct {
	Model     string          // 空字串 = 用 provider 的 DefaultModel
	System    string          // system / instructions
	User      string          // 使用者訊息（已由呼叫端組好、遮蔽過）
	Schema    json.RawMessage // 共通子集 JSON Schema，見 schema.go
	MaxTokens int             // 0 = 用 DefaultMaxTokens
}

// Response 是各家回應正規化後的結果。
type Response struct {
	JSON     json.RawMessage
	Model    string // 實際使用的模型
	Usage    Usage
	Provider string
}

// Usage 是正規化後的 token 用量。
type Usage struct {
	InputTokens    int
	OutputTokens   int
	ThinkingTokens int // 部分廠商將思考 token 分開計算；沒有的填 0
}

// Config 是建立 provider 所需的設定。
type Config struct {
	APIKey  string
	Model   string        // 預設模型；空字串時各 adapter 自行決定
	BaseURL string        // 測試或自架 proxy 用；空字串 = 官方端點
	Timeout time.Duration // 0 = DefaultTimeout

	// Gemini 走 Vertex AI 時使用；兩者皆有值時改用 Vertex 後端。
	Project  string
	Location string

	// HTTPClient 供測試注入；nil 時各 SDK 用自己的預設 client。
	HTTPClient *http.Client
}

const (
	// DefaultMaxTokens 是單次回應的 token 上限。
	// 規則類輸出不會太長，這個值足夠，也避免失控的花費。
	DefaultMaxTokens = 8192
	// DefaultTimeout 是單次 AI 請求的逾時。
	DefaultTimeout = 60 * time.Second
)

func (c Config) timeout() time.Duration {
	if c.Timeout > 0 {
		return c.Timeout
	}
	return DefaultTimeout
}

func maxTokens(n int) int {
	if n > 0 {
		return n
	}
	return DefaultMaxTokens
}
