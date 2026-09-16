// node test/rules.test.js — 清洗規則引擎測試（不需要瀏覽器）
const vm = require('vm'), fs = require('fs'), path = require('path'), assert = require('assert');

const ctx = { window: {}, console };
vm.createContext(ctx);
vm.runInContext(fs.readFileSync(path.join(__dirname, '..', 'static', 'js', 'rules.js'), 'utf8'), ctx);
const R = ctx.window.Rules;

let pass = 0;
const check = (name, fn) => {
  try { fn(); pass++; console.log('  ok  ' + name); }
  catch (e) { console.log('  FAIL ' + name + ': ' + e.message); process.exitCode = 1; }
};

console.log('\n[1] 台灣格式轉換');
check('民國年 113/05/01', () => assert.strictEqual(R.rocToAD('113/05/01'), '2024-05-01'));
check('民國年 1130501', () => assert.strictEqual(R.rocToAD('1130501'), '2024-05-01'));
check('民國年 99.12.31', () => assert.strictEqual(R.rocToAD('99.12.31'), '2010-12-31'));
check('西元年不誤判為民國年', () => assert.strictEqual(R.rocToAD('2026/05/01'), null));
check('不存在的日期 113/02/30', () => assert.strictEqual(R.rocToAD('113/02/30'), null));
check('全形轉半形', () => assert.strictEqual(R.toHalfWidth('ＡＢＣ１２３'), 'ABC123'));
check('全形空白', () => assert.strictEqual(R.toHalfWidth('a　b'), 'a b'));
check('NT$1,234', () => assert.strictEqual(R.stripCurrency('NT$1,234'), '1234'));
check('1,234 元', () => assert.strictEqual(R.stripCurrency('1,234 元'), '1234'));
check('$99.50', () => assert.strictEqual(R.stripCurrency('$99.50'), '99.50'));
check('parse_date DD/MM/YYYY', () => assert.strictEqual(R.parseDateWithFormat('01/05/2026', 'DD/MM/YYYY'), '2026-05-01'));
check('parse_date MM/DD/YYYY', () => assert.strictEqual(R.parseDateWithFormat('01/05/2026', 'MM/DD/YYYY'), '2026-01-05'));
check('parse_date YYYYMMDD', () => assert.strictEqual(R.parseDateWithFormat('20260501', 'YYYYMMDD'), '2026-05-01'));
check('parse_date 不支援的格式', () => assert.strictEqual(R.parseDateWithFormat('01-05-26', 'YY-MM-DD'), null));

console.log('\n[2] 格式驗證');
check('身分證 A123456789 合法', () => assert.strictEqual(R.isValidTWID('A123456789'), true));
check('身分證檢查碼錯誤', () => assert.strictEqual(R.isValidTWID('A123456788'), false));
check('身分證格式錯誤', () => assert.strictEqual(R.isValidTWID('123456789'), false));
check('統編 04595257 合法', () => assert.strictEqual(R.isValidTaxID('04595257'), true));
check('統編檢查碼錯誤', () => assert.strictEqual(R.isValidTaxID('12345678'), false));
check('手機 0912345678', () => assert.strictEqual(R.isValidTWPhone('0912345678'), true));
check('市話 02-23456789', () => assert.strictEqual(R.isValidTWPhone('02-23456789'), true));
check('+886912345678', () => assert.strictEqual(R.isValidTWPhone('+886912345678'), true));
check('電話太短', () => assert.strictEqual(R.isValidTWPhone('091234'), false));

console.log('\n[3] 規則驗證（AI 輸出的守門）');
const fields = [{ name: 'd', type: 'DATE' }, { name: 'amt', type: 'DECIMAL' }];
check('未知 op 被拒', () => assert.ok(R.validateRule({ column: 'd', op: 'rm -rf' }, fields)));
check('不存在的欄位被拒', () => assert.ok(R.validateRule({ column: 'nope', op: 'trim' }, fields)));
check('map_values 缺 mapping 被拒', () => assert.ok(R.validateRule({ column: 'd', op: 'map_values' }, fields)));
check('parse_date 缺 format 被拒', () => assert.ok(R.validateRule({ column: 'd', op: 'parse_date' }, fields)));
check('null_if 缺 from 被拒', () => assert.ok(R.validateRule({ column: 'd', op: 'null_if' }, fields)));
check('合法規則通過', () => assert.strictEqual(R.validateRule({ column: 'd', op: 'roc_to_ad' }, fields), null));

