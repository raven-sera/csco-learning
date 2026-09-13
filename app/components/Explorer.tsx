'use client';

import { Fragment, lazy, memo, Suspense, useCallback, useDeferredValue, useEffect, useMemo, useRef, useState } from 'react';
import Link from 'next/link';
import { useDialog } from '../lib/useDialog';
import { useLocalRecord } from '../lib/useLocalRecord';
import MySchedule from './MySchedule';
import FavoriteCollection from './FavoriteCollection';
const VenueNavigator = lazy(() => import('./VenueNavigator'));
const CheckInCard = lazy(() => import('./CheckInCard'));
const CheckInAtlas = lazy(() => import('./CheckInAtlas'));
import type { ExportMode } from './ExportCenter';
const ExportCenter = lazy(() => import('./ExportCenter'));
import { BrandLockup } from './BrandLockup';
const ReportNotes = lazy(() => import('./ReportNotes'));
const PersonalLibrary = lazy(() => import('./PersonalLibrary'));
import { NOTEBOOK_OPEN_EVENT, requestNotebook, type NotebookOpenOptions } from '../lib/libraryTypes';
import { LIBRARY_CHANGE_EVENT, readLibrarySummaries, type LibrarySummary } from '../lib/noteStorage';
import './library-shell.css';
import MycoShell from './MycoShell';
import './myco-search.css';
import {
  fields, getCancerTypes, reports, searchMatch,
  sortReportsByDateTime, type Report,
} from '../lib/reports';
import { createCheckInRecord, isCheckInRecord, type CheckInRecord } from '../lib/checkIn';

const PAGE_SIZE = 12;
const DEFAULT_FIELD = '全部癌种';
const DEFAULT_TIME_SLOT = '全部时间';
const DEFAULT_VENUE = '全部场地';
const DEFAULT_UNIT_TYPE = '全部单位类型';
const DEFAULT_SEARCH = { query: '', timeSlot: DEFAULT_TIME_SLOT, venue: DEFAULT_VENUE, unitType: DEFAULT_UNIT_TYPE, field: DEFAULT_FIELD };
const UNIT_TYPES = ['医院', '高校', '科研院所', '企业', '其他', '未注明'] as const;
const FAVORITES_KEY = 'csco-favorite-reports';
const SCHEDULE_KEY = 'csco-custom-schedule-reports';
const CHECK_IN_KEY = 'csco-report-attendance-v1';


const HOSPITAL_UNIT_PATTERN = /医院|卫生院|保健院|诊所|肿瘤防治中心|医学中心|(?:华西|附)[一二三四五六七八九十\d]+院|\bHospitals?\b|\bClinics?\b|\bMedical Cent(?:er|re)\b/i;
const ACADEMIC_UNIT_PATTERN = /大学|学院|学校|研究生院|\bUniversity\b|\bCollege\b|\bSchool\b/i;
const RESEARCH_UNIT_PATTERN = /研究院|研究所|科学院|研究中心|实验室|\bInstitute\b|\bResearch Cent(?:er|re)\b|\bLaborator(?:y|ies)\b/i;
const ENTERPRISE_UNIT_PATTERN = /公司|集团|药业|制药|生物医药|生物科技|生物技术|医疗科技|医药科技|复星医药|韧致医药|默沙东|正大天晴|科睿唯安|蚂蚁技术|阿里达摩院|丁香园|\bPharma(?:ceuticals?)?\b|\bBiotech(?:nology)?\b|\bTherapeutics\b|\bInc\b|\bLtd\b|\bLLC\b|\bCorp(?:oration)?\b|\bCompany\b|Illumina|AstraZeneca|Pfizer|Roche|Novartis|Bayer|Merck|BeiGene|Janssen|Amgen|Sanofi|AbbVie|GlaxoSmithKline|Bristol.?Myers|Eli Lilly/i;

function getTimeSlot(report: Report) {
  const match = report.dateTime.match(/^\d{4}-(\d{2})-(\d{2})\s+(上午|下午|晚上|时间未注明)/);
  return match ? `${Number(match[1])}.${Number(match[2])}${match[3]}` : '';
}

