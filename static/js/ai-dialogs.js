// AI 相關對話框 — 設定、同意說明、建表建議、清洗規則、送出內容檢視

// ---------- 共用 ----------

function aiDialogShell(title, bodyHtml, footerHtml, width = 560) {
  return `
    <div class="modal-overlay">
      <div class="dialog" style="min-width:${width}px;max-width:92vw">
        <div class="title-bar">
          <div class="title-bar-text">
            <svg width="14" height="14" viewBox="0 0 16 16" shape-rendering="crispEdges">
              <rect x="3" y="4" width="10" height="8" fill="#c0c0c0" stroke="#000"/>
              <rect x="5" y="6" width="2" height="2" fill="#000080"/>
              <rect x="9" y="6" width="2" height="2" fill="#000080"/>
              <line x1="8" y1="1" x2="8" y2="4" stroke="#000"/>
            </svg>
            ${title}
          </div>
          <div class="title-bar-controls"><button onclick="closeModal()">✕</button></div>
        </div>
        <div class="dialog-body">${bodyHtml}</div>
        <div class="dialog-footer">${footerHtml}</div>
      </div>
    </div>`;
}

function aiLoading(msg) {
  document.getElementById('modal-host').innerHTML = aiDialogShell(
    'AI 處理中',
    `<p style="margin:0">${escapeHtml(msg)}</p>
     <div style="margin-top:8px;border:1px solid #808080;height:16px;background:#fff">
       <div style="height:100%;width:40%;background:#000080;animation:none"></div>
     </div>`,
    `<button class="w95" onclick="closeModal()">Cancel</button>`, 380);
}

function aiError(err) {
  openAlert('AI 失敗: ' + (err && err.message ? err.message : err));
}

// ---------- 設定 ----------

async function openAISettingsDialog() {
  const info = await AI.loadServerInfo(true);
  const st = AI.get();
  const providers = (info && info.supported ? info.supported : ['claude', 'gemini', 'openai']).filter(p => p !== 'mock');
  const serverLine = info && info.serverDefault
    ? `伺服器預設: <b>${escapeHtml(info.serverDefault)}</b> (${escapeHtml(info.serverModel || '')})，不填金鑰就會用它。`
    : `伺服器未設定 AI，<b>必須自己填 API key</b> 才能使用。`;

  document.getElementById('modal-host').innerHTML = aiDialogShell('AI 設定', `
    <fieldset class="w95">
      <legend>Provider</legend>
      <div style="font-size:11px;color:#505050;margin-bottom:6px">${serverLine}</div>
      <div style="display:flex;align-items:center;gap:6px;margin:4px 0">
        <label style="width:70px">Provider:</label>
        <select class="w95" id="ai-provider" style="flex:1" onchange="aiSettingsProviderChanged()">
          <option value="">(使用伺服器預設)</option>
          ${providers.map(p => `<option value="${p}" ${st.provider === p ? 'selected' : ''}>${p}</option>`).join('')}
        </select>
      </div>
      <div style="display:flex;align-items:center;gap:6px;margin:4px 0">
        <label style="width:70px">Model:</label>
        <input class="w95" id="ai-model" type="text" value="${escapeAttr(st.model)}" placeholder="留空 = 預設模型" style="flex:1">
      </div>
      <div style="display:flex;align-items:center;gap:6px;margin:4px 0">
        <label style="width:70px">API Key:</label>
        <input class="w95" id="ai-key" type="password" value="${escapeAttr(st.apiKey)}" placeholder="只存在這台電腦的瀏覽器" style="flex:1">
      </div>
      <div id="ai-provider-note" style="font-size:11px;margin-top:6px"></div>
    </fieldset>
    <fieldset class="w95" style="margin-top:8px">
      <legend>隱私</legend>
      <label><input type="checkbox" id="ai-mask" ${st.mask ? 'checked' : ''}> 送出前遮蔽疑似個資（身分證、電話、Email、姓名、地址）</label>
      <div style="font-size:11px;color:#505050;margin-top:4px">
        不論是否遮蔽，送出的都只有欄位名、最多 ${AI.SAMPLE_SIZE} 筆抽樣值與統計摘要，不會送出整份資料。
      </div>
    </fieldset>`,
    `<button class="w95" onclick="closeModal()">Cancel</button>
     <button class="w95" onclick="saveAISettings()" style="font-weight:bold">OK</button>`);
  aiSettingsProviderChanged();
}

