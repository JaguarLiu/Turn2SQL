// Turn2SQL — core app logic (vanilla JS)
// Global state
const App = {
  templates: [],      // [{ id, name, tableName, dialect, mode, fields:[{name,type}], rows:[[...]], createdAt }]
  activeId: null,
  dragColIndex: null,
  contextMenu: null,
  headerRow: 0,       // which row in uploaded data is the header
  stagingData: null,  // { filename, rows } while picking header row in upload dialog
  selectedRows: new Set(),     // indices
  selectedCols: new Set(),     // indices
  selectedCells: new Set(),    // "r,c" strings
  lastCellAnchor: null,        // {r,c} for shift-range
};

const STORAGE_KEY = 'turn2sql.templates.v1';
const UI_KEY      = 'turn2sql.ui.v1';

// ----- storage -----
function loadTemplates() {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    App.templates = raw ? JSON.parse(raw) : [];
  } catch { App.templates = []; }
}
function saveTemplates() {
  localStorage.setItem(STORAGE_KEY, JSON.stringify(App.templates));
}
function loadUI() {
  try {
    const raw = localStorage.getItem(UI_KEY);
    const ui = raw ? JSON.parse(raw) : {};
    App.activeId = ui.activeId || null;
  } catch {}
}
function saveUI() {
  localStorage.setItem(UI_KEY, JSON.stringify({ activeId: App.activeId }));
}

// ----- active template helpers -----
function getActive() {
  return App.templates.find(t => t.id === App.activeId);
}
function updateActive(fn) {
  const t = getActive(); if (!t) return;
  fn(t);
  t.updatedAt = new Date().toISOString();
  saveTemplates();
  if (window.Sync) Sync.markDirty(t.id);
  renderSheet();
  renderNav();
}

// ----- Rendering: nav -----
function renderNav() {
  const list = document.getElementById('nav-list');
  if (!App.templates.length) {
    list.innerHTML = `<div style="padding:8px;color:#808080;font-size:11px;text-align:center">(沒有範本)<br/>按 + 新增</div>`;
    return;
  }
  list.innerHTML = App.templates.map(t => `
    <div class="nav-item ${t.id === App.activeId ? 'active' : ''}" data-id="${t.id}" onclick="selectTemplate('${t.id}')">
      <svg class="tpl-icon" viewBox="0 0 16 16" shape-rendering="crispEdges">
        <rect x="2" y="1" width="12" height="14" fill="#fff" stroke="#000"></rect>
        <rect x="2" y="1" width="12" height="3" fill="#008080"></rect>
        <path d="M3 5 h10 M3 7 h10 M3 9 h10 M3 11 h10 M6 5 v9 M10 5 v9" stroke="#000" fill="none"></path>
      </svg>
      <span class="tpl-name">${escapeHtml(t.name)}</span>
      <span class="tpl-del" onclick="event.stopPropagation(); deleteTemplate('${t.id}')" title="刪除">✕</span>
    </div>
  `).join('');
}

