package models

import (
	"fmt"
	"os"
	"path/filepath"

	"github.com/xuri/excelize/v2"
)

// ExcelData represents the data extracted from an Excel file
type ExcelData struct {
	Filename  string     `json:"filename"`
	SheetName string     `json:"sheetName"`
	Headers   []string   `json:"headers"` // Column labels (A, B, C, etc.)
	Rows      [][]string `json:"rows"`    // All rows including the first row
}

// ProcessExcelFile reads and processes the uploaded Excel file
func ProcessExcelFile(filePath string) (*ExcelData, error) {
	f, err := excelize.OpenFile(filePath)
	if err != nil {
		return nil, fmt.Errorf("failed to open Excel file: %w", err)
	}
	defer f.Close()

	// Get the first sheet name
	sheetName := f.GetSheetName(0)
	if sheetName == "" {
		return nil, fmt.Errorf("no sheet found in Excel file")
	}

	// Get all rows in the sheet
	rows, err := f.GetRows(sheetName)
	if err != nil {
		return nil, fmt.Errorf("failed to get rows from sheet: %w", err)
	}

	if len(rows) == 0 {
		return nil, fmt.Errorf("no data found in Excel file")
	}

	// Find the maximum column count from all rows
	maxColumns := 0
	for _, row := range rows {
		if len(row) > maxColumns {
			maxColumns = len(row)
		}
	}

	// Create placeholder headers based on column count (A, B, C, etc.)
	headers := make([]string, maxColumns)
	for i := 0; i < maxColumns; i++ {
		headers[i] = columnToLetter(i)
	}

	// All rows are treated as data
	return &ExcelData{
		Filename:  filepath.Base(filePath),
		SheetName: sheetName,
		Headers:   headers,
		Rows:      rows,
	}, nil
}

// columnToLetter converts a column index to a letter (A, B, C, ..., Z, AA, AB, ...)
func columnToLetter(i int) string {
	result := ""
	for i >= 0 {
		result = string(rune('A'+i%26)) + result
		i = i/26 - 1
	}
	return result
}

// EditCell 修改指定儲存格的值並儲存到 Excel 檔案
func EditCell(filePath string, row int, col int, value string) (*ExcelData, error) {
	f, err := excelize.OpenFile(filePath)
	if err != nil {
		return nil, fmt.Errorf("failed to open Excel file: %w", err)
	}
	defer f.Close()

	sheetName := f.GetSheetName(0)
	if sheetName == "" {
		return nil, fmt.Errorf("no sheet found in Excel file")
	}

	// Excelize 使用 1-based 座標
	cellRef, err := excelize.CoordinatesToCellName(col+1, row+1)
	if err != nil {
		return nil, fmt.Errorf("invalid cell coordinates: %w", err)
	}

	if err := f.SetCellValue(sheetName, cellRef, value); err != nil {
		return nil, fmt.Errorf("failed to set cell value: %w", err)
	}

	if err := f.Save(); err != nil {
		return nil, fmt.Errorf("failed to save Excel file: %w", err)
	}

	return ProcessExcelFile(filePath)
}

// DeleteRow 刪除指定行並儲存到 Excel 檔案
func DeleteRow(filePath string, row int) (*ExcelData, error) {
	f, err := excelize.OpenFile(filePath)
	if err != nil {
		return nil, fmt.Errorf("failed to open Excel file: %w", err)
	}
	defer f.Close()

	sheetName := f.GetSheetName(0)
	if sheetName == "" {
		return nil, fmt.Errorf("no sheet found in Excel file")
	}

	// Excelize 使用 1-based 行索引
	if err := f.RemoveRow(sheetName, row+1); err != nil {
		return nil, fmt.Errorf("failed to remove row: %w", err)
	}

	if err := f.Save(); err != nil {
		return nil, fmt.Errorf("failed to save Excel file: %w", err)
	}

	return ProcessExcelFile(filePath)
}

// DeleteColumn 刪除指定列並儲存到 Excel 檔案
func DeleteColumn(filePath string, col int) (*ExcelData, error) {
	f, err := excelize.OpenFile(filePath)
	if err != nil {
		return nil, fmt.Errorf("failed to open Excel file: %w", err)
	}
	defer f.Close()

	sheetName := f.GetSheetName(0)
	if sheetName == "" {
		return nil, fmt.Errorf("no sheet found in Excel file")
	}

	// 將列索引轉換為欄名（Excelize 使用 1-based）
	colName, err := excelize.ColumnNumberToName(col + 1)
	if err != nil {
		return nil, fmt.Errorf("invalid column index: %w", err)
	}

	if err := f.RemoveCol(sheetName, colName); err != nil {
		return nil, fmt.Errorf("failed to remove column: %w", err)
	}

	if err := f.Save(); err != nil {
		return nil, fmt.Errorf("failed to save Excel file: %w", err)
	}

	return ProcessExcelFile(filePath)
}

// SaveUploadedFile saves the uploaded file to the temporary directory
func SaveUploadedFile(fileData []byte, filename string) (string, error) {
	// Create uploads directory if it doesn't exist
	uploadsDir := "./uploads"
	if err := os.MkdirAll(uploadsDir, 0755); err != nil {
		return "", fmt.Errorf("failed to create uploads directory: %w", err)
	}

	// Create a unique filename to avoid collisions
	filePath := filepath.Join(uploadsDir, filename)

	// Write file to disk
	if err := os.WriteFile(filePath, fileData, 0644); err != nil {
		return "", fmt.Errorf("failed to save file: %w", err)
	}

	return filePath, nil
}
