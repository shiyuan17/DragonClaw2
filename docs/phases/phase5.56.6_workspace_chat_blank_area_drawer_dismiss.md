# Phase 5.56.6: Workspace 聊天空白区收起右侧边栏

> Status: Planned
> Date: 2026-05-07
> Type: Frontend interaction polish

## Goal

在 `workspace-clone` 聊天页中，当右侧 utility drawer 已展开时，支持点击聊天主画布中的空白区域直接收起右侧边栏，减少来回点右上角关闭按钮的操作成本。

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

- 在 `WorkspaceCloneChatView` 中为聊天画布的空白容器补充轻量点击关闭逻辑。
- 使用现有 `onCloseUtilityPanel` 回调，不新增全局状态或新的公共接口。
- 通过仅响应容器自身空白区域点击，避免影响：
  - 消息卡片点击/选中文本
  - 欢迎态建议卡片
  - 服务启动面板按钮
  - drawer 内任务/历史/工作台操作

## Acceptance Criteria

- 右侧边栏展开时，点击聊天区空白处会立即收起边栏。
- 点击消息内容、按钮、建议卡片、composer、drawer 内容不会误触发收起。
- 聊天消息滚动、滚到底部按钮、历史会话切换、任务面板操作保持原行为。

## Validation

- `npm run check:encoding`
- `npm run check:file-size`
- `npm run tauri dev`
- 手动验证：
  - 打开任意右侧 utility drawer；
  - 点击聊天空白区域，drawer 收起；
  - 再次打开 drawer，点击消息/按钮/建议卡片，drawer 保持打开。