// ----- Rendering: sheet + toolbar -----
function renderSheet() {
  const root = document.getElementById('sheet-root');
  const t = getActive();
  if (!t) {
    root.innerHTML = `
      <div style="flex:1;display:flex;align-items:center;justify-content:center;background:#008080;color:#fff;font-family:var(--pixel-font);font-size:20px;letter-spacing:2px;text-align:center">
        <div>
          <div style="font-size:28px;margin-bottom:16px">╔══ TURN2SQL ══╗</div>
          <div style="font-size:14px;opacity:0.9">NO TEMPLATE LOADED</div>
          <div style="font-size:12px;margin-top:8px;opacity:0.8">PRESS [+] TO UPLOAD A FILE</div>
        </div>
      </div>`;
    return;
  }
  root.innerHTML = `
    <div class="toolbar">
      <div class="group">
        <span class="label">Table:</span>
        <input class="w95" id="table-name" type="text" value="${escapeAttr(t.tableName)}" style="width:140px"
               oninput="updateActive(t=>t.tableName=this.value)" onchange="updateActive(t=>t.tableName=this.value)">
      </div>
      <div class="group">
        <span class="label">Dialect:</span>
        <select class="w95" id="dialect" onchange="updateActive(t=>t.dialect=this.value)">
          ${Turn2SQL.DIALECTS.map(d => `<option value="${d.id}" ${d.id===t.dialect?'selected':''}>${d.label}</option>`).join('')}
        </select>
      </div>
      <div class="group" role="radiogroup">
        <span class="label">Output:</span>
        <label class="radio-row"><input type="radio" class="w95" name="sql-mode" ${t.mode==='create'?'checked':''} onchange="updateActive(t=>t.mode='create')"> CREATE</label>
        <label class="radio-row"><input type="radio" class="w95" name="sql-mode" ${t.mode==='insert'?'checked':''} onchange="updateActive(t=>t.mode='insert')"> INSERT</label>
        <label class="radio-row"><input type="radio" class="w95" name="sql-mode" ${t.mode==='update'?'checked':''} onchange="openWhereDialog()"> UPDATE</label>
        <label class="radio-row"><input type="radio" class="w95" name="sql-mode" ${t.mode==='both'?'checked':''}   onchange="updateActive(t=>t.mode='both')"> CREATE &amp; INSERT</label>
      </div>
      ${t.mode === 'update' ? `
      <div class="group" style="gap:4px">
        <span class="label">WHERE:</span>
        <span class="info" style="padding:0 4px">${(t.whereCols||[]).length ? (t.whereCols||[]).map(n=>escapeHtml(n)).join(', ') : '<i style="color:#808080">(尚未選擇)</i>'}</span>
        <button class="w95 small" onclick="openWhereDialog()">編輯...</button>
      </div>` : ''}
      <div class="spacer"></div>
      <button class="w95" title="分享 Sync Code" onclick="openShareDialog()">
        <svg width="14" height="14" viewBox="0 0 16 16" shape-rendering="crispEdges" style="vertical-align:-3px">
          <circle cx="4" cy="8" r="2" fill="#c0c0c0" stroke="#000"/>
          <circle cx="12" cy="3" r="2" fill="#c0c0c0" stroke="#000"/>
          <circle cx="12" cy="13" r="2" fill="#c0c0c0" stroke="#000"/>
          <line x1="5" y1="7" x2="11" y2="4" stroke="#000"/>
          <line x1="5" y1="9" x2="11" y2="12" stroke="#000"/>
        </svg>
        Share
      </button>
      <button class="w95" title="從 Sync Code 匯入範本" onclick="openImportDialog()">
        <svg width="14" height="14" viewBox="0 0 16 16" shape-rendering="crispEdges" style="vertical-align:-3px">
          <polygon points="8,1 8,10" stroke="#000" fill="none"/>
          <polygon points="4,6 8,10 12,6" fill="#000080" stroke="#000"/>
          <rect x="2" y="12" width="12" height="2" fill="#c0c0c0" stroke="#000"/>
        </svg>
        Import
      </button>
      <button class="w95" onclick="previewSQL()">
        <svg width="14" height="14" viewBox="0 0 16 16" shape-rendering="crispEdges" style="vertical-align:-3px;margin-right:3px">
          <ellipse cx="8" cy="3" rx="6" ry="2" fill="#c0c0c0" stroke="#000"/>
          <path d="M2 3 V13 A6 2 0 0 0 14 13 V3" fill="#c0c0c0" stroke="#000"/>
          <path d="M2 7 A6 2 0 0 0 14 7 M2 10 A6 2 0 0 0 14 10" stroke="#000" fill="none"/>
        </svg>
        Preview SQL
      </button>
      <button class="w95" onclick="downloadSQL()" style="font-weight:bold">
        <svg width="14" height="14" viewBox="0 0 16 16" shape-rendering="crispEdges" style="vertical-align:-3px;margin-right:3px">
          <polygon points="8,1 8,10" stroke="#000" fill="none"/>
          <polygon points="4,7 8,11 12,7" fill="#008000" stroke="#000"/>
          <rect x="2" y="12" width="12" height="2" fill="#c0c0c0" stroke="#000"/>
        </svg>
        Convert &amp; Download .sql
      </button>
    </div>

    <div class="sheet-container">
      <div class="row-ops-bar">
        <button class="w95 small" onclick="addColumn()">＋ Column</button>
        <button class="w95 small" onclick="addRow()">＋ Row</button>
        <span class="vsep" style="width:1px;background:#808080;align-self:stretch;margin:2px 4px;border-right:1px solid #fff"></span>
        <button class="w95 small" id="btn-del-row" onclick="deleteSelectedRows()" ${App.selectedRows.size?'':'disabled'}>✕ Del Row(s)</button>
        <button class="w95 small" id="btn-del-col" onclick="deleteSelectedCols()" ${App.selectedCols.size?'':'disabled'}>✕ Del Column(s)</button>
        <button class="w95 small" id="btn-clr-cell" onclick="clearSelectedCells()" ${App.selectedCells.size?'':'disabled'}>⌫ Clear Cell(s)</button>
        <span class="info pixel">${t.fields.length} FIELDS × ${t.rows.length} ROWS &nbsp;·&nbsp; ${App.selectedRows.size} row / ${App.selectedCols.size} col / ${App.selectedCells.size} cell selected</span>
      </div>
      <div class="sheet-wrap" id="sheet-wrap">
        ${renderTable(t)}
      </div>
    </div>

    <div class="status-bar">
      <div class="cell grow">Ready — ${escapeHtml(t.name)}</div>
      <div class="cell">Template saved to localStorage</div>
      <div class="cell pixel">${new Date().toLocaleTimeString()}</div>
    </div>
  `;
  hookSheetEvents();
}

