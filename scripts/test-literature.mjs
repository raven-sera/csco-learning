import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { createRequire } from 'node:module';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import vm from 'node:vm';
import ts from 'typescript';

const root = fileURLToPath(new URL('../', import.meta.url));
const corpus = JSON.parse(readFileSync(path.join(root, 'public/data/literature.json'), 'utf8'));
const records = new Map(corpus.map(record => [record.id, record]));
const require = createRequire(import.meta.url);
function fixture(chunks, failFirst = false) {
  const modules = new Map();
  const calls = [];
  const request = async url => {
    calls.push(url);
    if (failFirst && calls.length === 1) throw new Error('temporary network error');
    if (url === '/csco-learning/data/literature.json') return { ok: true, json: async () => corpus };
    const match = /^\/csco-learning\/data\/literature\/(\d+)\.json$/.exec(url);
    assert.ok(match, `Unexpected literature URL: ${url}`);
    const id = Number(match[1]);
    return { ok: true, json: async () => records.get(id) || { id, query: '', papers: [] } };
  };
  function load(file) {
    if (modules.has(file)) return modules.get(file).exports;
    const loaded = { exports: {} };
    modules.set(file, loaded);
    const js = ts.transpileModule(readFileSync(file, 'utf8'), {
      compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022, esModuleInterop: true },
    }).outputText;
    vm.runInThisContext(`(function(require,module,exports,process,fetch,console){${js}\n})`, { filename: file })(
      id => id.startsWith('.') ? id.endsWith('.json') ?
        JSON.parse(readFileSync(path.resolve(path.dirname(file), id), 'utf8')) :
        load(path.resolve(path.dirname(file), id + '.ts')) : require(id),
      loaded, loaded.exports,
      { env: { NEXT_PUBLIC_BASE_PATH: '/csco-learning', NEXT_PUBLIC_LITERATURE_CHUNKS: String(chunks) } },
      request, { error() {} },
    );
    return loaded.exports;
  }
  return { api: load(path.join(root, 'app/lib/reports.ts')), calls };
}

const full = fixture(false);
const split = fixture(true);
const reports = split.api.reports.filter(report => report.kind === '口头报告');
for (const report of reports) {
  assert.deepEqual(await split.api.loadReportPapers(report), await full.api.loadReportPapers(report));
}
assert.equal(full.calls.length, 1);
assert.equal(split.calls.length, reports.length);
const cached = fixture(true);
await Promise.all(Array.from({ length: 3 }, () => cached.api.loadReportPapers(reports[0])));
assert.equal(cached.calls.length, 1, 'Concurrent requests should share one fetch');
const retry = fixture(true, true);
assert.deepEqual(await retry.api.loadReportPapers(reports[0]), reports[0].papers);
assert.deepEqual(await retry.api.loadReportPapers(reports[0]), await full.api.loadReportPapers(reports[0]));
assert.equal(retry.calls.length, 2, 'Failed requests must be retryable');
const sharing = split.api.reports.find(report => report.kind === '汇报分享');
const count = split.calls.length;
assert.deepEqual(await split.api.loadReportPapers(sharing), sharing.papers);
assert.equal(split.calls.length, count);
console.log(`PASS: ${reports.length} report results preserved, repository URLs, shared cache, network retry and sharing reports.`);
