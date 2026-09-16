// node test/gen-sql.js <template.json>
//
// 讀入 template JSON，用瀏覽器那份 sql.js 產生 SQL 並印到 stdout。
// 給 Go 的整合測試呼叫，確保測到的是「前端實際會產生的 SQL」，
// 而不是另外在 Go 裡重寫一份。
// 警告會印到 stderr，不影響 stdout 的 SQL。
const vm = require('vm'), fs = require('fs'), path = require('path');

const file = process.argv[2];
if (!file) {
  console.error('usage: node test/gen-sql.js <template.json>');
  process.exit(2);
}

const ctx = { window: {}, console };
vm.createContext(ctx);
vm.runInContext(fs.readFileSync(path.join(__dirname, '..', 'static', 'js', 'sql.js'), 'utf8'), ctx);

const t = JSON.parse(fs.readFileSync(file, 'utf8'));
const { sql, warnings } = ctx.window.Turn2SQL.generateSQL({
  tableName: t.tableName,
  fields: t.fields,
  rows: t.rows,
  dialect: t.dialect,
  mode: t.mode,
  whereCols: t.whereCols || [],
});

if (warnings.length) {
  console.error(`WARNINGS ${warnings.length}: ` + JSON.stringify(warnings.slice(0, 5)));
}
process.stdout.write(sql);
