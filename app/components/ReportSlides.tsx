'use client';

import { useCallback, useEffect, useMemo, useRef, useState, useSyncExternalStore } from 'react';
import type { KeyboardEvent, PointerEvent } from 'react';
import { createPortal } from 'react-dom';
import type { Report } from '../lib/reports';
import { readSlideRecords, removeSlideRecord, writeSlideRecords } from '../lib/noteStorage';
import type { StoredSlide } from '../lib/noteStorage';
import type { SlideCorners } from '../lib/slideImages';
import { useDialog } from '../lib/useDialog';
import './report-slides.css';

import { prepareSlideImage, detectSlideCorners, processSlideImage } from '../lib/slideImages';
import { buildSlideExport } from '../lib/slideExport';

const fullCorners = (): SlideCorners => [{ x: 0, y: 0 }, { x: 1, y: 0 }, { x: 1, y: 1 }, { x: 0, y: 1 }];
const cornerNames = ['左上角', '右上角', '右下角', '左下角'];
const cornerDirections: Record<string, [number, number]> = { ArrowLeft: [-1, 0], ArrowRight: [1, 0], ArrowUp: [0, -1], ArrowDown: [0, 1] };

function explain(error: unknown): string {
  if (error instanceof Error) {
    if (error.name === 'QuotaExceededError') return '浏览器存储空间不足。请先导出备份，再删除不需要的照片后重试。';
    return error.message || '操作失败，请重试。';
  }
  return '操作失败，请重试。';
}

async function storeSlidePhoto(file: File, reportId: number, order: number): Promise<StoredSlide> {
  const image = await prepareSlideImage(file);
  const createdAt = Date.now();
  const id = globalThis.crypto?.randomUUID?.() || `${reportId}-${createdAt}-${Math.random().toString(36).slice(2)}`;
  const record: StoredSlide = { id, reportId, name: file.name || `PPT ${order + 1}`, ...image, createdAt, order, mode: 'original' };
  await writeSlideRecords([record]);
  return record;
}

function useBlobUrl(blob?: Blob) {
  const resource = useRef<{ blob: Blob; url: string } | null>(null);
  const subscribe = useCallback((notify: () => void) => {
    const current = blob ? { blob, url: URL.createObjectURL(blob) } : null;
    resource.current = current;
    notify();
    return () => {
      if (current) URL.revokeObjectURL(current.url);
      if (resource.current === current) resource.current = null;
    };
  }, [blob]);
  const snapshot = useCallback(() => resource.current?.blob === blob ? resource.current?.url || '' : '', [blob]);
  return useSyncExternalStore(subscribe, snapshot, () => '');
}

function SlideThumbnail({ slide }: { slide: StoredSlide }) {
  const url = useBlobUrl(slide.mode === 'processed' ? slide.processedThumbnail || slide.thumbnail : slide.thumbnail);
  return url ? <img src={url} alt={slide.name} loading="lazy" /> : <span>正在载入缩略图…</span>;
}