function renderTable(t) {
  const { fields, rows } = t;
  let html = '<table class="sheet"><thead>';
  // Single header row: shows the editable field name + type + edit btn, and acts as col-letter for selection
  html += '<tr>';
  html += '<th class="corner" onclick="selectAllCells()" title="Select all"></th>';
  fields.forEach((f, i) => {
    const sel = App.selectedCols.has(i) ? ' selected' : '';
    html += `
      <th class="field-header${sel}" data-col="${i}" style="top:0"
          onclick="toggleColSelect(${i}, event)"
          oncontextmenu="showColMenu(event,${i})">
        <div class="field-header-inner">
          <span class="name" ondblclick="event.stopPropagation(); inlineEditHeader(${i}, this)" onclick="event.stopPropagation()" title="Double-click to rename">${escapeHtml(f.name)}</span>
          <span class="type">${f.type}</span>
          <button class="w95 edit-btn" onclick="event.stopPropagation(); openFieldDialog(${i})" title="Edit field">
            <svg width="9" height="9" viewBox="0 0 11 11" shape-rendering="crispEdges">
              <polygon points="1,9 2,7 7,2 9,4 4,9" fill="#ffd700" stroke="#000"/>
            </svg>
          </button>
        </div>
      </th>`;
  });
  html += '</tr></thead><tbody>';

  rows.forEach((row, ri) => {
    const rSel = App.selectedRows.has(ri) ? ' selected' : '';
    html += `<tr data-row="${ri}" class="${rSel.trim()}">`;
    html += `<th class="row-num${rSel}" data-row="${ri}" onclick="toggleRowSelect(${ri}, event)">${ri + 1}</th>`;
    fields.forEach((_, ci) => {
      const val = row[ci] ?? '';
      const cSel = (App.selectedCells.has(ri+','+ci) || App.selectedRows.has(ri) || App.selectedCols.has(ci)) ? ' selected' : '';
      html += `<td class="cell${cSel}" data-row="${ri}" data-col="${ci}" onclick="selectCell(${ri},${ci},event)" ondblclick="editCell(${ri},${ci},this)"><div class="cell-inner">${escapeHtml(val)}</div></td>`;
    });
    html += '</tr>';
  });
  html += '</tbody></table>';
  return html;
}

