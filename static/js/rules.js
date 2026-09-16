// 資料清洗規則引擎 — vanilla JS
//
// AI 只會回傳「規則」（op + 參數），實際轉換一律由這裡執行。
// op 必須在白名單內，AI 永遠不會產生可執行的程式碼。

// ---------- 小工具 ----------

function s(v) { return v === null || v === undefined ? '' : String(v); }

function pad2(n) { return String(n).padStart(2, '0'); }

// 全形 → 半形（FF01-FF5E 對應 ASCII 21-7E，另處理全形空白）
function toHalfWidth(str) {
  return s(str)
    .replace(/[！-～]/g, c => String.fromCharCode(c.charCodeAt(0) - 0xFEE0))
    .replace(/　/g, ' ');
}

// 民國年轉西元：113/05/01 → 2024-05-01，也接受 1130501
function rocToAD(str) {
  const v = toHalfWidth(s(str)).trim();
  let m = v.match(/^(\d{2,3})[-/.](\d{1,2})[-/.](\d{1,2})$/);
  if (!m) m = v.match(/^(\d{3})(\d{2})(\d{2})$/);
  if (!m) return null;
  const y = parseInt(m[1], 10) + 1911;
  const mo = parseInt(m[2], 10);
  const d = parseInt(m[3], 10);
  if (mo < 1 || mo > 12 || d < 1 || d > 31) return null;
  const probe = new Date(Date.UTC(y, mo - 1, d));
  if (probe.getUTCMonth() !== mo - 1 || probe.getUTCDate() !== d) return null;
  return `${y}-${pad2(mo)}-${pad2(d)}`;
}

// 去掉貨幣符號、「元」與千分位
function stripCurrency(str) {
  const v = toHalfWidth(s(str)).trim()
    .replace(/^(NT\$|NTD|TWD|US\$|USD|\$|￥|¥)\s*/i, '')
    .replace(/\s*(元|塊|圓)$/,'')
    .replace(/,/g, '')
    .trim();
  return v;
}

// 依 format 解析日期（只支援固定幾種 token 組合）
function parseDateWithFormat(str, format) {
  const v = toHalfWidth(s(str)).trim();
  const fmt = s(format).toUpperCase().trim();
  const orders = {
    'YYYY/MM/DD': ['y', 'm', 'd'], 'YYYY-MM-DD': ['y', 'm', 'd'], 'YYYY.MM.DD': ['y', 'm', 'd'],
    'YYYYMMDD':   ['y', 'm', 'd'],
    'DD/MM/YYYY': ['d', 'm', 'y'], 'DD-MM-YYYY': ['d', 'm', 'y'],
    'MM/DD/YYYY': ['m', 'd', 'y'], 'MM-DD-YYYY': ['m', 'd', 'y'],
  };
  const order = orders[fmt];
  if (!order) return null;

  let parts;
  if (fmt === 'YYYYMMDD') {
    const m = v.match(/^(\d{4})(\d{2})(\d{2})$/);
    if (!m) return null;
    parts = [m[1], m[2], m[3]];
  } else {
    const m = v.match(/^(\d{1,4})[-/.](\d{1,2})[-/.](\d{1,4})$/);
    if (!m) return null;
    parts = [m[1], m[2], m[3]];
  }

  const got = {};
  order.forEach((key, i) => { got[key] = parseInt(parts[i], 10); });
  if (!got.y || got.m < 1 || got.m > 12 || got.d < 1 || got.d > 31) return null;
  const probe = new Date(Date.UTC(got.y, got.m - 1, got.d));
  if (probe.getUTCMonth() !== got.m - 1 || probe.getUTCDate() !== got.d) return null;
  return `${String(got.y).padStart(4, '0')}-${pad2(got.m)}-${pad2(got.d)}`;
}

// ---------- 台灣格式驗證（只標記，不修改） ----------

// 身分證：英文字母 + 1/2 + 8 碼數字，含檢查碼
function isValidTWID(str) {
  const v = toHalfWidth(s(str)).trim().toUpperCase();
  if (!/^[A-Z][12]\d{8}$/.test(v)) return false;
  const letterMap = 'ABCDEFGHJKLMNPQRSTUVXYWZIO';
  const idx = letterMap.indexOf(v[0]);
  if (idx < 0) return false;
  const n = idx + 10;
  let sum = Math.floor(n / 10) + (n % 10) * 9;
  for (let i = 1; i <= 8; i++) sum += parseInt(v[i], 10) * (9 - i);
  sum += parseInt(v[9], 10);
  return sum % 10 === 0;
}

