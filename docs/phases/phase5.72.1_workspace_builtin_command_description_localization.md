# Phase 5.72.1: Workspace 内置命令描述中文化
> Status: In Progress
> Date: 2026-05-11
> Type: Frontend copy refinement

## Background

`workspace-clone` 的内置 slash commands 已经接入 `/spec`、`/plan` 和 `/kb-*`，但命令管理弹窗与 `/` 联想列表仍直接显示英文 `description`。这会让中文界面的信息密度和一致性断裂。

## Goal

- 将内置 slash command 的用户可见描述统一改为中文。
- 保持命令值、命令名、隐藏 instruction、只读属性和现有发送链路不变。
- 限定为前端文案层调整，不修改 Tauri / Gateway / `invoke()` 契约。

## Scope

1. 更新 `src/components/workspace-clone/workspaceCloneSlashCommands.ts`
- 仅修改内置命令的 `description` 字段。
- 覆盖 `/spec`、`/plan`、`/kb-extract`、`/kb-digest`、`/kb-output`、`/kb-inspect`。

2. 保持以下边界不变
- 不修改自定义命令的持久化结构。
- 不修改命令的 `instruction` 内容。
- 不新增本地化字段或新的前端状态。

## Acceptance

- 命令管理弹窗中的内置命令描述显示为中文。
- `/` 联想列表中的同一批内置命令描述显示为中文。
- 自定义命令行为和显示逻辑不受影响。
- 不引入任何后端接口或消息协议变更。

## Test Plan

- 运行 `npm run check:encoding`。
- 运行 `npm run check:file-size`。
- 运行 `npx tsc --noEmit`。
- 手动验证命令管理弹窗和 `/` 联想列表中的内置命令描述已切为中文。