// Light re-render that just toggles class names (no innerHTML thrash, keeps focus)
function refreshSelectionClasses() {
  document.querySelectorAll('#sheet-root tr').forEach(tr => {
    const ri = Number(tr.dataset.row);
    tr.classList.toggle('selected', App.selectedRows.has(ri));
    const rn = tr.querySelector('th.row-num');
    if (rn) rn.classList.toggle('selected', App.selectedRows.has(ri));
  });
  document.querySelectorAll('#sheet-root th.field-header').forEach(th => {
    const ci = Number(th.dataset.col);
    th.classList.toggle('selected', App.selectedCols.has(ci));
  });
  document.querySelectorAll('#sheet-root td.cell').forEach(td => {
    const ri = Number(td.dataset.row), ci = Number(td.dataset.col);
    const sel = App.selectedCells.has(ri+','+ci) || App.selectedRows.has(ri) || App.selectedCols.has(ci);
    td.classList.toggle('selected', sel);
  });
  // Update counter + button disabled state
  const btnR = document.getElementById('btn-del-row');
  const btnC = document.getElementById('btn-del-col');
  const btnX = document.getElementById('btn-clr-cell');
  if (btnR) btnR.disabled = App.selectedRows.size === 0;
  if (btnC) btnC.disabled = App.selectedCols.size === 0;
  if (btnX) btnX.disabled = App.selectedCells.size === 0;
  const info = document.querySelector('.row-ops-bar .info');
  const t = getActive();
  if (info && t) info.innerHTML = `${t.fields.length} FIELDS × ${t.rows.length} ROWS &nbsp;·&nbsp; ${App.selectedRows.size} row / ${App.selectedCols.size} col / ${App.selectedCells.size} cell selected`;
}

function hookSheetEvents() {
  document.addEventListener('click', closeCtxMenu);
}

function colLetter(i) {
  let s = '';
  i = i + 1;
  while (i > 0) { const r = (i - 1) % 26; s = String.fromCharCode(65 + r) + s; i = Math.floor((i - 1) / 26); }
  return s;
}

// ----- template ops -----
function uid() { return 'tpl_' + Math.random().toString(36).slice(2, 9); }

function selectTemplate(id) {
  App.activeId = id;
  clearAllSelection();
  saveUI();
  renderNav();
  renderSheet();
}
function deleteTemplate(id) {
  openConfirm('確定要刪除這個範本嗎?', () => {
    App.templates = App.templates.filter(t => t.id !== id);
    if (App.activeId === id) App.activeId = App.templates[0]?.id || null;
    saveTemplates(); saveUI();
    if (window.Sync) Sync.markDeleted(id);
    renderNav(); renderSheet();
  });
}

function createTemplateFromData(filename, allRows, headerRowIndex) {
  // No header row — first row is data. Fields get generic names column_1..N
  const maxCols = Math.max(0, ...allRows.map(r => r.length));
  const fields = [];
  for (let i = 0; i < maxCols; i++) {
    fields.push({ name: `column_${i+1}`, type: inferType(allRows, i) });
  }
  const rows = allRows.map(r => {
    const arr = [];
    for (let i = 0; i < maxCols; i++) arr.push(r[i] ?? '');
    return arr;
  });
  const t = {
    id: uid(),
    name: filename.replace(/\.[^.]+$/, ''),
    tableName: Turn2SQL.safeTableName(filename),
    dialect: 'mysql',
    mode: 'insert',
    whereCols: [],
    fields, rows,
    createdAt: Date.now(),
  };
  t.updatedAt = new Date().toISOString();
  App.templates.unshift(t);
  App.activeId = t.id;
  saveTemplates(); saveUI();
  if (window.Sync) Sync.markDirty(t.id);
  renderNav(); renderSheet();
}

