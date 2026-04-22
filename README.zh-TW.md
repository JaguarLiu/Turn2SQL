🌐 Language: [English](readme.md) · **繁體中文**

# Turn2SQL

一個 Go 撰寫的 Web 應用程式，用於上傳 Excel／CSV 檔案並轉換成多種類型的 SQL 敘述。前端是 Windows 95 復古風格的介面，在瀏覽器端解析試算表並直接產生 SQL DDL／DML。範本可透過匿名 **Sync Code** 或 **註冊帳號** 在多台裝置間同步。

## 功能特色

- 以拖放或檔案選擇器上傳 Excel（`.xlsx`／`.xls`）或 CSV 檔
- 使用 SheetJS 在瀏覽器端解析 — 預覽不需往返伺服器
- 指定標題列、重新命名／變更欄位型別、就地編輯儲存格（debounce 持久化 — 編輯過程不會重繪整張表）
- 支援 MySQL、PostgreSQL、SQL Server、SQLite、ANSI SQL 的 SQL 產生
- 輸出模式：**CREATE**、**INSERT**、**UPDATE**（透過 listbox 對話框挑選 WHERE 欄位，至少一個）、**CREATE & INSERT**
- **跨裝置同步：**
  - 匿名 **Sync Code**（10 字元 token）— Toolbar 的 **🔗 Share** 按鈕彈出對話框顯示 Code 與可分享 URL（`/sync/{code}`），各帶 Copy 按鈕
  - **📥 Import** 按鈕 — 貼上 Sync Code 匯入工作區；已登入時會將該工作區合併到帳號（claim）並刪除匿名來源
  - **帳號登入**（分步對話框）— 輸入 email 後後端檢查是否存在，存在則要求密碼，不存在則直接提供註冊。登入後工作區自動綁定帳號，任何登入瀏覽器皆可同步
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

**Import（匯入他人的 Sync Code，或從其他裝置帶回的 Code）：** 點 Toolbar 的 **📥 Import** → 貼上 Code。
- 已登入 → 把該工作區的範本合併到你的帳號（claim），來源匿名工作區會刪除
- 未登入 → 切換本機為該 Code 的匿名工作區

**分享連結：** 在新瀏覽器開啟 `http://host/sync/{code}` 會自動套用該 Code（網址會被清除；若已登入則略過）。

**帳號登入：** 點選左側範本列表上方的 👤 按鈕。
1. 輸入 email → **Next →**
2. 後端回報該帳號是否存在
3. 輸入密碼後按 **Login**（已存在）或 **Register**（新帳號）。註冊時目前的本地範本會自動上傳到新帳號

## Production 建置

```bash
go build -o turn2sql
```

將執行檔與 `templates/`、`static/` 一起部署。`data.db` 會於工作目錄首次執行時建立 — 請掛載到持久化 volume。

## 授權

[MIT License](LICENSE)
