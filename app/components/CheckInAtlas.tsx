'use client';

import Link from 'next/link';
import { useId, useMemo, useState } from 'react';
import { CHECK_IN_PHRASES, type CheckInRecord } from '../lib/checkIn';
import { buildAttendanceAtlas, type AttendanceVenue, type AttendanceLeg } from '../lib/attendanceAtlas';
import { reports, type Report } from '../lib/reports';
import { mapGeometry, projectMapPoint, type MapPoint, type MapPolygon } from '../lib/venueGeometry';
import './check-in-atlas.css';

type FloorView = 'all' | '1' | '2';
type Point = readonly [number, number];
const FLOORS = [1, 2] as const;

function polygonCenter(points: readonly Point[]): Point {
  let area = 0, x = 0, y = 0;
  for (let i = 0; i < points.length; i++) {
    const a = points[i], b = points[(i + 1) % points.length];
    const cross = a[0] * b[1] - b[0] * a[1];
    area += cross; x += (a[0] + b[0]) * cross; y += (a[1] + b[1]) * cross;
  }
  return area ? [x / (3 * area), y / (3 * area)] : points[0];
}

function layoutFloor(floor: 1 | 2, overview: boolean) {
  const source = mapGeometry.floors[String(floor) as '1' | '2'];
  const rooms = mapGeometry.rooms.filter(room => room.floor === floor);
  const projected = [...source.outline, ...rooms.flatMap(room => room.polygon)].map(point => projectMapPoint(floor, point));
  const minX = Math.min(...projected.map(point => point[0])), maxX = Math.max(...projected.map(point => point[0]));
  const minY = Math.min(...projected.map(point => point[1])), maxY = Math.max(...projected.map(point => point[1]));
  const width = overview ? 424 : 840, height = overview ? 290 : 330;
  const scale = Math.min(width / (maxX - minX), height / (maxY - minY));
  const left = (overview ? (floor === 1 ? 38 : 538) : 80) + (width - (maxX - minX) * scale) / 2;
  const top = 108 + (height - (maxY - minY) * scale) / 2;
  const project = (point: MapPoint): Point => {
    const [x, y] = projectMapPoint(floor, point);
    return [left + (x - minX) * scale, top + (y - minY) * scale];
  };
  const path = (polygon: MapPolygon) => polygon.map((point, index) => `${index ? 'L' : 'M'}${project(point).join(',')}`).join(' ') + ' Z';
  return {
    floor, outline: [source.outline, ...source.voids].map(path).join(' '),
    rooms: rooms.map(room => {
      const points = room.polygon.map(project);
      return { id: room.id, name: room.name, path: path(room.polygon), center: polygonCenter(points) };
    }),
  };
}

// The same hand-traced geometry as the venue navigator; floors stay in separate frames.
const MAP_LAYOUTS = {
  all: FLOORS.map(floor => layoutFloor(floor, true)),
  '1': [layoutFloor(1, false)],
  '2': [layoutFloor(2, false)],
};

function venuePoint(venue: AttendanceVenue, rooms: ReadonlyMap<string, { center: Point }>): Point | null {
  const points = venue.regionIds.map(id => rooms.get(id)?.center).filter((point): point is Point => !!point);
  if (!points.length) return null;
  return [points.reduce((sum, point) => sum + point[0], 0) / points.length, points.reduce((sum, point) => sum + point[1], 0) / points.length];
}

