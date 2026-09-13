import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import vm from 'node:vm';
import ts from 'typescript';

const file = new URL('../app/lib/scheduleTools.ts', import.meta.url);
const code = ts.transpileModule(readFileSync(file, 'utf8'), {
  compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 },
}).outputText;
const api = {};
vm.runInThisContext(`(function(exports){${code}\n})`, { filename: file.pathname })(api);

const report = {
  id: 1,
  kind: '报告',
  session: '',
  chair: '',
  field: '肺癌',
  searchAliases: '',
  dateTime: '2026-09-17 下午 17:00-17:05',
  sourceTitle: '肺癌免疫治疗',
  location: '主会场-山东会堂',
  speaker: '报告人',
  institution: '医院',
  program: '肺癌专场',
};
const expert = { ...report, id: 1200, kind: '专家团', sourceTitle: '专家团', dateTime: '2026-09-19 时间未注明' };
assert.equal(api.reportInterval(expert), null, 'Unspecified workbook times must not acquire fabricated event times');
const calendar = api.createCalendarFile([report, expert], Date.UTC(2026, 8, 6));
const lines = calendar.replace(/\r\n[ \t]/g, '').split('\r\n');
assert.deepEqual(lines.filter(line => /^(BEGIN|END):/.test(line)), [
  'BEGIN:VCALENDAR', 'BEGIN:VEVENT', 'END:VEVENT', 'END:VCALENDAR',
], 'A calendar import needs a complete outer VCALENDAR envelope around its events');
assert.ok(lines.includes('DTSTART:20260917T090000Z'), '17:00 in China must import as 09:00 UTC');
assert.ok(lines.includes('DTEND:20260917T090500Z'), 'The imported event must retain its five-minute duration');
console.log('PASS: complete ICS envelope and conference-local event times.');
