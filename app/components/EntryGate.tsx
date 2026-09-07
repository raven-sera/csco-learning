'use client';

import { useEffect, useState, type ReactNode } from 'react';
import Link from 'next/link';
import { usePathname, useRouter } from 'next/navigation';
import { PORTAL_ENTER_EVENT, STORAGE_WARNING_EVENT } from '../lib/entryNavigation';
import { localPathname } from '../lib/sitePaths';

export default function EntryGate({ children }: { children: ReactNode }) {
  const pathname = usePathname();
  const localPath = localPathname(pathname || '/');
  const guarded = localPath === '/learning' || localPath === '/schedule' || localPath === '/library';
  const router = useRouter();
  // Deliberately document-local: a reload, a new tab or a direct URL returns to the portal.
  const [entered, setEntered] = useState(false);
  const [warning, setWarning] = useState('');
  useEffect(() => {
    const enter = () => setEntered(true);
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
  if (!entered && guarded) {
    return <main className="entryLoading"><p role="status">正在返回三合一入口…</p><Link href="/">打开统一入口 →</Link></main>;
  }
  return <>{children}{warning && <div className="storageWarning" role="alert"><span>{warning}</span><button onClick={() => setWarning('')} aria-label="关闭保存提示">×</button></div>}</>;
}
