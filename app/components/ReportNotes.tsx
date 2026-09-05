'use client';
import { deferred } from '../lib/deferred';
import { useDialog } from '../lib/useDialog';


import { useEffect, useRef, useState } from 'react';
import type { ChangeEvent } from 'react';
import type { Editor } from '@tiptap/core';
import Image from '@tiptap/extension-image';
import {
  loadStoredNote,
  persistStoredNote,
  stageStoredNote,
  readRecordingRecords,
  removeRecordingRecord,
  writeRecordingRecord,
  type StoredRecording,
} from '../lib/noteStorage';
import { TextStyleKit } from '@tiptap/extension-text-style';
import Underline from '@tiptap/extension-underline';
import { EditorContent, useEditor } from '@tiptap/react';
import StarterKit from '@tiptap/starter-kit';
import { createPortal } from 'react-dom';
import type { Report } from '../lib/reports';
import { BrandLockup, HuiduQrCallout } from './BrandLockup';
const renderPdf: typeof import('./ExportCenter').renderPdf = async (...args) => (await import('./ExportCenter')).renderPdf(...args);

const MAX_RECORDING_MS = 10 * 60 * 1000;
const MAX_IMAGE_BYTES = 8 * 1024 * 1024;


type RecordingItem = StoredRecording & { url: string };
type RecordingStatus = 'idle' | 'requesting' | 'recording' | 'saving';
type SaveStatus = 'loading' | 'saved' | 'pending' | 'error';
type ManualSaveStatus = 'idle' | 'saving' | 'saved' | 'error';
type RecordingController = {
  items: RecordingItem[];
  status: RecordingStatus;
  elapsedMs: number;
  error: string;
  loaded: boolean;
  startRecording: () => Promise<void>;
  stopRecording: () => void;
  renameRecording: (id: string, title: string) => Promise<void>;
  deleteRecording: (id: string) => Promise<void>;
};


function storedRecording(item: RecordingItem): StoredRecording {
  return {
    id: item.id,
    reportId: item.reportId,
    title: item.title,
    blob: item.blob,
    mimeType: item.mimeType,
    durationMs: item.durationMs,
    createdAt: item.createdAt,
  };
}

function formatDuration(durationMs: number) {
  const totalSeconds = Math.max(0, Math.round(durationMs / 1000));
  const minutes = Math.floor(totalSeconds / 60);
  const seconds = totalSeconds % 60;
  return `${String(minutes).padStart(2, '0')}:${String(seconds).padStart(2, '0')}`;
}

function recordingExtension(mimeType: string) {
  if (mimeType.includes('mp4')) return 'm4a';
  if (mimeType.includes('ogg')) return 'ogg';
  if (mimeType.includes('wav')) return 'wav';
  return 'webm';
}

