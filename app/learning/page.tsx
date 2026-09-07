import type { Metadata } from 'next';
import Explorer from '../components/Explorer';

export const metadata: Metadata = {
  title: 'CSCO 2026 会议学习台',
  description: 'CSCO 2026 会议内容检索、个人日程安排、笔记记录与个人图书馆。',
};

export default function LearningPage() {
  return <Explorer />;
}
