'use client';

import Link from 'next/link';
import { useSearchParams } from 'next/navigation';
import { useEffect, useState } from 'react';
import { BrandLockup } from './BrandLockup';
import { PORTAL_ENTER_EVENT, safeReturnPath } from '../lib/entryNavigation';

const sites = [
  { id:'01', kind:'game', title:'癌症知识互动游戏', label:'互动学习', description:'在选择、反馈与挑战中，巩固肿瘤学知识。', features:['互动练习','游戏化学习'] },
  { id:'02', kind:'learning', title:'CSCO 会议学习台', label:'会议工具', description:'检索会议内容，安排听会日程，记录每一场的收获。', features:['报告检索','私人日程','笔记与分享'] },
  { id:'03', kind:'posters', title:'CSCO 会议海报图鉴', label:'学术海报', description:'集中浏览与查找会议海报，让有价值的研究随时可回看。', features:['海报浏览','内容检索'] },
] as const;

export default function SitePortal() {
  const searchParams = useSearchParams();
  const requestedPath = searchParams.get('next');
  const [destination, setDestination] = useState('/learning');
  const [resuming, setResuming] = useState(false);
  useEffect(() => {
    queueMicrotask(() => { setDestination(safeReturnPath(requestedPath)); setResuming(Boolean(requestedPath)); });
  }, [requestedPath]);
  const enter = () => window.dispatchEvent(new Event(PORTAL_ENTER_EVENT));
  return <main className="unifiedPortal" id="main-content">
    <header className="portalBrandBar"><Link href="/" aria-label="汇度三合一首页"><BrandLockup /></Link><span>肿瘤学互动学习 · 2026</span></header>
    <section className="portalWelcome" aria-labelledby="portal-title">
      <p className="portalEyebrow">汇度 · 三合一学习入口</p>
      <h1 id="portal-title">好奇、学习、记录。<br/><em>从这里开始。</em></h1>
      <p>三个学习空间，一个清晰入口。选择你现在想做的事。</p>
    </section>
    {resuming && <p className="portalResume" role="status">欢迎回来。进入会议学习台，即可继续刚才打开的内容。</p>}
    <section className="unifiedPortalGrid" aria-label="三个学习空间">
      {sites.map((site) => <article className={`unifiedPortalCard ${site.kind}`} key={site.id}>
        <header><span>{site.id} / {site.label}</span><b>{site.kind === 'learning' ? '已开放' : '待接入'}</b></header>
        <div className="portalCardNumber" aria-hidden="true">{site.id}<span>↗</span></div>
        <h2>{site.title}</h2><p>{site.description}</p>
        <ul>{site.features.map(feature => <li key={feature}>{feature}</li>)}</ul>
        {site.kind === 'learning' ? <Link className="portalEnter" href={destination} onClick={enter} prefetch={false}>{resuming ? '继续会议学习' : '进入会议学习台'}<span aria-hidden="true">→</span></Link> : <div className="portalPending">入口准备中<span aria-hidden="true">—</span></div>}
      </article>)}
    </section>
    <footer className="unifiedPortalFooter"><span>汇聚真知，传播有度</span><p>当前开放 1 / 3 · 笔记和日程保存在当前浏览器</p></footer>
  </main>;
}
