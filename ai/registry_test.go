package ai

import (
	"errors"
	"testing"
)

// AI_PROVIDER 未設定時應預設用 gemini（仍需要金鑰）。
func TestDefaultProviderFallsBackToGemini(t *testing.T) {
	t.Setenv("AI_PROVIDER", "")
	t.Setenv("GEMINI_API_KEY", "test-key")
	p, err := DefaultProvider()
	if err != nil {
		t.Fatalf("DefaultProvider: %v", err)
	}
	if p.Name() != "gemini" {
		t.Fatalf("provider = %s, want gemini", p.Name())
	}
	if p.DefaultModel() != DefaultGeminiModel {
		t.Fatalf("model = %s, want %s", p.DefaultModel(), DefaultGeminiModel)
	}
}

// 沒有金鑰時伺服器端 AI 等同關閉。
func TestDefaultProviderWithoutKey(t *testing.T) {
	for _, k := range []string{"AI_PROVIDER", "GEMINI_API_KEY", "GOOGLE_API_KEY", "GOOGLE_CLOUD_PROJECT", "GOOGLE_CLOUD_LOCATION"} {
		t.Setenv(k, "")
	}
	if _, err := DefaultProvider(); !errors.Is(err, ErrNotConfigured) {
		t.Fatalf("want ErrNotConfigured, got %v", err)
	}
}

// AI_PROVIDER 有設定時優先。
func TestDefaultProviderExplicit(t *testing.T) {
	t.Setenv("AI_PROVIDER", "claude")
	t.Setenv("ANTHROPIC_API_KEY", "test-key")
	p, err := DefaultProvider()
	if err != nil {
		t.Fatalf("DefaultProvider: %v", err)
	}
	if p.Name() != "claude" {
		t.Fatalf("provider = %s, want claude", p.Name())
	}
}

// AI_MODEL_GEMINI 可覆寫預設模型。
func TestModelOverride(t *testing.T) {
	t.Setenv("AI_PROVIDER", "")
	t.Setenv("GEMINI_API_KEY", "test-key")
	t.Setenv("AI_MODEL_GEMINI", "gemini-custom")
	p, err := DefaultProvider()
	if err != nil {
		t.Fatalf("DefaultProvider: %v", err)
	}
	if p.DefaultModel() != "gemini-custom" {
		t.Fatalf("model = %s", p.DefaultModel())
	}
}
