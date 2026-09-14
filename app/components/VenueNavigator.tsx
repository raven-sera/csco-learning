'use client';

import { useCallback, useDeferredValue, useLayoutEffect, useMemo, useRef, useState } from 'react';
import { useDialog } from '../lib/useDialog';
import { reports, sortReportsByDateTime, type Report } from '../lib/reports';
import { nextScheduledReport, reportInterval } from '../lib/scheduleTools';
import { getVenueById, resolveVenue, venues, type Venue } from '../lib/venueLocations';
import VenueMap from './VenueMap';

const dayOf = (report: Report) => report.dateTime.match(/^\d{4}-\d{2}-\d{2}/)?.[0] ?? '';
const DAYS = Array.from(new Set(reports.map(dayOf).filter(Boolean))).sort();
const REPORT_VENUES = new Map(reports.map(report => [report.id, resolveVenue(report.location)]));
const REPORT_BY_ID = new Map(reports.map(report => [report.id, report]));
const VENUE_REPORTS = new Map<string, Report[]>();
for (const report of sortReportsByDateTime(reports)) {
  const venue = REPORT_VENUES.get(report.id);
  if (!venue) continue;
  const entries = VENUE_REPORTS.get(venue.id) ?? [];
  entries.push(report);
  VENUE_REPORTS.set(venue.id, entries);
}
const mappable = (venue: Venue | null | undefined) => Boolean(venue?.regionIds.length);
const venueStatus = (venue: Venue) => venue.status === 'combined' ? '组合区域' : venue.status === 'unlocated' ? '位置待核' : venue.status === 'uncovered' ? '暂无室内图' : `${venue.floor}F`;
const referenceOptions = venues.filter(mappable);

function referenceDescription(target: Venue | undefined, reference: Venue | undefined) {
  if (!target) return '目的地尚未对应地图';
  if (!reference) {
    if (target.building !== '山东大厦') return '跨场馆 · 目的地暂无室内图';
    return target.floor === 1 ? '入口与目标位于一层' : '从一层入口前往，需要换层';
  }
  if (target.building !== reference.building) return '需要跨场馆';
  if (target.regionIds.some(id => reference.regionIds.includes(id)) || target.id === reference.id) return '同一会场或图面区域';
  return target.floor === reference.floor ? '同层位置对照' : '需要换层';
}

export type VenueNavigatorProps = {
  scheduledReports: Report[];
  initialReport?: Report | null;
  onToggleSchedule: (report: Report) => void;
  onOpenReport: (report: Report) => void;
  onClose: () => void;
};

