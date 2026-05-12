# Phase 5.71: Workspace 知识库接入 Lake 编辑器

## Summary
- 将 `workspace-clone` 左侧 `knowledge` 从占位页升级为真实知识库页。
- 首版能力边界固定为应用级共享、本地知识内容管理、文本优先、主区切换式编辑。
- 知识库配置独立落在 `paths::user_config_dir()` 下的新 JSON 文件，不改 `openclaw.json`。
- 文本文件预览与编辑使用 [Lake](https://lakejs.org/)；非文本文件仅展示元数据并支持外部打开。

## Implementation Changes
- 后端新增独立知识库模块与类型：
  - 新增知识库配置读写、目录扫描、文件读取、文件保存。
  - 配置文件结构固定为 `KnowledgeBaseRecord[]`，包含 `id`、`name`、`roots[]`、`createdAtMs`、`updatedAtMs`。
  - 每个 root 保存规范化绝对路径、显示名、稳定 `rootId`。
- `paths.rs` 新增知识库配置路径 helper，统一落到 `~/.openclaw/knowledge-bases.json`。
- 新增 Tauri commands：
  - `list_knowledge_bases`
  - `upsert_knowledge_base`
  - `delete_knowledge_base`
  - `load_knowledge_base_tree`
  - `load_knowledge_file`
  - `save_knowledge_file`
- 目录与文件安全规则：
  - root 路径保存前必须规范化、去空值、去重。
  - 读取和保存只允许访问当前知识库已登记 roots 下的相对路径。
  - 拒绝目录穿越、任意绝对路径写入和 root 外访问。
  - 递归扫描跳过 `.git`、`node_modules`、`dist`、`target`、`.vite`。
- 前端新增知识库专用页面与状态管理：
  - 新增 `WorkspaceCloneKnowledgePage`，由 `activeMenu === "knowledge"` 直接渲染。
  - 新增知识库状态 hook，负责知识库列表、树、文件预览、编辑状态与保存状态。
  - 新增 Lake 宿主组件，封装只读预览与编辑态实例挂载。
- 知识库页交互：
  - 左列显示知识库列表，支持新建、重命名、删除。
  - 当前知识库支持添加多个目录与移除目录。
  - 右侧浏览态显示知识库标题、root chips、按 root 分组的目录树、当前文件预览。
  - 点击文本文件进入图 3 风格的编辑/预览界面；点击非文本文件走外部打开。
- Lake 集成规则：
  - 只读预览使用 `readonly: true`。
  - 编辑态使用可写实例和定制 toolbar，首版保留必要文本编辑项。
  - 禁用远程图片、视频、文件上传配置。
  - 启用代码块能力时接入 `lake-codemirror`。
- 文本格式适配：
  - `.md/.markdown` 使用 markdown -> HTML -> Lake，保存时 HTML -> markdown。
  - `.txt` 使用段落包装渲染，保存时回写纯文本。
  - `.html/.htm` 直接作为 HTML/LML 载入与保存。
  - 其他扩展名只显示元数据，不进 Lake。

## Interfaces
- 新增前端类型：
  - `KnowledgeBaseRecord`
  - `KnowledgeBaseRoot`
  - `KnowledgeBaseTreeSnapshot`
  - `KnowledgeTreeNode`
  - `KnowledgeFileContent`
  - `KnowledgeEditorMode`
- 保持现有 `WorkspaceMenuKey` 中的 `knowledge` 不变，仅新增知识库页面分支与内部类型。
- 不修改现有 Tauri command 签名、Gateway 协议和聊天相关 `invoke()` 契约。

## Test Plan
- Rust 单测：
  - 配置文件读写与原子落盘。
  - root 规范化与重复目录去重。
  - root 外路径读写拒绝。
  - 多目录树扫描与缺失目录降级。
- 前端联调：
  - `knowledge` 菜单进入真实知识库页而非占位页。
  - 新建知识库后可添加多个目录并正确展示。
  - 文本文件可只读预览、进入编辑、保存后重新打开内容一致。
  - 非文本文件不会误进入 Lake，并可外部打开。
- 提交前验证：
  - `npm run check:encoding`
  - `npm run check:file-size`
  - `npm run tauri dev`
  - 手动验证知识库创建、目录添加、文件编辑与保存链路。

## Assumptions
- 首版知识库是 DragonClaw 应用级共享资源，不按 Agent、会话或 workspace 拆分。
- 首版目标是本地知识内容管理与文本编辑，不包含检索增强、向量索引、版本历史或协同编辑。
- 文本优先不等于只显示文本文件，非文本文件仍进入列表但只做元数据展示与外部打开。
- markdown 富文本往返允许轻微格式归一化，不追求字节级原样回写。
