package templates

import (
	"html/template"
	"io"
	"os"
	"path/filepath"
	"sync"
)

var (
	once      sync.Once
	indexTmpl *template.Template
	loadErr   error
)

// dir 回傳模板目錄；TEMPLATES_DIR 可覆寫（測試或非標準部署路徑用）。
func dir() string {
	if d := os.Getenv("TEMPLATES_DIR"); d != "" {
		return d
	}
	return "templates"
}

// Load 解析模板，只會執行一次。
// main.go 在啟動時呼叫一次，讓路徑錯誤能立刻被發現，而不是等到第一個請求。
func Load() error {
	once.Do(func() {
		d := dir()
		indexTmpl, loadErr = template.New("base").ParseFiles(
			filepath.Join(d, "layout.html"),
			filepath.Join(d, "index.html"),
		)
	})
	return loadErr
}

// RenderIndex renders the Turn2SQL shell page.
func RenderIndex(w io.Writer) error {
	if err := Load(); err != nil {
		return err
	}
	return indexTmpl.ExecuteTemplate(w, "layout", nil)
}
