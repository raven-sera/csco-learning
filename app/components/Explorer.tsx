'use client';

import { lazy, memo, Suspense, useCallback, useDeferredValue, useEffect, useMemo, useRef, useState } from 'react';
import Link from 'next/link';
import { useDialog } from '../lib/useDialog';
import { useLocalRecord } from '../lib/useLocalRecord';
import { downloadCalendar, nextScheduledReport, reportInterval, scheduleConflicts } from '../lib/scheduleTools';
import CalendarSchedule from './CalendarSchedule';
const VenueNavigator = lazy(() => import('./VenueNavigator'));
const CheckInCard = lazy(() => import('./CheckInCard'));
const CheckInAtlas = lazy(() => import('./CheckInAtlas'));
import type { ExportMode } from './ExportCenter';
const ExportCenter = lazy(() => import('./ExportCenter'));
import { BrandLockup } from './BrandLockup';
const ReportNotes = lazy(() => import('./ReportNotes'));
import ShareMoment, { SHARE_MOMENT_OPEN_EVENT, type ShareMomentContext } from './ShareMomentHost';
import {
  directions, fields, reportKindCounts, reports, searchScore,
  sortReportsByDateTime, type Report,
} from '../lib/reports';
import { CHECK_IN_PHRASES, createCheckInRecord, isCheckInRecord, type CheckInRecord } from '../lib/checkIn';

const PAGE_SIZE = 12;
const DEFAULT_FIELD = '全部领域';
const DEFAULT_DIRECTION = '全部方向';
const DEFAULT_TIME_SLOT = '全部时间';
const DEFAULT_VENUE = '全部场地';
const DEFAULT_UNIT_TYPE = '全部单位类型';
const UNIT_TYPES = ['高校', '企业'] as const;
const FAVORITES_KEY = 'csco-favorite-reports';
const SCHEDULE_KEY = 'csco-custom-schedule-reports';
const CHECK_IN_KEY = 'csco-report-attendance-v1';

const NAV_ITEMS = [
  { id: 'reports', label: '报告看板', href: '/learning#reports' },
  { id: 'schedule', label: '我的日程', href: '/schedule' },
] as const;

const ACADEMIC_UNIT_PATTERN = /大学|学院|学校|研究生院|University|Univeristy|College|School of/i;
const ENTERPRISE_UNIT_PATTERN = /公司|集团|药业|制药|生物医药|生物科技|生物技术|医疗科技|医药科技|研发中心|Pharma|Biotech|Therapeutics|\bInc\.?\b|\bLtd\.?\b|\bLLC\b|\bCorp\.?\b|AstraZeneca|Pfizer|Roche|Novartis|Bayer|Merck|BeiGene|Janssen|Amgen|Sanofi|AbbVie|GlaxoSmithKline|Bristol.?Myers|Eli Lilly/i;

function getTimeSlot(report: Report) {
  const match = report.dateTime.match(/^\d{4}-(\d{2})-(\d{2})\s+(上午|下午|晚上)/);
  return match ? `${Number(match[1])}.${Number(match[2])}${match[3]}` : '';
}

function timeSlotRank(slot: string) {
  const match = slot.match(/^(\d+)\.(\d+)(上午|下午|晚上)$/);
  if (!match) return Number.POSITIVE_INFINITY;
  const period = { 上午: 0, 下午: 1, 晚上: 2 }[match[3] as '上午' | '下午' | '晚上'];
  return Number(match[1]) * 1000 + Number(match[2]) * 10 + period;
}

function getUnitTypes(institution: string) {
  const types: (typeof UNIT_TYPES)[number][] = [];
  if (ACADEMIC_UNIT_PATTERN.test(institution)) types.push('高校');
  if (ENTERPRISE_UNIT_PATTERN.test(institution)) types.push('企业');
  return types;
}

const TIME_SLOT_BY_REPORT_ID = new Map(reports.map((report) => [report.id, getTimeSlot(report)]));
const UNIT_TYPES_BY_REPORT_ID = new Map(reports.map((report) => [report.id, getUnitTypes(report.institution)]));
const TIME_SLOTS = Array.from(new Set(TIME_SLOT_BY_REPORT_ID.values())).filter(Boolean).sort(
  (left, right) => timeSlotRank(left) - timeSlotRank(right),
);
const VENUES = Array.from(new Set(reports.map((report) => report.location.trim())))
  .filter(Boolean)
  .sort((left, right) => left.localeCompare(right, 'zh-CN'));



const FIELD_COUNTS = reports.reduce(
  (counts, report) => counts.set(report.field, (counts.get(report.field) ?? 0) + 1),
  new Map<string, number>(),
);
const TOP_FIELDS = fields
  .map((name) => ({ name, count: FIELD_COUNTS.get(name) ?? 0 }))
  .sort((a, b) => b.count - a.count)
  .slice(0, 8);
const REPORT_BY_ID = new Map(reports.map((report) => [report.id, report]));
const HERO_METRICS = [
  { value: reports.length, label: '场日程内容' },
  { value: reportKindCounts.口头报告, label: '场口头报告' },
  { value: reportKindCounts.汇报分享, label: '场汇报分享' },
] as const;

type ActivePage = (typeof NAV_ITEMS)[number]['id'];
type ExportRequest = {
  reports:Report[];
  initialMode?:ExportMode;
  clearFavoritesAfterExport:boolean;
};

function openShareMoment(report?: Report) {
  const detail: ShareMomentContext | null = report ? {
    title: report.sourceTitle,
    speaker: report.speaker,
    program: report.program,
    session: report.session,
    dateTime: report.dateTime,
  } : null;
  window.dispatchEvent(new CustomEvent<ShareMomentContext | null>(SHARE_MOMENT_OPEN_EVENT, { detail }));
}

function useNextScheduledReport(input: readonly Report[]) {
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => {
    const timer = window.setInterval(() => setNow(Date.now()), 30000);
    return () => window.clearInterval(timer);
  }, []);
  const report = nextScheduledReport(input, now);
  return { report, ongoing: Boolean(report && reportInterval(report)!.start <= now) };
}

