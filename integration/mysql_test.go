//go:build integration

package integration

import (
	"testing"
	"time"
)

// TestMySQLExecutesGeneratedSQL 是重點：產生的 SQL 要真的跑得起來。
func TestMySQLExecutesGeneratedSQL(t *testing.T) {
	db := mysqlDB(t)

	tpl := template{
		TableName: "orders", Dialect: "mysql", Mode: "both",
		Fields: []field{
			{Name: "id", Type: "INT", PrimaryKey: true, Comment: "訂單編號"},
			{Name: "customer_name", Type: "VARCHAR", Length: 50, Nullable: ptr(false), Comment: "客戶名稱"},
			{Name: "amount", Type: "DECIMAL", Precision: 12, Scale: 2},
			{Name: "order_date", Type: "DATE"},
			{Name: "is_paid", Type: "BOOLEAN"},
			{Name: "memo", Type: "VARCHAR"},
		},
		Rows: [][]string{
			{"1", "王小明", "1234.50", "2026-05-01", "是", "普通備註"},
			{"2", "O'Brien", "2000", "2026/06/15", "否", "含單引號 ' 的備註"},
			{"3", "李四", "0.05", "20260701", "1", ""},
		},
	}

	script := generateSQL(t, tpl)
	t.Logf("產生的 SQL:\n%s", script)
	execSQL(t, db, script)

	// 資料有進去
	var n int
	if err := db.QueryRow("SELECT COUNT(*) FROM orders").Scan(&n); err != nil {
		t.Fatal(err)
	}
	if n != 3 {
		t.Fatalf("筆數 = %d, want 3", n)
	}

	// 值有正確落地：中文、單引號、日期、布林、小數
	var name, memo string
	var amount string
	var date time.Time
	var paid int
	err := db.QueryRow("SELECT customer_name, amount, order_date, is_paid, memo FROM orders WHERE id = 2").
		Scan(&name, &amount, &date, &paid, &memo)
	if err != nil {
		t.Fatal(err)
	}
	if name != "O'Brien" {
		t.Errorf("customer_name = %q", name)
	}
	if amount != "2000.00" {
		t.Errorf("amount = %q, want 2000.00（DECIMAL(12,2)）", amount)
	}
	if got := date.Format("2006-01-02"); got != "2026-06-15" {
		t.Errorf("order_date = %s, want 2026-06-15（2026/06/15 不該位移一天）", got)
	}
	if paid != 0 {
		t.Errorf("is_paid = %d, want 0（否）", paid)
	}
	if memo != "含單引號 ' 的備註" {
		t.Errorf("memo = %q", memo)
	}

	// 日期格式 20260701 也要正確
	if err := db.QueryRow("SELECT order_date FROM orders WHERE id = 3").Scan(&date); err != nil {
		t.Fatal(err)
	}
	if got := date.Format("2006-01-02"); got != "2026-07-01" {
		t.Errorf("order_date = %s, want 2026-07-01", got)
	}
}

// TestMySQLColumnDefinitions 檢查欄位屬性有沒有真的生效。
func TestMySQLColumnDefinitions(t *testing.T) {
	db := mysqlDB(t)

	tpl := template{
		TableName: "defs", Dialect: "mysql", Mode: "create",
		Fields: []field{
			{Name: "id", Type: "INT", PrimaryKey: true},
			{Name: "code", Type: "VARCHAR", Length: 20, Nullable: ptr(false), Comment: "代碼"},
			{Name: "price", Type: "DECIMAL", Precision: 10, Scale: 3},
			{Name: "note", Type: "VARCHAR"}, // 未指定長度 → 預設 255
		},
		Rows: [][]string{},
	}
	execSQL(t, db, generateSQL(t, tpl))

	type colInfo struct{ typ, null, key, comment string }
	got := map[string]colInfo{}
	rows, err := db.Query(`SELECT COLUMN_NAME, COLUMN_TYPE, IS_NULLABLE, COLUMN_KEY, COLUMN_COMMENT
	                       FROM information_schema.COLUMNS
	                       WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'defs'`)
	if err != nil {
		t.Fatal(err)
	}
	defer rows.Close()
	for rows.Next() {
		var name string
		var ci colInfo
		if err := rows.Scan(&name, &ci.typ, &ci.null, &ci.key, &ci.comment); err != nil {
			t.Fatal(err)
		}
		got[name] = ci
	}
	if err := rows.Err(); err != nil {
		t.Fatal(err)
	}

	want := map[string]colInfo{
		"id":    {typ: "int", null: "NO", key: "PRI", comment: ""},
		"code":  {typ: "varchar(20)", null: "NO", key: "", comment: "代碼"},
		"price": {typ: "decimal(10,3)", null: "YES", key: "", comment: ""},
		"note":  {typ: "varchar(255)", null: "YES", key: "", comment: ""},
	}
	for name, w := range want {
		g, ok := got[name]
		if !ok {
			t.Errorf("缺少欄位 %s", name)
			continue
		}
		if g != w {
			t.Errorf("%s = %+v, want %+v", name, g, w)
		}
	}
}

