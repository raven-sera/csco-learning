import Link from 'next/link';
export default function NotFound() {
  return <main className="entryLoading"><h1 style={{fontSize:28}}>这个页面暂不存在</h1><p>返回学习入口，重新进入 MyCO。</p><Link href="/">返回学习入口 →</Link></main>;
}