function inferType(rows, colIdx) {
  let numeric = 0, decimal = 0, dateLike = 0, bool = 0, total = 0;
  for (const r of rows.slice(0, 30)) {
    const v = r[colIdx];
    if (v === null || v === undefined || v === '') continue;
    total++;
    const s = String(v).trim();
    if (/^(true|false|yes|no|y|n|是|否)$/i.test(s)) bool++;
    if (/^-?\d+$/.test(s)) numeric++;
    else if (/^-?\d+\.\d+$/.test(s)) decimal++;
    if (/^\d{4}[-/]\d{1,2}[-/]\d{1,2}/.test(s)) dateLike++;
  }
  if (total === 0) return 'VARCHAR';
  if (bool / total >= 0.8) return 'BOOLEAN';
  if (dateLike / total >= 0.6) return 'DATE';
  if ((numeric + decimal) / total >= 0.8) return decimal > 0 ? 'DECIMAL' : 'INT';
  return 'VARCHAR';
}

// ----- column/row ops -----
function addColumn() {
  updateActive(t => {
    t.fields.push({ name: `column_${t.fields.length + 1}`, type: 'VARCHAR' });
    t.rows.forEach(r => r.push(''));
  });
}
function deleteColumn(idx) {
  openConfirm(`確定要刪除欄位 "${getActive().fields[idx].name}"?`, () => {
    updateActive(t => {
      t.fields.splice(idx, 1);
      t.rows.forEach(r => r.splice(idx, 1));
    });
  });
}
function addRow() {
  updateActive(t => {
    t.rows.push(new Array(t.fields.length).fill(''));
  });
  // scroll to bottom
  setTimeout(() => {
    const w = document.getElementById('sheet-wrap');
    if (w) w.scrollTop = w.scrollHeight;
  }, 10);
}
function clearAllSelection() {
  App.selectedRows.clear();
  App.selectedCols.clear();
  App.selectedCells.clear();
  App.lastCellAnchor = null;
}
function toggleRowSelect(idx, ev) {
  // clicking a row header selects row; also clears cell/col selection unless modifier
  if (!ev.shiftKey && !ev.ctrlKey && !ev.metaKey) {
    App.selectedRows.clear();
    App.selectedCols.clear();
    App.selectedCells.clear();
  } else {
    App.selectedCells.clear();
  }
  if (ev.shiftKey && App.lastRowAnchor != null) {
    const [a, b] = [App.lastRowAnchor, idx].sort((x,y)=>x-y);
    for (let i = a; i <= b; i++) App.selectedRows.add(i);
  } else {
    if (App.selectedRows.has(idx)) App.selectedRows.delete(idx);
    else App.selectedRows.add(idx);
    App.lastRowAnchor = idx;
  }
  refreshSelectionClasses();
}
function toggleColSelect(idx, ev) {
  if (!ev.shiftKey && !ev.ctrlKey && !ev.metaKey) {
    App.selectedRows.clear();
    App.selectedCols.clear();
    App.selectedCells.clear();
  } else {
    App.selectedCells.clear();
  }
  if (ev.shiftKey && App.lastColAnchor != null) {
    const [a, b] = [App.lastColAnchor, idx].sort((x,y)=>x-y);
    for (let i = a; i <= b; i++) App.selectedCols.add(i);
  } else {
    if (App.selectedCols.has(idx)) App.selectedCols.delete(idx);
    else App.selectedCols.add(idx);
    App.lastColAnchor = idx;
  }
  refreshSelectionClasses();
}
function selectCell(ri, ci, ev) {
  // clicking a cell → cell selection mode
  App.selectedRows.clear();
  App.selectedCols.clear();
  if (ev.shiftKey && App.lastCellAnchor) {
    const { r: r0, c: c0 } = App.lastCellAnchor;
    const [rA, rB] = [r0, ri].sort((x,y)=>x-y);
    const [cA, cB] = [c0, ci].sort((x,y)=>x-y);
    for (let r = rA; r <= rB; r++) for (let c = cA; c <= cB; c++) App.selectedCells.add(r+','+c);
  } else if (ev.ctrlKey || ev.metaKey) {
    const key = ri+','+ci;
    if (App.selectedCells.has(key)) App.selectedCells.delete(key);
    else App.selectedCells.add(key);
    App.lastCellAnchor = { r: ri, c: ci };
  } else {
    App.selectedCells.clear();
    App.selectedCells.add(ri+','+ci);
    App.lastCellAnchor = { r: ri, c: ci };
  }
  refreshSelectionClasses();
}
function selectAllCells() {
  const t = getActive(); if (!t) return;
  App.selectedRows.clear(); App.selectedCols.clear(); App.selectedCells.clear();
  for (let r = 0; r < t.rows.length; r++) for (let c = 0; c < t.fields.length; c++) App.selectedCells.add(r+','+c);
  refreshSelectionClasses();
}
function deleteSelectedRows() {
  const rows = [...App.selectedRows];
  if (!rows.length) return;
  openConfirm(`確定要刪除 ${rows.length} 個列?`, () => {
    updateActive(t => {
      const set = new Set(rows);
      t.rows = t.rows.filter((_, i) => !set.has(i));
    });
    clearAllSelection();
    refreshSelectionClasses();
  });
}
function deleteSelectedCols() {
  const cols = [...App.selectedCols].sort((a,b)=>b-a);
  if (!cols.length) return;
  openConfirm(`確定要刪除 ${cols.length} 個欄位?`, () => {
    updateActive(t => {
      for (const i of cols) {
        t.fields.splice(i, 1);
        t.rows.forEach(r => r.splice(i, 1));
      }
    });
    clearAllSelection();
    refreshSelectionClasses();
  });
}
function clearSelectedCells() {
  if (!App.selectedCells.size) return;
  updateActive(t => {
    for (const key of App.selectedCells) {
      const [r, c] = key.split(',').map(Number);
      if (t.rows[r]) t.rows[r][c] = '';
    }
  });
  refreshSelectionClasses();
}
function handleKeyDelete(e) {
  // ignore when typing into an input / textarea / contenteditable
  const tag = (e.target.tagName || '').toLowerCase();
  if (tag === 'input' || tag === 'textarea' || e.target.isContentEditable) return;
  if (e.key !== 'Delete' && e.key !== 'Backspace') return;
  if (App.selectedRows.size) { e.preventDefault(); deleteSelectedRows(); return; }
  if (App.selectedCols.size) { e.preventDefault(); deleteSelectedCols(); return; }
  if (App.selectedCells.size) { e.preventDefault(); clearSelectedCells(); return; }
}

