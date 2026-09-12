'use client';

import { useEffect, useRef, useState, type ReactNode } from 'react';
import Link from 'next/link';
import { usePathname, useRouter } from 'next/navigation';
import { PORTAL_ENTER_EVENT, STORAGE_WARNING_EVENT, safeReturnPath } from '../lib/entryNavigation';
import { localPathname } from '../lib/sitePaths';

export default function EntryGate({ children }: { children: ReactNode }) {
  const pathname = usePathname();
  const localPath = localPathname(pathname || '/');
  const guarded = localPath === '/learning' || localPath === '/favorites' || localPath === '/schedule' || localPath === '/library' || localPath === '/atlas';
  const router = useRouter();
  // Deliberately document-local: a reload, a new tab or a direct URL returns to the portal.
  const [entered, setEntered] = useState(false);
  const [warning, setWarning] = useState('');
  const pendingLocation = useRef<{ pathname: string; hash: string } | null>(null);
  useEffect(() => {
    const enter = (event: Event) => {
      const destination = (event as CustomEvent<{ destination?: string }>).detail?.destination;
      const url = new URL(safeReturnPath(destination ?? null), 'https://csco.invalid');
      pendingLocation.current = { pathname: url.pathname, hash: url.hash };
      setEntered(true);
    };
    const warn = () => setWarning('浏览器未能保存这次更改，请保留当前页面并及时导出。');
    const restore = (event: PageTransitionEvent) => {
      if (event.persisted && localPathname(location.pathname) !== '/') {
        setEntered(false);
        router.replace('/?next=' + encodeURIComponent(localPathname(location.pathname) + location.search + location.hash));
      }
    };
    window.addEventListener(PORTAL_ENTER_EVENT, enter);
    window.addEventListener(STORAGE_WARNING_EVENT, warn);
    window.addEventListener('pageshow', restore);
    return () => {
      window.removeEventListener(PORTAL_ENTER_EVENT, enter);
      window.removeEventListener(STORAGE_WARNING_EVENT, warn);
      window.removeEventListener('pageshow', restore);
    };
  }, [router]);
  useEffect(() => {
    if (!entered && guarded) {
      router.replace('/?next=' + encodeURIComponent(localPathname(location.pathname) + location.search + location.hash));
    }
  }, [entered, guarded, router]);
  useEffect(() => {
    const pending = pendingLocation.current;
    if (!entered || !pending || localPath !== pending.pathname) return;
    pendingLocation.current = null;
    if (pending.hash) {
      // Resume the notebook fragment after the route commits, outside Next's route cache.
      history.replaceState(history.state, '', location.pathname + location.search + pending.hash);
      window.dispatchEvent(new HashChangeEvent('hashchange'));
    }
  }, [entered, localPath]);
  if (!entered && guarded) {
    return <main className="entryLoading"><p role="status">正在返回学习入口…</p><Link href="/">打开学习入口 →</Link></main>;
  }
  return <>{children}{warning && <div className="storageWarning" role="alert"><span>{warning}</span><button onClick={() => setWarning('')} aria-label="关闭保存提示">×</button></div>}</>;
}