const ReportCard = memo(function ReportCard({
  report,
  order,
  onOpen,
  favorite,
  onToggleFavorite,
  scheduled,
  onToggleSchedule,
}: {
  report: Report;
  order: number;
  onOpen: (report: Report) => void;
  favorite: boolean;
  onToggleFavorite: (report: Report) => void;
  scheduled: boolean;
  onToggleSchedule: (report: Report) => void;
}) {
  return (
    <article className="reportCard" style={{ animationDelay: `${Math.min(order, 8) * 45}ms` }}>
      <button
        className="cardHit"
        onClick={() => onOpen(report)}
        aria-label={`查看报告：${report.sourceTitle}`}
      />
      <div className="cardTopline">
        <div className="cardTagGroup">
          <span className="contentTypeTag" data-kind={report.kind}>{report.kind}</span>
          <span className="cancerTag">{report.kind === '汇报分享' ? report.scheduleCategory : report.field}</span>
        </div>
      </div>
      <h3>{report.sourceTitle}</h3>
      <div className="programLine">
        <span>专场</span>
        <strong title={report.program}>{report.program}</strong>
        {report.session && <b>{report.session}</b>}
      </div>
      {report.kind === '口头报告' && <div className="directionRow">
        {report.directions.slice(0, 3).map((item) => <span key={item}>{item}</span>)}
      </div>}
      <dl>
        <div><dt>{report.kind === '汇报分享' ? '汇报人' : '报告人'}</dt><dd>{report.speaker} · {report.institution}</dd></div>
        <div><dt>时间</dt><dd>{report.dateTime}</dd></div>
        <div><dt>地点</dt><dd>{report.location}</dd></div>
      </dl>
      <div className="cardActions">
        <button
          className={`mobileScheduleButton ${scheduled ? 'isScheduled' : ''}`}
          onClick={() => onToggleSchedule(report)}
          aria-label={`${scheduled ? '移出' : '加入'}我的日程：${report.sourceTitle}`}
          aria-pressed={scheduled}
        >
          <span aria-hidden>{scheduled ? '✓' : '＋'}</span>
          {scheduled ? '已加入日程' : '加入日程'}
        </button>
        <button
          className={`favoriteButton ${favorite ? 'isFavorite' : ''}`}
          onClick={() => onToggleFavorite(report)}
          aria-label={`${favorite ? '取消收藏' : '收藏'}：${report.sourceTitle}`}
          aria-pressed={favorite}
        >
          <span aria-hidden>{favorite ? '★' : '☆'}</span>
          {favorite ? '已收藏' : '收藏'}
        </button>
        <span className="openButton" aria-hidden>进入学习页 <b>↗</b></span>
      </div>
    </article>
  );
});


function DetailView({ report, scheduledReports, onClose, onOpen, onLocate, favorite, onToggleFavorite, scheduled, onToggleSchedule, onShare }:{report:Report;scheduledReports:Report[];onClose:()=>void;onOpen:(r:Report)=>void;onLocate:(report:Report)=>void;favorite:boolean;onToggleFavorite:(report:Report)=>void;scheduled:boolean;onToggleSchedule:(report:Report)=>void;onShare:(report:Report)=>void}) {
  const closeRef=useRef<HTMLButtonElement>(null);
  useDialog('.detailOverlay', onClose);
  return (
    <div className="detailOverlay" role="dialog" aria-modal="true" aria-labelledby="detail-title"><div className="detailShell">
      <header className="detailTopbar"><button ref={closeRef} onClick={onClose} className="backButton">← 返回看板</button><div className="detailTopActions"><button className={`detailFavoriteButton ${favorite?'isFavorite':''}`} onClick={()=>onToggleFavorite(report)} aria-pressed={favorite}><span>{favorite?'★':'☆'}</span>{favorite?'已收藏':'收藏'}</button><a href={report.officialUrl} target="_blank" rel="noreferrer">官方日程 ↗</a></div></header>
      <section className="detailHero">
        <div className="detailTags"><span className="contentTypeTag" data-kind={report.kind}>{report.kind}</span><span>{report.kind === '汇报分享' ? report.scheduleCategory : report.field}</span><span className="programTag">{report.program}</span>{report.session && <span className="sessionTag">{report.session}</span>}{report.kind === '口头报告' && report.directions.slice(0,2).map((d)=><span key={d}>{d}</span>)}</div>
        <h1 id="detail-title">{report.sourceTitle}</h1>
        <div className="detailMeta"><div><small>{report.kind === '汇报分享' ? '汇报人' : '报告人'}</small><strong>{report.speaker}</strong><span>{report.institution}</span></div><div><small>时间</small><strong>{report.dateTime}</strong><span>日程类别：{report.scheduleCategory}</span></div><div><small>地点</small><strong>{report.location}</strong><span>依据CSCO官方日程</span><button className="venueLocateButton" onClick={() => onLocate(report)} aria-haspopup="dialog">查看会场</button></div></div>
      </section>
      <nav className="mobileDetailActions" aria-label="当前报告快捷操作">
        <span className="mobileDetailActionLabel">本场快捷操作</span>
        <button className={scheduled ? 'isScheduled' : ''} onClick={() => onToggleSchedule(report)} aria-pressed={scheduled}>{scheduled ? '✓ 已加入日程' : '＋ 加入日程'}</button>
        <button onClick={() => onShare(report)}>✦ 记录灵感</button>
      </nav>
      <div className="detailColumns"><main className="backgroundPanel">
        <Suspense fallback={<p className="moduleLoading" role="status">正在载入笔记编辑器…</p>}><ReportNotes report={report} /></Suspense>
      </main><aside className="relatedPanel"><div className="stickyRelated">
        <div className="blockTitle"><div><p>MY SCHEDULE</p><h2>我的日程</h2></div></div>
        <section className="relatedList scheduleLinkList">
          <div className="relatedHeading"><h3>准备前往的报告</h3><span>{scheduledReports.length} 场</span></div>
          {scheduledReports.length > 0 ? scheduledReports.map((item) => {
            const current = item.id === report.id;
            return (
              <button
                className={current ? 'isCurrent' : ''}
                key={item.id}
                aria-current={current ? 'page' : undefined}
                onClick={() => {
                  onOpen(item);
                  document.querySelector('.detailOverlay')?.scrollTo(0, 0);
                }}
              >
                <small>{current ? '当前报告' : `${item.kind}${item.session ? ` · ${item.session}` : ''}`}</small>
                <strong>{item.sourceTitle}</strong>
                <span><b>{item.dateTime.replace('2026-', '')}</b> · {item.speaker}</span>
              </button>
            );
          }) : (
            <div className="scheduleLinkEmpty">
              <b>我的日程还是空的</b>
              <p className="desktopScheduleCopy">返回看板收藏报告并上传日程后，这里会出现可直接跳转的报告链接。</p>
              <p className="mobileScheduleCopy">返回报告列表，点击“加入日程”即可在这里快速打开。</p>
            </div>
          )}
        </section>
      </div></aside></div>
    </div></div>
  );
}
function useFavorites() {
  const [favoriteIds, setFavoriteIds] = useLocalRecord<number[]>(FAVORITES_KEY, [], (value: unknown) => Array.isArray(value) ? [...new Set(value.filter((id): id is number => Number.isInteger(id) && REPORT_BY_ID.has(id as number)))] : []);

  const favoriteSet = useMemo(() => new Set(favoriteIds), [favoriteIds]);
  const favoriteReports = useMemo(
    () => favoriteIds
      .map((id) => REPORT_BY_ID.get(id))
      .filter((report): report is Report => Boolean(report)),
    [favoriteIds],
  );
  const toggleFavorite = useCallback((report: Report) => {
    setFavoriteIds((current) => current.includes(report.id)
      ? current.filter((id) => id !== report.id)
      : [...current, report.id]);
  }, []);
  const setReportsFavorite = useCallback((selectedReports: Report[], favorite: boolean) => {
    const selectedIds = new Set(selectedReports.map((report) => report.id));
    setFavoriteIds((current) => favorite
      ? [...current, ...selectedReports.map((report) => report.id).filter((id) => !current.includes(id))]
      : current.filter((id) => !selectedIds.has(id)));
  }, []);
  const clearFavorites = useCallback(() => setFavoriteIds([]), []);

  return { favoriteSet, favoriteReports, toggleFavorite, setReportsFavorite, clearFavorites };
}

