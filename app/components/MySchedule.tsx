'use client';

import Link from 'next/link';
import { useEffect, useMemo, useRef, useState } from 'react';
import { requestNotebook } from '../lib/libraryTypes';
import { sortReportsByDateTime, type Report } from '../lib/reports';
import { downloadCalendar, nextScheduledReport, reportInterval, scheduleConflicts } from '../lib/scheduleTools';
import { useDialog } from '../lib/useDialog';
import ScheduleTimeline from './ScheduleTimeline';
import './schedule-workspace.css';

const UNKNOWN_DAY = '日期待确认';
const reportDay = (report: Report) => report.dateTime.match(/^\d{4}-\d{2}-\d{2}/)?.[0] ?? UNKNOWN_DAY;
const dayLabel = (day: string) => day === UNKNOWN_DAY ? day : day.replaceAll('-', '.');
const reportTime = (report: Report) => report.dateTime.replace(/^\d{4}-\d{2}-\d{2}\s*/, '').replace(/^(上午|下午|晚上|中午)\s*/, '') || '时间待确认';

export default function MySchedule({
  scheduledReports, attendedIds, celebratingReportId, onOpen, onLocate, onCheckIn,
  onRemove, onClear, onExportNotes, onExportSchedule, noteIds,
}: {
  scheduledReports: Report[];
  attendedIds: ReadonlySet<number>;
  celebratingReportId: number | null;
  onOpen: (report: Report) => void;
  onLocate: (report?: Report) => void;
  onCheckIn: (report: Report) => void;
  onRemove: (report: Report) => void;
  onClear: () => void;
  onExportNotes: () => void;
  onExportSchedule: () => void;
  noteIds: ReadonlySet<number>;
}) {
  const [view, setView] = useState<'list' | 'calendar'>('list');
  const [selectedDay, setSelectedDay] = useState('all');
  const [conflictsOnly, setConflictsOnly] = useState(false);
  const [pagination, setPagination] = useState({ reports: scheduledReports, capacity: 10, page: 0 });
  const { capacity } = pagination;
  const page = pagination.reports === scheduledReports ? pagination.page : 0;
  const setPage = (next: number) => setPagination(current => ({ ...current, reports: scheduledReports, page: next }));
  const [now, setNow] = useState(() => Date.now());
  const [toolsOpen, setToolsOpen] = useState(false);
  const [actionReport, setActionReport] = useState<Report | null>(null);
  const viewportRef = useRef<HTMLDivElement>(null);
  const gridRef = useRef<HTMLDivElement>(null);
  const closeDialog = () => { setToolsOpen(false); setActionReport(null); };

  useEffect(() => {
    const timer = window.setInterval(() => setNow(Date.now()), 30000);
    return () => window.clearInterval(timer);
  }, []);

  const ordered = useMemo(() => sortReportsByDateTime(scheduledReports), [scheduledReports]);
  const groups = useMemo(() => {
    const result = new Map<string, Report[]>();
    for (const report of ordered) {
      const day = reportDay(report);
      const group = result.get(day);
      if (group) group.push(report);
      else result.set(day, [report]);
    }
    return result;
  }, [ordered]);
  const days = useMemo(() => [...groups.keys()].sort((a, b) => a === UNKNOWN_DAY ? 1 : b === UNKNOWN_DAY ? -1 : a.localeCompare(b)), [groups]);
  const day = selectedDay === 'all' ? 'all' : groups.has(selectedDay) ? selectedDay : days[0] ?? 'all';
  const dayIndex = days.indexOf(day);
  const conflicts = useMemo(() => scheduleConflicts(ordered), [ordered]);
  const dayReports = day === 'all' ? ordered : groups.get(day);
  const filtered = useMemo(() => (dayReports ?? []).filter(report => !conflictsOnly || conflicts.has(report.id)), [dayReports, conflictsOnly, conflicts]);
  const calendarReports = useMemo(() => conflictsOnly ? ordered.filter(report => conflicts.has(report.id)) : ordered, [ordered, conflictsOnly, conflicts]);
  const nextReport = useMemo(() => nextScheduledReport(ordered, now), [ordered, now]);
  const ongoing = Boolean(nextReport && reportInterval(nextReport)!.start <= now);
  const attendedCount = ordered.reduce((count, report) => count + Number(attendedIds.has(report.id)), 0);
  const pageCount = Math.max(1, Math.ceil(filtered.length / capacity));
  const currentPage = Math.min(page, pageCount - 1);
  const visible = filtered.slice(currentPage * capacity, (currentPage + 1) * capacity);
  const reportForActions = actionReport && ordered.find(report => report.id === actionReport.id);

  useDialog('#compact-schedule-dialog', closeDialog, toolsOpen || Boolean(reportForActions));
  if (actionReport && !reportForActions) setActionReport(null);

  useEffect(() => {
    const viewport = viewportRef.current;
    const grid = gridRef.current;
    if (!viewport || !grid) return;
    const measure = () => {
      if (viewport.clientHeight <= 0) return;
      const style = window.getComputedStyle(grid);
      const rowHeight = Number.parseFloat(style.getPropertyValue('--schedule-row-size'));
      const gap = Number.parseFloat(style.rowGap) || 0;
      const nextCapacity = Math.max(1, Math.floor((viewport.clientHeight + gap) / (rowHeight + gap)));
      setPagination(current => current.capacity === nextCapacity ? current : { ...current, capacity: nextCapacity, page: 0 });
    };
    measure();
    const observer = new ResizeObserver(measure);
    observer.observe(viewport);
    observer.observe(grid);
    return () => observer.disconnect();
  }, [view]);

  const selectDay = (value: string) => { setSelectedDay(value); setPage(0); };
  const runAction = (action: () => void) => { closeDialog(); action(); };

  return (
    <section className="compactSchedule" id="schedule" aria-labelledby="my-schedule-title">
      <header className="compactScheduleHeader">
        <div className="compactScheduleHeading"><h1 id="my-schedule-title">我的日程</h1><span title={`${ordered.length} 场报告，${days.length} 个会议日，${attendedCount} 场已打卡`}>{ordered.length} 场 · 已打卡 {attendedCount}</span></div>
        <div className="compactScheduleTopActions">
          <button className="compactScheduleConflictFilter" type="button" aria-pressed={conflictsOnly} title="只看时间重叠的报告" onClick={() => { setConflictsOnly(value => !value); setPage(0); }}>冲突 {conflicts.size}</button>
          <div className="compactScheduleView" role="group" aria-label="日程呈现方式">
            <button type="button" aria-pressed={view === 'list'} onClick={() => { setView('list'); setPage(0); }}>清单</button>
            <button type="button" aria-pressed={view === 'calendar'} onClick={() => { setView('calendar'); setPage(0); }}>日历</button>
          </div>
          <button className="compactScheduleToolsButton" type="button" aria-haspopup="dialog" onClick={() => setToolsOpen(true)}>工具</button>
        </div>
      </header>

      {view === 'list' ? <>
      <div className="compactScheduleDatebar">
        <div className="compactScheduleDayControls" role="group" aria-label="选择会议日">
          <button type="button" aria-label="上一个会议日" disabled={dayIndex <= 0} onClick={() => selectDay(days[dayIndex - 1])}>‹</button>
          <select aria-label="会议日期" value={day} disabled={!days.length} onChange={event => selectDay(event.target.value)}>
            <option value="all">全部日期 · {ordered.length} 场</option>
            {days.map(value => <option key={value} value={value}>{dayLabel(value)} · {groups.get(value)!.length} 场</option>)}
          </select>
          <button type="button" aria-label="下一个会议日" disabled={!days.length || dayIndex >= days.length - 1} onClick={() => selectDay(days[dayIndex + 1])}>›</button>
        </div>
        <span className="compactScheduleListHint">圆圈用于现场打卡</span>
      </div>

      <div className="compactScheduleNext">
        {nextReport ? <button type="button" onClick={() => setActionReport(nextReport)} aria-haspopup="dialog" title={`${ongoing ? '正在进行' : '下一场'}：${nextReport.dateTime} · ${nextReport.sourceTitle} · ${nextReport.speaker}`}><b>{ongoing ? '正在进行' : '下一场'}</b><span>{nextReport.dateTime.replace('2026-', '')} · {nextReport.sourceTitle}</span><em>记录 / 会场 ›</em></button> : <span>{ordered.length ? '已安排的定时报告均已结束或时间待确认' : '选择报告加入日程，按会议日查看安排'}</span>}
      </div>

      <div className="compactScheduleViewport" ref={viewportRef}>
        <div className="compactScheduleGrid" ref={gridRef} role="list" aria-label={day === 'all' ? '全部听会待办' : `${dayLabel(day)}听会待办`}>
          {visible.map(report => {
            const attended = attendedIds.has(report.id);
            const isNext = report.id === nextReport?.id;
            const conflict = conflicts.has(report.id);
            return <article key={report.id} role="listitem" className={`compactScheduleReport${attended ? ' isAttended' : ''}${isNext ? ' isNext' : ''}${celebratingReportId === report.id ? ' isCelebrating' : ''}`}>
              <button className="compactScheduleCheckIn" type="button" aria-pressed={attended} aria-label={`${attended ? '查看打卡' : '现场打卡'}：${report.sourceTitle}`} title={attended ? '查看我的打卡' : '现场打卡'} onClick={() => onCheckIn(report)}><span aria-hidden="true">{attended ? '✓' : ''}</span></button>
              <button className="compactScheduleReportOpen" type="button" onClick={() => onOpen(report)} title={`${report.sourceTitle}\n${report.speaker} · ${report.institution}\n${report.dateTime} · ${report.location}`} aria-label={`查看报告：${report.sourceTitle}；${report.speaker}；${report.dateTime}`}>
                <strong>{report.sourceTitle}</strong><span>{report.speaker || '讲者待确认'}<i> · {report.location}</i>{conflict && <b className="compactScheduleConflictMark"> · 时间重叠</b>}</span>
              </button>
              <div className="compactScheduleReportTime"><time title={report.dateTime}>{reportTime(report)}</time>{(day === 'all' || isNext) && <span>{day === 'all' ? dayLabel(reportDay(report)).replace(/^\d{4}\./, '') : ongoing ? '正在进行' : '下一场'}</span>}</div>
              <button className="compactScheduleReportMore" type="button" aria-label={`更多操作：${report.sourceTitle}`} title="报告操作" aria-haspopup="dialog" onClick={() => setActionReport(report)}>•••</button>
            </article>;
          })}
        </div>
        {!visible.length && <div className="compactScheduleEmpty"><strong>{ordered.length ? '此日期没有符合筛选的报告' : '日程里还没有报告'}</strong>{conflictsOnly && ordered.length ? <button type="button" onClick={() => setConflictsOnly(false)}>显示当天全部报告</button> : <Link href="/learning#reports">去挑选报告 →</Link>}</div>}
      </div>

      <footer className="compactSchedulePagination" aria-label="日程分页">
        <span aria-live="polite">{filtered.length ? `${currentPage * capacity + 1}–${Math.min((currentPage + 1) * capacity, filtered.length)} / ${filtered.length} 场` : '0 场'}<small> · 按时间排序</small></span>
        <div><button type="button" aria-label="上一页日程" disabled={currentPage === 0} onClick={() => setPage(currentPage - 1)}>‹</button><span aria-live="polite">{currentPage + 1} / {pageCount}</span><button type="button" aria-label="下一页日程" disabled={currentPage >= pageCount - 1} onClick={() => setPage(currentPage + 1)}>›</button></div>
      </footer>
      </> : ordered.length > 0 && conflictsOnly && !calendarReports.length ? <div className="compactScheduleViewport"><div className="compactScheduleEmpty" role="status"><strong>没有时间重叠的报告</strong><button type="button" onClick={() => setConflictsOnly(false)}>显示全部日程</button></div></div> : <ScheduleTimeline reports={calendarReports} day={day === 'all' ? days[0] ?? '' : day} onDayChange={selectDay} attendedIds={attendedIds} now={now} onOpen={setActionReport} />}

      {(toolsOpen || reportForActions) && <div className="compactScheduleDialogBackdrop" onClick={event => { if (event.target === event.currentTarget) closeDialog(); }}>
        <section id="compact-schedule-dialog" className="compactScheduleDialog" role="dialog" aria-modal="true" aria-labelledby="compact-schedule-dialog-title">
          <header><h2 id="compact-schedule-dialog-title">{reportForActions ? '报告操作' : '日程工具'}</h2><button type="button" onClick={closeDialog} aria-label="关闭日程操作">关闭</button></header>
          {reportForActions ? <>
            <h3>{reportForActions.sourceTitle}</h3><p>{reportForActions.speaker} · {reportForActions.dateTime}<br />{reportForActions.location}</p>
            <div className="compactScheduleDialogActions">
              <button type="button" onClick={() => runAction(() => onOpen(reportForActions))}>报告详情</button>
              <button type="button" aria-haspopup="dialog" onClick={() => runAction(() => onLocate(reportForActions))}>查看会场</button>
              <button type="button" aria-pressed={attendedIds.has(reportForActions.id)} onClick={() => runAction(() => onCheckIn(reportForActions))}>{attendedIds.has(reportForActions.id) ? '查看我的打卡' : '现场打卡'}</button>
              <button type="button" onClick={() => runAction(() => requestNotebook(reportForActions.id, { section: 'text', mode: 'edit' }))}>{noteIds.has(reportForActions.id) ? '继续记录笔记' : '写笔记'}</button>
              <button type="button" onClick={() => runAction(() => requestNotebook(reportForActions.id, { section: 'slides', mode: 'edit', capture: true }))}>拍 PPT</button>
              <button type="button" className="compactScheduleDanger" onClick={() => runAction(() => onRemove(reportForActions))}>从日程移除</button>
            </div>
            {conflicts.has(reportForActions.id) && <div className="compactScheduleConflictDetails"><h3>与以下报告时间重叠</h3>{conflicts.get(reportForActions.id)!.map(id => {
              const other = ordered.find(report => report.id === id)!;
              return <button type="button" key={id} onClick={() => runAction(() => onOpen(other))}>{other.dateTime} · {other.sourceTitle}</button>;
            })}</div>}
          </> : <>
            <p>共 {ordered.length} 场 · {days.length} 个会议日 · 已打卡 {attendedCount} 场。导出包含全部日程，不受日期、分页与冲突筛选限制。</p>
            <div className="compactScheduleDialogActions">
              <button type="button" aria-haspopup="dialog" onClick={() => runAction(() => onLocate())}>会场地图</button>
              <button type="button" disabled={!ordered.length} onClick={() => runAction(onExportSchedule)}>日程 PDF（表格 / 日历）</button>
              <button type="button" disabled={!ordered.length} onClick={() => runAction(onExportNotes)}>批量导出笔记 PDF</button>
              <button type="button" disabled={!ordered.some(report => reportInterval(report))} onClick={() => runAction(() => downloadCalendar(scheduledReports))}>导入系统日历 ICS</button>
              <Link href="/atlas">打卡图鉴 · {attendedIds.size} 次打卡</Link>
              <Link href="/library">个人图书馆</Link>
              <button type="button" className="compactScheduleDanger" disabled={!ordered.length} onClick={() => runAction(onClear)}>清空全部日程</button>
            </div>
          </>}
        </section>
      </div>}
    </section>
  );
}
