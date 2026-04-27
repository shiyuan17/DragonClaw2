# Phase 7: System Tray + 启动更新检查

> 📋 待开始 | 目标版本：`v0.5.0`

## 铁律

> [!CAUTION]
> **三端验收**：所有改动必须在 Windows / Linux / macOS 三端验证通过。
> **UI 一致**：遵循现有深色主题配色 (`--bg-*`, `--accent-*`)、Lucide 图标体系、`framer-motion` 动画规范。

---

## 7.1 System Tray 系统托盘

### 当前问题
关闭窗口 = 杀死服务进程。用户可能正在浏览器端对话，误关窗口导致服务中断。

### 方案

1. **Cargo.toml**: `tauri` features 添加 `"tray-icon"`
2. **capabilities/default.json**: 添加 `"core:window:allow-hide"`, `"core:window:allow-show"`
3. **lib.rs**: 注册 TrayIcon + 菜单 + `close_requested` 拦截 → `window.hide()`

**托盘菜单项：**
- 服务状态（文字标识，不可点击）
- 打开面板 → `window.show()`
- 打开浏览器 → `open::that(gateway_url)`
- 重启服务 → `stop_service` + `start_service`
- 退出 → `stop_service` + `app.exit()`

### 边界情况
- macOS: 关窗后 dock 图标仍显示，需处理 `RunEvent::ExitRequested`
- Linux Wayland: 部分 DE 不支持 tray，需 `libappindicator` 依赖
- 退出前确保 `stop_service` 被调用，不留孤儿进程

## 7.2 启动更新检查

### 当前问题
当前版本检查只有设置页手动按钮，用户往往不会主动点。

### 方案

1. **useSetup.ts**: `phase === "ready"` 后自动调用 GitHub `/releases/latest`
2. **App.tsx**: 有新版本 → 弹窗（版本号 + 更新内容 + "前往下载"）
3. 无新版本或网络失败 → 静默忽略（不弹任何错误）

### 边界情况
- 每次启动最多检查一次，不重复弹窗
- 只认 semver 格式 tag，过滤 prerelease
- 离线环境静默忽略

---

## 变更文件

| 文件 | 改动 |
|---|---|
| `src-tauri/Cargo.toml` | tauri features 添加 `"tray-icon"` |
| `src-tauri/capabilities/default.json` | 新增 window hide/show 权限 |
| `src-tauri/src/lib.rs` | TrayIcon 注册 + close_requested 拦截 |
| `src/hooks/useSetup.ts` | 添加 `checkUpdateOnStartup()` |
| `src/App.tsx` | 启动更新弹窗触发 |

---

## 验收标准

```
✅ [Windows] 关闭窗口 → 托盘图标可见，服务继续运行
✅ [Windows] 托盘右键 → 菜单全部功能可用
✅ [Linux] 同上（Ubuntu 22.04+）
✅ [macOS] 同上
✅ 点击"退出" → 服务进程被正确终止
✅ 启动时有新版本 → 弹窗 → "前往下载" 跳转 GitHub
✅ 启动时无新版本 → 无弹窗
✅ 断网启动 → 无错误弹窗
✅ cargo test 通过
```
