import Explorer from '../components/Explorer';
export const metadata = { title: '个人图书馆｜MyCO · My CSCO', description: '在 MyCO 检索并阅读个人听会笔记、PPT照片和录音，继续上次阅读并备份本机资料。' };
export default function LibraryPage() {
  return <Explorer initialPage="library" />;
}
