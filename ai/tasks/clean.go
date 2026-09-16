package tasks

import (
	"encoding/json"
	"fmt"
	"strings"
)

// CleanInput 是清洗規則任務的輸入，與建表建議共用 Column。
type CleanInput struct {
	RowCount int      `json:"rowCount"`
	Columns  []Column `json:"columns"`
}

// 規則操作白名單。AI 只能從這裡面挑，絕不產生可執行的程式碼；
// 實際轉換由瀏覽器端的 rules.js 執行。
const cleanSystem = `你是資料清洗專家，專門處理台灣企業的 Excel 資料。
使用者會提供欄位的抽樣值，請找出需要清洗的地方，並產生轉換規則。

只能使用以下 op（不要發明新的）：
- roc_to_ad：民國年轉西元（113/05/01 → 2024-05-01）
- fullwidth_to_halfwidth：全形字元轉半形
- strip_currency：去掉貨幣符號、「元」與千分位逗號
- map_values：依 mapping 做值對應（是/否/V/O → 1/0）
- parse_date：依 format 指定的格式解析日期
- trim：去頭尾空白
- null_if：等於 from 的值轉成 NULL
- upper / lower：大小寫轉換
- validate_id / validate_tax_id / validate_phone：只標記格式不符的列，不修改資料

規則要點：
- 只在抽樣中真的看到問題時才產生規則，不要為了湊數而產生。
- mapping 只有 op 是 map_values 時才填，其餘填空陣列。
- format 只有 op 是 parse_date 時才填（例如 YYYY/MM/DD），其餘填 null。
- from 只有 op 是 null_if 時才填，其餘填 null。
- sampleBefore / sampleAfter 各給一個實際的抽樣例子，讓使用者能判斷要不要套用。
只輸出 JSON。`

const cleanJSONSchema = `{
  "type": "object",
  "additionalProperties": false,
  "required": ["rules"],
  "properties": {
    "rules": {
      "type": "array",
      "items": {
        "type": "object",
        "additionalProperties": false,
        "required": ["column", "op", "from", "format", "mapping", "sampleBefore", "sampleAfter", "reason"],
        "properties": {
          "column": { "type": "string" },
          "op": {
            "type": "string",
            "enum": ["roc_to_ad", "fullwidth_to_halfwidth", "strip_currency", "map_values",
                     "parse_date", "trim", "null_if", "upper", "lower",
                     "validate_id", "validate_tax_id", "validate_phone"]
          },
          "from":   { "type": ["string", "null"] },
          "format": { "type": ["string", "null"] },
          "mapping": {
            "type": "array",
            "items": {
              "type": "object",
              "additionalProperties": false,
              "required": ["from", "to"],
              "properties": {
                "from": { "type": "string" },
                "to":   { "type": "string" }
              }
            }
          },
          "sampleBefore": { "type": "string" },
          "sampleAfter":  { "type": "string" },
          "reason":       { "type": "string" }
        }
      }
    }
  }
}`

// CleanRules 是「資料清洗規則」任務。
var CleanRules = mustTask("clean", cleanSystem, cleanJSONSchema, 8192)

// CleanPrompt 把輸入組成 user prompt。
func CleanPrompt(in CleanInput) (string, error) {
	if len(in.Columns) == 0 {
		return "", fmt.Errorf("no columns")
	}
	body, err := json.MarshalIndent(in, "", "  ")
	if err != nil {
		return "", err
	}
	var sb strings.Builder
	fmt.Fprintf(&sb, "總列數：%d\n\n欄位資料：\n", in.RowCount)
	sb.Write(body)
	return sb.String(), nil
}
