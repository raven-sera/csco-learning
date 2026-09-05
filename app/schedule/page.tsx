import Explorer from '../components/Explorer';
export const metadata = { title:'我的日程｜CSCO 2026 会议学习台', description:'查看个人听会安排、时间冲突、会议笔记与打卡记录。' };

export default function SchedulePage() {
  return <Explorer initialPage="schedule" />;
}
