// Dialogs — upload, field edit, confirm, SQL preview

// ----- upload dialog -----
function openUploadDialog({ forceNew = false } = {}) {
  const existing = document.getElementById('modal-host');
  existing.innerHTML = '';
  App.stagingData = null;

  const html = `
    <div class="modal-overlay" id="upload-modal">
      <div class="dialog" style="min-width:460px">
        <div class="title-bar">
          <div class="title-bar-text">
            <svg width="14" height="14" viewBox="0 0 16 16" shape-rendering="crispEdges">
              <rect x="1" y="3" width="14" height="11" fill="#c0c0c0" stroke="#000"/>
              <polygon points="1,3 6,3 7,4 15,4 15,14 1,14" fill="#ffcc66" stroke="#000"/>
            </svg>
            Upload File — Turn2SQL
          </div>
          <div class="title-bar-controls">
            <button onclick="closeUploadDialog()" aria-label="close">✕</button>
          </div>
        </div>
        <div class="dialog-body">
          <p style="margin:0 0 6px">選擇 Excel (.xlsx/.xls) 或 CSV 檔案:</p>
          <div class="drop-zone" id="drop-zone">
            <span class="big">▼</span>
            把檔案拖到這裡,或<u style="color:#000080">點此選擇檔案</u><br/>
            <span class="small">支援 .xlsx · .xls · .csv — 第一列會作為 header 自動匯入</span>
          </div>
          <input type="file" id="file-input" accept=".xlsx,.xls,.csv" style="display:none">
        </div>
        <div class="dialog-footer">
          <button class="w95" onclick="closeUploadDialog()">Cancel</button>
        </div>
      </div>
    </div>`;
  existing.innerHTML = html;

  const dz = document.getElementById('drop-zone');
  const fi = document.getElementById('file-input');
  dz.onclick = () => fi.click();
  dz.ondragover = e => { e.preventDefault(); dz.classList.add('drag-over'); };
  dz.ondragleave = () => dz.classList.remove('drag-over');
  dz.ondrop = e => { e.preventDefault(); dz.classList.remove('drag-over'); handleFile(e.dataTransfer.files[0]); };
  fi.onchange = () => handleFile(fi.files[0]);
}
function closeUploadDialog() {
  const host = document.getElementById('modal-host');
  if (host) host.innerHTML = '';
}

function handleFile(file) {
  if (!file) return;
  const name = file.name;
  const ext = (name.split('.').pop() || '').toLowerCase();
  const reader = new FileReader();

  const importRows = (rows) => {
    if (!rows || !rows.length) { openAlert('檔案沒有資料。'); return; }
    createTemplateFromData(file.name, rows, 0);
    closeUploadDialog();
  };

  if (ext === 'csv') {
    reader.onload = e => importRows(parseCSV(e.target.result));
    reader.readAsText(file);
  } else if (ext === 'xlsx' || ext === 'xls') {
    reader.onload = e => {
      const data = new Uint8Array(e.target.result);
      const wb = XLSX.read(data, { type: 'array' });
      const ws = wb.Sheets[wb.SheetNames[0]];
      const rows = XLSX.utils.sheet_to_json(ws, { header: 1, defval: '' });
      importRows(rows);
    };
    reader.readAsArrayBuffer(file);
  } else {
    openAlert('不支援的檔案格式。請使用 .xlsx、.xls 或 .csv');
  }
}

function parseCSV(text) {
  const rows = [];
  let row = [], cell = '', q = false;
  for (let i = 0; i < text.length; i++) {
    const c = text[i];
    if (q) {
      if (c === '"' && text[i+1] === '"') { cell += '"'; i++; }
      else if (c === '"') { q = false; }
      else cell += c;
    } else {
      if (c === '"') q = true;
      else if (c === ',') { row.push(cell); cell = ''; }
      else if (c === '\r') { /* skip */ }
      else if (c === '\n') { row.push(cell); rows.push(row); row = []; cell = ''; }
      else cell += c;
    }
  }
  if (cell.length || row.length) { row.push(cell); rows.push(row); }
  return rows.filter(r => r.some(c => String(c).trim() !== ''));
}

