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
  const sql = Turn2SQL.generateSQL({
    tableName: t.tableName, fields: t.fields, rows: t.rows, dialect: t.dialect, mode: t.mode,
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
  const sql = Turn2SQL.generateSQL({
    tableName: t.tableName, fields: t.fields, rows: t.rows, dialect: t.dialect, mode: t.mode,
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
window.colLetter = window.colLetter || function(i) {
  let s=''; i=i+1; while(i>0){const r=(i-1)%26; s=String.fromCharCode(65+r)+s; i=Math.floor((i-1)/26);} return s;
};
