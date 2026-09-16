package tasks

import (
	"encoding/json"
	"errors"
	"fmt"
	"strings"
)

func errorsIs(err, target error) bool { return errors.Is(err, target) }

// Column 是送給 AI 的單一欄位資訊（已由前端遮蔽過敏感值）。
type Column struct {
	Name    string   `json:"name"`    // Excel 的原始欄位名（可能是中文）
	Samples []string `json:"samples"` // 抽樣值
	Stats   Stats    `json:"stats"`
}

// Stats 是整欄的統計摘要，讓 AI 不用看到全部資料也能判斷。
type Stats struct {
	Total      int `json:"total"`
	NonEmpty   int `json:"nonEmpty"`
	Distinct   int `json:"distinct"`
	MaxLen     int `json:"maxLen"`
	MaxDecimal int `json:"maxDecimal"` // 小數位數最大值
}

// SchemaInput 是建表建議的輸入。
type SchemaInput struct {
	TableName string   `json:"tableName"`
	Dialect   string   `json:"dialect"`
	RowCount  int      `json:"rowCount"`
	Columns   []Column `json:"columns"`
}

const schemaSystem = `你是資料庫 schema 設計專家，專門處理台灣企業的 Excel 資料轉檔。
使用者會提供 Excel 的欄位名稱、抽樣值與統計摘要，請為每個欄位建議資料表定義。

規則：
- name：英文 snake_case 欄位名。中文欄位名要翻成有意義的英文，不要用拼音。
- type：只能是 VARCHAR / INT / DECIMAL / DATE / BOOLEAN 其中之一。
- length：VARCHAR 才填，依實際最大長度取整（例如 40 → 50），其餘填 null。
- precision / scale：DECIMAL 才填，其餘填 null。金額類建議 scale 至少 2。
- nullable：抽樣中有空值，或語意上可為空時填 true。
- primaryKey：整欄唯一且看起來像識別碼時才填 true；不確定就填 false。
- comment：填原始的中文欄位名，方便日後對照。
- reason：一句話說明判斷依據。

注意台灣常見格式：民國年日期（113/05/01）、全形數字、千分位與貨幣符號（NT$1,234）、
以 是/否/V/O 表示的布林值、統一編號與身分證字號（都應視為 VARCHAR，不是數字）。
只輸出 JSON。`

const schemaJSONSchema = `{
  "type": "object",
  "additionalProperties": false,
  "required": ["tableName", "columns"],
  "properties": {
    "tableName": { "type": "string" },
    "columns": {
      "type": "array",
      "items": {
        "type": "object",
        "additionalProperties": false,
        "required": ["original", "name", "type", "length", "precision", "scale", "nullable", "primaryKey", "comment", "reason"],
        "properties": {
          "original":   { "type": "string" },
          "name":       { "type": "string" },
          "type":       { "type": "string", "enum": ["VARCHAR", "INT", "DECIMAL", "DATE", "BOOLEAN"] },
          "length":     { "type": ["integer", "null"] },
          "precision":  { "type": ["integer", "null"] },
          "scale":      { "type": ["integer", "null"] },
          "nullable":   { "type": "boolean" },
          "primaryKey": { "type": "boolean" },
          "comment":    { "type": ["string", "null"] },
          "reason":     { "type": "string" }
        }
      }
    }
  }
}`

// SchemaSuggest 是「智慧建表」任務。
var SchemaSuggest = mustTask("schema", schemaSystem, schemaJSONSchema, 8192)

// SchemaPrompt 把輸入組成 user prompt。
func SchemaPrompt(in SchemaInput) (string, error) {
	if len(in.Columns) == 0 {
		return "", fmt.Errorf("no columns")
	}
	body, err := json.MarshalIndent(in, "", "  ")
	if err != nil {
		return "", err
	}
	var sb strings.Builder
	fmt.Fprintf(&sb, "目標方言：%s\n資料表名稱（使用者填的）：%s\n總列數：%d\n\n欄位資料：\n",
		in.Dialect, in.TableName, in.RowCount)
	sb.Write(body)
	return sb.String(), nil
}

func mustTask(name, system, schema string, maxTokens int) *Task {
	t, err := New(name, system, json.RawMessage(schema), maxTokens)
	if err != nil {
		panic(err) // schema 是我們自己寫死的，寫錯應該在啟動時就炸
	}
	return t
}