function FlightMap({ venues, legs, selected, onSelect }: {
  venues: AttendanceVenue[]; legs: AttendanceLeg[];
  selected: string; onSelect: (id: string) => void;
}) {
  const id = useId().replace(/:/g, '');
  const [floor, setFloor] = useState<FloorView>('all');
  const [zoom, setZoom] = useState(1);
  const layout = MAP_LAYOUTS[floor];
  const rooms = useMemo(() => new Map(layout.flatMap(item => item.rooms).map(room => [room.id, room])), [layout]);
  const nodes = useMemo(() => venues.flatMap(venue => {
    const point = venuePoint(venue, rooms);
    return point ? [{ venue, point }] : [];
  }), [venues, rooms]);
  const points = new Map(nodes.map(node => [node.venue.id, node.point]));
  const visitedRegions = new Set(venues.flatMap(venue => venue.regionIds));
  const selectedRegions = venues.find(venue => venue.id === selected)?.regionIds ?? [];
  return <section className="attendanceMapPanel" aria-labelledby="attendance-map-title">
    <header className="attendanceMapHeader"><div><span>MY CONFERENCE FLIGHTS</span><h2 id="attendance-map-title">我的听会航线</h2></div><div className="attendanceFloorSwitch" role="group" aria-label="图鉴地图楼层">{([{id:'all',label:'双层总览'},{id:'1',label:'一层'},{id:'2',label:'二层'}] as const).map(item => <button key={item.id} aria-pressed={floor === item.id} onClick={() => { setFloor(item.id); setZoom(1); }}>{item.label}</button>)}</div></header>
    <div className="attendanceMapViewport" tabIndex={0} aria-label="会场打卡分布，可滚动查看放大的地图">
      <svg className="attendanceFlightMap" viewBox="0 0 1000 470" style={{ width: `${zoom * 100}%`, minWidth: `${zoom * 760}px` }} aria-label="山东大厦一、二层会场地图；弧线表示打卡先后，不是实际导航路线">
        <defs>
          <pattern id={`${id}-grid`} width="25" height="25" patternUnits="userSpaceOnUse"><circle cx="1" cy="1" r=".8" fill="#657ca5" opacity=".25" /></pattern>
          <linearGradient id={`${id}-route`} x1="0" y1="0" x2="1" y2="1"><stop stopColor="#81deeb"/><stop offset="1" stopColor="#bba5fa"/></linearGradient>
          <marker id={`${id}-arrow`} viewBox="0 0 12 12" markerWidth="9" markerHeight="9" refX="10" refY="6" orient="auto"><path d="M1 2 11 6 1 10 4 6Z" fill="#a4d9f2" /></marker>
        </defs>
        <rect width="1000" height="470" fill={`url(#${id}-grid)`} />
        {layout.map(item => <g key={item.floor} className="attendanceFloorPlan">
          <text x={floor === 'all' ? item.floor === 1 ? 40 : 540 : 45} y="57" className="attendanceFloorTitle">{item.floor}F <tspan>山东大厦 · {item.floor === 1 ? '一层' : '二层'}</tspan></text>
          <path d={item.outline} fillRule="evenodd" className="attendanceFloorOutline" />
          {item.rooms.map(room => <path key={room.id} d={room.path} className={`attendanceRoom ${visitedRegions.has(room.id) ? 'isVisited' : ''} ${selectedRegions.includes(room.id) ? 'isSelected' : ''}`}><title>{room.name}</title></path>)}
        </g>)}
        {floor === 'all' && <path d="M500 82V430" className="attendanceFloorSeparation" />}
        <g className="attendanceFlightRoutes">{legs.map(leg => {
          const a = points.get(leg.from), b = points.get(leg.to);
          if (!a || !b || a[0] === b[0] && a[1] === b[1]) return null;
          const dx = b[0] - a[0], dy = b[1] - a[1], length = Math.hypot(dx, dy);
          const bend = Math.min(length * .3, 110);
          const cx = Math.max(18, Math.min(982, (a[0] + b[0]) / 2 - dy / length * bend));
          const cy = Math.max(80, Math.min(425, (a[1] + b[1]) / 2 + dx / length * bend));
          return <path key={`${leg.from}:${leg.to}`} d={`M${a.join(',')} Q${cx},${cy} ${b.join(',')}`} stroke={`url(#${id}-route)`} strokeWidth={Math.min(2 + leg.count, 6)} markerEnd={`url(#${id}-arrow)`} className={selected && selected !== leg.from && selected !== leg.to ? 'isDimmed' : ''}><title>{venues.find(venue => venue.id === leg.from)?.name} → {venues.find(venue => venue.id === leg.to)?.name} · {leg.count} 次转场记录</title></path>;
        })}</g>
        {nodes.map(({ venue, point }) => <g key={venue.id} transform={`translate(${point.join(',')})`} className={`attendanceMapNode ${selected === venue.id ? 'isSelected' : ''}`} role="button" tabIndex={0} aria-label={`${venue.name}，${venue.visits.length} 次打卡，查看记录`} aria-pressed={selected === venue.id} onClick={() => onSelect(venue.id)} onKeyDown={event => { if (event.key === 'Enter' || event.key === ' ') { event.preventDefault(); onSelect(venue.id); } }}>
          <title>{venue.building} {venue.name} · {venue.visits.length} 次{venue.status === 'combined' ? '（合并会场按一个场地计数）' : ''}</title>
          <circle r="25" className="attendanceNodeHit"/><circle r="18" className="attendanceNodeHalo"/><circle r="11" className="attendanceNodeCore"/><text y="4" textAnchor="middle" className="attendanceNodeCount">{venue.visits.length}</text><text y="-28" textAnchor="middle" className="attendanceNodeLabel">{venue.name}</text>
        </g>)}
        {!nodes.length && <text x="500" y="247" textAnchor="middle" className="attendanceMapEmpty">{venues.length ? '该楼层还没有已定位的打卡' : '完成第一场打卡，点亮你的听会地图'}</text>}
      </svg>
    </div>
    <footer className="attendanceMapFooter"><div><span><i/>已打卡会场</span><span><i/>打卡先后连线</span></div><div className="attendanceMapZoom"><button aria-label="缩小打卡地图" disabled={zoom <= 1} onClick={() => setZoom(value => Math.max(1, value - .5))}>−</button><button aria-label="重置打卡地图缩放" onClick={() => setZoom(1)}>{Math.round(zoom * 100)}%</button><button aria-label="放大打卡地图" disabled={zoom >= 3} onClick={() => setZoom(value => Math.min(3, value + .5))}>＋</button></div></footer>
    <p className="attendanceMapDisclaimer">可横向滑动或切换楼层查看。依据现有会场图绘制；弧线仅按打卡先后连接，不代表实际行走路线、楼层通道或飞行距离。</p>
  </section>;
}

