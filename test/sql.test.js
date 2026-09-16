const vm=require('vm'),fs=require('fs'),assert=require('assert');
const ctx={window:{}, console};
vm.createContext(ctx);
vm.runInContext(fs.readFileSync(require('path').join(__dirname,'..','static','js','sql.js'),'utf8'), ctx);
const T=ctx.window.Turn2SQL;
let pass=0; const check=(name,fn)=>{try{fn();pass++;console.log('  ok  '+name);}catch(e){console.log('  FAIL '+name+': '+e.message);process.exitCode=1;}};

console.log('TZ =', Intl.DateTimeFormat().resolvedOptions().timeZone);

console.log('\n[1] 日期解析（時區 bug）');
check("2026/05/01 不會退一天", ()=>assert.strictEqual(T.parseDateValue('2026/05/01'),'2026-05-01'));
check("2026-05-01", ()=>assert.strictEqual(T.parseDateValue('2026-05-01'),'2026-05-01'));
check("2026/5/1 補零", ()=>assert.strictEqual(T.parseDateValue('2026/5/1'),'2026-05-01'));
check("20260501", ()=>assert.strictEqual(T.parseDateValue('20260501'),'2026-05-01'));
check("2026.12.31", ()=>assert.strictEqual(T.parseDateValue('2026.12.31'),'2026-12-31'));
check("帶時間", ()=>assert.strictEqual(T.parseDateValue('2026-05-01 13:45:00'),'2026-05-01'));
check("2/30 不存在 → null", ()=>assert.strictEqual(T.parseDateValue('2026-02-30'),null));
check("月份 13 → null", ()=>assert.strictEqual(T.parseDateValue('2026-13-01'),null));
check("民國年不誤判", ()=>assert.strictEqual(T.parseDateValue('113/05/01'),null));
check("閏年 2024-02-29", ()=>assert.strictEqual(T.parseDateValue('2024-02-29'),'2024-02-29'));
check("非閏年 2026-02-29 → null", ()=>assert.strictEqual(T.parseDateValue('2026-02-29'),null));

console.log('\n[2] 解析失敗會產生警告');
const fv=(v,f,d)=>T.formatValue(v,f,d||'mysql');
check("NT$1,234 (INT) → NULL + 警告", ()=>{const r=fv('NT$1,234',{type:'INT'});assert.strictEqual(r.sql,'NULL');assert.ok(r.warning);});
check("1,234 (INT) → 1234 無警告", ()=>{const r=fv('1,234',{type:'INT'});assert.strictEqual(r.sql,'1234');assert.strictEqual(r.warning,null);});
check("12.5 (DECIMAL)", ()=>{const r=fv('12.5',{type:'DECIMAL'});assert.strictEqual(r.sql,'12.5');assert.strictEqual(r.warning,null);});
check("abc (DECIMAL) → 警告", ()=>{const r=fv('abc',{type:'DECIMAL'});assert.ok(r.warning);});
check("是 (BOOLEAN) → 1", ()=>assert.strictEqual(fv('是',{type:'BOOLEAN'}).sql,'1'));
check("是 (BOOLEAN, postgres) → TRUE", ()=>assert.strictEqual(fv('是',{type:'BOOLEAN'},'postgres').sql,'TRUE'));
check("maybe (BOOLEAN) → 警告", ()=>{const r=fv('maybe',{type:'BOOLEAN'});assert.strictEqual(r.sql,'NULL');assert.ok(r.warning);});
check("第一季 (DATE) → 原樣輸出 + 警告", ()=>{const r=fv('第一季',{type:'DATE'});assert.strictEqual(r.sql,"'第一季'");assert.ok(r.warning);});
check("空值不算警告", ()=>{const r=fv('',{type:'INT'});assert.strictEqual(r.sql,'NULL');assert.strictEqual(r.warning,null);});
check("單引號跳脫", ()=>assert.strictEqual(fv("O'Brien",{type:'VARCHAR'}).sql,"'O''Brien'"));

const gen=(o)=>T.generateSQL(Object.assign({tableName:'t',dialect:'mysql',mode:'both',rows:[],whereCols:[]},o));
check("警告帶列號與欄位名", ()=>{
  const r=gen({fields:[{name:'amount',type:'INT'}],rows:[['ok'],['NT$5']],mode:'insert'});
  assert.strictEqual(r.warnings.length,2);
  assert.strictEqual(r.warnings[1].row,2);
  assert.strictEqual(r.warnings[1].column,'amount');
});
check("UPDATE 模式也收集警告", ()=>{
  const r=gen({fields:[{name:'id',type:'INT'},{name:'amt',type:'INT'}],rows:[['1','x']],mode:'update',whereCols:['id']});
  assert.strictEqual(r.warnings.length,1);
});
check("警告上限 200", ()=>{
  const rows=Array.from({length:300},()=>['bad']);
  const r=gen({fields:[{name:'n',type:'INT'}],rows,mode:'insert'});
  assert.strictEqual(r.warnings.length,200);
  assert.strictEqual(r.warnings.truncated,true);
});

