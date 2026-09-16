package ai

import (
	"os"
	"sort"
	"strconv"
	"strings"
	"sync"
	"time"
)

// Factory 依設定建立一個 provider。
type Factory func(cfg Config) (Provider, error)

var (
	regMu    sync.RWMutex
	registry = map[string]Factory{}
)

// Register 由各 adapter 在 init() 中呼叫。
func Register(name string, f Factory) {
	regMu.Lock()
	defer regMu.Unlock()
	registry[name] = f
}

// New 建立指定名稱的 provider。
func New(name string, cfg Config) (Provider, error) {
	regMu.RLock()
	f, ok := registry[name]
	regMu.RUnlock()
	if !ok {
		return nil, wrapErr(name, ErrNotConfigured, "unknown provider")
	}
	return f(cfg)
}

// Registered 回傳所有已註冊的 provider 名稱（不代表有設定金鑰）。
func Registered() []string {
	regMu.RLock()
	defer regMu.RUnlock()
	out := make([]string, 0, len(registry))
	for name := range registry {
		out = append(out, name)
	}
	sort.Strings(out)
	return out
}

// envKeys 是各 provider 用來判斷「伺服器上是否已設定」的環境變數。
var envKeys = map[string][]string{
	"claude": {"ANTHROPIC_API_KEY"},
	"gemini": {"GEMINI_API_KEY", "GOOGLE_API_KEY", "GOOGLE_CLOUD_PROJECT"},
	"openai": {"OPENAI_API_KEY"},
}

// Available 回傳伺服器端已備妥金鑰、可直接使用的 provider。
func Available() []string {
	var out []string
	for _, name := range Registered() {
		if name == "mock" {
			continue
		}
		for _, key := range envKeys[name] {
			if os.Getenv(key) != "" {
				out = append(out, name)
				break
			}
		}
	}
	return out
}

// ConfigFromEnv 依 provider 名稱組出設定。
func ConfigFromEnv(name string) Config {
	cfg := Config{
		Model:   firstEnv("AI_MODEL_"+strings.ToUpper(name), "AI_MODEL"),
		Timeout: envDuration("AI_TIMEOUT", DefaultTimeout),
	}
	switch name {
	case "claude":
		cfg.APIKey = os.Getenv("ANTHROPIC_API_KEY")
	case "gemini":
		cfg.APIKey = firstEnv("GEMINI_API_KEY", "GOOGLE_API_KEY")
		cfg.Project = os.Getenv("GOOGLE_CLOUD_PROJECT")
		cfg.Location = firstEnv("GOOGLE_CLOUD_LOCATION", "GOOGLE_CLOUD_REGION")
	case "openai":
		cfg.APIKey = os.Getenv("OPENAI_API_KEY")
	}
	return cfg
}

// FallbackProviderName 是 AI_PROVIDER 未設定時使用的 provider。
// 仍然需要對應的金鑰，沒有金鑰時伺服器端 AI 功能等同關閉（使用者仍可自帶金鑰）。
const FallbackProviderName = "gemini"

// DefaultProvider 依 AI_PROVIDER 建立伺服器端預設 provider；未設定時用 FallbackProviderName。
func DefaultProvider() (Provider, error) {
	name := os.Getenv("AI_PROVIDER")
	if name == "" {
		name = FallbackProviderName
	}
	return New(name, ConfigFromEnv(name))
}

// FallbackProvider 依 AI_FALLBACK 建立備援 provider，未設定時回傳 nil。
func FallbackProvider() Provider {
	name := os.Getenv("AI_FALLBACK")
	if name == "" {
		return nil
	}
	p, err := New(name, ConfigFromEnv(name))
	if err != nil {
		return nil
	}
	return p
}

// ModelForTask 回傳某個功能要用的模型：AI_MODEL_<TASK> 優先，其次用 provider 預設。
func ModelForTask(task string) string {
	return os.Getenv("AI_MODEL_" + strings.ToUpper(task))
}

func firstEnv(keys ...string) string {
	for _, k := range keys {
		if v := os.Getenv(k); v != "" {
			return v
		}
	}
	return ""
}

func envDuration(key string, def time.Duration) time.Duration {
	v := os.Getenv(key)
	if v == "" {
		return def
	}
	if d, err := time.ParseDuration(v); err == nil {
		return d
	}
	if n, err := strconv.Atoi(v); err == nil {
		return time.Duration(n) * time.Second
	}
	return def
}

func modelOr(model, def string) string {
	if model != "" {
		return model
	}
	return def
}