// TestMySQLCompositePrimaryKey 複合主鍵要改成表層級語法。
func TestMySQLCompositePrimaryKey(t *testing.T) {
	db := mysqlDB(t)

	tpl := template{
		TableName: "composite", Dialect: "mysql", Mode: "both",
		Fields: []field{
			{Name: "order_id", Type: "INT", PrimaryKey: true},
			{Name: "line_no", Type: "INT", PrimaryKey: true},
			{Name: "qty", Type: "INT"},
		},
		Rows: [][]string{{"1", "1", "5"}, {"1", "2", "3"}},
	}
	execSQL(t, db, generateSQL(t, tpl))

	var keyCols int
	err := db.QueryRow(`SELECT COUNT(*) FROM information_schema.KEY_COLUMN_USAGE
	                    WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'composite'
	                      AND CONSTRAINT_NAME = 'PRIMARY'`).Scan(&keyCols)
	if err != nil {
		t.Fatal(err)
	}
	if keyCols != 2 {
		t.Fatalf("主鍵欄位數 = %d, want 2", keyCols)
	}

	// 主鍵重複時應該被資料庫擋下
	if _, err := db.Exec("INSERT INTO composite (`order_id`, `line_no`, `qty`) VALUES (1, 1, 9)"); err == nil {
		t.Fatal("重複主鍵竟然插入成功")
	}
}

// TestMySQLChineseIdentifiers 中文欄位名與資料表名要能運作。
func TestMySQLChineseIdentifiers(t *testing.T) {
	db := mysqlDB(t)

	tpl := template{
		TableName: "客戶資料", Dialect: "mysql", Mode: "both",
		Fields: []field{
			{Name: "編號", Type: "INT", PrimaryKey: true},
			{Name: "姓名", Type: "VARCHAR", Length: 30},
		},
		Rows: [][]string{{"1", "陳大文"}},
	}
	execSQL(t, db, generateSQL(t, tpl))

	// 資料表名經過 safeTableName 會變成底線
	var name string
	if err := db.QueryRow("SELECT `姓名` FROM `____` WHERE `編號` = 1").Scan(&name); err != nil {
		t.Fatalf("查詢失敗: %v", err)
	}
	if name != "陳大文" {
		t.Fatalf("姓名 = %q", name)
	}
}

// TestMySQLUpdateMode UPDATE 模式產生的 SQL 也要能執行。
func TestMySQLUpdateMode(t *testing.T) {
	db := mysqlDB(t)

	base := template{
		TableName: "stock", Dialect: "mysql", Mode: "both",
		Fields: []field{
			{Name: "sku", Type: "VARCHAR", Length: 20, PrimaryKey: true},
			{Name: "qty", Type: "INT"},
		},
		Rows: [][]string{{"A-1", "10"}, {"B-2", "20"}},
	}
	execSQL(t, db, generateSQL(t, base))

	upd := base
	upd.Mode = "update"
	upd.WhereCols = []string{"sku"}
	upd.Rows = [][]string{{"A-1", "99"}}
	execSQL(t, db, generateSQL(t, upd))

	var qty int
	if err := db.QueryRow("SELECT qty FROM stock WHERE sku = 'A-1'").Scan(&qty); err != nil {
		t.Fatal(err)
	}
	if qty != 99 {
		t.Fatalf("qty = %d, want 99", qty)
	}
}
