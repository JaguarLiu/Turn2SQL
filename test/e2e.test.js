const vm=require('vm'),fs=require('fs'),path=require('path'),assert=require('assert');
// 用法：
//   AI_PROVIDER=mock AI_MOCK_DIR=test/fixtures/ai AI_MODEL_SCHEMA=schema AI_MODEL_CLEAN=clean \
//     DATABASE_PATH=/tmp/e2e.db go run main.go &
//   node test/e2e.test.js
// 需要先啟動帶 mock provider 的伺服器，見檔尾說明
const base=path.join(__dirname,'..','static','js')+path.sep;
const store={};
const ctx={window:{},console,localStorage:{getItem:k=>k in store?store[k]:null,setItem:(k,v)=>{store[k]=String(v)}},fetch:(u,o)=>fetch('http://localhost:8000'+u,o)};
vm.createContext(ctx);
for(const f of ['rules.js','ai.js']) vm.runInContext(fs.readFileSync(base+f,'utf8'),ctx);
const {AI,Rules}=ctx.window;

const t={tableName:'訂單資料',dialect:'mysql',
 fields:[{name:'訂單日期',type:'VARCHAR'},{name:'金額',type:'VARCHAR'},{name:'身分證',type:'VARCHAR'},{name:'狀態',type:'VARCHAR'}],
 rows:[['113/05/01','NT$1,234','A123456789','是'],['113/06/15','2,000 元','B222222222','否'],['113/07/01','500','A123456788','是']]};

(async()=>{
  // 1. 智慧建表
  const s=await AI.suggestSchema(t, {});
  assert.strictEqual(s.provider,'mock');
  console.log('  ok  /api/ai/schema 接受前端 payload, 回傳', s.result.columns.length, '欄建議');
  assert.ok(s.masked.some(m=>m.column==='身分證'), '身分證應被遮蔽');
  console.log('  ok  身分證欄位有被遮蔽:', JSON.stringify(s.masked));
  const sent=AI.getLastPayload().body;
  assert.ok(!JSON.stringify(sent).includes('A123456789'), '送出內容不得包含真實身分證');
  console.log('  ok  送出的 JSON 不含真實身分證');

  // 2. 清洗規則
  const c=await AI.suggestCleanRules(t, {});
  const aiRules=c.result.rules;
  console.log('  ok  /api/ai/clean-rules 回傳', aiRules.length, '條規則');

  // 3. AI 規則通過白名單驗證
  for(const r of aiRules) assert.strictEqual(Rules.validateRule(r,t.fields),null,'規則應合法: '+JSON.stringify(r));
  console.log('  ok  所有 AI 規則通過白名單驗證');

  // 4. 套用規則
  const res=Rules.applyRules(t.fields,t.rows,aiRules);
  assert.strictEqual(res.rows[0].join('|'),'2024-05-01|1234|A123456789|1');
  assert.strictEqual(res.rows[1].join('|'),'2024-06-15|2000|B222222222|0');
  console.log('  ok  套用後:', JSON.stringify(res.rows[0]), '共改', res.changed, '格');

  // 5. 本地偵測 + 驗證類規則
  const local=Rules.detectRules(t.fields,t.rows);
  console.log('  ok  本地偵測到', local.length, '條規則:', local.map(r=>r.column+'/'+r.op).join(', '));
  const idRule=local.find(r=>r.op==='validate_id');
  assert.ok(idRule,'應偵測到身分證欄位');
  const vres=Rules.applyRules(t.fields,t.rows,[idRule]);
  // A123456789 檢查碼正確；B222222222 與 A123456788 都是假號碼，應被標記
  assert.strictEqual(vres.invalid.length,2);
  assert.strictEqual(vres.invalid.map(v=>v.row).join(','),'2,3');
  assert.strictEqual(vres.changed,0,'驗證類規則不得修改資料');
  console.log('  ok  身分證檢查標記', vres.invalid.length, '列且未修改資料:', JSON.stringify(vres.invalid.map(v=>v.value)));

  // 6. 後端 schema 驗證真的會擋
  const bad=await fetch('http://localhost:8000/api/ai/schema',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({columns:[]})});
  assert.strictEqual(bad.status,400);
  console.log('  ok  空欄位請求被擋下 (400)');
  console.log('\n端對端全部通過');
})().catch(e=>{console.error('FAIL',e.message);process.exit(1)});
