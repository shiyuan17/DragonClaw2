# Phase 5.58.2: Workspace 会话菜单抽屉全高修复

## Summary
- 修复 `workspace-clone` 会话菜单抽屉在右侧显示不完整、下半部分被裁切的问题。
- 保持现有会话菜单入口、卡片点击、资源跳转与 `invoke()` / Gateway 契约不变。
- 本轮仅补强抽屉壳层的高度传递与滚动承接，不改任何业务逻辑。

## Implementation Changes
- 文档先行：
  - 新增本 Phase 文档。
  - 在 `docs/TODO.md` 追加 `Phase 5.58.2` 待办，便于后续验收。
- 布局修复：
  - 让右侧 drawer 轨道、drawer 外壳和 body 都明确吃满可用高度。
  - 避免会话菜单在长内容场景下只显示顶部卡片、底部内容被 shell 裁切。
  - 保持会话菜单本身仍复用统一 drawer 样式体系。

## Interfaces / Contracts
- 不修改任何 Tauri command 名称、参数或返回值。
- 不修改任何 Gateway 消息协议。
- 不修改会话菜单卡片的点击与跳转逻辑。

## Test Plan
- 打开聊天右侧 `会话菜单` 抽屉，确认面板完整贴满右侧高度。
- 验证底部区域不再被裁切，视觉上可以正常显示完整下半部分。
- 验证现有会话菜单卡片点击行为保持不变。
- 提交前执行：
  - `npm run check:encoding`
  - `npm run check:file-size`
  - `npm run tauri dev`

## Assumptions
- 问题根因和文件抽屉同源，都是 drawer shell 没有稳定传递全高约束。
- 仅补高度链路，不调整会话菜单内容卡片结构或交互语义。
