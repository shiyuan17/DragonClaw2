# Phase 5.17.2: 启动白屏首屏修复
> 状态: Planned
> 日期: 2026-05-02

## 背景

当前应用冷启动时，Tauri 窗口会先显示一个纯白 WebView，数秒后 React 应用与引导页才一起出现。排查结果显示问题不在 `useSetup` 的启动流程，而在首屏资源装载顺序：

- `App.tsx` 首次执行时同步引入了 `WorkspaceClonePage`、`LegacyHomeShell` 等大页面模块。
- `App.css` 首屏还会同步加载 `workspace-clone.css`、`models.css`、`analytics.css` 等非引导阶段必需的大样式文件。
- 因此即使逻辑上初始 `phase` 已经是 `checking`，用户仍要先等待整个首页代码与样式解析完成，才会看到引导界面。

## 目标

- 冷启动时窗口出现后立即显示可见内容，不再出现纯白空窗。
- 保持现有引导页、服务启动、配置检查与 `invoke()` 调用逻辑不变。
- 将 ready 后首页的大模块与重样式拆出首屏关键路径，缩短首次可见时间。

## 实施方案

- 在 `index.html` 注入轻量 boot splash，使用内联关键样式直接渲染品牌占位，不依赖 React bundle。
- 在 `App.tsx` 首次挂载后为 boot splash 增加一次性退场动画，并在动画结束后移除，避免闪烁。
- 将 `WorkspaceClonePage` 与 `LegacyHomeShell` 改为 `React.lazy` 按需加载，只在 `phase === "ready"` 后进入加载。
- 新增两个 ready 页懒加载入口组件，分别在模块内部引入对应的大样式，避免启动阶段预加载非必需 CSS。
- `App.css` 仅保留启动阶段必需的全局、头部、按钮、引导页、弹窗与 overlay 样式。
- `phase !== "ready"` 的 `SetupWizard` 行为保持不变；ready 分支外层使用 `Suspense` fallback，确保 chunk 尚未返回时仍有稳定占位而不是空白。

## 约束

- 不修改 `useSetup`、`useService`、`useConfig` 的业务逻辑。
- 不修改任何 Tauri command 签名与 Rust 启动/窗口显示逻辑。
- 不覆盖当前工作区已有脏改动；`workspace-clone.css` 仅调整 import 位置，不改正文内容。

## 验收

- 冷启动时窗口出现后立即能看到 boot splash。
- boot splash 能平滑过渡到现有引导页，首次安装、已有环境、服务已在运行三条路径都不出现白屏。
- ready 后 `workspace-clone` 与 legacy 首页均能正常显示，且无缺样式或明显闪烁。
- `npm run build` 产物可见主入口 chunk 与 ready 页面 chunk 拆分，主入口体积较改动前下降。
- `npm run tauri dev` 可正常启动，并完成“启动服务 -> 打开网关 -> 聊天正常”的手动回归。