function aiSettingsProviderChanged() {
  const p = document.getElementById('ai-provider')?.value;
  const note = document.getElementById('ai-provider-note');
  if (!note) return;
  if (p === 'gemini') {
    note.innerHTML = `<span style="background:#ffe8e8;border:1px solid #808080;padding:3px;display:inline-block">
      ⚠ Gemini <b>免費版</b> key 送出的內容可能被 Google 用於改進產品，也可能有人工審閱。
      處理客戶資料或個資請使用付費 key 或 Vertex AI。</span>`;
  } else {
    note.innerHTML = '';
  }
}

function saveAISettings() {
  AI.save({
    provider: document.getElementById('ai-provider').value,
    model: document.getElementById('ai-model').value.trim(),
    apiKey: document.getElementById('ai-key').value.trim(),
    mask: document.getElementById('ai-mask').checked,
  });
  closeModal();
  Sync.showToast('AI 設定已儲存');
}

// ---------- 同意說明 ----------

// ensureAIReady：確認可用且使用者已了解會送出什麼，再執行 next()
async function ensureAIReady(t, next) {
  await AI.loadServerInfo();
  if (!AI.enabled()) {
    openAISettingsDialog();
    return;
  }
  const st = AI.get();
  if (st.consent) { next(); return; }

  const { payload, masked } = AI.schemaPayload(t);
  const target = st.provider || (AI.cachedServerInfo() || {}).serverDefault || '伺服器預設 provider';
  document.getElementById('modal-host').innerHTML = aiDialogShell('送出前確認', `
    <p style="margin:0 0 6px">使用 AI 功能會把下列內容送到 <b>${escapeHtml(target)}</b>:</p>
    <ul style="margin:0 0 8px 16px;padding:0;font-size:12px">
      <li>欄位名稱（共 ${payload.columns.length} 欄）</li>
      <li>每欄最多 ${AI.SAMPLE_SIZE} 筆抽樣值${AI.get().mask ? '（疑似個資已遮蔽）' : '<b style="color:#a00">（遮蔽已關閉）</b>'}</li>
      <li>統計摘要（列數、空值數、不重複值數、最大長度）</li>
    </ul>
    <p style="margin:0 0 6px">${masked.length
      ? `已偵測並遮蔽: ${masked.map(m => escapeHtml(m.column) + ' (' + m.kind + ')').join('、')}`
      : '這份資料沒有偵測到疑似個資欄位。'}</p>
    <p style="margin:0;font-size:11px;color:#505050">完整資料不會離開瀏覽器。可隨時按「檢視送出內容」查看實際送出的 JSON。</p>
    ${String(target).includes('gemini') ? `<p style="margin:6px 0 0;background:#ffe8e8;border:1px solid #808080;padding:3px;font-size:11px">
      ⚠ 使用 Gemini <b>免費版</b> key 時，送出的內容可能被 Google 用於改進產品，也可能有人工審閱。
      處理客戶資料或個資請改用付費 key 或 Vertex AI。</p>` : ''}
    <label style="display:block;margin-top:8px"><input type="checkbox" id="ai-consent-remember" checked> 不再提示</label>`,
    `<button class="w95" onclick="closeModal()">Cancel</button>
     <button class="w95" onclick="aiConsentOK()" style="font-weight:bold">同意並繼續</button>`);
  window.__aiConsentNext = next;
}

function aiConsentOK() {
  if (document.getElementById('ai-consent-remember')?.checked) AI.save({ consent: true });
  const next = window.__aiConsentNext;
  window.__aiConsentNext = null;
  closeModal();
  if (next) next();
}

