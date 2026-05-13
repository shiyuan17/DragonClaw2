# Phase 5.69.2: Workspace Composer 已选项目目录名称显示

## Summary

- 调整 `workspace-clone` composer 底部的项目目录入口：未选择目录时保持当前紧凑文件夹图标态，已选择目录后显示目录名称。
- 仅修改前端渲染层与样式层，不改任何目录选择、清空、消息注入或 Tauri / Gateway / `invoke()` 契约。

## Implementation Changes

- 文档留痕：
  - 在 `docs/TODO.md` 记录本次 UI 微调为待验收项。
  - 新增本 Phase 文档，说明范围与约束。
- 前端渲染：
  - 更新 `WorkspaceCloneSessionWorkdirPicker.tsx`，复用现有目录名解析结果。
  - `composer` 变体在已选目录时显示目录名称，在未选目录时继续保持 icon-only 入口。
- 样式对齐：
  - 更新 `src/styles/workspace-clone.css`，让已选目录状态在有限宽度内展示目录名，并对超长名称做省略。

## Interfaces / Contracts

- 不修改目录选择、目录清空、会话级工作目录状态、保存或隐藏上下文注入逻辑。
- 不修改任何 Tauri command、Gateway 事件、`invoke()` 名称、参数或返回结构。

## Test Plan

- 检查 `workspace-clone` composer：
  - 未选择目录时，入口仍为当前紧凑文件夹图标按钮。
  - 选择目录后，按钮显示目录名称而不是仅显示图标。
  - hover / title 仍可查看完整路径。
  - 再次打开菜单后，选择新目录与清空目录行为保持不变。
- 提交前执行：
  - `npm.cmd run check:encoding`
  - `npm.cmd run check:file-size`

## Assumptions

- 当前需求只要求在已选择目录后显示目录名称，不要求同时显示完整路径、副标题或新增 badge。
- 欢迎态 hero 的工作目录入口文案保持不变，只调整 composer 里的已选态表现。
