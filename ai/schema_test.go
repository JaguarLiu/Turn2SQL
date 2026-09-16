package ai

import (
	"encoding/json"
	"strings"
	"testing"
)

func TestCheckSubset(t *testing.T) {
	cases := []struct {
		name    string
		schema  string
		wantErr string
	}{
		{
			name:   "valid",
			schema: `{"type":"object","additionalProperties":false,"required":["a"],"properties":{"a":{"type":["string","null"]}}}`,
		},
		{
			name:    "missing additionalProperties",
			schema:  `{"type":"object","required":["a"],"properties":{"a":{"type":"string"}}}`,
			wantErr: "additionalProperties",
		},
		{
			name:    "property not required",
			schema:  `{"type":"object","additionalProperties":false,"required":[],"properties":{"a":{"type":"string"}}}`,
			wantErr: "required",
		},
		{
			name:    "banned keyword",
			schema:  `{"type":"object","additionalProperties":false,"required":["a"],"properties":{"a":{"oneOf":[{"type":"string"}]}}}`,
			wantErr: "oneOf",
		},
		{
			name:    "nested array item must follow rules",
			schema:  `{"type":"object","additionalProperties":false,"required":["a"],"properties":{"a":{"type":"array","items":{"type":"object","properties":{"b":{"type":"string"}}}}}}`,
			wantErr: "additionalProperties",
		},
	}
	for _, tc := range cases {
		t.Run(tc.name, func(t *testing.T) {
			err := CheckSubset(json.RawMessage(tc.schema))
			if tc.wantErr == "" {
				if err != nil {
					t.Fatalf("want ok, got %v", err)
				}
				return
			}
			if err == nil || !strings.Contains(err.Error(), tc.wantErr) {
				t.Fatalf("want error containing %q, got %v", tc.wantErr, err)
			}
		})
	}
}

func TestValidator(t *testing.T) {
	v, err := NewValidator(json.RawMessage(`{"type":"object","additionalProperties":false,"required":["n"],"properties":{"n":{"type":"integer"}}}`))
	if err != nil {
		t.Fatal(err)
	}
	if err := v.Validate(json.RawMessage(`{"n":1}`)); err != nil {
		t.Fatalf("valid payload rejected: %v", err)
	}
	if err := v.Validate(json.RawMessage(`{"n":"x"}`)); err == nil {
		t.Fatal("wrong type accepted")
	}
	if err := v.Validate(json.RawMessage(`not json`)); err == nil {
		t.Fatal("invalid JSON accepted")
	}
}

func TestEstimateCost(t *testing.T) {
	got := EstimateCostUSD("claude-opus-5", Usage{InputTokens: 1_000_000, OutputTokens: 1_000_000})
	if got != 30 {
		t.Fatalf("want 30, got %v", got)
	}
	if EstimateCostUSD("unknown-model", Usage{InputTokens: 100}) != 0 {
		t.Fatal("unknown model should cost 0")
	}
}
