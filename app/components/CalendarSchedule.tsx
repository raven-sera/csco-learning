'use client';

import { useEffect, useMemo, useRef } from 'react';
import type { CSSProperties } from 'react';
import type { Report } from '../lib/reports';

const CALENDAR_FIRST_MINUTE = 8 * 60;
const CALENDAR_LAST_MINUTE = 20 * 60;
const MIN_FOCUSED_SPAN = 3 * 60;
const TARGET_EVENT_HEIGHT = 100;
const MIN_HOUR_HEIGHT = 112;
const MAX_HOUR_HEIGHT = 1200;

const CALENDAR_DAYS = [
  { date: '2026-09-17', monthDay: '9.17', weekday: '周四' },
  { date: '2026-09-18', monthDay: '9.18', weekday: '周五' },
  { date: '2026-09-19', monthDay: '9.19', weekday: '周六' },
] as const;

const DAY_INDEX: Record<(typeof CALENDAR_DAYS)[number]['date'], number> = {
  '2026-09-17': 0,
  '2026-09-18': 1,
  '2026-09-19': 2,
};

type CalendarEvent = {
  report: Report;
  dayIndex: number;
  start: number;
  end: number;
  time: string;
  lane: number;
  laneCount: number;
};

type CalendarLayout = {
  eventsByDay: CalendarEvent[][];
  totalEventsByDay: number[];
  startMinute: number;
  endMinute: number;
  hours: number[];
  bodyHeight: number | undefined;
  columnTemplate: string;
  activeDayCount: number;
  firstEventMinute: number | undefined;
  firstActiveDayIndex: number;
};

type CalendarScheduleProps = {
  reports: Report[];
  variant?: 'screen' | 'pdf';
  onOpen?: (report: Report) => void;
  onLocate?: (report: Report) => void;
  onCheckIn?: (report: Report) => void;
  attendedIds?: ReadonlySet<number>;
  celebratingReportId?: number | null;
  rangeStartMinute?: number;
  rangeEndMinute?: number;
};

function parseCalendarEvent(report: Report): CalendarEvent | null {
  const match = report.dateTime.match(/^(\d{4}-\d{2}-\d{2}).*?(\d{2}):(\d{2})-(\d{2}):(\d{2})/);
  if (!match) return null;
  const dayIndex = DAY_INDEX[match[1] as keyof typeof DAY_INDEX];
  if (dayIndex === undefined) return null;

  const start = Number(match[2]) * 60 + Number(match[3]);
  const end = Number(match[4]) * 60 + Number(match[5]);
  if (end <= CALENDAR_FIRST_MINUTE || start >= CALENDAR_LAST_MINUTE) return null;

  return {
    report,
    dayIndex,
    start: Math.max(start, CALENDAR_FIRST_MINUTE),
    end: Math.min(end, CALENDAR_LAST_MINUTE),
    time: `${match[2]}:${match[3]}–${match[4]}:${match[5]}`,
    lane: 0,
    laneCount: 1,
  };
}

function placeEvents(reports: Report[]) {
  const byDay = CALENDAR_DAYS.map(() => [] as CalendarEvent[]);
  reports.forEach((report) => {
    const event = parseCalendarEvent(report);
    if (event) byDay[event.dayIndex].push(event);
  });

  return byDay.map((events) => {
    events.sort((left, right) => left.start - right.start || left.end - right.end || left.report.id - right.report.id);
    const clusters: CalendarEvent[][] = [];
    let cluster: CalendarEvent[] = [];
    let clusterEnd = -1;

    events.forEach((event) => {
      if (cluster.length && event.start >= clusterEnd) {
        clusters.push(cluster);
        cluster = [];
        clusterEnd = -1;
      }
      cluster.push(event);
      clusterEnd = Math.max(clusterEnd, event.end);
    });
    if (cluster.length) clusters.push(cluster);

    clusters.forEach((items) => {
      const laneEnds: number[] = [];
      items.forEach((event) => {
        const availableLane = laneEnds.findIndex((end) => end <= event.start);
        event.lane = availableLane === -1 ? laneEnds.length : availableLane;
        laneEnds[event.lane] = event.end;
      });
      items.forEach((event) => {
        event.laneCount = laneEnds.length;
      });
    });

    return events;
  });
}

