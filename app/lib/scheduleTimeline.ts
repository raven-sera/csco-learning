import type { Report } from './reports';
import { reportInterval } from './scheduleTools';

export type TimelineEvent = {
  report: Report;
  day: string;
  startMinute: number;
  endMinute: number;
};

export type PositionedTimelineEvent = TimelineEvent & {
  visibleStart: number;
  visibleEnd: number;
  lane: number;
  laneCount: number;
  continuesBefore: boolean;
  continuesAfter: boolean;
};

const MINUTE_MS = 60_000;
const DAY_MS = 24 * 60 * MINUTE_MS;
const CONFERENCE_OFFSET_MS = 8 * 60 * MINUTE_MS;

function compareEvents(left: TimelineEvent, right: TimelineEvent) {
  return (left.day < right.day ? -1 : left.day > right.day ? 1 : 0)
    || left.startMinute - right.startMinute
    || left.endMinute - right.endMinute
    || left.report.id - right.report.id;
}

export function parseTimelineReports(reports: readonly Report[]): {
  events: TimelineEvent[];
  untimed: Report[];
  days: string[];
} {
  const events: TimelineEvent[] = [];
  const untimed: Report[] = [];
  const days = new Set<string>();
  for (const report of reports) {
    const interval = typeof report.dateTime === 'string' ? reportInterval(report) : null;
    if (!interval) {
      untimed.push(report);
      continue;
    }
    // Shift once, then use UTC arithmetic so the viewer's timezone cannot move a talk.
    const conferenceStart = interval.start + CONFERENCE_OFFSET_MS;
    const midnight = Math.floor(conferenceStart / DAY_MS) * DAY_MS;
    const day = new Date(midnight).toISOString().slice(0, 10);
    events.push({
      report,
      day,
      startMinute: (conferenceStart - midnight) / MINUTE_MS,
      endMinute: (interval.end + CONFERENCE_OFFSET_MS - midnight) / MINUTE_MS,
    });
    days.add(day);
  }
  events.sort(compareEvents);
  return { events, untimed, days: [...days].sort() };
}

type CompareNumbers = (left: number, right: number) => number;
const compareNumbers: CompareNumbers = (left, right) => left - right;

function heapPush(heap: number[], value: number, compare: CompareNumbers) {
  let index = heap.length;
  heap.push(value);
  while (index > 0) {
    const parent = (index - 1) >>> 1;
    if (compare(heap[parent], value) <= 0) break;
    heap[index] = heap[parent];
    index = parent;
  }
  heap[index] = value;
}

function heapPop(heap: number[], compare: CompareNumbers): number {
  const first = heap[0];
  const last = heap.pop()!;
  if (heap.length) {
    let index = 0;
    while (index * 2 + 1 < heap.length) {
      let child = index * 2 + 1;
      if (child + 1 < heap.length && compare(heap[child + 1], heap[child]) < 0) child++;
      if (compare(last, heap[child]) <= 0) break;
      heap[index] = heap[child];
      index = child;
    }
    heap[index] = last;
  }
  return first;
}

export function layoutTimelineEvents(
  events: readonly TimelineEvent[],
  day: string,
  startMinute: number,
  endMinute: number,
): PositionedTimelineEvent[] {
  const positioned: PositionedTimelineEvent[] = [];
  if (!Number.isFinite(startMinute) || !Number.isFinite(endMinute) || endMinute <= startMinute) return positioned;
  for (const event of events) {
    if (event.day !== day || event.endMinute <= startMinute || event.startMinute >= endMinute) continue;
    const visibleStart = Math.max(startMinute, event.startMinute);
    const visibleEnd = Math.min(endMinute, event.endMinute);
    if (!(visibleEnd > visibleStart)) continue;
    positioned.push({
      ...event,
      visibleStart,
      visibleEnd,
      lane: 0,
      laneCount: 1,
      continuesBefore: event.startMinute < startMinute,
      continuesAfter: event.endMinute > endMinute,
    });
  }
  positioned.sort(compareEvents);

  // Active event indices are ordered by end; available lanes by lane number.
  // This preserves lowest-lane reuse without scanning every lane for each event.
  const active: number[] = [];
  const available: number[] = [];
  const compareActive: CompareNumbers = (left, right) => positioned[left].visibleEnd - positioned[right].visibleEnd
    || positioned[left].lane - positioned[right].lane;
  let clusterStart = 0;
  let clusterEnd = -Infinity;
  let laneCount = 0;
  for (let index = 0; index < positioned.length; index++) {
    const event = positioned[index];
    if (event.visibleStart >= clusterEnd) {
      for (let previous = clusterStart; previous < index; previous++) positioned[previous].laneCount = laneCount;
      clusterStart = index;
      clusterEnd = event.visibleEnd;
      laneCount = 0;
      active.length = 0;
      available.length = 0;
    }
    while (active.length && positioned[active[0]].visibleEnd <= event.visibleStart) {
      heapPush(available, positioned[heapPop(active, compareActive)].lane, compareNumbers);
    }
    event.lane = available.length ? heapPop(available, compareNumbers) : laneCount++;
    heapPush(active, index, compareActive);
    clusterEnd = Math.max(clusterEnd, event.visibleEnd);
  }
  for (let index = clusterStart; index < positioned.length; index++) positioned[index].laneCount = laneCount;
  return positioned;
}
