'use client';

import Link from 'next/link';
import { useRouter, useSearchParams } from 'next/navigation';
import { Suspense, useCallback, useEffect, useRef } from 'react';
import { BrandLockup } from './BrandLockup';
import { PORTAL_ENTER_EVENT, safeReturnPath } from '../lib/entryNavigation';

const pendingSites = [
  { title:'癌症知识互动游戏', description:'用互动练习巩固肿瘤学知识。' },
  { title:'CSCO 会议海报图鉴', description:'集中浏览与查找学术海报。' },
] as const;

function PortalEntry() {
  const router = useRouter();
  const warmed = useRef(new Set<string>());
  const searchParams = useSearchParams();
  const requestedPath = searchParams.get('next');
  const destination = safeReturnPath(requestedPath);
  const resuming = Boolean(requestedPath);
  const warmup = useCallback(() => {
    const connection = (navigator as Navigator & { connection?: { saveData?: boolean; effectiveType?: string } }).connection;
    if (!navigator.onLine || document.visibilityState !== 'visible' || connection?.saveData ||
      /^(slow-)?2g$/.test(connection?.effectiveType || '') || warmed.current.has(destination)) return;
    warmed.current.add(destination);
    router.prefetch(destination);
  }, [destination, router]);
  useEffect(() => {
    // Let the portal paint first; warm the learning route without delaying the first screen.
    if ('requestIdleCallback' in window) {
      const request = window.requestIdleCallback(warmup, { timeout: 1500 });
      return () => window.cancelIdleCallback(request);
    }
    const timer = setTimeout(warmup, 1000);
    return () => clearTimeout(timer);
  }, [warmup]);
  const enter = () => window.dispatchEvent(new Event(PORTAL_ENTER_EVENT));
  return <>
    {resuming && <p className="portalResume" role="status">欢迎回来，继续打开刚才的内容。</p>}
    <Link className="portalEnter" href={destination} onClick={enter} onPointerEnter={warmup} onFocus={warmup} prefetch={false}>{resuming ? '继续会议学习' : '进入会议学习台'}<span aria-hidden="true">→</span></Link>
  </>;
}

export default function SitePortal() {
  return <main className="unifiedPortal" id="main-content">
    <header className="portalBrandBar"><Link href="/" aria-label="汇度三合一首页"><BrandLockup /></Link><span>肿瘤学互动学习 · 2026</span></header>
    <section className="portalWelcome" aria-labelledby="portal-title">
      <p className="portalEyebrow">汇度 · 肿瘤学学习空间</p>
      <h1 id="portal-title">专注听会，<em>从容记录。</em></h1>
      <p>从会前安排到会后回看，让每一场学习都有收获。</p>
    </section>
    <section className="unifiedPortalGrid" aria-label="三个学习空间">
      <article className="unifiedPortalCard learning">
        <header><span>CSCO 2026 · 9 月 17—19 日</span><b>已开放</b></header>
        <h2>CSCO 会议学习台</h2>
        <p>找到想听的报告，安排个人日程。文字、PPT 与录音，按报告收进你的图书馆。</p>
        <ul><li>报告检索</li><li>个人日程</li><li>笔记与图书馆</li></ul>
        <Suspense fallback={<span className="portalEnter" role="status">正在准备入口…</span>}><PortalEntry /></Suspense>
        <small className="portalPrivacy">资料保存在当前浏览器，不上传服务器。</small>
      </article>
      <aside className="portalUpcoming" aria-label="待接入的学习空间">
        <p>更多学习空间</p>
        {pendingSites.map(site => <article key={site.title}>
          <header><h2>{site.title}</h2><span>待接入</span></header>
          <p>{site.description}</p>
        </article>)}
      </aside>
    </section>
    <footer className="unifiedPortalFooter"><span>汇聚真知，传播有度</span><p>个人资料请定期在图书馆备份</p></footer>
  </main>;
}
