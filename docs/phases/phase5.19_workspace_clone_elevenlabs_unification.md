# Phase 5.19: workspace-clone ElevenLabs 全量统一

> 状态：待验收
> 类型：前端视觉迁移 / 设计系统收口

## 目标

在现有 `src/styles/tokens.css` 全局主题底座之上，把 `workspace-clone` 从独立浅蓝 clone 子主题迁到 ElevenLabs 统一品牌体系，保留现有布局、交互结构、状态流和命令契约不变，只重构相关前端渲染层与样式层。

## 本次范围

- 为 workspace-clone 新增 `--dc-workspace-*` token 语义层。
- 收敛 `src/styles/workspace-clone.css` 顶部 `--workspace-*` 局部变量体系，使其只做兼容映射或被删除。
- 统一三栏壳层、聊天主区、composer、drawer、popover、context menu、resource / memory / skills / tools / model config / binding 等次级表层的视觉语言。
- 清理 workspace-clone 相关 TSX 中零散的内联视觉样式，尽量回收到 class 或 CSS 变量。

## 不包含

- 不修改任何 `invoke()` 调用、hooks 业务逻辑、gateway / memory / skills / tools / channels 的数据结构与接口契约。
- 不将 legacy `dashboard/settings/models/agents/logs/tabs` 作为本轮主任务。
- 不新增独立的 workspace 子主题真源变量体系。

## 验收标准

- `workspace-clone.css` 不再承担独立品牌定义，新增视觉原语统一提升到 `src/styles/tokens.css`。
- `workspace-clone` 默认首页、collapsed / expanded 状态、drawer / modal / popover / context menu 在 ElevenLabs 视觉语言下统一成立。
- 构建通过：`npm run build` 无 TS/CSS 编译错误。
- 人工回归通过：聊天、切换侧栏、打开各 modal / drawer / popover、频道/Agent 切换与表单输入不受影响。