function useCustomSchedule() {
  const [scheduleIds, setScheduleIds] = useLocalRecord<number[]>(SCHEDULE_KEY, [], (value: unknown) => Array.isArray(value) ? [...new Set(value.filter((id): id is number => Number.isInteger(id) && REPORT_BY_ID.has(id as number)))] : []);

  const scheduleSet = useMemo(() => new Set(scheduleIds), [scheduleIds]);
  const scheduledReports = useMemo(
    () => sortReportsByDateTime(
      scheduleIds
        .map((id) => REPORT_BY_ID.get(id))
        .filter((report): report is Report => Boolean(report)),
    ),
    [scheduleIds],
  );
  const addReports = useCallback((selectedReports: Report[]) => {
    setScheduleIds((current) => [
      ...current,
      ...selectedReports.map((report) => report.id).filter((id) => !current.includes(id)),
    ]);
  }, []);
  const removeReport = useCallback((report: Report) => {
    setScheduleIds((current) => current.filter((id) => id !== report.id));
  }, []);
  const clearSchedule = useCallback(() => setScheduleIds([]), []);

  return { scheduleSet, scheduledReports, addReports, removeReport, clearSchedule };
}

function useAttendance() {
  const [records, setRecords] = useLocalRecord<Record<number, CheckInRecord>>(CHECK_IN_KEY, {}, (value) => {
    const items = Array.isArray(value) ? value : value && typeof value === 'object' ? Object.values(value) : [];
    return Object.fromEntries(items.filter((record) => isCheckInRecord(record) && REPORT_BY_ID.has(record.reportId)).map(record => [record.reportId, record]));
  });

  const attendedIds = useMemo(
    () => new Set(Object.values(records).map((record) => record.reportId)),
    [records],
  );
  const markAttended = useCallback((report: Report) => {
    const existing = records[report.id];
    if (existing) return { record: existing, isFresh: false };
    const record = createCheckInRecord(report.id);
    setRecords((current) => current[report.id] ? current : { ...current, [report.id]: record });
    return { record, isFresh: true };
  }, [records]);

  return { records, attendedIds, markAttended };
}


function SiteHeader({ activePage }: { activePage: ActivePage }) {
  return (
    <header className="topbar">
      <Link className="brand" href="/" aria-label="返回三站集合入口">
        <BrandLockup compact />
      </Link>
      <nav aria-label="页面导航">
        {NAV_ITEMS.map((item) => (
          <Link
            className={activePage === item.id ? 'active' : ''}
            href={item.href}
            key={item.id}
            aria-current={activePage === item.id ? 'page' : undefined}
          >
            {item.label}
          </Link>
        ))}
      </nav>
      <Link className="edition" href="/">三站入口 ↗</Link>
    </header>
  );
}

function Hero() {
  return <section className="workspaceHero" id="top">
    <div><p className="workspaceEyebrow">CSCO 2026 · 9.17—9.19</p><h1>把听会安排好，<em>把收获留下来。</em></h1>
      <p>检索 {reports.length} 场会议内容，收藏、排期、记录，一站完成。</p>
      <dl>{HERO_METRICS.map(metric => <div key={metric.label}><dt>{metric.value}</dt><dd>{metric.label}</dd></div>)}</dl>
    </div>
    <div className="workspaceShortcuts"><Link href="/schedule"><span>▦</span><div><strong>我的日程</strong><small>三日听会安排</small></div><b>→</b></Link><button onClick={() => openShareMoment()}><span>✦</span><div><strong>记录灵感</strong><small>图文分享卡片</small></div><b>→</b></button></div>
  </section>;
}

function MobileActionHub({ scheduledReports, onOpen, onLocate }:{scheduledReports:Report[];onOpen:(report:Report)=>void;onLocate:(report:Report)=>void}) {
  const { report: nextReport, ongoing } = useNextScheduledReport(scheduledReports);
  return (
    <section className="mobileActionHub" aria-label="手机端重点功能">
      <article className="mobileNextReport">
        <header><span>{ongoing ? '正在进行' : scheduledReports.length && !nextReport ? '已安排的报告均已结束' : '我的下一场'}</span><Link href="/schedule">{scheduledReports.length} 场日程 ↗</Link></header>
        {nextReport ? <>
          <small>{nextReport.dateTime.replace('2026-', '')}</small>
          <h2>{nextReport.sourceTitle}</h2>
          <p>{nextReport.speaker} · {nextReport.location}</p>
          <div><button onClick={() => onOpen(nextReport)}>查看详情</button><button onClick={() => onLocate(nextReport)} aria-haspopup="dialog">查看会场</button><button onClick={() => openShareMoment(nextReport)}>✦ 记录灵感</button></div>
        </> : <>
          <h2>{scheduledReports.length ? '听会结束，回看你的收获' : '先挑选你准备参加的报告'}</h2>
          <p>在报告卡片点击“加入日程”，这里会直接显示下一场。</p>
          <Link className="mobileNextEmptyAction" href="/learning#reports">浏览会议内容 →</Link>
        </>}
      </article>
      <button className="mobileShareSpotlight" onClick={() => openShareMoment()}>
        <span>✦ MOMENT STUDIO</span>
        <strong>分享灵感瞬间</strong>
        <p>现场拍照或写下一句话，快速生成分享卡片。</p>
        <b>拍照 · 图文 · 文字海报 ↗</b>
      </button>
    </section>
  );
}

