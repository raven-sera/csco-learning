import Explorer from '../components/Explorer';
export const metadata = { title:'我的日程｜MyCO · My CSCO', description:'在 MyCO 查看个人听会安排、时间冲突、会议笔记与打卡记录。' };

export default function SchedulePage() {
  return <Explorer initialPage="schedule" />;
}
