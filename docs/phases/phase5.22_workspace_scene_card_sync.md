# Phase 5.22: workspace-clone 场景卡片功能同步

> 状态：开发中
> 类型：前端功能迁移 / 交互补齐

## 目标

将 `D:/Github/DragonClaw` 中首页聊天区已存在的“场景卡片”能力同步到 `DragonClaw2` 的 `workspace-clone` 首页聊天区，补齐：

- 场景分组卡片
- 分组下的案例二级页
- 点击案例后回填到聊天输入框
- 仅在 Agent 聊天中显示
- 按当前会话记忆开合状态

全程不修改任何 Rust 后端命令、`invoke()` 契约或网关聊天协议。

## 本次范围

- 新增场景卡片数据源，直接沿用 `DragonClaw` 现有 5 组场景与案例文案。
- 新增本地 `localStorage` 状态工具，按 `entity + session` 维度持久化场景卡片开合状态。
- 新增 React 版场景卡片组件，保留“卡片分组 -> 案例列表 -> 一键回填”的两级交互。
- 让 `WorkspaceCloneComposer` 支持外部回填输入值，并新增场景卡片显示/收起入口。
- 在 `WorkspaceClonePage` 接入显示条件与发送后收起逻辑。
- 在 `WorkspaceCloneChatView` 隐藏旧欢迎态 suggestion cards，避免与新场景卡片重复占位。
- 在 `src/styles/workspace-clone.css` 为场景卡片补齐紧凑布局样式，并复用现有 `--dc-*` token。

## 不包含

- 不新增、不删除、不改名任何 Tauri / Rust 命令。
- 不修改聊天发送、停止生成、历史同步、Agent 列表或频道绑定的既有业务逻辑。
- 不改动 legacy 控制台页面。
- 不引入新的测试框架或后端数据结构。

## 验收标准

- 仅在 `workspace-clone > chat > agents` 场景下显示场景卡片。
- 点击场景分组后可进入案例列表，再点击案例即可把完整文案回填到 composer。
- 点击发送后，当前会话下的场景卡片自动收起。
- 刷新页面后，当前会话的开合状态能够恢复。
- 旧欢迎态 suggestion cards 不再与场景卡片同时出现，输入区上方占位更紧凑。
