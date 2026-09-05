'use client';
import { lazy, Suspense, useEffect, useState } from 'react';
import { SHARE_MOMENT_OPEN_EVENT, type ShareMomentContext } from '../lib/shareEvents';
export { SHARE_MOMENT_OPEN_EVENT, type ShareMomentContext } from '../lib/shareEvents';
const ShareMoment = lazy(() => import('./ShareMoment'));

export default function ShareMomentHost() {
  const [request, setRequest] = useState<{ context: ShareMomentContext | null } | null>(null);
  useEffect(() => {
    const open = (event: Event) => setRequest({ context: (event as CustomEvent<ShareMomentContext | null>).detail ?? null });
    window.addEventListener(SHARE_MOMENT_OPEN_EVENT, open);
    return () => window.removeEventListener(SHARE_MOMENT_OPEN_EVENT, open);
  }, []);
  if (request) return <Suspense fallback={<div className="moduleLoading moduleLoadingFixed" role="status">正在打开灵感分享…</div>}><ShareMoment initialOpen initialContext={request.context} /></Suspense>;
  return <button className="shareMomentFloat" onClick={() => setRequest({ context:null })} aria-label="分享灵感瞬间"><span className="shareMomentIcon">✦</span><span className="shareMomentFloatCopy"><b>分享灵感瞬间</b><small>图片 · 图文 · 文字海报</small></span></button>;
}
