# DragonClaw — AI Agent 执行协议

> 所有 AI 编码助手（Codex / Claude / Cursor / Copilot / Gemini / OpenClaw Agent）必须先遵守本协议，再执行具体任务。

---

# 🚨 核心红线

1. UI_ONLY 任务禁止修改后端逻辑、Tauri command、`invoke()` 契约。
2. 禁止随意修改 Tauri `invoke` 名称、参数结构、返回结构或 `invoke_handler` 注册。
3. 禁止删除已有功能、注释掉报错代码、降级逻辑来绕过问题。
4. 禁止编造不存在的 API / 模块 / 方法。
5. 禁止引入未要求的新依赖。
6. 禁止大范围格式化无关文件。
7. 非 RELEASE 任务禁止修改版本号、tag、release notes。
8. Rust 业务代码禁止绕过 `paths::*` 路径工具直接拼关键路径。

---

# 🧭 任务类型分类

开始任务前必须先判断任务类型：

| 类型 | 说明 |
|---|---|
| DOCS_ONLY | 仅文档修改 |
| UI_ONLY | JSX/CSS/视觉渲染与文案，不改业务契约 |
| FRONTEND_LOGIC | hooks/services/types/frontend state/API wrapper |
| BACKEND_COMMAND | Rust command/service/domain logic |
| REFACTOR_ONLY | 等价重构，不改行为 |
| BUG_FIX | 明确 bug 修复 |
| RELEASE | 版本、tag、release notes、发版脚本 |

如果不确定，默认按更严格类型处理；跨类型任务必须同时满足所有相关限制。

---

# 🔐 权限矩阵

| 任务类型 | 允许修改 | 禁止修改 |
|---|---|---|
| DOCS_ONLY | markdown/docs | 源码、脚本、版本号 |
| UI_ONLY | TSX/CSS/theme token/static copy | Rust、Tauri command、`invoke()` 契约 |
| FRONTEND_LOGIC | hooks、utils、types、services、API wrapper | Rust backend、`invoke_handler` |
| BACKEND_COMMAND | `src-tauri/src/**/*.rs`、相关 Rust tests | 无关 UI |
| REFACTOR_ONLY | 指定模块与配套测试 | API 行为变化、公共 API 改名 |
| BUG_FIX | bug 根因相关最小范围 | 无关重构、功能删除 |
| RELEASE | version/tag/release notes/release scripts | 功能开发、无关源码 |

---

# 🔍 修改前检查

所有任务必须先完成：

1. 阅读目标文件。
2. 搜索直接调用方或引用方。
3. 确认相关验证命令。
4. 输出简短计划。

按任务类型追加检查：

| 类型 | 追加检查 |
|---|---|
| DOCS_ONLY | 核对文档命令、路径、文件名是否真实存在 |
| UI_ONLY | 检查相关样式 token、组件边界、文件健康度 |
| FRONTEND_LOGIC | 搜索 `invoke()` 调用、类型定义、测试覆盖 |
| BACKEND_COMMAND | 检查 command 注册、TS 调用方、路径工具、Rust tests |
| REFACTOR_ONLY | 确认行为不变点和回归验证范围 |
| RELEASE | 检查版本真源、CI workflow、tag/release 触发链路 |

---

# 🚫 禁止行为

AI 严禁：

- 删除未理解代码。
- 注释掉报错代码绕过问题。
- 修改无关文件。
- 重命名公共 API。
- 硬编码系统路径。
- 提交乱码文本。
- 把 mock 数据写进生产逻辑。
- 在工作区已有无关改动时使用 `git add .`、`git reset --hard`、`git checkout --` 等粗暴命令。

---

# 📏 文件健康度治理

项目使用 `scripts/check-file-size.mjs` 做文件健康度门禁。行数只是烟雾报警器，不是唯一裁判；是否拆分还要看单一职责、模块边界、增长趋势和测试覆盖。

| 类型 | 软上限 | 硬上限 |
|---|---|---|
| TSX 页面/容器 | 500 | 800 |
| TS/hook/service/type helper | 300 | 500 |
| Rust 模块 | 500 | 800 |
| 函数 | 80 | 120 |

执行规则：

