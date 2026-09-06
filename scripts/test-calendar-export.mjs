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

const calendar = api.createCalendarFile([{
  id: 1,
  dateTime: '2026-09-17 下午 17:00-17:05',
  sourceTitle: '肺癌免疫治疗',
  location: '山东大厦 一层 山东会堂',
  speaker: '报告人',
  institution: '医院',
  program: '肺癌专场',
}], Date.UTC(2026, 8, 6));
const lines = calendar.replace(/\r\n[ \t]/g, '').split('\r\n');
assert.deepEqual(lines.filter(line => /^(BEGIN|END):/.test(line)), [
  'BEGIN:VCALENDAR', 'BEGIN:VEVENT', 'END:VEVENT', 'END:VCALENDAR',
], 'A calendar import needs a complete outer VCALENDAR envelope around its events');
assert.ok(lines.includes('DTSTART:20260917T090000Z'), '17:00 in China must import as 09:00 UTC');
assert.ok(lines.includes('DTEND:20260917T090500Z'), 'The imported event must retain its five-minute duration');
console.log('PASS: complete ICS envelope and conference-local event times.');