function MobileBottomNav({activePage,scheduleCount}:{activePage:ActivePage;scheduleCount:number}) {
  return (
    <nav className="mobileBottomNav" aria-label="手机端主要导航"><Link href="/" aria-label="返回三合一入口"><span>⌂</span><b>三合一</b></Link>
      <Link className={activePage === 'reports' ? 'isActive' : ''} href="/learning#reports" aria-current={activePage === 'reports' ? 'page' : undefined}><span>⌕</span><b>报告</b></Link>
      <Link className={activePage === 'schedule' ? 'isActive' : ''} href="/schedule" aria-current={activePage === 'schedule' ? 'page' : undefined}><span>▣<i>{scheduleCount}</i></span><b>我的日程</b></Link>
      <button type="button" onClick={() => openShareMoment()}><span>✦</span><b>灵感分享</b></button>
    </nav>
  );
}

function SearchPanel({
  query,
  timeSlot,
  venue,
  unitType,
  field,
  direction,
  resultCount,
  updating,
  onQueryChange,
  onTimeSlotChange,
  onVenueChange,
  onUnitTypeChange,
  onFieldChange,
  onDirectionChange,
  onReset,
}: {
  query: string;
  timeSlot: string;
  venue: string;
  unitType: string;
  field: string;
  direction: string;
  resultCount: number;
  updating: boolean;
  onQueryChange: (value: string) => void;
  onTimeSlotChange: (value: string) => void;
  onVenueChange: (value: string) => void;
  onUnitTypeChange: (value: string) => void;
  onFieldChange: (value: string) => void;
  onDirectionChange: (value: string) => void;
  onReset: () => void;
}) {
  const [expanded, setExpanded] = useState(false);
  const activeFilterCount = [timeSlot !== DEFAULT_TIME_SLOT, venue !== DEFAULT_VENUE, unitType !== DEFAULT_UNIT_TYPE, field !== DEFAULT_FIELD, direction !== DEFAULT_DIRECTION].filter(Boolean).length;
  const hasFilters = Boolean(
    query
      || timeSlot !== DEFAULT_TIME_SLOT
      || venue !== DEFAULT_VENUE
      || unitType !== DEFAULT_UNIT_TYPE
      || field !== DEFAULT_FIELD
      || direction !== DEFAULT_DIRECTION,
  );

  return (
    <section
      className={`searchDock ${updating ? 'isUpdating' : ''}`}
      aria-label="报告检索"
      aria-busy={updating}
    >
      <div className="searchIntro">
        <span>DISCOVER</span>
        <label htmlFor="report-search">检索报告</label>
      </div>
      <div className="searchField">
        <span aria-hidden>⌕</span>
        <input
          id="report-search"
          value={query}
          onChange={(event) => onQueryChange(event.target.value)}
          placeholder="中英文、拼音近音、药物名或报告人…"
          autoComplete="off"
        />
        {query && (
          <button onClick={() => onQueryChange('')} aria-label="清空搜索">×</button>
        )}
      </div>
      <div className="searchMeta" aria-live="polite">
        <strong>{resultCount}</strong>
        <span>{updating ? '正在筛选' : '场匹配'}</span>
      </div>
      <button className="filterToggle" onClick={() => setExpanded(!expanded)} aria-expanded={expanded} aria-controls="advanced-filters">{expanded ? '收起筛选' : '更多筛选'}{activeFilterCount > 0 ? ` · ${activeFilterCount} 项已选` : ''}<span>{expanded ? '−' : '＋'}</span></button>
      <div className={`filterRow ${expanded ? 'isExpanded' : ''}`} id="advanced-filters">
        <label>
          <span>时间</span>
          <select value={timeSlot} onChange={(event) => onTimeSlotChange(event.target.value)}>
            <option value={DEFAULT_TIME_SLOT}>{DEFAULT_TIME_SLOT}</option>
            {TIME_SLOTS.map((item) => <option key={item}>{item}</option>)}
          </select>
        </label>
        <label>
          <span>会议场地</span>
          <select value={venue} onChange={(event) => onVenueChange(event.target.value)}>
            <option value={DEFAULT_VENUE}>{DEFAULT_VENUE}</option>
            {VENUES.map((item) => <option key={item}>{item}</option>)}
          </select>
        </label>
        <label>
          <span>单位类型</span>
          <select value={unitType} onChange={(event) => onUnitTypeChange(event.target.value)}>
            <option value={DEFAULT_UNIT_TYPE}>{DEFAULT_UNIT_TYPE}</option>
            {UNIT_TYPES.map((item) => <option key={item}>{item}</option>)}
          </select>
        </label>
        <label>
          <span>领域</span>
          <select value={field} onChange={(event) => onFieldChange(event.target.value)}>
            <option value={DEFAULT_FIELD}>{DEFAULT_FIELD}</option>
            {fields.map((item) => <option key={item}>{item}</option>)}
          </select>
        </label>
        <label>
          <span>研究方向</span>
          <select
            value={direction}
            onChange={(event) => onDirectionChange(event.target.value)}
          >
            <option value={DEFAULT_DIRECTION}>{DEFAULT_DIRECTION}</option>
            {directions.map((item) => <option key={item}>{item}</option>)}
          </select>
        </label>
        {hasFilters && <button className="clearFilters" onClick={onReset}>重置全部筛选</button>}
      </div>
    </section>
  );
}

function Pagination({
  page,
  totalPages,
  onChange,
}: {
  page: number;
  totalPages: number;
  onChange: (page: number) => void;
}) {
  const pages = Array.from({ length: totalPages }, (_, index) => index + 1)
    .filter((item) => item === 1 || item === totalPages || Math.abs(item - page) <= 1);

  return (
    <nav className="pagination" aria-label="报告分页">
      <button disabled={page === 1} onClick={() => onChange(page - 1)}>← 上一页</button>
      <div>
        {pages.map((item, index) => (
          <span key={item}>
            {index > 0 && item - pages[index - 1] > 1 && <i>…</i>}
            <button
              className={item === page ? 'current' : ''}
              onClick={() => onChange(item)}
              aria-current={item === page ? 'page' : undefined}
              aria-label={`第 ${item} 页`}
            >
              {item}
            </button>
          </span>
        ))}
      </div>
      <button disabled={page === totalPages} onClick={() => onChange(page + 1)}>下一页 →</button>
    </nav>
  );
}

