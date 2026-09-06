'use client';

import { useEffect, useId, useRef, useState, type CSSProperties } from 'react';
import { mapGeometry, projectMapPoint, type MapGeometry } from '../lib/venueGeometry';
import { publicPath } from '../lib/sitePaths';

export type VenueMapProps = {
  floor: 1 | 2 | 'all';
  onFloorChange: (floor: 1 | 2 | 'all') => void;
  selectedRegionIds: readonly string[];
  scheduledRegionIds: readonly string[];
  referenceRegionIds?: readonly string[];
  onSelectRegion: (regionId: string) => void;
};

type Scene = {
  setFloor: (floor: VenueMapProps['floor']) => void;
  setMode: (overhead: boolean) => void;
  setSelection: (selected: readonly string[], scheduled: readonly string[], references: readonly string[]) => void;
  setActive: (active: boolean) => void;
  zoom: (factor: number) => void;
  reset: () => void;
  dispose: () => void;
};

declare global {
  interface Window {
    THREE?: unknown;
    CscoVenueScene?: new (
      container: HTMLElement,
      labels: HTMLElement,
      geometry: MapGeometry,
      project: typeof projectMapPoint,
      onSelect: (id: string) => void,
      onError: (message: string) => void,
    ) => Scene;
  }
}

const scriptRequests = new Map<string, Promise<void>>();
function loadScript(path: string, ready: () => boolean): Promise<void> {
  if (ready()) return Promise.resolve();
  const url = publicPath(path);
  const existing = scriptRequests.get(url);
  if (existing) return existing;
  const request = new Promise<void>((resolve, reject) => {
    const script = document.createElement('script');
    const settle = (error?: Error) => {
      window.clearTimeout(timer);
      script.onload = null;
      script.onerror = null;
      if (error) {
        script.remove();
        reject(error);
      } else resolve();
    };
    const timer = window.setTimeout(() => settle(new Error('本地地图资源加载超时。')), 20000);
    script.src = url;
    script.async = true;
    script.onload = () => settle(ready() ? undefined : new Error('本地地图资源未正确初始化。'));
    script.onerror = () => settle(new Error('本地地图资源加载失败。'));
    document.head.appendChild(script);
  });
  scriptRequests.set(url, request);
  void request.catch(() => {
    if (scriptRequests.get(url) === request) scriptRequests.delete(url);
  });
  return request;
}

async function loadScene() {
  await loadScript('/venue/three.min.js', () => Boolean(window.THREE));
  await loadScript('/venue/map-scene.js', () => Boolean(window.CscoVenueScene));
  if (!window.CscoVenueScene) throw new Error('立体地图未能初始化。');
  return window.CscoVenueScene;
}

const EMPTY_REGIONS: readonly string[] = [];