// 統一編號：8 碼，含檢查碼（含 7 的特例）
function isValidTaxID(str) {
  const v = toHalfWidth(s(str)).trim();
  if (!/^\d{8}$/.test(v)) return false;
  const weights = [1, 2, 1, 2, 1, 2, 4, 1];
  let sum = 0;
  for (let i = 0; i < 8; i++) {
    const p = parseInt(v[i], 10) * weights[i];
    sum += Math.floor(p / 10) + (p % 10);
  }
  if (sum % 5 === 0) return true;
  return v[6] === '7' && (sum + 1) % 5 === 0;
}

// 電話：手機 09xxxxxxxx、市話含區碼，或 +886 開頭
function isValidTWPhone(str) {
  const v = toHalfWidth(s(str)).trim().replace(/[\s()-]/g, '');
  if (/^09\d{8}$/.test(v)) return true;
  if (/^\+8869\d{8}$/.test(v)) return true;
  if (/^0[2-8]\d{7,8}$/.test(v)) return true;
  if (/^\+886[2-8]\d{7,8}$/.test(v)) return true;
  return false;
}

// ---------- 規則白名單 ----------
//
// transform: (value, rule) => string | null（null 代表轉成 NULL）
// validate:  (value, rule) => boolean（false 代表格式不符，只標記不修改）

const RULE_OPS = {
  roc_to_ad: {
    label: '民國年轉西元',
    transform: (v, _r) => rocToAD(v) ?? v,
    changes: v => rocToAD(v) !== null,
  },
  fullwidth_to_halfwidth: {
    label: '全形轉半形',
    transform: v => toHalfWidth(v),
  },
  strip_currency: {
    label: '去除貨幣符號與千分位',
    transform: v => stripCurrency(v),
  },
  map_values: {
    label: '值對應',
    transform: (v, r) => {
      const key = toHalfWidth(s(v)).trim().toLowerCase();
      for (const pair of (r.mapping || [])) {
        if (toHalfWidth(s(pair.from)).trim().toLowerCase() === key) return s(pair.to);
      }
      return v;
    },
  },
  parse_date: {
    label: '依格式解析日期',
    transform: (v, r) => parseDateWithFormat(v, r.format) ?? v,
    changes: (v, r) => parseDateWithFormat(v, r.format) !== null,
  },
  trim: {
    label: '去除頭尾空白',
    transform: v => s(v).trim(),
  },
  null_if: {
    label: '指定值轉為 NULL',
    transform: (v, r) => (s(v).trim() === s(r.from).trim() ? '' : v),
  },
  upper: { label: '轉大寫', transform: v => s(v).toUpperCase() },
  lower: { label: '轉小寫', transform: v => s(v).toLowerCase() },

  validate_id:     { label: '檢查身分證格式', validate: v => isValidTWID(v) },
  validate_tax_id: { label: '檢查統一編號格式', validate: v => isValidTaxID(v) },
  validate_phone:  { label: '檢查電話格式', validate: v => isValidTWPhone(v) },
};

// validateRule 檢查規則是否合法（AI 回傳的規則一律先過這關）。
function validateRule(rule, fields) {
  if (!rule || typeof rule !== 'object') return '規則格式錯誤';
  const op = RULE_OPS[rule.op];
  if (!op) return `不支援的操作: ${rule.op}`;
  if (fields && !fields.some(f => f.name === rule.column)) return `找不到欄位: ${rule.column}`;
  if (rule.op === 'map_values' && (!Array.isArray(rule.mapping) || rule.mapping.length === 0)) {
    return 'map_values 需要 mapping';
  }
  if (rule.op === 'parse_date' && !rule.format) return 'parse_date 需要 format';
  if (rule.op === 'null_if' && (rule.from === null || rule.from === undefined || rule.from === '')) {
    return 'null_if 需要 from';
  }
  return null;
}

function columnIndex(fields, name) {
  return fields.findIndex(f => f.name === name);
}