function MySchedule({
  scheduledReports,
  attendedIds,
  celebratingReportId,
  unlockedPhraseCount,
  onOpen,
  onLocate,
  onCheckIn,
  onOpenAtlas,
  onRemove,
  onClear,
  onExportNotes,
  onExportSchedule,
  onShare,
}: {
  scheduledReports: Report[];
  attendedIds: ReadonlySet<number>;
  celebratingReportId: number | null;
  unlockedPhraseCount: number;
  onOpen: (report: Report) => void;
  onLocate: (report?: Report) => void;
  onCheckIn: (report: Report) => void;
  onOpenAtlas: () => void;
  onRemove: (report: Report) => void;
  onClear: () => void;
  onExportNotes: () => void;
  onExportSchedule: () => void;
  onShare: (report: Report) => void;
}) {
  const [scheduleView, setScheduleView] = useState<'calendar' | 'list'>('list');
  const conflicts = useMemo(() => scheduleConflicts(scheduledReports), [scheduledReports]);
  const groups = scheduledReports.reduce((result, report) => {
    const day = report.dateTime.match(/^\d{4}-\d{2}-\d{2}/)?.[0] ?? '日期待确认';
    result.set(day, [...(result.get(day) ?? []), report]);
    return result;
  }, new Map<string, Report[]>());
  const { report: nextReport } = useNextScheduledReport(scheduledReports);
  const attendedCount = scheduledReports.reduce(
    (count, report) => count + Number(attendedIds.has(report.id)),
    0,
  );

  return (
    <section className="mySchedule" id="schedule" aria-labelledby="my-schedule-title">
      <div className="scheduleSummary">
        <span className="sectionNo">B.</span>
        <p>MY CUSTOM ITINERARY</p>
        <h2 id="my-schedule-title">我的自定义日程</h2>
        <p className="scheduleDescription desktopScheduleCopy">把想听的报告放进 9.17–9.19 三天会议日历。到场后点击“打卡”，日程颜色会同步点亮，并生成一张可保存的专属卡片。</p>
        <p className="scheduleDescription mobileScheduleCopy">到场后点击报告旁的“打卡”，点亮日程并保存你的 CSCO 现场卡片。</p>
        <dl>
          <div><dt>{scheduledReports.length}</dt><dd>场已加入</dd></div>
          <div><dt>{groups.size}</dt><dd>个会议日</dd></div>
          <div><dt>{attendedCount}</dt><dd>场已打卡</dd></div>
        </dl>
        <div className="scheduleActions" aria-label="我的日程操作">
          <button className="scheduleClearButton" type="button" disabled={!scheduledReports.length} onClick={onClear}>一键清空 <b>×</b></button>
          <button className="scheduleNotesExportButton" type="button" disabled={!scheduledReports.length} onClick={onExportNotes}>笔记批量导出 <b>PDF ↗</b></button>
          <button className="scheduleItineraryExportButton" type="button" disabled={!scheduledReports.length} onClick={onExportSchedule}>日程导出（表格 / 日历） <b>PDF ↗</b></button>
          <button className="calendarImportButton" type="button" disabled={!scheduledReports.some(report => reportInterval(report))} onClick={() => downloadCalendar(scheduledReports)}>导入系统日历 <b>ICS ↓</b></button>
          <button className="scheduleAtlasButton" type="button" onClick={onOpenAtlas}>打卡语图鉴 <b>{unlockedPhraseCount}/{CHECK_IN_PHRASES.length} ↗</b></button>
        </div>
      </div>
      <div className="scheduleCart">
        {conflicts.size > 0 && <details className="scheduleConflict"><summary>{conflicts.size} 场报告存在时间重叠，查看冲突</summary><p>这些报告的时间有交集，请根据会场和优先级取舍。</p>{scheduledReports.filter(report => conflicts.has(report.id)).map(report => <button key={report.id} onClick={() => onOpen(report)}>{report.dateTime.replace('2026-', '')} · {report.sourceTitle}</button>)}</details>}
        <header>
          <div>
            <span>MY SCHEDULE</span>
            <strong>{scheduleView === 'calendar' ? '三日听会日历' : '会议时间清单'}</strong>
          </div>
          <div className="scheduleCartTools">
            <b>{scheduleView === 'calendar' ? '9.17–9.19 · 内容自适应' : '已自动按会议时间排序'}</b>
            <div className="scheduleViewSwitch" role="group" aria-label="日程呈现方式">
              <button type="button" aria-pressed={scheduleView === 'calendar'} onClick={() => setScheduleView('calendar')}>日历视图</button>
              <button type="button" aria-pressed={scheduleView === 'list'} onClick={() => setScheduleView('list')}>清单视图</button>
              <button type="button" onClick={() => onLocate()} aria-haspopup="dialog">会场地图</button>
            </div>
          </div>
        </header>
        {scheduledReports.length === 0 ? (
          <div className="scheduleEmpty"><Link className="emptyScheduleLink" href="/learning#reports">去挑选报告 →</Link>
            <span aria-hidden>＋</span>
            <strong>日程里还没有报告</strong>
            <p className="desktopScheduleCopy">在报告看板点击“加入日程”，或将收藏批量加入。</p>
            <p className="mobileScheduleCopy">在报告列表点击“加入日程”，这里会自动生成你的三天听会日历。</p>
          </div>
        ) : scheduleView === 'calendar' ? (
          <CalendarSchedule
            reports={scheduledReports}
            onOpen={onOpen}
            onLocate={onLocate}
            onCheckIn={onCheckIn}
            attendedIds={attendedIds}
            celebratingReportId={celebratingReportId}
          />
        ) : (
          <div className="scheduleDays">
            {Array.from(groups).map(([day, dayReports]) => (
              <section className="scheduleDayGroup" key={day}>
                <header><time>{day === '日期待确认' ? day : day.replaceAll('-', '.')}</time><span>{dayReports.length} 场</span></header>
                <div>
                  {dayReports.map((report) => (
                    <article className={`scheduleItem ${report.id === nextReport?.id ? 'isNext' : ''} ${attendedIds.has(report.id) ? 'isAttended' : ''} ${celebratingReportId === report.id ? 'isCelebrating' : ''}`} key={report.id}>
                      <time>{report.dateTime.replace(`${day} `, '')}</time>
                      <button className="scheduleItemOpen" type="button" onClick={() => onOpen(report)}>
                        <small>{report.kind}{report.session ? ` · ${report.session}` : ''}</small>
                        <strong>{report.sourceTitle}</strong>
                        <span>{report.speaker} · {report.institution}</span>
                        <span className="scheduleItemVenue">{report.location}</span>
                      </button>
                      <div className="scheduleItemActions">
                        <button className="venueLocateButton" type="button" onClick={() => onLocate(report)} aria-label={`查看会场：${report.sourceTitle}`} aria-haspopup="dialog">查看会场</button>
                        <button className="scheduleItemCheckIn" type="button" aria-pressed={attendedIds.has(report.id)} onClick={() => onCheckIn(report)}>{attendedIds.has(report.id) ? '✓ 已打卡' : '✦ 现场打卡'}</button>
                        <button className="scheduleItemShare" type="button" onClick={() => onShare(report)} aria-label={`记录灵感：${report.sourceTitle}`}>✦ 记录灵感</button>
                        <button className="scheduleItemRemove" type="button" onClick={() => onRemove(report)} aria-label={`从我的日程移除：${report.sourceTitle}`}>移除</button>
                      </div>
                    </article>
                  ))}
                </div>
              </section>
            ))}
          </div>
        )}
      </div>
    </section>
  );
}

