# Phase 5.58.x: Workspace 日志与历史会话错码热修
> Status: planning / implementation
> Type: frontend hotfix

## Summary

- 修复 `workspace-clone` 中两条高曝光展示链路的错码回归：
  - `运行日志` 抽屉卡片不再优先显示坏掉的人话摘要或空白占位
  - `历史会话` 抽屉不再出现“只有时间没有标题”
- 保持现有 Tauri command、Gateway RPC、`invoke()` 名称/参数/返回类型与 Rust 接口完全不变。
- 本轮只处理前端展示与前端缓存自愈；顺手清理与这两个问题直接相邻的用户可见错码文案，但不扩展为全仓库乱码治理。

## Implementation Changes

- 文档先行
  - 新增本 phase 文档
  - 在 `docs/TODO.md` 增加对应未完成任务
- 日志链路
  - 修复 `src/utils/log-humanizer.ts` 中已损坏的人话日志文案，统一恢复为正常 UTF-8 中文
  - 在 `workspaceCloneLogs` 中加入“疑似错码”保护：
    - `humanized` 为空、错码、或不适合展示时，自动回退到清洗后的原始 `message`
    - 日志卡片标题、摘要、详情摘要共享同一套安全文本优先级
  - 不改 `LogEntry` 数据结构，不接新的后端结构化日志源
- 历史会话标题链路
  - 在 `message-normalizers.ts` 中收紧标题有效性判断，过滤：
    - 原始 session key
    - 空白或无意义标题
    - 疑似错码标题
  - 在 `history-titles.ts` 中保留现有缓存流程，但把坏 `title` 视为需要修复的数据：
    - 优先使用内存消息
    - 其次使用本地 `messagesJson`
    - 在线时继续使用 `chat.history`
    - 修复后写回前端缓存与 SQLite 缓存
  - `useWorkspaceGatewayChat.ts` 与 `agent-recent-sessions.ts` 继续用统一的标题解析器，避免历史抽屉和 Agent 最近会话标题不一致
- 相邻可见文案
  - 只清理本轮相关文件中的日志/历史会话可见错码文案
  - 如果 `npm run check:encoding` 仍命中这些同链路文件，再在本轮内继续收口；不扩散到无关模块

## Public Interfaces

- 不新增、不删除、不修改任何 Tauri command、Gateway RPC、`invoke()` 调用或返回类型。
- `WorkspaceHistoryItem`、`LogEntry`、`WorkspaceRuntimeLogItem` 对外结构保持兼容。
- 新增判断与错码过滤仅限前端内部展示、缓存恢复与容错逻辑。

## Test Plan

- 打开 `运行日志` 抽屉：
  - 卡片首行显示可读摘要
  - 命中人话翻译时显示正常中文
  - 人话摘要坏掉或为空时显示清洗后的原始日志
- 打开 `历史会话` 抽屉：
  - 每条会话至少显示稳定标题
  - 旧缓存 `title` 损坏但 `messagesJson` 仍在时能自动恢复
  - 断开 Gateway 时仍至少显示 `主会话 / 历史会话`
- 回归验证：
  - 会话切换、发送消息、`新对话`、`reset`
  - 日志详情弹窗
  - 日志分类筛选
  - Agent 最近会话摘要
- 提交前执行：
  - `npm run check:encoding`
  - `npm run check:file-size`
  - `npm run tauri dev`

## Assumptions

- 这是一次前端热修，不做 SQLite schema 变更。
- 历史标题最终兜底仍保持 `主会话 / 历史会话`。
- 本轮不处理与日志/历史会话无直接关系的其他乱码链路，即使它们仍存在于工作区其它模块中。
