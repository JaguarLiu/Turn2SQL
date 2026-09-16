// AI 前端模組 — 設定、遮蔽、抽樣、呼叫後端
//
// 原則：完整資料不離開瀏覽器。只送欄位名 + 抽樣值（預設遮蔽）+ 統計摘要。

const AI = (() => {
  const KEY = 'turn2sql.ai.v1';
  const DEFAULTS = {
    provider: 'gemini', // 預設 provider；自帶金鑰時用這家（空字串 = 用伺服器預設）
    model: '',
    apiKey: '',     // 只存在 localStorage，不會同步到伺服器
    mask: true,     // 送出前遮蔽疑似個資
    consent: false, // 是否已同意送出說明
  };
  const SAMPLE_SIZE = 20;

  let settings = load();
  let serverInfo = null;
  let lastPayload = null; // 供「檢視這次送出的內容」

  function load() {
    try { return { ...DEFAULTS, ...JSON.parse(localStorage.getItem(KEY) || '{}') }; }
    catch { return { ...DEFAULTS }; }
  }
  function save(patch) {
    settings = { ...settings, ...patch };
    try { localStorage.setItem(KEY, JSON.stringify(settings)); } catch {}
    return settings;
  }
  function get() { return { ...settings }; }

  // ---------- 伺服器能力 ----------

  async function loadServerInfo(force) {
    if (serverInfo && !force) return serverInfo;
    try {
      const res = await fetch('/api/ai/providers');
      serverInfo = res.ok ? await res.json() : null;
    } catch { serverInfo = null; }
    return serverInfo;
  }
  function cachedServerInfo() { return serverInfo; }

  // enabled：伺服器有預設 provider，或使用者自帶金鑰
  function enabled() {
    return !!(settings.apiKey && settings.provider) || !!(serverInfo && serverInfo.serverDefault);
  }

  // ---------- 遮蔽 ----------

  // 依欄位名與值的樣態判斷是否為個資
  function detectSensitive(name, samples) {
    const n = String(name || '').toLowerCase();
    const vals = (samples || []).map(v => String(v ?? '').trim()).filter(Boolean);
    const ratio = fn => (vals.length ? vals.filter(fn).length / vals.length : 0);

    if (/身分證|身份證|id_?no|identity/.test(n) || ratio(v => /^[A-Za-z][12]\d{8}$/.test(v)) >= 0.6) return 'id';
    if (/e-?mail|信箱|郵件/.test(n) || ratio(v => /^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(v)) >= 0.6) return 'email';
    if (/電話|手機|phone|mobile|tel/.test(n) || ratio(v => /^(09\d{8}|0\d{1,2}-?\d{6,8})$/.test(v)) >= 0.6) return 'phone';
    if (/姓名|名字|客戶名|聯絡人|full_?name|^name$/.test(n)) return 'name';
    if (/地址|address/.test(n)) return 'address';
    return null;
  }

  // 穩定的偽隨機：同樣的輸入得到同樣的遮蔽結果，
  // 讓 AI 仍看得出「有幾個不同的值」，但看不到真實內容。
  function hash(str) {
    let h = 2166136261;
    for (let i = 0; i < str.length; i++) { h ^= str.charCodeAt(i); h = Math.imul(h, 16777619); }
    return Math.abs(h);
  }
  function maskChars(str) {
    const h = hash(str);
    let i = 0;
    return String(str).replace(/[0-9A-Za-z\u4e00-\u9fff]/g, c => {
      const n = (h >> ((i++ % 8) * 3)) & 0xff;
      if (/[0-9]/.test(c)) return String((n % 10));
      if (/[a-z]/.test(c)) return String.fromCharCode(97 + (n % 26));
      if (/[A-Z]/.test(c)) return String.fromCharCode(65 + (n % 26));
      return '〇'; // 中文字一律換成〇，長度保持不變
    });
  }
  function maskValue(v, kind) {
    const str = String(v ?? '');
    if (!str) return str;
    switch (kind) {
      case 'email': {
        const at = str.indexOf('@');
        return at > 0 ? maskChars(str.slice(0, at)) + str.slice(at) : maskChars(str);
      }
      case 'name':
        // 保留第一個字，其餘遮蔽，讓 AI 仍看得出是人名
        return str.length <= 1 ? str : str[0] + '〇'.repeat(str.length - 1);
      default:
        return maskChars(str);
    }
  }

  // ---------- 抽樣與統計 ----------

  function columnStats(rows, ci) {
    const seen = new Set();
    let nonEmpty = 0, maxLen = 0, maxDecimal = 0;
    for (const row of rows) {
      const v = String(row[ci] ?? '').trim();
      if (v === '') continue;
      nonEmpty++;
      seen.add(v);
      if (v.length > maxLen) maxLen = v.length;
      const dot = v.match(/^-?[\d,]+\.(\d+)$/);
      if (dot && dot[1].length > maxDecimal) maxDecimal = dot[1].length;
    }
    return { total: rows.length, nonEmpty, distinct: seen.size, maxLen, maxDecimal };
  }

  // buildPayload 產生要送出的內容；同時回傳哪些欄位被遮蔽了。
  function buildPayload(t, { sampleSize = SAMPLE_SIZE, mask = settings.mask } = {}) {
    const masked = [];
    const columns = t.fields.map((f, ci) => {
      const raw = [];
      const seen = new Set();
      for (const row of t.rows) {
        const v = String(row[ci] ?? '').trim();
        if (v === '' || seen.has(v)) continue;
        seen.add(v);
        raw.push(v);
        if (raw.length >= sampleSize) break;
      }
      const kind = mask ? detectSensitive(f.name, raw) : null;
      if (kind) masked.push({ column: f.name, kind });
      return {
        name: f.name,
        samples: kind ? raw.map(v => maskValue(v, kind)) : raw,
        stats: columnStats(t.rows, ci),
      };
    });
    return { columns, masked };
  }

  function schemaPayload(t, opts) {
    const { columns, masked } = buildPayload(t, opts);
    return { payload: { tableName: t.tableName, dialect: t.dialect, rowCount: t.rows.length, columns }, masked };
  }
  function cleanPayload(t, opts) {
    const { columns, masked } = buildPayload(t, opts);
    return { payload: { rowCount: t.rows.length, columns }, masked };
  }

  // ---------- 呼叫後端 ----------

  async function post(path, body) {
    const headers = { 'Content-Type': 'application/json' };
    // 自帶金鑰：用 header 傳，不放在 URL
    if (settings.apiKey && settings.provider) {
      headers['X-AI-Provider'] = settings.provider;
      headers['X-AI-Key'] = settings.apiKey;
      if (settings.model) headers['X-AI-Model'] = settings.model;
    }
    lastPayload = { path, body, at: new Date().toISOString() };

    const res = await fetch(path, { method: 'POST', headers, body: JSON.stringify(body) });
    let data = null;
    try { data = await res.json(); } catch {}
    if (!res.ok) {
      const err = new Error((data && data.error) || `HTTP ${res.status}`);
      err.status = res.status;
      throw err;
    }
    return data;
  }

  async function suggestSchema(t, opts) {
    const { payload, masked } = schemaPayload(t, opts);
    const res = await post('/api/ai/schema', payload);
    return { ...res, masked };
  }
  async function suggestCleanRules(t, opts) {
    const { payload, masked } = cleanPayload(t, opts);
    const res = await post('/api/ai/clean-rules', payload);
    return { ...res, masked };
  }

  function getLastPayload() { return lastPayload; }

  return {
    get, save, enabled, loadServerInfo, cachedServerInfo,
    detectSensitive, maskValue, buildPayload, schemaPayload, cleanPayload, columnStats,
    suggestSchema, suggestCleanRules, getLastPayload,
    SAMPLE_SIZE,
  };
})();

window.AI = AI;
