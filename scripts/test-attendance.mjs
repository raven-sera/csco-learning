import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { createRequire } from 'node:module';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import vm from 'node:vm';
import ts from 'typescript';

const root = fileURLToPath(new URL('../', import.meta.url));
const require = createRequire(import.meta.url);
const cache = new Map();
function load(file) {
  if (file.endsWith('.json')) return require(file);
  if (cache.has(file)) return cache.get(file).exports;
  const loaded = { exports: {} };
  cache.set(file, loaded);
  const code = ts.transpileModule(readFileSync(file, 'utf8'), {
    compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022, esModuleInterop: true },
  }).outputText;
  vm.runInThisContext(`(function(require,module,exports){${code}\n})`, { filename: file })(
    id => id.startsWith('.') ? load(path.resolve(path.dirname(file), path.extname(id) ? id : id + '.ts')) : require(id),
    loaded, loaded.exports,
  );
  return loaded.exports;
}
const { buildAttendanceAtlas } = load(path.join(root, 'app/lib/attendanceAtlas.ts'));
const base = { kind:'报告', program:'', session:'', chair:'', sourceTitle:'肺癌真实世界研究', speaker:'报告人', institution:'医院', dateTime:'2026-09-17 上午 09:00-09:15', field:'肺癌', searchAliases:'' };
const reports = [
  { ...base, id:1, location:'山东大厦 一楼 孔膳厅' },
  { ...base, id:2, location:'山东大厦 一层 孔膳厅' },
  { ...base, id:3, location:'山东大厦 二层 海右泺源厅', field:'', sourceTitle:'会议总结' },
  { ...base, id:4, location:'南郊宾馆俱乐部 四层 小礼堂', field:'乳腺癌；肺癌；乳腺癌', sourceTitle:'乳腺癌治疗' },
  { ...base, id:5, location:'山东大厦 二层 济南厅', dateTime:'2026-09-18 上午 09:00-09:15', field:'', sourceTitle:'核医学与PET-CT进展' },
  { ...base, id:6, location:'山东大厦 一层 中泰证券厅', field:'', sourceTitle:'会议总结' },
];
const record = (reportId, minute) => ({ reportId, checkedAt:`2026-09-17T01:${String(minute).padStart(2,'0')}:00Z`, phrase:'历史打卡语', visualSeed:0 });
const stats = buildAttendanceAtlas([
  record(6,50),record(2,10),record(1,59),record(5,40),record(4,30),record(3,20),record(1,0),
  record(999,5),{...record(2,10),checkedAt:'invalid'},
], reports);
assert.equal(stats.total, 6, 'Repeated check-ins of one report must not increase total attendance');
assert.equal(stats.venues.length, 5, '一楼/一层 aliases share one venue; a combined hall is one destination');
assert.equal(stats.venues.find(venue => venue.id === 'sd-f1-kongshan').visits.length, 2);
assert.equal(stats.venues.find(venue => venue.id === 'sd-f2-haiyou-luoyuan').visits.length, 1);
assert.equal(stats.venues.find(venue => venue.id === 'sd-f2-haiyou-luoyuan').regionIds.length, 2, 'Both supplied map regions must remain highlighted for a combined hall');
assert.equal(stats.unlocatedCount, 2, 'Uncovered buildings and unlocated rooms still count without invented coordinates');
assert.equal(stats.missingReportCount, 1, 'Missing report records must not produce phantom statistics');
assert.equal(stats.days, 2, 'Conference dates, not when the browser button was pressed, define conference days');
assert.deepEqual(stats.visits.map(visit => visit.report.id), [1,2,3,4,5,6], 'Routes follow first actual check-in times, not input order');
assert.deepEqual(stats.keywords.find(keyword => keyword.label === '肺癌').reportIds, [1,2,4], 'Each source cancer type contributes even when absent from the title, without duplicate title/metadata counts');
assert.equal(stats.keywords.find(keyword => keyword.label === '乳腺癌').count, 1, 'Repeated source cancer types count once per report');
assert.equal(stats.keywords.find(keyword => keyword.label === '真实世界研究').count, 2);
assert.equal(stats.keywords.find(keyword => keyword.label === '核医学').count, 1);
assert.equal(stats.keywords.find(keyword => keyword.label === '分子影像').count, 1);
assert.ok(!stats.legs.some(leg => leg.from === leg.to), 'Repeated arrivals at one venue do not invent travel');
assert.ok(!stats.legs.some(leg => leg.from === 'sd-f2-haiyou-luoyuan' && leg.to === 'sd-f2-jinan'), 'A map must not bridge across an unmapped intermediate stop');
assert.deepEqual(stats.legs[1], {from:'sd-f2-haiyou-luoyuan',to:'nj-club-f4-auditorium',count:1});
const empty = buildAttendanceAtlas([], reports);
assert.equal(empty.total, 0);
assert.deepEqual(empty.keywords, []);
assert.deepEqual(empty.legs, []);
console.log('PASS: idempotent attendance, venue aliases/combined halls, unmapped stops, keyword deduplication and chronological routes.');