// ----- cell editing -----
let _cellPersistTimer = null;
function scheduleCellPersist(id) {
  if (_cellPersistTimer) clearTimeout(_cellPersistTimer);
  _cellPersistTimer = setTimeout(() => {
    _cellPersistTimer = null;
    saveTemplates();
    if (window.Sync) Sync.markDirty(id);
  }, 400);
}

function editCell(ri, ci, td) {
  const t = getActive(); if (!t) return;
  const current = t.rows[ri][ci] ?? '';
  td.classList.add('editing');
  td.innerHTML = `<input class="cell-input" value="${escapeAttr(current)}">`;
  const inp = td.querySelector('input');
  inp.focus(); inp.select();

  let done = false;
  const finish = (displayVal) => {
    if (done) return;
    done = true;
    td.classList.remove('editing');
    td.innerHTML = `<div class="cell-inner">${escapeHtml(displayVal)}</div>`;
  };
  const commit = () => {
    if (done) return;
    const v = inp.value;
    if (v !== current) {
      t.rows[ri][ci] = v;
      t.updatedAt = new Date().toISOString();
      scheduleCellPersist(t.id);
    }
    finish(v);
  };
  inp.addEventListener('blur', commit);
  inp.addEventListener('keydown', e => {
    if (e.key === 'Enter') { e.preventDefault(); commit(); }
    else if (e.key === 'Escape') { e.preventDefault(); finish(current); }
  });
}

