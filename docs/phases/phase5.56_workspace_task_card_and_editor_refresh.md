# Phase 5.56: Workspace 任务卡片与编辑弹窗重做
> Status: Planned
> Date: 2026-05-06
> Type: Frontend visual refresh

## Summary

- 在不改动任何 Tauri command、Gateway RPC、`invoke()` 契约和真实任务 handler 的前提下，重做 `workspace-clone` 任务抽屉卡片与编辑弹窗。
- 本期只改 `workspace-clone` 的 `.tsx/.css` 渲染层，并在必要时补充 `--dc-*` / `--dc-workspace-*` token，不引入独立任务子主题。
- 严格遵守“先文档、后代码”的 Dev Cycle：phase 文档与 `docs/TODO.md` 先提交，文档 commit 和代码 commit 分开。

## Implementation Changes

### 1. 任务抽屉列表重做

- 修正 `启用中 / 已停用` 筛选按钮样式，改成清晰的横向 pill tabs，避免当前按钮窄列挤压和竖排错位。
- 从任务抽屉中移除“最近运行”模块和任务卡片展开 footer。
- 点击任务卡片仍保留“选中任务 + 加载 runs”的现有逻辑，但抽屉内只保留选中高亮，不再内联展开 runs。
- 每个任务改为参考图 2 的紧凑小卡片布局：
  - 左侧：任务 icon、任务标题、下次任务执行时间、任务循环摘要。
  - 右侧：立即执行 icon、更多 icon。
- 立即执行保留真实 `onRunTask` 行为，但改为轻量 icon button。
- 更多菜单固定为：
  - `立即执行`
  - `暂停` 或 `启用`
  - `编辑`
  - `删除`
- 上述菜单项继续复用现有 `onRunTask / onToggleTaskEnabled / onEditTask / onDeleteTask`，不新增后端逻辑。
- 对非 `systemEvent` 任务，编辑项继续保持禁用并显示原因提示。

### 2. 任务显示文案收敛

- 任务卡片的调度信息优先显示友好的中文摘要：
  - `单次`
  - `每天`
  - `每周`
  - `每月`
- 无法映射到上述四类的规则统一显示为 `高级 Cron 规则`。
- 任务卡片不再展示现有 2x2 元信息网格和“结果摘要”大块内容，信息焦点收敛到标题、时间、循环和状态。

### 3. 编辑弹窗重做

- `WorkspaceCloneTaskEditorModal` 按参考图 4 改成深色、紧凑、卡片化表单。
- 可见字段只保留：
  - `名称`
  - `Agent`
  - `指令`
  - `执行时间`
- `Agent` 字段只读显示当前任务所属 Agent，不支持跨 Agent 改绑。
- 当前 modal 中的 `description`、`enabled`、`sessionTarget`、`wakeMode` 不再作为主编辑字段暴露；保存时沿用原值，启停继续通过任务菜单处理。
- 仅 `systemEvent` 任务允许打开新弹窗编辑；`agentTurn` 任务继续只能运行、启停、删除。

### 4. 执行时间规则

- 执行时间固定支持四种模式：
  - `单次`
  - `每天`
  - `每周`
  - `每月`
- 调度映射固定为：
  - `单次 -> schedule.kind = "at"`
  - `每天 / 每周 / 每月 -> schedule.kind = "cron"`
- 周期细节固定为：
  - `每天 = 时间`
  - `每周 = 星期 + 时间`
  - `每月 = 日期(1-31) + 时间`
  - `单次 = 日期 + 时间`
- 时间控件采用“可输入 + 可选择”模式：
  - 下拉提供 `00:00` 到 `23:30` 的半小时刻度。
  - 允许手动输入历史值并正常回显，例如 `23:37`。
- 对无法映射为这四类的现有高级 cron 规则：
  - 执行时间区显示 `高级 Cron 规则` 说明。
  - 不允许在本期通过新弹窗编辑该规则。
  - 不做自动近似或强制转换。

## Public Interfaces / Type Notes

- 不修改任何 `WorkspaceCron*` 公共类型、Gateway RPC 名称、参数和返回 shape。
- 允许新增前端本地 view-model / formatter / modal draft 字段，用于：
  - `每天 / 每周 / 每月` 的显示映射
  - 时间输入状态管理
  - 高级 cron 规则的只读识别

## Test Plan

- 文档流程：
  - 新增本 phase 文档。
  - 在 `docs/TODO.md` 增加对应 `[ ]` 条目。
  - 文档 commit 与代码 commit 分开。
- 静态检查：
  - `npm run check:encoding`
  - `npm run check:file-size`
- 启动验证：
  - `npm run tauri dev`
- 手动验证任务抽屉：
  - `启用中 / 已停用` tabs 正常横排显示。
  - 不再出现“最近运行”模块。
  - 任务卡片为紧凑小卡片结构。
  - 立即执行和更多菜单动作均能触发现有真实逻辑。
- 手动验证编辑弹窗：
  - `systemEvent` 任务可以打开新弹窗。
  - `agentTurn` 任务仍不可编辑。
  - `单次 / 每天 / 每周 / 每月` 能正确回填和保存。
  - `23:37` 之类非半小时历史值可正常回显和保留。
  - 高级 cron 规则显示为不可编辑。
- 回归验证：
  - 历史、memory、skills、tools、channel、related-resource 详情面板不回退。
  - 删除、启停、立即执行继续使用真实任务数据，不回退到 mock。

## Assumptions

- “去除最近运行模块”仅指任务抽屉内移除，不删除底层 runs 数据，也不影响其他详情来源。
- 月度规则选择 `29 / 30 / 31` 时，遵循 cron 原生行为：没有该日期的月份直接跳过，不做前端补偿。
- 参考图中的 `Agent` 仅作为结构展示，不扩展为新的真实改绑能力。