console.log('\n[3] 欄位屬性');
const F=[{name:'id',type:'INT',primaryKey:true},
         {name:'name',type:'VARCHAR',length:50,nullable:false,comment:'姓名'},
         {name:'amount',type:'DECIMAL',precision:12,scale:2},
         {name:'memo',type:'VARCHAR'}];
const mysql=gen({fields:F,mode:'create'}).sql;
check("VARCHAR 長度", ()=>assert.ok(mysql.includes('VARCHAR(50)')));
check("DECIMAL 精度", ()=>assert.ok(mysql.includes('DECIMAL(12,2)')));
check("未指定長度用預設 255", ()=>assert.ok(mysql.includes('VARCHAR(255)')));
check("NOT NULL", ()=>assert.ok(/`name` VARCHAR\(50\) NOT NULL/.test(mysql)));
check("主鍵 inline + NOT NULL", ()=>assert.ok(/`id` INT NOT NULL PRIMARY KEY/.test(mysql)));
check("memo 沒有 NOT NULL", ()=>assert.ok(/`memo` VARCHAR\(255\)(,|\n)/.test(mysql)));
check("MySQL 註解用 COMMENT", ()=>assert.ok(mysql.includes("COMMENT '姓名'")));

const pg=gen({fields:F,mode:'create',dialect:'postgres'}).sql;
check("Postgres NUMERIC", ()=>assert.ok(pg.includes('NUMERIC(12,2)')));
check("Postgres 用 COMMENT ON COLUMN", ()=>assert.ok(pg.includes('COMMENT ON COLUMN "t"."name" IS \'姓名\';')));
check("Postgres 欄位行內沒有 COMMENT", ()=>assert.ok(!/VARCHAR\(50\) NOT NULL COMMENT/.test(pg)));

const mssql=gen({fields:F,mode:'create',dialect:'mssql'}).sql;
check("MSSQL NVARCHAR 長度", ()=>assert.ok(mssql.includes('NVARCHAR(50)')));
check("MSSQL 註解放在欄位上一行（放後面會吃掉逗號）", ()=>{
  assert.ok(/-- 姓名\n\s*\[name\] NVARCHAR\(50\) NOT NULL,/.test(mssql), mssql);
});
check("MSSQL 字串值加 N 前綴（否則中文變 ?）", ()=>{
  const r=gen({fields:[{name:'memo',type:'VARCHAR'},{name:'d',type:'DATE'}],rows:[['中文','2026-06-15']],mode:'insert',dialect:'mssql'});
  assert.ok(r.sql.includes("N'中文'"), r.sql);
  assert.ok(r.sql.includes("N'2026-06-15'"), r.sql);
});
check("其他方言不加 N 前綴", ()=>{
  for (const d of ['mysql','postgres','sqlite','ansi']) {
    const r=gen({fields:[{name:'memo',type:'VARCHAR'}],rows:[['中文']],mode:'insert',dialect:d});
    assert.ok(r.sql.includes("('中文')"), d+': '+r.sql);
  }
});
check("SQLite 註解也放在上一行", ()=>{
  const s=gen({fields:[{name:'a',type:'INT',comment:'說明'},{name:'b',type:'INT'}],mode:'create',dialect:'sqlite'}).sql;
  assert.ok(/-- 說明\n\s*"a" INTEGER,/.test(s), s);
});

const lite=gen({fields:F,mode:'create',dialect:'sqlite'}).sql;
check("SQLite 忽略長度", ()=>assert.ok(lite.includes('TEXT') && !lite.includes('VARCHAR(50)')));

check("複合主鍵改成表層級", ()=>{
  const s=gen({fields:[{name:'a',type:'INT',primaryKey:true},{name:'b',type:'INT',primaryKey:true}],mode:'create'}).sql;
  assert.ok(s.includes('PRIMARY KEY (`a`, `b`)'));
  assert.ok(!/`a` INT NOT NULL PRIMARY KEY/.test(s));
});
check("註解中的單引號跳脫", ()=>{
  const s=gen({fields:[{name:'a',type:'INT',comment:"O'Brien"}],mode:'create'}).sql;
  assert.ok(s.includes("COMMENT 'O''Brien'"));
});

console.log('\n[4] 舊 template 向下相容');
check("只有 name/type 的欄位輸出與過去相同", ()=>{
  const s=gen({fields:[{name:'a',type:'VARCHAR'},{name:'b',type:'DECIMAL'}],mode:'create'}).sql;
  assert.ok(s.includes('`a` VARCHAR(255)'));
  assert.ok(s.includes('`b` DECIMAL(18,4)'));
  assert.ok(!s.includes('NOT NULL'));
  assert.ok(!s.includes('PRIMARY KEY'));
});
check("INSERT 仍可運作", ()=>{
  const r=gen({fields:[{name:'a',type:'VARCHAR'}],rows:[['x']],mode:'insert'});
  assert.ok(r.sql.includes("INSERT INTO `t` (`a`) VALUES ('x');"));
  assert.strictEqual(r.warnings.length,0);
});
console.log(`\n${pass} 項通過`);
