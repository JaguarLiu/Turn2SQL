🌐 Language: [English](readme.md) · **繁體中文**

# Turn2SQL

一個 Go 撰寫的 Web 應用程式，用於上傳 Excel／CSV 檔案並轉換成多種類型的 SQL 敘述。前端是 Windows 95 復古風格的介面，在瀏覽器端解析試算表並直接產生 SQL DDL／DML。範本可透過匿名 **Sync Code** 在多台裝置間同步。

## 功能特色

- 以拖放或檔案選擇器上傳 Excel（`.xlsx`／`.xls`）或 CSV 檔
- 使用 SheetJS 在瀏覽器端解析 — 預覽不需往返伺服器
- 指定標題列、重新命名／變更欄位型別、就地編輯儲存格（debounce 持久化 — 編輯過程不會重繪整張表）
- 支援 MySQL、PostgreSQL、SQL Server、SQLite、ANSI SQL 的 SQL 產生
- 輸出模式：**CREATE**、**INSERT**、**UPDATE**（透過 listbox 對話框挑選 WHERE 欄位，至少一個）、**CREATE & INSERT**
- **跨裝置同步（Sync Code）：**
  - 匿名 **Sync Code**（10 字元 token）— Toolbar 的 **🔗 Share** 按鈕彈出對話框顯示 Code 與可分享 URL（`/sync/{code}`），各帶 Copy 按鈕
  - **📥 Import** 按鈕 — 在另一台裝置貼上 Sync Code,即可連到同一個工作區;範本會與本機現有範本合併
- 離線優先：所有編輯先寫入本地，背景排入同步佇列，連線恢復自動重試
- 主題配色（Teal／Navy／Plum／Olive）、字體平滑切換、範例資料載入

## 系統需求

- Go 1.21 或更新版本

## 安裝與啟動

```bash
git clone <repo-url>
cd turn2sql
go mod download
go run main.go
```

開啟 `http://localhost:8000`。SQLite 資料庫（`data.db`）會在首次執行時自動建立。

## 使用方式

### 基本編輯

1. 開啟網站 — 若尚無儲存範本，會自動彈出上傳對話框
2. 拖放或選擇 Excel／CSV 檔；指定標題列
3. 直接在表格中編輯欄位、型別、儲存格
4. 選擇輸出模式；若選 **UPDATE**，會彈出對話框讓你挑選要作為 `WHERE` 條件的欄位
5. 按 **Preview SQL** 或 **Convert & Download .sql** 匯出

### 跨裝置同步

**Share（產生／複製 Sync Code）：** 點 Toolbar 的 **🔗 Share** → 對話框顯示目前 Sync Code 與可分享 URL（例如 `http://host/sync/{code}`），各自有 Copy 按鈕。若尚未產生，對話框會提供行內的「產生 Sync Code」按鈕。

**Import（匯入其他裝置的 Sync Code）：** 點 Toolbar 的 **📥 Import** → 貼上 Code 即可切換本機到該工作區,範本會與本機現有範本合併。

**分享連結：** 在新瀏覽器開啟 `http://host/sync/{code}` 會自動套用該 Code（網址會被清除）。

## Production 建置

### 直接編譯 Go binary

```bash
go build -o turn2sql
```

將執行檔與 `templates/`、`static/` 一起部署。`data.db` 會於工作目錄首次執行時建立（或依 `DATABASE_PATH` 指定的位置）— 請掛載到持久化 volume。

### Docker / Docker Compose

```bash
docker compose up -d --build
# → http://localhost:8000
```

- 使用 multi-stage `Dockerfile` 建置（純 Go SQLite,不需 CGO）
- 資料持久化在命名 volume `turn2sql-data`,掛載到 `/app/data`(`DATABASE_PATH=/app/data/data.db`)
- 若想改成 host 目錄掛載(方便備份),將 `docker-compose.yml` 的 `volumes:` 改為 `- ./data:/app/data`
- 看 log / 停止:
  ```bash
  docker compose logs -f
  docker compose down         # 保留 data volume
  docker compose down -v      # 同時移除 data volume(會清空資料)
  ```

### 環境變數

| 變數 | 預設 | 說明 |
|---|---|---|
| `DATABASE_PATH` | `./data.db` | SQLite 檔案路徑 |
| `GIN_MODE` | `debug` | 上線時設為 `release` |

## 授權

[MIT License](LICENSE)
