//go:build integration

// Package integration 用 testcontainers 起真的資料庫，
// 把前端產生的 SQL 在 MySQL / PostgreSQL / SQL Server 上實際執行一次。
//
//	go test -tags integration ./integration/...
//
// 需要 Docker 與 node。單元測試不會跑到這裡。
package integration

import (
	"context"
	"database/sql"
	"encoding/json"
	"os"
	"os/exec"
	"path/filepath"
	"strings"
	"sync"
	"testing"
	"time"

	_ "github.com/go-sql-driver/mysql"
	_ "github.com/lib/pq"
	_ "github.com/microsoft/go-mssqldb"
	"github.com/testcontainers/testcontainers-go"
	tcmssql "github.com/testcontainers/testcontainers-go/modules/mssql"
	tcmysql "github.com/testcontainers/testcontainers-go/modules/mysql"
	tcpostgres "github.com/testcontainers/testcontainers-go/modules/postgres"
)

const (
	mysqlImage    = "mysql:8.4"
	postgresImage = "postgres:17-alpine"
	mssqlImage    = "mcr.microsoft.com/mssql/server:2022-latest"
)

// field 對應 template 的欄位定義（皆為選填，與前端一致）。
type field struct {
	Name       string `json:"name"`
	Type       string `json:"type"`
	Length     int    `json:"length,omitempty"`
	Precision  int    `json:"precision,omitempty"`
	Scale      int    `json:"scale,omitempty"`
	Nullable   *bool  `json:"nullable,omitempty"`
	PrimaryKey bool   `json:"primaryKey,omitempty"`
	Comment    string `json:"comment,omitempty"`
}

type template struct {
	TableName string     `json:"tableName"`
	Dialect   string     `json:"dialect"`
	Mode      string     `json:"mode"`
	Fields    []field    `json:"fields"`
	Rows      [][]string `json:"rows"`
	WhereCols []string   `json:"whereCols,omitempty"`
}

func ptr[T any](v T) *T { return &v }

// generateSQL 呼叫 test/gen-sql.js，取得前端實際會產生的 SQL。
func generateSQL(t *testing.T, tpl template) string {
	t.Helper()
	if _, err := exec.LookPath("node"); err != nil {
		t.Skip("需要 node 才能產生 SQL")
	}

	raw, err := json.Marshal(tpl)
	if err != nil {
		t.Fatal(err)
	}
	f := filepath.Join(t.TempDir(), "tpl.json")
	if err := os.WriteFile(f, raw, 0o600); err != nil {
		t.Fatal(err)
	}

	cmd := exec.Command("node", filepath.Join("..", "test", "gen-sql.js"), f)
	var stderr strings.Builder
	cmd.Stderr = &stderr
	out, err := cmd.Output()
	if err != nil {
		t.Fatalf("gen-sql.js: %v\n%s", err, stderr.String())
	}
	if s := stderr.String(); s != "" {
		t.Logf("產生時的警告: %s", s)
	}
	return string(out)
}

// exec 逐段執行 SQL。Go 的 MySQL driver 預設不接受一次多段，
// 所以依分號切開（我們產生的 SQL 不含 stored procedure，可以這樣切）。
func execSQL(t *testing.T, db *sql.DB, script string) {
	t.Helper()
	for i, stmt := range strings.Split(script, ";\n") {
		s := strings.TrimSpace(stmt)
		// 去掉整段都是註解的區塊
		var lines []string
		for _, l := range strings.Split(s, "\n") {
			if !strings.HasPrefix(strings.TrimSpace(l), "--") {
				lines = append(lines, l)
			}
		}
		s = strings.TrimSpace(strings.Join(lines, "\n"))
		s = strings.TrimSuffix(s, ";")
		if s == "" {
			continue
		}
		if _, err := db.Exec(s); err != nil {
			t.Fatalf("第 %d 段失敗: %v\nSQL:\n%s", i+1, err, s)
		}
	}
}

