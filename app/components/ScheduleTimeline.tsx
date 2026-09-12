'use client';

import { useId, useMemo, useState, useSyncExternalStore } from 'react';
import type { CSSProperties } from 'react';
import { createPortal, flushSync } from 'react-dom';
import type { Report } from '../lib/reports';
import { layoutTimelineEvents, parseTimelineReports } from '../lib/scheduleTimeline';
import { useDialog } from '../lib/useDialog';
import './schedule-timeline.css';

type ScheduleTimelineProps = {
  reports: Report[];
  day: string;
  onDayChange: (day: string) => void;
  attendedIds: ReadonlySet<number>;
  now: number;
  onOpen: (report: Report) => void;
};

type WindowChoice = { day: string; start: number };
const MOBILE_QUERY = '(max-width: 700px)';
const subscribeMobile = (notify: () => void) => {
  const media = window.matchMedia(MOBILE_QUERY);
  media.addEventListener('change', notify);
  return () => media.removeEventListener('change', notify);
};
const getMobile = () => window.matchMedia(MOBILE_QUERY).matches;
const getServerMobile = () => false;
const clock = (minute: number) => `${String(Math.floor(minute / 60)).padStart(2, '0')}:${String(minute % 60).padStart(2, '0')}`;
const weekday = (day: string) => ['日', '一', '二', '三', '四', '五', '六'][new Date(`${day}T12:00:00+08:00`).getUTCDay()];
const dateLabel = (day: string) => `${Number(day.slice(5, 7))}月${Number(day.slice(8, 10))}日 周${weekday(day)}`;
const clampStart = (minute: number, span: number) => Math.max(0, Math.min(1440 - span, minute));

