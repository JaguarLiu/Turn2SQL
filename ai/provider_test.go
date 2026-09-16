package ai

import (
	"context"
	"encoding/json"
	"errors"
	"io"
	"net/http"
	"net/http/httptest"
	"strings"
	"testing"
)

const testSchema = `{"type":"object","additionalProperties":false,"required":["ok"],"properties":{"ok":{"type":"boolean"}}}`

func testRequest() Request {
	return Request{System: "sys", User: "hello", Schema: json.RawMessage(testSchema)}
}

// 每家 adapter 都用假的 HTTP server 驗證：送出的請求帶了 schema，回應能正確解析。
func TestAdaptersHappyPath(t *testing.T) {
	cases := []struct {
		provider string
		body     string
		wantIn   int
		wantOut  int
	}{
		{
			provider: "claude",
			body: `{"id":"msg_1","type":"message","role":"assistant","model":"claude-opus-5",
			        "content":[{"type":"text","text":"{\"ok\":true}"}],"stop_reason":"end_turn",
			        "usage":{"input_tokens":11,"output_tokens":22}}`,
			wantIn: 11, wantOut: 22,
		},
		{
			provider: "gemini",
			body: `{"candidates":[{"content":{"role":"model","parts":[{"text":"{\"ok\":true}"}]}}],
			        "usageMetadata":{"promptTokenCount":11,"candidatesTokenCount":22,"thoughtsTokenCount":5}}`,
			wantIn: 11, wantOut: 22,
		},
		{
			provider: "openai",
			body: `{"id":"resp_1","object":"response","status":"completed","model":"gpt-5.1",
			        "output":[{"type":"message","role":"assistant","status":"completed",
			                   "content":[{"type":"output_text","text":"{\"ok\":true}","annotations":[]}]}],
			        "usage":{"input_tokens":11,"output_tokens":22,"total_tokens":33,
			                 "output_tokens_details":{"reasoning_tokens":5}}}`,
			wantIn: 11, wantOut: 22,
		},
	}

	for _, tc := range cases {
		t.Run(tc.provider, func(t *testing.T) {
			var gotBody string
			srv := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
				b, _ := io.ReadAll(r.Body)
				gotBody = string(b)
				w.Header().Set("Content-Type", "application/json")
				io.WriteString(w, tc.body)
			}))
			defer srv.Close()

			p, err := New(tc.provider, Config{APIKey: "test-key", BaseURL: srv.URL})
			if err != nil {
				t.Fatal(err)
			}
			resp, err := p.GenerateJSON(context.Background(), testRequest())
			if err != nil {
				t.Fatalf("GenerateJSON: %v", err)
			}
			if string(resp.JSON) != `{"ok":true}` {
				t.Fatalf("unexpected JSON: %s", resp.JSON)
			}
			if resp.Provider != tc.provider {
				t.Fatalf("provider = %s", resp.Provider)
			}
			if resp.Usage.InputTokens != tc.wantIn || resp.Usage.OutputTokens != tc.wantOut {
				t.Fatalf("usage = %+v", resp.Usage)
			}
			// 請求裡必須帶上 schema，否則 structured output 不會生效
			if !strings.Contains(gotBody, `"ok"`) {
				t.Fatalf("request body missing schema: %s", gotBody)
			}
		})
	}
}

func TestAdaptersErrorMapping(t *testing.T) {
	cases := []struct {
		status int
		want   error
	}{
		{http.StatusUnauthorized, ErrAuth},
		{http.StatusTooManyRequests, ErrRateLimited},
		{http.StatusInternalServerError, ErrUnavailable},
	}
	for _, provider := range []string{"claude", "gemini", "openai"} {
		for _, tc := range cases {
			t.Run(provider+"/"+http.StatusText(tc.status), func(t *testing.T) {
				srv := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
					w.Header().Set("Content-Type", "application/json")
					w.WriteHeader(tc.status)
					io.WriteString(w, `{"error":{"code":`+http.StatusText(tc.status)+`,"message":"boom","type":"error"}}`)
				}))
				defer srv.Close()

				p, err := New(provider, Config{APIKey: "test-key", BaseURL: srv.URL})
				if err != nil {
					t.Fatal(err)
				}
				_, err = p.GenerateJSON(context.Background(), testRequest())
				if !errors.Is(err, tc.want) {
					t.Fatalf("want %v, got %v", tc.want, err)
				}
			})
		}
	}
}

