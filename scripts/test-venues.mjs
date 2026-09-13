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

const workbookLocations = [
  ['主会场-山东会堂', 'sd-f1-shandong', 'mapped'],
  ['1F-影视会议厅', 'sd-f1-movie', 'mapped'],
  ['1F-仁和厅', 'sd-f1-renhe', 'mapped'],
  ['1F-山东财金厅', 'sd-f1-finance', 'mapped'],
  ['1F-中泰证券厅', 'sd-f1-zhongtai', 'unlocated'],
  ['1F-青未了厅', 'sd-f1-evergreen', 'mapped'],
  ['1F-日照厅', 'sd-f1-rizhao', 'mapped'],
  ['2F-海右泺源厅', 'sd-f2-haiyou-luoyuan', 'combined'],
  ['2F-泰安厅', 'sd-f2-taian', 'unlocated'],
  ['2F-中华厅', 'sd-f2-zhonghua', 'mapped'],
  ['2F-青岛厅', 'sd-f2-qingdao', 'mapped'],
  ['2F-济南厅', 'sd-f2-jinan', 'mapped'],
  ['南郊俱乐部-1F-大礼堂', 'nj-club-f1-auditorium', 'uncovered'],
  ['南郊俱乐部-1F-会议厅', 'nj-club-f1-meeting', 'uncovered'],
  ['南郊俱乐部-3F-多功能厅', 'nj-club-f3-multifunction', 'uncovered'],
  ['南郊俱乐部-4F-小礼堂', 'nj-club-f4-auditorium', 'uncovered'],
  ['1F-金色大厅', 'sd-f1-golden', 'mapped'],
];
const floorNames = { 1: '一层', 2: '二层', 3: '三层', 4: '四层' };
for (const [location, id, status] of workbookLocations) {
  const venue = resolveVenue(location);
  assert.equal(venue?.id, id, `Workbook venue must identify the exact room: ${location}`);
  assert.equal(venue.status, status, `Aliases must preserve map coverage uncertainty: ${location}`);
  assert.equal(resolveVenue(venue.building + floorNames[venue.floor] + venue.name), venue,
    `Workbook naming must preserve canonical Chinese building/floor lookup: ${location}`);
  if (status === 'unlocated' || status === 'uncovered') {
    assert.deepEqual(venue.regionIds, [], `An alias cannot invent map coordinates: ${location}`);
  }
}
assert.equal(resolveVenue('  南郊俱乐部 - 3F - 多功能厅  ').id, 'nj-club-f3-multifunction');
assert.equal(resolveVenue('2F-海右泺源厅'), combined, 'Workbook combined hall retains both original regions');
for (const location of [
  '', '1F-泰安厅', '2F-中泰证券厅', '2F-仁和厅', '3F-济南厅',
  '主会场-齐鲁厅', '山东会堂', '其他大厦1F-影视会议厅',
  '1F-影视会议厅附厅', '前缀主会场-山东会堂', '主会场-山东会堂后缀',
  '南郊俱乐部-2F-大礼堂', '南郊俱乐部-1F-多功能厅', '南郊俱乐部-3F-小礼堂',
  '南郊俱乐部-1F-影视会议厅', '1F-大礼堂', '南郊俱乐部-4F-小礼堂附厅',
]) {
  assert.equal(resolveVenue(location), null, `Do not infer a venue from a partial name or incorrect floor: ${location}`);
}

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
const locations = new Set(
  JSON.parse(readFileSync(new URL('../app/data/reports.raw.json', import.meta.url), 'utf8')).map(report => report['会场']),
);
for (const location of locations) assert.ok(resolveVenue(location), `Official venue needs an explicit mapping or coverage status: ${location}`);
console.log(`PASS: ${locations.size} official locations reviewed; ambiguous names, combined halls, missing coordinates and cross-building boundaries protected.`);
