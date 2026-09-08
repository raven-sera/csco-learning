import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { createRequire } from 'node:module';
import { performance } from 'node:perf_hooks';
import vm from 'node:vm';
import ts from 'typescript';

const file = new URL('../app/lib/reports.ts', import.meta.url);
const code = ts.transpileModule(readFileSync(file, 'utf8'), {
  compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022, esModuleInterop: true },
}).outputText;
const api = {};
vm.runInThisContext(`(function(exports,require){${code}\n})`, { filename: file.pathname })(api, createRequire(file));
const { reports, searchScore, sortReportsByDateTime } = api;

// Preserve the unbounded scorer as an independent behavioral oracle. In particular,
// tokenization deliberately precedes NFKC normalization, unlike the full haystack.
const norm = value => value.toLocaleLowerCase().normalize('NFKC').replace(/[^a-z0-9\u3400-\u9fff]+/g, '');
function distance(a, b) {
  const row = Array.from({ length: b.length + 1 }, (_, i) => i);
  for (let i = 1; i <= a.length; i++) {
    let diagonal = row[0];
    row[0] = i;
    for (let j = 1; j <= b.length; j++) {
      const above = row[j];
      row[j] = Math.min(above + 1, row[j - 1] + 1, diagonal + (a[i - 1] === b[j - 1] ? 0 : 1));
      diagonal = above;
    }
  }
  return row[b.length];
}
const indexes = new WeakMap();
let previousQuery = '', normalizedQuery = '';
function originalScore(report, query) {
  if (query !== previousQuery) { previousQuery = query; normalizedQuery = norm(query); }
  const q = normalizedQuery;
  if (!q) return 1;
  let index = indexes.get(report);
  if (!index) {
    index = {
      hay: norm([report.kind, report.scheduleCategory, report.program, report.session, report.sourceTitle, report.speaker, report.institution, report.field, report.directions.join(' '), report.abstractNo, report.searchAliases].join(' ')),
      tokens: Array.from(new Set([report.sourceTitle, report.speaker, report.field, report.searchAliases].join(' ').toLowerCase().split(/[^a-z0-9\u3400-\u9fff]+/).map(norm).filter(Boolean))),
    };
    indexes.set(report, index);
  }
  const position = index.hay.indexOf(q);
  if (position >= 0) return 100 - position / 1000;
  if (q.length > 32 || q.length < 2) return 0;
  const threshold = q.length <= 4 ? 1 : q.length <= 8 ? 2 : 3;
  let best = threshold + 1;
  for (const token of index.tokens) {
    if (Math.abs(token.length - q.length) > threshold) continue;
    best = Math.min(best, distance(token, q));
    if (best === 0) break;
  }
  return best <= threshold ? 60 - best : 0;
}
function sample(sourceTitle, id = 1, dateTime = '') {
  return { id, kind: '口头报告', scheduleCategory: '主日程', program: '', session: '', abstractNo: '', sourceTitle, speaker: '', institution: '', dateTime, location: '', field: '', directions: [], officialUrl: '', searchAliases: '' };
}
let comparisons = 0;
function compare(report, query) {
  assert.equal(searchScore(report, query), originalScore(report, query), `Score changed for ${JSON.stringify(query)} / report ${report.id}: ${report.sourceTitle}`);
  comparisons++;
}

// Exhaustive short words exercise both edges of the diagonal band, insertion,
// deletion and substitution, including a tighter bound after another token wins.
const words = [];
for (let length = 1; length <= 5; length++) {
  for (let bits = 0; bits < 2 ** length; bits++) {
    words.push(bits.toString(2).padStart(length, '0').replaceAll('0', 'a').replaceAll('1', 'b'));
  }
}
for (const word of words) {
  const report = sample(`${word} cabba`);
  for (const query of words) compare(report, query);
}

// Cover every threshold transition, maximum fuzzy length, and >35-char tokens
// that cannot fuzzy-match but must remain searchable by substring.
for (const length of [2, 4, 5, 8, 9, 31, 32, 33, 35, 36]) {
  const word = 'abcdefghijklmnopqrstuvwxyz0123456789'.slice(0, length);
  const report = sample(word);
  for (let edits = 0; edits <= 4; edits++) {
    compare(report, `${'z'.repeat(edits)}${word.slice(edits)}`);
    compare(report, `${word.slice(0, word.length - edits)}${'z'.repeat(edits)}`);
    compare(report, `${'z'.repeat(edits)}${word}`);
    compare(report, word.slice(edits));
  }
}
const normalizationReport = sample('ＡＢＣ１２３ breast 肺癌 EGFR');
for (const query of ['', '---', 'ＡＢＣ１２３', 'abc123', 'ABC-123', 'breast', 'breasr', '肺按', 'ＥＧＦＲ', 'egfr', 'abc124']) compare(normalizationReport, query);
assert.equal(searchScore(sample('abcd'), 'abxd'), 59);
assert.equal(searchScore(sample('abcde'), 'abxdy'), 58);
assert.equal(searchScore(sample('abcdefghi'), 'abxdxfghx'), 57);
assert.equal(searchScore(sample('abcd'), 'axyd'), 0);

const queries = ['', '---', '肺癌', '肺按', '乳线癌', 'FEIAI', 'ｆｅｉａｉ', 'ＥＧＦＲ', 'EGFR-TKI', '免疫治疗', 'breast', 'breasr', 'colorectla', 'immunotherapz', 'pembrolizumzb', 'NCT 01234567', '山东大学', '主日程', '汇报分享', 'zzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzz'];
for (const query of queries) for (const report of reports) compare(report, query);

const dateInput = [sample('', 3, '2026-09-18 上午'), sample('', 2, '2026-09-17 下午'), sample('', 1, '2026-09-17 下午'), sample('', 4, '待公布')];
const before = [...dateInput];
assert.deepEqual(sortReportsByDateTime(Object.freeze(dateInput)), [...before].sort((a, b) => a.dateTime.localeCompare(b.dateTime, 'zh-CN') || a.id - b.id));
assert.deepEqual(dateInput, before);
assert.deepEqual(sortReportsByDateTime(reports), [...reports].sort((a, b) => a.dateTime.localeCompare(b.dateTime, 'zh-CN') || a.id - b.id));
console.log(`PASS: ${comparisons} identical search scores; date order and input immutability preserved across ${reports.length} reports.`);

if (process.argv.includes('--benchmark')) {
  const fuzzyQueries = ['breasr', 'colorectla', 'immunotherapz', 'pembrolizumzb'];
  function measure(score) {
    let checksum = 0;
    const start = performance.now();
    for (let iteration = 0; iteration < 5; iteration++) {
      for (const query of fuzzyQueries) for (const report of reports) checksum += score(report, query);
    }
    return { milliseconds: performance.now() - start, checksum };
  }
  measure(originalScore);
  measure(searchScore);
  const oldTimes = [], newTimes = [];
  for (let run = 0; run < 5; run++) {
    const oldResult = measure(originalScore), newResult = measure(searchScore);
    assert.equal(newResult.checksum, oldResult.checksum);
    oldTimes.push(oldResult.milliseconds);
    newTimes.push(newResult.milliseconds);
  }
  const median = values => values.sort((a, b) => a - b)[2];
  const oldMs = median(oldTimes), newMs = median(newTimes);
  console.log(`Warm fuzzy search median: original ${oldMs.toFixed(1)} ms; bounded ${newMs.toFixed(1)} ms; ${(oldMs / newMs).toFixed(2)}x (5 corpus passes, 4 queries).`);
}
