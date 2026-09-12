'use client';

import Link from 'next/link';
import { useEffect, useId, useState } from 'react';
import type { ReactNode } from 'react';
import { useDialog } from '../lib/useDialog';
import './myco-shell.css';

type ActivePage = 'reports' | 'favorites' | 'schedule' | 'library';
type IconName = 'search' | 'bookmark' | 'calendar' | 'library' | 'poster' | 'map' | 'atlas' | 'download' | 'arrow' | 'menu' | 'close' | 'shield';

type MycoShellProps = {
  activePage: ActivePage;
  favoriteCount: number;
  scheduleCount: number;
  libraryCount: number;
  onMap: () => void;
  onAtlas: () => void;
  onExport: () => void;
  children: ReactNode;
};

const PAGES = [
  { id: 'reports', href: '/learning', label: '检索', icon: 'search' },
  { id: 'favorites', href: '/favorites', label: '收藏', icon: 'bookmark' },
  { id: 'schedule', href: '/schedule', label: '我的日程', icon: 'calendar' },
  { id: 'library', href: '/library', label: '个人图书馆', icon: 'library' },
] as const;

const ICON_PATHS: Record<IconName, string> = {
  search: 'M20 20l-4.5-4.5M17 10a7 7 0 1 1-14 0 7 7 0 0 1 14 0',
  bookmark: 'M6 4h12v17l-6-4-6 4V4Z',
  calendar: 'M7 3v4M17 3v4M4 10h16M5 5h14a1 1 0 0 1 1 1v14H4V6a1 1 0 0 1 1-1ZM8 14h2M14 14h2M8 17h2',
  library: 'M4 4h5v16H4V4ZM9 7h5v13H9M15 5l4-1 3 15-4 1-3-15ZM6 8h1M11 11h1',
  poster: 'M5 3h14v18H5V3ZM8 7h8M8 17h8M8 13l3-3 5 4',
  map: 'm3 6 6-3 6 3 6-3v15l-6 3-6-3-6 3V6ZM9 3v15M15 6v15',
  atlas: 'M4 5h12v15H4V5ZM7 2h13v15M8 10h4M8 14h4',
  download: 'M12 3v12m-4-4 4 4 4-4M4 16v5h16v-5',
  arrow: 'M20 12H4m6-6-6 6 6 6',
  menu: 'M4 6h16M4 12h16M4 18h16',
  close: 'm6 6 12 12M18 6 6 18',
  shield: 'm12 3 8 3v6c0 5-8 9-8 9s-8-4-8-9V6l8-3Zm-4 9 3 3 5-6',
};

function ShellIcon({ name }: { name: IconName }) {
  return <svg className="mycoIcon" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.65" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><path d={ICON_PATHS[name]} /></svg>;
}

