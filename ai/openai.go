package ai

import (
	"context"
	"encoding/json"
	"errors"
	"strings"

	"github.com/openai/openai-go/v3"
	"github.com/openai/openai-go/v3/option"
	"github.com/openai/openai-go/v3/responses"
	"github.com/openai/openai-go/v3/shared"
)

// DefaultOpenAIModel 是未指定模型時使用的 OpenAI 模型。
// 「Codex」在 API 上就是 OpenAI 的模型之一，用 AI_MODEL / AI_MODEL_OPENAI 指定即可，
// 不需要另外寫一個 adapter。
const DefaultOpenAIModel = "gpt-5.1"

func init() { Register("openai", newOpenAI) }

type openaiProvider struct {
	client openai.Client
	model  string
}

func newOpenAI(cfg Config) (Provider, error) {
	if cfg.APIKey == "" {
		return nil, wrapErr("openai", ErrNotConfigured, "OPENAI_API_KEY is empty")
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
	return &openaiProvider{
		client: openai.NewClient(opts...),
		model:  modelOr(cfg.Model, DefaultOpenAIModel),
	}, nil
}

func (p *openaiProvider) Name() string         { return "openai" }
func (p *openaiProvider) DefaultModel() string { return p.model }

func (p *openaiProvider) GenerateJSON(ctx context.Context, req Request) (*Response, error) {
	schema, err := schemaMap(req.Schema)
	if err != nil {
		return nil, wrapErr("openai", ErrInvalidOutput, err.Error())
	}
	model := modelOr(req.Model, p.model)

	format := responses.ResponseFormatTextConfigParamOfJSONSchema("turn2sql_result", schema)
	if format.OfJSONSchema != nil {
		format.OfJSONSchema.Strict = openai.Bool(true)
	}

	resp, err := p.client.Responses.New(ctx, responses.ResponseNewParams{
		Model:           shared.ResponsesModel(model),
		Instructions:    openai.String(req.System),
		Input:           responses.ResponseNewParamsInputUnion{OfString: openai.String(req.User)},
		MaxOutputTokens: openai.Int(int64(maxTokens(req.MaxTokens))),
		Text:            responses.ResponseTextConfigParam{Format: format},
	})
	if err != nil {
		return nil, p.classify(err)
	}

	out := strings.TrimSpace(resp.OutputText())
	if out == "" {
		// 被安全政策擋下或超出 token 上限時，OutputText 會是空的
		if resp.Status == responses.ResponseStatusIncomplete {
			return nil, wrapErr("openai", ErrInvalidOutput, "response incomplete: "+string(resp.IncompleteDetails.Reason))
		}
		return nil, wrapErr("openai", ErrRefused, "empty response")
	}

	return &Response{
		JSON:     json.RawMessage(out),
		Model:    model,
		Provider: "openai",
		Usage: Usage{
			InputTokens:    int(resp.Usage.InputTokens),
			OutputTokens:   int(resp.Usage.OutputTokens),
			ThinkingTokens: int(resp.Usage.OutputTokensDetails.ReasoningTokens),
		},
	}, nil
}

func (p *openaiProvider) classify(err error) error {
	if kind, ok := classifyCtx(err); ok {
		return wrapErr("openai", kind, err.Error())
	}
	var apiErr *openai.Error
	if errors.As(err, &apiErr) {
		return wrapErr("openai", classifyStatus(apiErr.StatusCode), apiErr.Error())
	}
	return wrapErr("openai", ErrUnavailable, err.Error())
}
