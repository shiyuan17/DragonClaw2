# Phase 5.71.2: Workspace 知识库入口收敛

## Summary

将知识库从 workspace 主侧边栏一级入口降级为聊天 / Agent 工作流中的资源入口。知识库能力本身继续保留，包括本地知识库创建、文件浏览、Lake 文本编辑与自动保存；入口改为聊天 composer 中的轻量按钮，并配合 `/kb-*` 内置命令把知识库作为 Agent 工作材料使用。

## Goals

- 主侧边栏不再显示“知识库管理”，降低 workspace 一级导航复杂度。
- 历史状态或缓存中的 `knowledge` 菜单值自动回落到 `chat`，避免空白页或运行时错误。
- 聊天 composer 提供“知识库”入口，打开现有知识库页面作为资源面板。
- 新增 `/kb-extract`、`/kb-digest`、`/kb-output`、`/kb-inspect` 内置 slash commands，引导 Agent 按 `src/data/knowledge/Command/*` 规则处理知识库。
- 不修改、不删除任何现有 Tauri command 签名；保留 `WorkspaceMenuKey` 中的 `knowledge` 作为兼容类型。

## Scope

- 修改 `workspaceCloneData.ts`，从 `WORKSPACE_MENU_ITEMS` 移除 `knowledge`。
- 修改 `WorkspaceClonePage.tsx`，移除知识库主页面分支，增加知识库面板状态与旧入口兜底。
- 修改 `WorkspaceCloneComposer.tsx`，增加知识库入口按钮。
- 修改 `workspaceCloneSlashCommands.ts`，新增知识库内置命令。
- 修改 `workspace-clone.css`，为知识库面板增加必要 overlay / drawer 样式。

## Non-goals

- 不删除 `WorkspaceCloneKnowledgePage`、Lake 编辑器、知识库 hook、后端知识库模块或本地数据结构。
- 不新增后端接口。
- 不在本阶段实现全局当前知识库 store；命令先通过提示要求 Agent 使用已打开 / 已选择的知识库上下文，缺失时引导用户先选择或创建。
- 不清理 `WorkspaceMenuKey` 的 `knowledge` 成员，后续稳定后单独处理。

## Test Plan

- 主侧边栏不显示“知识库管理”。
- 如果旧状态进入 `knowledge`，页面自动回到聊天页。
- 聊天 composer 中点击“知识库”可打开知识库资源面板。
- 资源面板中创建、浏览、编辑和自动保存仍可使用。
- slash command 候选中出现 `/kb-extract`、`/kb-digest`、`/kb-output`、`/kb-inspect`。
- 发送 `/kb-*` 时注入明确的知识库工作流 instruction。
- 运行 `npm run check:encoding`、`npm run check:file-size`、`npx tsc --noEmit`、`npm run build`。