function SlideCamera({ onClose, onNative, onCapture, saveErrors }: {
  onClose: () => void;
  onNative: () => void;
  onCapture: (file: File) => Promise<boolean>;
  saveErrors: string[];
}) {
  const video = useRef<HTMLVideoElement>(null);
  const stream = useRef<MediaStream | null>(null);
  const alive = useRef(false);
  const capturing = useRef(false);
  const [ready, setReady] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [message, setMessage] = useState('正在请求后置摄像头权限…');
  const [attempt, setAttempt] = useState(0);
  useDialog('.slideCameraOverlay', onClose);

  useEffect(() => {
    alive.current = true;
    let cancelled = false;
    const stop = () => { stream.current?.getTracks().forEach(track => track.stop()); stream.current = null; };
    const start = async () => {
      try {
        if (!window.isSecureContext || !navigator.mediaDevices?.getUserMedia) {
          throw new Error('连续拍摄需要 HTTPS（或 localhost）及支持摄像头的浏览器。请改用系统拍照，或从相册添加。');
        }
        const next = await navigator.mediaDevices.getUserMedia({ video: { facingMode: { ideal: 'environment' }, width: { ideal: 2560 }, height: { ideal: 1440 } }, audio: false });
        if (cancelled) { next.getTracks().forEach(track => track.stop()); return; }
        stream.current = next;
        if (!video.current) { stop(); return; }
        video.current.srcObject = next;
        next.getVideoTracks().forEach(track => {
          track.onended = () => {
            if (cancelled) return;
            setReady(false);
            setError('摄像头已断开。请重新开启，或使用系统拍照。');
          };
        });
        await video.current.play();
        if (cancelled) { stop(); return; }
        setReady(true);
        setMessage('对准 PPT 后拍摄；保存完成即可继续拍下一张。');
      } catch (cause) {
        stop();
        if (cancelled) return;
        const name = cause instanceof Error ? cause.name : '';
        setMessage('');
        setError(name === 'NotAllowedError' ? '摄像头权限被拒绝。请在浏览器网站设置中允许摄像头后重试，或使用系统拍照 / 相册。' : name === 'NotFoundError' ? '未找到摄像头。请使用相册添加照片。' : name === 'NotReadableError' ? '摄像头可能正被其他应用占用，请关闭占用后重试，或使用系统拍照。' : explain(cause));
      }
    };
    void start();
    return () => { cancelled = true; alive.current = false; stop(); };
  }, [attempt]);

  const capture = async () => {
    if (capturing.current || !ready || !video.current) return;
    capturing.current = true;
    setBusy(true);
    setError('');
    try {
      const source = video.current;
      if (!source.videoWidth || !source.videoHeight) throw new Error('摄像头画面尚未就绪，请稍后重试。');
      const canvas = document.createElement('canvas');
      canvas.width = source.videoWidth;
      canvas.height = source.videoHeight;
      const context = canvas.getContext('2d');
      if (!context) throw new Error('浏览器无法读取拍摄画面，请改用系统拍照。');
      context.drawImage(source, 0, 0);
      const blob = await new Promise<Blob>((resolve, reject) => canvas.toBlob(value => value ? resolve(value) : reject(new Error('照片生成失败，请重新拍摄。')), 'image/jpeg', 0.95));
      canvas.width = canvas.height = 0;
      if (!alive.current) return;
      const saved = await onCapture(new File([blob], `PPT-${new Date().toISOString().replace(/[:.]/g, '-')}.jpg`, { type: 'image/jpeg' }));
      if (alive.current) setMessage(saved ? '本张已保存到此报告，可以继续拍摄。' : '本张未保存，请关闭拍摄查看错误，处理后重试。');
    } catch (cause) {
      if (alive.current) setError(explain(cause));
    } finally {
      capturing.current = false;
      if (alive.current) setBusy(false);
    }
  };

  return createPortal(<div className="slidesOverlay slideCameraOverlay" role="dialog" aria-modal="true" aria-labelledby="slideCameraTitle">
    <div className="slidesDialog">
      <header><div><small>PPT 连续拍摄</small><h3 id="slideCameraTitle">拍完一张，继续下一张</h3></div><button type="button" onClick={onClose}>停止并关闭</button></header>
      <video ref={video} autoPlay playsInline muted aria-label="后置摄像头实时画面" />
      <p className="slidesHint">关闭此窗口会停止摄像头。画质取决于设备提供的视频分辨率；需要最高原图画质时请使用系统相机或相册。</p>
      <p role="status">{busy ? '正在保存照片，请稍候…' : message}</p>
      {error && <p className="slidesError" role="alert">{error}</p>}
      {!!saveErrors.length && <div className="slidesError" role="alert">{saveErrors.map((text, index) => <p key={index}>{text}</p>)}</div>}
      <div className="slidesActions"><button className="slidesPrimary" type="button" disabled={!ready || busy} onClick={() => void capture()}>{busy ? '保存中…' : '拍摄并保存'}</button>{error && <button type="button" disabled={busy} onClick={() => { setReady(false); setError(''); setMessage('正在请求后置摄像头权限…'); setAttempt(value => value + 1); }}>重新开启摄像头</button>}<button type="button" disabled={busy} onClick={onNative}>改用系统拍照</button></div>
    </div>
  </div>, document.body);
}

