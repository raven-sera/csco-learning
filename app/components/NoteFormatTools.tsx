'use client';

import { useEffect, useId, useLayoutEffect, useRef, useState } from 'react';
import type { CSSProperties, KeyboardEvent } from 'react';
import { Extension, type Editor } from '@tiptap/core';
import type { Mark } from '@tiptap/pm/model';
import { Plugin, PluginKey, type SelectionBookmark, type Transaction } from '@tiptap/pm/state';
import { Decoration, DecorationSet } from '@tiptap/pm/view';
import { useEditorState } from '@tiptap/react';
import { createPortal } from 'react-dom';
import { useDialog } from '../lib/useDialog';

const formattingSelectionKey = new PluginKey<boolean>('noteFormattingSelection');

// View-only selection feedback; never enters the saved note HTML or undo history.
export const NoteFormattingSelection = Extension.create({
  name: 'noteFormattingSelection',
  addProseMirrorPlugins() {
    return [new Plugin({
      key: formattingSelectionKey,
      state: {
        init: () => false,
        apply: (transaction, active) => transaction.getMeta(formattingSelectionKey) ?? active,
      },
      props: {
        decorations(state) {
          if (!formattingSelectionKey.getState(state) || state.selection.empty) return DecorationSet.empty;
          return DecorationSet.create(state.doc, [Decoration.inline(state.selection.from, state.selection.to, { class: 'noteFormattingSelection' })]);
        },
      },
    })];
  },
});

type Format = 'text' | 'highlight' | 'underline';
type Value = string | null;
type FormatValue = { color: Value; mixed: boolean; active: boolean };
const LABELS: Record<Format, string> = { text: '字体颜色', highlight: '文本高亮', underline: '下划线' };
const DEFAULTS: Record<Format, string> = { text: '#c93f43', highlight: '#fff09b', underline: 'currentColor' };
const THEME = [
  ['墨黑', '#18251e'], ['石灰', '#68766f'], ['纸白', '#ffffff'], ['森林绿', '#245b46'], ['鼠尾草', '#a8c4ac'], ['浅绿', '#e2efda'],
  ['深蓝', '#244a73'], ['湖蓝', '#4e94bd'], ['浅蓝', '#daeaf6'], ['赤陶', '#b65d43'], ['暖沙', '#d9b77e'], ['奶油', '#f4e7cb'],
];
const STANDARD = [
  ['红色', '#c93f43'], ['橙色', '#ed8936'], ['黄色', '#ffe45c'], ['绿色', '#3e9952'], ['蓝色', '#346bd1'], ['紫色', '#8955bd'],
  ['粉色', '#f6bfda'], ['浅橙', '#ffd6a5'], ['荧光黄', '#fff09b'], ['薄荷', '#c9edc6'], ['冰蓝', '#c5e5ff'], ['淡紫', '#e3d1f2'],
];