// previewRule 統計規則會影響幾列，並取幾個前後對照範例。
function previewRule(fields, rows, rule, maxExamples = 3) {
  const err = validateRule(rule, fields);
  if (err) return { error: err, affected: 0, examples: [] };

  const ci = columnIndex(fields, rule.column);
  const op = RULE_OPS[rule.op];
  const examples = [];
  let affected = 0;

  rows.forEach((row, ri) => {
    const before = row[ci];
    if (before === null || before === undefined || before === '') return;

    if (op.validate) {
      if (!op.validate(before)) {
        affected++;
        if (examples.length < maxExamples) examples.push({ row: ri + 1, before: s(before), after: '(標記為格式不符)' });
      }
      return;
    }
    const after = op.transform(before, rule);
    if (s(after) !== s(before)) {
      affected++;
      if (examples.length < maxExamples) {
        examples.push({ row: ri + 1, before: s(before), after: after === '' ? '(NULL)' : s(after) });
      }
    }
  });

  return { error: null, affected, examples, isValidator: !!op.validate };
}

// applyRules 回傳新的 rows（不修改傳入的資料）與標記結果。
function applyRules(fields, rows, rules) {
  const out = rows.map(r => r.slice());
  const invalid = []; // 驗證類規則標記出來的儲存格
  let changed = 0;

  for (const rule of rules) {
    if (validateRule(rule, fields)) continue;
    const ci = columnIndex(fields, rule.column);
    const op = RULE_OPS[rule.op];

    out.forEach((row, ri) => {
      const before = row[ci];
      if (before === null || before === undefined || before === '') return;
      if (op.validate) {
        if (!op.validate(before)) invalid.push({ row: ri + 1, column: rule.column, value: s(before), message: op.label + '不符' });
        return;
      }
      const after = op.transform(before, rule);
      if (s(after) !== s(before)) { row[ci] = after; changed++; }
    });
  }
  return { rows: out, changed, invalid };
}

// ---------- 不需要 AI 的本地偵測 ----------
//
// 用 regex 就能抓到的（民國年、全形、貨幣、空白、格式驗證）先在本地做，
// 省下 AI 呼叫，也讓沒有設定 AI 的使用者一樣能用。

const SCAN_LIMIT = 200;

function detectRules(fields, rows) {
  const found = [];
  const sample = rows.slice(0, SCAN_LIMIT);

  fields.forEach((f, ci) => {
    const vals = sample.map(r => s(r[ci]).trim()).filter(v => v !== '');
    if (vals.length === 0) return;
    const ratio = fn => vals.filter(fn).length / vals.length;
    const name = s(f.name).toLowerCase();

    if (ratio(v => rocToAD(v) !== null) >= 0.6) {
      found.push(mk(f.name, 'roc_to_ad', '偵測到民國年格式的日期'));
    }
    if (ratio(v => /[！-～　]/.test(v)) >= 0.3) {
      found.push(mk(f.name, 'fullwidth_to_halfwidth', '偵測到全形字元'));
    }
    if (ratio(v => /^(NT\$|NTD|TWD|US\$|USD|\$|￥|¥)\s*[\d,]+(\.\d+)?$|^[\d,]+(\.\d+)?\s*(元|塊|圓)$|^\d{1,3}(,\d{3})+(\.\d+)?$/i.test(v)) >= 0.5) {
      found.push(mk(f.name, 'strip_currency', '偵測到貨幣符號或千分位'));
    }
    if (rows.slice(0, SCAN_LIMIT).some(r => s(r[ci]) !== s(r[ci]).trim())) {
      found.push(mk(f.name, 'trim', '偵測到頭尾有空白'));
    }
    // 格式驗證：欄位名稱或值的樣態符合才提議
    if (/身分證|身份證|id_?no|identity/.test(name) || ratio(v => /^[A-Za-z][12]\d{8}$/.test(v)) >= 0.6) {
      found.push(mk(f.name, 'validate_id', '看起來是身分證欄位'));
    }
    if (/統編|統一編號|tax|vat|ban/.test(name) || ratio(v => /^\d{8}$/.test(v)) >= 0.8) {
      found.push(mk(f.name, 'validate_tax_id', '看起來是統一編號欄位'));
    }
    if (/電話|手機|phone|mobile|tel/.test(name) || ratio(v => /^(09\d{8}|0\d{1,2}-?\d{6,8})$/.test(v)) >= 0.6) {
      found.push(mk(f.name, 'validate_phone', '看起來是電話欄位'));
    }
  });

  return found;
}

function mk(column, op, reason) {
  return { column, op, from: null, format: null, mapping: [], reason, source: 'local' };
}

window.Rules = {
  RULE_OPS, validateRule, previewRule, applyRules, detectRules,
  // 匯出供測試與其他模組使用
  rocToAD, toHalfWidth, stripCurrency, parseDateWithFormat,
  isValidTWID, isValidTaxID, isValidTWPhone,
};
