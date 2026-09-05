'use client';

import { useEffect, useMemo, useRef, useState, useSyncExternalStore } from 'react';
import type { ChangeEvent, PointerEvent as ReactPointerEvent } from 'react';
import { createPortal } from 'react-dom';
import { useDialog } from '../lib/useDialog';
const html2canvas: typeof import('html2canvas').default = async (...args) => (await import('html2canvas')).default(...args);
import { BRAND_SLOGAN_CN } from './BrandLockup';
import { SHARE_MOMENT_OPEN_EVENT, type ShareMomentContext } from '../lib/shareEvents';

type ShareMode = 'image' | 'mixed' | 'text';
type TemplateId =
  | 'image-bleed' | 'image-editorial' | 'image-film' | 'image-gallery'
  | 'mixed-split' | 'mixed-sidebar' | 'mixed-overlay' | 'mixed-postcard'
  | 'text-editorial' | 'text-bold' | 'text-journal' | 'text-gradient';

type TemplateOption = {
  id: TemplateId;
  name: string;
  subtitle: string;
};

type ImageCrop = {
  x: number;
  y: number;
  zoom: number;
};

const MAX_TEXT = 500;
const subscribeToClient = () => () => {};
const getClientSnapshot = () => true;
const getServerSnapshot = () => false;
const DEFAULT_IMAGE_CROP: ImageCrop = { x: 50, y: 50, zoom: 1 };


const TEMPLATES: Record<ShareMode, TemplateOption[]> = {
  image: [
    { id: 'image-bleed', name: '全幅瞬间', subtitle: '沉浸式满版' },
    { id: 'image-editorial', name: '杂志留白', subtitle: '编辑感边框' },
    { id: 'image-film', name: '胶片纪实', subtitle: '会议现场感' },
    { id: 'image-gallery', name: '展签画框', subtitle: '极简画廊感' },
  ],
  mixed: [
    { id: 'mixed-split', name: '上下图文', subtitle: '清晰易读' },
    { id: 'mixed-sidebar', name: '左右专栏', subtitle: '杂志专栏感' },
    { id: 'mixed-overlay', name: '沉浸叠字', subtitle: '社交媒体感' },
    { id: 'mixed-postcard', name: '会议明信片', subtitle: '轻松记录感' },
  ],
  text: [
    { id: 'text-editorial', name: '编辑手记', subtitle: '简约留白' },
    { id: 'text-bold', name: '观点大字', subtitle: '一句话冲击' },
    { id: 'text-journal', name: '听会札记', subtitle: '纸张笔记感' },
    { id: 'text-gradient', name: '灵感渐变', subtitle: '轻盈社交感' },
  ],
};

const DEFAULT_TEMPLATE: Record<ShareMode, TemplateId> = {
  image: 'image-bleed',
  mixed: 'mixed-split',
  text: 'text-editorial',
};

function ModeIcon({ mode }: { mode: ShareMode }) {
  if (mode === 'image') return <span aria-hidden>▧</span>;
  if (mode === 'mixed') return <span aria-hidden>▤</span>;
  return <span aria-hidden>Ｔ</span>;
}

