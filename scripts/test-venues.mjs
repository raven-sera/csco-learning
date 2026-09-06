import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import vm from 'node:vm';
import ts from 'typescript';

const file = new URL('../app/lib/venueLocations.ts', import.meta.url);
const code = ts.transpileModule(readFileSync(file, 'utf8'), {
  compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 },
}).outputText;
const api = {};
vm.runInThisContext(`(function(exports){${code}\n})`, { filename: file.pathname })(api);
const { resolveVenue, venues } = api;

const qilu = resolveVenue('山东大厦一层齐鲁厅');
assert.equal(qilu.status, 'mapped');
assert.equal(resolveVenue(' 山东大厦 一楼 齐鲁厅 ').id, qilu.id, 'Official 一楼 alias and whitespace must resolve to the same hall');
for (const location of ['齐鲁厅', '山东大厦二层齐鲁厅', '南郊宾馆一层齐鲁厅']) {
  assert.equal(resolveVenue(location), null, `Do not infer a building or floor: ${location}`);
}
assert.equal(resolveVenue('山东大厦一层山东财金厅').status, 'mapped');
assert.equal(resolveVenue('山东大厦一层山东金融厅'), null, 'Do not reinstate the misread hall name');

const combined = resolveVenue('山东大厦二层海右泺源厅');
const haiyou = resolveVenue('山东大厦二层海右厅');
const luoyuan = resolveVenue('山东大厦二层泺源厅');
assert.deepEqual(combined.regionIds, [...haiyou.regionIds, ...luoyuan.regionIds], 'Combined schedule hall must highlight both original rooms');
assert.equal(combined.status, 'combined');
assert.equal(resolveVenue('山东大厦一层泰山厅').status, 'mapped');
for (const location of ['山东大厦二层泰安厅', '山东大厦一层中泰证券厅']) {
  const venue = resolveVenue(location);
  assert.equal(venue.status, 'unlocated');
  assert.deepEqual(venue.regionIds, [], `Unverified hall must not acquire invented coordinates: ${location}`);
}
const nanjiao = resolveVenue('南郊宾馆俱乐部一层大礼堂');
assert.equal(nanjiao.status, 'uncovered');
assert.deepEqual(nanjiao.regionIds, [], 'Nanjiao must not appear on the Shandong Hotel map');

const geometry = JSON.parse(readFileSync(new URL('../app/data/venue-map.json', import.meta.url), 'utf8'));
const polygons = [
  ...Object.values(geometry.floors).flatMap(floor => [floor.outline, ...floor.voids, ...floor.extras]),
  ...geometry.rooms.map(room => room.polygon),
];
for (const polygon of polygons) {
  assert.ok(polygon.length >= 3, 'A rendered room or floor must form a polygon');
  for (const point of polygon) {
    assert.equal(point.length, 2, 'Each traced point needs exactly two coordinates');
    assert.ok(point.every(Number.isFinite), 'Invalid coordinates must not reach the renderer');
  }
}
const rooms = new Map(geometry.rooms.map(room => [room.id, room]));
for (const venue of venues) {
  for (const id of venue.regionIds) {
    assert.equal(rooms.get(id)?.floor, venue.floor, `Selectable region missing or on the wrong floor: ${venue.name}`);
  }
}
const locations = new Set(['reports', 'shares'].flatMap(name =>
  JSON.parse(readFileSync(new URL(`../app/data/${name}.raw.json`, import.meta.url), 'utf8')).map(report => report['会议地点']),
));
for (const location of locations) assert.ok(resolveVenue(location), `Official venue needs an explicit mapping or coverage status: ${location}`);
console.log(`PASS: ${locations.size} official locations reviewed; ambiguous names, combined halls, missing coordinates and cross-building boundaries protected.`);
