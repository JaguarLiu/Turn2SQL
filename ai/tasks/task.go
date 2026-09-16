// Package tasks 放各功能的 prompt、JSON schema 與輸出驗證。
// 這一層跟 provider 無關：換 AI 廠商時這裡完全不用改，
// 比較不同廠商品質時，變數也只剩模型本身。
package tasks

import (
	"context"
	"encoding/json"
	"fmt"

	"turn2sql/ai"
)

// Task 是一個 AI 功能（建表建議、清洗規則…）。
type Task struct {
	Name      string          // 也用於 AI_MODEL_<NAME> 指定模型
	System    string          // system prompt
	Schema    json.RawMessage // 共通子集 JSON Schema
	MaxTokens int

	validator *ai.Validator
}

// New 建立 Task，並在啟動階段就驗證 schema 本身是否符合共通子集。
func New(name, system string, schema json.RawMessage, maxTokens int) (*Task, error) {
	if err := ai.CheckSubset(schema); err != nil {
		return nil, fmt.Errorf("task %s: %w", name, err)
	}
	v, err := ai.NewValidator(schema)
	if err != nil {
		return nil, fmt.Errorf("task %s: %w", name, err)
	}
	return &Task{Name: name, System: system, Schema: schema, MaxTokens: maxTokens, validator: v}, nil
}

// Result 是一次任務執行的結果。
type Result struct {
	JSON     json.RawMessage
	Provider string
	Model    string
	Usage    ai.Usage
	CostUSD  float64
	Retried  bool
}

// Run 執行任務：組 prompt → 呼叫 provider → 驗證輸出。
// 輸出不符 schema 時，把錯誤訊息回饋給模型重試一次；再失敗回 ErrInvalidOutput。
func (t *Task) Run(ctx context.Context, p ai.Provider, userPrompt string) (*Result, error) {
	req := ai.Request{
		Model:     ai.ModelForTask(t.Name),
		System:    t.System,
		User:      userPrompt,
		Schema:    t.Schema,
		MaxTokens: t.MaxTokens,
	}

	resp, err := p.GenerateJSON(ctx, req)
	var verr error
	if err == nil {
		verr = t.validator.Validate(resp.JSON)
		if verr == nil {
			return t.result(resp, false), nil
		}
	}
	if err != nil && !isRetryable(err) {
		return nil, err
	}

	// 重試一次：驗證失敗時附上錯誤訊息，讓模型知道哪裡不符
	retry := req
	if verr != nil {
		retry.User = userPrompt + "\n\n上一次的輸出不符合 JSON schema：" + verr.Error() + "\n請重新輸出符合 schema 的 JSON。"
	}
	resp2, err2 := p.GenerateJSON(ctx, retry)
	if err2 != nil {
		return nil, err2
	}
	if err := t.validator.Validate(resp2.JSON); err != nil {
		return nil, err
	}
	return t.result(resp2, true), nil
}

func (t *Task) result(resp *ai.Response, retried bool) *Result {
	return &Result{
		JSON:     resp.JSON,
		Provider: resp.Provider,
		Model:    resp.Model,
		Usage:    resp.Usage,
		CostUSD:  ai.EstimateCostUSD(resp.Model, resp.Usage),
		Retried:  retried,
	}
}

// isRetryable：暫時性錯誤才值得重試，認證錯誤或被拒絕重試也沒用。
func isRetryable(err error) bool {
	switch {
	case errorsIs(err, ai.ErrRateLimited), errorsIs(err, ai.ErrUnavailable):
		return true
	default:
		return false
	}
}