function CardArtwork({ mode, template, imageUrl, imageCrop, text }: {
  mode: ShareMode;
  template: TemplateId;
  imageUrl: string | null;
  imageCrop: ImageCrop;
  text: string;
}) {
  const cleanText = text.trim();
  const textClass = cleanText.length > 360 ? 'isVeryLong' : cleanText.length > 220 ? 'isLong' : '';
  const imageStyle = {
    objectPosition: `${imageCrop.x}% ${imageCrop.y}%`,
    transform: `scale(${imageCrop.zoom})`,
    transformOrigin: `${imageCrop.x}% ${imageCrop.y}%`,
  };
  const image = imageUrl
    ? <img className="shareMomentCropImage" src={imageUrl} alt="分享灵感瞬间" style={imageStyle} draggable={false} />
    : <div className="shareMomentCardPlaceholder"><span>＋</span><small>上传一张会议图片</small></div>;
  const fallbackText = cleanText || '写下一句此刻最想留下的会议心得。';

  const brandStamp = <div className="shareCardBrandStamp">
<span>{BRAND_SLOGAN_CN}</span></div>;

  if (mode === 'image') {
    return <>
      <div className="shareMomentImageMain">{image}</div>
      {template === 'image-editorial' && <><div className="shareMomentEditorialBrand">CSCO · MOMENT</div><div className="shareMomentEditorialFoot">SHARE THE MOMENT / 2026</div></>}
      {template === 'image-film' && <><div className="shareMomentFilmTop">CSCO 2026 · FRAME 01</div><div className="shareMomentFilmBottom">● REC &nbsp;&nbsp; MEETING MOMENT</div></>}
      {template === 'image-gallery' && <><div className="shareMomentGalleryLabel"><b>灵感瞬间</b><small>CSCO MEETING MOMENT · 2026</small></div></>}
      {brandStamp}
    </>;
  }

  if (mode === 'mixed') {
    if (template === 'mixed-overlay') return <>
      <div className="shareMomentMixedImage">{image}</div>
      <div className="shareMomentOverlayShade" />
      <div className="shareMomentOverlayCopy"><small>CSCO · MOMENT</small><p className={textClass}>{fallbackText}</p><span>分享灵感瞬间 ↗</span></div>{brandStamp}
    </>;

    if (template === 'mixed-sidebar') return <>
      <div className="shareMomentMixedImage">{image}</div>
      <div className="shareMomentMixedCopy"><small>CSCO / 2026</small><div className="shareMomentQuoteMark">“</div><p className={textClass}>{fallbackText}</p><span>MEETING NOTE · MOMENT</span></div>{brandStamp}
    </>;

    if (template === 'mixed-postcard') return <>
      <div className="shareMomentPostcardTop"><span>POSTCARD / CSCO 2026</span><b>✦</b></div>
      <div className="shareMomentMixedImage">{image}</div>
      <div className="shareMomentPostcardCopy"><p className={textClass}>{fallbackText}</p><small>FROM THE MEETING · TO MYSELF</small></div>{brandStamp}
    </>;

    return <>
      <div className="shareMomentMixedImage">{image}</div>
      <div className="shareMomentMixedCopy"><div className="shareMomentMixedMeta"><span>CSCO · 2026</span><b>✦</b></div><p className={textClass}>{fallbackText}</p><small>分享灵感瞬间 · MEETING MOMENT</small></div>{brandStamp}
    </>;
  }

  return <>
    <div className="shareMomentTextMeta"><span>CSCO · 2026</span><b>✦</b></div>
    {template === 'text-journal' && <div className="shareMomentJournalIndex">NOTE / 01</div>}
    <div className="shareMomentTextQuote">“</div>
    <p className={textClass}>{fallbackText}</p>
    <div className="shareMomentTextFooter"><span>分享灵感瞬间</span><small>{template === 'text-bold' ? 'ONE IDEA WORTH KEEPING' : template === 'text-gradient' ? 'IDEA / ENERGY / MOMENT' : 'MEETING NOTE · MOMENT'}</small></div>
    {brandStamp}
  </>;
}

