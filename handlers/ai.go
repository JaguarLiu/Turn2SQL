package handlers

import (
	"encoding/json"
	"errors"
	"log"
	"net/http"

	"turn2sql/ai"
	"turn2sql/ai/tasks"

	"github.com/gin-gonic/gin"
)

// BYOK：使用者自帶金鑰時用 header 傳遞，絕不放在 URL，也不寫入 DB 或 log。
const (
	HeaderAIProvider = "X-AI-Provider"
	HeaderAIModel    = "X-AI-Model"
	HeaderAIKey      = "X-AI-Key"
)

// AIHandler 持有伺服器端預設 provider（可能為 nil，代表只開放自帶金鑰）。
type AIHandler struct {
	Default  ai.Provider
	Fallback ai.Provider
}

// NewAIHandler 依環境變數建立 handler。伺服器沒設定 AI_PROVIDER 也能運作，
// 此時只有自帶金鑰的請求會成功。
func NewAIHandler() *AIHandler {
	h := &AIHandler{Fallback: ai.FallbackProvider()}
	p, err := ai.DefaultProvider()
	if err != nil {
		log.Printf("AI: 伺服器端 provider 未啟用 (%v)，僅接受自帶金鑰的請求", err)
		return h
	}
	h.Default = p
	log.Printf("AI: 預設 provider=%s model=%s", p.Name(), p.DefaultModel())
	return h
}

// ListProviders 讓前端知道有哪些 provider 可用。
func (h *AIHandler) ListProviders(c *gin.Context) {
	var serverDefault, serverModel string
	if h.Default != nil {
		serverDefault = h.Default.Name()
		serverModel = h.Default.DefaultModel()
	}
	c.JSON(http.StatusOK, gin.H{
		"serverDefault": serverDefault,
		"serverModel":   serverModel,
		"serverEnabled": ai.Available(), // 伺服器端已備妥金鑰的
		"supported":     ai.Registered(),
		"defaultModels": gin.H{
			"claude": ai.DefaultClaudeModel,
			"gemini": ai.DefaultGeminiModel,
			"openai": ai.DefaultOpenAIModel,
		},
	})
}

// providerFor 決定這次請求要用哪個 provider：
// 帶了 X-AI-Key 就用使用者的金鑰臨時建立（用完即丟），否則用伺服器預設。
func (h *AIHandler) providerFor(c *gin.Context) (ai.Provider, error) {
	key := c.GetHeader(HeaderAIKey)
	name := c.GetHeader(HeaderAIProvider)
	if key != "" {
		if name == "" {
			return nil, ai.ErrNotConfigured
		}
		cfg := ai.Config{APIKey: key, Model: c.GetHeader(HeaderAIModel)}
		return ai.New(name, cfg)
	}
	if h.Default == nil {
		return nil, ai.ErrNotConfigured
	}
	return h.Default, nil
}

// SuggestSchema 智慧建表：POST /api/ai/schema
func (h *AIHandler) SuggestSchema(c *gin.Context) {
	var in tasks.SchemaInput
	if err := c.ShouldBindJSON(&in); err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": "invalid body"})
		return
	}
	prompt, err := tasks.SchemaPrompt(in)
	if err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": err.Error()})
		return
	}
	h.run(c, tasks.SchemaSuggest, prompt)
}

// SuggestCleanRules 清洗規則：POST /api/ai/clean-rules
func (h *AIHandler) SuggestCleanRules(c *gin.Context) {
	var in tasks.CleanInput
	if err := c.ShouldBindJSON(&in); err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": "invalid body"})
		return
	}
	prompt, err := tasks.CleanPrompt(in)
	if err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": err.Error()})
		return
	}
	h.run(c, tasks.CleanRules, prompt)
}

// run 執行任務，必要時切換備援 provider，並把結果與用量回傳。
func (h *AIHandler) run(c *gin.Context, task *tasks.Task, prompt string) {
	p, err := h.providerFor(c)
	if err != nil {
		c.JSON(ai.HTTPStatus(err), gin.H{"error": "AI provider 未設定"})
		return
	}

	res, err := task.Run(c.Request.Context(), p, prompt)
	if err != nil && h.Fallback != nil && p == h.Default {
		log.Printf("AI: %s 失敗 (%v)，改用備援 %s", p.Name(), err, h.Fallback.Name())
		res, err = task.Run(c.Request.Context(), h.Fallback, prompt)
	}
	if err != nil {
		// 錯誤訊息不外洩金鑰或內部細節
		c.JSON(ai.HTTPStatus(err), gin.H{"error": aiErrorMessage(err)})
		return
	}

	log.Printf("AI: task=%s provider=%s model=%s in=%d out=%d think=%d cost=$%.4f retried=%v",
		task.Name, res.Provider, res.Model,
		res.Usage.InputTokens, res.Usage.OutputTokens, res.Usage.ThinkingTokens,
		res.CostUSD, res.Retried)

	c.JSON(http.StatusOK, gin.H{
		"result":   json.RawMessage(res.JSON),
		"provider": res.Provider,
		"model":    res.Model,
		"usage": gin.H{
			"inputTokens":    res.Usage.InputTokens,
			"outputTokens":   res.Usage.OutputTokens,
			"thinkingTokens": res.Usage.ThinkingTokens,
			"costUSD":        res.CostUSD,
		},
	})
}

// aiErrorMessage 把正規化錯誤轉成給使用者看的訊息。
func aiErrorMessage(err error) string {
	switch ai.HTTPStatus(err) {
	case http.StatusUnauthorized:
		return "AI 金鑰無效"
	case http.StatusTooManyRequests:
		return "AI 服務流量超限，請稍後再試"
	case http.StatusUnprocessableEntity:
		return "AI 拒絕處理這份資料"
	case http.StatusGatewayTimeout:
		return "AI 回應逾時"
	case http.StatusServiceUnavailable:
		return "AI provider 未設定"
	case http.StatusBadGateway:
		if errors.Is(err, ai.ErrInvalidOutput) {
			return "AI 回應格式不正確，請重試"
		}
		return "AI 服務暫時無法使用，請稍後再試"
	default:
		return "AI 失敗，請稍後再試"
	}
}