- 低于软上限：默认通过。
- 超过软上限：需要做文件健康度说明，而不是自动拆分。
- 新增文件超过硬上限：阻断，必须拆分或取得明确例外。
- 既有 legacy 超限文件：以脚本里的 file-health baseline 为准，可以缩小，不得无明确例外继续增长。
- 只有阻断项才必须同步拆模块。

允许合理冗余：

- 文件只有一个明确业务域。
- 内部按 section / helper / component / command group 分块清晰。
- 没有混合 UI、IO、副作用、状态机、协议适配等多类职责。
- 拆分会显著降低可读性，或制造过多穿透式 props / imports。
- 核心行为有测试或稳定调用边界覆盖。

必须优先拆分：

- 文件同时承担 3 类以上职责，例如渲染 + 数据加载 + 协议转换 + 缓存 + 副作用。
- 一个改动经常需要触碰多个无关区域。
- 文件增长来自新功能堆叠，而不是局部完善。
- 文件内存在可独立命名的 domain helper、API adapter、state reducer、modal / drawer 子组件。

---

# 🧪 验证要求

| 任务类型 | 必须验证 |
|---|---|
| DOCS_ONLY | `npm.cmd run check:encoding` |
| UI_ONLY | `npm.cmd run check:encoding` + `npm.cmd run check:file-size` |
| FRONTEND_LOGIC | `npm.cmd run test:frontend` 或 `npm.cmd run build` |
| BACKEND_COMMAND | `npm.cmd run test:rust`，必要时 `npm.cmd run tauri -- dev` |
| REFACTOR_ONLY | 对应模块 regression validation |
| RELEASE | `npm.cmd run test:ci` + release checklist |

Windows PowerShell 中优先使用 `npm.cmd`，避免 `npm.ps1` 执行策略导致误判。

---

# 🔄 标准开发循环

功能/优化任务默认按以下节奏推进：

| 步骤 | 动作 | 产出 |
|---|---|---|
| 1. 讨论 | 与用户对齐需求和方案 | 会话记录 |
| 2. 文档落地 | 必要时创建/更新 Phase 文档与 `TODO.md` | `docs/phases/*.md` / `docs/TODO.md` |
| 3. 提交文档 | 文档 commit 与代码 commit 分开 | `docs(scope): ...` |
| 4. 开发实现 | 按任务类型边界改代码 | 代码改动 |
| 5. 用户验收 | 用户确认 UI/功能符合预期 | 截图/录屏/验证记录 |
| 6. 收尾打勾 | 更新 TODO 状态并提交实现 | 功能 commit |

对小型纯文档或热修任务，可在不破坏可追溯性的前提下合并步骤，但必须保留清晰总结和验证记录。

---

# 📌 OpenClaw 锁版策略

Launcher 下载的 OpenClaw 源码不跟踪 upstream `main`，必须锁定到 release tag。

| 配置项 | 位置 | 当前值 |
|---|---|---|
| `PINNED_VERSION` | `src-tauri/src/download.rs` | `v2026.5.4` |

升级锁定版本时必须验证：

- 全新安装。
- `.openclaw_version` 标记与旧版本自动重装。
- gateway websocket。
- Control UI。
- 首页聊天真实收发。

---

# 🎨 Theme Token Rules

- `docs/design/DESIGN-elevenlabs.md` 是当前产品视觉源头。
- `src/styles/tokens.css` 是新增 brand colors、radii、spacing、typography、shadows、motion primitives 的唯一 token 层。
- 新 UI 必须优先使用 `--dc-*` token 或解析到它们的语义别名。
- 不要在组件/page 样式里新增硬编码视觉值；确有必要时先提升到 token 层。
- Legacy variables 如 `--bg-*`、`--text-*`、`--accent-*` 只能作为兼容别名存在，不是第二套设计系统。
- `workspace-clone` 已纳入 ElevenLabs theme system，需要新语义时只扩展 `--dc-workspace-*`。

---

# 🤖 AI 输出格式

最终回复必须包含：

1. Task Type
2. Files Changed
3. Files Avoided
4. Risk Level
5. Plan / What Changed
6. Verification Commands
7. Summary

中间进度消息可以简短，不要求重复完整格式。