function normalizedColor(value: unknown): Value {
  if (typeof value !== 'string' || !value || value === 'transparent') return null;
  const color = value.trim().toLowerCase();
  const rgb = color.match(/^rgb\(\s*(\d+)\s*,\s*(\d+)\s*,\s*(\d+)\s*\)$/);
  if (rgb) return `#${rgb.slice(1).map((part) => Number(part).toString(16).padStart(2, '0')).join('')}`;
  if (/^#[\da-f]{3}$/.test(color)) return `#${color.slice(1).split('').map((part) => part + part).join('')}`;
  return color;
}

function selectionFormats(editor: Editor): Record<Format, FormatValue> {
  const values: Record<Format, Set<Value>> = { text: new Set(), highlight: new Set(), underline: new Set() };
  let underlined = false;
  let plain = false;
  const collect = (marks: readonly Mark[]) => {
    const style = marks.find((mark) => mark.type.name === 'textStyle');
    const underline = marks.find((mark) => mark.type.name === 'underline');
    values.text.add(normalizedColor(style?.attrs.color));
    values.highlight.add(normalizedColor(style?.attrs.backgroundColor));
    values.underline.add(underline ? normalizedColor(underline.attrs.underlineColor) ?? 'currentColor' : null);
    if (underline) underlined = true;
    else plain = true;
  };
  const { state } = editor;
  if (state.selection.empty) collect(state.storedMarks ?? state.selection.$from.marks());
  else state.doc.nodesBetween(state.selection.from, state.selection.to, (node) => {
    if (node.isInline) collect(node.marks);
  });
  const result = (format: Format): FormatValue => ({
    color: values[format].size === 1 ? values[format].values().next().value ?? null : null,
    mixed: values[format].size > 1,
    active: format === 'underline' ? underlined && !plain : values[format].size > 0 && !values[format].has(null),
  });
  return { text: result('text'), highlight: result('highlight'), underline: result('underline') };
}

export function NoteToolIcon({ name }: { name: 'image' | 'link' | 'clear' | 'undo' | 'redo' | 'ordered' | 'bullet' }) {
  const paths = {
    image: 'M3 3h18v18H3z M3 16l5-5 5 5 3-3 5 5 M16 7h.01',
    link: 'M10 13a5 5 0 0 0 7 0l3-3a5 5 0 0 0-7-7l-2 2 M14 11a5 5 0 0 0-7 0l-3 3a5 5 0 0 0 7 7l2-2',
    clear: 'M4 4h13 M10 4l-4 16 M15 13l7 7 M22 13l-7 7',
    undo: 'M9 5L3 11l6 6 M3 11h11a7 7 0 0 1 7 7',
    redo: 'M15 5l6 6-6 6 M21 11H10a7 7 0 0 0-7 7',
    ordered: 'M10 5h11 M10 12h11 M10 19h11 M3 3h1v5 M2 8h4 M2 12c3-2 4 1 1 3l-1 2h4',
    bullet: 'M10 5h11 M10 12h11 M10 19h11 M3 5h1 M3 12h1 M3 19h1',
  };
  return <svg viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><path d={paths[name]} /></svg>;
}

function ColorSwatches({ colors, label, value, onSelect }: {
  colors: string[][]; label: string; value: FormatValue; onSelect: (color: string) => void;
}) {
  return <section className="notePaletteSection" aria-label={label}>
    <h5>{label}</h5>
    <div className="notePaletteGrid">{colors.map(([name, color]) => <button key={color} type="button" className="notePaletteSwatch" style={{ '--swatch': color } as CSSProperties} aria-label={`${name} ${color}`} title={`${name} ${color}`} aria-pressed={!value.mixed && value.color === color} onMouseDown={(event) => event.preventDefault()} onClick={() => onSelect(color)}><span />{value.color === color && !value.mixed && <svg viewBox="0 0 20 20" aria-hidden="true"><path d="m5 10 3 3 7-7" /></svg>}</button>)}</div>
  </section>;
}

export default function NoteFormatTools({ editor }: { editor: Editor }) {
  const selected = useEditorState({ editor, selector: ({ editor: current }) => selectionFormats(current) });
  const [last, setLast] = useState(DEFAULTS);
  const [open, setOpen] = useState<Format | null>(null);
  const [recent, setRecent] = useState<string[]>([]);
  const [custom, setCustom] = useState('#245b46');
  const [position, setPosition] = useState<CSSProperties>({ visibility: 'hidden' });
  const root = useRef<HTMLDivElement>(null);
  const panel = useRef<HTMLDivElement>(null);
  const trigger = useRef<HTMLButtonElement | null>(null);
  const saved = useRef<{ bookmark: SelectionBookmark; marks: readonly Mark[] | null } | null>(null);
  const id = useId();
  useDialog(`[id="${id}"]`, () => close(true), open !== null, false);

  useEffect(() => {
    const mapSelection = ({ transaction }: { transaction: Transaction }) => {
      if (saved.current && transaction.docChanged) saved.current.bookmark = saved.current.bookmark.map(transaction.mapping);
    };
    editor.on('transaction', mapSelection);
    return () => { editor.off('transaction', mapSelection); };
  }, [editor]);

  useLayoutEffect(() => {
    if (!open) return;
    editor.commands.setMeta(formattingSelectionKey, true);
    const reposition = () => {
      if (!trigger.current || !panel.current) return;
      const viewport = window.visualViewport;
      const width = viewport?.width ?? window.innerWidth;
      const height = viewport?.height ?? window.innerHeight;
      const left = viewport?.offsetLeft ?? 0;
      const top = viewport?.offsetTop ?? 0;
      const anchor = trigger.current.getBoundingClientRect();
      const box = panel.current.getBoundingClientRect();
      const below = anchor.bottom + 6;
      const y = below + box.height <= top + height - 8 ? below : Math.max(top + 8, anchor.top - box.height - 6);
      setPosition({ left: Math.max(left + 8, Math.min(anchor.right - box.width, left + width - box.width - 8)), top: y, width: Math.min(320, width - 16), maxHeight: height - 16, visibility: 'visible' });
    };
    reposition();
    const focusFrame = window.requestAnimationFrame(() => {
      (panel.current?.querySelector<HTMLButtonElement>('[aria-pressed="true"]') ?? panel.current?.querySelector<HTMLButtonElement>('.notePaletteReset'))?.focus({ preventScroll: true });
    });
    window.addEventListener('resize', reposition);
    window.addEventListener('scroll', reposition, true);
    window.visualViewport?.addEventListener('resize', reposition);
    window.visualViewport?.addEventListener('scroll', reposition);
    const outside = (event: Event) => {
      if (event.target instanceof Node && !panel.current?.contains(event.target) && !root.current?.contains(event.target)) {
        setOpen(null);
        saved.current = null;
      }
    };
    document.addEventListener('pointerdown', outside);
    document.addEventListener('focusin', outside);
    return () => {
      window.cancelAnimationFrame(focusFrame);
      window.removeEventListener('resize', reposition);
      window.removeEventListener('scroll', reposition, true);
      window.visualViewport?.removeEventListener('resize', reposition);
      window.visualViewport?.removeEventListener('scroll', reposition);
      document.removeEventListener('pointerdown', outside);
      document.removeEventListener('focusin', outside);
      if (!editor.isDestroyed) editor.commands.setMeta(formattingSelectionKey, false);
    };
  }, [editor, open]);

  function close(restoreFocus = false) {
    setOpen(null);
    saved.current = null;
    if (restoreFocus) trigger.current?.focus({ preventScroll: true });
  }

  function apply(format: Format, color: Value, remove = false) {
    const snapshot = saved.current;
    const chain = editor.chain().command(({ tr }) => {
      if (snapshot) {
        tr.setSelection(snapshot.bookmark.resolve(tr.doc));
        if (tr.selection.empty) tr.setStoredMarks(snapshot.marks);
      }
      return true;
    }).focus();
    if (format === 'text') {
      if (color) chain.setColor(color);
      else chain.unsetColor();
    } else if (format === 'highlight') {
      if (color) chain.setBackgroundColor(color);
      else chain.unsetBackgroundColor();
    } else if (remove) chain.unsetUnderline();
    else chain.setMark('underline', { underlineColor: color === 'currentColor' ? null : color });
    chain.run();
    if (color) {
      setLast((previous) => ({ ...previous, [format]: color }));
      if (color !== 'currentColor') setRecent((previous) => [color, ...previous.filter((item) => item !== color)].slice(0, 6));
    }
    close();
  }

  function togglePalette(format: Format, button: HTMLButtonElement) {
    if (open === format) { close(true); return; }
    saved.current = { bookmark: editor.state.selection.getBookmark(), marks: editor.state.storedMarks ?? editor.state.selection.$from.marks() };
    trigger.current = button;
    setPosition({ visibility: 'hidden' });
    setCustom(/^#[\da-f]{6}$/i.test(selected[format].color ?? '') ? selected[format].color! : format === 'highlight' ? DEFAULTS.highlight : DEFAULTS.text);
    setOpen(format);
  }

  function paletteKeyDown(event: KeyboardEvent<HTMLDivElement>) {
    if (event.key === 'Escape') { event.preventDefault(); event.stopPropagation(); close(true); return; }
    const swatch = (event.target as HTMLElement).closest<HTMLButtonElement>('.notePaletteSwatch');
    if (!swatch || !['ArrowLeft', 'ArrowRight', 'ArrowUp', 'ArrowDown', 'Home', 'End'].includes(event.key)) return;
    const swatches = Array.from(swatch.parentElement!.querySelectorAll<HTMLButtonElement>('.notePaletteSwatch'));
    const index = swatches.indexOf(swatch);
    const delta = event.key === 'ArrowLeft' ? -1 : event.key === 'ArrowRight' ? 1 : event.key === 'ArrowUp' ? -6 : 6;
    const next = event.key === 'Home' ? 0 : event.key === 'End' ? swatches.length - 1 : (index + delta + swatches.length) % swatches.length;
    event.preventDefault();
    swatches[next]?.focus();
  }


  return <div ref={root} className="noteFormatTools" role="group" aria-label="文字颜色与标记">
    {(['text', 'highlight', 'underline'] as const).map((format) => {
      const state = selected[format];
      const color = state.color ?? last[format];
      return <div key={format} className={`noteFormatSplit${state.active ? ' isActive' : ''}${state.mixed ? ' isMixed' : ''}`}>
        <button type="button" className="noteFormatMain" aria-label={format === 'text' ? '应用上次字体颜色' : format === 'highlight' ? '切换文本高亮' : '切换下划线'} aria-pressed={state.mixed ? 'mixed' : state.active} title={`${LABELS[format]}${state.mixed ? ' · 混合格式' : ''} · ${format === 'text' ? `应用上次颜色 ${last.text}` : state.active ? '点击移除' : '应用上次颜色'}`} onMouseDown={(event) => event.preventDefault()} onClick={() => apply(format, format === 'text' ? last.text : state.active ? null : last[format], format === 'underline' && state.active)}>
          <span className={`noteFormatGlyph is-${format}`} style={{ '--format-color': color } as CSSProperties}>{format === 'highlight' ? <svg viewBox="0 0 24 24" aria-hidden="true"><path d="m14 3 7 7-10 10-7-7z M4 13l7 7-7 1-1-1z M13 5l7 7" /></svg> : format === 'text' ? 'A' : 'U'}<i /></span>
          <span className="noteFormatName">{format === 'text' ? '字体色' : format === 'highlight' ? '高亮' : '下划线'}</span>
          {state.mixed && <span className="noteFormatMixed" aria-label="混合格式">·</span>}
        </button>
        <button type="button" className="noteFormatArrow" aria-label={`${LABELS[format]}选项`} aria-haspopup="dialog" aria-expanded={open === format} aria-controls={open === format ? id : undefined} onMouseDown={(event) => event.preventDefault()} onClick={(event) => togglePalette(format, event.currentTarget)} onKeyDown={(event) => { if (event.key === 'ArrowDown') { event.preventDefault(); togglePalette(format, event.currentTarget); } }}><svg viewBox="0 0 16 16" width="12" height="12" aria-hidden="true"><path d="m4 6 4 4 4-4" fill="none" stroke="currentColor" strokeWidth="1.8" /></svg></button>
      </div>;
    })}
    {open && createPortal(<div id={id} ref={panel} role="dialog" aria-label={`${LABELS[open]}选项`} className="noteFormatPalette" style={position} onKeyDown={paletteKeyDown}>
      <header><strong>{LABELS[open]}</strong><span>{selected[open].mixed ? '混合格式' : selected[open].color === 'currentColor' ? '自动颜色' : selected[open].color ?? '未设置'}</span><button type="button" aria-label="关闭颜色面板" onClick={() => close(true)}>×</button></header>
      <button type="button" className="notePaletteReset" onMouseDown={(event) => event.preventDefault()} onClick={() => apply(open, open === 'underline' ? 'currentColor' : null)}><span className={`notePaletteResetSample${open === 'highlight' ? ' isNone' : ''}`}>A</span>{open === 'text' ? '自动 · 默认字体颜色' : open === 'highlight' ? '无高亮' : '自动 · 跟随字体颜色'}</button>
      <ColorSwatches colors={THEME} label="主题颜色" value={selected[open]} onSelect={(color) => apply(open, color)} />
      <ColorSwatches colors={STANDARD} label="标准颜色" value={selected[open]} onSelect={(color) => apply(open, color)} />
      {recent.length > 0 && <ColorSwatches colors={recent.map((color) => [color, color])} label="最近使用" value={selected[open]} onSelect={(color) => apply(open, color)} />}
      {open === 'underline' && <button type="button" className="notePaletteReset" onMouseDown={(event) => event.preventDefault()} onClick={() => apply('underline', null, true)}>移除下划线</button>}
      <form className="notePaletteCustom" onSubmit={(event) => { event.preventDefault(); if (/^#[\da-f]{6}$/i.test(custom)) apply(open, custom.toLowerCase()); }}>
        <label className="noteCustomPicker" title="打开自定义颜色选择器"><svg viewBox="0 0 20 20" aria-hidden="true"><path d="m13 2 5 5-9 9-6 1 1-6z M11 4l5 5" /></svg><input type="color" aria-label="自定义颜色选择器" value={/^#[\da-f]{6}$/i.test(custom) ? custom : '#245b46'} onChange={(event) => setCustom(event.target.value)} /></label>
        <label className="noteCustomHex"><span>自定义颜色</span><input aria-label="自定义颜色十六进制值" value={custom} onChange={(event) => setCustom(event.target.value)} pattern="#[0-9a-fA-F]{6}" maxLength={7} spellCheck={false} /></label>
        <button type="submit" disabled={!/^#[\da-f]{6}$/i.test(custom)}>应用</button>
      </form>
    </div>, document.body)}
  </div>;
}
