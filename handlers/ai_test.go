package handlers

import (
	"encoding/json"
	"net/http"
	"net/http/httptest"
	"strings"
	"testing"

	"turn2sql/ai"

	"github.com/gin-gonic/gin"
)

func init() { gin.SetMode(gin.TestMode) }

func newTestRouter(h *AIHandler) *gin.Engine {
	r := gin.New()
	r.GET("/api/ai/providers", h.ListProviders)
	r.POST("/api/ai/schema", h.SuggestSchema)
	r.POST("/api/ai/clean-rules", h.SuggestCleanRules)
	return r
}

const schemaBody = `{"tableName":"orders","dialect":"mysql","rowCount":2,
  "columns":[{"name":"訂單日期","samples":["113/05/01"],"stats":{"total":2,"nonEmpty":2,"distinct":2,"maxLen":9,"maxDecimal":0}}]}`

func TestSuggestSchema(t *testing.T) {
	out := `{"tableName":"orders","columns":[{"original":"訂單日期","name":"order_date","type":"DATE",
	         "length":null,"precision":null,"scale":null,"nullable":false,"primaryKey":false,
	         "comment":"訂單日期","reason":"民國年日期"}]}`
	mock := ai.NewMock(json.RawMessage(out), nil)
	r := newTestRouter(&AIHandler{Default: mock})

	w := httptest.NewRecorder()
	req, _ := http.NewRequest("POST", "/api/ai/schema", strings.NewReader(schemaBody))
	req.Header.Set("Content-Type", "application/json")
	r.ServeHTTP(w, req)

	if w.Code != http.StatusOK {
		t.Fatalf("status = %d, body = %s", w.Code, w.Body.String())
	}
	var resp struct {
		Provider string `json:"provider"`
		Result   struct {
			Columns []struct {
				Name string `json:"name"`
				Type string `json:"type"`
			} `json:"columns"`
		} `json:"result"`
		Usage map[string]any `json:"usage"`
	}
	if err := json.Unmarshal(w.Body.Bytes(), &resp); err != nil {
		t.Fatal(err)
	}
	if resp.Provider != "mock" || len(resp.Result.Columns) != 1 || resp.Result.Columns[0].Name != "order_date" {
		t.Fatalf("unexpected response: %s", w.Body.String())
	}
	if resp.Usage == nil {
		t.Fatal("usage missing")
	}
	// 送出的 prompt 必須包含欄位資料
	if reqs := mock.Requests(); len(reqs) != 1 || !strings.Contains(reqs[0].User, "訂單日期") {
		t.Fatalf("prompt not built from input: %+v", reqs)
	}
}

func TestSuggestSchemaBadBody(t *testing.T) {
	r := newTestRouter(&AIHandler{Default: ai.NewMock(json.RawMessage(`{}`), nil)})
	for _, body := range []string{`not json`, `{"columns":[]}`} {
		w := httptest.NewRecorder()
		req, _ := http.NewRequest("POST", "/api/ai/schema", strings.NewReader(body))
		req.Header.Set("Content-Type", "application/json")
		r.ServeHTTP(w, req)
		if w.Code != http.StatusBadRequest {
			t.Fatalf("body %q: status = %d", body, w.Code)
		}
	}
}

// 沒有伺服器端 provider、也沒有自帶金鑰時要回 503，而不是 500。
func TestNoProviderConfigured(t *testing.T) {
	r := newTestRouter(&AIHandler{})
	w := httptest.NewRecorder()
	req, _ := http.NewRequest("POST", "/api/ai/schema", strings.NewReader(schemaBody))
	req.Header.Set("Content-Type", "application/json")
	r.ServeHTTP(w, req)
	if w.Code != http.StatusServiceUnavailable {
		t.Fatalf("status = %d, body = %s", w.Code, w.Body.String())
	}
}

// 自帶金鑰的請求即使伺服器沒設定 provider 也要能建立 provider。
func TestBYOKUsesUserKey(t *testing.T) {
	h := &AIHandler{}
	w := httptest.NewRecorder()
	req, _ := http.NewRequest("POST", "/api/ai/schema", strings.NewReader(schemaBody))
	req.Header.Set("Content-Type", "application/json")
	req.Header.Set(HeaderAIProvider, "claude")
	req.Header.Set(HeaderAIKey, "sk-test-not-a-real-key")
	newTestRouter(h).ServeHTTP(w, req)

	// 金鑰是假的，會打不到真的 API，但不該是「未設定」的 503
	if w.Code == http.StatusServiceUnavailable {
		t.Fatalf("BYOK request treated as unconfigured: %s", w.Body.String())
	}
	// 錯誤訊息不得外洩金鑰
	if strings.Contains(w.Body.String(), "sk-test-not-a-real-key") {
		t.Fatalf("response leaked the API key: %s", w.Body.String())
	}
}

func TestBYOKWithoutProviderName(t *testing.T) {
	r := newTestRouter(&AIHandler{})
	w := httptest.NewRecorder()
	req, _ := http.NewRequest("POST", "/api/ai/schema", strings.NewReader(schemaBody))
	req.Header.Set("Content-Type", "application/json")
	req.Header.Set(HeaderAIKey, "k")
	r.ServeHTTP(w, req)
	if w.Code != http.StatusServiceUnavailable {
		t.Fatalf("status = %d", w.Code)
	}
}

func TestListProviders(t *testing.T) {
	r := newTestRouter(&AIHandler{Default: ai.NewMock(nil, nil)})
	w := httptest.NewRecorder()
	req, _ := http.NewRequest("GET", "/api/ai/providers", nil)
	r.ServeHTTP(w, req)
	if w.Code != http.StatusOK {
		t.Fatalf("status = %d", w.Code)
	}
	var resp struct {
		ServerDefault string            `json:"serverDefault"`
		Supported     []string          `json:"supported"`
		DefaultModels map[string]string `json:"defaultModels"`
	}
	if err := json.Unmarshal(w.Body.Bytes(), &resp); err != nil {
		t.Fatal(err)
	}
	if resp.ServerDefault != "mock" {
		t.Fatalf("serverDefault = %q", resp.ServerDefault)
	}
	for _, want := range []string{"claude", "gemini", "openai", "mock"} {
		if !contains(resp.Supported, want) {
			t.Fatalf("supported missing %s: %v", want, resp.Supported)
		}
	}
	if resp.DefaultModels["claude"] != ai.DefaultClaudeModel {
		t.Fatalf("defaultModels = %v", resp.DefaultModels)
	}
}

func contains(list []string, want string) bool {
	for _, v := range list {
		if v == want {
			return true
		}
	}
	return false
}

// 錯誤訊息要能區分「AI 回應格式錯」與「服務掛掉」。
func TestErrorMessages(t *testing.T) {
	cases := []struct {
		err  error
		want string
	}{
		{ai.ErrInvalidOutput, "AI 回應格式不正確，請重試"},
		{ai.ErrUnavailable, "AI 服務暫時無法使用，請稍後再試"},
		{ai.ErrAuth, "AI 金鑰無效"},
		{ai.ErrRateLimited, "AI 服務流量超限，請稍後再試"},
		{ai.ErrNotConfigured, "AI provider 未設定"},
	}
	for _, tc := range cases {
		if got := aiErrorMessage(tc.err); got != tc.want {
			t.Fatalf("%v: got %q, want %q", tc.err, got, tc.want)
		}
	}
}
