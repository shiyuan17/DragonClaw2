# Phase 5.68.2: Workspace Composer Connected Status Pill Removal

## Summary
- 去掉 `workspace-clone` 聊天 composer 中常驻显示的“会话已连接”状态 pill。
- 保留连接中、未启动、连接异常，以及生成中这类仍然有诊断价值的状态反馈。
- 仅调整前端渲染层，不改任何 Tauri / Gateway / `invoke()` 契约。

## Implementation Changes
- 在 `WorkspaceCloneComposer.tsx` 中为 composer 状态展示增加更细的显示条件。
- 当会话已经连通且当前不在生成回复时，不再渲染状态 pill。
- 其它状态文案与现有按钮行为保持不变。

## Interfaces / Contracts
- 不修改任何 Tauri command、Gateway 事件、`invoke()` 名称 / 参数 / 返回结构。
- 不修改 `onResetSession()`、`onSend()`、`onAbort()` 的调用时机与禁用条件。

## Test Plan
- 检查 `workspace-clone` composer：
  - 会话正常连接且空闲时，不再显示“会话已连接” pill。
  - 连接中、未启动、异常状态下，原有状态提示仍然可见。
  - 生成回复时，仍可见生成态提示，且停止 / 发送按钮行为不变。
- 提交前执行：
  - `npm run check:encoding`
  - `npm run check:file-size`

## Assumptions
- 本次需求针对的是常驻“已连接”视觉占位，而不是要彻底移除所有连接状态反馈。