function safeFilename(value: string) {
  return value.trim().replace(/[\\/:*?"<>|]/g, '-').slice(0, 80) || '未命名录音';
}

function preferredAudioMimeType() {
  const candidates = [
    'audio/mp4;codecs=mp4a.40.2',
    'audio/webm;codecs=opus',
    'audio/ogg;codecs=opus',
    'audio/webm',
  ];
  return candidates.find((candidate) => MediaRecorder.isTypeSupported(candidate)) ?? '';
}

async function imageFileToDataUrl(file: File) {
  if (!['image/jpeg', 'image/png', 'image/webp', 'image/gif'].includes(file.type)) {
    throw new Error('请选择 JPG、PNG、WebP 或 GIF 图片。');
  }
  if (file.size > MAX_IMAGE_BYTES) throw new Error('单张图片不能超过 8 MB。');

  const bitmap = await createImageBitmap(file);
  const scale = Math.min(1, 1800 / Math.max(bitmap.width, bitmap.height));
  const canvas = document.createElement('canvas');
  canvas.width = Math.max(1, Math.round(bitmap.width * scale));
  canvas.height = Math.max(1, Math.round(bitmap.height * scale));
  const context = canvas.getContext('2d');
  if (!context) {
    bitmap.close();
    throw new Error('浏览器无法处理这张图片。');
  }
  context.fillStyle = '#fffdf8';
  context.fillRect(0, 0, canvas.width, canvas.height);
  context.drawImage(bitmap, 0, 0, canvas.width, canvas.height);
  bitmap.close();
  return canvas.toDataURL(file.type === 'image/png' ? 'image/png' : 'image/jpeg', 0.88);
}

async function waitForImages(root: HTMLElement) {
  await Promise.all(Array.from(root.querySelectorAll('img')).map(async (image) => {
    if (!image.complete) {
      const { promise, resolve } = deferred<void>();
      image.addEventListener('load', () => resolve(), { once: true });
      image.addEventListener('error', () => resolve(), { once: true });
      await promise;
    }
    try {
      await image.decode();
    } catch {
      // html2canvas will surface an unreadable image as a PDF generation error.
    }
  }));
}

const ColoredUnderline = Underline.extend({
  addAttributes() {
    return {
      ...this.parent?.(),
      underlineColor: {
        default: null,
        parseHTML: (element) => element.style.textDecorationColor || null,
        renderHTML: (attributes) => attributes.underlineColor
          ? { style: `text-decoration-color: ${attributes.underlineColor}` }
          : {},
      },
    };
  },
});

const EDITOR_EXTENSIONS = [
  StarterKit.configure({
    heading: { levels: [1, 2, 3] },
    underline: false,
  }),
  TextStyleKit,
  ColoredUnderline,
  Image.configure({
    allowBase64: true,
    HTMLAttributes: { class: 'noteEmbeddedImage' },
  }),
];

function NoteToolbar({ editor, onInsertImage }: {
  editor: Editor;
  onInsertImage: () => void;
}) {
  const heading = editor.isActive('heading', { level: 1 })
    ? '1'
    : editor.isActive('heading', { level: 2 })
      ? '2'
      : editor.isActive('heading', { level: 3 }) ? '3' : '0';
  const textStyle = editor.getAttributes('textStyle');

  return (
    <div className="noteToolbar" role="toolbar" aria-label="笔记格式工具栏">
      <label className="noteToolbarSelect">
        <span>标题</span>
        <select
          value={heading}
          onChange={(event) => {
            const level = Number(event.target.value);
            if (level === 0) editor.chain().focus().setParagraph().run();
            else editor.chain().focus().setHeading({ level: level as 1 | 2 | 3 }).run();
          }}
          aria-label="段落与标题级别"
        >
          <option value="0">正文</option>
          <option value="1">一级标题</option>
          <option value="2">二级标题</option>
          <option value="3">三级标题</option>
        </select>
      </label>
      <label className="noteToolbarSelect">
        <span>字体</span>
        <select
          value={textStyle.fontFamily ?? ''}
          onChange={(event) => {
            const value = event.target.value;
            if (value) editor.chain().focus().setFontFamily(value).run();
            else editor.chain().focus().unsetFontFamily().run();
          }}
          aria-label="字体"
        >
          <option value="">默认字体</option>
          <option value="Microsoft YaHei">微软雅黑</option>
          <option value="SimSun">宋体</option>
          <option value="KaiTi">楷体</option>
          <option value="Arial">Arial</option>
          <option value="Georgia">Georgia</option>
        </select>
      </label>
      <label className="noteToolbarSelect isCompact">
        <span>字号</span>
        <select
          value={textStyle.fontSize ?? ''}
          onChange={(event) => {
            const value = event.target.value;
            if (value) editor.chain().focus().setFontSize(value).run();
            else editor.chain().focus().unsetFontSize().run();
          }}
          aria-label="字号"
        >
          <option value="">默认</option>
          {[12, 14, 16, 18, 22, 28, 36].map((size) => (
            <option value={`${size}px`} key={size}>{size}px</option>
          ))}
        </select>
      </label>
      <div className="noteToolbarButtons">
        <button type="button" className={editor.isActive('bold') ? 'isActive' : ''} onClick={() => editor.chain().focus().toggleBold().run()} aria-label="粗体" title="粗体">B</button>
        <button type="button" className={editor.isActive('italic') ? 'isActive' : ''} onClick={() => editor.chain().focus().toggleItalic().run()} aria-label="斜体" title="斜体"><i>I</i></button>
        <button type="button" className={editor.isActive('underline') ? 'isActive' : ''} onClick={() => editor.chain().focus().toggleUnderline().run()} aria-label="下划线" title="下划线"><u>U</u></button>
        <button type="button" className={editor.isActive('orderedList') ? 'isActive' : ''} onClick={() => editor.chain().focus().toggleOrderedList().run()} aria-label="有序列表" title="有序列表">1.</button>
        <button type="button" className={editor.isActive('bulletList') ? 'isActive' : ''} onClick={() => editor.chain().focus().toggleBulletList().run()} aria-label="无序列表" title="无序列表">•</button>
      </div>
      <div className="noteColorTools">
        <label title="字体颜色"><span style={{ color: '#ed624f' }}>A</span><input type="color" defaultValue="#18251e" onChange={(event) => editor.chain().focus().setColor(event.target.value).run()} aria-label="字体颜色" /></label>
        <label title="高亮颜色"><span className="highlightSwatch">A</span><input type="color" defaultValue="#fff09b" onChange={(event) => editor.chain().focus().setBackgroundColor(event.target.value).run()} aria-label="高亮颜色" /></label>
        <label title="下划线颜色"><span className="underlineSwatch">U</span><input type="color" defaultValue="#ed624f" onChange={(event) => editor.chain().focus().setUnderline().updateAttributes('underline', { underlineColor: event.target.value }).run()} aria-label="下划线颜色" /></label>
      </div>
      <div className="noteToolbarButtons noteToolbarUtility">
        <button type="button" onClick={onInsertImage} aria-label="在光标位置插入图片" title="插入图片">图片＋</button>
        <button type="button" onClick={() => editor.chain().focus().unsetAllMarks().clearNodes().run()} aria-label="清除格式" title="清除格式">清格式</button>
        <button type="button" disabled={!editor.can().chain().focus().undo().run()} onClick={() => editor.chain().focus().undo().run()} aria-label="撤销" title="撤销">↶</button>
        <button type="button" disabled={!editor.can().chain().focus().redo().run()} onClick={() => editor.chain().focus().redo().run()} aria-label="重做" title="重做">↷</button>
      </div>
    </div>
  );
}

function RecordingCard({ item, onRename, onDelete }: {
  item: RecordingItem;
  onRename: (id: string, title: string) => void;
  onDelete: (id: string) => void;
}) {
  const extension = recordingExtension(item.mimeType);
  return (
    <article className="recordingCard">
      <div className="recordingIndex" aria-hidden>REC</div>
      <div className="recordingContent">
        <input
          defaultValue={item.title}
          aria-label="录音标题"
          onBlur={(event) => onRename(item.id, event.target.value)}
          onKeyDown={(event) => {
            if (event.key === 'Enter') event.currentTarget.blur();
          }}
        />
        <div className="recordingMeta">
          <span>{formatDuration(item.durationMs)}</span>
          <span>{new Date(item.createdAt).toLocaleString('zh-CN')}</span>
          <span>{extension.toUpperCase()}</span>
        </div>
        <audio controls preload="metadata" src={item.url}>当前浏览器不支持音频播放。</audio>
      </div>
      <div className="recordingActions">
        <a href={item.url} download={`${safeFilename(item.title)}.${extension}`}>下载</a>
        <button type="button" onClick={() => onDelete(item.id)}>删除</button>
      </div>
    </article>
  );
}

function useRecordings(reportId: number) {
  const [items, setItems] = useState<RecordingItem[]>([]);
  const [status, setStatus] = useState<RecordingStatus>('idle');
  const [elapsedMs, setElapsedMs] = useState(0);
  const [error, setError] = useState('');
  const [loaded, setLoaded] = useState(false);
  const itemsRef = useRef<RecordingItem[]>([]);
  const mountedRef = useRef(false);
  const recordingRequestedRef = useRef(false);
  const recorderRef = useRef<MediaRecorder | null>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const chunksRef = useRef<Blob[]>([]);
  const segmentStartedAtRef = useRef(0);
  const rotationTimerRef = useRef<number | null>(null);
  const elapsedTimerRef = useRef<number | null>(null);
  const nextRecordingNumberRef = useRef(1);

  useEffect(() => {
    mountedRef.current = true;
    let cancelled = false;
    readRecordingRecords(reportId).then((records) => {
      const loadedItems = records.map((record) => ({ ...record, url: URL.createObjectURL(record.blob) }));
      if (cancelled) {
        loadedItems.forEach((item) => URL.revokeObjectURL(item.url));
        return;
      }
      itemsRef.current = loadedItems;
      nextRecordingNumberRef.current = loadedItems.length + 1;
      setItems(loadedItems);
      setLoaded(true);
    }).catch(() => {
      if (!cancelled) {
        setError('浏览器无法读取已保存的录音；新录音仍可在本次页面中下载。');
        setLoaded(true);
      }
    });

    return () => {
      cancelled = true;
      mountedRef.current = false;
      recordingRequestedRef.current = false;
      if (rotationTimerRef.current !== null) window.clearTimeout(rotationTimerRef.current);
      if (elapsedTimerRef.current !== null) window.clearInterval(elapsedTimerRef.current);
      const recorder = recorderRef.current;
      if (recorder?.state === 'recording' || recorder?.state === 'paused') recorder.stop();
      else streamRef.current?.getTracks().forEach((track) => track.stop());
      itemsRef.current.forEach((item) => URL.revokeObjectURL(item.url));
    };
  }, [reportId]);

  async function persistSegment(blob: Blob, mimeType: string, durationMs: number) {
    const createdAt = Date.now();
    const number = nextRecordingNumberRef.current++;
    const record: StoredRecording = {
      id: crypto.randomUUID(),
      reportId,
      title: `录音 ${String(number).padStart(2, '0')} · ${new Date(createdAt).toLocaleTimeString('zh-CN', { hour: '2-digit', minute: '2-digit' })}`,
      blob,
      mimeType,
      durationMs,
      createdAt,
    };
    try {
      await writeRecordingRecord(record);
    } catch {
      if (mountedRef.current) setError('这段录音未能写入浏览器存储，请在关闭页面前下载。');
    }
    if (!mountedRef.current) return;
    const item = { ...record, url: URL.createObjectURL(record.blob) };
    const nextItems = [...itemsRef.current, item];
    itemsRef.current = nextItems;
    setItems(nextItems);
  }

  function startSegment(stream: MediaStream) {
    if (!recordingRequestedRef.current) return;
    const preferredMimeType = preferredAudioMimeType();
    let recorder: MediaRecorder;
    try {
      recorder = preferredMimeType
        ? new MediaRecorder(stream, { mimeType: preferredMimeType })
        : new MediaRecorder(stream);
    } catch {
      recordingRequestedRef.current = false;
      stream.getTracks().forEach((track) => track.stop());
      if (mountedRef.current) {
        setStatus('idle');
        setError('当前浏览器无法创建音频录制器。');
      }
      return;
    }

    recorderRef.current = recorder;
    chunksRef.current = [];
    segmentStartedAtRef.current = Date.now();
    if (rotationTimerRef.current !== null) window.clearTimeout(rotationTimerRef.current);
    if (elapsedTimerRef.current !== null) window.clearInterval(elapsedTimerRef.current);

    recorder.ondataavailable = (event) => {
      if (event.data.size > 0) chunksRef.current.push(event.data);
    };
    recorder.onerror = () => {
      recordingRequestedRef.current = false;
      if (mountedRef.current) setError('录音过程中发生错误，已尝试保存当前片段。');
    };
    recorder.onstop = () => {
      if (rotationTimerRef.current !== null) window.clearTimeout(rotationTimerRef.current);
      if (elapsedTimerRef.current !== null) window.clearInterval(elapsedTimerRef.current);
      rotationTimerRef.current = null;
      elapsedTimerRef.current = null;
      const durationMs = Math.min(MAX_RECORDING_MS, Date.now() - segmentStartedAtRef.current);
      const mimeType = recorder.mimeType || preferredMimeType || 'audio/webm';
      const blob = new Blob(chunksRef.current, { type: mimeType });
      const shouldContinue = recordingRequestedRef.current
        && stream.getAudioTracks().some((track) => track.readyState === 'live');

      if (blob.size > 0) void persistSegment(blob, mimeType, durationMs);
      else if (mountedRef.current) setError('当前片段没有收到音频数据，未创建空录音。');

      const finishSession = () => {
        stream.getTracks().forEach((track) => track.stop());
        streamRef.current = null;
        recorderRef.current = null;
        if (mountedRef.current) {
          setElapsedMs(0);
          setStatus(blob.size > 0 ? 'saving' : 'idle');
          queueMicrotask(() => {
            if (mountedRef.current) setStatus('idle');
          });
        }
      };
      if (shouldContinue) {
        queueMicrotask(() => {
          const canContinue = recordingRequestedRef.current
            && stream.getAudioTracks().some((track) => track.readyState === 'live');
          if (canContinue) startSegment(stream);
          else finishSession();
        });
      } else {
        finishSession();
      }
    };

    try {
      recorder.start(1000);
    } catch {
      recordingRequestedRef.current = false;
      stream.getTracks().forEach((track) => track.stop());
      if (mountedRef.current) {
        setStatus('idle');
        setError('麦克风已连接，但浏览器未能开始录音。');
      }
      return;
    }

    if (mountedRef.current) {
      setError('');
      setElapsedMs(0);
      setStatus('recording');
    }
    elapsedTimerRef.current = window.setInterval(() => {
      if (mountedRef.current) {
        setElapsedMs(Math.min(MAX_RECORDING_MS, Date.now() - segmentStartedAtRef.current));
      }
    }, 500);
    rotationTimerRef.current = window.setTimeout(() => {
      if (recorder.state === 'recording' && recordingRequestedRef.current) recorder.stop();
    }, MAX_RECORDING_MS);
  }

  async function startRecording() {
    if (!loaded || status !== 'idle') return;
    if (!navigator.mediaDevices?.getUserMedia || typeof MediaRecorder === 'undefined') {
      setError('当前浏览器不支持录音，请使用最新版 Chrome、Edge 或 Safari。');
      return;
    }
    recordingRequestedRef.current = true;
    setError('');
    setStatus('requesting');
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      if (!recordingRequestedRef.current || !mountedRef.current) {
        stream.getTracks().forEach((track) => track.stop());
        return;
      }
      streamRef.current = stream;
      stream.getAudioTracks().forEach((track) => {
        track.addEventListener('ended', () => {
          if (!recordingRequestedRef.current) return;
          recordingRequestedRef.current = false;
          if (mountedRef.current) setError('麦克风连接已中断，当前录音已停止。');
          const recorder = recorderRef.current;
          if (recorder?.state === 'recording' || recorder?.state === 'paused') recorder.stop();
        }, { once: true });
      });
      startSegment(stream);
    } catch (caught) {
      recordingRequestedRef.current = false;
      if (mountedRef.current) {
        setStatus('idle');
        setError(caught instanceof DOMException && caught.name === 'NotAllowedError'
          ? '没有获得麦克风权限。请在浏览器地址栏中允许后重试。'
          : '无法连接麦克风，请检查系统输入设备。');
      }
    }
  }

  function stopRecording() {
    recordingRequestedRef.current = false;
    if (rotationTimerRef.current !== null) window.clearTimeout(rotationTimerRef.current);
    const recorder = recorderRef.current;
    if (recorder?.state === 'recording' || recorder?.state === 'paused') {
      setStatus('saving');
      recorder.stop();
    }
  }

  async function renameRecording(id: string, nextTitle: string) {
    const item = itemsRef.current.find((candidate) => candidate.id === id);
    if (!item) return;
    const title = nextTitle.trim() || '未命名录音';
    const updated = { ...item, title };
    const nextItems = itemsRef.current.map((candidate) => candidate.id === id ? updated : candidate);
    itemsRef.current = nextItems;
    setItems(nextItems);
    try {
      await writeRecordingRecord(storedRecording(updated));
    } catch {
      setError('录音标题未能写入浏览器存储。');
    }
  }

  async function deleteRecording(id: string) {
    const item = itemsRef.current.find((candidate) => candidate.id === id);
    if (!item || !window.confirm(`删除“${item.title}”？此操作无法撤销。`)) return;
    try {
      await removeRecordingRecord(id);
      URL.revokeObjectURL(item.url);
      const nextItems = itemsRef.current.filter((candidate) => candidate.id !== id);
      itemsRef.current = nextItems;
      setItems(nextItems);
    } catch {
      setError('录音删除失败，请刷新后重试。');
    }
  }

  return {
    items,
    status,
    elapsedMs,
    error,
    loaded,
    startRecording,
    stopRecording,
    renameRecording,
    deleteRecording,
  };
}

function RecordingPanel({ recordings }: {
  recordings: RecordingController;
}) {
  const isRecording = recordings.status === 'recording';
  const isBusy = recordings.status === 'requesting' || recordings.status === 'saving';
  const statusText = recordings.status === 'requesting'
    ? '正在等待麦克风权限…'
    : recordings.status === 'saving'
      ? '正在保存当前片段…'
      : isRecording
        ? `正在录音 ${formatDuration(recordings.elapsedMs)} / 10:00`
        : '每段最长 10 分钟；到时自动保存，并立即继续下一段。';

  return (
    <section className="audioNoteSection" aria-labelledby="audio-note-title">
      <div className="audioNoteHeading">
        <div>
          <span className="sectionKicker">本机录制 · 自动分段</span>
          <h4 id="audio-note-title">录音笔记</h4>
        </div>
        <span>{recordings.items.length} 条录音</span>
      </div>
      <p className="microphonePermissionNotice">
        <span aria-hidden>MIC</span>
        <strong>麦克风录音需要浏览器授权。</strong>
        <small>首次使用时，请在浏览器的权限提示中选择“允许”。</small>
      </p>
      <div className={`recorderConsole ${isRecording ? 'isRecording' : ''}`}>
        <button
          type="button"
          className="recordButton"
          disabled={!recordings.loaded || isBusy}
          onClick={isRecording ? recordings.stopRecording : recordings.startRecording}
          aria-label={isRecording ? '停止并保存录音' : '开始录音'}
        >
          <span aria-hidden>{isRecording ? '■' : '●'}</span>
          {isRecording ? '停止并保存' : '开始录音'}
        </button>
        <div className="recordingStatus" aria-live="polite">
          <strong>{statusText}</strong>
          <div><span style={{ width: `${Math.min(100, recordings.elapsedMs / MAX_RECORDING_MS * 100)}%` }} /></div>
          <small>保存格式：M4A / WebM / OGG（由当前浏览器决定）</small>
        </div>
      </div>
      {recordings.error && <p className="recordingError" role="alert">{recordings.error}</p>}
      {recordings.items.length > 0 && (
        <div className="recordingList">
          {recordings.items.map((item) => (
            <RecordingCard
              key={item.id}
              item={item}
              onRename={recordings.renameRecording}
              onDelete={recordings.deleteRecording}
            />
          ))}
        </div>
      )}
    </section>
  );
}

function SingleNoteDocument({ report, html, textLength, recordings }: {
  report: Report;
  html: string;
  textLength: number;
  recordings: RecordingItem[];
}) {
  return (
    <div className="pdfDocument singleNoteDocument singleNotePagedDocument">
      <header className="singleNotePageChromeHeader" data-pdf-page-header>
        <BrandLockup compact />
        <div>
          <span>CSCO 2026 · REPORT NOTE</span>
          <b>{report.speaker} · {report.field}</b>
        </div>
      </header>
      <main className="singleNotePageContent" data-pdf-page-content>
        <header className="singleNoteHeader" data-pdf-keep>
          <div><span>CSCO 2026 · REPORT NOTE</span><h1>单场听会笔记</h1></div>
        </header>
        <section className="singleNoteReport" data-pdf-keep>
          <small>{report.field} · {report.directions.slice(0, 2).join(' / ')}</small>
          <h2>{report.sourceTitle}</h2>
          <div>
            <span><i>时间</i>{report.dateTime}</span>
            <span><i>报告人</i>{report.speaker}</span>
            <span><i>单位</i>{report.institution}</span>
          </div>
        </section>
        <section className="singleNoteBody singleNoteRichBody">
          <header data-pdf-keep><span>MY NOTES</span><b>{textLength} 字 · {recordings.length} 条录音</b></header>
          <div className="noteRichContent singleNoteRichText" dangerouslySetInnerHTML={{ __html: html || '<p></p>' }} />
        </section>
        {recordings.length > 0 && (
          <section className="pdfRecordingList">
            <header data-pdf-keep><span>AUDIO NOTES</span><b>{recordings.length} 条</b></header>
            {recordings.map((recording, index) => (
              <div key={recording.id} data-pdf-keep>
                <b>{String(index + 1).padStart(2, '0')}</b>
                <span>{recording.title}</span>
                <small>{formatDuration(recording.durationMs)} · {new Date(recording.createdAt).toLocaleString('zh-CN')} · 音频请在网页笔记中播放</small>
              </div>
            ))}
          </section>
        )}
      </main>
      <footer className="singleNotePageChromeFooter" data-pdf-page-footer>
        <HuiduQrCallout compact />
        <span>保存于 {new Date().toLocaleDateString('zh-CN')}</span>
        <b aria-hidden="true" />
      </footer>
    </div>
  );
}

function SingleNoteExport({ report, html, textLength, recordings, onClose }: {
  report: Report;
  html: string;
  textLength: number;
  recordings: RecordingItem[];
  onClose: () => void;
}) {
  const [stage, setStage] = useState<'generating' | 'preview' | 'error'>('generating');
  const [pdfUrl, setPdfUrl] = useState('');
  const [previewImages, setPreviewImages] = useState<string[]>([]);
  const [portalReady, setPortalReady] = useState(false);
  useDialog('.singleNoteExportOverlay', onClose, portalReady);
  const sourceRef = useRef<HTMLDivElement>(null);
  const filename = `CSCO2026-${safeFilename(report.speaker)}-听会笔记.pdf`;

  useEffect(() => {
    const frame = requestAnimationFrame(() => setPortalReady(true));
    return () => cancelAnimationFrame(frame);
  }, []);

  useEffect(() => () => {
    if (pdfUrl) URL.revokeObjectURL(pdfUrl);
  }, [pdfUrl]);

  useEffect(() => {
    if (!portalReady || !sourceRef.current) return;
    let cancelled = false;
    const source = sourceRef.current;
    const build = async () => {
      try {
        await document.fonts?.ready;
        await waitForImages(source);
        source.classList.add('isCapturing');
        const { promise, resolve } = deferred<void>();
        requestAnimationFrame(() => requestAnimationFrame(() => resolve()));
        await promise;
        const rect = source.getBoundingClientRect();
        if (rect.width < 500 || rect.height < 500 || rect.left < -1) {
          throw new Error('Single-note PDF source is unavailable.');
        }
        const { blob, previews } = await renderPdf(source, rect, {
          preserveBrowserTextLayout: true,
          repeatingPageChrome: {
            contentSelector: '[data-pdf-page-content]',
            headerSelector: '[data-pdf-page-header]',
            footerSelector: '[data-pdf-page-footer]',
          },
        });
        if (blob.size < 8000) throw new Error('Single-note PDF is unexpectedly small.');
        if (cancelled) return;
        setPdfUrl(URL.createObjectURL(blob));
        setPreviewImages(previews);
        setStage('preview');
      } catch (error) {
        console.error(error);
        if (!cancelled) setStage('error');
      } finally {
        source.classList.remove('isCapturing');
      }
    };
    void build();
    return () => {
      cancelled = true;
    };
  }, [portalReady]);

  const print = () => {
    const frame = document.querySelector<HTMLIFrameElement>('.singleNotePrintFrame');
    frame?.contentWindow?.focus();
    frame?.contentWindow?.print();
  };

  const dialog = (
    <div className="exportOverlay singleNoteExportOverlay" role="dialog" aria-modal="true" aria-label="导出单场听会笔记">
      <div className="exportModal previewMode">
        <header className="exportTop">
          <div><span>ONE REPORT · AUTO PAGINATION</span><h2>导出听会笔记</h2></div>
          <button onClick={onClose} aria-label="关闭笔记导出">×</button>
        </header>
        {stage === 'generating' && (
          <div className="exportGenerating">
            <span className="generatingOrb">PDF</span>
            <h3>正在排版并自动分页</h3>
            <p>文字、格式和插图将按 A4 页面长度继续扩展。</p>
          </div>
        )}
        {stage === 'error' && (
          <div className="exportError">
            <b>生成没有完成</b>
            <p>笔记仍已保存在浏览器中，可以关闭后重新尝试。</p>
            <button onClick={onClose}>关闭</button>
          </div>
        )}
        {stage === 'preview' && (
          <div className="previewArea">
            <div className="previewToolbar">
              <div><b>{previewImages.length} 页 PDF 预览</b><span>{filename}</span></div>
              <a href={pdfUrl} download={filename}>保存到本地 ↓</a>
              <button className="printButton" onClick={print}>打印 ↗</button>
            </div>
            <div className="pdfPreviewPages">
              {previewImages.map((image, index) => (
                <figure key={index}>
                  <img src={image} alt={`${filename} 第 ${index + 1} 页`} />
                  <figcaption>{index + 1} / {previewImages.length}</figcaption>
                </figure>
              ))}
            </div>
            <iframe className="pdfPrintFrame singleNotePrintFrame" src={pdfUrl} title={`${filename} 打印文件`} />
          </div>
        )}
      </div>
    </div>
  );

  return portalReady
    ? createPortal(
      <>
        {dialog}
        <div className="pdfSource" aria-hidden="true" ref={sourceRef}>
          <SingleNoteDocument report={report} html={html} textLength={textLength} recordings={recordings} />
        </div>
      </>,
      document.body,
    )
    : null;
}

export default function ReportNotes({ report }: { report: Report }) {
  const [textLength, setTextLength] = useState(0);
  const [saveStatus, setSaveStatus] = useState<SaveStatus>('loading');
  const [savedAt, setSavedAt] = useState(0);
  const [manualSaveStatus, setManualSaveStatus] = useState<ManualSaveStatus>('idle');
  const [imageError, setImageError] = useState('');
  const [exportSnapshot, setExportSnapshot] = useState<{
    html: string;
    textLength: number;
    recordings: RecordingItem[];
  } | null>(null);
  const imageInputRef = useRef<HTMLInputElement>(null);
  const latestHtmlRef = useRef('<p></p>');
  const dirtyRef = useRef(false);
  const loadedRef = useRef(false);
  const saveTimerRef = useRef<number | null>(null);
  const manualSaveFeedbackTimerRef = useRef<number | null>(null);
  const manualSaveRequestRef = useRef(0);
  const mountedRef = useRef(false);
  const recordings = useRecordings(report.id);

  function clearManualSaveFeedback() {
    if (manualSaveFeedbackTimerRef.current !== null) {
      window.clearTimeout(manualSaveFeedbackTimerRef.current);
      manualSaveFeedbackTimerRef.current = null;
    }
  }

  async function persistHtml(nextHtml: string) {
    if (saveTimerRef.current !== null) window.clearTimeout(saveTimerRef.current);
    saveTimerRef.current = null;
    try {
      const updatedAt = await persistStoredNote(report.id, nextHtml);
      if (latestHtmlRef.current === nextHtml) dirtyRef.current = false;
      if (mountedRef.current && latestHtmlRef.current === nextHtml) {
        setSavedAt(updatedAt);
        setSaveStatus('saved');
      }
      return true;
    } catch {
      if (mountedRef.current) setSaveStatus('error');
      return false;
    }
  }

  function scheduleSave(nextHtml: string) {
    manualSaveRequestRef.current += 1;
    clearManualSaveFeedback();
    setManualSaveStatus('idle');
    latestHtmlRef.current = nextHtml;
    dirtyRef.current = true;
    setSaveStatus('pending');
    if (saveTimerRef.current !== null) window.clearTimeout(saveTimerRef.current);
    saveTimerRef.current = window.setTimeout(() => {
      void persistHtml(latestHtmlRef.current);
    }, 800);
  }

  const editor = useEditor({
    extensions: EDITOR_EXTENSIONS,
    content: '<p></p>',
    editable: false,
    immediatelyRender: false,
    editorProps: {
      attributes: {
        class: 'noteRichContent',
        role: 'textbox',
        'aria-label': `${report.sourceTitle}的听会笔记`,
        'aria-multiline': 'true',
        spellcheck: 'true',
      },
    },
    onUpdate: ({ editor: activeEditor }) => {
      const nextHtml = activeEditor.getHTML();
      setTextLength(activeEditor.getText().length);
      scheduleSave(nextHtml);
    },
  }, [report.id]);

  useEffect(() => {
    mountedRef.current = true;
    const flush = () => {
      if (!loadedRef.current || !dirtyRef.current) return;
      try { stageStoredNote(report.id, latestHtmlRef.current); } catch { /* Async persistence will still be attempted. */ }
      void persistStoredNote(report.id, latestHtmlRef.current).catch(() => window.dispatchEvent(new Event('csco:storage-warning')));
    };
    const visibility = () => { if (document.visibilityState === 'hidden') flush(); };
    window.addEventListener('pagehide', flush);
    document.addEventListener('visibilitychange', visibility);
    return () => {
      window.removeEventListener('pagehide', flush);
      document.removeEventListener('visibilitychange', visibility);
      mountedRef.current = false;
      if (saveTimerRef.current !== null) window.clearTimeout(saveTimerRef.current);
      manualSaveRequestRef.current += 1;
      clearManualSaveFeedback();
      if (loadedRef.current && dirtyRef.current) {
        try { stageStoredNote(report.id, latestHtmlRef.current); } catch { /* IDB may still be available. */ }
        void persistStoredNote(report.id, latestHtmlRef.current).catch(() => window.dispatchEvent(new Event('csco:storage-warning')));
      }
    };
  }, [report.id]);

  useEffect(() => {
    if (!editor) return;
    let cancelled = false;
    loadStoredNote(report.id).then((record) => {
      if (cancelled) return;
      editor.commands.setContent(record.html, { emitUpdate: false });
      editor.setEditable(true);
      const normalizedHtml = editor.getHTML();
      latestHtmlRef.current = normalizedHtml;
      loadedRef.current = true;
      setTextLength(editor.getText().length);
      setSavedAt(record.updatedAt);
      setSaveStatus('saved');
      if (record.migrated) {
        void persistStoredNote(report.id, normalizedHtml).then((updatedAt) => {
          if (!cancelled && mountedRef.current) setSavedAt(updatedAt);
        }).catch(() => { if (!cancelled) setSaveStatus('error'); });
      }
    }).catch(() => {
      if (cancelled) return;
      editor.setEditable(false);
      setSaveStatus('error');
    });
    return () => {
      cancelled = true;
    };
  }, [editor, report.id]);

  async function insertImage(event: ChangeEvent<HTMLInputElement>) {
    const file = event.target.files?.[0];
    event.target.value = '';
    if (!file || !editor) return;
    setImageError('');
    try {
      const dataUrl = await imageFileToDataUrl(file);
      editor.chain().focus().setImage({ src: dataUrl, alt: file.name, title: file.name }).run();
    } catch (caught) {
      setImageError(caught instanceof Error ? caught.message : '图片插入失败。');
    }
  }

  async function saveNow() {
    if (!editor || manualSaveStatus === 'saving') return;
    const request = ++manualSaveRequestRef.current;
    clearManualSaveFeedback();
    setManualSaveStatus('saving');
    const saved = await persistHtml(editor.getHTML());
    if (!mountedRef.current || request !== manualSaveRequestRef.current) return;
    setManualSaveStatus(saved ? 'saved' : 'error');
    if (saved) {
      manualSaveFeedbackTimerRef.current = window.setTimeout(() => {
        if (request === manualSaveRequestRef.current) setManualSaveStatus('idle');
        manualSaveFeedbackTimerRef.current = null;
      }, 2200);
    }
  }

  async function openExport() {
    if (!editor) return;
    const currentHtml = editor.getHTML();
    await persistHtml(currentHtml);
    setExportSnapshot({
      html: currentHtml,
      textLength: editor.getText().length,
      recordings: [...recordings.items],
    });
  }

  const saveLabel = saveStatus === 'loading'
    ? '正在载入笔记…'
    : saveStatus === 'pending'
      ? '正在自动保存…'
      : saveStatus === 'error'
        ? '保存失败，请重试'
        : savedAt
          ? `已保存于 ${new Date(savedAt).toLocaleTimeString('zh-CN', { hour: '2-digit', minute: '2-digit' })}`
          : '内容将自动保存在本机';
  const manualSaveLabel = manualSaveStatus === 'saving'
    ? '保存中…'
    : manualSaveStatus === 'saved'
      ? '保存成功'
      : manualSaveStatus === 'error'
        ? '保存失败 · 重试'
        : '立即保存';

  return (
    <section className="learningSection noteEditorSection">
      <div className="noteEditorHeading">
        <div>
          <span className="sectionKicker desktopRecordingCopy">听会记录 · 录音优先 · 本机存储</span>
          <span className="sectionKicker mobileTextNoteCopy">听会记录 · 富文本 · 本机存储</span>
          <h3>笔记区</h3>
          <p className="desktopRecordingCopy">先启动录音保留现场信息，再用文本整理结论、证据与待追问的问题。</p>
          <p className="mobileTextNoteCopy">用文本整理现场结论、数据证据与待追问的问题，内容会自动保存在本机。</p>
        </div>
      </div>
      <RecordingPanel recordings={recordings} />
      <div className="textNoteHeading">
        <div><span className="sectionKicker">富文本 · 自动保存</span><h4>文本笔记</h4></div>
        <button type="button" onClick={() => void openExport()} disabled={!editor || saveStatus === 'loading'}>导出笔记 PDF ↗</button>
      </div>
      {editor && <NoteToolbar editor={editor} onInsertImage={() => imageInputRef.current?.click()} />}
      <input ref={imageInputRef} className="noteImageInput" type="file" accept="image/jpeg,image/png,image/webp,image/gif" onChange={(event) => void insertImage(event)} />
      <div className="noteRichEditor" data-empty={textLength === 0} data-loading={saveStatus === 'loading'}>
        <EditorContent editor={editor} />
      </div>
      {imageError && <p className="noteEditorError" role="alert">{imageError}</p>}
      <div className="noteEditorFooter">
        <span role="status" aria-live="polite" data-status={manualSaveStatus === 'idle' ? saveStatus : manualSaveStatus}>{textLength} 字 · {saveLabel}</span>
        <button
          type="button"
          className="noteSaveButton"
          data-status={manualSaveStatus}
          aria-live="polite"
          onClick={() => void saveNow()}
          disabled={!editor || saveStatus === 'loading' || manualSaveStatus === 'saving'}
        >
          {manualSaveLabel}
        </button>
      </div>
      <div className="noteStorageNotice" role="note">
        <b>仅保存在本机</b>
        <p className="desktopRecordingCopy">笔记和录音目前只保存在当前浏览器，清除站点数据或更换设备后不会自动同步，重要录音应及时下载。</p>
        <p className="mobileTextNoteCopy">笔记目前只保存在当前浏览器，清除站点数据或更换设备后不会自动同步，重要内容请及时导出。</p>
      </div>
      {exportSnapshot && (
        <SingleNoteExport
          report={report}
          html={exportSnapshot.html}
          textLength={exportSnapshot.textLength}
          recordings={exportSnapshot.recordings}
          onClose={() => setExportSnapshot(null)}
        />
      )}
    </section>
  );
}
