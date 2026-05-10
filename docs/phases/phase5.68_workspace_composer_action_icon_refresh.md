# Phase 5.68: Workspace Composer Action Icon Refresh

## Summary
- 调整 `workspace-clone` 聊天 composer 右侧操作区的图标语义。
- 将原本的文字型 `新对话` 入口收敛为更明确的图标按钮。
- 将发送按钮从偏导航语义的右箭头替换为标准发送图标。
- 本轮仅修改前端渲染层与必要样式，不改任何会话重置、消息发送、Tauri command、Gateway 或 `invoke()` 契约。

## Implementation Changes
- 文档先行：
  - 在 `docs/TODO.md` 记录本次 UI 微调任务。
  - 新增本 Phase 文档，说明范围与约束。
- 前端渲染：
  - `WorkspaceCloneComposer.tsx` 中将 `新对话` 入口改为图标按钮，并保留现有 `onResetSession()` 行为。
  - 发送按钮沿用原有点击、禁用和生成态逻辑，仅替换展示图标。
- 图标映射：
  - 在 `workspaceCloneIcons.tsx` 中补充本次 composer 需要的新图标映射。

## Interfaces / Contracts
- 不修改任何 Tauri command、Gateway 事件、`invoke()` 名称/参数/返回结构。
- 不修改 `onResetSession()`、`onSend()`、`onAbort()` 的调用时机与条件。

## Test Plan
- 检查 `workspace-clone` composer 中：
  - `新对话` 已由文字按钮改为图标按钮，点击仍能触发原有新会话/重置链路。
  - 发送按钮图标已更新为更符合发送语义的图标，禁用与可点击状态保持不变。
  - 语音按钮、停止按钮及其相邻布局未受影响。
- 提交前执行：
  - `npm run check:encoding`
  - `npm run check:file-size`

## Assumptions
- 这次需求聚焦于视觉语义优化，不要求更改按钮层级、交互流程或会话行为。
