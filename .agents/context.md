# Context

Project service IDs, environments and shipping policy. Never secrets.

```yaml
# 独立本地小游戏：没有 Linear 项目、没有后端、没有 CI、没有托管环境。
github:
  repo: banyudu/underwater
ship:
  method: fast   # 直接在 main 上提交并推送；不开分支、不开 PR
  auto: true     # 与全局默认一致：授权范围内的工作无需每次确认
```

## 构建结构

- `src/` 是唯一源码（原生 ES 模块）。仓库根目录的 `index.html` 是**生成产物**，
  由 `npm run build` 把模块打包内联进去——不要手改 `index.html`。
- 产物必须保持「单文件、零运行时依赖、双击可用」：不引入 CDN、图片、字体或任何网络请求。
- `esbuild` 只是 devDependency；新增依赖前先确认不会破坏上面这条。

## 校验

改完 `src/` 跑 `npm run check`（构建 + 逐帧等价性验证 + 单测，约 45 秒）：

- `npm run verify` 用固定随机种子，把重构前基线与新构建逐帧比对 canvas 指令、
  DOM 写入和 WebAudio 调用。动渲染逻辑时这条最有价值——它能证明"画面没变"。
- 只动纯逻辑时 `npm test` 就够（28 个用例，秒级）。

## 部署

- **没有部署目标**。产物就是一个本地文件：双击 `index.html`，或用任意静态服务器托管。
- 不存在 release / 发布步骤，不要自行添加 CI 或部署流水线。

## 版本控制

- 提交信息用英文，与 `git log` 保持一致（本仓库历史没有强制 conventional 前缀）。
- `node_modules/` 已 gitignore，不要提交。
