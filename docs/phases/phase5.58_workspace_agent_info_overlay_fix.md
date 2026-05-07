# Phase 5.58: Workspace Agent 信息弹窗入口修正
## Summary

- 修正 `workspace-clone` 中 Agent 信息弹窗迁移到了错误入口的问题。
- 旧仓库 `ChatAgentInfoReferenceModal` 对应的是聊天 overlay 栈中的 Agent 信息弹窗，而不是 `employees` 页员工详情弹窗。
- 本轮仅重建聊天头部 `Agent 信息` 按钮打开的 overlay：当 `selectedEntity.entityType === "agents"` 时使用 rich agent profile 布局；非 agent 实体继续保留轻量 fallback。

## Implementation Changes

- 在 `WorkspaceCloneOverlayStack` 中替换当前 4 宫格占位版 `Agent 信息` modal。
- 新增独立的前端 Agent info overlay 组件，内部按需调用 `loadAgencyRoleProfile(agentId)`，并复用现有 `AgencyRosterRoleProfile` 数据结构。
- 名称优先使用当前选中实体的实时展示名；使命、身份、workflow、capabilities、rules、likes/dislikes、人格雷达从 roster profile 补全。
- `status / currentWork / recentOutput` 作为顶部运行态补充信息保留，不再作为主内容 4 宫格展示。
- 非 agent 实体显示明确 fallback 文案，避免误判为迁移失败。
- 不回滚现有 `employees` rich modal，也不修改 Tauri / Gateway / `invoke()` 契约。

## Validation

1. 点击聊天头部 `Agent 信息` 按钮，确认打开 rich agent modal，而不是旧的 4 宫格占位版。
2. `main` 和普通 agent 都能显示名称、身份、使命、workflow、capabilities、rules、radar、likes/dislikes。
3. profile 字段缺失时仍能稳定 fallback，不出现空白塌陷。
4. 非 agent 实体打开时只显示轻量 fallback，不错误套用 agent 档案。
5. `employees` 页现有 rich modal 保持不变。
6. `npx tsc --noEmit`
7. `npm run check:encoding`
8. `npm run check:file-size`
9. `npm run build`
10. `npm run tauri dev`

## Assumptions

- 这次用户验收的“Agent 信息弹窗”指的是聊天头部按钮打开的 overlay。
- 本轮不处理非 agent 是否隐藏按钮，只为非 agent 场景提供清晰 fallback。
- 若后续需要与 `employees` 完全共享一套实现，可另开收敛任务处理。
