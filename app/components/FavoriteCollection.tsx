'use client';

import Link from 'next/link';
import { useId, useState, type ReactNode } from 'react';
import { createPortal } from 'react-dom';
import type { Report } from '../lib/reports';
import { useDialog } from '../lib/useDialog';
import './favorite-collection.css';

type FavoriteCollectionProps = {
  search: ReactNode;
  items: readonly { report: Report; kind: 'exact' | 'similar' | 'none' }[];
  total: number;
  exactCount: number;
  hasQuery: boolean;
  favoriteCount: number;
  page: number;
  totalPages: number;
  scheduleSet: ReadonlySet<number>;
  sortOrder: 'relevance' | 'time';
  scheduleUploadFeedback: string;
  onPageChange: (page: number) => void;
  onSortChange: (order: 'relevance' | 'time') => void;
  onOpen: (report: Report) => void;
  onToggleFavorite: (report: Report) => void;
  onToggleSchedule: (report: Report) => void;
  onRemovePage: () => void;
  onAddAllToSchedule: () => void;
  onExport: () => void;
  onReset: () => void;
};

function compactDateTime(value: string) {
  return value.replace(/^\d{4}-/, '').replace(/\s*(上午|下午|晚上|中午)\s*/g, ' ');
}

export default function FavoriteCollection({
  search, items, total, exactCount, hasQuery, favoriteCount, page, totalPages,
  scheduleSet, sortOrder, scheduleUploadFeedback, onPageChange, onSortChange,
  onOpen, onToggleFavorite, onToggleSchedule, onRemovePage, onAddAllToSchedule,
  onExport, onReset,
}: FavoriteCollectionProps) {
  const [toolsOpen, setToolsOpen] = useState(false);
  const dialogId = useId();
  useDialog(`[id="${dialogId}"]`, () => setToolsOpen(false), toolsOpen);
  const runAction = (action: () => void) => {
    setToolsOpen(false);
    action();
  };

  return (
    <section className="favoriteCollection" aria-label="我的收藏">
      <div className="favoriteCollectionSearch">{search}</div>
      <div className="favoriteCollectionToolbar">
        <div className="favoriteCollectionSummary">
          <h1>我的收藏</h1>
          <p role="status">
            {hasQuery ? <>精确 <b>{exactCount}</b><span> · 相似 <b>{total - exactCount}</b></span></> : <>共 <b>{total}</b> 场收藏</>}
          </p>
        </div>
        <div className="favoriteCollectionTools">
          <label className="favoriteCollectionSort">
            <span className="favoriteCollectionSrOnly">报告排序</span>
            <select aria-label="报告排序" value={sortOrder} onChange={event => onSortChange(event.target.value as 'relevance' | 'time')}>
              <option value="relevance">相关优先</option>
              <option value="time">会议时间</option>
            </select>
          </label>
          <div className="favoriteCollectionDesktopActions">
            <button type="button" disabled={!favoriteCount} onClick={onAddAllToSchedule} title={scheduleUploadFeedback || '全部加入日程'}>{scheduleUploadFeedback || '全部加入日程'}</button>
            <button type="button" disabled={!favoriteCount} onClick={onExport}>导出收藏</button>
            <button type="button" disabled={!items.length} onClick={onRemovePage}>取消本页收藏</button>
          </div>
          <button type="button" className="favoriteCollectionMore" onClick={() => setToolsOpen(true)} aria-haspopup="dialog" aria-expanded={toolsOpen} aria-controls={toolsOpen ? dialogId : undefined} aria-label="收藏管理与筛选操作">管理</button>
        </div>
      </div>
      {scheduleUploadFeedback && <span className="favoriteCollectionSrOnly" role="status">{scheduleUploadFeedback}</span>}
      {items.length ? (
        <div className="favoriteCollectionGrid" id="favorite-collection-reports">
          {items.map(({ report, kind }) => {
            const scheduled = scheduleSet.has(report.id);
            return (
              <article className="favoriteCollectionCard" key={report.id}>
                <button type="button" className="favoriteCollectionOpen" onClick={() => onOpen(report)} aria-label={`查看报告：${report.sourceTitle}；${report.speaker}；${report.dateTime}${kind === 'similar' ? '；相似选项' : ''}`} title={report.sourceTitle}>
                  <span className="favoriteCollectionTags"><span>{report.kind}</span><span>{report.kind === '汇报分享' ? report.scheduleCategory : report.field}</span></span>
                  <span className="favoriteCollectionTitle">{kind === 'similar' && <span className="favoriteCollectionSimilar">相似</span>}{report.sourceTitle}</span>
                  <span className="favoriteCollectionMeta">
                    <span className="favoriteCollectionPresenter" title={`${report.speaker} · ${report.institution}`}>{report.speaker}<span className="favoriteCollectionInstitution"> · {report.institution}</span></span>
                    <span className="favoriteCollectionTime" title={report.dateTime}>{compactDateTime(report.dateTime)}</span>
                  </span>
                  <span className="favoriteCollectionVenue" title={report.location}>{report.location}</span>
                </button>
                <div className="favoriteCollectionCardActions">
                  <button type="button" className={scheduled ? 'isScheduled' : ''} onClick={() => onToggleSchedule(report)} aria-label={`${scheduled ? '移出' : '加入'}我的日程：${report.sourceTitle}`} title={scheduled ? '移出我的日程' : '加入我的日程'} aria-pressed={scheduled}><span aria-hidden="true">{scheduled ? '✓' : '＋'}</span><span className="favoriteCollectionActionLabel">{scheduled ? '已加入日程' : '加入日程'}</span></button>
                  <button type="button" className="isFavorite" onClick={() => onToggleFavorite(report)} aria-label={`取消收藏：${report.sourceTitle}`} title="取消收藏" aria-pressed="true"><span aria-hidden="true">★</span><span className="favoriteCollectionActionLabel">已收藏</span></button>
                </div>
              </article>
            );
          })}
        </div>
      ) : (
        <div className="favoriteCollectionEmpty">
          <h2>{favoriteCount ? '没有找到符合条件的会议内容' : '还没有收藏的报告'}</h2>
          <p>{favoriteCount ? '试试其他关键词，或减少筛选条件。' : '在检索结果中收藏报告，即可在这里查看、安排日程或导出。'}</p>
          {favoriteCount ? <button type="button" onClick={onReset}>清除筛选并浏览全部收藏</button> : <Link href="/learning">去检索报告 →</Link>}
        </div>
      )}
      <nav className="favoriteCollectionPagination" aria-label="收藏报告分页">
        <button type="button" disabled={page <= 1 || !items.length} onClick={() => onPageChange(page - 1)} aria-controls="favorite-collection-reports">← 上一页</button>
        <span aria-live="polite">第 <b>{page}</b> / {Math.max(1, totalPages)} 页<span className="favoriteCollectionPageSize"> · 每页 12 场</span></span>
        <button type="button" disabled={page >= totalPages || !items.length} onClick={() => onPageChange(page + 1)} aria-controls="favorite-collection-reports">下一页 →</button>
      </nav>
      {toolsOpen && createPortal(
        <div className="favoriteCollectionDialogBackdrop" onClick={event => { if (event.target === event.currentTarget) setToolsOpen(false); }}>
          <div className="favoriteCollectionDialog" id={dialogId} role="dialog" aria-modal="true" aria-labelledby={`${dialogId}-title`}>
            <header><h2 id={`${dialogId}-title`}>管理收藏</h2><button type="button" onClick={() => setToolsOpen(false)} aria-label="关闭收藏管理">关闭</button></header>
            <p>共 {favoriteCount} 场收藏 · 本页 {items.length} 场</p>
            {scheduleUploadFeedback && <p role="status">{scheduleUploadFeedback}</p>}
            <button type="button" disabled={!favoriteCount} onClick={onAddAllToSchedule}>全部收藏加入我的日程</button>
            <button type="button" disabled={!favoriteCount} onClick={() => runAction(onExport)}>导出全部收藏</button>
            <button type="button" disabled={!items.length} onClick={() => runAction(onRemovePage)}>取消本页 {items.length} 场收藏</button>
            <button type="button" onClick={() => runAction(onReset)}>清除搜索和筛选</button>
            <p className="favoriteCollectionDialogHint">点击报告标题可查看完整题目、报告人、时间和地点。</p>
          </div>
        </div>, document.body,
      )}
    </section>
  );
}