export default function ScheduleTimeline({ reports, day, onDayChange, attendedIds, now, onOpen }: ScheduleTimelineProps) {
  const parsed = useMemo(() => parseTimelineReports(reports), [reports]);
  const mobile = useSyncExternalStore(subscribeMobile, getMobile, getServerMobile);
  const [view, setView] = useState<1 | 3>(1);
  const [chosenSpan, setChosenSpan] = useState<number | null>(null);
  const span = chosenSpan ?? (mobile ? 60 : 120);
  const [windowChoice, setWindowChoice] = useState<WindowChoice | null>(null);
  const [popup, setPopup] = useState<'window' | 'untimed' | null>(null);
  const dialogId = `schedule-timeline-${useId().replaceAll(':', '')}`;
  const closePopup = () => setPopup(null);
  useDialog(`#${dialogId}`, closePopup, popup !== null);

  const selectedDay = parsed.days.includes(day) ? day : parsed.days[0] ?? '';
  const dayIndex = parsed.days.indexOf(selectedDay);
  const stripStart = Math.max(0, Math.min(dayIndex - 2, parsed.days.length - 5));
  const stripDays = parsed.days.slice(stripStart, stripStart + 5);
  const dayCount = mobile ? 1 : view;
  const columnsStart = Math.max(0, Math.min(dayIndex - (dayCount === 3 ? 1 : 0), parsed.days.length - dayCount));
  const visibleDays = useMemo(() => parsed.days.slice(columnsStart, columnsStart + dayCount), [parsed.days, columnsStart, dayCount]);
  const firstStart = parsed.events.find(event => event.day === selectedDay)?.startMinute ?? 0;
  const start = clampStart(windowChoice?.day === selectedDay ? windowChoice.start : Math.floor(firstStart / 30) * 30, span);
  const end = start + span;
  const columns = useMemo(() => visibleDays.map(value => ({
    day: value,
    events: layoutTimelineEvents(parsed.events, value, start, end),
  })), [parsed.events, visibleDays, start, end]);
  const windowReports = columns.flatMap(column => column.events.map(event => event.report));
  const popupReports = popup === 'untimed' ? parsed.untimed : windowReports;
  const timeOptions = Array.from({ length: (1440 - span) / 30 + 1 }, (_, index) => index * 30);
  const divisions = span === 30 ? 3 : 4;
  const ticks = Array.from({ length: divisions + 1 }, (_, index) => start + span * index / divisions);
  const chinaNow = new Date(now + 8 * 60 * 60 * 1000);
  const nowDay = Number.isFinite(now) ? chinaNow.toISOString().slice(0, 10) : '';
  const nowMinute = chinaNow.getUTCHours() * 60 + chinaNow.getUTCMinutes() + chinaNow.getUTCSeconds() / 60;
  const nextOccupied = parsed.events.find(event => visibleDays.includes(event.day) && event.startMinute >= end)
    ?? parsed.events.find(event => visibleDays.includes(event.day));

  const selectDay = (value: string) => {
    setWindowChoice(null);
    onDayChange(value);
  };
  const selectStart = (value: number) => setWindowChoice({ day: selectedDay, start: clampStart(value, span) });
  const selectSpan = (value: number) => {
    setWindowChoice({ day: selectedDay, start: clampStart(start, value) });
    setChosenSpan(value);
  };
  const openFromPopup = (report: Report) => {
    // Unmount and restore the list trigger before the parent opens its own dialog.
    flushSync(() => setPopup(null));
    onOpen(report);
  };

  return <section className="scheduleTimeline" aria-label="日程时间轴日历">
    {!reports.length ? <div className="scheduleTimelineEmpty"><strong>日程里还没有报告</strong><span>添加报告后，可在这里按真实时间查看安排。</span></div> : <>
      <header className="scheduleTimelineHeader">
        <h2>{selectedDay ? `${selectedDay.slice(0, 4)}年${Number(selectedDay.slice(5, 7))}月` : '时间待确认'}</h2>
        <div className="scheduleTimelineHeaderActions">
          <div className="scheduleTimelineView" aria-label="日历天数">
            <button type="button" aria-pressed={view === 1} onClick={() => setView(1)}>单日</button>
            <button type="button" aria-pressed={view === 3} disabled={parsed.days.length < 2} onClick={() => setView(3)}>三日</button>
          </div>
          {selectedDay && <button type="button" className="scheduleTimelineListTrigger" aria-haspopup="dialog" onClick={() => setPopup('window')}>本时段 {windowReports.length} 场</button>}
          {parsed.untimed.length > 0 && <button type="button" className="scheduleTimelineUntimedTrigger" aria-haspopup="dialog" title="查看所有时间待确认的报告" onClick={() => setPopup('untimed')}>待定 {parsed.untimed.length}</button>}
        </div>
      </header>
      {selectedDay ? <>
        <nav className="scheduleTimelineDateStrip" aria-label="选择会议日期">
          <button type="button" className="scheduleTimelineArrow" aria-label="上一会议日" disabled={dayIndex <= 0} onClick={() => selectDay(parsed.days[dayIndex - 1])}>‹</button>
          <div className="scheduleTimelineDates">
            {stripDays.map(value => <button type="button" key={value} className="scheduleTimelineDate" aria-label={dateLabel(value)} aria-pressed={value === selectedDay} onClick={() => selectDay(value)}>
              <span className="scheduleTimelineWeekday">周{weekday(value)}</span><strong className="scheduleTimelineDateCircle">{Number(value.slice(8, 10))}</strong>
            </button>)}
          </div>
          <button type="button" className="scheduleTimelineArrow" aria-label="下一会议日" disabled={dayIndex >= parsed.days.length - 1} onClick={() => selectDay(parsed.days[dayIndex + 1])}>›</button>
        </nav>
        <div className="scheduleTimelineToolbar">
          <button type="button" className="scheduleTimelineArrow" aria-label="上一时段" disabled={start === 0} onClick={() => selectStart(start - span)}>‹</button>
          <select aria-label="显示时段（北京时间）" value={start} onChange={event => selectStart(Number(event.target.value))}>
            {timeOptions.map(value => <option key={value} value={value}>{clock(value)}–{clock(value + span)}</option>)}
          </select>
          <button type="button" className="scheduleTimelineArrow" aria-label="下一时段" disabled={end === 1440} onClick={() => selectStart(start + span)}>›</button>
          <select aria-label="时间轴缩放" value={span} onChange={event => selectSpan(Number(event.target.value))}>
            <option value={30}>30 分钟</option><option value={60}>60 分钟</option><option value={120}>120 分钟</option>
          </select>
          <span className="scheduleTimelineWindowHint">按真实时长排列 · 重叠报告并排显示</span>
        </div>
        <div className="scheduleTimelineStage">
          <div className="scheduleTimelineColumnHeaders" style={{ '--timeline-days': columns.length } as CSSProperties}>
            <span className="scheduleTimelineZone">GMT+8</span>
            {columns.map(column => <button type="button" key={column.day} className={`scheduleTimelineColumnDate${column.day === selectedDay ? ' isSelected' : ''}`} onClick={() => selectDay(column.day)}>{dateLabel(column.day)}</button>)}
          </div>
          <div className="scheduleTimelineBody">
            <div className="scheduleTimelineRail" aria-hidden="true">
              {ticks.map((minute, index) => <span key={minute} className={index === 0 ? 'isFirst' : index === divisions ? 'isLast' : ''} style={{ top: `${index / divisions * 100}%` }}>{clock(minute)}</span>)}
            </div>
            <div className="scheduleTimelineColumns" style={{ '--timeline-days': columns.length } as CSSProperties}>
              {columns.map(column => <div className="scheduleTimelineDay" key={column.day} aria-label={`${dateLabel(column.day)} ${clock(start)}至${clock(end)}`}>
                {ticks.map((minute, index) => <div key={minute} className="scheduleTimelineRule" style={{ top: `${index / divisions * 100}%` }} aria-hidden="true" />)}
                {column.events.map(event => {
                  const attended = attendedIds.has(event.report.id);
                  const label = `${event.report.sourceTitle}；${event.report.dateTime}；${event.report.speaker}；${event.report.location}；${attended ? '已打卡' : '未打卡'}${event.continuesBefore ? '；开始于本时段之前' : ''}${event.continuesAfter ? '；延续至下一时段' : ''}`;
                  const style: CSSProperties = {
                    top: `${(event.visibleStart - start) / span * 100}%`,
                    height: `${(event.visibleEnd - event.visibleStart) / span * 100}%`,
                    left: `${event.lane / event.laneCount * 100}%`,
                    width: `${100 / event.laneCount}%`,
                  };
                  return <button type="button" key={event.report.id} className={`scheduleTimelineEvent tone-${Math.abs(event.report.id) % 3}${attended ? ' isAttended' : ''}${event.continuesBefore ? ' continuesBefore' : ''}${event.continuesAfter ? ' continuesAfter' : ''}`} style={style} title={label} aria-label={label} aria-haspopup="dialog" onClick={() => onOpen(event.report)}>
                    <strong>{attended && <span className="scheduleTimelineCheck">已打卡 · </span>}{event.report.sourceTitle}</strong>
                    <span className="scheduleTimelineEventTime">{event.continuesBefore ? '↑ ' : ''}{clock(event.startMinute)}–{clock(event.endMinute)}{event.continuesAfter ? ' ↓' : ''}</span>
                    <span className="scheduleTimelineEventDetail">{event.report.speaker} · {event.report.location}</span>
                  </button>;
                })}
                {nowDay === column.day && nowMinute >= start && nowMinute < end && <div className="scheduleTimelineNow" style={{ top: `${(nowMinute - start) / span * 100}%` }} aria-label={`当前北京时间 ${clock(Math.floor(nowMinute))}`} role="img"><span /></div>}
              </div>)}
              {!windowReports.length && <div className="scheduleTimelineWindowEmpty"><strong>本时段没有报告</strong>{nextOccupied ? <button type="button" onClick={() => selectStart(Math.floor(nextOccupied.startMinute / 30) * 30)}>跳到有报告的时段</button> : <span>请切换会议日期</span>}</div>}
            </div>
          </div>
        </div>
      </> : <div className="scheduleTimelineEmpty"><strong>这些报告的时间尚待确认</strong><span>打开右上角「待定」查看全部报告与详情。</span></div>}
    </>}
    {popup !== null && createPortal(<div className="scheduleTimelineBackdrop" onClick={event => { if (event.target === event.currentTarget) closePopup(); }}>
      <section className="scheduleTimelineDialog" id={dialogId} role="dialog" aria-modal="true" aria-labelledby={`${dialogId}-title`}>
        <header><div><h2 id={`${dialogId}-title`}>{popup === 'untimed' ? `时间待确认 · ${popupReports.length} 场` : `本时段 · ${popupReports.length} 场`}</h2><p>{popup === 'untimed' ? '以下报告无法确定起止时间，仍可查看详情与操作。' : `${visibleDays.map(dateLabel).join(' / ')} · ${clock(start)}–${clock(end)}（北京时间）`}</p></div><button type="button" onClick={closePopup} aria-label="关闭报告列表">关闭</button></header>
        <div className="scheduleTimelineDialogList">
          {popupReports.length ? popupReports.map(report => <button type="button" key={report.id} className="scheduleTimelineDialogReport" onClick={() => openFromPopup(report)}>
            <span className="scheduleTimelineDialogTime">{report.dateTime || '时间待确认'}<em className={attendedIds.has(report.id) ? 'isAttended' : ''}>{attendedIds.has(report.id) ? '已打卡' : '未打卡'}</em></span>
            <strong>{report.sourceTitle}</strong><span>{report.speaker} · {report.location}</span><span className="scheduleTimelineDialogOpen">查看详情与操作 →</span>
          </button>) : <p className="scheduleTimelineDialogEmpty">本时段没有报告。关闭列表后，可切换时间或会议日期。</p>}
        </div>
      </section>
    </div>, document.body)}
  </section>;
}
