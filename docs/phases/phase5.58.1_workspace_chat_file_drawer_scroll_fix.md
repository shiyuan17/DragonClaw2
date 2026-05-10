# Phase 5.58.1: Workspace 聊天文件侧栏滚动修复

## Summary
- 修复 `workspace-clone` 聊天右侧 `文件` 抽屉在长列表下无法独立滚动的问题。
- 保持现有文件分类、打开行为、`invoke()` 调用与 Tauri / Gateway 契约不变。
- 本轮仅调整前端抽屉布局与滚动承接，不改动文件提取逻辑、事件处理或后端实现。

## Implementation Changes
- 文档先行：
  - 新增本 Phase 文档。
  - 在 `docs/TODO.md` 追加 `Phase 5.58.1` 待办，便于后续验收留痕。
- 布局修复：
  - 让右侧抽屉轨道层成为显式纵向布局容器，把可用高度传给内部 drawer shell。
  - 让 drawer shell 在轨道内按剩余空间伸展，避免内容高度按列表自然撑开。
  - 保持筛选区位于滚动区之外，确保长列表滚动时筛选按钮持续可见。
- 滚动体验：
  - 继续由 `workspace-clone__drawer-body` 作为唯一纵向滚动容器。
  - 为 drawer body 增加更稳定的滚动边界行为，避免滚动穿透到外层聊天布局。

## Interfaces / Contracts
- 不修改任何现有 Tauri command 名称、参数或返回值。
- 不修改任何现有 Gateway 消息协议。
- 不修改文件抽屉的筛选类型、打开目标语义或前端 `onOpenChatFile` 调用方式。

## Test Plan
- 打开聊天右侧 `文件` 抽屉，构造超过一屏的文件/链接列表。
- 验证抽屉内部可独立纵向滚动，聊天主内容区不跟随一起滚动。
- 验证 `全部 / 网站 / 文档 / Excel / PPT / 图片 / 视频 / 音频` 筛选按钮始终可见。
- 验证点击文件卡片仍沿用现有打开行为。
- 提交前执行：
  - `npm run check:encoding`
  - `npm run check:file-size`
  - `npm run tauri dev`

## Assumptions
- 问题根因是抽屉轨道层未把高度约束稳定传递给内部 drawer shell，而非文件提取数据异常。
- 这次修复默认同时改善 `history / logs / schedule / workbench` 等复用同一抽屉壳层的滚动承接，但不主动改动这些面板内容结构。
