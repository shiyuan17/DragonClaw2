# Phase 5.15.11b: Workspace Composer 邮箱入口已绑定文案收敛

## Summary
- 将 `workspace-clone` 聊天 composer 中邮箱入口的已绑定态文案，从“邮箱 + 服务商名”调整为直接显示已绑定邮箱账号。
- 本轮仅调整前端渲染层显示，不修改邮箱绑定逻辑、弹窗行为、任何 `invoke()` 调用或后端接口。

## Implementation Changes
- 文档先行：
  - 新增本 Phase 文档记录文案收敛范围。
  - 在 `docs/TODO.md` 追加对应待办，方便验收留痕。
- 前端调整：
  - `WorkspaceCloneComposer.tsx` 已绑定态优先显示 `boundAccount`。
  - `WorkspaceClonePage.tsx` 将邮箱绑定 hook 中现有的 `boundAccount` 继续透传给 composer。

## Interfaces / Contracts
- 不修改任何 Tauri command、Gateway 协议或邮箱绑定数据结构。
- 不修改邮箱入口点击行为、保存行为和弹窗表单字段。

## Test Plan
- 在未绑定状态下查看 composer，确认入口仍显示“邮箱”。
- 绑定一个邮箱后查看 composer，确认入口直接显示对应邮箱账号，不再显示“邮箱 QQ 邮箱”这类前缀拼接文案。
- 点击邮箱入口后仍能正常打开邮箱绑定弹窗。
- 提交前执行：
  - `npm run check:encoding`
  - `npm run check:file-size`

## Assumptions
- `useWorkspaceEmailBinding()` 返回的 `boundAccount` 已覆盖当前 UI 需要展示的邮箱账号文本，无需新增接口字段。
