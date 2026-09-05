import Link from 'next/link';
export default function NotFound() {
  return <main className="entryLoading"><h1 style={{fontSize:28}}>这个页面暂不存在</h1><p>从三合一入口重新选择你想使用的学习工具。</p><Link href="/">返回三合一入口 →</Link></main>;
}