// ---------- 檢視送出內容 ----------

function openAIPayloadDialog() {
  const p = AI.getLastPayload();
  const body = p
    ? `<p style="margin:0 0 6px;font-size:11px;color:#505050">${escapeHtml(p.at)} · ${escapeHtml(p.path)}</p>
       <textarea class="w95" readonly style="width:100%;height:320px;font-family:Consolas,monospace;font-size:11px;white-space:pre">${escapeHtml(JSON.stringify(p.body, null, 2))}</textarea>`
    : `<p style="margin:0">這個瀏覽器分頁還沒有送出過任何內容。</p>`;
  document.getElementById('modal-host').innerHTML = aiDialogShell('最近一次送出的內容', body,
    `<button class="w95" onclick="closeModal()">Close</button>`, 620);
}

// ---------- AI 建表建議 ----------

function openAISchemaDialog() {
  const t = getActive(); if (!t) return;
  ensureAIReady(t, async () => {
    aiLoading('正在請 AI 分析欄位…');
    try {
      const res = await AI.suggestSchema(t);
      renderSchemaSuggestions(t, res);
    } catch (err) { aiError(err); }
  });
}

function renderSchemaSuggestions(t, res) {
  const cols = (res.result && res.result.columns) || [];
  if (!cols.length) { openAlert('AI 沒有給出建議。'); return; }

  // 依原始欄位名對回目前的欄位
  const rows = cols.map((c, i) => {
    const idx = t.fields.findIndex(f => f.name === c.original);
    const cur = idx >= 0 ? t.fields[idx] : null;
    const changed = cur && (cur.name !== c.name || cur.type !== c.type);
    return { c, idx, cur, changed };
  }).filter(r => r.idx >= 0);

  const body = `
    <p style="margin:0 0 6px;font-size:11px;color:#505050">
      ${escapeHtml(res.provider)} / ${escapeHtml(res.model)} ·
      ${res.usage ? escapeHtml(`${res.usage.inputTokens}+${res.usage.outputTokens} tokens · $${(res.usage.costUSD || 0).toFixed(4)}`) : ''}
      ${res.masked && res.masked.length ? ` · 已遮蔽 ${res.masked.length} 欄` : ''}
    </p>
    <div style="max-height:340px;overflow:auto;border:1px solid #808080;background:#fff">
      <table style="width:100%;border-collapse:collapse;font-size:11px">
        <thead><tr style="background:#c0c0c0;position:sticky;top:0">
          <th style="padding:3px"><input type="checkbox" id="ai-sch-all" checked onchange="aiToggleAll('ai-sch-cb', this.checked)"></th>
          <th style="padding:3px;text-align:left">目前</th>
          <th style="padding:3px;text-align:left">AI 建議</th>
          <th style="padding:3px;text-align:left">理由</th>
        </tr></thead>
        <tbody>
        ${rows.map((r, i) => `
          <tr style="border-top:1px solid #d0d0d0">
            <td style="padding:3px;text-align:center">
              <input type="checkbox" class="ai-sch-cb" data-i="${i}" ${r.changed ? 'checked' : 'checked'}>
            </td>
            <td style="padding:3px">${escapeHtml(r.cur.name)}<br><span style="color:#505050">${escapeHtml(r.cur.type || 'VARCHAR')}</span></td>
            <td style="padding:3px">
              <b>${escapeHtml(r.c.name)}</b><br>
              <span style="color:#000080">${escapeHtml(r.c.type)}${r.c.length ? escapeHtml('(' + r.c.length + ')') : ''}${r.c.precision ? escapeHtml('(' + r.c.precision + ',' + (r.c.scale ?? 0) + ')') : ''}</span>
              ${r.c.primaryKey ? ' <span style="color:#a00">PK</span>' : ''}
              ${r.c.nullable === false ? ' <span style="color:#505050">NOT NULL</span>' : ''}
            </td>
            <td style="padding:3px;color:#505050">${escapeHtml(r.c.reason || '')}</td>
          </tr>`).join('')}
        </tbody>
      </table>
    </div>`;

  document.getElementById('modal-host').innerHTML = aiDialogShell('AI 建表建議', body,
    `<button class="w95" onclick="openAIPayloadDialog()">檢視送出內容</button>
     <button class="w95" onclick="closeModal()">Cancel</button>
     <button class="w95" onclick="applySchemaSuggestions()" style="font-weight:bold">套用勾選項目</button>`, 680);

  window.__aiSchemaRows = rows;
}