// ----- field edit dialog -----
function openFieldDialog(idx) {
  closeCtxMenu();
  const t = getActive(); const f = t.fields[idx];
  const host = document.getElementById('modal-host');
  host.innerHTML = `
    <div class="modal-overlay">
      <div class="dialog" style="min-width:340px">
        <div class="title-bar">
          <div class="title-bar-text">
            <svg width="14" height="14" viewBox="0 0 16 16" shape-rendering="crispEdges">
              <rect x="2" y="2" width="12" height="12" fill="#c0c0c0" stroke="#000"/>
              <polygon points="4,11 5,9 9,5 11,7 7,11" fill="#ffd700" stroke="#000"/>
            </svg>
            Edit Field — Column ${colLetter(idx)}
          </div>
          <div class="title-bar-controls"><button onclick="closeModal()">✕</button></div>
        </div>
        <div class="dialog-body">
          <fieldset class="w95">
            <legend>Field Properties</legend>
            <div style="display:flex;align-items:center;gap:6px;margin:4px 0">
              <label style="width:70px">Name:</label>
              <input class="w95" id="fld-name" type="text" value="${escapeAttr(f.name)}" style="flex:1" autofocus>
            </div>
            <div style="display:flex;align-items:center;gap:6px;margin:4px 0">
              <label style="width:70px">Data Type:</label>
              <select class="w95" id="fld-type" style="flex:1">
                ${Turn2SQL.DATA_TYPES.map(dt => `<option value="${dt}" ${dt===f.type?'selected':''}>${dt}</option>`).join('')}
              </select>
            </div>
            <div style="font-size:11px;color:#505050;margin-top:8px;padding:4px;background:#ffffd8;border:1px solid #808080">
              <b>提示:</b> VARCHAR=文字 · INT=整數 · DECIMAL=小數 · DATE=日期 · BOOLEAN=真偽
            </div>
          </fieldset>
        </div>
        <div class="dialog-footer">
          <button class="w95" onclick="closeModal()">Cancel</button>
          <button class="w95" onclick="saveField(${idx})" style="font-weight:bold">OK</button>
        </div>
      </div>
    </div>`;
  setTimeout(() => document.getElementById('fld-name')?.focus(), 0);
}
function saveField(idx) {
  const name = document.getElementById('fld-name').value.trim();
  const type = document.getElementById('fld-type').value;
  if (!name) { openAlert('欄位名稱不能空白!'); return; }
  updateActive(t => { t.fields[idx] = { ...t.fields[idx], name, type }; });
  closeModal();
}

// ----- SQL preview dialog -----
function previewSQL() {
  const t = getActive(); if (!t) return;
  if (t.mode === 'update' && (!t.whereCols || t.whereCols.length === 0)) {
    openAlert('UPDATE 模式需要至少勾選一個欄位作為 WHERE 條件。');
    return;
  }
  const sql = Turn2SQL.generateSQL({
    tableName: t.tableName, fields: t.fields, rows: t.rows, dialect: t.dialect, mode: t.mode,
    whereCols: t.whereCols || [],
  });
  const host = document.getElementById('modal-host');
  host.innerHTML = `
    <div class="modal-overlay">
      <div class="dialog" style="min-width:640px;max-width:90vw">
        <div class="title-bar">
          <div class="title-bar-text">
            <svg width="14" height="14" viewBox="0 0 16 16" shape-rendering="crispEdges">
              <ellipse cx="8" cy="3" rx="6" ry="2" fill="#c0c0c0" stroke="#000"/>
              <path d="M2 3 V13 A6 2 0 0 0 14 13 V3" fill="#c0c0c0" stroke="#000"/>
            </svg>
            SQL Preview — ${escapeHtml(t.tableName)}.sql
          </div>
          <div class="title-bar-controls"><button onclick="closeModal()">✕</button></div>
        </div>
        <div class="dialog-body">
          <textarea class="w95" readonly style="width:100%;height:360px;font-family:Consolas,Courier New,monospace;font-size:12px;white-space:pre;background:#fff">${escapeHtml(sql)}</textarea>
        </div>
        <div class="dialog-footer">
          <button class="w95" onclick="navigator.clipboard.writeText(document.querySelector('.modal-overlay textarea').value); this.textContent='Copied!'">Copy</button>
          <button class="w95" onclick="downloadSQL()" style="font-weight:bold">Download .sql</button>
          <button class="w95" onclick="closeModal()">Close</button>
        </div>
      </div>
    </div>`;
}