export default function ShareMoment({ initialOpen = false, initialContext = null }: { initialOpen?: boolean; initialContext?: ShareMomentContext | null }) {
  const mounted = useSyncExternalStore(subscribeToClient, getClientSnapshot, getServerSnapshot);
  const [open, setOpen] = useState(initialOpen);
  useDialog('.shareMomentOverlay', () => setOpen(false), open && mounted);
  const [mode, setMode] = useState<ShareMode>('image');
  const [template, setTemplate] = useState<TemplateId>(DEFAULT_TEMPLATE.image);
  const [text, setText] = useState('');
  const [imageUrl, setImageUrl] = useState<string | null>(null);
  const [imageName, setImageName] = useState('');
  const [imageCrop, setImageCrop] = useState<ImageCrop>(DEFAULT_IMAGE_CROP);
  const [generated, setGenerated] = useState(false);
  const [busy, setBusy] = useState(false);
  const [context, setContext] = useState<ShareMomentContext | null>(initialContext);
  const [shareStatus, setShareStatus] = useState('');
  const fileInputRef = useRef<HTMLInputElement | null>(null);
  const cameraInputRef = useRef<HTMLInputElement | null>(null);
  const cardRef = useRef<HTMLDivElement | null>(null);
  const cropDragRef = useRef<{
    pointerId: number;
    clientX: number;
    clientY: number;
    cropX: number;
    cropY: number;
  } | null>(null);

  useEffect(() => () => { if (imageUrl) URL.revokeObjectURL(imageUrl); }, [imageUrl]);

  useEffect(() => {
    const openStudio = (event: Event) => {
      setContext((event as CustomEvent<ShareMomentContext | null>).detail ?? null);
      setShareStatus('');
      setOpen(true);
    };
    window.addEventListener(SHARE_MOMENT_OPEN_EVENT, openStudio);
    return () => window.removeEventListener(SHARE_MOMENT_OPEN_EVENT, openStudio);
  }, []);

  const currentTemplates = TEMPLATES[mode];
  const canGenerate = useMemo(() => {
    if (mode === 'image') return Boolean(imageUrl);
    if (mode === 'mixed') return Boolean(imageUrl && text.trim());
    return Boolean(text.trim());
  }, [mode, imageUrl, text]);

  const setShareMode = (nextMode: ShareMode) => {
    setMode(nextMode);
    setTemplate(DEFAULT_TEMPLATE[nextMode]);
    setGenerated(false);
  };

  const updateImageCrop = (nextCrop: ImageCrop) => {
    setImageCrop(nextCrop);
    setGenerated(false);
    setShareStatus('');
  };

  const startCropDrag = (event: ReactPointerEvent<HTMLDivElement>) => {
    event.currentTarget.setPointerCapture(event.pointerId);
    cropDragRef.current = {
      pointerId: event.pointerId,
      clientX: event.clientX,
      clientY: event.clientY,
      cropX: imageCrop.x,
      cropY: imageCrop.y,
    };
  };

  const moveCrop = (event: ReactPointerEvent<HTMLDivElement>) => {
    const drag = cropDragRef.current;
    if (!drag || drag.pointerId !== event.pointerId) return;
    const bounds = event.currentTarget.getBoundingClientRect();
    updateImageCrop({
      ...imageCrop,
      x: Math.min(100, Math.max(0, drag.cropX - (event.clientX - drag.clientX) / Math.max(1, bounds.width) * 100 / imageCrop.zoom)),
      y: Math.min(100, Math.max(0, drag.cropY - (event.clientY - drag.clientY) / Math.max(1, bounds.height) * 100 / imageCrop.zoom)),
    });
  };

  const endCropDrag = (event: ReactPointerEvent<HTMLDivElement>) => {
    if (cropDragRef.current?.pointerId !== event.pointerId) return;
    cropDragRef.current = null;
    if (event.currentTarget.hasPointerCapture(event.pointerId)) {
      event.currentTarget.releasePointerCapture(event.pointerId);
    }
  };

  const onImageChange = (event: ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    if (!file || !file.type.startsWith('image/')) return;
    if (imageUrl) URL.revokeObjectURL(imageUrl);
    const nextUrl = URL.createObjectURL(file);
    setImageUrl(nextUrl);
    setImageName(file.name);
    setImageCrop(DEFAULT_IMAGE_CROP);
    setGenerated(false);
    setShareStatus('');
  };

  const clearImage = () => {
    if (imageUrl) URL.revokeObjectURL(imageUrl);
    setImageUrl(null);
    setImageCrop(DEFAULT_IMAGE_CROP);
    setImageName('');
    setGenerated(false);
    setShareStatus('');
    if (fileInputRef.current) fileInputRef.current.value = '';
    if (cameraInputRef.current) cameraInputRef.current.value = '';
  };

  const renderPng = async () => {
    if (!cardRef.current || !canGenerate) return null;
    setBusy(true);
    try {
      const exportScale = 1080 / Math.max(1, cardRef.current.getBoundingClientRect().width);
      return await html2canvas(cardRef.current, {
        scale: exportScale,
        backgroundColor: null,
        useCORS: true,
        logging: false,
      });
    } catch {
      setShareStatus('图片生成失败，请检查图片后重试。');
      return null;
    } finally {
      setBusy(false);
    }
  };

  const savePng = async () => {
    const canvas = await renderPng();
    if (!canvas) return;
    const link = document.createElement('a');
    link.download = `CSCO-分享灵感瞬间-${new Date().toISOString().slice(0, 10)}.png`;
    link.href = canvas.toDataURL('image/png');
    link.click();
  };

  const sharePng = async () => {
    const canvas = await renderPng();
    if (!canvas) return;
    const blob = await new Promise<Blob | null>((resolve) => canvas.toBlob(resolve, 'image/png'));
    if (!blob) return;
    const file = new File([blob], `CSCO-分享灵感瞬间-${new Date().toISOString().slice(0, 10)}.png`, { type: 'image/png' });
    if (navigator.share && navigator.canShare?.({ files: [file] })) {
      try {
        await navigator.share({ title: 'CSCO 分享灵感瞬间', files: [file] });
        setShareStatus('已打开系统分享');
        return;
      } catch (error) {
        if (error instanceof DOMException && error.name === 'AbortError') return;
      }
    }
    const link = document.createElement('a');
    link.download = file.name;
    link.href = URL.createObjectURL(blob);
    link.click();
    URL.revokeObjectURL(link.href);
    setShareStatus('当前浏览器不支持系统分享，已保存 PNG');
  };

  const printCard = async () => {
    const canvas = await renderPng();
    if (!canvas) return;
    const frame = document.createElement('iframe');
    frame.title = '分享卡片打印';
    frame.style.cssText = 'position:fixed;width:1px;height:1px;left:-10000px;';
    document.body.appendChild(frame);
    const doc = frame.contentDocument;
    if (!doc) { frame.remove(); setShareStatus('当前浏览器无法打印，请保存 PNG。'); return; }
    doc.open();
    doc.write('<!doctype html><html lang="zh-CN"><head><title>CSCO 分享卡片</title><style>@page{size:A4 portrait;margin:12mm}body{margin:0;text-align:center}img{max-width:170mm;width:100%;height:auto}</style></head><body></body></html>');
    doc.close();
    const picture = doc.createElement('img');
    picture.alt = 'CSCO 分享卡片';
    picture.onload = () => {
      try { frame.contentWindow?.focus(); frame.contentWindow?.print(); }
      catch { setShareStatus('请保存 PNG 后使用系统打印。'); }
    };
    picture.src = canvas.toDataURL('image/png');
    doc.body.appendChild(picture);
    setTimeout(() => frame.remove(), 120000);
  };

  const reset = () => {
    setText('');
    clearImage();
    setMode('image');
    setTemplate(DEFAULT_TEMPLATE.image);
    setGenerated(false);
    setShareStatus('');
  };

  if (!mounted) return null;

  return createPortal(
    <>
      <button className="shareMomentFloat" onClick={() => { setContext(null); setOpen(true); }} aria-label="分享灵感瞬间">
        <span className="shareMomentIcon">✦</span>
        <span className="shareMomentFloatCopy"><b>分享灵感瞬间</b><small>图片 · 图文 · 文字海报</small></span>
      </button>

      {open && <div className="shareMomentOverlay" role="dialog" aria-modal="true" aria-label="分享灵感瞬间">
        <div className="shareMomentModal shareMomentStudio">
          <header className="shareMomentHeader shareMomentStudioHeader">
            <div>
<small>CSCO · MOMENT STUDIO</small><h2>分享灵感瞬间</h2><p>选择一种表达方式和版式，把会议里的照片与观点生成一张 1080 × 1080 分享卡片。</p></div>
            <button className="shareMomentClose" onClick={() => setOpen(false)} aria-label="关闭">×</button>
          </header>
          {context && <aside className="shareMomentContext" aria-label="当前会议内容">
            <span>正在记录这场内容</span>
            <strong>{context.title}</strong>
            <small>{context.speaker} · {context.dateTime}</small>
            <small>{context.program}{context.session ? ` · ${context.session}` : ''}</small>
          </aside>}

          <div className="shareMomentModeTabs" role="tablist" aria-label="卡片类型">
            <button className={mode === 'image' ? 'isActive' : ''} onClick={() => setShareMode('image')}><ModeIcon mode="image"/><span><b>纯图模式</b><small>让照片成为主角</small></span></button>
            <button className={mode === 'mixed' ? 'isActive' : ''} onClick={() => setShareMode('mixed')}><ModeIcon mode="mixed"/><span><b>图文模式</b><small>照片 + 听会心得</small></span></button>
            <button className={mode === 'text' ? 'isActive' : ''} onClick={() => setShareMode('text')}><ModeIcon mode="text"/><span><b>文字海报</b><small>只留下一个观点</small></span></button>
          </div>

          <div className="shareMomentStudioBody">
            <section className="shareMomentControls">
              {mode !== 'text' && <div className="shareMomentControlBlock">
                <div className="shareMomentFieldTitle"><b>01</b><span>会议图片</span><em>单张</em></div>
                <div className={`shareMomentUploader shareMomentUploaderCompact ${imageUrl ? 'hasImage' : ''}`}>
                  {imageUrl ? <>
                    <div
                      className="shareMomentCropViewport"
                      onPointerDown={startCropDrag}
                      onPointerMove={moveCrop}
                      onPointerUp={endCropDrag}
                      onPointerCancel={endCropDrag}
                      aria-label="图片裁剪预览，可拖动图片调整取景"
                    >
                      <img
                        className="shareMomentCropImage"
                        src={imageUrl}
                        alt="待分享会议图片裁剪预览"
                        style={{
                          objectPosition: `${imageCrop.x}% ${imageCrop.y}%`,
                          transform: `scale(${imageCrop.zoom})`,
                          transformOrigin: `${imageCrop.x}% ${imageCrop.y}%`,
                        }}
                        draggable={false}
                      />
                      <span className="shareMomentCropGrid" aria-hidden />
                      <small>拖动图片调整取景</small>
                    </div>
                    <div className="shareMomentImageActions"><span title={imageName}>{imageName}</span><button type="button" onClick={clearImage}>移除</button></div>
                    <div className="shareMomentCropTools" aria-label="图片裁剪工具">
                      <header><div><b>裁剪图片</b><span>拖动取景框，或精确调整滑块</span></div><button type="button" onClick={() => updateImageCrop(DEFAULT_IMAGE_CROP)}>重置</button></header>
                      <label><span>缩放 <b>{imageCrop.zoom.toFixed(1)}×</b></span><input type="range" min="1" max="3" step="0.1" value={imageCrop.zoom} onChange={(event) => updateImageCrop({ ...imageCrop, zoom: Number(event.target.value) })} /></label>
                      <div className="shareMomentCropAxis">
                        <label><span>水平 <b>{Math.round(imageCrop.x)}%</b></span><input type="range" min="0" max="100" value={imageCrop.x} onChange={(event) => updateImageCrop({ ...imageCrop, x: Number(event.target.value) })} /></label>
                        <label><span>垂直 <b>{Math.round(imageCrop.y)}%</b></span><input type="range" min="0" max="100" value={imageCrop.y} onChange={(event) => updateImageCrop({ ...imageCrop, y: Number(event.target.value) })} /></label>
                      </div>
                    </div>
                  </> : <>
                    <button className="shareMomentDesktopUpload" onClick={() => fileInputRef.current?.click()}><strong>＋</strong><span>选择本地图片</span><small>JPG / PNG / WEBP</small></button>
                    <div className="shareMomentMobileSourceActions">
                      <button type="button" onClick={() => cameraInputRef.current?.click()}><b>拍照</b><small>调用相机</small></button>
                      <button type="button" onClick={() => fileInputRef.current?.click()}><b>相册</b><small>选择图片</small></button>
                    </div>
                  </>}
                  <input ref={fileInputRef} type="file" accept="image/*" onChange={onImageChange} hidden />
                  <input ref={cameraInputRef} type="file" accept="image/*" capture="environment" onChange={onImageChange} hidden />
                </div>
              </div>}

              {mode !== 'image' && <div className="shareMomentControlBlock">
                <div className="shareMomentFieldTitle"><b>{mode === 'mixed' ? '02' : '01'}</b><span>心得文字</span><em>{text.length}/{MAX_TEXT}</em></div>
                <textarea maxLength={MAX_TEXT} value={text} onChange={(event) => { setText(event.target.value); setGenerated(false); setShareStatus(''); }} placeholder="写下今天最值得留下的一句话，或一个改变你判断的观点……" />
              </div>}

              <div className="shareMomentControlBlock shareMomentTemplateBlock">
                <div className="shareMomentFieldTitle"><b>{mode === 'mixed' ? '03' : '02'}</b><span>选择版式</span><em>4 套</em></div>
                <div className="shareMomentTemplateGrid">
                  {currentTemplates.map((item, index) => <button key={item.id} className={template === item.id ? 'isActive' : ''} onClick={() => { setTemplate(item.id); setGenerated(false); }}>
                    <div className={`shareMomentTemplateThumb thumb-${item.id}`}><i>{String(index + 1).padStart(2, '0')}</i><span>{mode === 'image' ? '▧' : mode === 'mixed' ? '▤' : '“Aa”'}</span></div>
                    <b>{item.name}</b><small>{item.subtitle}</small>
                  </button>)}
                </div>
              </div>
            </section>

            <section className="shareMomentLivePanel">
              <div className="shareMomentLiveHeader"><div><small>LIVE PREVIEW</small><b>实时预览</b></div><span>1080 × 1080 PNG</span></div>
              <div className="shareMomentPreviewStage shareMomentStudioPreview">
                <div ref={cardRef} className={`shareMomentCard shareMomentCard-${mode} template-${template}`}>
                  <CardArtwork mode={mode} template={template} imageUrl={imageUrl} imageCrop={imageCrop} text={text} />
                </div>
              </div>
              <div className="shareMomentStatusRow">
                <span className={canGenerate ? 'isReady' : ''}>{canGenerate ? '● 内容已就绪' : mode === 'mixed' ? '○ 请上传图片并填写文字' : mode === 'image' ? '○ 请先上传一张图片' : '○ 请先填写心得文字'}</span>
                {generated && <b>✓ 卡片已生成，可保存或打印</b>}
              </div>
            </section>
          </div>

          <footer className="shareMomentFooter shareMomentStudioFooter">
            <span>内容仅在当前浏览器中处理，不会上传服务器。</span>
            <div className="shareMomentFooterActions">
              <button className="shareMomentTextButton" onClick={reset}>清空重做</button>
              {generated && <><button className="shareMomentPrint" onClick={printCard} disabled={busy}>打印卡片 ↗</button><button className="shareMomentSave" onClick={savePng} disabled={busy}>{busy ? '生成中…' : '保存 PNG ↓'}</button><button className="shareMomentSystemShare" onClick={sharePng} disabled={busy}>{busy ? '生成中…' : '系统分享 ↗'}</button></>}
              <button className="shareMomentPrimary" disabled={!canGenerate || busy} onClick={() => { setGenerated(true); setShareStatus(''); }}>{generated ? '重新生成卡片 ↗' : '分享 · 生成卡片 ↗'}</button>
              {shareStatus && <small className="shareMomentShareStatus" role="status">{shareStatus}</small>}
            </div>
          </footer>
        </div>
      </div>}
    </>,
    document.body,
  );
}
