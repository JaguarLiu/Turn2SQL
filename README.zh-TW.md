🌐 Language: [English](readme.md) · **繁體中文**

# Turn2SQL

一個 Go 撰寫的 Web 應用程式，用於上傳 Excel／CSV 檔案並轉換成多種方言的 SQL 敘述。前端是 Windows 95 復古風格的介面，在瀏覽器端解析試算表並直接產生 SQL DDL／DML。範本可透過匿名 **Sync Code** 或 **註冊帳號** 在多台裝置間同步。

## 功能特色

- 以拖放或檔案選擇器上傳 Excel（`.xlsx`／`.xls`）或 CSV 檔
- 使用 SheetJS 在瀏覽器端解析 — 預覽不需往返伺服器
- 指定標題列、重新命名／變更欄位型別、就地編輯儲存格
- 支援 MySQL、PostgreSQL、SQL Server、SQLite、ANSI SQL 的 SQL 產生
- **跨裝置同步：**
  - 匿名 **Sync Code**（10 字元小寫 token）— 在自己多台裝置間共享，免註冊
  - **帳號登入**（email + 密碼）— 工作區自動綁定帳號，任何登入瀏覽器皆可同步
  - **認領流程（Claim）** — 將匿名工作區轉為帳號所有（範本會合併過去）
- 離線優先：所有編輯先寫入本地，背景排入同步佇列，連線恢復自動重試
- 主題配色（Teal／Navy／Plum／Olive）、字體平滑切換、範例資料載入

## 技術棧

- **後端**：Go + Gin
- **資料庫**：SQLite，使用 `modernc.org/sqlite`（純 Go，無 CGO — 單一執行檔即可部署）
- **驗證**：bcrypt 密碼雜湊、HttpOnly session cookie（30 天）、伺服器端 session 表
- **樣板**：Go 標準 `html/template`
- **Excel／CSV（瀏覽器端）**：SheetJS（`xlsx.full.min.js`，本地服務）
- **UI**：Vanilla JS，無建置流程。Classic scripts 按順序載入
- **樣式**：自製 Windows 95 風格（`win95.css`），字型本地服務

## 專案結構

```
turn2sql/
├── main.go                    # DB 初始化、路由、middleware 註冊
├── go.mod / go.sum
├── handlers/
│   ├── index.go               # Shell 頁面渲染
│   ├── auth.go                # 註冊／登入／登出／me
│   └── sync.go                # 工作區 + 範本 CRUD
├── middleware/
│   └── auth.go                # CurrentUser、RequireWorkspace、RequireUser
├── models/
│   ├── db.go                  # SQLite 開啟 + migration（WAL、FK on）
│   ├── user.go                # bcrypt 使用者 CRUD
│   ├── session.go             # Session token
│   └── workspace.go           # 工作區 + 範本 CRUD、claim、樂觀鎖
├── templates/
│   ├── render.go              # Template 初始化
│   ├── layout.html            # Win95 shell + boot script
│   └── index.html             # 載入中佔位（由 client boot 覆寫）
├── static/
│   ├── css/
│   │   └── win95.css
│   ├── fonts/
│   │   ├── ms_sans_serif.woff2
│   │   └── ms_sans_serif_bold.woff2
│   └── js/
│       ├── xlsx.full.min.js   # SheetJS（本地）
│       ├── sql.js             # SQL 產生
│       ├── app.js             # App 狀態、localStorage、渲染
│       ├── sync.js            # Sync 模組（pull／push／auth）
│       └── dialogs.js         # 對話框（upload／field／account／…）
└── data.db                    # SQLite DB（首次執行時建立，已 gitignore）
```

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
4. 使用 SQL 預覽對話框複製指定方言的 DDL／DML

### 跨裝置同步

點擊標題列的 👤 按鈕開啟帳號對話框。

**匿名同步（免註冊）：**
- `🔗 Sync Code` 分頁 → **產生新的 Sync Code** → 複製代碼
- 另一台裝置開同樣對話框 → **Use code** → 貼上 → 所有範本即會同步

**帳號同步：**
- `Register` 分頁 → email + 密碼（≥ 8 字元） → 目前本地範本會自動上傳
- 任何瀏覽器以相同帳密登入即可看到同一個工作區

**從匿名遷移到帳號：**
- 於裝置 A 產生 Sync Code，於裝置 B 以同 email 註冊／登入
- 於裝置 B 的帳號對話框點 **認領 Sync Code 到此帳號**，輸入代碼
- 匿名工作區的範本會合併到你帳號的工作區

## API 參考

| 方法 | 路徑 | 驗證 | 說明 |
|---|---|---|---|
| POST | `/api/auth/register` | — | 建立帳號並自動登入 |
| POST | `/api/auth/login` | — | 登入,設定 session cookie |
| POST | `/api/auth/logout` | cookie | 撤銷 session |
| GET  | `/api/auth/me` | — | 目前登入狀態 |
| POST | `/api/workspace/anon` | — | 建立新的匿名工作區 + Sync Code |
| POST | `/api/workspace/claim` | user | 將 Sync Code 認領至帳號(合併範本) |
| GET  | `/api/workspace` | user 或 `X-Sync-Code` | 目前工作區資訊 |
| GET  | `/api/templates` | user 或 `X-Sync-Code` | 取得範本列表 |
| PUT  | `/api/templates/:id` | user 或 `X-Sync-Code` | Upsert(`updatedAt` 過期回 409) |
| DELETE | `/api/templates/:id` | user 或 `X-Sync-Code` | 刪除 |

Sync Code 工作區請帶 `X-Sync-Code: <code>` header。登入請求則使用 `t2s_session` 這個 HttpOnly cookie。

## 架構說明

- **客戶端優先。** SheetJS 負責檔案解析,`app.js` 管 `App` 狀態,`sql.js` 產生 SQL。核心流程不經過伺服器
- **同步是可選的。** 未輸入 Code 也未登入 = 完全本地(只用 `localStorage`)。任一啟用後會先 pull 一次,之後背景持續 push
- **樂觀更新。** 所有變更先寫 `localStorage`;`Sync.markDirty(id)` 會 debounce 600ms 再送出。離線的寫入排入佇列,連線恢復後重試
- **樂觀鎖。** 每個範本帶 `updatedAt`;伺服器對早於已存值的寫入回 `409 Conflict`
- **一人一個工作區。** 以 `workspaces.owner_user_id` 的 partial unique index 強制。匿名工作區(owner 為 NULL)可任意建立

## 安全性說明

- 密碼使用 bcrypt 雜湊(default cost),最少 8 字元
- Session cookie 設 `HttpOnly`、`SameSite=Lax`。**未** 設 `Secure` — 上 TLS 時請自行啟用
- Sync Code 不是身分驗證,而是 bearer capability。持有 Code 者即可讀寫該工作區,請當成 Google Docs 分享連結對待
- 尚未提供 email 驗證與密碼重設流程
- CSRF:狀態變更端點收 JSON;靠 `SameSite=Lax` cookie 提供基本保護。若要跨來源使用請自行加 token

## Production 建置

```bash
go build -o turn2sql
```

將執行檔與 `templates/`、`static/` 一起部署。`data.db` 會於工作目錄首次執行時建立 — 請掛載到持久化 volume。

## 授權

[MIT License](LICENSE)