export default function VenueMap(props: VenueMapProps) {
  const { floor, onFloorChange, selectedRegionIds, scheduledRegionIds, referenceRegionIds = EMPTY_REGIONS, onSelectRegion } = props;
  const [mode, setMode] = useState<'3d' | 'overhead' | 'source'>('3d');
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [attempt, setAttempt] = useState(0);
  const host = useRef<HTMLDivElement>(null);
  const labels = useRef<HTMLDivElement>(null);
  const sourceScroller = useRef<HTMLDivElement>(null);
  const scene = useRef<Scene | null>(null);
  const latest = useRef(props);
  const latestMode = useRef(mode);
  const id = useId();
  const selected = new Set(selectedRegionIds);
  const scheduled = new Set(scheduledRegionIds);
  const references = new Set(referenceRegionIds);
  const selectedRooms = mapGeometry.rooms.filter(room => selected.has(room.id));
  const sourceFloor = floor === 'all' ? selectedRooms[0]?.floor ?? 1 : floor;
  const sourceData = mapGeometry.floors[sourceFloor];
  const sourceVisible = mode === 'source' || Boolean(error);
  const visibleRooms = mapGeometry.rooms.filter(room => sourceVisible ? room.floor === sourceFloor : floor === 'all' || room.floor === floor);
  const [sourceView, setSourceView] = useState(() => ({ floor:sourceFloor, zoom:1, imageError:false, imageAttempt:0 }));
  if (sourceView.floor !== sourceFloor) {
    setSourceView({ floor:sourceFloor, zoom:1, imageError:false, imageAttempt:0 });
  }
  const { zoom:sourceZoom, imageError, imageAttempt } = sourceView;

  useEffect(() => {
    latest.current = props;
    latestMode.current = mode;
  }, [props, mode]);

  useEffect(() => {
    let cancelled = false;
    let owned: Scene | null = null;
    const fail = (message: string) => {
      if (cancelled) return;
      owned?.dispose();
      if (scene.current === owned) scene.current = null;
      owned = null;
      setError(message);
      setLoading(false);
    };
    void loadScene().then(Constructor => {
      if (cancelled || !host.current || !labels.current) return;
      const current = latest.current;
      owned = new Constructor(host.current, labels.current, mapGeometry, projectMapPoint,
        regionId => latest.current.onSelectRegion(regionId), fail);
      scene.current = owned;
      owned.setFloor(current.floor);
      owned.setMode(latestMode.current === 'overhead');
      owned.setSelection(current.selectedRegionIds, current.scheduledRegionIds, current.referenceRegionIds ?? EMPTY_REGIONS);
      owned.setActive(latestMode.current !== 'source');
      setLoading(false);
    }).catch(() => fail('立体地图暂不可用，您仍可在原始平面图上选择会场。'));
    return () => {
      cancelled = true;
      owned?.dispose();
      if (scene.current === owned) scene.current = null;
    };
  }, [attempt]);

  useEffect(() => { scene.current?.setFloor(floor); }, [floor]);
  useEffect(() => {
    scene.current?.setSelection(selectedRegionIds, scheduledRegionIds, referenceRegionIds);
  }, [selectedRegionIds, scheduledRegionIds, referenceRegionIds]);
  useEffect(() => {
    scene.current?.setMode(mode === 'overhead');
    scene.current?.setActive(!sourceVisible);
  }, [mode, sourceVisible]);
  useEffect(() => {
    sourceScroller.current?.scrollTo({ left: 0, top: 0 });
  }, [sourceFloor]);

  function zoom(factor: number) {
    if (sourceVisible) setSourceView(current => ({ ...current, zoom:Math.min(3.5, Math.max(1, current.zoom * factor)) }));
    else scene.current?.zoom(factor);
  }
  function reset() {
    if (sourceVisible) {
      setSourceView(current => ({ ...current, zoom:1 }));
      sourceScroller.current?.scrollTo({ left: 0, top: 0 });
    } else scene.current?.reset();
  }

  return <section className="venueMap" aria-label="山东大厦会场地图">
    <div className="venueMapToolbar">
      <div className="venueMapControlGroup" role="group" aria-label="显示楼层">
        {([1, 2, 'all'] as const).map(value => <button key={value} type="button" aria-pressed={floor === value} aria-label={value === 'all' ? '分层总览' : `${value}F`} onClick={() => onFloorChange(value)}>{value === 'all' ? '总览' : `${value}F`}</button>)}
      </div>
      <div className="venueMapControlGroup" role="group" aria-label="地图显示方式">
        <button type="button" aria-pressed={!sourceVisible && mode === '3d'} disabled={Boolean(error)} onClick={() => setMode('3d')}>立体</button>
        <button type="button" aria-pressed={!sourceVisible && mode === 'overhead'} disabled={Boolean(error)} onClick={() => setMode('overhead')}>俯视</button>
        <button type="button" aria-pressed={sourceVisible} onClick={() => setMode('source')}>原图</button>
      </div>
    </div>

    {error && <div className="venueMapNotice" role="status"><span>{error}</span><button type="button" onClick={() => { setMode('3d'); setLoading(true); setError(''); setAttempt(value => value + 1); }}>重试立体地图</button></div>}
    {sourceVisible && <p className="venueMapSourceCaption">{sourceFloor}F 原始平面图{floor === 'all' ? ' · 原图逐层显示，可用上方楼层按钮切换' : ''} · 点击描边区域选择会场</p>}
    <div className="venueMapViewport">
      <div className="venueMapControlGroup venueMapZoom" role="group" aria-label="缩放地图">
        <button type="button" aria-label="缩小地图" disabled={sourceVisible && sourceZoom <= 1} onClick={() => zoom(1 / 1.2)}>−</button>
        <button type="button" aria-label="放大地图" disabled={sourceVisible && sourceZoom >= 3.5} onClick={() => zoom(1.2)}>+</button>
        <button type="button" onClick={reset}>复位</button>
      </div>
      <div className="venueMapScene" hidden={sourceVisible}>
        <div className="venueMapCanvasHost" ref={host} />
        <div className="venueMapLabels" ref={labels} aria-hidden="true" />
      </div>
      {sourceVisible && <div className="venueMapSourceScroller" ref={sourceScroller} tabIndex={0} role="region" aria-label={`${sourceFloor}F 原始平面图，可放大后滚动查看`} onKeyDown={event => {
        if (event.target !== event.currentTarget) return;
        if (['+', '=', '-', 'Home'].includes(event.key)) {
          event.preventDefault();
          if (event.key === 'Home') reset();
          else zoom(event.key === '-' ? 1 / 1.2 : 1.2);
        }
      }}>
        {imageError ? <div className="venueMapImageError" role="status"><p>原始平面图加载失败。会场仍可通过下方列表选择。</p><button type="button" onClick={() => setSourceView(current => ({ ...current, imageError:false, imageAttempt:current.imageAttempt + 1 }))}>重新加载原图</button><a href={publicPath(sourceData.source)} target="_blank" rel="noreferrer">单独打开原图</a></div> : <svg className="venueMapSource" viewBox={`0 0 ${sourceData.width} ${sourceData.height}`} width={sourceData.width} height={sourceData.height} style={{ width: `${sourceZoom * 100}%` }} aria-label={`${sourceFloor}F 原始平面图及可选会场`}>
          <image key={`${sourceFloor}-${imageAttempt}`} href={publicPath(sourceData.source)} width={sourceData.width} height={sourceData.height} onError={() => setSourceView(current => ({ ...current, imageError:true }))} />
          {visibleRooms.map(room => <g key={room.id} className={`venueMapRegion ${selected.has(room.id) ? 'isSelected' : references.has(room.id) ? 'isReference' : scheduled.has(room.id) ? 'isScheduled' : ''}`} role="button" tabIndex={0} aria-label={`${room.name}，${room.floor}F${selected.has(room.id) ? '，已选中' : ''}${scheduled.has(room.id) ? '，有日程' : ''}${references.has(room.id) ? '，参照会场' : ''}`} aria-pressed={selected.has(room.id)} onClick={() => onSelectRegion(room.id)} onKeyDown={event => {
            if (event.key === 'Enter' || event.key === ' ') { event.preventDefault(); onSelectRegion(room.id); }
          }} style={{ '--room-color': mapGeometry.categories[room.kind].color } as CSSProperties}>
            <title>{room.name} · {room.floor}F</title>
            <polygon points={room.polygon.map(point => point.join(',')).join(' ')} vectorEffect="non-scaling-stroke" />
          </g>)}
          {sourceFloor === 1 && <g className="venueMapSourceEntrance" aria-label="会议中心入口">
            <circle cx={mapGeometry.entrance.pixel[0]} cy={mapGeometry.entrance.pixel[1]} r="7" />
            <text x={mapGeometry.entrance.pixel[0] + 11} y={mapGeometry.entrance.pixel[1] + 5}>会议中心入口</text>
          </g>}
        </svg>}
      </div>}
      {loading && !sourceVisible && <div className="venueMapLoading" role="status">正在加载本地会场地图…<button type="button" onClick={() => setMode('source')}>先看原图</button></div>}
    </div>
    <div className="venueMapFooter">
      <details className="venueMapDetails">
        <summary>会场列表与图例</summary>
        <label className="venueMapRoomPicker" htmlFor={`${id}-room`}><span>选择图中会场</span><select id={`${id}-room`} value={visibleRooms.find(room => selected.has(room.id))?.id ?? ''} onChange={event => { if (event.target.value) onSelectRegion(event.target.value); }}>
          <option value="">请选择会场</option>
          {visibleRooms.map(room => <option key={room.id} value={room.id}>{room.floor}F · {room.name}{scheduled.has(room.id) ? ' · 有日程' : ''}</option>)}
        </select></label>
        <div className="venueMapLegend" aria-label="会场类别图例">
          {Object.entries(mapGeometry.categories).map(([kind, category]) => <span key={kind}><i style={{ background: category.color }} />{category.label}</span>)}
        </div>
        <p className="venueMapHint">键盘：聚焦立体地图后，方向键旋转、+/− 缩放、Home 复位。原图区域可按 Enter 或空格选择。手工描绘不代表实测尺寸、通行路线或楼层连接。</p>
      </details>
      <div className="venueMapLegend" aria-label="地图状态图例">
        <span><i className="isSelected" />已选</span><span><i className="isScheduled" />有日程</span>{referenceRegionIds.length > 0 && <span><i className="isReference" />参照</span>}
      </div>
    </div>
    <p className="venueMapHint">{sourceVisible ? '放大后可滑动原图，点击描边区域选会场。' : '拖动旋转 · 双指或滚轮缩放 · 点选会场'}</p>
  </section>;
}
