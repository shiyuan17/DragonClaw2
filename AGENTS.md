# DragonClaw — AI 开发规范

> 所有 AI 编码助手（Gemini/Claude/Copilot/Cursor）在操作此项目时**必须遵守**以下规则。

## 🚨 核心红线

### 1. UI 重构不碰功能代码
- **只改** `.tsx` / `.css` 文件的**渲染部分**（JSX/样式）
- **不改** `invoke()` 调用、handler 函数内部逻辑、事件监听
- **不改** `.rs` 后端文件（除非任务明确要求）
- **不删除** 任何已有的功能代码
- **不编造** 不存在的 API/函数/模块

### 2. 后端接口冻结
- `#[tauri::command]` 函数的**签名**（名称 + 参数 + 返回类型）是接口契约
- 改签名 = Breaking Change，必须同步更新所有前端 `invoke()` 调用
- 新增命令可以，删除/改名命令必须经过讨论

### 3. 路径管理统一
- 沙箱路径（引擎源码）：通过 `paths::engine_dir()` 获取
- 用户配置路径（`~/.openclaw/`）：通过 `paths::user_config_dir()` 获取
- **严禁**在业务代码中直接拼接路径

---

## 📁 文件职责边界

### 前端
| 目录 | 职责 | 谁能改 |
|---|---|---|
| `src/components/ui/` | 可复用基础组件 | UI 任务 |
| `src/components/*.tsx` | 页面级组件 | UI 或功能任务 |
| `src/hooks/` | 业务逻辑封装 | 功能任务 |
| `src/types/` | TypeScript 类型定义 | 两者都行 |
| `src/utils/` | 纯工具函数 | 两者都行 |
| `src/App.tsx` | 路由和全局状态 | 慎改 |

### 后端
| 文件 | 职责 | 改动风险 |
|---|---|---|
| `environment.rs` | Node 沙箱管理 | 🔴 高 |
| `service.rs` | 进程启停/端口 | 🔴 高 |
| `config.rs` | 配置读写 | 🟡 中 |
| `paths.rs` | 统一路径 | 🟡 中 |
| `lib.rs` | 命令注册 | 🟢 低 |

---

## 🔀 Git 分支规范

| 分支 | 用途 | 谁能 push |
|---|---|---|
| `main` | 稳定发布版，已冻结 | 仅通过 PR |
| `v2-dev` | V2 开发主线 | 开发者 |
| `feature/*` | 新功能开发 | 各开发者 |
| `fix/*` | Bug 修复 | 各开发者 |
| `refactor/*` | 重构任务 | 各开发者 |

### Commit 规范
```
feat(component): add Modal reusable component
fix(service): handle WSL port conflict
refactor(frontend): extract LogViewer from App.tsx
docs(phase4): update architecture plan
style(css): adjust dashboard card spacing
```

---

## 🧪 验证规则

每次提交前**必须**通过：
1. `npm run check:encoding` — 文本源码/配置文件中不能包含错码、乱码字符串或编码损坏字符
2. `npm run check:file-size` — 大文件约束检查通过
3. `npm run tauri dev` — 能正常启动
4. 手动测试：启动服务 → 打开网关 → 聊天正常
5. 如果改了安装流程：删除 `AppData/Local/OpenClawLauncher/` 后全新安装测试

---

## ⚠️ AI 特别注意

1. **不要一次性改太多文件**。每个 PR/commit 聚焦一个模块。
2. **先看再改**。改任何文件前先 `view_file_outline` 了解全貌。
3. **渐进式重构**。不要把所有东西推倒重来。提取一个组件 → 验证 → 下一个。
4. **保持接口**。重构过程中，所有 `invoke('xxx')` 调用和返回值类型保持不变。
5. **切分支后清缓存**。`Remove-Item -Recurse -Force node_modules/.vite, dist`
6. **文本文件必须是 UTF-8**。`.rs` / `.ts` / `.tsx` / `.js` / `.json` / `.md` / `.toml` / `.yml` / `.yaml` / `.css` 等文本源码和配置文件必须以 UTF-8 保存，不允许提交错码中文、乱码字符串、替换字符 `U+FFFD` 或私有区异常字符。
7. **编码检查必须执行**。提交前必须运行 `npm run check:encoding`，发现乱码后先修复再继续开发。

## 📏 大文件限制

- 目标是避免在重构过程中继续产生新的巨型文件；拆分阶段默认把文件尺寸控制当成约束，而不是事后优化。
- 行数阈值分为预警线和硬上限：
  - 页面级 / 容器级 `.tsx`：`500` 行预警，`800` 行硬上限
  - hook / service / 业务 `.ts`：`300` 行预警，`500` 行硬上限
  - Rust `.rs` 模块：`500` 行预警，`800` 行硬上限
- 已经超限的存量文件，只能作为当前拆分任务的明确治理对象继续存在；新增改动不得让它们继续膨胀。
- 任何新文件默认必须低于对应硬上限；如果一次改动会把文件推过硬上限，必须在同一个任务里同步抽模块。
- 除非 Phase 文档中写明临时例外，否则不得提交新的超限文件。
- 前端与 Rust 的体积检查应尽量脚本化，并在提交前执行，避免规则只停留在口头约束。

