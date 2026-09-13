'use client';

import Link from 'next/link';
import { useRouter, useSearchParams } from 'next/navigation';
import { useCallback, useEffect, useRef, useState } from 'react';
import { BrandLockup, BRAND_SLOGAN_CN } from './BrandLockup';
import { PORTAL_ENTER_EVENT, safeReturnPath } from '../lib/entryNavigation';
import './site-portal.css';


export default function SitePortal() {
  const router = useRouter();
  const warmed = useRef(new Set<string>());
  const searchParams = useSearchParams();
  const requestedPath = searchParams.get('next');
  const [destination, setDestination] = useState('/learning');
  const [resuming, setResuming] = useState(false);
  useEffect(() => {
    queueMicrotask(() => { setDestination(safeReturnPath(requestedPath)); setResuming(Boolean(requestedPath)); });
  }, [requestedPath]);
  const warmup = useCallback(() => {
    const route = destination.split('#', 1)[0];
    const connection = (navigator as Navigator & { connection?: { saveData?: boolean; effectiveType?: string } }).connection;
    if (!navigator.onLine || document.visibilityState !== 'visible' || connection?.saveData ||
      /^(slow-)?2g$/.test(connection?.effectiveType || '') || warmed.current.has(route)) return;
    warmed.current.add(route);
    router.prefetch(route);
  }, [destination, router]);
  useEffect(() => {
    // Let the portal paint first; warm MyCO without delaying the first screen.
    if ('requestIdleCallback' in window) {
      const request = window.requestIdleCallback(warmup, { timeout: 1500 });
      return () => window.cancelIdleCallback(request);
    }
    const timer = setTimeout(warmup, 1000);
    return () => clearTimeout(timer);
  }, [warmup]);
  return <main className="cscoPortal" id="main-content">
    <div className="cscoPortalInner">
      <header className="cscoPortalHeader">
        <Link href="/" aria-label="汇度学习入口"><BrandLockup /></Link>
        <span className="cscoPortalEdition">CSCO <b>2026</b></span>
      </header>
      <section className="cscoPortalWelcome" aria-labelledby="portal-title">
        <div className="cscoPortalWelcomeCopy">
          <p className="cscoPortalEyebrow"><span /> where there is knowledge, there is no edge.</p>
          <h1 id="portal-title">从这里，<br /><em>看医界，无边界</em></h1>
        </div>
        <div className="cscoPortalOrbit" aria-hidden="true">
          <div className="cscoPortalOrbitRing" />
          <div className="cscoPortalOrbitCore"><span>My</span><strong>CSCO</strong></div>
          <span className="cscoPortalOrbitDot" />
        </div>
      </section>
      {resuming && <p className="cscoPortalResume" role="status">欢迎回来。进入 MyCO，即可继续刚才打开的内容。</p>}
      <section className="cscoPortalGrid" aria-label="两个学习空间">
        <article className="cscoPortalCard cscoPortalMyco" aria-labelledby="myco-title">
          <header><span className="cscoPortalIndex">01 <i /> 个人会议空间</span><span className="cscoPortalStatus isOpen">已开放</span></header>
          <div className="cscoPortalCardIdentity">
            <span className="cscoPortalCardIcon" aria-hidden="true"><svg viewBox="0 0 32 32" fill="none"><path d="M7 24V8l9 10 9-10v16M16 18v6" /></svg></span>
            <div><h2 id="myco-title">MyCO</h2><p>My CSCO</p></div>
          </div>
          <p className="cscoPortalDescription">你的专属 CSCO 会议空间。检索报告、规划日程，让收藏与笔记沉淀为自己的知识。</p>
          <ul className="cscoPortalFeatures"><li>报告检索</li><li>我的收藏</li><li>个人日程</li><li>个人图书馆</li></ul>
          <Link className="cscoPortalEnter" href={destination} onNavigate={event => {
            event.preventDefault();
            window.dispatchEvent(new CustomEvent(PORTAL_ENTER_EVENT, { detail: { destination } }));
            router.push(destination.split('#', 1)[0]);
          }} onPointerEnter={warmup} onFocus={warmup} prefetch={false}>
            {resuming ? '继续进入 MyCO' : '进入 MyCO'}<span aria-hidden="true">↗</span>
          </Link>
        </article>
        <article className="cscoPortalCard cscoPortalPosters" aria-labelledby="posters-title">
          <header><span className="cscoPortalIndex">02 <i /> 学术海报空间</span><span className="cscoPortalStatus">待接入</span></header>
          <div className="cscoPortalCardIdentity">
            <span className="cscoPortalCardIcon" aria-hidden="true"><svg viewBox="0 0 32 32" fill="none"><rect x="9" y="5" width="17" height="22" rx="3" /><path d="M6 9H5a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2M14 11h7M14 16h7M14 21h4" /></svg></span>
            <div><h2 id="posters-title">CSCO会议海报图鉴</h2><p>CSCO POSTER ATLAS</p></div>
          </div>
          <p className="cscoPortalDescription">为会议海报保留一个专属入口。正式地址尚未接入，目前暂不可浏览或检索。</p>
          <div className="cscoPortalPendingNote">期待与更多学术发现相遇</div>
          <div className="cscoPortalPending"><span>入口准备中</span><span aria-hidden="true">—</span></div>
        </article>
      </section>
      <footer className="cscoPortalFooter"><span>{BRAND_SLOGAN_CN}</span><p>笔记与日程仅保存在当前浏览器，请定期导出备份。</p><span className="cscoPortalFooterYear">HUIDU / 2026</span></footer>
    </div>
  </main>;
}