console.log('\n[4] 預覽與套用');
const F = [{ name: 'date', type: 'DATE' }, { name: 'amount', type: 'DECIMAL' }, { name: 'flag', type: 'BOOLEAN' }];
const ROWS = [['113/05/01', 'NT$1,234', '是'], ['113/06/15', '2,000 元', '否'], ['2026-01-01', '500', '是']];

check('預覽統計影響列數', () => {
  const p = R.previewRule(F, ROWS, { column: 'date', op: 'roc_to_ad' });
  assert.strictEqual(p.affected, 2);
  assert.strictEqual(p.examples[0].before, '113/05/01');
  assert.strictEqual(p.examples[0].after, '2024-05-01');
});
check('已是西元的列不算影響', () => {
  const p = R.previewRule(F, ROWS, { column: 'date', op: 'roc_to_ad' });
  assert.ok(!p.examples.some(e => e.before === '2026-01-01'));
});
check('套用不修改原始 rows', () => {
  const res = R.applyRules(F, ROWS, [{ column: 'date', op: 'roc_to_ad' }]);
  assert.strictEqual(ROWS[0][0], '113/05/01');
  assert.strictEqual(res.rows[0][0], '2024-05-01');
  assert.strictEqual(res.changed, 2);
});
check('多條規則依序套用', () => {
  const res = R.applyRules(F, ROWS, [
    { column: 'date', op: 'roc_to_ad' },
    { column: 'amount', op: 'strip_currency' },
    { column: 'flag', op: 'map_values', mapping: [{ from: '是', to: '1' }, { from: '否', to: '0' }] },
  ]);
  assert.deepStrictEqual(res.rows[0], ['2024-05-01', '1234', '1']);
  assert.deepStrictEqual(res.rows[1], ['2024-06-15', '2000', '0']);
});
check('null_if 轉成空值', () => {
  const res = R.applyRules(F, [['N/A', '1', '是']], [{ column: 'date', op: 'null_if', from: 'N/A' }]);
  assert.strictEqual(res.rows[0][0], '');
});
check('驗證類規則只標記不修改', () => {
  const f = [{ name: 'id', type: 'VARCHAR' }];
  const rows = [['A123456789'], ['A000000000']];
  const res = R.applyRules(f, rows, [{ column: 'id', op: 'validate_id' }]);
  assert.strictEqual(res.changed, 0);
  assert.strictEqual(res.invalid.length, 1);
  assert.strictEqual(res.invalid[0].row, 2);
});
check('不合法的規則被略過', () => {
  const res = R.applyRules(F, ROWS, [{ column: 'date', op: 'evil_op' }]);
  assert.strictEqual(res.changed, 0);
});
check('空值不處理', () => {
  const res = R.applyRules(F, [['', '', '']], [{ column: 'date', op: 'roc_to_ad' }, { column: 'amount', op: 'trim' }]);
  assert.strictEqual(res.changed, 0);
});

console.log('\n[5] 本地偵測（不需要 AI）');
check('偵測民國年', () => {
  const found = R.detectRules(F, ROWS);
  assert.ok(found.some(r => r.column === 'date' && r.op === 'roc_to_ad'));
});
check('偵測貨幣', () => {
  const found = R.detectRules(F, ROWS);
  assert.ok(found.some(r => r.column === 'amount' && r.op === 'strip_currency'));
});
check('偵測全形', () => {
  const found = R.detectRules([{ name: 'x' }], [['ＡＢＣ'], ['ＤＥＦ']]);
  assert.ok(found.some(r => r.op === 'fullwidth_to_halfwidth'));
});
check('偵測頭尾空白', () => {
  const found = R.detectRules([{ name: 'x' }], [[' a '], ['b']]);
  assert.ok(found.some(r => r.op === 'trim'));
});
check('依欄位名偵測身分證', () => {
  const found = R.detectRules([{ name: '身分證字號' }], [['A123456789']]);
  assert.ok(found.some(r => r.op === 'validate_id'));
});
check('依值樣態偵測電話', () => {
  const found = R.detectRules([{ name: 'contact' }], [['0912345678'], ['0987654321']]);
  assert.ok(found.some(r => r.op === 'validate_phone'));
});
check('乾淨的資料不產生規則', () => {
  const found = R.detectRules([{ name: 'note' }], [['hello'], ['world']]);
  assert.strictEqual(found.length, 0);
});
check('偵測結果標記為 local', () => {
  const found = R.detectRules(F, ROWS);
  assert.ok(found.every(r => r.source === 'local'));
});

console.log(`\n${pass} 項通過`);
