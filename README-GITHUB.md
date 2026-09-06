# CSCO 互动学习 · GitHub Pages

默认发布目标：`https://raven-sera.github.io/csco-learning/`。
网站包含三合一入口、会议学习台与个人日程。互动游戏和海报图鉴仍保持原有的“待接入”状态。

## 首次发布

1. 在 `raven-sera` 账号中创建 `csco-learning` 仓库。免费 GitHub Pages 使用公开仓库，上传的源码和网站将公开可访问。
2. 把源码放在仓库根目录，连同隐藏的 `.github` 文件夹一起上传；不要上传 `node_modules`、本地备份或个人笔记。
3. 在仓库的 **Settings → Pages → Build and deployment → Source** 选择 **GitHub Actions**。
4. 上传到 `main` 或 `master` 分支后，**Actions → Publish CSCO to GitHub Pages** 会构建并发布。若之前因尚未开启 Pages 失败，在开启后重新运行该工作流。
5. 等待发布步骤成功，再打开上述网址。后续推送代码会自动更新网站。

如果使用 SSH 上传，先把本机 SSH 公钥添加到 GitHub，再验证：

```powershell
ssh -T git@github.com
```

成功消息应包含 `Hi raven-sera!`。GitHub 不提供 SSH shell，因此成功认证后返回退出码 1 是正常现象。SSH 可上传代码，创建仓库与首次 Pages 设置仍在网页中完成。

## 本地构建

需要 Node.js 22.13 或以上。

```powershell
npm ci
npm run test:paths
npm run test:literature
npm run build:github
```

静态网站生成在 `out` 文件夹。发布工作流会自动识别账号和仓库路径；本地默认使用上述目标。若改名，通过 `GITHUB_REPOSITORY=账号/仓库` 指定，或设置 `NEXT_PUBLIC_BASE_PATH` 和 `NEXT_PUBLIC_SITE_ORIGIN`。

GitHub 构建使用已安装的 Next 静态导出，无须 Cloudflare Worker、ChatGPT 登录、数据库或付费服务器。构建过程会检查页面、资源路径和三合一入口。原始项目中的 `npm run build` 仍用于旧版托管；GitHub 发布必须使用 `npm run build:github`。

## 加载速度

- 入口首屏显示后，空闲时提前加载学习台；鼠标悬停或键盘聚焦入口也会准备页面。省流模式、离线和 2G 网络跳过这项后台加载。
- 文献按报告分别加载并缓存。现有全部文献文件为 1,165,523 字节；拆分后单篇文件中位数为 4,914 字节，第一次打开详情无需读取整份文献库。这是未压缩数据体积对比，不代表页面耗时的同比改善。
- 构建会核对每份文献文件与原始资料一致；测试覆盖 224 场口头报告的结果、重复请求缓存和失败重试。

## 三合一入口与原有数据

- 打开首页即进入三合一。新开、刷新学习或日程页面时，先回统一入口，随后可继续目标页面和报告位置。
- GitHub Pages 网站可以公开访问；旧站的平台访问控制不会随静态文件迁移。
- 笔记、录音、收藏、日程和打卡按浏览器与域名分别保存，不会自动跨域转移，也不会随源码上传到 GitHub。
- 迁移前请在旧站导出需要保留的笔记和日程文件、下载录音。现有 PDF/图片导出供阅读留存，不等于能在新站重新导入的完整数据备份。
- 旧站和本地备份均可保留；确认资料留存和新站可用后，再调整对外分享的网址。

## 参考

- [GitHub Pages 官方说明](https://docs.github.com/en/pages/getting-started-with-github-pages/what-is-github-pages)
- [配置 GitHub Pages 自动发布](https://docs.github.com/en/pages/getting-started-with-github-pages/using-custom-workflows-with-github-pages)
- [测试 GitHub SSH 连接](https://docs.github.com/en/authentication/connecting-to-github-with-ssh/testing-your-ssh-connection)
