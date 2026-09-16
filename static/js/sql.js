// SQL generation for multiple dialects — vanilla JS

const DIALECTS = [
  { id: 'mysql', label: 'MySQL' },
  { id: 'postgres', label: 'PostgreSQL' },
  { id: 'mssql', label: 'SQL Server' },
  { id: 'sqlite', label: 'SQLite' },
  { id: 'ansi', label: 'ANSI SQL' },
];

const DATA_TYPES = ['VARCHAR', 'INT', 'DECIMAL', 'DATE', 'BOOLEAN'];

const DEFAULT_VARCHAR_LEN = 255;
const DEFAULT_PRECISION = 18;
const DEFAULT_SCALE = 4;

// 欄位可帶的屬性（皆為選填，舊 template 沒有這些欄位時行為與過去相同）：
//   length     VARCHAR 長度
//   precision  DECIMAL 總位數
//   scale      DECIMAL 小數位數
//   nullable   明確為 false 時輸出 NOT NULL
//   primaryKey 為 true 時納入主鍵
//   comment    欄位註解
function typeForDialect(field, dialect) {
  const f = typeof field === 'string' ? { type: field } : (field || {});
  const t = (f.type || 'VARCHAR').toUpperCase();
  const len = intOr(f.length, DEFAULT_VARCHAR_LEN);
  const prec = intOr(f.precision, DEFAULT_PRECISION);
  const scale = intOr(f.scale, DEFAULT_SCALE);

  switch (dialect) {
    case 'mysql':
      return { VARCHAR: `VARCHAR(${len})`, INT: 'INT', DECIMAL: `DECIMAL(${prec},${scale})`, DATE: 'DATE', BOOLEAN: 'TINYINT(1)' }[t] || `VARCHAR(${len})`;
    case 'postgres':
      return { VARCHAR: `VARCHAR(${len})`, INT: 'INTEGER', DECIMAL: `NUMERIC(${prec},${scale})`, DATE: 'DATE', BOOLEAN: 'BOOLEAN' }[t] || `VARCHAR(${len})`;
    case 'mssql':
      return { VARCHAR: `NVARCHAR(${len})`, INT: 'INT', DECIMAL: `DECIMAL(${prec},${scale})`, DATE: 'DATE', BOOLEAN: 'BIT' }[t] || `NVARCHAR(${len})`;
    case 'sqlite':
      // SQLite 是動態型別，長度與精度沒有意義
      return { VARCHAR: 'TEXT', INT: 'INTEGER', DECIMAL: 'REAL', DATE: 'TEXT', BOOLEAN: 'INTEGER' }[t] || 'TEXT';
    default:
      return { VARCHAR: `VARCHAR(${len})`, INT: 'INTEGER', DECIMAL: `DECIMAL(${prec},${scale})`, DATE: 'DATE', BOOLEAN: 'BOOLEAN' }[t] || `VARCHAR(${len})`;
  }
}

function intOr(v, def) {
  const n = parseInt(v, 10);
  return Number.isFinite(n) && n > 0 ? n : def;
}

function quoteIdent(name, dialect) {
  const safe = String(name || 'col').replace(/[^A-Za-z0-9_\u4e00-\u9fff]/g, '_').replace(/^(\d)/, '_$1') || 'col';
  if (dialect === 'mysql')  return '`' + safe + '`';
  if (dialect === 'mssql')  return '[' + safe + ']';
  return '"' + safe + '"';
}

function safeTableName(name) {
  const base = String(name || 'my_table').replace(/\.[a-z0-9]+$/i, '');
  return base.replace(/[^A-Za-z0-9_]/g, '_').replace(/^(\d)/, '_$1').toLowerCase() || 'my_table';
}

