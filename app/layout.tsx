import type { Metadata, Viewport } from 'next';
import './globals.css';
import './upgrade.css';
import './components/venue-map.css';
import './components/venue-navigator.css';
import EntryGate from './components/EntryGate';
import { publicPath } from './lib/sitePaths';

export const viewport: Viewport = { width:'device-width', initialScale:1, viewportFit:'cover', themeColor:'#edf1fb' };

export const metadata: Metadata = {
  metadataBase: new URL(process.env.NEXT_PUBLIC_SITE_ORIGIN || 'https://raven-sera.github.io'),
  title: 'MyCO · My CSCO',
  description: 'MyCO 个人会议空间与 CSCO会议海报图鉴入口。检索报告，收藏发现，安排日程，记录自己的 CSCO。',
  icons: { icon: publicPath('/favicon.svg') },
  openGraph: {
    title: 'MyCO · My CSCO',
    description: '你的个人会议空间，与学术发现相遇。',
    images: [{ url: publicPath('/og.png'), width: 1200, height: 630, alt: 'MyCO · My CSCO' }],
  },
  twitter: {
    card: 'summary_large_image',
    title: 'MyCO · My CSCO',
    description: '你的个人会议空间，与学术发现相遇。',
    images: [publicPath('/og.png')],
  },
};

export default function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  return <html lang="zh-CN"><body><EntryGate>{children}</EntryGate></body></html>;
}