function focusedRange(events: CalendarEvent[]) {
  if (!events.length) return { startMinute: CALENDAR_FIRST_MINUTE, endMinute: CALENDAR_LAST_MINUTE };
  const firstEvent = Math.min(...events.map((event) => event.start));
  const lastEvent = Math.max(...events.map((event) => event.end));
  let startMinute = Math.max(CALENDAR_FIRST_MINUTE, Math.floor(firstEvent / 60) * 60);
  let endMinute = Math.min(CALENDAR_LAST_MINUTE, Math.ceil(lastEvent / 60) * 60);

  while (endMinute - startMinute < MIN_FOCUSED_SPAN) {
    if (startMinute > CALENDAR_FIRST_MINUTE) startMinute -= 60;
    if (endMinute - startMinute < MIN_FOCUSED_SPAN && endMinute < CALENDAR_LAST_MINUTE) endMinute += 60;
  }
  return { startMinute, endMinute };
}

function minimumLaneGap(eventsByDay: CalendarEvent[][]) {
  let minimum = Number.POSITIVE_INFINITY;
  eventsByDay.forEach((events) => {
    const lastStartByLane: number[] = [];
    events.forEach((event) => {
      const previousStart = lastStartByLane[event.lane];
      if (previousStart !== undefined && event.start > previousStart) {
        minimum = Math.min(minimum, event.start - previousStart);
      }
      lastStartByLane[event.lane] = event.start;
    });
  });
  return minimum;
}

function calendarColumns(eventsByDay: CalendarEvent[][], variant: 'screen' | 'pdf') {
  const activeDayCount = eventsByDay.filter((events) => events.length > 0).length;
  const rail = variant === 'pdf' ? '14mm' : '64px';
  const columns = eventsByDay.map((events) => {
    if (variant === 'pdf') {
      if (activeDayCount === 1) return events.length ? 'minmax(0,4fr)' : 'minmax(18mm,.65fr)';
      if (activeDayCount === 2) return events.length ? 'minmax(0,2fr)' : 'minmax(18mm,.7fr)';
      return 'minmax(0,1fr)';
    }
    if (activeDayCount === 1) return events.length ? 'minmax(320px,4fr)' : 'minmax(110px,.75fr)';
    if (activeDayCount === 2) return events.length ? 'minmax(300px,2fr)' : 'minmax(110px,.75fr)';
    return 'minmax(240px,1fr)';
  });
  return { activeDayCount, columnTemplate: `${rail} ${columns.join(' ')}` };
}

function buildCalendarLayout(
  reports: Report[],
  variant: 'screen' | 'pdf',
  rangeStartMinute?: number,
  rangeEndMinute?: number,
): CalendarLayout {
  const allEventsByDay = placeEvents(reports);
  const printRange = variant === 'pdf'
    && rangeStartMinute !== undefined
    && rangeEndMinute !== undefined
    && rangeEndMinute > rangeStartMinute
    ? { startMinute: rangeStartMinute, endMinute: rangeEndMinute }
    : undefined;
  const visibleReports = printRange
    ? reports.filter((report) => {
      const event = parseCalendarEvent(report);
      if (!event) return false;
      const midpoint = (event.start + event.end) / 2;
      return midpoint >= printRange.startMinute && midpoint < printRange.endMinute;
    })
    : reports;
  const eventsByDay = printRange ? placeEvents(visibleReports) : allEventsByDay;
  const events = eventsByDay.flat();
  const { startMinute, endMinute } = printRange ?? focusedRange(events);
  const hours = Array.from(
    { length: (endMinute - startMinute) / 60 + 1 },
    (_, index) => startMinute / 60 + index,
  );
  const laneGap = minimumLaneGap(eventsByDay);
  const hourHeight = Number.isFinite(laneGap)
    ? Math.min(MAX_HOUR_HEIGHT, Math.max(MIN_HOUR_HEIGHT, TARGET_EVENT_HEIGHT * 60 / laneGap))
    : MIN_HOUR_HEIGHT;
  const bodyHeight = variant === 'screen'
    ? Math.max(560, (endMinute - startMinute) / 60 * hourHeight)
    : undefined;
  const { activeDayCount, columnTemplate } = calendarColumns(allEventsByDay, variant);
  return {
    eventsByDay,
    totalEventsByDay: allEventsByDay.map((dayEvents) => dayEvents.length),
    startMinute,
    endMinute,
    hours,
    bodyHeight,
    columnTemplate,
    activeDayCount,
    firstEventMinute: events.length ? Math.min(...events.map((event) => event.start)) : undefined,
    firstActiveDayIndex: allEventsByDay.findIndex((dayEvents) => dayEvents.length > 0),
  };
}