func TestClaudeRefusal(t *testing.T) {
	srv := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		w.Header().Set("Content-Type", "application/json")
		io.WriteString(w, `{"id":"msg_1","type":"message","role":"assistant","model":"claude-opus-5",
		                    "content":[],"stop_reason":"refusal","usage":{"input_tokens":1,"output_tokens":0}}`)
	}))
	defer srv.Close()

	p, _ := New("claude", Config{APIKey: "k", BaseURL: srv.URL})
	if _, err := p.GenerateJSON(context.Background(), testRequest()); !errors.Is(err, ErrRefused) {
		t.Fatalf("want ErrRefused, got %v", err)
	}
}

func TestNewUnknownProvider(t *testing.T) {
	if _, err := New("nope", Config{APIKey: "k"}); !errors.Is(err, ErrNotConfigured) {
		t.Fatalf("want ErrNotConfigured, got %v", err)
	}
}

func TestProvidersNeedCredentials(t *testing.T) {
	for _, name := range []string{"claude", "openai", "gemini"} {
		if _, err := New(name, Config{}); !errors.Is(err, ErrNotConfigured) {
			t.Fatalf("%s: want ErrNotConfigured, got %v", name, err)
		}
	}
}

func TestHTTPStatusMapping(t *testing.T) {
	cases := map[error]int{
		ErrAuth:          http.StatusUnauthorized,
		ErrRateLimited:   http.StatusTooManyRequests,
		ErrRefused:       http.StatusUnprocessableEntity,
		ErrInvalidOutput: http.StatusBadGateway,
		ErrTimeout:       http.StatusGatewayTimeout,
		ErrNotConfigured: http.StatusServiceUnavailable,
	}
	for err, want := range cases {
		if got := HTTPStatus(wrapErr("x", err, "")); got != want {
			t.Fatalf("%v: want %d, got %d", err, want, got)
		}
	}
}

// Gemini 對無效金鑰回 400，訊息裡才看得出是認證問題，要歸類成 ErrAuth。
func TestGeminiInvalidKeyIsAuthError(t *testing.T) {
	srv := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		w.Header().Set("Content-Type", "application/json")
		w.WriteHeader(http.StatusBadRequest)
		io.WriteString(w, `{"error":{"code":400,"message":"API key not valid. Please pass a valid API key.","status":"INVALID_ARGUMENT"}}`)
	}))
	defer srv.Close()

	p, _ := New("gemini", Config{APIKey: "bad", BaseURL: srv.URL})
	_, err := p.GenerateJSON(context.Background(), testRequest())
	if !errors.Is(err, ErrAuth) {
		t.Fatalf("want ErrAuth, got %v", err)
	}
}

// 其他 400 仍歸類成一般錯誤。
func TestGeminiOtherBadRequest(t *testing.T) {
	srv := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		w.Header().Set("Content-Type", "application/json")
		w.WriteHeader(http.StatusBadRequest)
		io.WriteString(w, `{"error":{"code":400,"message":"Invalid JSON payload","status":"INVALID_ARGUMENT"}}`)
	}))
	defer srv.Close()

	p, _ := New("gemini", Config{APIKey: "k", BaseURL: srv.URL})
	_, err := p.GenerateJSON(context.Background(), testRequest())
	if errors.Is(err, ErrAuth) {
		t.Fatalf("should not be ErrAuth: %v", err)
	}
	if !errors.Is(err, ErrUnavailable) {
		t.Fatalf("want ErrUnavailable, got %v", err)
	}
}
