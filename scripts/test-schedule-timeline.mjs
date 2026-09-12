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

const { parseTimelineReports, layoutTimelineEvents } = load(path.join(root, 'app/lib/scheduleTimeline.ts'));
const day = '2026-09-17';
const base = {
  kind: '口头报告', scheduleCategory: '主日程', program: '', session: '', abstractNo: '',
  sourceTitle: '临床研究', speaker: '报告人', institution: '医院', location: '报告厅',
  field: '肺癌', directions: [], officialUrl: '', searchAliases: '',
};
const report = (id, time, date = day) => ({ ...base, id, dateTime: `${date} 上午 ${time}` });
const parse = reports => parseTimelineReports(reports).events;
const lanes = events => events.map(event => [event.report.id, event.lane, event.laneCount]);

const chain = parse([
  report(4, '10:00-10:15'), report(3, '09:30-10:00'),
  report(1, '09:00-09:30'), report(2, '09:15-09:45'),
]);
assert.deepEqual(lanes(layoutTimelineEvents(chain, day, 540, 615)), [
  [1, 0, 2], [2, 1, 2], [3, 0, 2], [4, 0, 1],
], 'Transitive overlap shares one width; an adjacent new cluster regains full width');
assert.deepEqual(lanes(layoutTimelineEvents(chain, day, 585, 615)), [
  [3, 0, 1], [4, 0, 1],
], 'Events that finish at the window boundary cannot leave a phantom overlap lane');

const nested = parse([
  report(1, '09:00-10:00'), report(2, '09:10-09:20'), report(3, '09:15-09:25'),
  report(4, '09:25-09:30'), report(5, '09:30-09:40'), report(6, '10:00-10:10'),
]);
assert.deepEqual(lanes(layoutTimelineEvents(nested, day, 540, 610)), [
  [1, 0, 3], [2, 1, 3], [3, 2, 3], [4, 1, 3], [5, 1, 3], [6, 0, 1],
], 'Multiple released lanes reuse the lowest available lane without increasing cluster width');

const boundaries = parse([
  report(1, '08:00-09:00'), report(2, '09:00-09:15'), report(3, '09:15-09:30'),
  report(4, '09:30-10:00'), report(5, '09:00-09:30', '2026-09-18'),
]);
assert.deepEqual(lanes(layoutTimelineEvents(boundaries, day, 540, 570)), [[2, 0, 1], [3, 0, 1]],
  'The window and event intervals are half-open and restricted to the selected date');
assert.deepEqual(layoutTimelineEvents(boundaries, day, 570, 570), []);
assert.deepEqual(layoutTimelineEvents(boundaries, day, 570, 540), []);

const crossing = layoutTimelineEvents(parse([report(1, '08:00-12:00')]), day, 600, 660)[0];
assert.deepEqual({
  start: crossing.startMinute, end: crossing.endMinute,
  visibleStart: crossing.visibleStart, visibleEnd: crossing.visibleEnd,
  before: crossing.continuesBefore, after: crossing.continuesAfter,
}, { start: 480, end: 720, visibleStart: 600, visibleEnd: 660, before: true, after: true },
'Clipping must preserve the real duration and mark both continuation edges');
const exact = layoutTimelineEvents(parse([report(1, '10:00-10:01')]), day, 600, 601)[0];
assert.deepEqual([exact.visibleStart, exact.visibleEnd, exact.continuesBefore, exact.continuesAfter],
  [600, 601, false, false], 'A one-minute talk stays one minute; exact edges are not continuations');

const timezoneReports = [
  report(3, '23:45—24:00'), report(2, '00:05–00:15'),
  report(1, '09:00-09:15', '2026-09-18'), report(4, '00:05–00:15'),
  { ...base, id: 5, dateTime: '' }, { ...base, id: 6, dateTime: undefined },
  { ...base, id: 7, dateTime: '时间待定' }, report(8, '09:00-09:00'),
  report(9, '10:00-09:00'), report(10, '25:00-26:00'),
];
const originalTimezone = process.env.TZ;
try {
  for (const timezone of ['UTC', 'America/Los_Angeles', 'Asia/Shanghai', 'Pacific/Kiritimati']) {
    process.env.TZ = timezone;
    const parsed = parseTimelineReports(timezoneReports);
    assert.deepEqual(parsed.days, ['2026-09-17', '2026-09-18']);
    assert.deepEqual(parsed.events.map(event => [event.report.id, event.day, event.startMinute, event.endMinute]), [
      [2, day, 5, 15], [4, day, 5, 15], [3, day, 1425, 1440], [1, '2026-09-18', 540, 555],
    ], `Conference days and minute positions must not depend on viewer timezone ${timezone}`);
    assert.deepEqual(parsed.untimed.map(item => item.id), [5, 6, 7, 8, 9, 10],
      'Missing, malformed, zero-length and reversed times remain accessible as untimed reports');
  }
} finally {
  if (originalTimezone === undefined) delete process.env.TZ;
  else process.env.TZ = originalTimezone;
}

const immutableReports = Object.freeze([
  report(3, '09:30-10:00'), report(1, '09:00-09:30'), report(2, '09:15-09:45'),
].map(item => Object.freeze({ ...item, directions: Object.freeze([]) })));
const reportsBefore = structuredClone(immutableReports);
const immutableEvents = Object.freeze(parse(immutableReports).map(event => Object.freeze(event)).reverse());
const eventsBefore = structuredClone(immutableEvents);
const firstLayout = layoutTimelineEvents(immutableEvents, day, 555, 585);
layoutTimelineEvents(immutableEvents, day, 570, 600);
assert.deepEqual(immutableReports, reportsBefore, 'Parsing and layout cannot reorder or modify stored reports');
assert.deepEqual(immutableEvents, eventsBefore, 'Changing windows cannot annotate or reorder source events');
assert.deepEqual(lanes(firstLayout), [[1, 0, 2], [2, 1, 2], [3, 0, 2]],
  'Unsorted frozen events still produce stable geometry independent of later window changes');

console.log('PASS: timeline overlap clusters, half-open windows, clipping, timezone-independent parsing and immutable inputs.');