const CANCER_LABEL_PATTERNS = [
  { pattern: /非小细胞肺癌|小细胞肺癌|NSCLC|SCLC|肺癌|胸部肿瘤/i, label: '肺癌' },
  { pattern: /乳腺/, label: '乳腺癌' },
  { pattern: /结直肠|大肠癌|肠癌/, label: '结直肠癌' },
  { pattern: /胃癌/, label: '胃癌' },
  { pattern: /食管|食道/, label: '食管癌' },
  { pattern: /肝癌|肝细胞癌|HCC/i, label: '肝癌' },
  { pattern: /胆道|胆管|胆囊/, label: '胆道肿瘤' },
  { pattern: /胰腺/, label: '胰腺癌' },
  { pattern: /卵巢|宫颈|子宫|妇科肿瘤/, label: '妇科肿瘤' },
  { pattern: /前列腺/, label: '前列腺癌' },
  { pattern: /肾癌|尿路上皮|膀胱|泌尿肿瘤/, label: '泌尿系统肿瘤' },
  { pattern: /淋巴瘤/, label: '淋巴瘤' },
  { pattern: /白血病/, label: '白血病' },
  { pattern: /骨髓瘤/, label: '多发性骨髓瘤' },
  { pattern: /头颈|鼻咽/, label: '头颈肿瘤' },
  { pattern: /甲状腺/, label: '甲状腺癌' },
  { pattern: /黑色素瘤/, label: '黑色素瘤' },
  { pattern: /肉瘤|骨与软组织/, label: '骨与软组织肿瘤' },
  { pattern: /神经内分泌/, label: '神经内分泌肿瘤' },
  { pattern: /消化道肿瘤/, label: '消化道肿瘤' },
] as const;


function getCancerLabel(report: Report) {
  if (report.field !== '大会专题') return report.field;
  const source = `${report.program} ${report.sourceTitle}`;
  return CANCER_LABEL_PATTERNS.find(({ pattern }) => pattern.test(source))?.label ?? '大会专题';
}

function eventStyle(
  event: CalendarEvent,
  startMinute: number,
  endMinute: number,
  variant: 'screen' | 'pdf',
): CSSProperties {
  const totalMinutes = endMinute - startMinute;
  const visibleStart = variant === 'pdf' ? Math.max(event.start, startMinute) : event.start;
  const visibleEnd = variant === 'pdf' ? Math.min(event.end, endMinute) : event.end;
  const top = ((visibleStart - startMinute) / totalMinutes) * 100;
  const height = ((visibleEnd - visibleStart) / totalMinutes) * 100;
  const width = 100 / event.laneCount;
  return {
    top: `${top}%`,
    height: `${height}%`,
    minHeight: variant === 'screen' ? `${TARGET_EVENT_HEIGHT}px` : undefined,
    left: `calc(${event.lane * width}% + 3px)`,
    width: `calc(${width}% - 6px)`,
  };
}

function CalendarEventCard({
  event,
  startMinute,
  endMinute,
  variant,
  onOpen,
  onLocate,
  onCheckIn,
  attended = false,
  celebrating = false,
}: {
  event: CalendarEvent;
  startMinute: number;
  endMinute: number;
  variant: 'screen' | 'pdf';
  onOpen?: (report: Report) => void;
  onLocate?: (report: Report) => void;
  onCheckIn?: (report: Report) => void;
  attended?: boolean;
  celebrating?: boolean;
}) {
  const label = getCancerLabel(event.report);
  const speaker = event.report.speaker || '待公布';
  const content = <>
    <strong>{label}</strong>
    <div className="calendarEventMeta">
      <span><i>报告人</i>{speaker}</span>
      <time><i>时间</i>{event.time}</time>
    </div>
    <small><i>地点</i>{event.report.location}</small>
  </>;
  const accessibleLabel = `${label}，报告人 ${speaker}，报告时间 ${event.time}，报告地点 ${event.report.location}`;
  const style = eventStyle(event, startMinute, endMinute, variant);
  const className = `calendarEvent ${attended ? 'isAttended' : ''} ${celebrating ? 'isCelebrating' : ''}`;

  if (!onOpen && !onCheckIn && !onLocate) {
    return <article className={className} style={style} aria-label={accessibleLabel}>{content}</article>;
  }

  return (
    <article className={`${className} isInteractive`} style={style}>
      {onOpen
        ? <button className="calendarEventOpen" type="button" onClick={() => onOpen(event.report)} aria-label={accessibleLabel} title={accessibleLabel}>{content}</button>
        : content}
      <div className="calendarEventActions">
      {onLocate && <button className="calendarEventLocate" type="button" onClick={() => onLocate(event.report)} aria-label={`查看会场：${accessibleLabel}`} aria-haspopup="dialog">查看会场</button>}
      {onCheckIn && <button
        className="calendarEventCheckIn"
        type="button"
        aria-pressed={attended}
        onClick={() => onCheckIn(event.report)}
        aria-label={`${attended ? '查看打卡卡片' : '参加打卡'}：${accessibleLabel}`}
      >{attended ? '✓ 已打卡' : '✦ 打卡'}</button>}
      </div>
    </article>
  );
}