function downloadSQL() {
  const t = getActive(); if (!t) return;
  if (t.mode === 'update' && (!t.whereCols || t.whereCols.length === 0)) {
    openAlert('UPDATE 模式需要至少勾選一個欄位作為 WHERE 條件。');
    return;
  }
  const sql = Turn2SQL.generateSQL({
    tableName: t.tableName, fields: t.fields, rows: t.rows, dialect: t.dialect, mode: t.mode,
    whereCols: t.whereCols || [],
  });
  const blob = new Blob([sql], { type: 'text/plain;charset=utf-8' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = Turn2SQL.safeTableName(t.tableName) + '.sql';
  a.click();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}

// ----- generic modals -----
function openConfirm(msg, onOk) {
  const host = document.getElementById('modal-host');
  host.innerHTML = `
    <div class="modal-overlay">
      <div class="dialog" style="min-width:320px">
        <div class="title-bar">
          <div class="title-bar-text">⚠ Confirm</div>
          <div class="title-bar-controls"><button onclick="closeModal()">✕</button></div>
        </div>
        <div class="dialog-body" style="display:flex;gap:12px;align-items:center">
          <svg width="32" height="32" viewBox="0 0 32 32" shape-rendering="crispEdges">
            <polygon points="16,2 30,28 2,28" fill="#ffcc00" stroke="#000"/>
            <rect x="15" y="10" width="2" height="10" fill="#000"/>
            <rect x="15" y="22" width="2" height="2" fill="#000"/>
          </svg>
          <div>${escapeHtml(msg)}</div>
        </div>
        <div class="dialog-footer">
          <button class="w95" onclick="closeModal()">Cancel</button>
          <button class="w95" id="confirm-ok" style="font-weight:bold">OK</button>
        </div>
      </div>
    </div>`;
  document.getElementById('confirm-ok').onclick = () => { closeModal(); onOk(); };
}
function openAlert(msg) {
  const host = document.getElementById('modal-host');
  host.innerHTML = `
    <div class="modal-overlay">
      <div class="dialog" style="min-width:300px">
        <div class="title-bar">
          <div class="title-bar-text">Turn2SQL</div>
          <div class="title-bar-controls"><button onclick="closeModal()">✕</button></div>
        </div>
        <div class="dialog-body" style="display:flex;gap:12px;align-items:center">
          <svg width="32" height="32" viewBox="0 0 32 32" shape-rendering="crispEdges">
            <circle cx="16" cy="16" r="14" fill="#fff" stroke="#000"/>
            <text x="16" y="23" text-anchor="middle" font-family="Times New Roman" font-style="italic" font-weight="bold" font-size="20" fill="#000080">i</text>
          </svg>
          <div>${escapeHtml(msg)}</div>
        </div>
        <div class="dialog-footer"><button class="w95" onclick="closeModal()" style="font-weight:bold">OK</button></div>
      </div>
    </div>`;
}
function closeModal() { document.getElementById('modal-host').innerHTML = ''; }

// ---------- Account dialog ----------
// Stepped login flow:
//   step 1 → email input
//   step 2 → password (login if email exists, register if not)
const AccountState = { step: 1, email: '', exists: null };

function openAccountDialog() {
  AccountState.step = 1;
  AccountState.email = '';
  AccountState.exists = null;
  renderAccountDialog();
}

function renderAccountDialog() {
  const host = document.getElementById('modal-host');
  const s = Sync.status();
  const header = (title) => `
    <div class="title-bar">
      <div class="title-bar-text">👤 ${title}</div>
      <div class="title-bar-controls"><button onclick="closeModal()">✕</button></div>
    </div>`;

  let body = '';
  if (s.user) {
    body = `
      <div class="dialog-body">
        <p style="margin:0 0 8px"><b>已登入:</b> ${escapeHtml(s.user.email)}</p>
        <p style="margin:0 0 12px;font-size:11px;color:#404040">範本會自動同步到你的帳號,所有登入此帳號的裝置都會看到。</p>
        <div class="row"><button class="w95" onclick="accountLogout()">登出</button></div>
      </div>`;
  } else if (AccountState.step === 1) {
    body = `
      <div class="dialog-body">
        <p style="margin:0 0 8px;font-size:11px;color:#404040">請輸入 Email 以登入或註冊。</p>
        <div class="row">
          <label style="width:70px">Account:</label>
          <input class="w95" id="auth-email" type="email" autocomplete="username"
                 value="${escapeAttr(AccountState.email)}"
                 style="flex:1" onkeydown="if(event.key==='Enter')accountCheckEmail()" autofocus>
        </div>
      </div>
      <div class="dialog-footer">
        <button class="w95" onclick="closeModal()">Cancel</button>
        <button class="w95" onclick="accountCheckEmail()" style="font-weight:bold">Next →</button>
      </div>`;
  } else {
    const isLogin = AccountState.exists === true;
    body = `
      <div class="dialog-body">
        <div class="row">
          <label style="width:70px">Account:</label>
          <input class="w95" type="email" readonly value="${escapeAttr(AccountState.email)}" style="flex:1;background:#e0e0e0">
          <button class="w95 small" title="變更 Email" onclick="accountBackToStep1()">←</button>
        </div>
        ${isLogin
          ? `<p style="margin:8px 0 6px;font-size:11px;color:#006400">✓ 此帳號已存在,請輸入密碼登入。</p>`
          : `<p style="margin:8px 0 6px;font-size:11px;color:#804000">此帳號尚未註冊。填寫密碼即可建立新帳號(目前的本地範本會自動上傳)。</p>`}
        <div class="row">
          <label style="width:70px">Password:</label>
          <input class="w95" id="auth-pass" type="password"
                 autocomplete="${isLogin ? 'current-password' : 'new-password'}"
                 placeholder="${isLogin ? '' : '至少 8 字元'}"
                 style="flex:1" onkeydown="if(event.key==='Enter')${isLogin?'accountLogin()':'accountRegister()'}" autofocus>
        </div>
      </div>
      <div class="dialog-footer">
        <button class="w95" onclick="accountBackToStep1()">← Back</button>
        ${isLogin
          ? `<button class="w95" onclick="accountLogin()" style="font-weight:bold">Login</button>`
          : `<button class="w95" onclick="accountRegister()" style="font-weight:bold">Register</button>`}
      </div>`;
  }

  host.innerHTML = `
    <div class="modal-overlay" onclick="if(event.target===this)closeModal()">
      <div class="dialog" style="min-width:420px">
        ${header('Account')}
        ${body}
      </div>
    </div>`;

  setTimeout(() => {
    const f = document.getElementById(AccountState.step === 1 ? 'auth-email' : 'auth-pass');
    f?.focus();
  }, 0);
}

async function accountCheckEmail() {
  const email = document.getElementById('auth-email').value.trim().toLowerCase();
  if (!email || !email.includes('@')) { openAlert('請輸入有效的 Email'); return; }
  try {
    const exists = await Sync.checkEmail(email);
    AccountState.email = email;
    AccountState.exists = exists;
    AccountState.step = 2;
    renderAccountDialog();
  } catch (err) { openAlert('查詢失敗: ' + err.message); }
}

function accountBackToStep1() {
  AccountState.step = 1;
  AccountState.exists = null;
  renderAccountDialog();
}

async function accountLogin() {
  const pass = document.getElementById('auth-pass').value;
  if (!pass) { openAlert('請輸入密碼'); return; }
  try {
    await Sync.login(AccountState.email, pass);
    Sync.showToast('已登入: ' + AccountState.email);
    closeModal();
  } catch (err) { openAlert('登入失敗: ' + err.message); }
}

async function accountRegister() {
  const pass = document.getElementById('auth-pass').value;
  if (!pass || pass.length < 8) { openAlert('密碼至少需 8 個字元'); return; }
  try {
    await Sync.register(AccountState.email, pass);
    App.templates.forEach(t => Sync.markDirty(t.id));
    Sync.showToast('註冊成功: ' + AccountState.email);
    closeModal();
  } catch (err) { openAlert('註冊失敗: ' + err.message); }
}

async function accountLogout() {
  await Sync.logout();
  Sync.showToast('已登出');
  openAccountDialog();
}

// ----- Share (sync code) dialog -----
function openShareDialog() {
  const code = (window.Sync && Sync.currentCode) ? Sync.currentCode() : null;
  const host = document.getElementById('modal-host');
  const body = code ? (() => {
    const url = `${location.origin}/sync/${code}`;
    return `
      <div class="dialog-body">
        <div style="font-size:11px;color:#505050;margin-bottom:8px">
          任何持有此 Sync Code 的人皆可讀寫這個工作區,請當成分享連結對待。
        </div>
        <div style="display:flex;align-items:center;gap:6px;margin:6px 0">
          <label style="width:80px">Sync Code:</label>
          <input class="w95" readonly value="${escapeAttr(code)}" id="share-code"
                 style="flex:1;font-family:Consolas,monospace" onclick="this.select()">
          <button class="w95 small" onclick="copyToClipboard(document.getElementById('share-code').value, this)">Copy</button>
        </div>
        <div style="display:flex;align-items:center;gap:6px;margin:6px 0">
          <label style="width:80px">URL:</label>
          <input class="w95" readonly value="${escapeAttr(url)}" id="share-url"
                 style="flex:1;font-family:Consolas,monospace" onclick="this.select()">
          <button class="w95 small" onclick="copyToClipboard(document.getElementById('share-url').value, this)">Copy</button>
        </div>
      </div>
      <div class="dialog-footer">
        <button class="w95" onclick="closeModal()">Close</button>
      </div>`;
  })() : `
      <div class="dialog-body">
        <div style="font-size:12px;color:#505050;margin:12px 0">尚未產生 Sync Code。</div>
        <div style="font-size:11px;color:#808080">產生後即可與你的其他裝置共用此工作區的範本。</div>
      </div>
      <div class="dialog-footer">
        <button class="w95" onclick="closeModal()">Cancel</button>
        <button class="w95" style="font-weight:bold" onclick="shareDialogCreateCode()">產生 Sync Code</button>
      </div>`;
  host.innerHTML = `
    <div class="modal-overlay">
      <div class="dialog" style="min-width:440px;max-width:90vw">
        <div class="title-bar">
          <div class="title-bar-text">🔗 分享 Sync Code</div>
          <div class="title-bar-controls"><button onclick="closeModal()">✕</button></div>
        </div>
        ${body}
      </div>
    </div>`;
}

async function shareDialogCreateCode() {
  try {
    await Sync.createSyncCode();
    App.templates.forEach(t => Sync.markDirty(t.id));
    openShareDialog(); // re-render with the new code
  } catch (err) { openAlert('產生失敗: ' + err.message); }
}

window.openShareDialog = openShareDialog;
window.shareDialogCreateCode = shareDialogCreateCode;

// ----- Import (sync code) dialog -----
function openImportDialog() {
  const s = Sync.status();
  const isLogin = !!s.user;
  const host = document.getElementById('modal-host');
  host.innerHTML = `
    <div class="modal-overlay" onclick="if(event.target===this)closeModal()">
      <div class="dialog" style="min-width:420px;max-width:90vw">
        <div class="title-bar">
          <div class="title-bar-text">📥 匯入 Sync Code</div>
          <div class="title-bar-controls"><button onclick="closeModal()">✕</button></div>
        </div>
        <div class="dialog-body">
          <p style="margin:0 0 8px;font-size:11px;color:#404040">
            ${isLogin
              ? `已登入為 <b>${escapeHtml(s.user.email)}</b>。輸入 Sync Code 會將該工作區的範本<b>合併到你的帳號</b>,來源工作區會被刪除。`
              : `輸入 Sync Code 連接到該工作區;範本會與本機現有範本合併。`}
          </p>
          <div class="row">
            <label style="width:80px">Sync Code:</label>
            <input class="w95" id="import-code" type="text" placeholder="例如: j4kz9m2qx5"
                   style="flex:1;font-family:Consolas,monospace"
                   onkeydown="if(event.key==='Enter')confirmImportCode()" autofocus>
          </div>
        </div>
        <div class="dialog-footer">
          <button class="w95" onclick="closeModal()">Cancel</button>
          <button class="w95" onclick="confirmImportCode()" style="font-weight:bold">
            ${isLogin ? '合併到帳號' : '套用'}
          </button>
        </div>
      </div>
    </div>`;
}

async function confirmImportCode() {
  const code = document.getElementById('import-code').value.trim().toLowerCase();
  if (!code) { openAlert('請輸入 Sync Code'); return; }
  const s = Sync.status();
  try {
    if (s.user) {
      await Sync.claimSyncCode(code);
      Sync.showToast('已合併 workspace 到帳號');
    } else {
      await Sync.useSyncCode(code);
      Sync.showToast('已連接 Sync Code');
    }
    closeModal();
    renderNav();
    renderSheet();
  } catch (err) { openAlert('匯入失敗: ' + err.message); }
}

window.openImportDialog = openImportDialog;
window.confirmImportCode = confirmImportCode;

// ----- WHERE-cols picker dialog (for UPDATE mode) -----
function openWhereDialog() {
  const t = getActive(); if (!t) return;
  const selected = new Set(t.whereCols || []);
  const host = document.getElementById('modal-host');
  host.innerHTML = `
    <div class="modal-overlay">
      <div class="dialog" style="min-width:360px;max-width:90vw">
        <div class="title-bar">
          <div class="title-bar-text">🔑 選擇 WHERE 條件欄位</div>
          <div class="title-bar-controls"><button onclick="cancelWhereDialog()">✕</button></div>
        </div>
        <div class="dialog-body">
          <div style="font-size:11px;color:#505050;margin-bottom:6px">
            勾選做為 <b>UPDATE ... WHERE</b> 條件的欄位（至少選一個）。其餘欄位會放到 SET 子句。
          </div>
          <select id="where-listbox" class="w95" multiple size="${Math.min(10, Math.max(4, t.fields.length))}"
                  style="width:100%;font-family:Consolas,monospace;font-size:12px">
            ${t.fields.map(f => `
              <option value="${escapeAttr(f.name)}" ${selected.has(f.name)?'selected':''}>${escapeHtml(f.name)} — ${escapeHtml(f.type)}</option>
            `).join('')}
          </select>
          <div style="font-size:10px;color:#808080;margin-top:4px">按住 Ctrl / Shift 多選</div>
        </div>
        <div class="dialog-footer">
          <button class="w95" onclick="cancelWhereDialog()">Cancel</button>
          <button class="w95" onclick="confirmWhereDialog()" style="font-weight:bold">OK</button>
        </div>
      </div>
    </div>`;
}

function confirmWhereDialog() {
  const box = document.getElementById('where-listbox');
  const names = Array.from(box.selectedOptions).map(o => o.value);
  if (names.length === 0) { openAlert('請至少勾選一個欄位作為 WHERE 條件。'); return; }
  updateActive(t => { t.whereCols = names; t.mode = 'update'; });
  closeModal();
}

function cancelWhereDialog() {
  closeModal();
  renderSheet(); // t.mode unchanged — re-render restores radio state
}

window.openWhereDialog = openWhereDialog;
window.confirmWhereDialog = confirmWhereDialog;
window.cancelWhereDialog = cancelWhereDialog;

window.openUploadDialog = openUploadDialog;
window.closeUploadDialog = closeUploadDialog;
window.handleFile = handleFile;
window.openFieldDialog = openFieldDialog;
window.saveField = saveField;
window.previewSQL = previewSQL;
window.downloadSQL = downloadSQL;
window.openConfirm = openConfirm;
window.openAlert = openAlert;
window.closeModal = closeModal;
window.openAccountDialog = openAccountDialog;
window.accountCheckEmail = accountCheckEmail;
window.accountBackToStep1 = accountBackToStep1;
window.accountLogin = accountLogin;
window.accountRegister = accountRegister;
window.accountLogout = accountLogout;
window.colLetter = window.colLetter || function(i) {
  let s=''; i=i+1; while(i>0){const r=(i-1)%26; s=String.fromCharCode(65+r)+s; i=Math.floor((i-1)/26);} return s;
};