function inlineEditHeader(idx, el) {
  const t = getActive();
  const oldName = t.fields[idx].name;
  el.contentEditable = true; el.focus();
  const range = document.createRange(); range.selectNodeContents(el);
  const sel = window.getSelection(); sel.removeAllRanges(); sel.addRange(range);
  const commit = () => {
    el.contentEditable = false;
    const newName = el.textContent.trim() || oldName;
    updateActive(t => { t.fields[idx].name = newName; });
  };
  el.addEventListener('blur', commit, { once: true });
  el.addEventListener('keydown', e => {
    if (e.key === 'Enter') { e.preventDefault(); el.blur(); }
    if (e.key === 'Escape') { el.textContent = oldName; el.blur(); }
  });
}

// ----- context menu on col letter -----
function showColMenu(ev, idx) {
  ev.preventDefault();
  closeCtxMenu();
  const m = document.createElement('div');
  m.className = 'ctx-menu';
  m.style.left = ev.clientX + 'px';
  m.style.top  = ev.clientY + 'px';
  m.innerHTML = `
    <div class="item" onclick="openFieldDialog(${idx})">編輯欄位...</div>
    <div class="item" onclick="addColumnAt(${idx})">在此插入欄位</div>
    <div class="sep"></div>
    <div class="item" onclick="deleteColumn(${idx})">刪除欄位</div>
  `;
  document.body.appendChild(m);
  App.contextMenu = m;
}
function closeCtxMenu() {
  if (App.contextMenu) { App.contextMenu.remove(); App.contextMenu = null; }
}
function addColumnAt(idx) {
  closeCtxMenu();
  updateActive(t => {
    t.fields.splice(idx, 0, { name: `column_${t.fields.length + 1}`, type: 'VARCHAR' });
    t.rows.forEach(r => r.splice(idx, 0, ''));
  });
}

window.App = App;
window.selectTemplate = selectTemplate;
window.deleteTemplate = deleteTemplate;
window.updateActive = updateActive;
window.addColumn = addColumn;
window.addRow = addRow;
window.deleteColumn = deleteColumn;
window.deleteSelectedRows = deleteSelectedRows;
window.deleteSelectedCols = deleteSelectedCols;
window.clearSelectedCells = clearSelectedCells;
window.toggleRowSelect = toggleRowSelect;
window.toggleColSelect = toggleColSelect;
window.selectCell = selectCell;
window.selectAllCells = selectAllCells;
window.handleKeyDelete = handleKeyDelete;
window.editCell = editCell;

window.inlineEditHeader = inlineEditHeader;
window.showColMenu = showColMenu;
window.addColumnAt = addColumnAt;
window.closeCtxMenu = closeCtxMenu;
window.renderSheet = renderSheet;
window.renderNav = renderNav;
window.loadTemplates = loadTemplates;
window.saveTemplates = saveTemplates;
window.loadUI = loadUI;
window.saveUI = saveUI;
window.getActive = getActive;
window.createTemplateFromData = createTemplateFromData;
window.refreshSelectionClasses = refreshSelectionClasses;
window.clearAllSelection = clearAllSelection;

function escapeHtml(s) {
  return String(s ?? '').replace(/[&<>"]/g, c => ({ '&':'&amp;', '<':'&lt;', '>':'&gt;', '"':'&quot;' }[c]));
}
function escapeAttr(s) { return escapeHtml(s); }
window.escapeHtml = escapeHtml; window.escapeAttr = escapeAttr;

function copyToClipboard(text, btn) {
  try { navigator.clipboard.writeText(text); } catch {}
  if (btn) {
    const orig = btn.textContent;
    btn.textContent = '✓';
    setTimeout(() => { btn.textContent = orig; }, 1200);
  }
}
window.copyToClipboard = copyToClipboard;

window.addEventListener('beforeunload', () => {
  if (_cellPersistTimer) {
    clearTimeout(_cellPersistTimer);
    _cellPersistTimer = null;
    saveTemplates();
  }
});