---

## 🔄 标准开发循环 (Dev Cycle)

每一个功能/优化任务，**必须**严格按以下 6 步循环执行：

| 步骤 | 动作 | 产出 |
|---|---|---|
| 1. 讨论 | 与用户对齐需求和方案 | 会话记录 |
| 2. 文档落地 | 创建/更新 Phase 文档 + `TODO.md` 标 `[ ]` | `docs/phases/*.md` + `docs/TODO.md` |
| 3. 提交文档 | `docs: add Phase X.X plan` | Git commit（仅文档） |
| 4. 开发实现 | 编码实现，遵循本文件的红线规范 | 代码改动 |
| 5. 用户验收 | 用户确认 UI/功能符合预期 | 截图/录屏确认 |
| 6. 收尾打勾 | `TODO.md` 标 `[x]` + 功能 commit | Git commit（代码+TODO） |

> **铁律**：先文档，后代码。文档 commit 和代码 commit **必须分开**。
> 每一步都留痕，确保跨 Context 的可追溯性。

---

## 📌 OpenClaw 版本锁定策略

Launcher 下载的 OpenClaw 源码**不跟踪 main 分支**，而是锁定到指定 release tag。

| 配置项 | 位置 | 当前值 |
|---|---|---|
| `PINNED_VERSION` | `src-tauri/src/download.rs` | `v2026.5.4` |

### 为什么锁版本

- Launcher 需要对上游 release 做真实安装、gateway 与聊天链路回归验证，不能直接跟踪 `main`
- OpenClaw 新版本可能改变 gateway、Control UI 或安装产物行为；只有完成本地验证的 tag 才能成为新的锁定版本
- 当前已验证通过的内置版本为 `v2026.5.4`

### 如何更新锁定版本

1. 在 OpenClaw GitHub Releases 找到待更新的 tag
2. **本地测试**：修改 `PINNED_VERSION`，删除沙盒 `openclaw-engine/`，全新安装测试
3. 重点验证：浏览器能否正常连上网关 WebSocket
4. 确认无误后提交

### 版本检测机制

- 安装后写入 `openclaw-engine/.openclaw_version` 标记文件
- 每次启动检测：标记缺失或版本不匹配 → 自动删除旧版并重新下载
- 用户无需任何手动操作

---

## 🚀 发版流程 (Release)

### 版本号同步清单

升版本时，以下 **5 个位置**必须保持一致：

| 文件 | 字段 |
|---|---|
| `package.json` | `"version"` |
| `src-tauri/tauri.conf.json` | `"version"` |
| `src-tauri/Cargo.toml` | `version` |
| `src/App.tsx` | `APP_VERSION` |
| `src/components/SettingsTab.tsx` | 设置中心"关于"版本号 |

### 标准发版步骤

```bash
# 1. 确保 v2-dev 上所有改动已 commit
git status  # 应为 clean

# 2. 升版本号（上面 5 个文件全部更新）

# 3. 提交版本号
git add -A && git commit -m "chore: bump version to vX.Y.Z"

# 4. 推送 v2-dev
git push origin v2-dev

# 5. 合并到 main
git checkout main && git merge v2-dev && git push origin main

# 6. 打 tag（触发 CI 自动构建 + Release）
git tag vX.Y.Z && git push origin vX.Y.Z

# 7. 补充 Release Notes（CI 会自动创建 Draft Release，需手动编辑或用 API 补充）
# 模板参考下方

# 8. 切回开发分支
git checkout v2-dev
```

### Release Notes 模板

```markdown
## ✨ 新功能
- 功能描述

## 🐛 Bug Fixes
- 修复描述

## 📄 其他
- 文档/配置/依赖变更

---
**完整变更日志**: https://github.com/shiyuan17/DragonClaw2/security/compare/vPREV...vCURR
```

> **CI 自动构建**：推送 tag 后，GitHub Actions 自动构建 Windows/macOS/Linux 安装包并发布到 Releases。
> **Release Notes**：CI 创建的 Release 可能没有详细说明，**必须**手动补充或用 GitHub API 更新 body。

---

## Theme Token Rules

- `docs/design/DESIGN-elevenlabs.md` is the visual source of truth for the current product theme.
- `src/styles/tokens.css` is the only place allowed to define new brand colors, radii, spacing, typography, shadows, or motion primitives.
- New UI work must consume `--dc-*` tokens or semantic aliases that resolve to them. Do not add new hard-coded visual values directly in component/page styles unless the value is first promoted into the token layer.
- Legacy variables such as `--bg-*`, `--text-*`, and `--accent-*` may stay as compatibility aliases during migration, but they are not a second design system and must not receive new bespoke values.
- `workspace-clone` is now part of the ElevenLabs theme system. Extend only `--dc-workspace-*` tokens in `src/styles/tokens.css` when that surface needs new semantics; do not create a new `--workspace-*` visual source of truth or reintroduce an independent clone sub-theme.

