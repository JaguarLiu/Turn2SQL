//go:build integration

package integration

import (
	"testing"
	"time"
)

// TestMSSQLExecutesGeneratedSQL 產生的 SQL 要真的跑得起來。
func TestMSSQLExecutesGeneratedSQL(t *testing.T) {
	db := mssqlDB(t)

	tpl := template{
		TableName: "ms_orders", Dialect: "mssql", Mode: "both",
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
	if err := db.QueryRow("SELECT COUNT(*) FROM ms_orders").Scan(&n); err != nil {
		t.Fatal(err)
	}
	if n != 3 {
		t.Fatalf("筆數 = %d, want 3", n)
	}

	var name, memo, amount string
	var date time.Time
	var paid bool // BIT
	err := db.QueryRow("SELECT customer_name, amount, order_date, is_paid, memo FROM ms_orders WHERE id = 2").
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
		t.Errorf("is_paid = true, want false")
	}
	if memo != "含單引號 ' 的備註" {
		t.Errorf("memo = %q", memo)
	}
}

// TestMSSQLColumnDefinitions NVARCHAR 長度與精度要正確。
func TestMSSQLColumnDefinitions(t *testing.T) {
	db := mssqlDB(t)

	tpl := template{
		TableName: "ms_defs", Dialect: "mssql", Mode: "create",
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
		prec     *int
		scale    *int
	}
	got := map[string]colInfo{}
	rows, err := db.Query(`SELECT COLUMN_NAME, DATA_TYPE, IS_NULLABLE,
	                              CHARACTER_MAXIMUM_LENGTH, NUMERIC_PRECISION, NUMERIC_SCALE
	                       FROM INFORMATION_SCHEMA.COLUMNS WHERE TABLE_NAME = 'ms_defs'`)
	if err != nil {
		t.Fatal(err)
	}
	defer rows.Close()
	for rows.Next() {
		var name string
		var ci colInfo
		if err := rows.Scan(&name, &ci.typ, &ci.nullable, &ci.maxLen, &ci.prec, &ci.scale); err != nil {
			t.Fatal(err)
		}
		got[name] = ci
	}
	if err := rows.Err(); err != nil {
		t.Fatal(err)
	}

	if c := got["code"]; c.typ != "nvarchar" || c.nullable != "NO" || c.maxLen == nil || *c.maxLen != 20 {
		t.Errorf("code = %+v, want nvarchar(20) NOT NULL", c)
	}
	if c := got["price"]; c.prec == nil || *c.prec != 10 || c.scale == nil || *c.scale != 3 {
		t.Errorf("price = %+v, want decimal(10,3)", c)
	}
	if c := got["note"]; c.maxLen == nil || *c.maxLen != 255 {
		t.Errorf("note = %+v, want nvarchar(255)", c)
	}
	if c := got["id"]; c.nullable != "NO" {
		t.Errorf("id 應為 NOT NULL: %+v", c)
	}
}

// TestMSSQLCompositePrimaryKey 複合主鍵。
func TestMSSQLCompositePrimaryKey(t *testing.T) {
	db := mssqlDB(t)

	tpl := template{
		TableName: "ms_composite", Dialect: "mssql", Mode: "both",
		Fields: []field{
			{Name: "order_id", Type: "INT", PrimaryKey: true},
			{Name: "line_no", Type: "INT", PrimaryKey: true},
			{Name: "qty", Type: "INT"},
		},
		Rows: [][]string{{"1", "1", "5"}, {"1", "2", "3"}},
	}
	execSQL(t, db, generateSQL(t, tpl))

	var keyCols int
	err := db.QueryRow(`SELECT COUNT(*) FROM INFORMATION_SCHEMA.KEY_COLUMN_USAGE
	                    WHERE TABLE_NAME = 'ms_composite'`).Scan(&keyCols)
	if err != nil {
		t.Fatal(err)
	}
	if keyCols != 2 {
		t.Fatalf("主鍵欄位數 = %d, want 2", keyCols)
	}

	if _, err := db.Exec("INSERT INTO ms_composite ([order_id], [line_no], [qty]) VALUES (1, 1, 9)"); err == nil {
		t.Fatal("重複主鍵竟然插入成功")
	}
}

// TestMSSQLDropTableGuard mssql 用 IF OBJECT_ID 而不是 DROP TABLE IF EXISTS，
// 重跑同一份 SQL 要能成功。
func TestMSSQLDropTableGuard(t *testing.T) {
	db := mssqlDB(t)

	tpl := template{
		TableName: "ms_rerun", Dialect: "mssql", Mode: "both",
		Fields: []field{{Name: "id", Type: "INT"}},
		Rows:   [][]string{{"1"}},
	}
	script := generateSQL(t, tpl)
	execSQL(t, db, script)
	execSQL(t, db, script) // 第二次應該要能重建

	var n int
	if err := db.QueryRow("SELECT COUNT(*) FROM ms_rerun").Scan(&n); err != nil {
		t.Fatal(err)
	}
	if n != 1 {
		t.Fatalf("筆數 = %d, want 1", n)
	}
}

// TestMSSQLUpdateMode UPDATE 模式。
func TestMSSQLUpdateMode(t *testing.T) {
	db := mssqlDB(t)

	base := template{
		TableName: "ms_stock", Dialect: "mssql", Mode: "both",
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
	if err := db.QueryRow("SELECT qty FROM ms_stock WHERE sku = 'A-1'").Scan(&qty); err != nil {
		t.Fatal(err)
	}
	if qty != 99 {
		t.Fatalf("qty = %d, want 99", qty)
	}
}

// TestMSSQLChineseData 中文資料要完整落地（NVARCHAR + N 前綴）。
func TestMSSQLChineseData(t *testing.T) {
	db := mssqlDB(t)

	tpl := template{
		TableName: "ms_cjk", Dialect: "mssql", Mode: "both",
		Fields: []field{
			{Name: "編號", Type: "INT", PrimaryKey: true},
			{Name: "姓名", Type: "VARCHAR", Length: 30, Comment: "客戶姓名"},
			{Name: "地址", Type: "VARCHAR", Length: 100},
		},
		Rows: [][]string{{"1", "陳大文", "台北市信義區松高路 1 號"}},
	}
	execSQL(t, db, generateSQL(t, tpl))

	var name, addr string
	if err := db.QueryRow("SELECT [姓名], [地址] FROM ms_cjk WHERE [編號] = 1").Scan(&name, &addr); err != nil {
		t.Fatal(err)
	}
	if name != "陳大文" {
		t.Errorf("姓名 = %q（? 代表 N 前綴掉了）", name)
	}
	if addr != "台北市信義區松高路 1 號" {
		t.Errorf("地址 = %q", addr)
	}
}
