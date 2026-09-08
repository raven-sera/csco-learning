import type { Metadata, Viewport } from 'next';
import './globals.css';
import './upgrade.css';
import EntryGate from './components/EntryGate';
import { publicPath } from './lib/sitePaths';

export const viewport: Viewport = { width:'device-width', initialScale:1, viewportFit:'cover', themeColor:'#153d2d' };

export const metadata: Metadata = {
  metadataBase: new URL(process.env.NEXT_PUBLIC_SITE_ORIGIN || 'https://raven-sera.github.io'),
  title: '汇度 · CSCO 会议学习',
  description: '检索 CSCO 2026 会议报告，安排个人日程，在个人图书馆保存与回看文字、PPT 和录音。',
  openGraph: {
    title: '汇度 · CSCO 会议学习',
    description: '专注听会，从容记录。从会前安排到会后回看。',
    images: [{ url: publicPath('/og.png'), width: 1200, height: 630, alt: '肿瘤学工具集合' }],
  },
  twitter: {
    card: 'summary_large_image',
    title: '汇度 · CSCO 会议学习',
    description: '专注听会，从容记录。从会前安排到会后回看。',
    images: [publicPath('/og.png')],
  },
};

export default function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  return <html lang="zh-CN"><body><EntryGate>{children}</EntryGate></body></html>;
}