function timeSlotRank(slot: string) {
  const match = slot.match(/^(\d+)\.(\d+)(上午|下午|晚上|时间未注明)$/);
  if (!match) return Number.POSITIVE_INFINITY;
  const period = { 上午: 0, 下午: 1, 晚上: 2, 时间未注明: 3 }[match[3] as '上午' | '下午' | '晚上' | '时间未注明'];
  return Number(match[1]) * 1000 + Number(match[2]) * 10 + period;
}

function getUnitTypes(institution: string): (typeof UNIT_TYPES)[number][] {
  const units = institution.split(/[\r\n；;]+/).map(unit => unit.trim()).filter(Boolean);
  if (!units.length) return ['未注明'];
  const types = new Set<(typeof UNIT_TYPES)[number]>();
  for (const unit of units) {
    if (HOSPITAL_UNIT_PATTERN.test(unit)) types.add('医院');
    else if (ENTERPRISE_UNIT_PATTERN.test(unit)) types.add('企业');
    else if (RESEARCH_UNIT_PATTERN.test(unit)) types.add('科研院所');
    else if (ACADEMIC_UNIT_PATTERN.test(unit)) types.add('高校');
    else types.add('其他');
  }
  return [...types];
}

const TIME_SLOT_BY_REPORT_ID = new Map(reports.map((report) => [report.id, getTimeSlot(report)]));
const UNIT_TYPES_BY_REPORT_ID = new Map(reports.map((report) => [report.id, getUnitTypes(report.institution)]));
const CANCER_TYPES_BY_REPORT_ID = new Map(reports.map((report) => [report.id, getCancerTypes(report)]));
const REPORT_ORDER_BY_ID = new Map(reports.map((report, index) => [report.id, index]));
const TIME_SLOTS = Array.from(new Set(TIME_SLOT_BY_REPORT_ID.values())).filter(Boolean).sort(
  (left, right) => timeSlotRank(left) - timeSlotRank(right),
);
const VENUES = Array.from(new Set(reports.map((report) => report.location)))
  .filter(Boolean)
  .sort((left, right) => left.localeCompare(right, 'zh-CN'));



const REPORT_BY_ID = new Map(reports.map((report) => [report.id, report]));

type ActivePage = 'reports' | 'favorites' | 'schedule' | 'library' | 'atlas';
type ExportRequest = {
  reports:Report[];
  initialMode?:ExportMode;
  clearFavoritesAfterExport:boolean;
};

function notebookHash(reportId: number, options: NotebookOpenOptions = {}) {
  const params = new URLSearchParams();
  if (options.section) params.set('section', options.section);
  if (options.mode) params.set('mode', options.mode);
  if (options.capture) params.set('capture', '1');
  if (options.slideId) params.set('slide', options.slideId);
  return `#report-${reportId}${params.size ? `?${params}` : ''}`;
}