export default function VenueNavigator({ scheduledReports, initialReport, onToggleSchedule, onOpenReport, onClose }: VenueNavigatorProps) {
  const [initial] = useState(() => initialReport ?? nextScheduledReport(scheduledReports, Date.now()) ?? scheduledReports[0] ?? null);
  const [day, setDay] = useState(() => initial ? dayOf(initial) || DAYS[0] : DAYS[0]);
  const [selectedVenueId, setSelectedVenueId] = useState<string | null>(() => initial ? REPORT_VENUES.get(initial.id)?.id ?? null : 'sd-f1-shandong');
  const [focusedReportId, setFocusedReportId] = useState<number | null>(initial?.id ?? null);
  const [unknownLocation, setUnknownLocation] = useState(() => initial && !REPORT_VENUES.get(initial.id) ? initial.location : '');
  const [floor, setFloor] = useState<1 | 2 | 'all'>(() => REPORT_VENUES.get(initial?.id ?? -1)?.floor === 2 ? 2 : 1);
  const [sidebarTab, setSidebarTab] = useState<'agenda' | 'venues'>('agenda');
  const [mobilePane, setMobilePane] = useState<'map' | 'agenda' | 'venues'>('map');
  const [query, setQuery] = useState('');
  const deferredQuery = useDeferredValue(query);
  const [referenceId, setReferenceId] = useState('entrance');
  const [venueScope, setVenueScope] = useState<'all' | 'mine'>('all');
  const [agendaLimit, setAgendaLimit] = useState(40);
  const [venueLimit, setVenueLimit] = useState(20);
  useDialog('.venueNavigatorOverlay', onClose);
  const mapColumn = useRef<HTMLDivElement>(null);
  const meetingList = useRef<HTMLElement>(null);
  useLayoutEffect(() => {
    if (mobilePane === 'map') mapColumn.current?.scrollTo({ top:0, behavior:'instant' });
  }, [mobilePane, selectedVenueId, focusedReportId]);

  const scheduleSet = useMemo(() => new Set(scheduledReports.map(report => report.id)), [scheduledReports]);
  const daySchedule = useMemo(() => scheduledReports.filter(report => dayOf(report) === day), [scheduledReports, day]);
  const selectedVenue = selectedVenueId ? getVenueById(selectedVenueId) : undefined;
  const focusedReport = focusedReportId === null ? null : REPORT_BY_ID.get(focusedReportId) ?? null;
  const previousReport = useMemo(() => {
    const interval = focusedReport && reportInterval(focusedReport);
    if (!interval) return null;
    let previous: Report | null = null;
    let latestEnd = -Infinity;
    for (const report of daySchedule) {
      const candidate = reportInterval(report);
      if (report.id !== focusedReport.id && candidate && candidate.end <= interval.start && candidate.end > latestEnd) {
        previous = report;
        latestEnd = candidate.end;
      }
    }
    return previous;
  }, [daySchedule, focusedReport]);
  const referenceVenue = referenceId === 'previous'
    ? (previousReport ? REPORT_VENUES.get(previousReport.id) ?? undefined : undefined)
    : referenceId === 'entrance' ? undefined : getVenueById(referenceId);
  const referenceUnavailable = referenceId === 'previous' && !mappable(referenceVenue);
  const scheduledRegions = useMemo(() => Array.from(new Set(daySchedule.flatMap(report => REPORT_VENUES.get(report.id)?.regionIds ?? []))), [daySchedule]);
  const scheduledVenueCounts = useMemo(() => {
    const counts = new Map<string, number>();
    for (const report of daySchedule) {
      const id = REPORT_VENUES.get(report.id)?.id;
      if (id) counts.set(id, (counts.get(id) ?? 0) + 1);
    }
    return counts;
  }, [daySchedule]);
  const filteredVenues = useMemo(() => {
    const text = deferredQuery.trim().toLocaleLowerCase();
    return venues.filter(venue => !text || `${venue.name} ${venue.building} ${venue.floor}F`.toLocaleLowerCase().includes(text));
  }, [deferredQuery]);
  const venueReports = useMemo(() => (selectedVenueId ? VENUE_REPORTS.get(selectedVenueId) ?? [] : []).filter(report => dayOf(report) === day && (venueScope === 'all' || scheduleSet.has(report.id))), [selectedVenueId, day, venueScope, scheduleSet]);

  function selectReport(report: Report) {
    const venue = REPORT_VENUES.get(report.id);
    setFocusedReportId(report.id);
    setSelectedVenueId(venue?.id ?? null);
    setUnknownLocation(venue ? '' : report.location);
    setDay(dayOf(report) || day);
    if (venue?.floor === 1 || venue?.floor === 2) setFloor(venue.floor);
    setVenueLimit(20);
    setMobilePane('map');
    mapColumn.current?.scrollTo({ top:0, behavior:'instant' });
  }
  const selectVenue = useCallback((venue: Venue) => {
    setSelectedVenueId(venue.id);
    setFocusedReportId(null);
    setUnknownLocation('');
    if (venue.floor === 1 || venue.floor === 2) setFloor(venue.floor);
    setVenueLimit(20);
    setMobilePane('map');
    mapColumn.current?.scrollTo({ top:0, behavior:'instant' });
    setReferenceId(current => current === 'previous' ? 'entrance' : current);
  }, []);
  const selectRegion = useCallback((regionId: string) => {
    const candidates = venues.filter(venue => venue.regionIds.includes(regionId));
    const venue = candidates.find(item => item.status === 'combined' && VENUE_REPORTS.has(item.id)) ?? candidates[0];
    if (venue) selectVenue(venue);
  }, [selectVenue]);
  function changeFloor(next: 1 | 2 | 'all') {
    setFloor(next);
    if (next === 'all' || selectedVenue?.floor === next) return;
    const venue = venues.find(item => item.floor === next && mappable(item) && scheduledVenueCounts.has(item.id)) ?? venues.find(item => item.floor === next && mappable(item));
    if (venue) selectVenue(venue);
  }
  function changeDay(next: string) {
    setDay(next);
    setFocusedReportId(null);
    setAgendaLimit(40);
    setVenueLimit(20);
    if (referenceId === 'previous') setReferenceId('entrance');
  }
  function showMeetings() {
    const column = mapColumn.current, list = meetingList.current;
    if (!column || !list) return;
    const headingHeight = column.querySelector('.venueSelectedHeading')?.getBoundingClientRect().height ?? 0;
    column.scrollTo({
      top:column.scrollTop + list.getBoundingClientRect().top - column.getBoundingClientRect().top - headingHeight - 10,
      behavior:matchMedia('(prefers-reduced-motion: reduce)').matches ? 'instant' : 'smooth',
    });
  }
  const selectedRegions = selectedVenue?.regionIds ?? [];
  const referenceRegions = referenceVenue?.regionIds ?? [];
  const caption = selectedVenue ? `${selectedVenue.building} · ${selectedVenue.floor ? `${selectedVenue.floor}层` : '楼层待核'}` : unknownLocation || '请从日程或会场列表选择';
  const title = selectedVenue?.name || (unknownLocation ? '地图位置待核' : '选择一个会场');
  const showMap = mappable(selectedVenue);

  return (
    <section className="venueNavigatorOverlay" role="dialog" aria-modal="true" aria-label="日程与会场地图">
      <div className="venueNavigator" data-mobile-pane={mobilePane}>
        <header className="venueNavigatorHeader">
          <div><span className="venueEyebrow">SCHEDULE × VENUE</span><h2>日程与会场地图</h2><p>静态位置导览 · 山东大厦一、二层 · 非实时导航</p><p className="venueCoverageNotice">技术原因，南郊宾馆（南郊俱乐部）的地图未纳入。</p></div>
          <button type="button" className="venueClose" onClick={onClose} aria-label="关闭地图并返回原位置">返回 <span aria-hidden>×</span></button>
        </header>
        <div className="venueNavigatorToolbar">
          <div className="venueDateTabs" role="group" aria-label="地图日程日期">{DAYS.map(date => <button key={date} type="button" aria-pressed={day === date} onClick={() => changeDay(date)}>{date.slice(5).replace('-', '.')}<small>{scheduledReports.filter(report => dayOf(report) === date).length} 场</small></button>)}</div>
          <span className="venueDayCount">当天已安排 <b>{daySchedule.length}</b> 场 · 涉及 <b>{scheduledVenueCounts.size}</b> 个会场</span>
        </div>
        <div className="venueMobileTabs" role="group" aria-label="地图面板内容">{([{id:'map',label:'会场地图'},{id:'agenda',label:'当天日程'},{id:'venues',label:'找会场'}] as const).map(tab => <button key={tab.id} type="button" aria-pressed={mobilePane === tab.id} onClick={() => { setMobilePane(tab.id); if (tab.id !== 'map') setSidebarTab(tab.id); }}>{tab.label}</button>)}</div>
        <div className="venueNavigatorBody">
          <aside className="venueNavigatorSidebar" aria-label="日程与会场选择">
            <div className="venueSidebarTabs" role="group" aria-label="地图侧栏内容"><button type="button" aria-pressed={sidebarTab === 'agenda'} onClick={() => setSidebarTab('agenda')}>当天日程 <b>{daySchedule.length}</b></button><button type="button" aria-pressed={sidebarTab === 'venues'} onClick={() => setSidebarTab('venues')}>找会场</button></div>
            {sidebarTab === 'venues' && <label className="venueSearch"><span>搜索会场</span><input type="search" value={query} onChange={event => setQuery(event.target.value)} placeholder="如：山东会堂、南郊宾馆" /></label>}
            <div className="venueSidebarList">
              {sidebarTab === 'agenda' ? daySchedule.length ? <>
                {daySchedule.slice(0, agendaLimit).map((report, index) => {
                  const venue = REPORT_VENUES.get(report.id);
                  const previous = daySchedule[index - 1];
                  const before = previous && REPORT_VENUES.get(previous.id);
                  const interval = reportInterval(report), beforeInterval = previous && reportInterval(previous);
                  const transition = previous && interval && beforeInterval && beforeInterval.end > interval.start ? '与上一条日程时间重叠' : previous && venue && before ? referenceDescription(venue, before) : null;
                  return <div className="venueAgendaEntry" key={report.id}>{transition && <p className="venueTransfer">{transition}</p>}<button type="button" className="venueAgendaCard" aria-pressed={focusedReportId === report.id} onClick={() => selectReport(report)}><time>{report.dateTime.replace(`${day} `, '')}</time><strong>{report.sourceTitle}</strong><span>{report.speaker}</span><small>{report.location}</small><em>{venue ? venueStatus(venue) : '位置待核'}</em></button></div>;
                })}
                {daySchedule.length > agendaLimit && <button type="button" className="venueMore" onClick={() => setAgendaLimit(limit => limit + 40)}>继续显示日程</button>}
              </> : <div className="venueEmpty"><strong>这一天还没有安排</strong><p>切换日期，或从“找会场”查看会议并加入日程。</p><button type="button" onClick={() => { setSidebarTab('venues'); setMobilePane('venues'); }}>查看会场</button></div> : <>
                {filteredVenues.map(venue => <button type="button" className="venuePlaceCard" key={venue.id} aria-pressed={selectedVenueId === venue.id} onClick={() => selectVenue(venue)}><span><strong>{venue.name}</strong><small>{venue.building} · {venue.floor ? `${venue.floor}层` : '楼层待核'}</small></span><em>{scheduledVenueCounts.has(venue.id) ? `已排 ${scheduledVenueCounts.get(venue.id)} 场` : venueStatus(venue)}</em></button>)}
                {!filteredVenues.length && <div className="venueEmpty"><strong>没有匹配的会场</strong><p>请尝试更短的名称或场馆名。</p></div>}
              </>}
            </div>
          </aside>
          <div className="venueMapColumn" ref={mapColumn}>
              <div className="venueSelectedHeading"><div aria-live="polite"><small>{caption}</small><h3>{title}</h3></div>{selectedVenue && selectedVenue.status !== 'mapped' && <span className={`venueStatus is-${selectedVenue.status}`}>{venueStatus(selectedVenue)}</span>}{selectedVenue && <button className="venueMeetingJump" type="button" onClick={showMeetings}>本会场会议 ↓</button>}</div>
              {showMap && selectedVenue?.note && <details className="venueNotice" key={selectedVenue.id}><summary>{selectedVenue.status === 'combined' ? '组合区域 · 分隔及门位待核' : '图纸说明 · 以现场指引为准'}</summary><p>{selectedVenue.note}</p></details>}
            <div className="venueMapStage">
              {showMap ? <VenueMap floor={floor} onFloorChange={changeFloor} selectedRegionIds={selectedRegions} scheduledRegionIds={scheduledRegions} referenceRegionIds={referenceRegions} onSelectRegion={selectRegion} /> : <div className="venueUnmapped"><span className="venueUnmappedIcon" aria-hidden>⌖</span><strong>{selectedVenue?.status === 'uncovered' ? '该场馆暂无室内地图' : '这个会场的位置需要核对'}</strong><p>{caption}</p><p>{selectedVenue?.note || '当前两张图纸无法确认此地点。不会将它匹配到名称相似的其他会场。'}</p><small>会议详情、日程安排、笔记及打卡仍可正常使用。</small><button type="button" onClick={() => { setSidebarTab('venues'); setMobilePane('venues'); }}>查找其他会场</button></div>}
            </div>
            <div className="venueInformation">
              {focusedReport && <article className="venueFocusedReport"><div><time>{focusedReport.dateTime}</time><strong>{focusedReport.sourceTitle}</strong><span>{focusedReport.speaker} · {focusedReport.location}</span></div><div className="venueReportActions"><button type="button" onClick={() => onOpenReport(focusedReport)}>查看报告</button><button type="button" aria-pressed={scheduleSet.has(focusedReport.id)} onClick={() => onToggleSchedule(focusedReport)}>{scheduleSet.has(focusedReport.id) ? '已加入日程 · 移出' : '加入我的日程'}</button></div></article>}
              {showMap && <div className="venueReference"><label>参照位置<select value={referenceId} onChange={event => setReferenceId(event.target.value)}><option value="entrance">会议中心入口 · 1F</option><option value="previous" disabled={!previousReport}>{previousReport ? `上一场会场 · ${REPORT_VENUES.get(previousReport.id)?.name || previousReport.location}` : '上一场会场 · 暂无可参照日程'}</option>{referenceOptions.map(venue => <option key={venue.id} value={venue.id}>{venue.floor}F · {venue.name}</option>)}</select></label><p>{referenceUnavailable ? `${referenceVenue && referenceVenue.building !== selectedVenue?.building ? '需要跨场馆 · ' : ''}上一场无可标注位置，不显示参照标记` : referenceDescription(selectedVenue, referenceVenue)}<small>仅作位置对照，不代表你现在所在的位置</small></p></div>}
              {selectedVenue && <section className="venueDayReports" aria-label="所选会场当天的会议" ref={meetingList}><header><h4>本会场 · {day.slice(5).replace('-', '.')}</h4><div role="group" aria-label="会场会议范围"><button type="button" aria-pressed={venueScope === 'all'} onClick={() => { setVenueScope('all'); setVenueLimit(20); }}>全部会议</button><button type="button" aria-pressed={venueScope === 'mine'} onClick={() => { setVenueScope('mine'); setVenueLimit(20); }}>我的日程</button></div><span>{venueReports.length} 场</span></header><div className="venueDayReportsList">
                {venueReports.slice(0, venueLimit).map(report => <article className="venueDayReport" key={report.id}><button type="button" className="venueDayReportOpen" onClick={() => onOpenReport(report)}><time>{report.dateTime.replace(`${day} `, '')}</time><strong>{report.sourceTitle}</strong><small>{report.speaker}</small></button><button className="venueJoin" type="button" aria-pressed={scheduleSet.has(report.id)} aria-label={`${scheduleSet.has(report.id) ? '从日程移除' : '加入日程'}：${report.sourceTitle}`} onClick={() => onToggleSchedule(report)}>{scheduleSet.has(report.id) ? '已加入 · 移出' : '＋ 加入'}</button></article>)}
                {!venueReports.length && <p className="venueNoReports">{venueScope === 'mine' ? '当天尚未安排这个会场的会议，可切换“全部会议”查看。' : '当前会议数据未列出这个会场当天的会议；会场位置仍可查看。'}</p>}
                {venueReports.length > venueLimit && <button className="venueMore" type="button" onClick={() => setVenueLimit(limit => limit + 20)}>继续显示会议</button>}
              </div></section>}
            </div>
          </div>
        </div>
        <p className="venueNavigatorFootnote">依据原始图纸整理 · 非测绘模型 · 门位及通行关系请以现场标识为准 · 不提供实时定位或步行路线</p>
      </div>
    </section>
  );
}
