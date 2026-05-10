# Phase 5.58: Workspace 历史会话标题恢复
> Status: implementation
> Type: frontend hotfix

## Summary

- 修复 `workspace-clone` 历史会话抽屉中只显示时间、不显示会话标题的回归问题。
- 统一右侧历史抽屉与左侧数字员工最近会话的标题来源，优先显示可读的会话首条意图标题。
- 修复新建真实 session 发送首条消息后，左侧会话列表仍停留在 `历史会话` 的滞后问题；改为首条可见用户输入一发送就立即同步标题。
- 保持现有 Tauri command、Gateway 协议与前端 `invoke()` 名称 / 参数 / 返回类型不变。

## Scope

- 历史会话抽屉中的会话标题显示。
- 数字员工二级最近会话与历史抽屉之间的标题一致性。
- 本地 SQLite 会话缓存中的空标题自愈与标题回填。

## Implementation Notes

- 文档先行：
  - 更新 `docs/phases/phase5.58_workspace_history_title_restoration.md`
  - 更新 `docs/TODO.md` 中对应 Phase 描述
- 数据层修复：
  - 优先复用现有 `WorkspaceHistoryItem.title`
  - 为选中 Agent 的历史会话补齐标题预取与缓存回填
  - 对本地缓存中的空标题使用已缓存消息进行自愈
  - 对新建真实 session 的首条可见用户消息执行前端乐观标题写入，并立即写回现有 SQLite session cache
- 渲染层兜底：
  - 仅当标题最终不可用时，回退到稳定的 `主会话 / 历史会话 / 任务运行`
  - 不改现有筛选事件、会话切换和任何业务 handler
  - 历史抽屉与左侧 agent 次级会话继续复用同一套标题解析与缓存优先级

## Public Interfaces

- 不新增、不删除、不修改任何 Tauri command。
- 不修改任何前端 `invoke()` 调用名称、参数或返回类型。
- `WorkspaceHistoryItem` 类型保持兼容。

## Test Plan

- 打开历史会话抽屉时，每条记录都应显示标题和时间，而不是只显示时间。
- 同一条会话在数字员工最近会话与历史抽屉中应显示相同标题。
- 对于旧缓存里没有标题的会话，重新打开后应能从缓存消息中回填出标题。
- 点击 `新对话` 创建真实 session 后，发送首条消息时，左侧会话标题应立即从 `历史会话` 切换为该条可见用户输入，即使助手仍在流式回复中。
- 回复完成、切换会话、重连 Gateway 或重启应用后，首条消息派生出的标题不应被重新压回 `历史会话`。
- 提交前执行：
  - `npm run check:encoding`
  - `npm run check:file-size`
  - `npm run tauri dev`

## Assumptions

- 本轮按前端热修处理，不做 SQLite schema 变更。
- 现有会话缓存结构足以支撑标题回填，不新增后端接口契约。
- 本轮不扩展为历史抽屉整体视觉重做，只修复标题显示与回填链路。
