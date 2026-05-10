# Phase 5.15.11a: Workspace Composer 邮箱入口高亮语义修正

## Summary
- 修正 `workspace-clone` 聊天 composer 中邮箱入口的高亮语义。
- 已绑定邮箱仍显示绑定信息，但不再因为“已绑定”而常驻使用选中高亮。
- 本轮仅调整前端渲染层样式语义，不改邮箱绑定逻辑、点击行为或任何 `invoke()` 契约。

## Implementation Changes
- 文档先行：
  - 新增本 Phase 文档。
  - 在 `docs/TODO.md` 追加对应待办，方便后续验收追踪。
- 前端修正：
  - 移除邮箱 pill 依据 `emailBindingBound` 自动附加的 `is-active` 选中态。
  - 保留“邮箱 + 已绑定服务商”文案，继续作为状态提示，而不是视觉选中态。

## Interfaces / Contracts
- 不修改任何 Tauri command、Gateway 协议或邮箱绑定数据结构。
- 不修改邮箱入口点击后打开弹窗的行为。

## Test Plan
- 在已绑定邮箱状态下查看 composer，确认邮箱 pill 不再呈现常驻高亮。
- 点击邮箱 pill 后仍能正常打开邮箱绑定弹窗。
- 未绑定状态下样式保持原状。
- 提交前执行：
  - `npm run check:encoding`
  - `npm run check:file-size`

## Assumptions
- 当前高亮问题来自邮箱入口复用了“被选中项”的 `is-active` 语义，而不是 hover / focus-visible 样式异常。
