import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { createRequire } from 'node:module';
import vm from 'node:vm';
import ts from 'typescript';

const file = new URL('../app/lib/reports.ts', import.meta.url);
const code = ts.transpileModule(readFileSync(file, 'utf8'), {
  compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022, esModuleInterop: true },
}).outputText;
const api = {};
vm.runInThisContext(`(function(require,exports){${code}\n})`, { filename: file.pathname })(createRequire(file), api);
const { reports, searchMatch } = api;

const ge = reports.find(report => report.speaker === '葛睿');
const meng = reports.find(report => report.speaker === '孟睿');
const hu = reports.find(report => report.speaker === '胡睿');
assert.ok(ge && meng && hu, 'Official speaker fixtures must remain available');
const exactName = searchMatch(ge, '葛睿');
assert.equal(exactName.kind, 'exact');
for (const other of [meng, hu]) {
  const match = searchMatch(other, '葛睿');
  assert.equal(match.kind, 'similar', `${other.speaker} is a spelling suggestion, not 葛睿`);
  assert.ok(exactName.score > match.score, 'A literal speaker must rank above a one-character correction');
}

const lung = reports.find(report => report.field === '肺癌');
assert.ok(lung, 'Official lung-cancer fixture must remain available');
assert.equal(searchMatch(lung, '肺癌').kind, 'exact');
assert.equal(searchMatch(lung, 'feiai').kind, 'similar', 'Generated pinyin must not claim a literal source match');
assert.equal(searchMatch(lung, '肺按').kind, 'similar', 'Generated Chinese correction aliases must remain searchable');

const fixture = {
  id: -1, kind: '口头报告', scheduleCategory: '主日程', program: '', session: '', abstractNo: '',
  sourceTitle: '左侧来源', speaker: '右侧来源', institution: '', dateTime: '', location: '',
  field: '', directions: ['第一研究方向', '第二研究方向'], officialUrl: '', searchAliases: '',
};
assert.equal(searchMatch(fixture, '左侧来源右侧来源').kind, 'none', 'Adjacent metadata fields must not manufacture a phrase');
assert.equal(searchMatch(fixture, '第一研究方向第二研究方向').kind, 'none', 'Separate directions must not manufacture a phrase');
assert.equal(searchMatch({ ...fixture, institution: 'Example Hospital' }, 'example hospital').kind, 'exact', 'Actual institution text is a literal source field');
assert.equal(searchMatch({ ...fixture, sourceTitle: 'ＰＤ－Ｌ１ Ｓｔｕｄｙ' }, 'pd-L1 study').kind, 'exact', 'NFKC must run before case folding on full-width Latin source text');
assert.equal(searchMatch(lung, 'ＦｅＩａＩ').kind, 'similar', 'Mixed-width alias queries must normalize without becoming literal matches');

const mediumToken = { ...fixture, sourceTitle: 'abcdef', speaker: '', directions: [] };
assert.equal(searchMatch(mediumToken, 'abxyef').kind, 'similar', 'Five-to-eight-character queries retain two-edit tolerance');
assert.equal(searchMatch(mediumToken, 'abxyzf').kind, 'none', 'Three edits must exceed the medium-query tolerance');
assert.equal(searchMatch({ ...mediumToken, sourceTitle: 'abcdefghi' }, 'abxyzfghi').kind, 'similar', 'Longer queries retain three-edit tolerance');

assert.equal(searchMatch(ge, '').kind, 'exact', 'An empty query must include reports in browsing');
assert.equal(searchMatch(meng, ' \t\n').kind, 'exact', 'Whitespace-only input must preserve browsing');
assert.equal(searchMatch(ge, '！？---').kind, 'none', 'Punctuation-only input must not become a match-all query');
assert.equal(searchMatch(ge, '葛睿').kind, 'exact', 'Changing query kinds must invalidate the normalized-query cache');
assert.equal(searchMatch(hu, '葛睿').kind, 'similar', 'Reusing a normalized query across reports must retain each classification');
console.log('PASS: literal speaker priority, generated aliases, field boundaries, mixed-width Latin, fuzzy tolerance and empty-query transitions.');
