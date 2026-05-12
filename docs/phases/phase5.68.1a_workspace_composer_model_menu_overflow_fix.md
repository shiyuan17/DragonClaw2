# Phase 5.68.1a: Workspace Composer 模型菜单遮挡修复

## Summary
- 修复 `workspace-clone` 聊天 composer 底部模型选择菜单向上展开时被输入容器裁切的问题。
- 本轮仅调整前端渲染层样式，保持现有模型菜单加载、切换、`invoke()` 与 Gateway 契约不变。

## Implementation Changes
- 文档先行：
  - 在 `docs/TODO.md` 追加本次 composer 弹层遮挡修复待办，保留验收留痕。
  - 新增本 Phase 文档，明确范围、边界与验证方式。
- 前端样式：
  - 调整 `workspace-clone.css` 中 composer 输入壳的溢出策略，允许模型菜单、slash 联想等向上弹层不再被容器裁切。
  - 保持输入壳自身圆角、边框、拖拽高亮与内部排版不变，不改按钮结构与事件处理。

## Interfaces / Contracts
- 不修改任何 Tauri command、Gateway 事件、`invoke()` 名称 / 参数 / 返回结构。
- 不修改 `WorkspaceCloneComposer.tsx` 中的模型菜单开关、加载、重试、切换逻辑。

## Test Plan
- 打开 `workspace-clone` 聊天 composer，点击当前模型 pill：
  - 模型列表向上展开时不再被输入框上边缘裁切。
  - “配置自定义模型” footer 按钮完整可见且可点击。
  - 选择模型、加载失败重试、空态提示行为保持不变。
- 输入 `/` 触发联想：
  - slash command / skill 联想弹层继续正常显示，不被 composer 容器裁切。
- 提交前执行：
  - `npm run check:encoding`
  - `npm run check:file-size`

## Assumptions
- 本次遮挡问题的主因是 composer 输入壳的 `overflow: hidden` 裁切，而非模型菜单数据、定位锚点或 z-index 计算错误。
