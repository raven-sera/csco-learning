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
  if (cache.has(file)) return cache.get(file).exports;
  const loaded = { exports: {} };
  cache.set(file, loaded);
  const code = ts.transpileModule(readFileSync(file, 'utf8'), {
    compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 },
  }).outputText;
  vm.runInThisContext(`(function(require,module,exports){${code}\n})`, { filename: file })(
    id => id.startsWith('.') ? load(path.resolve(path.dirname(file), id + '.ts')) : require(id),
    loaded, loaded.exports,
  );
  return loaded.exports;
}

const { safeReturnPath } = load(path.join(root, 'app/lib/entryNavigation.ts'));
const { localPathname } = load(path.join(root, 'app/lib/sitePaths.ts'));
for (const base of ['', '/csco-learning']) {
  assert.equal(localPathname(base + '/', base), '/');
  assert.equal(localPathname(base + '/learning/', base), '/learning');
  assert.equal(safeReturnPath(base + '/learning/?field=lung#report-12', base), '/learning?field=lung#report-12');
  assert.equal(safeReturnPath(base + '/schedule/#report-91', base), '/schedule#report-91');
  assert.equal(safeReturnPath('/schedule?day=2', base), '/schedule?day=2');
  assert.equal(safeReturnPath(base + '/library/#report-12?section=slides&slide=photo-abc', base), '/library#report-12?section=slides&slide=photo-abc');
  for (const input of [null, '//evil.test/schedule', 'https://evil.test/schedule', '/\\evil.test/schedule',
    '/other/schedule', '/csco-learning-other/schedule', '/schedule/../evil', '/learning/deeper', 'javascript:alert(1)']) {
    assert.equal(safeReturnPath(input, base), '/learning');
  }
}
console.log('PASS: root and repository URLs, trailing slashes, query/hash preservation, redirect allowlist.');
