# Phase 5.57: Workspace 运行日志分类与详情优化

## Summary
- 在不修改任何 Tauri command、`invoke()` 名称/参数/返回类型、handler 内部逻辑或 Rust 接口的前提下，重做 `workspace-clone` 的运行日志抽屉与详情弹窗。
- 本轮只处理前端 `workspace-clone` 的日志展示层：增加分类筛选、紧凑卡片、详情弹窗和更清晰的层级，不接新的后端结构化日志源。
- 分类采用用户向合并口径：`全部 / 工具调用 / 技能调用 / 系统事件 / 其他`，同时保留每条日志的推断原始类型，供详情弹窗展示。

## Implementation Changes
- 文档先行：
  - 新增 `docs/phases/phase5.57_workspace_runtime_log_categorization.md`
  - 在 `docs/TODO.md` 增加对应未完成条目
- 数据层：
  - 为 `workspace-clone` 新增前端日志 view-model，将现有 `LogEntry` 派生为可展示结构
  - 保留原始字段：`time / level / message / humanized`
  - 新增派生字段：`id / category / rawType / title / summary / detailSections`
- 分类规则：
  - OpenClaw 当前代码路径中已处理的类型包括：`tool`、`skill`、`command`、`search`、`plan`、`approval`、`patch`、`thinking`、`other`
  - 前端将其收敛为：
    - `工具调用`：`tool`、`command`、`search`、`patch`
    - `技能调用`：`skill`
    - `系统事件`：基于日志内容识别的 gateway / service / connection / startup / diagnostics 等事件
    - `其他`：`plan`、`approval`、`thinking`、`other` 与未命中的普通日志
- 交互层：
  - 在 `WorkspaceCloneUtilityDrawer` 的 logs 面板增加分类 pills，默认选中 `全部`
  - 日志卡片改为紧凑信息结构：标题、摘要、时间/级别/类型 meta
  - 点击卡片打开独立详情弹窗，不在列表内展开
  - 无日志或当前分类无匹配项时显示 empty state
- 详情弹窗：
  - 复用现有 runtime log detail modal 容器，替换占位内容为真实日志详情
  - 展示分类、推断原始类型、日志级别、人话摘要与原始日志
  - 长文本使用 `pre-wrap` 与更轻量的 monospace/caption 呈现，避免当前字号过大、换行拥挤
- 样式：
  - 统一沿用现有 `--dc-workspace-*` / `--dc-*` token
  - 收紧日志卡片 padding、gap、字号与 meta 比例
  - 保持抽屉 hover / selected / focus-visible 反馈与现有 workspace 语义一致

## Public Interfaces / Type Notes
- 不修改任何 Rust command、Gateway RPC、`invoke()` 或共享后端契约。
- `LogEntry` 继续保持现状；新增类型仅限 `workspace-clone` 前端展示层内部使用。

## Test Plan
- 文档流程：
  - Phase 文档先落地
  - `docs/TODO.md` 先新增 `[ ]` 任务
- 交互验证：
  - 打开运行日志后默认显示 `全部`
  - 切换 `工具调用 / 技能调用 / 系统事件 / 其他` 时列表正确过滤
  - 点击任意日志后能打开详情弹窗；关闭后保留当前筛选状态
  - 长日志、时间戳前缀日志、`[ws]` / gateway / diagnostics 类日志不溢出
  - 某个分类没有命中项时 empty state 正常显示
- 视觉验证：
  - 卡片字号明显小于现状
  - 标题、摘要、meta 层级清晰
  - 桌面窄宽度下抽屉与详情弹窗不挤爆
- 提交前检查：
  - `npm run check:encoding`
  - `npm run check:file-size`
  - `npm run tauri dev`
  - 手动验证：启动服务 -> 打开网关 -> 首页聊天正常 -> 日志分类/详情可用

## Assumptions
- “系统调用”在实现上落为“系统事件”，因为当前代码路径中没有稳定的 OpenClaw 原生 `system call` 日志 kind。
- 本轮默认基于现有 `LogEntry.message` 与前端已知类型进行推断分类，不引入新的后端日志接口。
- 本轮不扩展日志复制、导出、搜索、全文过滤等能力，避免范围膨胀。