export default function Explorer({ initialPage = 'reports' }: { initialPage?: ActivePage }) {
  const [query, setQuery] = useState('');
  const [scope, setScope] = useState<'all' | 'favorites' | 'scheduled'>('all');
  const [sortOrder, setSortOrder] = useState<'relevance' | 'time'>('relevance');
  const deferredQuery = useDeferredValue(query);
  const [timeSlot, setTimeSlot] = useState(DEFAULT_TIME_SLOT);
  const [venue, setVenue] = useState(DEFAULT_VENUE);
  const [unitType, setUnitType] = useState(DEFAULT_UNIT_TYPE);
  const [field, setField] = useState(DEFAULT_FIELD);
  const [direction, setDirection] = useState(DEFAULT_DIRECTION);
  const [page, setPage] = useState(1);
  const [selected, setSelected] = useState<Report | null>(null);
  const [mapReport, setMapReport] = useState<Report | null | undefined>(undefined);
  const [exportRequest, setExportRequest] = useState<ExportRequest | null>(null);
  const {
    favoriteSet,
    favoriteReports,
    toggleFavorite,
    setReportsFavorite,
    clearFavorites,
  } = useFavorites();
  const {
    scheduleSet,
    scheduledReports,
    addReports: addScheduleReports,
    removeReport: removeScheduledReport,
    clearSchedule,
  } = useCustomSchedule();
  const { records, attendedIds, markAttended } = useAttendance();
  const [checkInCard, setCheckInCard] = useState<{
    report: Report;
    record: CheckInRecord;
    isFresh: boolean;
  } | null>(null);
  const [checkInAtlasOpen, setCheckInAtlasOpen] = useState(false);
  const [celebratingReportId, setCelebratingReportId] = useState<number | null>(null);
  const checkInAnimationTimerRef = useRef<number | null>(null);
  const [scheduleUploadFeedback, setScheduleUploadFeedback] = useState('');
  const scheduleUploadTimerRef = useRef<number | null>(null);
  const unlockedPhraseCount = useMemo(
    () => new Set(Object.values(records)
      .map((record) => record.phrase)
      .filter((phrase) => CHECK_IN_PHRASES.includes(phrase))).size,
    [records],
  );

  useEffect(() => () => {
    if (scheduleUploadTimerRef.current !== null) window.clearTimeout(scheduleUploadTimerRef.current);
    if (checkInAnimationTimerRef.current !== null) window.clearTimeout(checkInAnimationTimerRef.current);
  }, []);

  const uploadFavoritesToSchedule = useCallback(() => {
    const addedCount = favoriteReports.reduce(
      (count, report) => count + Number(!scheduleSet.has(report.id)),
      0,
    );
    addScheduleReports(favoriteReports);
    setScheduleUploadFeedback(addedCount ? `已加入 ${addedCount} 场` : '都在日程中');
    if (scheduleUploadTimerRef.current !== null) window.clearTimeout(scheduleUploadTimerRef.current);
    scheduleUploadTimerRef.current = window.setTimeout(() => {
      setScheduleUploadFeedback('');
      scheduleUploadTimerRef.current = null;
    }, 2400);
  }, [addScheduleReports, favoriteReports, scheduleSet]);

  const toggleScheduledReport = useCallback((report: Report) => {
    if (scheduleSet.has(report.id)) removeScheduledReport(report);
    else addScheduleReports([report]);
  }, [addScheduleReports, removeScheduledReport, scheduleSet]);

  const openCheckInCard = useCallback((report: Report) => {
    const result = markAttended(report);
    setCheckInCard({ report, ...result });
    if (!result.isFresh) return;
    setCelebratingReportId(report.id);
    if (checkInAnimationTimerRef.current !== null) {
      window.clearTimeout(checkInAnimationTimerRef.current);
    }
    checkInAnimationTimerRef.current = window.setTimeout(() => {
      setCelebratingReportId(null);
      checkInAnimationTimerRef.current = null;
    }, 1400);
  }, [markAttended]);

  const clearCustomSchedule = useCallback(() => {
    if (!scheduledReports.length) return;
    if (!window.confirm(`确定清空我的日程中的 ${scheduledReports.length} 场报告吗？`)) return;
    clearSchedule();
  }, [clearSchedule, scheduledReports.length]);

  const filtered = useMemo(() => {
    if (initialPage === 'schedule') return [];
    const ranked: { report: Report; score: number }[] = [];
    const hasQuery = Boolean(deferredQuery.trim());

    for (const report of reports) {
      if (scope === 'favorites' && !favoriteSet.has(report.id)) continue;
      if (scope === 'scheduled' && !scheduleSet.has(report.id)) continue;
      if (timeSlot !== DEFAULT_TIME_SLOT && TIME_SLOT_BY_REPORT_ID.get(report.id) !== timeSlot) continue;
      if (venue !== DEFAULT_VENUE && report.location !== venue) continue;
      if (unitType !== DEFAULT_UNIT_TYPE && !UNIT_TYPES_BY_REPORT_ID.get(report.id)?.includes(unitType as (typeof UNIT_TYPES)[number])) continue;
      if (field !== DEFAULT_FIELD && report.field !== field) continue;
      if (direction !== DEFAULT_DIRECTION && !report.directions.includes(direction)) continue;
      const score = hasQuery ? searchScore(report, deferredQuery) : 1;
      if (score > 0) ranked.push({ report, score });
    }

    ranked.sort((a, b) => hasQuery ? b.score - a.score : a.report.id - b.report.id);
    const result = ranked.map(({ report }) => report);
    return sortOrder === 'time' ? sortReportsByDateTime(result) : result;
  }, [initialPage, deferredQuery, timeSlot, venue, unitType, field, direction, scope, sortOrder, favoriteSet, scheduleSet]);

  const totalPages = Math.max(1, Math.ceil(filtered.length / PAGE_SIZE));
  const currentPage = Math.min(page, totalPages);
  const visible = filtered.slice((currentPage - 1) * PAGE_SIZE, currentPage * PAGE_SIZE);
  const latestFavorite = favoriteReports.at(-1);
  const updating = query !== deferredQuery;
  const visibleFavoriteCount = visible.reduce(
    (count, report) => count + Number(favoriteSet.has(report.id)),
    0,
  );
  const allVisibleFavorited = visible.length > 0 && visibleFavoriteCount === visible.length;

  const resetFilters = useCallback(() => {
    setQuery('');
    setScope('all');
    setTimeSlot(DEFAULT_TIME_SLOT);
    setVenue(DEFAULT_VENUE);
    setUnitType(DEFAULT_UNIT_TYPE);
    setField(DEFAULT_FIELD);
    setDirection(DEFAULT_DIRECTION);
    setPage(1);
  }, []);

  const changePage = useCallback((nextPage: number) => {
    setPage(Math.min(Math.max(nextPage, 1), totalPages));
    requestAnimationFrame(() => {
      document.getElementById('reports')?.scrollIntoView({ behavior: 'smooth', block: 'start' });
    });
  }, [totalPages]);

  const openReport = useCallback((report: Report) => {
    setSelected(report);
    const nextHash = `#report-${report.id}`;
    if (location.hash !== nextHash) {
      history.pushState({ reportId: report.id }, '', nextHash);
    }
  }, []);

  const closeReport = useCallback(() => {
    setSelected(null);
    if (location.hash.startsWith('#report-')) {
      history.replaceState(null, '', location.pathname + location.search);
    }
  }, []);

  const openVenueMap = useCallback((report?: Report) => {
    setMapReport(report ?? null);
    const url = new URL(location.href);
    url.searchParams.set('venueReport', report ? String(report.id) : 'overview');
    history.pushState({ ...history.state, cscoVenue: true }, '', url.pathname + url.search + url.hash);
  }, []);

  const closeVenueMap = useCallback(() => {
    setMapReport(undefined);
    if (history.state?.cscoVenue) {
      history.back();
    } else {
      const url = new URL(location.href);
      url.searchParams.delete('venueReport');
      history.replaceState(history.state, '', url.pathname + url.search + url.hash);
    }
  }, []);

  const openReportFromMap = useCallback((report: Report) => {
    const url = new URL(location.href);
    url.searchParams.delete('venueReport');
    url.hash = `report-${report.id}`;
    history.replaceState({ reportId: report.id }, '', url.pathname + url.search + url.hash);
    setMapReport(undefined);
    setSelected(report);
  }, []);

  useEffect(() => {
    const syncSelectionFromHash = () => {
      const id = Number(location.hash.match(/report-(\d+)/)?.[1]);
      setSelected(id ? REPORT_BY_ID.get(id) ?? null : null);
      const venueReport = new URLSearchParams(location.search).get('venueReport');
      setMapReport(venueReport === 'overview' ? null : venueReport ? REPORT_BY_ID.get(Number(venueReport)) : undefined);
    };
    queueMicrotask(syncSelectionFromHash);
    window.addEventListener('popstate', syncSelectionFromHash);
    window.addEventListener('hashchange', syncSelectionFromHash);
    return () => {
      window.removeEventListener('popstate', syncSelectionFromHash);
      window.removeEventListener('hashchange', syncSelectionFromHash);
    };
  }, []);

  return (
    <main className={initialPage === 'schedule' ? 'schedulePage' : 'reportsPage'}>
      <SiteHeader activePage={initialPage} />
      {initialPage === 'reports' && <>
      {favoriteReports.length > 0 && (
        <aside className="dynamicIsland" aria-live="polite">
          <div className="islandPulse"><span aria-hidden>★</span></div>
          <div className="islandLatest">
            <small>最新收藏</small>
            <strong>{latestFavorite?.speaker}</strong>
          </div>
          <div className="islandCount"><b>{favoriteReports.length}</b><span>场已收藏</span></div>
          <button className="islandUploadButton" data-status={scheduleUploadFeedback ? 'confirmed' : 'idle'} onClick={uploadFavoritesToSchedule} aria-label="上传收藏到我的日程">{scheduleUploadFeedback || '上传日程'} <b>{scheduleUploadFeedback ? '✓' : '＋'}</b></button>
          <button className="islandExportButton" onClick={() => setExportRequest({reports:[...favoriteReports],clearFavoritesAfterExport:false})}>导出 <b>↗</b></button>
        </aside>
      )}

      <Hero />

      <SearchPanel
        query={query}
        timeSlot={timeSlot}
        venue={venue}
        unitType={unitType}
        field={field}
        direction={direction}
        resultCount={filtered.length}
        updating={updating}
        onQueryChange={(value) => { setQuery(value); setPage(1); }}
        onTimeSlotChange={(value) => { setTimeSlot(value); setPage(1); }}
        onVenueChange={(value) => { setVenue(value); setPage(1); }}
        onUnitTypeChange={(value) => { setUnitType(value); setPage(1); }}
        onFieldChange={(value) => { setField(value); setPage(1); }}
        onDirectionChange={(value) => { setDirection(value); setPage(1); }}
        onReset={resetFilters}
      />

      <div className="collectionToolbar">
        <div role="group" aria-label="会议内容范围">{([{id:'all',label:'全部内容',count:reports.length},{id:'favorites',label:'我的收藏',count:favoriteReports.length},{id:'scheduled',label:'已排日程',count:scheduledReports.length}] as const).map(item => <button key={item.id} aria-pressed={scope === item.id} onClick={() => { setScope(item.id); setPage(1); }}>{item.label}<b>{item.count}</b></button>)}</div>
        <label className="sortSelect">排序<select aria-label="报告排序" value={sortOrder} onChange={event => { setSortOrder(event.target.value as 'relevance' | 'time'); setPage(1); }}><option value="relevance">相关优先</option><option value="time">会议时间</option></select></label>
        {scope === 'favorites' && favoriteReports.length > 0 && <div className="collectionActions"><button onClick={uploadFavoritesToSchedule}>全部加入日程</button><button onClick={() => setExportRequest({reports:[...favoriteReports],clearFavoritesAfterExport:false})}>导出收藏</button></div>}
      </div>
      <section className="fieldRail" aria-label="热门领域快捷筛选">
        <span>热门领域</span>
        {TOP_FIELDS.map((item) => (
          <button
            className={field === item.name ? 'selected' : ''}
            key={item.name}
            onClick={() => {
              setField(field === item.name ? DEFAULT_FIELD : item.name);
              setPage(1);
            }}
            aria-pressed={field === item.name}
          >
            {item.name}<b>{item.count}</b>
          </button>
        ))}
      </section>

      <section className="reportSection" id="reports" aria-busy={updating}>
        <div className="sectionHeading">
          <div><span className="sectionNo">A.</span><h2>会议内容看板</h2></div>
          <div className="sectionHeadingActions">
            <p>第 {currentPage} / {totalPages} 页 · 每页 {PAGE_SIZE} 场</p>
            {visible.length > 0 && (
              <button
                className={`favoritePageButton ${allVisibleFavorited ? 'isComplete' : ''}`}
                onClick={() => setReportsFavorite(visible, !allVisibleFavorited)}
                aria-pressed={allVisibleFavorited}
              >
                <span aria-hidden>{allVisibleFavorited ? '★' : '☆'}</span>
                {allVisibleFavorited
                  ? `取消本页收藏`
                  : `收藏本页 ${visible.length} 场`}
              </button>
            )}
          </div>
        </div>
        {visible.length ? (
          <div className="cardGrid">
            {visible.map((report, index) => (
              <ReportCard
                key={report.id}
                report={report}
                order={index}
                onOpen={openReport}
                favorite={favoriteSet.has(report.id)}
                onToggleFavorite={toggleFavorite}
                scheduled={scheduleSet.has(report.id)}
                onToggleSchedule={toggleScheduledReport}
              />
            ))}
          </div>
        ) : (
          <div className="emptyState">
            <b>没有找到完全匹配的会议内容</b>
            <p>可以缩短关键词，或尝试领域、专场、药物英文名、报告人姓名。</p>
            <button onClick={resetFilters}>查看全部内容</button>
          </div>
        )}
        {totalPages > 1 && (
          <Pagination page={currentPage} totalPages={totalPages} onChange={changePage} />
        )}
      </section>
      </>}

      {initialPage === 'schedule' && (
        <MySchedule
          scheduledReports={scheduledReports}
          attendedIds={attendedIds}
          celebratingReportId={celebratingReportId}
          unlockedPhraseCount={unlockedPhraseCount}
          onCheckIn={openCheckInCard}
          onOpenAtlas={() => setCheckInAtlasOpen(true)}
          onOpen={openReport}
          onLocate={openVenueMap}
          onRemove={removeScheduledReport}
          onClear={clearCustomSchedule}
          onExportNotes={() => setExportRequest({reports:[...scheduledReports],initialMode:'notes',clearFavoritesAfterExport:false})}
          onExportSchedule={() => setExportRequest({reports:[...scheduledReports],initialMode:'schedule',clearFavoritesAfterExport:false})}
          onShare={openShareMoment}
        />
      )}
      <footer className="siteFooter">
        <BrandLockup />
        <p>本工具用于会议预习与提问准备，不构成医疗建议。题目、人员、时间与地点均取自CSCO官方日程；专题会未公布讲者单位的条目已明确标注。</p>
        <Link href={initialPage === 'schedule' ? '/learning#reports' : '#top'}>{initialPage === 'schedule' ? '返回报告看板 ←' : '回到顶部 ↑'}</Link>
      </footer>
      {initialPage === 'schedule' && <MobileActionHub scheduledReports={scheduledReports} onOpen={openReport} onLocate={openVenueMap} />}
      <MobileBottomNav activePage={initialPage} scheduleCount={scheduledReports.length} />

      {selected && (
        <DetailView
          key={selected.id}
          report={selected}
          scheduledReports={scheduledReports}
          onLocate={openVenueMap}
          onClose={closeReport}
          onOpen={openReport}
          favorite={favoriteSet.has(selected.id)}
          onToggleFavorite={toggleFavorite}
          scheduled={scheduleSet.has(selected.id)}
          onToggleSchedule={toggleScheduledReport}
          onShare={openShareMoment}
        />
      )}
      {mapReport !== undefined && <Suspense fallback={<div className="venueOpening" role="status"><p>正在载入会场地图…</p><button onClick={closeVenueMap}>取消</button></div>}>
        <VenueNavigator
          key={mapReport?.id ?? 'overview'}
          scheduledReports={scheduledReports}
          initialReport={mapReport}
          onToggleSchedule={toggleScheduledReport}
          onOpenReport={openReportFromMap}
          onClose={closeVenueMap}
        />
      </Suspense>}
      <Suspense fallback={<div className="moduleLoading moduleLoadingFixed" role="status">正在准备工具…</div>}>
      {exportRequest && (
        <ExportCenter
          reports={exportRequest.reports}
          initialMode={exportRequest.initialMode}
          clearAfterExport={exportRequest.clearFavoritesAfterExport}
          onClose={() => setExportRequest(null)}
          onExported={exportRequest.clearFavoritesAfterExport ? clearFavorites : undefined}
        />
      )}
      {checkInCard && <CheckInCard
        key={`${checkInCard.report.id}-${checkInCard.record.checkedAt}`}
        location={checkInCard.report.location}
        record={checkInCard.record}
        isFresh={checkInCard.isFresh}
        onClose={() => setCheckInCard(null)}
      />}
      {checkInAtlasOpen && <CheckInAtlas records={Object.values(records)} onClose={() => setCheckInAtlasOpen(false)} />}
      </Suspense>
      <ShareMoment />
    </main>
  );
}
