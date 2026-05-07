# Phase 5.56.6: Workspace 聊天空白区收起右侧边栏

> Status: Implemented, pending acceptance
> Date: 2026-05-07
> Type: Frontend interaction polish

## Goal

在 `workspace-clone` 聊天页中，当右侧 utility drawer 已展开时，支持点击聊天主画布中的空白区域直接收起右侧边栏，减少来回点击右上角关闭按钮的操作成本。

## Scope

- 仅调整前端 `.tsx` 渲染层交互。
- 只影响 `workspace-clone` 聊天主区与右侧 utility drawer 的显隐交互。
- 保持现有消息发送、任务抽屉、历史会话、模型设置、渠道入口等行为不变。

## Constraints

- 不修改任何 Tauri command、Gateway RPC、`invoke()` 调用或返回契约。
- 不改动后端 Rust 文件。
- 不改变消息卡片、按钮、表单、composer、drawer 内部点击行为。
- 仅“空白区域点击”触发收起，不把正常内容交互误判成关闭操作。

## Implementation Notes

- 在 `WorkspaceCloneChatView` 中复用现有 `handleBlankAreaClick` / `onCloseUtilityPanel` 逻辑，不新增全局状态或公共接口。
- 继续只响应容器自身的空白点击，避免影响消息正文、头像、建议卡片、服务启动面板按钮和 drawer 内部操作。
- 补充消息行背景空白命中：聊天消息 `article` 会撑满整行宽度，所以点击气泡左右两侧的行内空白时，也按“空白区域”处理并收起右侧边栏。

## Acceptance Criteria

- 右侧边栏展开时，点击聊天区空白处会立即收起边栏。
- 点击消息内容、按钮、建议卡片、composer、drawer 内容不会误触发收起。
- 聊天消息滚动、滚到底部按钮、历史会话切换、任务面板操作保持原行为。

## Validation

- `npm run check:encoding`
- `npm run check:file-size`
- `npm run tauri dev`
- 手动验证：
  - 打开任意右侧 utility drawer。
  - 点击聊天空白区域，drawer 收起。
  - 再次打开 drawer，点击消息、按钮或建议卡片，drawer 保持打开。