function quoteStr(s) {
  return "'" + String(s).replace(/'/g, "''") + "'";
}

// quoteVal 是「資料值」用的字串字面值。
// SQL Server 必須加 N 前綴，否則字面值會用非 Unicode 的 codepage 解析，
// 中文會整個變成 ?（欄位是 NVARCHAR 也一樣）。
function quoteVal(s, dialect) {
  const q = quoteStr(s);
  return dialect === 'mssql' ? 'N' + q : q;
}

// parseDateValue 自己解析年月日，不用 new Date()。
// new Date('2026/05/01') 會被當成「本地時間午夜」，再 toISOString() 轉成 UTC 會退一天
// （UTC+8 會變成 2026-04-30）。回傳 null 代表無法解析。
function parseDateValue(s) {
  const str = String(s).trim();
  let y, m, d;

  // 2026-05-01 / 2026/5/1 / 2026.05.01（可後接時間，忽略）
  let mt = str.match(/^(\d{4})[-/.](\d{1,2})[-/.](\d{1,2})(?:[ T].*)?$/);
  if (mt) {
    [, y, m, d] = mt;
  } else if ((mt = str.match(/^(\d{4})(\d{2})(\d{2})$/))) {
    // 20260501
    [, y, m, d] = mt;
  } else {
    return null;
  }

  y = parseInt(y, 10); m = parseInt(m, 10); d = parseInt(d, 10);
  if (m < 1 || m > 12 || d < 1 || d > 31) return null;
  // 檢查該月是否真的有這一天（用 UTC 建構，避免時區位移）
  const probe = new Date(Date.UTC(y, m - 1, d));
  if (probe.getUTCFullYear() !== y || probe.getUTCMonth() !== m - 1 || probe.getUTCDate() !== d) return null;

  return `${String(y).padStart(4, '0')}-${String(m).padStart(2, '0')}-${String(d).padStart(2, '0')}`;
}

const BOOL_TRUE = ['1', 'true', 't', 'yes', 'y', '是', 'v', '✓', 'o'];
const BOOL_FALSE = ['0', 'false', 'f', 'no', 'n', '否', 'x'];

// formatValue 回傳 { sql, warning }。
// warning 不為 null 時表示值無法依欄位型別解析，呼叫端要提示使用者，
// 不再默默把資料變成 NULL。
function formatValue(raw, field, dialect) {
  const f = typeof field === 'string' ? { type: field } : (field || {});
  const t = (f.type || 'VARCHAR').toUpperCase();

  if (raw === null || raw === undefined || raw === '') return { sql: 'NULL', warning: null };
  const s = String(raw);

  if (t === 'INT') {
    const cleaned = s.replace(/[,\s]/g, '');
    const n = /^[+-]?\d+$/.test(cleaned) ? parseInt(cleaned, 10) : NaN;
    if (Number.isFinite(n)) return { sql: String(n), warning: null };
    return { sql: 'NULL', warning: '不是整數，已輸出 NULL' };
  }

  if (t === 'DECIMAL') {
    const cleaned = s.replace(/[,\s]/g, '');
    const n = /^[+-]?(\d+\.?\d*|\.\d+)$/.test(cleaned) ? parseFloat(cleaned) : NaN;
    if (Number.isFinite(n)) return { sql: String(n), warning: null };
    return { sql: 'NULL', warning: '不是數字，已輸出 NULL' };
  }

  if (t === 'BOOLEAN') {
    const v = s.trim().toLowerCase();
    const pgLike = dialect === 'postgres' || dialect === 'ansi';
    if (BOOL_TRUE.includes(v)) return { sql: pgLike ? 'TRUE' : '1', warning: null };
    if (BOOL_FALSE.includes(v)) return { sql: pgLike ? 'FALSE' : '0', warning: null };
    return { sql: 'NULL', warning: '不是可辨識的真偽值，已輸出 NULL' };
  }

  if (t === 'DATE') {
    const iso = parseDateValue(s);
    if (iso) return { sql: quoteVal(iso, dialect), warning: null };
    // 解析不出來時原樣輸出，讓資料庫自己判斷，但要提醒使用者
    return { sql: quoteVal(s, dialect), warning: '無法解析為日期，已原樣輸出' };
  }

  return { sql: quoteVal(s, dialect), warning: null };
}

// 收集警告，避免整份資料都壞掉時產生上萬筆訊息
const MAX_WARNINGS = 200;

function pushWarning(warnings, rowIdx, field, value, message) {
  if (warnings.length >= MAX_WARNINGS) {
    warnings.truncated = true;
    return;
  }
  warnings.push({ row: rowIdx + 1, column: field.name, type: (field.type || 'VARCHAR').toUpperCase(), value: String(value), message });
}

function val(raw, field, dialect, warnings, rowIdx) {
  const r = formatValue(raw, field, dialect);
  if (r.warning) pushWarning(warnings, rowIdx, field, raw, r.warning);
  return r.sql;
}

// buildColumnLines 產生 CREATE TABLE 的欄位定義。
function buildColumnLines(cols, dialect) {
  const pkCols = cols.filter(f => f.primaryKey);
  const inlinePK = pkCols.length === 1;
  const lines = cols.map(f => {
    let line = '  ' + quoteIdent(f.name, dialect) + ' ' + typeForDialect(f, dialect);
    // 主鍵必為 NOT NULL；其餘欄位只有明確標記 nullable:false 時才加
    if (f.primaryKey || f.nullable === false) line += ' NOT NULL';
    if (inlinePK && f.primaryKey) line += ' PRIMARY KEY';
    if (f.comment) {
      if (dialect === 'mysql') {
        line += ' COMMENT ' + quoteStr(f.comment);
      } else if (dialect !== 'postgres') {
        // 沒有行內註解語法的方言（MSSQL / SQLite / ANSI）把註解放在欄位的「上一行」。
        // 放在後面的話，join(',\n') 加上的逗號會被 -- 吃掉，整段 CREATE TABLE 就壞了。
        line = '  -- ' + String(f.comment).replace(/[\r\n]+/g, ' ') + '\n' + line;
      }
    }
    return line;
  });
  if (pkCols.length > 1) {
    lines.push('  PRIMARY KEY (' + pkCols.map(f => quoteIdent(f.name, dialect)).join(', ') + ')');
  }
  return lines;
}

// generateSQL 回傳 { sql, warnings }。
function generateSQL({ tableName, fields, rows, dialect, mode, whereCols }) {
  const tbl = safeTableName(tableName);
  const qTbl = quoteIdent(tbl, dialect);
  const warnings = [];
  const lines = [];
  lines.push('-- ============================================');
  lines.push('-- Generated by Turn2SQL');
  lines.push('-- Dialect: ' + (DIALECTS.find(d => d.id === dialect)?.label || dialect));
  lines.push('-- Table  : ' + tbl);
  lines.push('-- Rows   : ' + rows.length);
  lines.push('-- At     : ' + new Date().toISOString());
  lines.push('-- ============================================');
  lines.push('');

  const cols = fields;

  if (mode === 'create' || mode === 'both') {
    if (dialect === 'mssql') {
      lines.push(`IF OBJECT_ID('${tbl}', 'U') IS NOT NULL DROP TABLE ${qTbl};`);
    } else {
      lines.push(`DROP TABLE IF EXISTS ${qTbl};`);
    }
    lines.push(`CREATE TABLE ${qTbl} (`);
    // 註解不能用行尾 -- 的方言（PostgreSQL 用 COMMENT ON），其餘直接附在欄位後面
    lines.push(buildColumnLines(cols, dialect).join(',\n'));
    lines.push(');');
    if (dialect === 'postgres') {
      for (const f of cols) {
        if (f.comment) {
          lines.push(`COMMENT ON COLUMN ${qTbl}.${quoteIdent(f.name, dialect)} IS ${quoteStr(f.comment)};`);
        }
      }
    }
    lines.push('');
  }

  if (mode === 'insert' || mode === 'both') {
    if (rows.length === 0) {
      lines.push('-- (no data rows to insert)');
    } else {
      const colList = cols.map(f => quoteIdent(f.name, dialect)).join(', ');
      rows.forEach((row, ri) => {
        const vals = cols.map((f, i) => val(row[i], f, dialect, warnings, ri));
        lines.push(`INSERT INTO ${qTbl} (${colList}) VALUES (${vals.join(', ')});`);
      });
    }
  }

  if (mode === 'update') {
    const whereSet = new Set(whereCols || []);
    const whereIdx = cols.map((f, i) => whereSet.has(f.name) ? i : -1).filter(i => i >= 0);
    const setIdx   = cols.map((_, i) => i).filter(i => !whereSet.has(cols[i].name));

    if (whereIdx.length === 0) {
      lines.push('-- (UPDATE requires at least one WHERE column — none selected)');
    } else if (setIdx.length === 0) {
      lines.push('-- (no non-WHERE columns available to SET)');
    } else if (rows.length === 0) {
      lines.push('-- (no data rows to update)');
    } else {
      rows.forEach((row, ri) => {
        const setClause = setIdx
          .map(i => `${quoteIdent(cols[i].name, dialect)} = ${val(row[i], cols[i], dialect, warnings, ri)}`)
          .join(', ');
        const whereClause = whereIdx
          .map(i => {
            const v = val(row[i], cols[i], dialect, warnings, ri);
            const q = quoteIdent(cols[i].name, dialect);
            return v === 'NULL' ? `${q} IS NULL` : `${q} = ${v}`;
          })
          .join(' AND ');
        lines.push(`UPDATE ${qTbl} SET ${setClause} WHERE ${whereClause};`);
      });
    }
  }

  return { sql: lines.join('\n'), warnings };
}

window.Turn2SQL = { DIALECTS, DATA_TYPES, generateSQL, safeTableName, parseDateValue, formatValue };
