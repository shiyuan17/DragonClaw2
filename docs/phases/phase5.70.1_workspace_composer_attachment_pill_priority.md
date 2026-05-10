# Phase 5.70.1: Workspace Composer 附件入口前置

## Summary
- 将 `workspace-clone` composer 底部 pills 中的附件入口移动到首位。
- 将附件入口收敛为纯图标按钮，不再显示“附件”文字。
- 仅调整前端渲染层与样式，不修改附件选择、附件发送、工作目录、命令、模型或任何 Tauri / Gateway / `invoke()` 契约。

## Implementation Changes
- 文档先行：
  - 在 `docs/TODO.md` 记录本次 UI 微调任务。
  - 新增本 Phase 文档说明范围与约束。
- 前端渲染：
  - 更新 `src/components/workspace-clone/WorkspaceCloneComposer.tsx` 中 pills 顺序，将附件按钮前移到最左侧。
  - 附件按钮保留现有点击行为，但改为仅展示 `paperclip` 图标。
  - 通过 `aria-label` / `title` 保留“添加附件 / 已选 N 个附件”语义，避免纯视觉无文案后丢失可访问性。
- 样式：
  - 在 `src/styles/workspace-clone.css` 为 composer 附件入口增加 icon-only 变体，收敛宽度、内边距和图标居中表现。

## Interfaces / Contracts
- 不修改任何附件上传、消息发送、工作目录选择、命令、模型相关函数签名。
- 不修改任何 Tauri command、Gateway 事件、`invoke()` 名称、参数或返回结构。

## Test Plan
- 检查 `workspace-clone` composer：
  - 附件入口显示在 pills 最左侧。
  - 按钮无可见“附件”文字，仅保留图标。
  - 点击附件按钮仍可正常打开文件选择器。
  - 已选附件后，附件卡片、发送链路与 active 样式仍正常工作。
- 提交前执行：
  - `npm run check:encoding`
  - `npm run check:file-size`

## Assumptions
- “不要文字”仅针对 composer pills 中的附件入口可见文案，不影响附件卡片中的文件名与错误提示。
- 当前需求不要求新增角标、计数 badge 或替换附件交互流程。
