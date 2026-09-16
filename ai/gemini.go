package ai

import (
	"context"
	"encoding/json"
	"errors"
	"strings"

	"google.golang.org/genai"
)

// DefaultGeminiModel 是未指定模型時使用的 Gemini 模型。
// 各家模型更新很快，正式環境請用 AI_MODEL / AI_MODEL_GEMINI 指定。
const DefaultGeminiModel = "gemini-3.8-flash"

func init() { Register("gemini", newGemini) }

type geminiProvider struct {
	client *genai.Client
	model  string
}

// newGemini 同時支援 Gemini API（APIKey）與 Vertex AI（Project + Location）。
func newGemini(cfg Config) (Provider, error) {
	cc := &genai.ClientConfig{HTTPClient: cfg.HTTPClient}
	switch {
	case cfg.Project != "" && cfg.Location != "":
		cc.Backend = genai.BackendVertexAI
		cc.Project = cfg.Project
		cc.Location = cfg.Location
	case cfg.APIKey != "":
		cc.Backend = genai.BackendGeminiAPI
		cc.APIKey = cfg.APIKey
	default:
		return nil, wrapErr("gemini", ErrNotConfigured, "need GEMINI_API_KEY or GOOGLE_CLOUD_PROJECT + GOOGLE_CLOUD_LOCATION")
	}
	if cfg.BaseURL != "" {
		cc.HTTPOptions.BaseURL = cfg.BaseURL
	}
	client, err := genai.NewClient(context.Background(), cc)
	if err != nil {
		return nil, wrapErr("gemini", ErrNotConfigured, err.Error())
	}
	return &geminiProvider{client: client, model: modelOr(cfg.Model, DefaultGeminiModel)}, nil
}

func (p *geminiProvider) Name() string         { return "gemini" }
func (p *geminiProvider) DefaultModel() string { return p.model }

func (p *geminiProvider) GenerateJSON(ctx context.Context, req Request) (*Response, error) {
	var schema any
	if err := json.Unmarshal(req.Schema, &schema); err != nil {
		return nil, wrapErr("gemini", ErrInvalidOutput, err.Error())
	}
	model := modelOr(req.Model, p.model)

	resp, err := p.client.Models.GenerateContent(ctx, model, genai.Text(req.User), &genai.GenerateContentConfig{
		SystemInstruction:  &genai.Content{Parts: []*genai.Part{{Text: req.System}}},
		ResponseMIMEType:   "application/json",
		ResponseJsonSchema: schema,
		MaxOutputTokens:    int32(maxTokens(req.MaxTokens)),
	})
	if err != nil {
		return nil, p.classify(err)
	}

	out := strings.TrimSpace(resp.Text())
	if out == "" {
		return nil, wrapErr("gemini", ErrInvalidOutput, "empty response")
	}

	var usage Usage
	if u := resp.UsageMetadata; u != nil {
		usage = Usage{
			InputTokens:    int(u.PromptTokenCount),
			OutputTokens:   int(u.CandidatesTokenCount),
			ThinkingTokens: int(u.ThoughtsTokenCount),
		}
	}
	return &Response{JSON: json.RawMessage(out), Model: model, Provider: "gemini", Usage: usage}, nil
}

func (p *geminiProvider) classify(err error) error {
	if kind, ok := classifyCtx(err); ok {
		return wrapErr("gemini", kind, err.Error())
	}
	var apiErr genai.APIError
	if errors.As(err, &apiErr) {
		// Gemini 對無效金鑰回 400 而非 401，訊息裡才看得出是認證問題
		if apiErr.Code == 400 && strings.Contains(strings.ToUpper(apiErr.Message), "API KEY") {
			return wrapErr("gemini", ErrAuth, apiErr.Message)
		}
		return wrapErr("gemini", classifyStatus(apiErr.Code), apiErr.Message)
	}
	return wrapErr("gemini", ErrUnavailable, err.Error())
}
