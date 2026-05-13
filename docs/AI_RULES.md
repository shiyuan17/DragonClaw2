# DragonClaw — AI 开发规范

## 架构原则

- 优先贴合当前仓库结构，不为了“理想目录”做大范围搬迁。
- 渐进式重构：小步拆分、保留行为、补齐验证；不要为了行数机械拆文件。
- 保持 Tauri `invoke()` 契约稳定。
- Rust 业务代码涉及 OpenClaw 引擎目录、用户配置目录、workspace 路径时，必须优先使用 `src-tauri/src/paths.rs`。

## 前端规范

### 当前目录职责

| 目录 | 职责 |
|---|---|
| `src/components/ui` | 基础 UI 组件 |
| `src/components/workspace-clone` | 当前主工作台 UI、聊天、抽屉、弹窗、workspace 视图 |
| `src/components/ready` | ready 阶段页面入口 |
| `src/hooks` | 应用级 hooks |
| `src/hooks/workspace-gateway` | Gateway 聊天、session、live-step 纯逻辑与桥接 |
| `src/hooks/workspace-clone` | workspace 业务 hooks |
| `src/api` | 前端 API wrapper |
| `src/services` | 服务封装 |
| `src/types` | 共享类型 |
| `src/utils` | 工具函数 |
| `src/styles` | 全局样式与业务样式 |
| `src/styles/tokens.css` | 设计 token 源头 |

### UI 规则

- 优先使用 `src/styles/tokens.css` 中的 token。
- 避免新增硬编码颜色；必要时先确认是否已有 token。
- UI_ONLY 只改渲染、样式、静态文案，不碰 Rust、Gateway、Tauri command 或 `invoke()` 参数。

## 后端规范

`src-tauri/src/` 当前以领域模块为主，不强制新增 `commands/` 或 `services/` 目录：

- `lib.rs`：Tauri builder、插件、tray、`invoke_handler` 集中注册。
- `paths.rs`：统一路径解析与 workspace / engine / config 路径工具。
- `config.rs` / `config_store/`：OpenClaw 配置读写与迁移。
- `service.rs` / `service_recovery.rs`：OpenClaw gateway 生命周期。
- `download.rs` / `installer.rs` / `setup.rs` / `environment.rs`：安装与启动链路。
- `channels/`、`agents.rs`、`agency_agents.rs`、`knowledge.rs`、`memory.rs`、`skill_market.rs`：领域能力。

修改 command 时必须检查：

1. Rust `#[tauri::command]` 函数名和导出可见性。
2. `lib.rs` 的 `tauri::generate_handler![]` 注册。
3. 前端所有 `invoke("command_name", payload)` 调用。
4. 参数字段名、可选性、大小写和返回值 shape。
5. TS 类型、API wrapper、测试是否兼容。

## 路径规范

统一优先使用 `paths::*`：

- `paths::engine_dir()` / `paths::get_openclaw_dir()`：OpenClaw 引擎目录。
- `paths::user_config_dir()`：`~/.openclaw` 配置根。
- `paths::openclaw_config_path()`：`openclaw.json`。
- `paths::main_workspace_dir()` / `paths::workspace_root_for_agent()`：主 workspace 和 Agent workspace。
- `paths::skillhub_workspace_dir()` / `paths::skillhub_workspace_skills_dir()`：SkillHub workspace。
- `paths::knowledge_base_root_dir()`：知识库根目录。

禁止业务代码直接拼关键系统路径；如缺少路径工具，先扩展 `paths.rs` 并补测试。

## 重构规范

推荐拆分流程：

1. 先抽 types / constants / pure helpers。
2. 再抽 services / hooks / domain helpers。
3. 最后拆 UI container 或 Rust domain module。
4. 每一步保持公共接口稳定，并跑对应 regression。

限制：

- 不允许行为变化。
- 不允许公共 API 改名。
- 不允许 silent delete。
- 不允许超大 PR。
- 既有超限文件可以逐步缩小，不得借重构继续扩大。

## 文件健康度

`check:file-size` 是健康度门禁，不是单纯行数裁判。

| 状态 | 规则 |
|---|---|
| 通过 | 低于软上限 |
| 需说明 | 超过软上限，但职责单一、分块清晰、没有继续增长 |
| 阻断 | 新增文件超过硬上限，或 legacy 超限文件超过 baseline 增长 |

允许保留合理冗余：

- 文件只有一个明确业务域。
- 内部按 section / helper / component / command group 分块清晰。
- 没有混合 UI、IO、副作用、状态机、协议适配等多类职责。
- 拆分会显著降低可读性，或制造过多穿透式 props / imports。
- 核心行为有测试或稳定调用边界覆盖。

必须优先拆分：

- 文件同时承担 3 类以上职责。
- 一个改动经常需要触碰多个无关区域。
- 文件增长来自新功能堆叠，而不是局部完善。
- 文件内存在可独立命名的 domain helper、API adapter、state reducer、modal / drawer 子组件。

## 验证矩阵

| 类型 | 验证 |
|---|---|
| DOCS_ONLY | `npm.cmd run check:encoding` |
| UI_ONLY | `npm.cmd run check:encoding` + `npm.cmd run check:file-size` |
| FRONTEND_LOGIC | `npm.cmd run test:frontend` 或 `npm.cmd run build` |
| BACKEND_COMMAND | `npm.cmd run test:rust`，必要时 `npm.cmd run tauri -- dev` |
| REFACTOR_ONLY | 目标模块 regression validation |
| RELEASE | `npm.cmd run test:ci` + release checklist |

当前真实 npm 脚本以 `package.json` 为准：`check:encoding`、`check:file-size`、`test:frontend`、`test:rust`、`test:ci`、`build`、`tauri`。

## Git 规范

分支：

- `main`：稳定发布版。
- `v2-dev`：当前开发主线。
- `feature/*`：新功能。
- `fix/*`：Bug 修复。
- `refactor/*`：重构。

Commit 示例：

```text
feat(scope): message
fix(scope): message
refactor(scope): message
docs(scope): message
style(scope): message
test(scope): message
chore(scope): message
```

禁止在有无关工作区改动时使用 `git add .`。只 stage 本次任务文件。

## 编码规范

所有源码和文档必须是 UTF-8。

禁止：

- replacement char。
- 编码损坏。
- 私有区乱码。
- 已知 mojibake 文案。

Windows PowerShell 查看中文文件时使用：

```powershell
Get-Content -Raw -Encoding UTF8 path\to\file.md
```

提交前必须执行：

```powershell
npm.cmd run check:encoding
```
