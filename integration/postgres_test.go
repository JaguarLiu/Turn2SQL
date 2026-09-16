//go:build integration

package integration

import (
	"testing"
	"time"
)

// TestPostgresExecutesGeneratedSQL 產生的 SQL 要真的跑得起來。
func TestPostgresExecutesGeneratedSQL(t *testing.T) {
	db := postgresDB(t)

	tpl := template{
		TableName: "pg_orders", Dialect: "postgres", Mode: "both",
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
	execSQL(t, db, generateSQL(t, tpl))

	var n int
	if err := db.QueryRow("SELECT COUNT(*) FROM pg_orders").Scan(&n); err != nil {
		t.Fatal(err)
	}
	if n != 3 {
		t.Fatalf("筆數 = %d, want 3", n)
	}

	// PostgreSQL 的 BOOLEAN 是真的布林值，不是 0/1
	var name, memo, amount string
	var date time.Time
	var paid bool
	err := db.QueryRow(`SELECT customer_name, amount, order_date, is_paid, memo FROM pg_orders WHERE id = 2`).
		Scan(&name, &amount, &date, &paid, &memo)
	if err != nil {
		t.Fatal(err)
	}
	if name != "O'Brien" {
		t.Errorf("customer_name = %q", name)
	}
	if amount != "2000.00" {
		t.Errorf("amount = %q, want 2000.00", amount)
	}
	if got := date.Format("2006-01-02"); got != "2026-06-15" {
		t.Errorf("order_date = %s, want 2026-06-15", got)
	}
	if paid {
		t.Errorf("is_paid = true, want false（否 → FALSE）")
	}
	if memo != "含單引號 ' 的備註" {
		t.Errorf("memo = %q", memo)
	}
}

// TestPostgresColumnDefinitions 欄位屬性要真的生效，註解用 COMMENT ON COLUMN。
func TestPostgresColumnDefinitions(t *testing.T) {
	db := postgresDB(t)

	tpl := template{
		TableName: "pg_defs", Dialect: "postgres", Mode: "create",
		Fields: []field{
			{Name: "id", Type: "INT", PrimaryKey: true},
			{Name: "code", Type: "VARCHAR", Length: 20, Nullable: ptr(false), Comment: "代碼"},
			{Name: "price", Type: "DECIMAL", Precision: 10, Scale: 3},
			{Name: "note", Type: "VARCHAR"},
		},
		Rows: [][]string{},
	}
	execSQL(t, db, generateSQL(t, tpl))

	type colInfo struct {
		typ      string
		nullable string
		maxLen   *int
		precTot  *int
		precSca  *int
	}
	got := map[string]colInfo{}
	rows, err := db.Query(`SELECT column_name, data_type, is_nullable,
	                              character_maximum_length, numeric_precision, numeric_scale
	                       FROM information_schema.columns
	                       WHERE table_name = 'pg_defs'`)
	if err != nil {
		t.Fatal(err)
	}
	defer rows.Close()
	for rows.Next() {
		var name string
		var ci colInfo
		if err := rows.Scan(&name, &ci.typ, &ci.nullable, &ci.maxLen, &ci.precTot, &ci.precSca); err != nil {
			t.Fatal(err)
		}
		got[name] = ci
	}
	if err := rows.Err(); err != nil {
		t.Fatal(err)
	}

	if c := got["code"]; c.typ != "character varying" || c.nullable != "NO" || c.maxLen == nil || *c.maxLen != 20 {
		t.Errorf("code = %+v, want varchar(20) NOT NULL", c)
	}
	if c := got["price"]; c.precTot == nil || *c.precTot != 10 || c.precSca == nil || *c.precSca != 3 {
		t.Errorf("price = %+v, want numeric(10,3)", c)
	}
	if c := got["note"]; c.maxLen == nil || *c.maxLen != 255 {
		t.Errorf("note = %+v, want varchar(255)", c)
	}

	// 註解（PostgreSQL 沒有行內語法，要靠 COMMENT ON COLUMN）
	var comment string
	err = db.QueryRow(`SELECT col_description('pg_defs'::regclass, ordinal_position)
	                   FROM information_schema.columns
	                   WHERE table_name = 'pg_defs' AND column_name = 'code'`).Scan(&comment)
	if err != nil {
		t.Fatal(err)
	}
	if comment != "代碼" {
		t.Errorf("code 的註解 = %q, want 代碼", comment)
	}

	// 主鍵
	var pkCols int
	err = db.QueryRow(`SELECT COUNT(*) FROM information_schema.table_constraints tc
	                   JOIN information_schema.key_column_usage kcu
	                     ON tc.constraint_name = kcu.constraint_name
	                   WHERE tc.table_name = 'pg_defs' AND tc.constraint_type = 'PRIMARY KEY'`).Scan(&pkCols)
	if err != nil {
		t.Fatal(err)
	}
	if pkCols != 1 {
		t.Errorf("主鍵欄位數 = %d, want 1", pkCols)
	}
}

// TestPostgresCompositePrimaryKey 複合主鍵。
func TestPostgresCompositePrimaryKey(t *testing.T) {
	db := postgresDB(t)

	tpl := template{
		TableName: "pg_composite", Dialect: "postgres", Mode: "both",
		Fields: []field{
			{Name: "order_id", Type: "INT", PrimaryKey: true},
			{Name: "line_no", Type: "INT", PrimaryKey: true},
			{Name: "qty", Type: "INT"},
		},
		Rows: [][]string{{"1", "1", "5"}, {"1", "2", "3"}},
	}
	execSQL(t, db, generateSQL(t, tpl))

	if _, err := db.Exec(`INSERT INTO pg_composite ("order_id", "line_no", "qty") VALUES (1, 1, 9)`); err == nil {
		t.Fatal("重複主鍵竟然插入成功")
	}
}

// TestPostgresUpdateMode UPDATE 模式。
func TestPostgresUpdateMode(t *testing.T) {
	db := postgresDB(t)

	base := template{
		TableName: "pg_stock", Dialect: "postgres", Mode: "both",
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
	if err := db.QueryRow("SELECT qty FROM pg_stock WHERE sku = 'A-1'").Scan(&qty); err != nil {
		t.Fatal(err)
	}
	if qty != 99 {
		t.Fatalf("qty = %d, want 99", qty)
	}
}
