# Phase 5.71.1: Workspace 知识库总览重排与 OpenClaw 固定目录绑定

## Summary
- 在已落地的 5.71 基础上收敛知识库交互，重排为“总览态 / 知识库内页”两种主状态。
- 新建知识库改为名称和简介驱动，不再让用户手动选择本地目录；系统自动绑定到 `engine_dir()/knowledge-base/<slug>`。
- 总览态左侧显示知识库列表，右侧显示当前知识库预览区，右上角提供新建按钮与网格 / 列表视图切换。
- 进入知识库后切换为左侧文件目录、右侧 Lake 编辑器，文本文件直接进入编辑器区域。

## Implementation Changes
- 后端路径与元数据：
  - `paths.rs` 新增固定知识库根目录 helper，统一落到 `engine_dir()/knowledge-base`。
  - `KnowledgeBaseRecord` 扩展 `description`，继续保留 `roots[]` 以兼容 5.71 旧数据。
  - `upsert_knowledge_base` 支持自动创建 managed root；新建时基于名称生成唯一 slug，并创建目录。
  - 重命名只更新展示名称和简介，不搬移已有目录。
- 兼容与安全：
  - 已有多 root 记录继续可读，不强制迁移。
  - 新建记录统一写入单一 managed root。
  - 文件树扫描、文本格式识别、越界拦截和保存安全规则沿用 5.71。
- 前端总览态：
  - 左列只展示知识库列表，不再在左列内嵌创建表单和目录管理。
  - 右侧改为知识库预览区，支持网格 / 列表切换，显示名称、简介、更新时间、目录路径或文件概览。
  - 右上角固定放置“新建知识库”按钮和两个视图图标按钮。
- 前端知识库内页：
  - 选中知识库后进入“左侧文件目录 + 右侧编辑器”的两栏布局。
  - 左侧目录树按当前知识库 roots 渲染；新建知识库默认只有一个 root，旧记录仍允许多 root 分组显示。
  - 右侧文本文件直接加载 Lake；非文本文件显示元数据与外部打开按钮。
- 新建知识库弹窗：
  - 复用现有 `Modal` 壳层和 workspace modal 样式语言。
  - 表单只包含知识库名称和简介（可选）。
  - 创建成功后自动刷新列表并选中新知识库。

## Interfaces
- `KnowledgeBaseRecord` 新增 `description?: string`。
- `UpsertKnowledgeBasePayload` 新增 `description?: string | null`，保留 `roots[]` 以兼容旧链路。
- 新增前端视图类型 `KnowledgeOverviewView = "grid" | "list"`。
- 保持现有 Tauri command 名称与 `load_knowledge_base_tree / load_knowledge_file / save_knowledge_file` 调用方式不变。

## Test Plan
- Rust：
  - 创建知识库自动生成 `knowledge-base/<slug>` 目录。
  - slug 冲突自动追加序号。
  - `description` 读写兼容缺失旧字段。
  - root 外路径读写拒绝、树扫描与文本文件读写继续通过。
- 前端联调：
  - `knowledge` 菜单默认进入总览态，左侧为知识库列表，右侧为预览区。
  - 新建弹窗仅需名称和简介；创建后自动生成目录并出现在列表。
  - 网格 / 列表切换只影响右侧知识库预览区。
  - 进入知识库后展示左侧文件目录与右侧编辑器，文本文件可编辑保存，非文本文件不会误进 Lake。
  - 旧的多 root 知识库记录仍可正常浏览。
- 提交前验证：
  - `npm run check:encoding`
  - `npm run check:file-size`
  - `npx tsc --noEmit`
  - `cargo test --manifest-path src-tauri/Cargo.toml knowledge`
  - `npm run tauri dev`

## Assumptions
- 固定目录根采用 `engine_dir()/knowledge-base`，不是 `~/.openclaw/`。
- 新建知识库的 slug 在创建时固定；后续重命名不改底层目录。
- 创建弹窗视觉以现有 workspace modal 风格为准，不新增独立主题体系。
