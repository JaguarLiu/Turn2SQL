// node test/ai.test.js — AI 前端模組的遮蔽與抽樣邏輯（不需要瀏覽器）
const vm = require('vm'), fs = require('fs'), path = require('path'), assert = require('assert');

// 最小限度的瀏覽器環境
const store = {};
const ctx = {
  window: {},
  console,
  localStorage: {
    getItem: k => (k in store ? store[k] : null),
    setItem: (k, v) => { store[k] = String(v); },
  },
  fetch: async () => { throw new Error('fetch not stubbed'); },
};
vm.createContext(ctx);
vm.runInContext(fs.readFileSync(path.join(__dirname, '..', 'static', 'js', 'ai.js'), 'utf8'), ctx);
const AI = ctx.window.AI;

let pass = 0;
const check = (name, fn) => {
  try { fn(); pass++; console.log('  ok  ' + name); }
  catch (e) { console.log('  FAIL ' + name + ': ' + e.message); process.exitCode = 1; }
};

console.log('\n[1] 個資偵測');
check('依欄位名偵測身分證', () => assert.strictEqual(AI.detectSensitive('身分證字號', ['A123456789']), 'id'));
check('依值偵測身分證', () => assert.strictEqual(AI.detectSensitive('col1', ['A123456789', 'B222222222']), 'id'));
check('偵測 email', () => assert.strictEqual(AI.detectSensitive('聯絡信箱', ['a@b.com']), 'email'));
check('偵測電話', () => assert.strictEqual(AI.detectSensitive('手機', ['0912345678']), 'phone'));
check('偵測姓名', () => assert.strictEqual(AI.detectSensitive('姓名', ['王小明']), 'name'));
check('偵測地址', () => assert.strictEqual(AI.detectSensitive('地址', ['台北市…']), 'address'));
check('一般欄位不誤判', () => assert.strictEqual(AI.detectSensitive('訂單金額', ['1234', '5678']), null));

console.log('\n[2] 遮蔽');
check('身分證被遮蔽且長度不變', () => {
  const m = AI.maskValue('A123456789', 'id');
  assert.strictEqual(m.length, 10);
  assert.notStrictEqual(m, 'A123456789');
  assert.ok(/^[A-Za-z]\d{9}$/.test(m), '格式應保留: ' + m);
});
check('同樣的值得到同樣的遮蔽結果', () => {
  assert.strictEqual(AI.maskValue('A123456789', 'id'), AI.maskValue('A123456789', 'id'));
});
check('不同的值得到不同的遮蔽結果', () => {
  assert.notStrictEqual(AI.maskValue('A123456789', 'id'), AI.maskValue('B987654321', 'id'));
});
check('email 保留網域', () => {
  const m = AI.maskValue('wang@example.com', 'email');
  assert.ok(m.endsWith('@example.com'), m);
  assert.ok(!m.startsWith('wang'), m);
});
check('姓名保留第一個字', () => {
  assert.strictEqual(AI.maskValue('王小明', 'name'), '王〇〇');
});
check('中文字遮成〇', () => {
  const m = AI.maskValue('台北市中正區', 'address');
  assert.strictEqual(m.length, 6);
  assert.ok(!m.includes('中正'), m);
});
check('空值不處理', () => assert.strictEqual(AI.maskValue('', 'id'), ''));

console.log('\n[3] 抽樣與統計');
const t = {
  tableName: 'orders', dialect: 'mysql',
  fields: [{ name: '身分證', type: 'VARCHAR' }, { name: '金額', type: 'DECIMAL' }, { name: '備註', type: 'VARCHAR' }],
  rows: [
    ['A123456789', '1234.50', 'x'],
    ['B222222222', '99', ''],
    ['A123456789', '1234.50', 'yy'],
  ],
};
check('統計正確', () => {
  const st = AI.columnStats(t.rows, 1);
  assert.strictEqual(st.total, 3);
  assert.strictEqual(st.nonEmpty, 3);
  assert.strictEqual(st.distinct, 2);
  assert.strictEqual(st.maxDecimal, 2);
});
check('空值不計入 nonEmpty', () => {
  const st = AI.columnStats(t.rows, 2);
  assert.strictEqual(st.nonEmpty, 2);
});
check('抽樣去重複', () => {
  const { columns } = AI.buildPayload(t);
  assert.deepStrictEqual(columns[1].samples.length, 2);
});
check('敏感欄位被遮蔽並列入 masked', () => {
  const { columns, masked } = AI.buildPayload(t);
  assert.ok(masked.some(m => m.column === '身分證' && m.kind === 'id'));
  assert.ok(!columns[0].samples.includes('A123456789'), '原始身分證不應出現');
});
check('非敏感欄位保留原值', () => {
  const { columns } = AI.buildPayload(t);
  assert.ok(columns[1].samples.includes('1234.50'));
});
check('關閉遮蔽時送原值', () => {
  const { columns, masked } = AI.buildPayload(t, { mask: false });
  assert.strictEqual(masked.length, 0);
  assert.ok(columns[0].samples.includes('A123456789'));
});
check('抽樣上限', () => {
  const big = { ...t, rows: Array.from({ length: 100 }, (_, i) => ['x' + i, String(i), '']) };
  const { columns } = AI.buildPayload(big, { sampleSize: 20 });
  assert.strictEqual(columns[0].samples.length, 20);
});
check('schemaPayload 帶 tableName 與 dialect', () => {
  const { payload } = AI.schemaPayload(t);
  assert.strictEqual(payload.tableName, 'orders');
  assert.strictEqual(payload.dialect, 'mysql');
  assert.strictEqual(payload.rowCount, 3);
  assert.strictEqual(payload.columns.length, 3);
});
check('cleanPayload 不含資料表名稱', () => {
  const { payload } = AI.cleanPayload(t);
  assert.ok(!('tableName' in payload));
  assert.strictEqual(payload.rowCount, 3);
});
check('完整資料不會被送出（只有抽樣）', () => {
  const big = { ...t, rows: Array.from({ length: 5000 }, (_, i) => ['A' + i, String(i), 'note' + i]) };
  const { payload } = AI.schemaPayload(big);
  const json = JSON.stringify(payload);
  assert.ok(json.length < 20000, 'payload 過大: ' + json.length);
  assert.ok(!json.includes('note4999'), '不應包含最後一列的資料');
});

console.log('\n[4] 設定');
check('預設未啟用', () => assert.strictEqual(AI.enabled(), false));
check('存入金鑰後啟用', () => {
  AI.save({ provider: 'claude', apiKey: 'k' });
  assert.strictEqual(AI.enabled(), true);
});
check('設定寫入 localStorage', () => {
  assert.ok(store['turn2sql.ai.v1'].includes('claude'));
});

console.log(`\n${pass} 項通過`);
