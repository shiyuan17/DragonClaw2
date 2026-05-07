# Phase 5.58: Workspace 聊天文件侧栏

## Summary
- 在 `workspace-clone` 聊天顶部“更多”菜单新增 `文件` 入口，点击后复用现有右侧 utility drawer 打开“文件”侧栏。
- 文件侧栏只面向当前激活会话，收录当前会话中 `用户 + 助手` 消息里可直接定位和打开的文件、链接或本地路径引用。
- 首版支持 `全部 / 网站 / 文档 / excel / ppt / 图片 / 视频 / 音频` 8 个筛选项，点击条目直接打开目标。
- 本轮严格限定为前端聊天工作区展示层改造，不修改现有 Tauri command、`invoke()` 契约、Gateway 协议或消息发送逻辑。

## Implementation Changes
- 文档先行：
  - 新增本 Phase 文档。
  - 在 `docs/TODO.md` 增加 `Phase 5.58` 未完成项，保持任务可追踪。
- 类型与状态：
  - 在 `workspaceCloneTypes.ts` 扩展 `WorkspaceUtilityPanel`，新增 `"files"`。
  - 新增前端内部类型 `WorkspaceChatFileCategory`、`WorkspaceChatFileSourceRole`、`WorkspaceChatFileItem`。
- 数据提取：
  - 新增独立前端提取模块，从 `WorkspaceMessage[]` 扫描文件/链接项，避免把解析逻辑堆进大组件。
  - 支持识别：
    - Markdown 链接
    - 裸 `http/https` 链接
    - 裸本地文件路径
    - `file://` URL
  - 分类规则：
    - `网站`：常规 `http/https` 页面链接，且不命中文档或媒体扩展名
    - `文档`：`pdf/doc/docx/txt/md/rtf`
    - `excel`：`xls/xlsx/csv`
    - `ppt`：`ppt/pptx/key`
    - `图片`：常见图片扩展
    - `视频`：常见视频扩展
    - `音频`：常见音频扩展
  - 去重规则：
    - 以标准化后的目标 `target` 去重。
    - 同一目标重复出现时保留最新一次出现的时间、来源消息和预览摘要。
- UI 接入：
  - `WorkspaceCloneHeader` 的更多菜单新增 `文件` 项，行为与 `历史会话 / 运行日志 / 任务` 一致。
  - `WorkspaceClonePage` 基于当前会话消息实时派生 `fileItems` 并传给聊天视图，不引入新的后端请求。
  - `WorkspaceCloneUtilityDrawer` 新增 `files` 面板，头部显示标题与 8 个筛选项，主体显示文件卡片列表与空态。
- 打开行为：
  - 所有 `http/https` 目标继续沿用现有 `open_url` 语义。
  - 本地文件路径与 `file://` URL 使用前端桌面打开能力，优先采用已安装的 `@tauri-apps/plugin-opener` `openPath()`。
  - 首版不做侧栏内预览、不做复制优先流、不新增后端打开命令。
- 样式：
  - 复用现有 drawer、filter、card 样式结构。
  - 仅在 `workspace-clone.css` 中补充少量文件卡片与筛选布局样式，不新增独立视觉系统。

## Interfaces / Contracts
- 不修改任何现有 Tauri command 名称、参数或返回值。
- 不修改现有 Gateway 消息协议。
- 新增的仅为前端内部类型与派生数据模型：
  - `WorkspaceUtilityPanel += "files"`
  - `WorkspaceChatFileCategory = "all" | "website" | "document" | "excel" | "ppt" | "image" | "video" | "audio"`
  - `WorkspaceChatFileItem` 作为文件抽屉渲染模型
- 如后续 Gateway 提供结构化 artifact 字段，本轮提取器保留扩展空间，但本期不接入协议变更。

## Test Plan
- 文档流程：
  - `docs/phases/phase5.58_workspace_chat_file_drawer.md` 已创建。
  - `docs/TODO.md` 已新增对应未完成任务。
- 功能验证：
  - 助手消息包含 Markdown 网站链接时，文件侧栏出现 `网站` 条目，点击后可打开。
  - 用户消息包含本地图片或文档路径时，文件侧栏出现对应 `图片 / 文档` 条目，点击后可打开。
  - `xlsx / pptx / pdf / png / mp4 / mp3` 等扩展名能进入正确分类。
  - 切换筛选项后列表即时刷新，`全部` 能恢复全集。
  - 同一目标在多条消息中重复出现时只保留一条，并显示最近一次出现的时间。
  - 切换当前会话或 Agent 后，文件侧栏切换为当前会话的数据，不串会话。
  - `历史会话 / 运行日志 / 任务 / 工作台 / 会话菜单` 等既有抽屉不回归。
- 提交前检查：
  - `npm run check:encoding`
  - `npm run check:file-size`
  - `npm run tauri dev`
  - 手动测试当前聊天中的不同链接、文件路径和筛选行为

## Assumptions
- 默认作用域是“当前激活聊天会话”，不是跨历史会话聚合。
- 默认只展示“当前可直接打开”的目标；纯文本提到但无法解析成链接或路径的位置不进入列表。
- 默认按标准化目标去重，避免重复刷屏。
- 首版不做上传附件面板、下载管理或内嵌预览，仅做会话产出物与链接清单。
