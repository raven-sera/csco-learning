import type { Metadata, Viewport } from 'next';
import './globals.css';
import './upgrade.css';
import './components/venue-map.css';
import './components/venue-navigator.css';
import EntryGate from './components/EntryGate';
import { publicPath } from './lib/sitePaths';

export const viewport: Viewport = { width:'device-width', initialScale:1, viewportFit:'cover', themeColor:'#0c1b3a' };

export const metadata: Metadata = {
  metadataBase: new URL(process.env.NEXT_PUBLIC_SITE_ORIGIN || 'https://huidu-csco-2026.tortoricealenewlu5.chatgpt.site'),
  title: '肿瘤学工具集合｜三个小站，一个入口',
  description: '集合癌症互动游戏、CSCO会议学习台与CSCO会议海报图鉴的统一入口。',
  icons: { icon: publicPath('/favicon.svg') },
  openGraph: {
    title: '肿瘤学工具集合｜三个小站，一个入口',
    description: '三个独立项目，共用一个清晰入口。',
    images: [{ url: publicPath('/og.png'), width: 1200, height: 630, alt: '肿瘤学工具集合' }],
  },
  twitter: {
    card: 'summary_large_image',
    title: '肿瘤学工具集合｜三个小站，一个入口',
    description: '三个独立项目，共用一个清晰入口。',
    images: [publicPath('/og.png')],
  },
};

export default function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  return <html lang="zh-CN"><body><EntryGate>{children}</EntryGate></body></html>;
}