function notebookOptions(hash: string): NotebookOpenOptions {
  const params = new URLSearchParams(hash.split('?')[1] || '');
  const section = params.get('section');
  const mode = params.get('mode');
  return {
    section: section === 'slides' || section === 'text' || section === 'audio' ? section : undefined,
    mode: mode === 'read' || mode === 'edit' ? mode : undefined,
    capture: params.get('capture') === '1',
    slideId: params.get('slide') || undefined,
  };
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
      {report.field && <div className="cardTopline">
        <div className="cardTagGroup">
          <span className="cancerTag" title={report.field}>{report.field}</span>
        </div>
      </div>}
      <h3>{report.sourceTitle}</h3>
      <div className="programLine">
        <span>专场</span>
        <strong title={report.program}>{report.program}</strong>
        {report.session && <b>{report.session}</b>}
      </div>
      <dl>
        <div><dt>讲者</dt><dd title={report.speaker}>{report.speaker}</dd></div>
        <div><dt>单位</dt><dd title={report.institution}>{report.institution}</dd></div>
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


function DetailView({ report, onClose, onLocate, favorite, onToggleFavorite, scheduled, onToggleSchedule, options, returnLabel }:{
  report:Report; onClose:()=>void; onLocate:(report:Report)=>void; favorite:boolean;
  onToggleFavorite:(report:Report)=>void; scheduled:boolean; onToggleSchedule:(report:Report)=>void;
  options:NotebookOpenOptions; returnLabel:string;
}) {
  useDialog('.detailOverlay', onClose);
  return (
    <div className="detailOverlay notebookDetailOverlay" role="dialog" aria-modal="true" aria-labelledby="detail-title"><div className="detailShell notebookDetailShell">
      <header className="detailTopbar"><button onClick={onClose} className="backButton">← {returnLabel}</button>
        <div className="detailTopActions"><button className={`detailFavoriteButton ${favorite?'isFavorite':''}`} onClick={()=>onToggleFavorite(report)} aria-pressed={favorite}>{favorite?'已收藏':'收藏'}</button><Link href="/library">个人图书馆</Link></div>
      </header>
      <section className="notebookReportHeader">
        {report.field && <p>{report.field}</p>}
        <h1 id="detail-title">{report.sourceTitle}</h1>
        <div className="notebookReportLine"><span>{report.dateTime}</span><span>{report.location}</span></div>
        <details className="notebookReportDetails"><summary>完整报告信息与日程</summary>
          <dl>
            <div><dt>讲者</dt><dd>{report.speaker}</dd></div>
            <div><dt>单位</dt><dd>{report.institution}</dd></div>
            {report.chair && <div><dt>主持</dt><dd>{report.chair}</dd></div>}
            <div><dt>专场</dt><dd>{report.program}</dd></div>
            {report.session && <div><dt>环节</dt><dd>{report.session}</dd></div>}
            {report.kind && <div><dt>类型</dt><dd>{report.kind}</dd></div>}
          </dl>
          <div><button className="venueLocateButton" onClick={() => onLocate(report)}>查看会场</button><button onClick={() => onToggleSchedule(report)} aria-pressed={scheduled}>{scheduled ? '已加入日程' : '加入日程'}</button></div>
        </details>
        <nav className="notebookQuickActions" aria-label="本场笔记快捷操作">
          <button onClick={() => requestNotebook(report.id, { section:'slides', capture:true, mode:'edit' })}>拍 PPT</button>
          <button onClick={() => requestNotebook(report.id, { section:'text', mode:'edit' })}>写笔记</button>
          <button onClick={() => requestNotebook(report.id, { mode:'read' })}>阅读本场资料</button>
        </nav>
      </section>
      <div className="notebookDetailContent"><Suspense fallback={<p className="moduleLoading" role="status">正在载入本场资料…</p>}>
        <ReportNotes report={report} initialSection={options.section} initialMode={options.mode ?? 'read'} autoCapture={options.capture} initialSlideId={options.slideId} />
      </Suspense></div>
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





function SearchPanel({
  query, timeSlot, venue, unitType, field, updating, hasResults, compact = false,
  onQueryChange, onTimeSlotChange, onVenueChange, onUnitTypeChange,
  onFieldChange, onReset, onSearch, onBrowseAll,
}: {
  query: string; timeSlot: string; venue: string; unitType: string; field: string;
  updating: boolean; hasResults: boolean; compact?: boolean;
  onQueryChange: (value: string) => void; onTimeSlotChange: (value: string) => void;
  onVenueChange: (value: string) => void; onUnitTypeChange: (value: string) => void;
  onFieldChange: (value: string) => void;
  onReset: () => void; onSearch: () => void; onBrowseAll: () => void;
}) {
  const [filtersOpen, setFiltersOpen] = useState(false);
  useDialog('.mycoFilterDialog', () => setFiltersOpen(false), filtersOpen);
  const activeFilterCount = [timeSlot !== DEFAULT_TIME_SLOT, venue !== DEFAULT_VENUE, unitType !== DEFAULT_UNIT_TYPE, field !== DEFAULT_FIELD].filter(Boolean).length;
  const filters = <div className="filterRow">
    <label><span>时间</span><select value={timeSlot} onChange={event => onTimeSlotChange(event.target.value)}><option>{DEFAULT_TIME_SLOT}</option>{TIME_SLOTS.map(item => <option key={item}>{item}</option>)}</select></label>
    <label><span>场地</span><select value={venue} onChange={event => onVenueChange(event.target.value)}><option>{DEFAULT_VENUE}</option>{VENUES.map(item => <option key={item}>{item}</option>)}</select></label>
    <label title="单位类型按表中单位名称归组，仅供筛选；多单位可归入多类。"><span>单位类型</span><select value={unitType} onChange={event => onUnitTypeChange(event.target.value)}><option>{DEFAULT_UNIT_TYPE}</option>{UNIT_TYPES.map(item => <option key={item}>{item}</option>)}</select></label>
    <label><span>癌种</span><select value={field} onChange={event => onFieldChange(event.target.value)}><option>{DEFAULT_FIELD}</option>{fields.map(item => <option key={item}>{item}</option>)}</select></label>
  </div>;
  return <section className={`mycoSearch ${hasResults ? 'hasResults' : ''}${compact ? ' isCompactSearch' : ''}`} aria-label={compact ? '检索收藏' : '报告检索'}>
    {!compact && <div className="mycoSearchIntro">
      <span className="mycoSearchEyebrow">让每一次听会，都成为自己的收获</span>
      <h1>My<span>CO</span><i aria-hidden="true" /></h1>
      <p>My CSCO · 你的会议学习空间</p>
    </div>}
    <form className="searchDock" role="search" onSubmit={event => { event.preventDefault(); onSearch(); }}>
      <div className="searchField">
        <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.7" aria-hidden="true"><circle cx="10.5" cy="10.5" r="6.5" /><path d="m16 16 4.5 4.5" /></svg>
        <input id="report-search" aria-label={compact ? '检索收藏内容' : '检索会议内容'} type="search" enterKeyHint="search" value={query} onChange={event => onQueryChange(event.target.value)} onKeyDown={event => { if (event.key === 'Enter' && event.nativeEvent.isComposing) event.preventDefault(); }} placeholder={compact ? '在收藏中搜索' : '搜索报告、报告人、单位或关键词'} autoComplete="off" />
        {query && <button type="button" className="mycoSearchClear" onClick={() => onQueryChange('')} aria-label="清空搜索">×</button>}
        <button type="submit" className="mycoSearchSubmit">搜索<span aria-hidden="true"> →</span></button>
        {compact && <button type="button" className="mycoFilterToggle" aria-label={`筛选收藏${activeFilterCount ? `，已选 ${activeFilterCount} 项` : ''}`} aria-haspopup="dialog" aria-expanded={filtersOpen} onClick={() => setFiltersOpen(true)}>筛选{activeFilterCount > 0 && <b>{activeFilterCount}</b>}</button>}
      </div>
      {!compact && <>{filters}<div className="mycoSearchHint">
        <span aria-live="polite">{updating ? '正在检索…' : activeFilterCount ? `已选 ${activeFilterCount} 项筛选 · 按搜索应用` : '中英文均可检索 · 精确匹配优先'}</span>
        {(query || activeFilterCount > 0) && <button type="button" onClick={onReset}>重置筛选</button>}
      </div></>}
    </form>
    {!hasResults && <div className="mycoSearchSuggestions"><span>试试搜索</span>{['肺癌', '免疫治疗'].map(item => <button key={item} onClick={() => onQueryChange(item)}>{item}<span aria-hidden="true">↗</span></button>)}</div>}
    {!hasResults && <p className="mycoSearchCatalog">{reports.length} 场会议内容，等你发现。<button onClick={onBrowseAll}>浏览全部报告 →</button></p>}
    {filtersOpen && <div className="mycoFilterOverlay" onClick={event => { if (event.target === event.currentTarget) setFiltersOpen(false); }}>
      <div className="mycoFilterDialog" role="dialog" aria-modal="true" aria-labelledby="myco-filter-title">
        <form onSubmit={event => { event.preventDefault(); onSearch(); setFiltersOpen(false); }}>
          <header><h2 id="myco-filter-title">筛选收藏</h2><button type="button" onClick={() => setFiltersOpen(false)} aria-label="关闭筛选">×</button></header>
          {filters}
          <footer><button type="button" onClick={onReset}>重置筛选</button><button type="submit">搜索并应用</button></footer>
        </form>
      </div>
    </div>}
  </section>;
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


export default function Explorer({ initialPage = 'reports' }: { initialPage?: ActivePage }) {
  const [draft, setDraft] = useState(DEFAULT_SEARCH);
  const [submitted, setSubmitted] = useState<typeof DEFAULT_SEARCH | null>(null);
  const criteria = useDeferredValue(submitted ?? DEFAULT_SEARCH);
  const [sortOrder, setSortOrder] = useState<'relevance' | 'time'>('relevance');
  const [page, setPage] = useState(1);
  const [selected, setSelected] = useState<Report | null>(null);
  const [noteOptions, setNoteOptions] = useState<NotebookOpenOptions>({});
  const [libraryEntries, setLibraryEntries] = useState<LibrarySummary[]>([]);
  const noteIds = useMemo(() => new Set(libraryEntries.map(entry => entry.reportId)), [libraryEntries]);
  const recordingActive = useRef(false);
  const selectionRef = useRef<Report | null>(null);
  const navigationRequest = useRef(0);
  useEffect(() => { selectionRef.current = selected; }, [selected]);
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
  const attendanceRecords = useMemo(() => Object.values(records), [records]);
  const [checkInCard, setCheckInCard] = useState<{
    report: Report;
    record: CheckInRecord;
    isFresh: boolean;
  } | null>(null);
  const [celebratingReportId, setCelebratingReportId] = useState<number | null>(null);
  const checkInAnimationTimerRef = useRef<number | null>(null);
  const [scheduleUploadFeedback, setScheduleUploadFeedback] = useState('');
  const scheduleUploadTimerRef = useRef<number | null>(null);

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

  const showResults = initialPage === 'favorites' || submitted !== null;
  const ranked = useMemo(() => {
    if (!showResults || (initialPage !== 'reports' && initialPage !== 'favorites')) return [];
    const matches: { report: Report; score: number; kind: 'exact' | 'similar' | 'none' }[] = [];
    const hasQuery = Boolean(criteria.query.trim());
    for (const report of reports) {
      if (initialPage === 'favorites' && !favoriteSet.has(report.id)) continue;
      if (criteria.timeSlot !== DEFAULT_TIME_SLOT && TIME_SLOT_BY_REPORT_ID.get(report.id) !== criteria.timeSlot) continue;
      if (criteria.venue !== DEFAULT_VENUE && report.location !== criteria.venue) continue;
      if (criteria.unitType !== DEFAULT_UNIT_TYPE && !UNIT_TYPES_BY_REPORT_ID.get(report.id)?.includes(criteria.unitType as (typeof UNIT_TYPES)[number])) continue;
      if (criteria.field !== DEFAULT_FIELD && !CANCER_TYPES_BY_REPORT_ID.get(report.id)?.includes(criteria.field)) continue;
      const match = searchMatch(report, criteria.query);
      if (match.kind !== 'none') matches.push({ report, ...match });
    }
    matches.sort((a, b) => {
      const groupOrder = Number(a.kind === 'similar') - Number(b.kind === 'similar');
      if (groupOrder) return groupOrder;
      const sourceOrder = REPORT_ORDER_BY_ID.get(a.report.id)! - REPORT_ORDER_BY_ID.get(b.report.id)!;
      if (sortOrder === 'time') return a.report.dateTime.localeCompare(b.report.dateTime, 'zh-CN') || sourceOrder;
      return (hasQuery ? b.score - a.score : 0) || sourceOrder;
    });
    return matches;
  }, [showResults, initialPage, criteria, sortOrder, favoriteSet]);
  const filtered = ranked.map(item => item.report);
  const exactCount = ranked.reduce((count, item) => count + Number(item.kind === 'exact'), 0);

  const totalPages = Math.max(1, Math.ceil(filtered.length / PAGE_SIZE));
  const currentPage = Math.min(page, totalPages);
  const visible = filtered.slice((currentPage - 1) * PAGE_SIZE, currentPage * PAGE_SIZE);
  const visibleRanks = ranked.slice((currentPage - 1) * PAGE_SIZE, currentPage * PAGE_SIZE);
  const firstSimilarIndex = visibleRanks.findIndex(item => item.kind === 'similar');
  const updating = criteria !== (submitted ?? DEFAULT_SEARCH);
  const visibleFavoriteCount = visible.reduce(
    (count, report) => count + Number(favoriteSet.has(report.id)),
    0,
  );
  const allVisibleFavorited = visible.length > 0 && visibleFavoriteCount === visible.length;

  const resetFilters = useCallback(() => {
    setDraft(DEFAULT_SEARCH);
    setSubmitted(null);
    setPage(1);
  }, []);

  const browseReports = useCallback(() => {
    setDraft(DEFAULT_SEARCH);
    setSubmitted(DEFAULT_SEARCH);
    setPage(1);
  }, []);

  const changePage = useCallback((nextPage: number) => {
    setPage(Math.min(Math.max(nextPage, 1), totalPages));
    if (initialPage === 'reports') requestAnimationFrame(() => {
      document.getElementById('reports')?.scrollIntoView({ behavior: 'smooth', block: 'start' });
    });
  }, [initialPage, totalPages]);

  const mayLeaveNotebook = useCallback(() => {
    if (!recordingActive.current) return true;
    window.alert('录音正在进行或保存中，请先在笔记中停止并保存录音，再离开本场报告。');
    return false;
  }, []);

  const flushNotebook = useCallback(async () => {
    if (!mayLeaveNotebook()) return false;
    const promises: Promise<unknown>[] = [];
    window.dispatchEvent(new CustomEvent('csco:flush-notebook', { detail: { promises } }));
    try { await Promise.all(promises); return true; }
    catch (error) {
      window.alert(error instanceof Error ? `资料尚未全部保存：${error.message}` : '资料尚未全部保存，请保留当前页面并重试。');
      return false;
    }
  }, [mayLeaveNotebook]);

  const openReport = useCallback(async (report: Report, options: NotebookOpenOptions = {}) => {
    const request = ++navigationRequest.current;
    if (selectionRef.current && selectionRef.current.id !== report.id && !await flushNotebook()) return;
    if (request !== navigationRequest.current) return;
    setNoteOptions(options);
    setSelected(report);
    const nextHash = notebookHash(report.id, options);
    if (location.hash !== nextHash) history.pushState({ ...history.state, reportId: report.id }, '', nextHash);
  }, [flushNotebook]);

  const closeReport = useCallback(async () => {
    const request = ++navigationRequest.current;
    if (!await flushNotebook() || request !== navigationRequest.current) return;
    setSelected(null);
    if (location.hash.startsWith('#report-')) {
      history.replaceState(history.state, '', location.pathname + location.search);
    }
  }, [flushNotebook]);

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

  const openReportFromMap = useCallback(async (report: Report) => {
    if (!await flushNotebook()) return;
    const url = new URL(location.href);
    url.searchParams.delete('venueReport');
    url.hash = `report-${report.id}`;
    history.replaceState({ reportId: report.id }, '', url.pathname + url.search + url.hash);
    setMapReport(undefined);
    setNoteOptions({});
    setSelected(report);
  }, [flushNotebook]);

  useEffect(() => {
    let cancelled = false;
    const loadLibrary = () => {
      void readLibrarySummaries().then(entries => { if (!cancelled) setLibraryEntries(entries); })
        .catch(() => { /* Library page provides explicit recovery UI; navigation remains usable. */ });
    };
    const libraryChanged = (event: Event) => {
      if ((event as CustomEvent).detail?.kind !== 'reading') loadLibrary();
    };
    const notebookRequested = (event: Event) => {
      const detail = (event as CustomEvent<{reportId:number;options:NotebookOpenOptions}>).detail;
      const report = REPORT_BY_ID.get(detail?.reportId);
      if (report) openReport(report, detail.options);
    };
    const recordingChanged = (event: Event) => { recordingActive.current = !!(event as CustomEvent).detail?.active; };
    let replayingNavigation = false;
    const guardNavigation = (event: MouseEvent) => {
      const anchor = (event.target as Element)?.closest?.<HTMLAnchorElement>('a[href]');
      if (!anchor || replayingNavigation || !selectionRef.current || anchor.target === '_blank' || anchor.hasAttribute('download')) return;
      const href = anchor.getAttribute('href') || '';
      if (href.startsWith('#csco-slide=')) return;
      event.preventDefault(); event.stopPropagation();
      void flushNotebook().then(saved => {
        if (!saved || cancelled) return;
        replayingNavigation = true;
        try { anchor.click(); } finally { replayingNavigation = false; }
      });
    };
    loadLibrary();
    window.addEventListener(LIBRARY_CHANGE_EVENT, libraryChanged);
    window.addEventListener(NOTEBOOK_OPEN_EVENT, notebookRequested);
    window.addEventListener('csco:recording-state', recordingChanged);
    document.addEventListener('click', guardNavigation, true);
    return () => {
      cancelled = true;
      window.removeEventListener(LIBRARY_CHANGE_EVENT, libraryChanged);
      window.removeEventListener(NOTEBOOK_OPEN_EVENT, notebookRequested);
      window.removeEventListener('csco:recording-state', recordingChanged);
      document.removeEventListener('click', guardNavigation, true);
    };
  }, [openReport, flushNotebook]);

  useEffect(() => {
    const syncSelectionFromHash = async () => {
      const hash = location.hash;
      const id = Number(hash.match(/report-(\d+)/)?.[1]);
      if (selectionRef.current && id !== selectionRef.current.id && !await flushNotebook()) {
        history.pushState(history.state, '', notebookHash(selectionRef.current.id));
        return;
      }
      if (hash !== location.hash) return;
      setNoteOptions(notebookOptions(location.hash));
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
  }, [flushNotebook]);

  const searchPanel = <SearchPanel
    {...draft}
    compact={initialPage === 'favorites'}
    hasResults={showResults}
    updating={updating}
    onQueryChange={query => setDraft(value => ({ ...value, query }))}
    onTimeSlotChange={timeSlot => setDraft(value => ({ ...value, timeSlot }))}
    onVenueChange={venue => setDraft(value => ({ ...value, venue }))}
    onUnitTypeChange={unitType => setDraft(value => ({ ...value, unitType }))}
    onFieldChange={field => setDraft(value => ({ ...value, field }))}
    onReset={resetFilters}
    onSearch={() => { setSubmitted(draft); setPage(1); }}
    onBrowseAll={browseReports}
  />;

  return (
    <MycoShell activePage={initialPage} fitViewport={initialPage === 'favorites' || initialPage === 'schedule'} favoriteCount={favoriteReports.length} scheduleCount={scheduledReports.length} libraryCount={libraryEntries.length} attendanceCount={attendanceRecords.length}
      onMap={() => openVenueMap()}
      onExport={() => setExportRequest({ reports: initialPage === 'schedule' ? [...scheduledReports] : initialPage === 'library' || initialPage === 'atlas' ? (initialPage === 'library' ? libraryEntries : attendanceRecords).flatMap(entry => { const report = REPORT_BY_ID.get(entry.reportId); return report ? [report] : []; }) : [...favoriteReports], clearFavoritesAfterExport: false })}>
    <main id="top" className={initialPage === 'schedule' ? 'schedulePage' : initialPage === 'favorites' ? 'favoritesPage' : initialPage === 'library' ? 'libraryPage' : initialPage === 'atlas' ? 'atlasPage' : 'reportsPage'}>
      {initialPage === 'favorites' && <FavoriteCollection
        search={searchPanel}
        items={visibleRanks}
        total={filtered.length}
        exactCount={exactCount}
        hasQuery={Boolean(criteria.query.trim())}
        favoriteCount={favoriteReports.length}
        page={currentPage}
        totalPages={totalPages}
        scheduleSet={scheduleSet}
        sortOrder={sortOrder}
        scheduleUploadFeedback={scheduleUploadFeedback}
        onPageChange={changePage}
        onSortChange={order => { setSortOrder(order); setPage(1); }}
        onOpen={openReport}
        onToggleFavorite={toggleFavorite}
        onToggleSchedule={toggleScheduledReport}
        onRemovePage={() => setReportsFavorite(visible, false)}
        onAddAllToSchedule={uploadFavoritesToSchedule}
        onExport={() => setExportRequest({ reports: [...favoriteReports], clearFavoritesAfterExport: false })}
        onReset={resetFilters}
      />}
      {initialPage === 'reports' && <>
      {searchPanel}

      {showResults && <>
      <div className="collectionToolbar">
        <p className="mycoResultCount" role="status">{criteria.query.trim() ? <>精确匹配 <b>{exactCount}</b><span>相似选项 <b>{filtered.length - exactCount}</b></span></> : <>共 <b>{filtered.length}</b> 场会议内容</>}</p>
        <label className="sortSelect">排序<select aria-label="报告排序" value={sortOrder} onChange={event => { setSortOrder(event.target.value as 'relevance' | 'time'); setPage(1); }}><option value="relevance">相关优先</option><option value="time">会议时间</option></select></label>
      </div>

      <section className="reportSection" id="reports" aria-busy={updating}>
        <div className="sectionHeading">
          <div><h2>检索结果</h2></div>
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
              <Fragment key={report.id}>
              {index === firstSimilarIndex && <div className="mycoSimilarDivider" role="separator" aria-label="相似选项"><div><h3>相似选项</h3><span>{filtered.length - exactCount} 场</span></div><p>{exactCount === 0 ? '没有精确匹配。以下为相近内容或相关词匹配，请核对报告人及题目。' : '以下为相近内容或相关词匹配，与输入不完全一致。'}</p></div>}
              <ReportCard
                report={report}
                order={index}
                onOpen={openReport}
                favorite={favoriteSet.has(report.id)}
                onToggleFavorite={toggleFavorite}
                scheduled={scheduleSet.has(report.id)}
                onToggleSchedule={toggleScheduledReport}
              />
              </Fragment>
            ))}
          </div>
        ) : (
          <div className="emptyState">
            <b>没有找到符合条件的会议内容</b>
            <p>试试其他关键词，或减少筛选条件。</p>
            <button onClick={browseReports}>清除筛选并浏览全部报告</button>
          </div>
        )}
        {totalPages > 1 && (
          <Pagination page={currentPage} totalPages={totalPages} onChange={changePage} />
        )}
      </section>
      </>}
      </>}

      {initialPage === 'library' && <Suspense fallback={<p className="moduleLoading" role="status">正在打开个人图书馆…</p>}><PersonalLibrary onOpen={openReport} /></Suspense>}
      {initialPage === 'atlas' && <Suspense fallback={<p className="moduleLoading" role="status">正在展开听会旅程…</p>}><CheckInAtlas records={attendanceRecords} onOpen={openReport} /></Suspense>}
      {initialPage === 'schedule' && (
        <MySchedule
          scheduledReports={scheduledReports}
          attendedIds={attendedIds}
          celebratingReportId={celebratingReportId}
          onCheckIn={openCheckInCard}
          onOpen={openReport}
          onLocate={openVenueMap}
          onRemove={removeScheduledReport}
          onClear={clearCustomSchedule}
          onExportNotes={() => setExportRequest({reports:[...scheduledReports],initialMode:'notes',clearFavoritesAfterExport:false})}
          onExportSchedule={() => setExportRequest({reports:[...scheduledReports],initialMode:'schedule',clearFavoritesAfterExport:false})}
          noteIds={noteIds}
        />
      )}
      {initialPage !== 'favorites' && initialPage !== 'schedule' && <footer className="siteFooter">
        <BrandLockup />
        <p>本工具用于会议预习与提问准备，不构成医疗建议。日程信息以《CSCO会议日程_五轮复核版》为准；表中未注明的时间、讲者或单位不作推定。</p>
        <Link href="#top">回到顶部 ↑</Link>
      </footer>}

      {selected && (
        <DetailView
          key={selected.id}
          report={selected}
          onLocate={openVenueMap}
          onClose={closeReport}
          favorite={favoriteSet.has(selected.id)}
          onToggleFavorite={toggleFavorite}
          scheduled={scheduleSet.has(selected.id)}
          onToggleSchedule={toggleScheduledReport}
          options={noteOptions}
          returnLabel={initialPage === 'library' ? '返回图书馆' : initialPage === 'schedule' ? '返回日程' : initialPage === 'favorites' ? '返回收藏' : initialPage === 'atlas' ? '返回打卡图鉴' : '返回检索'}
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
      </Suspense>
    </main>
    </MycoShell>
  );
}