function SlideEditor({ slide, onClose, onApply, saveErrors }: {
  slide: StoredSlide;
  onClose: () => void;
  onApply: (corners: SlideCorners, enhance: boolean, rotation: 0 | 90 | 180 | 270) => Promise<boolean>;
  saveErrors: string[];
}) {
  const url = useBlobUrl(slide.original);
  const stage = useRef<HTMLDivElement>(null);
  const alive = useRef(false);
  const saving = useRef(false);
  const [corners, setCorners] = useState<SlideCorners>(fullCorners);
  const [enhance, setEnhance] = useState(true);
  const [rotation, setRotation] = useState<0 | 90 | 180 | 270>(0);
  const [detecting, setDetecting] = useState(true);
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState('正在识别边缘…');
  const [error, setError] = useState('');
  useDialog('.slideEditorOverlay', onClose);
  useEffect(() => {
    alive.current = true;
    let cancelled = false;
    void (async () => {
      try {
        const detected = await detectSlideCorners(slide.original);
        if (cancelled) return;
        setCorners(detected || fullCorners());
        setMessage(detected ? '已识别候选边缘，请检查四角后保存。' : '未识别到可靠边缘，已选择全图。请手动拖动四角。');
      } catch (cause) {
        if (!cancelled) setMessage(`自动识别不可用，仍可手动选取四角。${explain(cause)}`);
      } finally { if (!cancelled) setDetecting(false); }
    })();
    return () => { cancelled = true; alive.current = false; };
  }, [slide.original]);

  const updateCorner = (index: number, x: number, y: number) => setCorners(previous => previous.map((point, i) => i === index ? { x: Math.max(0, Math.min(1, x)), y: Math.max(0, Math.min(1, y)) } : point) as SlideCorners);
  const drag = (event: PointerEvent<HTMLButtonElement>, index: number) => {
    if (!event.currentTarget.hasPointerCapture(event.pointerId) || !stage.current) return;
    const rect = stage.current.getBoundingClientRect();
    if (rect.width && rect.height) updateCorner(index, (event.clientX - rect.left) / rect.width, (event.clientY - rect.top) / rect.height);
  };
  const moveKey = (event: KeyboardEvent<HTMLButtonElement>, index: number) => {
    const direction = cornerDirections[event.key];
    if (!direction) return;
    event.preventDefault();
    const amount = event.shiftKey ? 0.05 : 0.005;
    updateCorner(index, corners[index].x + direction[0] * amount, corners[index].y + direction[1] * amount);
  };
  const apply = async () => {
    if (saving.current || detecting) return;
    saving.current = true;
    setBusy(true);
    setError('');
    try {
      if (await onApply(corners, enhance, rotation)) { if (alive.current) onClose(); }
      else if (alive.current) setError('处理或保存失败，原图未改动。请关闭窗口查看错误，或重试。');
    } finally {
      saving.current = false;
      if (alive.current) setBusy(false);
    }
  };
  return createPortal(<div className="slidesOverlay slideEditorOverlay" role="dialog" aria-modal="true" aria-labelledby="slideEditorTitle">
    <div className="slidesDialog">
      <header><div><small>原图始终保留</small><h3 id="slideEditorTitle">校正 PPT 四角</h3></div><button type="button" onClick={onClose}>关闭</button></header>
      <p className="slidesHint">按左上、右上、右下、左下顺序选取，四边不要交叉。拖动圆点，或聚焦圆点后用方向键微调（Shift 加速）。下方为原图；旋转在裁切后应用。</p>
      <div className="slidesCornerPad"><div className="slidesCornerStage" ref={stage}>
        {url && <img src={url} alt={`待校正原图：${slide.name}`} draggable={false} />}
        <svg viewBox="0 0 100 100" preserveAspectRatio="none" aria-hidden="true"><polygon points={corners.map(point => `${point.x * 100},${point.y * 100}`).join(' ')} /></svg>
        {corners.map((point, index) => <button type="button" className="slidesCorner" key={index} disabled={detecting || busy} style={{ left: `${point.x * 100}%`, top: `${point.y * 100}%` }} aria-label={`${cornerNames[index]}，横向 ${Math.round(point.x * 100)}%，纵向 ${Math.round(point.y * 100)}%，方向键移动`} onPointerDown={event => { event.preventDefault(); event.currentTarget.focus(); event.currentTarget.setPointerCapture(event.pointerId); }} onPointerMove={event => drag(event, index)} onPointerUp={event => { if (event.currentTarget.hasPointerCapture(event.pointerId)) event.currentTarget.releasePointerCapture(event.pointerId); }} onKeyDown={event => moveKey(event, index)}>{index + 1}</button>)}
      </div></div>
      <p role="status">{busy ? '正在校正并保存…' : message}</p>
      {error && <p role="alert" className="slidesError">{error}</p>}
      {!!saveErrors.length && <div className="slidesError" role="alert">{saveErrors.map((text, index) => <p key={index}>{text}</p>)}</div>}
      <div className="slidesEditOptions"><label><input type="checkbox" checked={enhance} disabled={busy} onChange={event => setEnhance(event.target.checked)} />增强对比度与清晰度</label><label>顺时针旋转<select value={rotation} disabled={busy} onChange={event => setRotation(Number(event.target.value) as 0 | 90 | 180 | 270)}><option value={0}>不旋转</option><option value={90}>90°</option><option value={180}>180°</option><option value={270}>270°</option></select></label></div>
      <div className="slidesActions"><button type="button" disabled={busy || detecting} onClick={() => setCorners(fullCorners())}>重置全图四角</button><button className="slidesPrimary" type="button" disabled={busy || detecting} onClick={() => void apply()}>{busy ? '保存中…' : '校正并保存扫描版'}</button></div>
    </div>
  </div>, document.body);
}

