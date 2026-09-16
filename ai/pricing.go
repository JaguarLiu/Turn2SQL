package ai

import (
	"encoding/json"
	"os"
	"strings"
)

// Price 是每百萬 token 的美金單價。
type Price struct {
	Input  float64 `json:"input"`
	Output float64 `json:"output"`
}

// 內建單價表。各家調價頻繁，正式環境請用 AI_PRICING_FILE 覆寫，
// 這裡只用來在 log 中粗估花費，不是計費依據。
var defaultPricing = map[string]Price{
	"claude-opus-5":    {Input: 5, Output: 25},
	"claude-sonnet-5":  {Input: 2, Output: 10},
	"claude-haiku-4-5": {Input: 1, Output: 5},
}

var pricing = loadPricing()

func loadPricing() map[string]Price {
	out := map[string]Price{}
	for k, v := range defaultPricing {
		out[k] = v
	}
	path := os.Getenv("AI_PRICING_FILE")
	if path == "" {
		return out
	}
	raw, err := os.ReadFile(path)
	if err != nil {
		return out
	}
	var override map[string]Price
	if err := json.Unmarshal(raw, &override); err != nil {
		return out
	}
	for k, v := range override {
		out[strings.ToLower(k)] = v
	}
	return out
}

// EstimateCostUSD 粗估單次請求的花費；沒有單價資料時回傳 0。
// 思考 token 依各家慣例併入輸出計價。
func EstimateCostUSD(model string, u Usage) float64 {
	p, ok := pricing[strings.ToLower(model)]
	if !ok {
		return 0
	}
	in := float64(u.InputTokens) / 1_000_000 * p.Input
	out := float64(u.OutputTokens+u.ThinkingTokens) / 1_000_000 * p.Output
	return in + out
}
