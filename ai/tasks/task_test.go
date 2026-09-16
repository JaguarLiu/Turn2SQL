package tasks

import (
	"context"
	"encoding/json"
	"errors"
	"strings"
	"testing"

	"turn2sql/ai"
)

// 我們自己寫死的 schema 必須符合共通子集，否則有些 provider 會拒收。
func TestBuiltinSchemasFollowSubset(t *testing.T) {
	for _, task := range []*Task{SchemaSuggest, CleanRules} {
		if err := ai.CheckSubset(task.Schema); err != nil {
			t.Fatalf("%s: %v", task.Name, err)
		}
	}
}

func TestRunValidatesOutput(t *testing.T) {
	task, err := New("t", "sys", json.RawMessage(
		`{"type":"object","additionalProperties":false,"required":["n"],"properties":{"n":{"type":"integer"}}}`), 100)
	if err != nil {
		t.Fatal(err)
	}

	t.Run("valid output passes through", func(t *testing.T) {
		p := ai.NewMock(json.RawMessage(`{"n":1}`), nil)
		res, err := task.Run(context.Background(), p, "prompt")
		if err != nil {
			t.Fatal(err)
		}
		if string(res.JSON) != `{"n":1}` || res.Retried {
			t.Fatalf("unexpected result %+v", res)
		}
	})

	t.Run("invalid output retries once then fails", func(t *testing.T) {
		p := ai.NewMock(json.RawMessage(`{"n":"not an int"}`), nil)
		_, err := task.Run(context.Background(), p, "prompt")
		if !errors.Is(err, ai.ErrInvalidOutput) {
			t.Fatalf("want ErrInvalidOutput, got %v", err)
		}
		reqs := p.Requests()
		if len(reqs) != 2 {
			t.Fatalf("want 2 attempts, got %d", len(reqs))
		}
		// 重試時要把驗證錯誤回饋給模型
		if !strings.Contains(reqs[1].User, "不符合 JSON schema") {
			t.Fatalf("retry prompt missing feedback: %s", reqs[1].User)
		}
	})

	t.Run("auth error is not retried", func(t *testing.T) {
		p := ai.NewMock(nil, ai.ErrAuth)
		if _, err := task.Run(context.Background(), p, "prompt"); !errors.Is(err, ai.ErrAuth) {
			t.Fatalf("want ErrAuth, got %v", err)
		}
		if n := len(p.Requests()); n != 1 {
			t.Fatalf("want 1 attempt, got %d", n)
		}
	})

	t.Run("rate limit is retried", func(t *testing.T) {
		p := ai.NewMock(nil, ai.ErrRateLimited)
		if _, err := task.Run(context.Background(), p, "prompt"); !errors.Is(err, ai.ErrRateLimited) {
			t.Fatalf("want ErrRateLimited, got %v", err)
		}
		if n := len(p.Requests()); n != 2 {
			t.Fatalf("want 2 attempts, got %d", n)
		}
	})
}

func TestPrompts(t *testing.T) {
	in := SchemaInput{
		TableName: "orders", Dialect: "mysql", RowCount: 120,
		Columns: []Column{{Name: "訂單日期", Samples: []string{"113/05/01"}, Stats: Stats{Total: 120, NonEmpty: 118}}},
	}
	got, err := SchemaPrompt(in)
	if err != nil {
		t.Fatal(err)
	}
	for _, want := range []string{"mysql", "orders", "訂單日期", "113/05/01"} {
		if !strings.Contains(got, want) {
			t.Fatalf("prompt missing %q:\n%s", want, got)
		}
	}
	if _, err := SchemaPrompt(SchemaInput{}); err == nil {
		t.Fatal("empty input should fail")
	}
	if _, err := CleanPrompt(CleanInput{}); err == nil {
		t.Fatal("empty input should fail")
	}
}