export default function ReportSlides({ report }: { report: Report }) {
  const [slides, setSlides] = useState<StoredSlide[]>([]);
  const records = useRef<StoredSlide[]>([]);
  const alive = useRef(false);
  const locked = useRef(true);
  const [load, setLoad] = useState<'loading' | 'ready' | 'error'>('loading');
  const [attempt, setAttempt] = useState(0);
  const [busy, setBusy] = useState('');
  const [notice, setNotice] = useState('');
  const [errors, setErrors] = useState<string[]>([]);
  const [camera, setCamera] = useState(false);
  const [editing, setEditing] = useState<StoredSlide | null>(null);
  const [deleting, setDeleting] = useState<string | null>(null);
  const [exportResult, setExportResult] = useState<{ blob: Blob; filename: string } | null>(null);
  const [shareBusy, setShareBusy] = useState(false);
  const [progress, setProgress] = useState<{ completed: number; total: number } | null>(null);
  const nativeInput = useRef<HTMLInputElement>(null);
  const galleryInput = useRef<HTMLInputElement>(null);
  const exportUrl = useBlobUrl(exportResult?.blob);
  const disabled = load !== 'ready' || !!busy;

  useEffect(() => {
    alive.current = true;
    let cancelled = false;
    locked.current = true;
    void readSlideRecords(report.id).then(value => {
      if (cancelled) return;
      records.current = value.sort((a, b) => a.order - b.order || a.createdAt - b.createdAt);
      setSlides(records.current);
      setLoad('ready');
      locked.current = false;
    }).catch(cause => {
      if (cancelled) return;
      setErrors([`无法读取本报告的照片：${explain(cause)}`]);
      setLoad('error');
    });
    return () => { cancelled = true; alive.current = false; };
  }, [report.id, attempt]);

  const canShare = useMemo(() => {
    if (!exportResult) return false;
    try { return !!navigator.share && !!navigator.canShare?.({ files: [new File([exportResult.blob], exportResult.filename, { type: exportResult.blob.type })] }); }
    catch { return false; }
  }, [exportResult]);

  const begin = (label: string) => {
    if (locked.current || !alive.current) return false;
    locked.current = true;
    setBusy(label);
    setErrors([]);
    setNotice('');
    return true;
  };
  const finish = () => { if (alive.current) { locked.current = false; setBusy(''); setProgress(null); } };
  const publish = (next: StoredSlide[]) => {
    records.current = next;
    if (alive.current) { setSlides(next); setExportResult(null); }
  };

  async function importFiles(files: File[]): Promise<boolean> {
    if (!files.length || !begin('正在导入照片…')) return false;
    let saved = 0;
    const failures: string[] = [];
    try {
      for (const [index, file] of files.entries()) {
        if (!alive.current) break;
        setBusy(`正在保存 ${index + 1} / ${files.length}…`);
        try {
          const lastOrder = records.current.reduce((max, item) => Math.max(max, item.order), -1);
          const record = await storeSlidePhoto(file, report.id, lastOrder + 1);
          publish([...records.current, record]);
          saved++;
        } catch (cause) { failures.push(`${file.name || `第 ${index + 1} 张`}：${explain(cause)}`); }
      }
      if (alive.current) { setNotice(`已保存 ${saved} 张${failures.length ? `；${failures.length} 张失败，成功的照片已保留。` : '，可继续添加。'}`); setErrors(failures); }
    } catch (cause) { if (alive.current) setErrors([`照片导入失败：${explain(cause)}`]); }
    finally { finish(); }
    return saved === files.length;
  }

  const update = async (next: StoredSlide[], message: string) => {
    if (!begin('正在保存更改…')) return;
    try {
      const previous = new Map(records.current.map(slide => [slide.id, slide]));
      await writeSlideRecords(next.filter(slide => previous.get(slide.id) !== slide));
      publish(next);
      if (alive.current) setNotice(message);
    }
    catch (cause) { if (alive.current) setErrors([explain(cause)]); }
    finally { finish(); }
  };
  const move = (index: number, offset: number) => {
    const next = [...records.current];
    [next[index], next[index + offset]] = [next[index + offset], next[index]];
    void update(next.map((slide, order) => slide.order === order ? slide : { ...slide, order }), '照片顺序已保存，导出将使用此顺序。');
  };
  const remove = async (slide: StoredSlide) => {
    if (!begin('正在删除照片…')) return;
    try { await removeSlideRecord(slide.id); publish(records.current.filter(item => item.id !== slide.id)); if (alive.current) { setDeleting(null); setNotice('照片及其扫描版已从本报告删除。'); } }
    catch (cause) { if (alive.current) setErrors([explain(cause)]); }
    finally { finish(); }
  };
  const scan = async () => {
    if (!begin('正在识别 PPT 边缘…')) return;
    let saved = 0, skipped = 0;
    const failures: string[] = [];
    try {
      const originals = [...records.current];
      for (const [index, slide] of originals.entries()) {
        if (!alive.current) break;
        setBusy(`正在扫描 ${index + 1} / ${originals.length}…`);
        try {
          const corners = await detectSlideCorners(slide.original);
          if (!corners) { skipped++; continue; }
          const result = await processSlideImage(slide.original, { corners, enhance: true });
          const next: StoredSlide = { ...slide, processed: result.blob, processedThumbnail: result.thumbnail, mode: 'processed' };
          await writeSlideRecords([next]);
          publish(records.current.map(item => item.id === next.id ? next : item));
          saved++;
        } catch (cause) { failures.push(`${slide.name}：${explain(cause)}`); }
      }
      if (alive.current) { setNotice(`扫描版已保存 ${saved} 张；边缘不确定跳过 ${skipped} 张（原有版本不变），失败 ${failures.length} 张。可逐张手动校正。`); setErrors(failures); }
    } catch (cause) { if (alive.current) setErrors([explain(cause)]); }
    finally { finish(); }
  };
  const applyEdit = async (slide: StoredSlide, corners: SlideCorners, enhance: boolean, rotation: 0 | 90 | 180 | 270) => {
    if (!begin('正在校正并保存…')) return false;
    try {
      const result = await processSlideImage(slide.original, { corners, enhance, rotation });
      const next: StoredSlide = { ...slide, processed: result.blob, processedThumbnail: result.thumbnail, mode: 'processed' };
      await writeSlideRecords([next]);
      publish(records.current.map(item => item.id === slide.id ? next : item));
      if (alive.current) setNotice('扫描版已保存并选用，原图未改动。');
      return true;
    } catch (cause) { if (alive.current) setErrors([`${slide.name}：${explain(cause)}`]); return false; }
    finally { finish(); }
  };
  const exportSlides = async (format: 'pdf' | 'png') => {
    if (!records.current.length || !begin('正在生成导出文件…')) return;
    setExportResult(null);
    try {
      const result = await buildSlideExport(report, [...records.current], format, (completed, total) => { if (alive.current) setProgress({ completed, total }); });
      if (alive.current) { setExportResult(result); setNotice('导出文件已生成，请点击下方下载或分享。'); }
    } catch (cause) { if (alive.current) setErrors([`导出失败，可重新点击导出重试：${explain(cause)}`]); }
    finally { finish(); }
  };
  const share = async () => {
    if (!exportResult || shareBusy) return;
    setShareBusy(true);
    try {
      const file = new File([exportResult.blob], exportResult.filename, { type: exportResult.blob.type });
      await navigator.share({ files: [file], title: report.sourceTitle });
    } catch (cause) {
      if (alive.current && !(cause instanceof Error && cause.name === 'AbortError')) setErrors([`无法分享文件，请使用下载链接：${explain(cause)}`]);
    } finally { if (alive.current) setShareBusy(false); }
  };

  return <section className="reportSlides" aria-label="本报告 PPT 照片笔记" aria-busy={disabled}>
    <header className="slidesHeading"><div><span className="slidesEyebrow">REPORT · PPT NOTEBOOK</span><h3>PPT 照片笔记 <span>{slides.length} 张</span></h3></div><span className="slidesLocalBadge">仅存本机</span></header>
    <div className="slidesReportSummary"><strong>{report.sourceTitle}</strong><span>{report.speaker} · {report.dateTime}</span><span>{report.location}</span><small>{report.program}{report.session ? ` / ${report.session}` : ''}</small></div>
    <p className="slidesHint">照片仅绑定当前报告，保存在本浏览器，不会上传。清除网站数据、无痕模式结束或浏览器回收存储可能导致丢失，请及时导出；不同设备与浏览器不会同步。</p>
    <input className="slidesFileInput" ref={nativeInput} type="file" accept="image/*" capture="environment" aria-label="使用系统相机拍摄 PPT" disabled={disabled} onChange={event => { const files = Array.from(event.target.files || []); event.target.value = ''; void importFiles(files); }} />
    <input className="slidesFileInput" ref={galleryInput} type="file" accept="image/*" multiple aria-label="从相册选择多张 PPT 照片" disabled={disabled} onChange={event => { const files = Array.from(event.target.files || []); event.target.value = ''; void importFiles(files); }} />
    <div className="slidesActions slidesCaptureActions"><button type="button" className="slidesPrimary" disabled={disabled} onClick={() => { setErrors([]); setCamera(true); }}>连续拍摄 PPT</button><button type="button" disabled={disabled} onClick={() => nativeInput.current?.click()}>系统拍照</button><button type="button" disabled={disabled} onClick={() => galleryInput.current?.click()}>从相册添加（多选）</button></div>
    {load === 'loading' && <p role="status">正在读取本报告的照片，读取完成前不可修改…</p>}
    {load === 'error' && <button type="button" onClick={() => { setLoad('loading'); setErrors([]); setAttempt(value => value + 1); }}>重试读取照片</button>}
    {(busy || notice) && <p className="slidesNotice" role="status">{busy || notice}</p>}
    {progress && <div className="slidesProgress"><progress max={Math.max(1, progress.total)} value={progress.completed} aria-label="导出进度" /><span>{progress.completed} / {progress.total}</span></div>}
    {!!errors.length && <div className="slidesError" role="alert"><strong>操作未全部完成</strong><ul>{errors.map((error, index) => <li key={index}>{error}</li>)}</ul><p>未保存的照片请重新选择或拍摄；已有照片不会被清空。</p></div>}
    {load === 'ready' && !slides.length && <div className="slidesEmpty"><span aria-hidden="true">PPT</span><h4>把这一场报告，留成自己的图文资料</h4><p>拍摄现场幻灯片，或从相册一次添加多张。随后可调整顺序、扫描校正，再导出带报告封面的 PDF 或 PNG 图片包。</p></div>}
    {!!slides.length && <><div className="slidesActions slidesBatchActions"><button type="button" disabled={disabled} onClick={() => void scan()}>批量自动扫描</button><button type="button" disabled={disabled || slides.every(slide => slide.mode === 'original')} onClick={() => void update(records.current.map(slide => ({ ...slide, mode: 'original' })), '全部改用原图，扫描版仍然保留。')}>全部改用原图</button></div><p className="slidesHint">自动扫描只处理识别到可靠四边的照片，反光、遮挡或无明显边框时请手动校正。请检查结果；增强无法恢复原图中缺失的文字。</p>
      <ol className="slidesGrid">{slides.map((slide, index) => <li className="slidesCard" key={slide.id}>
        <div className="slidesThumbnail"><SlideThumbnail slide={slide} /><span>{String(index + 1).padStart(2, '0')} · {slide.mode === 'processed' ? '扫描版' : '原图'}</span></div>
        <div className="slidesCardBody"><strong className="slidesName" title={slide.name}>{slide.name}</strong><small>原图 {slide.width} × {slide.height}</small>
          <div className="slidesVersion" role="group" aria-label={`第 ${index + 1} 张导出版本`}><button type="button" disabled={disabled || slide.mode === 'original'} aria-pressed={slide.mode === 'original'} onClick={() => void update(records.current.map(item => item.id === slide.id ? { ...item, mode: 'original' } : item), '已改用原图。')}>原图</button><button type="button" disabled={disabled || !slide.processed || slide.mode === 'processed'} aria-pressed={slide.mode === 'processed'} onClick={() => void update(records.current.map(item => item.id === slide.id ? { ...item, mode: 'processed' } : item), '已改用扫描版。')}>扫描版</button></div>
          <button type="button" disabled={disabled} onClick={() => { setErrors([]); setEditing(slide); }}>查看原图 / 手动校正</button>
          <div className="slidesOrder"><button type="button" disabled={disabled || index === 0} aria-label={`将第 ${index + 1} 张 ${slide.name} 前移`} onClick={() => move(index, -1)}>前移</button><button type="button" disabled={disabled || index === slides.length - 1} aria-label={`将第 ${index + 1} 张 ${slide.name} 后移`} onClick={() => move(index, 1)}>后移</button><button type="button" className="slidesDelete" disabled={disabled} aria-label={`删除第 ${index + 1} 张 ${slide.name}`} onClick={() => setDeleting(slide.id)}>删除</button></div>
          {deleting === slide.id && <div className="slidesDeleteConfirm"><p>删除这张照片和扫描版？本机删除不可撤销。</p><div className="slidesActions"><button type="button" disabled={disabled} onClick={() => setDeleting(null)}>取消</button><button type="button" disabled={disabled} className="slidesDelete" onClick={() => void remove(slide)}>确认删除</button></div></div>}
        </div>
      </li>)}</ol></>}
    <div className="slidesExport"><h4>整理完成，带走这场报告</h4><p className="slidesHint">按当前顺序及每张选定版本导出。PDF 首页面为报告封面；PNG ZIP 内为 000-cover.png 和依次编号的照片。导出是图片资料，不含 OCR 可搜索文字。扫描及导出可能为内存安全缩放，不能提升原始拍摄分辨率；原文件仍保留在本机。照片较多时生成需等待。</p><div className="slidesActions"><button type="button" disabled={disabled || !slides.length} onClick={() => void exportSlides('pdf')}>生成 PDF</button><button type="button" disabled={disabled || !slides.length} onClick={() => void exportSlides('png')}>生成 PNG 图片包</button></div>
      {exportResult && exportUrl && <div className="slidesExportReady"><strong>文件已准备好</strong><span>{exportResult.filename}</span><div className="slidesActions"><a className="slidesDownload" href={exportUrl} download={exportResult.filename}>下载文件（{(exportResult.blob.size / 1024 / 1024).toFixed(1)} MB）</a>{canShare && <button type="button" disabled={shareBusy} onClick={() => void share()}>{shareBusy ? '正在分享…' : '分享文件'}</button>}</div><small>{canShare ? '分享面板中可选择支持接收此文件的应用。' : '此浏览器不支持文件分享，请先下载，再通过微信、邮件或文件管理器发送。'} 修改照片后需重新生成文件。</small></div>}
    </div>
    {camera && <SlideCamera saveErrors={errors} onClose={() => setCamera(false)} onNative={() => { setCamera(false); nativeInput.current?.click(); }} onCapture={file => importFiles([file])} />}
    {editing && <SlideEditor saveErrors={errors} slide={editing} onClose={() => setEditing(null)} onApply={(corners, enhance, rotation) => applyEdit(editing, corners, enhance, rotation)} />}
  </section>;
}
