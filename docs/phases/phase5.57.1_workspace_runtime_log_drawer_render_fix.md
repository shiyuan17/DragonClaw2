# Phase 5.57.1: Workspace 运行日志抽屉渲染修复
## Summary
- 修复 `workspace-clone` 右侧“运行日志”抽屉样式异常：日志卡片正文不可见、抽屉内容显得被挤压、筛选行在当前宽度下可读性不足。
- 继续限定为前端渲染层修复，只改日志抽屉相关 `.tsx` / `.css`，不修改任何 Tauri command、`invoke()` 调用、Gateway 协议或后端日志来源。
- 保持现有 `LogEntry -> WorkspaceRuntimeLogItem` 数据链路不变，本轮重点是把已有日志内容稳定显示出来，并让抽屉在当前桌面布局里更完整。

## Scope
- `src/components/workspace-clone/WorkspaceCloneLogsDrawerPanel.tsx`
- `src/components/workspace-clone/WorkspaceCloneRuntimeLogDetailModal.tsx`
- `src/styles/workspace-clone.css`

## Implementation Notes
- 日志卡片同时显示标题和摘要，而不是只保留一行摘要，提升扫读能力。
- 对日志标题/摘要增加渲染兜底：当 `sanitizeReadableText()` 把文本判为空时，界面仍回退显示原始字符串，而不是把卡片渲染成空白。
- 为日志卡片文本和 meta 标签增加更明确的文本填充与换行样式，避免在抽屉环境里出现“元素存在但文本不可见”。
- 适度放宽 `drawer-open` 时的右侧抽屉宽度，并让日志筛选 chips 在当前宽度下保持完整可读。
- 日志详情弹窗沿用现有数据，但标题/摘要同样使用前端可见性兜底，避免详情头部出现空白。

## Verification
- 打开 `workspace-clone > 聊天 > 运行日志`，确认抽屉卡片能看到标题、摘要和 meta。
- 切换 `全部 / 工具 / 技能 / 系统 / 其他` 筛选，确认 chips 不再显得被截断，日志列表仍能正常过滤。
- 点击任意日志进入详情，确认详情标题、摘要和原始日志都能显示。
- 提交前执行：
  - `npm run check:encoding`
  - `npm run check:file-size`

## Assumptions
- 当前问题的主因位于前端抽屉渲染与样式层，而不是 `logs` 源数据为空，因此本轮不改日志构建逻辑或后端日志采集。