function aiToggleAll(cls, checked) {
  document.querySelectorAll('.' + cls).forEach(cb => { cb.checked = checked; });
}

function applySchemaSuggestions() {
  const rows = window.__aiSchemaRows || [];
  const picked = [...document.querySelectorAll('.ai-sch-cb')].filter(cb => cb.checked).map(cb => rows[+cb.dataset.i]);
  if (!picked.length) { closeModal(); return; }

  updateActive(t => {
    for (const { c, idx } of picked) {
      t.fields[idx] = {
        ...t.fields[idx],
        name: c.name,
        type: c.type,
        length: c.length ?? undefined,
        precision: c.precision ?? undefined,
        scale: c.scale ?? undefined,
        nullable: c.nullable === false ? false : undefined,
        primaryKey: c.primaryKey || undefined,
        comment: c.comment || undefined,
      };
    }
    // 欄位改名後，UPDATE 模式的 WHERE 欄位要跟著改
    if (t.whereCols && t.whereCols.length) {
      const rename = new Map(picked.map(p => [p.cur.name, p.c.name]));
      t.whereCols = t.whereCols.map(n => rename.get(n) || n);
    }
  });
  closeModal();
  Sync.showToast(`已套用 ${picked.length} 個欄位建議`);
}

// ---------- 清洗規則 ----------

// 先做本地偵測（不需要 AI），使用者可再按按鈕請 AI 找更多
function openCleanDialog() {
  const t = getActive(); if (!t) return;
  const local = Rules.detectRules(t.fields, t.rows);
  renderCleanRules(t, local, null);
}

