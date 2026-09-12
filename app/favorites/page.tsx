import Explorer from '../components/Explorer';

export const metadata = { title: '我的收藏｜MyCO · My CSCO', description: '在 MyCO 回看已收藏的 CSCO 报告，安排日程并记录听会收获。' };

export default function FavoritesPage() {
  return <Explorer initialPage="favorites" />;
}
