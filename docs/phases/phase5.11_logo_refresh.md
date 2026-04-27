# Phase 5.11: 旧 Logo 引用切换

> 状态: 进行中

## 目标

- 将前端所有旧 `logo.jpg` 引用切换到现有的新 DragonClaw 龙形 logo
- 同步更新浏览器 favicon，避免继续显示默认 Vite 图标
- 清理旧 logo 资源引用，保持品牌素材来源统一

## 范围

| 文件/目录 | 改动 |
|---|---|
| `src/components/DashboardTab.tsx` | 状态环 logo 切换到新资源 |
| `src/components/StartupOverlay.tsx` | 启动遮罩 logo 切换到新资源 |
| `src/components/workspace-clone/WorkspaceClonePage.tsx` | 工作台欢迎区与侧栏 logo 切换到新资源 |
| `src/assets/` | 增加前端统一使用的新 logo 资源 |
| `public/` | 增加 favicon PNG 并替换默认入口 |
| `index.html` | favicon 与页面标题更新 |

## 约束

- 只改渲染引用和静态资源，不改 `invoke()` 调用和交互逻辑
- 不改 Rust 后端、不改 Tauri 命令签名

## 验收标准

- 全仓前端组件不再引用 `src/assets/logo.jpg`
- 启动层、仪表盘、工作台入口都显示新的龙形 logo
- 浏览器标签页显示新的 favicon
- `npm run build` 通过
