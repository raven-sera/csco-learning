import SitePortal from './components/SitePortal';
import { Suspense } from 'react';

export default function Home() {
  return <Suspense fallback={<main className="entryLoading">正在打开学习入口…</main>}><SitePortal /></Suspense>;
}
