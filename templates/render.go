package templates

import (
	"html/template"
	"io"
)

var indexTmpl *template.Template

func init() {
	indexTmpl = template.Must(
		template.New("base").ParseFiles(
			"templates/layout.html",
			"templates/index.html",
		),
	)
}

// RenderIndex renders the Turn2SQL shell page.
func RenderIndex(w io.Writer) error {
	return indexTmpl.ExecuteTemplate(w, "layout", nil)
}
