# Phase 5.14: 引导页浅色高保真改版

> 状态：待实现

## 背景

当前引导流沿用 Phase 5.4 的深色 aurora 方案，已经完成了无卡片悬浮布局和错误弹窗能力，但视觉气质与最新参考图不一致。此次调整作为新一轮 UI 迭代，保留旧文档与旧方案历史，不覆盖 Phase 5.4 的决策记录。

## 目标

参考最新截图，将 `SetupWizard` 的四个阶段统一为浅色、轻盈、居中的引导体验：

- `checking`
- `initializing`
- `launching`
- `workspace`

核心要求：

1. 只改前端渲染与样式，不改 `invoke()`、Hook 业务逻辑、后端命令和阶段流转条件。
2. 全阶段共享同一视觉骨架，避免页面之间风格跳变。
3. 保留现有进度、错误弹窗、重试、工作区选择与确认交互。

## 设计方向

- 背景：改为浅蓝白雾面氛围，使用 2-3 层大面积径向渐变和柔和 blur，营造截图中的云雾感。
- 主视觉：复用现有 `src/assets/dragonclaw-logo.png` 作为页面中心图形。
- 排版：采用品牌眉题 `DRAGONCLAW`、主标题、说明文案三段式布局，整体保持更大留白和更强的中心聚焦。
- 颜色：主标题使用深蓝色，说明文案使用浅蓝灰色，进度条与容器边框使用低对比浅色。

## 实现方案

### 1. `src/components/SetupWizard.tsx`

- 提取共享的引导主体结构，减少 `checking / initializing / launching / workspace` 之间的重复渲染。
- 在所有阶段展示统一的 logo、品牌眉题和文案区。
- `checking / initializing`：
  - 保留 `progressMsg`、进度条和百分比。
  - 进度条改为更轻、更细的浅色线条。
- `launching`：
  - 去掉当前以 `Loader2` 为中心的视觉。
  - 以 logo + “即将就绪”式标题为主，必要时保留最小可见宽度的进度反馈。
  - `setupError` 时继续显示重试入口与现有 Modal。
- `workspace`：
  - 保留 `onSelectFolder` / `onConfirmWorkspace` 行为。
  - 路径区改为浅色胶囊/轻边框块。
  - 按钮使用与页面一致的主次层级。

### 2. `src/styles/setup.css`

- 重写 `.startup-container`，从深色 aurora 改为浅色云雾背景。
- 重写 `.startup-box`，强化居中构图和纵向节奏。
- 新增 logo、品牌眉题、标题、说明、进度、路径区、工作区按钮、内联错误操作等配套类。
- 增补响应式规则，保证桌面和较窄窗口下都能保持居中与无横向溢出。

## 验收标准

- `checking` 与 `initializing` 显示统一的浅色雾面背景、中心 logo、品牌眉题、标题、进度条、百分比和 `progressMsg`。
- `launching` 视觉接近参考图，核心是 logo 与标题，不再由明显 spinner 主导。
- `workspace` 与前三屏保持同一设计语言，路径与按钮可正常操作。
- `setupError` 继续通过 Modal 弹出，不影响关闭和重试行为。
- `npm run tauri dev` 可通过前端编译，TS/CSS 无错误。
