package ai

import (
	"context"
	"encoding/json"
	"os"
	"path/filepath"
	"sync"
)

func init() { Register("mock", newMock) }

// mockProvider 回傳固定的 JSON，讓前端與整合測試不需要任何金鑰就能跑。
// 設定方式：AI_PROVIDER=mock，並用 AI_MOCK_DIR 指向放 <task>.json 的目錄。
type mockProvider struct {
	dir string

	mu       sync.Mutex
	response json.RawMessage // 由測試直接指定時優先使用
	err      error
	requests []Request
}

func newMock(cfg Config) (Provider, error) {
	dir := cfg.BaseURL // 沿用 BaseURL 欄位當作 fixture 目錄
	if dir == "" {
		dir = os.Getenv("AI_MOCK_DIR")
	}
	return &mockProvider{dir: dir}, nil
}

// NewMock 供測試使用：直接指定要回傳的 JSON 或錯誤。
func NewMock(response json.RawMessage, err error) *mockProvider {
	return &mockProvider{response: response, err: err}
}

func (p *mockProvider) Name() string         { return "mock" }
func (p *mockProvider) DefaultModel() string { return "mock-1" }

// Requests 回傳收到過的請求，供測試斷言 prompt 內容。
func (p *mockProvider) Requests() []Request {
	p.mu.Lock()
	defer p.mu.Unlock()
	return append([]Request(nil), p.requests...)
}

func (p *mockProvider) GenerateJSON(ctx context.Context, req Request) (*Response, error) {
	p.mu.Lock()
	p.requests = append(p.requests, req)
	fixed, err, dir := p.response, p.err, p.dir
	p.mu.Unlock()

	if err != nil {
		return nil, err
	}
	out := fixed
	if out == nil {
		if dir == "" {
			return nil, wrapErr("mock", ErrNotConfigured, "no fixture configured (set AI_MOCK_DIR)")
		}
		// fixture 檔名為 <model>.json；請求沒指定模型時用 DefaultModel
		raw, ferr := os.ReadFile(filepath.Join(dir, modelOr(req.Model, p.DefaultModel())+".json"))
		if ferr != nil {
			return nil, wrapErr("mock", ErrNotConfigured, ferr.Error())
		}
		out = raw
	}
	return &Response{
		JSON:     out,
		Model:    modelOr(req.Model, "mock-1"),
		Provider: "mock",
		Usage:    Usage{InputTokens: len(req.User) / 4, OutputTokens: len(out) / 4},
	}, nil
}