// 每個資料庫的容器都只起一次，所有測試共用；各測試用不同的資料表名。
type dbHandle struct {
	once  sync.Once
	db    *sql.DB
	err   error
	start func() (*sql.DB, func(), error)
	stop  func()
}

func (h *dbHandle) get(t *testing.T) *sql.DB {
	t.Helper()
	h.once.Do(func() {
		db, stop, err := h.start()
		h.db, h.stop, h.err = db, stop, err
	})
	if h.err != nil {
		t.Skipf("略過：無法啟動容器（需要 Docker）: %v", h.err)
	}
	return h.db
}

func (h *dbHandle) close() {
	if h.db != nil {
		h.db.Close()
	}
	if h.stop != nil {
		h.stop()
	}
}

var (
	mysqlHandle    = &dbHandle{start: startMySQL}
	postgresHandle = &dbHandle{start: startPostgres}
	mssqlHandle    = &dbHandle{start: startMSSQL}
)

func mysqlDB(t *testing.T) *sql.DB    { return mysqlHandle.get(t) }
func postgresDB(t *testing.T) *sql.DB { return postgresHandle.get(t) }
func mssqlDB(t *testing.T) *sql.DB    { return mssqlHandle.get(t) }

// waitReady 等到真的連得上。
func waitReady(db *sql.DB, d time.Duration) error {
	deadline := time.Now().Add(d)
	var err error
	for {
		if err = db.Ping(); err == nil {
			return nil
		}
		if time.Now().After(deadline) {
			return err
		}
		time.Sleep(time.Second)
	}
}

func startMySQL() (*sql.DB, func(), error) {
	ctx := context.Background()
	c, err := tcmysql.Run(ctx, mysqlImage,
		tcmysql.WithDatabase("turn2sql"),
		tcmysql.WithUsername("t2s"),
		tcmysql.WithPassword("t2s"),
	)
	if err != nil {
		return nil, nil, err
	}
	stop := func() { testcontainers.TerminateContainer(c) }
	dsn, err := c.ConnectionString(ctx, "charset=utf8mb4", "parseTime=true", "multiStatements=false")
	if err != nil {
		return nil, stop, err
	}
	db, err := sql.Open("mysql", dsn)
	if err != nil {
		return nil, stop, err
	}
	return db, stop, waitReady(db, 60*time.Second)
}

func startPostgres() (*sql.DB, func(), error) {
	ctx := context.Background()
	c, err := tcpostgres.Run(ctx, postgresImage,
		tcpostgres.WithDatabase("turn2sql"),
		tcpostgres.WithUsername("t2s"),
		tcpostgres.WithPassword("t2s"),
		tcpostgres.BasicWaitStrategies(),
	)
	if err != nil {
		return nil, nil, err
	}
	stop := func() { testcontainers.TerminateContainer(c) }
	dsn, err := c.ConnectionString(ctx, "sslmode=disable")
	if err != nil {
		return nil, stop, err
	}
	db, err := sql.Open("postgres", dsn)
	if err != nil {
		return nil, stop, err
	}
	return db, stop, waitReady(db, 60*time.Second)
}

func startMSSQL() (*sql.DB, func(), error) {
	ctx := context.Background()
	c, err := tcmssql.Run(ctx, mssqlImage,
		tcmssql.WithAcceptEULA(),
		tcmssql.WithPassword("Turn2SQL!pass1"),
	)
	if err != nil {
		return nil, nil, err
	}
	stop := func() { testcontainers.TerminateContainer(c) }
	dsn, err := c.ConnectionString(ctx)
	if err != nil {
		return nil, stop, err
	}
	db, err := sql.Open("sqlserver", dsn)
	if err != nil {
		return nil, stop, err
	}
	// SQL Server 啟動較慢
	return db, stop, waitReady(db, 120*time.Second)
}

func TestMain(m *testing.M) {
	code := m.Run()
	for _, h := range []*dbHandle{mysqlHandle, postgresHandle, mssqlHandle} {
		h.close()
	}
	os.Exit(code)
}
