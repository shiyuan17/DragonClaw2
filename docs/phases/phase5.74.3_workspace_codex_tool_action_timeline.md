# Phase 5.74.3: Workspace Codex 式工具操作类型

> Status: Planned
> Type: Workspace chat output refinement

## Goal

在 `workspace-clone` 主聊天区继续对齐 Codex 的工具调用展示方式：工具和命令不再统一显示为“调用工具 / 执行命令”，而是根据真实动作显示“正在编辑 / 已编辑”“正在创建 / 已创建”“正在读取 / 已读取”“正在搜索 / 已搜索”等状态。

本阶段只修改前端实时运行展示、折叠摘要、样式和测试，不修改 Rust、Tauri command、Gateway event 格式或任何 `invoke()` 契约。

## Current Problem

- `WorkspaceLiveStep` 目前只有 `kind` 与 `status`，表达力不足，文件写入、补丁编辑、读取、搜索等操作会被压成泛化标签。
- `WorkspaceCloneLiveTimeline` 的标签由 `kind` 决定，无法组合出 Codex 式“动作 + 状态”文案。
- 工具标题没有优先提取文件路径、命令摘要或搜索词，用户难以判断每一步实际做了什么。

## Implementation Plan

- 为前端内部 live step 增加 `action` 语义层，覆盖 `read / create / edit / delete / search / command / skill / plan / approval / generic-tool`。
- 在 `live-steps.ts` 中从 `name / toolName / kind / title / command / args` 推断 action，并保留无法识别时的安全回退。
- 文件类工具优先展示目标文件名或路径摘要；命令类展示首行命令；搜索类展示 query；未知工具保留现有标题。
- `WorkspaceCloneLiveTimeline` 改为 action-aware 标签和图标，状态文案组合为“正在创建 / 已创建 / 创建失败”等。
- 样式增加 action class，但继续使用 `--dc-*` / workspace semantic tokens，不新增独立主题。

## Acceptance Criteria

- `write` / `create_file` 工具运行中显示“正在创建”，完成后显示“已创建”。
- `edit` / `apply_patch` 工具运行中显示“正在编辑”，完成后显示“已编辑”。
- `read` 工具运行中显示“正在读取”，完成后显示“已读取”。
- `search` 工具运行中显示“正在搜索”，完成后显示“已搜索”。
- `shell` / `exec` 工具运行中显示“正在运行命令”，完成后显示“已运行命令”。
- raw stdout / stderr、目录列表、raw JSON / process payload 仍不作为普通 assistant 消息铺开。

## Validation

- `npm run check:encoding`
- `npm run check:file-size`
- `npm run test:frontend -- live-steps WorkspaceCloneLiveTimeline workspaceCloneMessageVisibility`
- `npm run build`
