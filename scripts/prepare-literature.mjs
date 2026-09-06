import assert from 'node:assert/strict';
import { mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import path from 'node:path';

// Keep the editable source corpus intact; publish one small file per report.
export function prepareLiterature(root) {
  const corpus = JSON.parse(readFileSync(path.join(root, 'public/data/literature.json'), 'utf8'));
  const reports = JSON.parse(readFileSync(path.join(root, 'app/data/reports.raw.json'), 'utf8'));
  const records = new Map(corpus.map(record => [record.id, record]));
  assert.equal(records.size, corpus.length, 'Duplicate literature IDs');
  const ids = new Set([...records.keys(), ...reports.map(report => report['序号'])]);
  const directory = path.join(root, 'out/data/literature');
  mkdirSync(directory, { recursive: true });
  for (const id of ids) {
    assert.ok(Number.isSafeInteger(id) && id > 0, 'Invalid literature ID');
    const record = records.get(id) || { id, query: '', papers: [] };
    const target = path.join(directory, `${id}.json`);
    writeFileSync(target, JSON.stringify(record));
    assert.deepEqual(JSON.parse(readFileSync(target, 'utf8')), record);
  }
  console.log(`Prepared and verified ${ids.size} individual literature files.`);
}
