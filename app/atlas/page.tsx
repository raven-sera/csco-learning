import Explorer from '../components/Explorer';

export const metadata = { title: '打卡图鉴｜MyCO · My CSCO', description: '在会场地图上回看听会足迹、各场地参会次数与听会关键词。' };

export default function AtlasPage() {
  return <Explorer initialPage="atlas" />;
}
