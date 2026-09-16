package ai

import (
	"context"
	"encoding/json"
	"errors"
	"strings"

	"github.com/anthropics/anthropic-sdk-go"
	"github.com/anthropics/anthropic-sdk-go/option"
)

// DefaultClaudeModel 是未指定模型時使用的 Claude 模型。
const DefaultClaudeModel = "claude-opus-5"

func init() { Register("claude", newClaude) }

type claudeProvider struct {
	client anthropic.Client
	model  string
}

func newClaude(cfg Config) (Provider, error) {
	if cfg.APIKey == "" {
		return nil, wrapErr("claude", ErrNotConfigured, "ANTHROPIC_API_KEY is empty")
	}
	opts := []option.RequestOption{
		option.WithAPIKey(cfg.APIKey),
		option.WithRequestTimeout(cfg.timeout()),
	}
	if cfg.BaseURL != "" {
		opts = append(opts, option.WithBaseURL(cfg.BaseURL))
	}
	if cfg.HTTPClient != nil {
		opts = append(opts, option.WithHTTPClient(cfg.HTTPClient))
	}
	return &claudeProvider{
		client: anthropic.NewClient(opts...),
		model:  modelOr(cfg.Model, DefaultClaudeModel),
	}, nil
}

func (p *claudeProvider) Name() string         { return "claude" }
func (p *claudeProvider) DefaultModel() string { return p.model }

func (p *claudeProvider) GenerateJSON(ctx context.Context, req Request) (*Response, error) {
	schema, err := schemaMap(req.Schema)
	if err != nil {
		return nil, wrapErr("claude", ErrInvalidOutput, err.Error())
	}
	model := modelOr(req.Model, p.model)

	msg, err := p.client.Messages.New(ctx, anthropic.MessageNewParams{
		Model:     anthropic.Model(model),
		MaxTokens: int64(maxTokens(req.MaxTokens)),
		System:    []anthropic.TextBlockParam{{Text: req.System}},
		Messages: []anthropic.MessageParam{
			anthropic.NewUserMessage(anthropic.NewTextBlock(req.User)),
		},
		// structured outputs：直接指定輸出必須符合的 JSON schema
		OutputConfig: anthropic.OutputConfigParam{
			Format: anthropic.JSONOutputFormatParam{Schema: schema},
		},
	})
	if err != nil {
		return nil, p.classify(err)
	}
	if msg.StopReason == anthropic.StopReasonRefusal {
		return nil, wrapErr("claude", ErrRefused, "model refused the request")
	}

	var sb strings.Builder
	for _, block := range msg.Content {
		if t, ok := block.AsAny().(anthropic.TextBlock); ok {
			sb.WriteString(t.Text)
		}
	}
	out := strings.TrimSpace(sb.String())
	if out == "" {
		return nil, wrapErr("claude", ErrInvalidOutput, "empty response")
	}

	return &Response{
		JSON:     json.RawMessage(out),
		Model:    model,
		Provider: "claude",
		Usage: Usage{
			InputTokens:  int(msg.Usage.InputTokens),
			OutputTokens: int(msg.Usage.OutputTokens),
		},
	}, nil
}

func (p *claudeProvider) classify(err error) error {
	if kind, ok := classifyCtx(err); ok {
		return wrapErr("claude", kind, err.Error())
	}
	var apiErr *anthropic.Error
	if errors.As(err, &apiErr) {
		return wrapErr("claude", classifyStatus(apiErr.StatusCode), apiErr.Error())
	}
	return wrapErr("claude", ErrUnavailable, err.Error())
}