export default function CheckInAtlas({ records, onOpen }: { records: CheckInRecord[]; onOpen: (report: Report) => void }) {
  const stats = useMemo(() => buildAttendanceAtlas(records, reports), [records]);
  const [selectedVenue, setSelectedVenue] = useState('');
  const [keyword, setKeyword] = useState('');
  const [limit, setLimit] = useState(12);
  const keywordIds = keyword ? stats.keywords.find(item => item.label === keyword)?.reportIds : undefined;
  const log = stats.visits.map((visit, index) => ({ ...visit, stop: index + 1 })).filter(visit => (!selectedVenue || visit.venueId === selectedVenue) && (!keywordIds || keywordIds.includes(visit.report.id))).reverse();
  const selected = stats.venues.find(venue => venue.id === selectedVenue);
  const chooseVenue = (id: string) => { setSelectedVenue(value => value === id ? '' : id); setLimit(12); };
  const phraseCounts = new Map<string, number>();
  for (const visit of stats.visits) phraseCounts.set(visit.record.phrase, (phraseCounts.get(visit.record.phrase) ?? 0) + 1);
  return <div className="attendanceAtlas">
    <header className="attendanceHeading"><div><span className="attendanceEyebrow">MYCO · MY CONFERENCE LOG</span><h1>打卡图鉴<span className="attendancePlane" aria-hidden="true"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.4"><path d="m21 3-7 18-3-8-8-3L21 3Zm0 0L11 13"/></svg></span></h1><p>把每一次抵达，连成自己的听会旅程。</p></div><Link href="/schedule" className="attendanceScheduleLink">去我的日程打卡 <span aria-hidden="true">↗</span></Link></header>
    <section className="attendanceStats" aria-label="我的参会统计"><div><span>总打卡次数</span><strong>{stats.total}<small>次</small></strong><p>每场报告仅计一次</p></div><div><span>到访会场</span><strong>{stats.venues.length}<small>个</small></strong><p>按会场去重统计</p></div><div><span>会议日</span><strong>{stats.days}<small>天</small></strong><p>按已打卡报告日期</p></div><div><span>听会关键词</span><strong>{stats.keywords.length}<small>个</small></strong><p>来自报告内容与标签</p></div></section>
    {!stats.total && <div className="attendanceWelcome"><strong>你的第一条航线，从一场报告开始。</strong><p>先将想听的报告加入日程，到场后点击“现场打卡”。会场、关键词和听会记录会自动汇集到这里。</p><Link href="/learning">发现想听的报告 →</Link></div>}
    <FlightMap venues={stats.venues} legs={stats.legs} selected={selectedVenue} onSelect={chooseVenue} />
    {stats.unlocatedCount > 0 && <p className="attendanceCoverage" role="status">{stats.unlocatedCount} 次打卡位于暂无地图或位置待核的会场，已计入总次数与下方会场统计，不在地图中虚构坐标。</p>}
    {stats.missingReportCount > 0 && <p className="attendanceCoverage">另有 {stats.missingReportCount} 条记录暂未关联到当前会议数据，未计入本页统计。</p>}
    <div className="attendanceInsights"><section className="attendanceVenuePanel" aria-labelledby="attendance-venues-title"><header><div><span>DESTINATIONS</span><h2 id="attendance-venues-title">到访过的会场</h2></div><b>{stats.venues.length} 个</b></header>{stats.venues.length ? <ul>{stats.venues.map((venue, index) => <li key={venue.id}><button className={selectedVenue === venue.id ? 'isSelected' : ''} aria-pressed={selectedVenue === venue.id} onClick={() => chooseVenue(venue.id)}><span className="attendanceVenueRank">{String(index + 1).padStart(2, '0')}</span><span className="attendanceVenueName"><strong>{venue.name}</strong><small>{venue.building}{venue.floor ? ` · ${venue.floor}F` : ''}{!venue.regionIds.length ? ' · 暂无定位' : venue.status === 'combined' ? ' · 合并会场' : ''}</small><i style={{width:`${venue.visits.length / stats.total * 100}%`}}/></span><b>{venue.visits.length}<small>次</small></b></button></li>)}</ul> : <p className="attendanceEmptyCopy">完成打卡后，这里会显示各个会场的参会次数。</p>}</section>
      <section className="attendanceKeywordPanel" aria-labelledby="attendance-keywords-title"><header><div><span>YOUR INTERESTS</span><h2 id="attendance-keywords-title">我的听会关键词</h2></div></header><p>从报告题目、领域与研究方向提取；同场同词只计一次。点击关键词查看对应听会记录。</p><div className="attendanceKeywordCloud">{stats.keywords.slice(0, 28).map((item, index) => <button key={item.label} aria-pressed={keyword === item.label} className={index < 3 ? 'isFrequent' : ''} onClick={() => { setKeyword(value => value === item.label ? '' : item.label); setLimit(12); }}>{item.label}<b>{item.count}</b></button>)}</div>{!stats.keywords.length && <p className="attendanceEmptyCopy">你的关注领域，会随着听会逐渐浮现。</p>}{stats.keywords.length > 28 && <details className="attendanceMoreKeywords"><summary>查看其余 {stats.keywords.length - 28} 个关键词</summary><div className="attendanceKeywordCloud">{stats.keywords.slice(28).map(item => <button key={item.label} aria-pressed={keyword === item.label} onClick={() => { setKeyword(value => value === item.label ? '' : item.label); setLimit(12); }}>{item.label}<b>{item.count}</b></button>)}</div></details>}</section>
    </div>
    <section className="attendanceLog" aria-labelledby="attendance-log-title"><header><div><span>MY ARRIVALS</span><h2 id="attendance-log-title">听会足迹</h2></div><span>{log.length} 场{selected || keyword ? '符合筛选' : '已打卡'} · 最近打卡在前</span></header>{(selected || keyword) && <div className="attendanceLogFilters">{selected && <button onClick={() => setSelectedVenue('')}>{selected.name} ×</button>}{keyword && <button onClick={() => setKeyword('')}>{keyword} ×</button>}<button onClick={() => { setSelectedVenue(''); setKeyword(''); }}>清除筛选</button></div>}
      {log.length ? <ol>{log.slice(0, limit).map(visit => <li key={visit.report.id}><span className="attendanceStop">{String(visit.stop).padStart(2, '0')}</span><button onClick={() => onOpen(visit.report)}><small>{visit.report.field} · {visit.report.dateTime}</small><h3>{visit.report.sourceTitle}</h3><p>{visit.report.speaker} · {visit.report.location}</p><time dateTime={visit.record.checkedAt}>打卡于 {new Date(visit.record.checkedAt).toLocaleString('zh-CN', {month:'numeric',day:'numeric',hour:'2-digit',minute:'2-digit'})}</time><span className="attendanceLogArrow" aria-hidden="true">↗</span></button></li>)}</ol> : <p className="attendanceEmptyCopy">{stats.total ? '没有同时符合这些条件的打卡记录，请减少筛选条件。' : '打卡之后，每场报告都会成为可回看的旅程记录。'}</p>}{log.length > limit && <button className="attendanceLoadMore" onClick={() => setLimit(value => value + 12)}>继续查看 · 还有 {log.length - limit} 场</button>}
    </section>
    <details className="attendancePhrases"><summary><span>收集的打卡语</span><b>{CHECK_IN_PHRASES.filter(phrase => phraseCounts.has(phrase)).length} / {CHECK_IN_PHRASES.length}</b></summary><div>{CHECK_IN_PHRASES.map((phrase, index) => <article key={phrase} className={phraseCounts.has(phrase) ? 'isCollected' : ''}><span>NO. {String(index + 1).padStart(2, '0')}</span><p>{phraseCounts.has(phrase) ? phrase : '尚未解锁'}</p><small>{phraseCounts.has(phrase) ? `已遇见 ${phraseCounts.get(phrase)} 次` : '继续现场打卡，收集听会寄语'}</small></article>)}</div></details>
    <p className="attendancePrivacy">记录只保存在当前浏览器。移出或清空日程不会删除已完成的打卡；重复点击同一场打卡不会增加次数。</p>
  </div>;
}
