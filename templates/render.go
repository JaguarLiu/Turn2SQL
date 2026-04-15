package templates

import (
	"html/template"
	"io"
	"turn/models"
)

var funcMap = template.FuncMap{
	"columnLabel": columnLabel,
	"add":         func(a, b int) int { return a + b },
	"seq": func(start, end int) []int {
		s := make([]int, 0, end-start)
		for i := start; i < end; i++ {
			s = append(s, i)
		}
		return s
	},
}

var (
	indexTmpl     *template.Template
	dataPageTmpl  *template.Template
	dataTableTmpl *template.Template
)

func init() {
	indexTmpl = template.Must(
		template.New("base").Funcs(funcMap).ParseFiles(
			"templates/layout.html",
			"templates/index.html",
		),
	)
	dataPageTmpl = template.Must(
		template.New("base").Funcs(funcMap).ParseFiles(
			"templates/layout.html",
			"templates/data_page.html",
			"templates/data_table.html",
		),
	)
	dataTableTmpl = template.Must(
		template.New("base").Funcs(funcMap).ParseFiles(
			"templates/data_table.html",
		),
	)
}

// columnLabel 將列索引轉換為 Excel 風格欄名 (A, B, ..., Z, AA, AB, ...)
func columnLabel(i int) string {
	result := ""
	for i >= 0 {
		result = string(rune('A'+i%26)) + result
		i = i/26 - 1
	}
	return result
}

// RenderIndex 渲染上傳首頁（完整頁面）
func RenderIndex(w io.Writer) error {
	return indexTmpl.ExecuteTemplate(w, "layout", nil)
}

// RenderDataTable 渲染表格 HTML 片段（供 htmx swap）
func RenderDataTable(w io.Writer, data *models.ExcelData) error {
	return dataTableTmpl.ExecuteTemplate(w, "data_table", data)
}

// RenderDataPage 渲染資料檢視完整頁面
func RenderDataPage(w io.Writer, data *models.ExcelData) error {
	return dataPageTmpl.ExecuteTemplate(w, "layout", data)
}
