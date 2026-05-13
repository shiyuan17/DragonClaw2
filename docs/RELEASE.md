# DragonClaw — 发版规范

## 版本同步

DragonClaw 应用版本必须同步以下真源：

| 文件 | 字段 |
|---|---|
| `package.json` | 根级 `version` |
| `package-lock.json` | 根级 `version` 与 `packages[""].version` |
| `src-tauri/tauri.conf.json` | `version` |
| `src-tauri/Cargo.toml` | `[package].version` |

前端版本展示不再手写版本号：`App.tsx` 通过 Tauri `getVersion()` 读取应用版本，`SettingsTab.tsx` 只展示传入的 `appVersion`。

## OpenClaw 版本锁定

Launcher 必须锁定 OpenClaw release tag，禁止直接追踪 upstream `main`。

当前锁定版本以 `src-tauri/src/download.rs` 的 `PINNED_VERSION` 为准：

```text
v2026.5.4
```

升级 OpenClaw 时必须同时验证安装链路、gateway websocket、Control UI、首页聊天和 `.openclaw_version` 自动重装逻辑。

## 标准发版流程

发版前必须确认当前分支和工作区状态，避免把无关改动带入 release commit。

```bash
# 1. 确认分支与工作区
git branch --show-current
git status --short

# 2. 同步版本号
bash scripts/bump-version.sh X.Y.Z

# 3. 运行质量门禁
npm.cmd run test:ci

# 4. 本地构建发布包
npm.cmd run tauri -- build

# 5. 只 stage 发版相关文件
git add package.json package-lock.json src-tauri/Cargo.toml src-tauri/tauri.conf.json
git commit -m "chore(release): 发布 vX.Y.Z"

# 6. 推送开发分支
git push origin v2-dev

# 7. 合并到 main 后创建 annotated tag
git checkout main
git merge v2-dev
git push origin main
git tag -a vX.Y.Z -m "DragonClaw vX.Y.Z"
git push origin vX.Y.Z

# 8. 发版后切回开发主线
git checkout v2-dev
```

GitHub Release 由 `.github/workflows/build.yml` 在 `v*` tag push 后触发生成。

## 发版验证清单

发版前必须验证：

- `npm.cmd run check:encoding` 通过。
- `npm.cmd run check:file-size` 通过。
- `npm.cmd run test:frontend` 通过。
- `npm.cmd run test:rust` 通过。
- `npm.cmd run build` 通过。
- `npm.cmd run tauri -- build` 通过。
- 全新安装正常。
- gateway websocket 正常。
- 首页聊天收发正常。
- invoke contract 无破坏。
- GitHub `/releases/latest` 可识别 semver tag。

Windows PowerShell 中优先使用 `npm.cmd`，避免 `npm.ps1` 执行策略导致误判。

## Release Notes 模板

```markdown
## 新功能
- 描述

## Bug 修复
- 描述

## 其他
- 文档 / 配置 / 依赖更新

## 验证
- npm.cmd run test:ci
- npm.cmd run tauri -- build
```

## CI/CD 流程

当前自动化：

1. `quality.yml` 在 PR、`main`、`v2-dev` 上运行 `npm run test:ci`。
2. `build.yml` 在 `v*` tag 或手动触发时运行多平台 Tauri build 并创建 GitHub Release。

推荐后续补强：

1. artifact verify。
2. release draft review。
3. installer smoke test。
4. update flow smoke test。

## 发版后检查

发版后：

- 确认 GitHub Release asset 完整。
- 下载安装包并检查。
- 检查更新流程。
- 验证全新安装和旧版本升级。
- 归档 release notes。
- 切回 `v2-dev` 继续开发。