export default function CalendarSchedule({
  reports,
  variant = 'screen',
  onOpen,
  onLocate,
  onCheckIn,
  attendedIds,
  celebratingReportId,
  rangeStartMinute,
  rangeEndMinute,
}: CalendarScheduleProps) {
  const layout = useMemo(
    () => buildCalendarLayout(reports, variant, rangeStartMinute, rangeEndMinute),
    [rangeEndMinute, rangeStartMinute, reports, variant],
  );
  const scrollerRef = useRef<HTMLDivElement>(null);
  useEffect(() => {
    if (variant !== 'screen' || layout.bodyHeight === undefined) return;
    const bodyHeight = layout.bodyHeight;
    const frame = requestAnimationFrame(() => {
      const scroller = scrollerRef.current;
      if (!scroller) return;
      if (layout.firstEventMinute !== undefined) {
        const eventOffset = (
          (layout.firstEventMinute - layout.startMinute)
          / (layout.endMinute - layout.startMinute)
        ) * bodyHeight;
        scroller.scrollTop = Math.max(0, eventOffset - 140);
      }
      if (layout.firstActiveDayIndex >= 0 && scroller.scrollWidth > scroller.clientWidth) {
        const activeDay = scroller.querySelectorAll<HTMLElement>('.calendarDayColumn')[layout.firstActiveDayIndex];
        scroller.scrollLeft = Math.max(0, Math.min(
          activeDay.offsetLeft - 8,
          scroller.scrollWidth - scroller.clientWidth,
        ));
      }
    });
    return () => cancelAnimationFrame(frame);
  }, [layout, variant]);
  const gridStyle: CSSProperties = { gridTemplateColumns: layout.columnTemplate };
  const bodyStyle: CSSProperties = {
    ...gridStyle,
    height: layout.bodyHeight === undefined ? undefined : `${layout.bodyHeight}px`,
  };

  return (
    <div
      className={`calendarSchedule is${variant === 'pdf' ? 'Pdf' : 'Screen'}`}
      data-active-days={layout.activeDayCount}
      aria-label="9月17日至9月19日听会日历"
    >
      <div className="calendarScheduleScroller" ref={scrollerRef}>
        <div className="calendarScheduleCanvas">
          <header className="calendarScheduleHeader" style={gridStyle}>
            <div className="calendarTimeZone">GMT+8</div>
            {CALENDAR_DAYS.map((day) => (
              <div className="calendarDayHead" key={day.date}>
                <span>{day.weekday}</span>
                <strong>{day.monthDay}</strong>
                <small>{layout.totalEventsByDay[DAY_INDEX[day.date]]} 场</small>
              </div>
            ))}
          </header>
          <div className="calendarScheduleBody" style={bodyStyle}>
            <div className="calendarHourRail" aria-hidden="true">
              {layout.hours.map((hour, index) => (
                <time key={hour} style={{ top: `${(index / (layout.hours.length - 1)) * 100}%` }}>
                  {String(hour).padStart(2, '0')}:00
                </time>
              ))}
            </div>
            {CALENDAR_DAYS.map((day, dayIndex) => (
              <section className="calendarDayColumn" key={day.date} aria-label={`${day.monthDay} ${day.weekday}`}>
                {layout.hours.map((hour, index) => (
                  <span
                    className="calendarHourLine"
                    key={hour}
                    style={{ top: `${(index / (layout.hours.length - 1)) * 100}%` }}
                    aria-hidden="true"
                  />
                ))}
                {layout.eventsByDay[dayIndex].length ? layout.eventsByDay[dayIndex].map((event) => (
                  <CalendarEventCard
                    key={event.report.id}
                    event={event}
                    startMinute={layout.startMinute}
                    endMinute={layout.endMinute}
                    variant={variant}
                    onOpen={onOpen}
                    onLocate={variant === 'screen' ? onLocate : undefined}
                    onCheckIn={onCheckIn}
                    attended={attendedIds?.has(event.report.id)}
                    celebrating={celebratingReportId === event.report.id}
                  />
                )) : <span className="calendarDayEmpty">暂无日程</span>}
              </section>
            ))}
          </div>
        </div>
      </div>
    </div>
  );
}
