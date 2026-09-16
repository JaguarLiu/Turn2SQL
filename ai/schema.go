package ai

import (
	"encoding/json"
	"fmt"
	"strings"

	"github.com/santhosh-tekuri/jsonschema/v6"
)

// 各家對 structured output 支援的 schema 範圍不同，所有 task 的 schema 一律遵守共通子集：
//   - 每個 object 都設 additionalProperties: false，所有屬性都列進 required
//   - 可省略的欄位用 ["string", "null"]，不用「不列入 required」表示
//   - 不使用 oneOf / anyOf / $ref / format / pattern
//   - enum 只用字串
//
// CheckSubset 在啟動時（或測試裡）驗證我們自己寫的 schema 有守規則。
func CheckSubset(schema json.RawMessage) error {
	var root any
	if err := json.Unmarshal(schema, &root); err != nil {
		return fmt.Errorf("schema is not valid JSON: %w", err)
	}
	return checkNode(root, "$")
}

var bannedKeywords = []string{"oneOf", "anyOf", "allOf", "not", "$ref", "format", "pattern", "patternProperties"}

func checkNode(node any, path string) error {
	m, ok := node.(map[string]any)
	if !ok {
		return nil
	}
	for _, kw := range bannedKeywords {
		if _, found := m[kw]; found {
			return fmt.Errorf("%s: keyword %q is not allowed in the common subset", path, kw)
		}
	}
	if typeIs(m["type"], "object") {
		if ap, found := m["additionalProperties"]; !found || ap != false {
			return fmt.Errorf("%s: object must set additionalProperties:false", path)
		}
		props, _ := m["properties"].(map[string]any)
		required := map[string]bool{}
		if list, ok := m["required"].([]any); ok {
			for _, r := range list {
				if s, ok := r.(string); ok {
					required[s] = true
				}
			}
		}
		for name := range props {
			if !required[name] {
				return fmt.Errorf("%s.%s: every property must be listed in required (use [\"type\",\"null\"] for optional values)", path, name)
			}
		}
		for name, sub := range props {
			if err := checkNode(sub, path+"."+name); err != nil {
				return err
			}
		}
	}
	if items, found := m["items"]; found {
		if err := checkNode(items, path+"[]"); err != nil {
			return err
		}
	}
	return nil
}

func typeIs(v any, want string) bool {
	switch t := v.(type) {
	case string:
		return t == want
	case []any:
		for _, item := range t {
			if s, ok := item.(string); ok && s == want {
				return true
			}
		}
	}
	return false
}

// Validator 把 schema 編譯一次後重複使用。
type Validator struct {
	schema *jsonschema.Schema
}

// NewValidator 編譯 schema；schema 本身寫錯時回傳 error。
func NewValidator(schema json.RawMessage) (*Validator, error) {
	doc, err := jsonschema.UnmarshalJSON(strings.NewReader(string(schema)))
	if err != nil {
		return nil, fmt.Errorf("parse schema: %w", err)
	}
	c := jsonschema.NewCompiler()
	if err := c.AddResource("turn2sql://schema", doc); err != nil {
		return nil, fmt.Errorf("add schema: %w", err)
	}
	compiled, err := c.Compile("turn2sql://schema")
	if err != nil {
		return nil, fmt.Errorf("compile schema: %w", err)
	}
	return &Validator{schema: compiled}, nil
}

// Validate 檢查模型輸出是否符合 schema。
// 不管 provider 宣稱保證什麼，後端一律再驗一次。
func (v *Validator) Validate(data json.RawMessage) error {
	inst, err := jsonschema.UnmarshalJSON(strings.NewReader(string(data)))
	if err != nil {
		return fmt.Errorf("%w: model output is not valid JSON: %v", ErrInvalidOutput, err)
	}
	if err := v.schema.Validate(inst); err != nil {
		return fmt.Errorf("%w: %v", ErrInvalidOutput, err)
	}
	return nil
}

// schemaMap 把 schema 轉成各家 SDK 需要的 map[string]any。
func schemaMap(schema json.RawMessage) (map[string]any, error) {
	if len(schema) == 0 {
		return nil, fmt.Errorf("schema is required")
	}
	var m map[string]any
	if err := json.Unmarshal(schema, &m); err != nil {
		return nil, fmt.Errorf("schema is not a JSON object: %w", err)
	}
	return m, nil
}
