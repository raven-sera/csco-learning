import type { Metadata } from 'next';
import Explorer from '../components/Explorer';

export const metadata: Metadata = {
  title: 'MyCO · My CSCO',
  description: 'MyCO 个人会议空间：CSCO 2026 报告检索、我的收藏、个人日程、笔记与个人图书馆。',
};

export default function LearningPage() {
  return <Explorer />;
}