export default function MycoShell({ activePage, favoriteCount, scheduleCount, libraryCount, onMap, onAtlas, onExport, children }: MycoShellProps) {
  const sidebarId = useId();
  const [mobile, setMobile] = useState(false);
  const [drawerOpen, setDrawerOpen] = useState(false);
  const drawerActive = mobile && drawerOpen;
  const closeDrawer = () => setDrawerOpen(false);
  const currentPage = PAGES.find(page => page.id === activePage)!;
  const counts = { favorites: favoriteCount, schedule: scheduleCount, library: libraryCount };

  useEffect(() => {
    const media = window.matchMedia('(max-width: 900px)');
    const updateViewport = () => {
      setMobile(media.matches);
      if (!media.matches) setDrawerOpen(false);
    };
    updateViewport();
    media.addEventListener('change', updateViewport);
    return () => media.removeEventListener('change', updateViewport);
  }, []);

  useDialog(`[id="${sidebarId}"]`, closeDrawer, drawerActive);

  const runTool = (action: () => void) => {
    closeDrawer();
    action();
  };

  return <div className={`mycoShell${drawerActive ? ' mycoDrawerOpen' : ''}`}>
    <a className="mycoSkipLink" href="#myco-workspace" inert={drawerActive || undefined}>跳至工作区</a>
    {drawerActive && <div className="mycoDrawerOverlay" onClick={closeDrawer} aria-hidden="true" />}
    <aside className="mycoSidebar" id={sidebarId} role={drawerActive ? 'dialog' : undefined} aria-modal={drawerActive || undefined} aria-label="MyCO 导航" inert={mobile && !drawerOpen || undefined}>
      <div className="mycoBrandRow">
        <Link className="mycoBrand" href="/learning" onClick={closeDrawer} aria-label="MyCO · My CSCO 检索首页">
          <span className="mycoBrandMark" aria-hidden="true"><svg viewBox="0 0 32 32" fill="none"><path d="M8 23V9l8 9 8-9v14" stroke="currentColor" strokeWidth="2.4" strokeLinecap="round" strokeLinejoin="round" /></svg></span>
          <span className="mycoBrandType"><strong>My<span>CO</span></strong><small>My CSCO</small></span>
        </Link>
        <button className="mycoDrawerClose mycoIconButton" type="button" onClick={closeDrawer} aria-label="关闭导航"><ShellIcon name="close" /></button>
      </div>

      <nav className="mycoNavigation" aria-label="工作空间">
        <p className="mycoGroupLabel">工作空间 <span>WORKSPACE</span></p>
        <ul className="mycoNavList">
          {PAGES.map(page => <li key={page.id}>
            <Link className={`mycoNavItem${page.id === activePage ? ' isActive' : ''}`} href={page.href} aria-current={page.id === activePage ? 'page' : undefined} onClick={closeDrawer}>
              <ShellIcon name={page.icon} /><span>{page.label}</span>
              {page.id !== 'reports' && <span className="mycoNavCount" aria-label={`${counts[page.id]} 项`}>{counts[page.id]}</span>}
            </Link>
          </li>)}
          <li><button className="mycoNavItem mycoUnavailable" type="button" disabled title="CSCO 会议海报图鉴的正式地址尚未接入"><ShellIcon name="poster" /><span>图鉴</span><small>未接入</small></button></li>
        </ul>
      </nav>

      <div className="mycoTools" role="group" aria-label="会议工具">
        <p className="mycoGroupLabel">会议工具 <span>TOOLS</span></p>
        <button className="mycoNavItem" type="button" onClick={() => runTool(onMap)} aria-haspopup="dialog"><ShellIcon name="map" /><span>会场导航</span></button>
        <button className="mycoNavItem" type="button" onClick={() => runTool(onAtlas)} aria-haspopup="dialog"><ShellIcon name="atlas" /><span>打卡图鉴</span></button>
        <button className="mycoNavItem" type="button" onClick={() => runTool(onExport)} aria-haspopup="dialog"><ShellIcon name="download" /><span>导出资料</span></button>
      </div>

      <footer className="mycoSidebarFooter">
        <div className="mycoPrivacyNote"><ShellIcon name="shield" /><p>资料保存在当前浏览器<small>收藏、日程与笔记请及时导出备份。</small></p></div>
        <Link className="mycoPortalLink" href="/" onClick={closeDrawer}><ShellIcon name="arrow" /><span>返回二合一入口</span></Link>
      </footer>
    </aside>

    <div className="mycoContent" inert={drawerActive || undefined}>
      <header className="mycoHeader">
        <div className="mycoHeaderLeading">
          <button className="mycoMenuButton mycoIconButton" type="button" aria-label="打开导航" aria-controls={sidebarId} aria-expanded={drawerActive} aria-haspopup="dialog" onClick={() => setDrawerOpen(true)}><ShellIcon name="menu" /></button>
          <p className="mycoBreadcrumb"><span>MyCO</span><span className="mycoBreadcrumbSlash" aria-hidden="true">/</span><strong>{currentPage.label}</strong></p>
        </div>
        <span className="mycoDateChip"><span className="mycoConferenceName">CSCO 2026</span><span className="mycoDateSeparator" aria-hidden="true" /><span>09.17 — 09.19</span></span>
      </header>
      <div className="mycoWorkspace" id="myco-workspace" tabIndex={-1}>{children}</div>
    </div>
  </div>;
}