function renderCleanRules(t, rules, meta) {
  // 去掉重複（同欄位同操作）
  const seen = new Set();
  const list = rules.filter(r => {
    const k = r.column + '|' + r.op;
    if (seen.has(k)) return false;
    seen.add(k);
    return !Rules.validateRule(r, t.fields);
  });

  const previews = list.map(r => Rules.previewRule(t.fields, t.rows, r));
  const body = `
    ${meta ? `<p style="margin:0 0 6px;font-size:11px;color:#505050">
      ${escapeHtml(meta.provider)} / ${escapeHtml(meta.model)} ·
      ${meta.usage ? escapeHtml(`${meta.usage.inputTokens}+${meta.usage.outputTokens} tokens · $${(meta.usage.costUSD || 0).toFixed(4)}`) : ''}
      ${meta.masked && meta.masked.length ? ` · 已遮蔽 ${meta.masked.length} 欄` : ''}
    </p>` : ''}
    ${list.length === 0 ? '<p style="margin:0 0 8px">沒有偵測到需要清洗的地方。</p>' : `
    <div style="max-height:320px;overflow:auto;border:1px solid #808080;background:#fff">
      <table style="width:100%;border-collapse:collapse;font-size:11px">
        <thead><tr style="background:#c0c0c0;position:sticky;top:0">
          <th style="padding:3px"><input type="checkbox" checked onchange="aiToggleAll('ai-rule-cb', this.checked)"></th>
          <th style="padding:3px;text-align:left">欄位</th>
          <th style="padding:3px;text-align:left">操作</th>
          <th style="padding:3px;text-align:left">影響</th>
          <th style="padding:3px;text-align:left">範例</th>
        </tr></thead>
        <tbody>
        ${list.map((r, i) => {
          const p = previews[i];
          return `
          <tr style="border-top:1px solid #d0d0d0">
            <td style="padding:3px;text-align:center"><input type="checkbox" class="ai-rule-cb" data-i="${i}" ${p.affected ? 'checked' : ''}></td>
            <td style="padding:3px">${escapeHtml(r.column)}</td>
            <td style="padding:3px">${escapeHtml(Rules.RULE_OPS[r.op].label)}
              <span style="color:#808080">(${escapeHtml(r.source === 'local' ? '本地偵測' : 'AI')})</span><br>
              <span style="color:#505050">${escapeHtml(r.reason || '')}</span></td>
            <td style="padding:3px;${p.affected ? 'color:#000080;font-weight:bold' : 'color:#808080'}">${escapeHtml(String(p.affected))} 列${p.isValidator ? '不符' : ''}</td>
            <td style="padding:3px;color:#505050">
              ${p.examples.map(e => `${escapeHtml(e.before)} → ${escapeHtml(e.after)}`).join('<br>') || '—'}
            </td>
          </tr>`;
        }).join('')}
        </tbody>
      </table>
    </div>`}
    <p style="margin:6px 0 0;font-size:11px;color:#505050">
      檢查類規則（身分證、統編、電話）只會標記不符的列，不會修改資料。
    </p>`;

  document.getElementById('modal-host').innerHTML = aiDialogShell('資料清洗', body,
    `<button class="w95" onclick="askAICleanRules()">🤖 用 AI 再找更多</button>
     <button class="w95" onclick="closeModal()">Cancel</button>
     <button class="w95" onclick="applyCleanRules()" style="font-weight:bold" ${list.length ? '' : 'disabled'}>套用勾選規則</button>`, 700);

  window.__aiCleanRules = list;
}

function askAICleanRules() {
  const t = getActive(); if (!t) return;
  ensureAIReady(t, async () => {
    aiLoading('正在請 AI 分析資料…');
    try {
      const res = await AI.suggestCleanRules(t);
      const aiRules = ((res.result && res.result.rules) || []).map(r => ({ ...r, source: 'ai' }));
      const local = Rules.detectRules(t.fields, t.rows);
      renderCleanRules(t, [...local, ...aiRules], res);
    } catch (err) { aiError(err); }
  });
}

function applyCleanRules() {
  const t = getActive(); if (!t) return;
  const all = window.__aiCleanRules || [];
  const picked = [...document.querySelectorAll('.ai-rule-cb')].filter(cb => cb.checked).map(cb => all[+cb.dataset.i]);
  if (!picked.length) { closeModal(); return; }

  const res = Rules.applyRules(t.fields, t.rows, picked);
  updateActive(tpl => {
    tpl.rows = res.rows;
    tpl.cleanRules = [...(tpl.cleanRules || []), ...picked];
  });
  closeModal();

  if (res.invalid.length) {
    const shown = res.invalid.slice(0, 10)
      .map(v => `第 ${v.row} 列 · ${v.column} · "${v.value}" — ${v.message}`).join('\n');
    openAlert(`已修改 ${res.changed} 個儲存格。\n\n另有 ${res.invalid.length} 個儲存格格式不符（未修改）:\n${shown}${res.invalid.length > 10 ? '\n…' : ''}`);
  } else {
    Sync.showToast(`已修改 ${res.changed} 個儲存格`);
  }
}

window.openAISettingsDialog = openAISettingsDialog;
window.aiSettingsProviderChanged = aiSettingsProviderChanged;
window.saveAISettings = saveAISettings;
window.aiConsentOK = aiConsentOK;
window.openAIPayloadDialog = openAIPayloadDialog;
window.openAISchemaDialog = openAISchemaDialog;
window.applySchemaSuggestions = applySchemaSuggestions;
window.openCleanDialog = openCleanDialog;
window.askAICleanRules = askAICleanRules;
window.applyCleanRules = applyCleanRules;
window.aiToggleAll = aiToggleAll;
