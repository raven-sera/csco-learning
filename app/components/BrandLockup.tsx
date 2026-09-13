import { publicPath } from '../lib/sitePaths';

export const BRAND_SLOGAN_CN = '医界望远镜';

export function BrandLogo({ compact=false }:{ compact?:boolean }) {
  return <span className={`huiduBrand ${compact?'isCompact':''}`}>
    <img src={publicPath('/huidu-logo.png')} alt="Dotnet汇度" />
  </span>;
}

export function BrandLockup({ compact=false, inverse=false }:{ compact?:boolean; inverse?:boolean }) {
  return <div className={`huiduLockup ${compact?'isCompact':''} ${inverse?'isInverse':''}`}>
    <BrandLogo compact={compact}/>
    <span className="huiduDivider" aria-hidden="true" />
    <span className="huiduSlogan"><b>{BRAND_SLOGAN_CN}</b></span>
  </div>;
}

export function HuiduQrCallout({ compact=false }:{ compact?:boolean }) {
  return <div className={`huiduQrCallout ${compact?'isCompact':''}`}>
    <img src={publicPath('/huidu-latest-qr.jpg')} alt="汇度最新信息二维码" />
    <span>
      <b>扫码获取最新信息</b>
      <small>关注医界望远镜 · 持续获取专业内容</small>
    </span>
  </div>;
}
