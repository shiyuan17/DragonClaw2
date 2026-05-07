# Phase 5.58y: Windows 运行态 Logo 修复

> 状态：规划完成，待实现
> 类型：Windows 原生图标链路修复
> 日期：2026-05-08

## 目标

修复 DragonClaw 在 Windows 运行中显示为空白默认图标的问题，覆盖主窗口、任务栏、托盘，以及打包后的可执行文件与快捷方式图标一致性。

本次只修原生应用图标链路，不调整前端页面中的 logo 展示位，也不改任何 Tauri command、`invoke()` 契约或业务逻辑。

## 问题与根因

- `src-tauri/icons/icon.ico` 已存在，`src-tauri/tauri.conf.json` 也已经把它纳入 `bundle.icon`。
- 当前托盘图标显式依赖 `app.default_window_icon()`，但主窗口在运行态没有额外做 Windows 侧 `set_icon(...)`，容易出现“托盘正常、任务栏空白”的分叉。
- 当前托盘逻辑直接对默认图标 `unwrap()`，如果图标资源缺失或读取失败，会让问题退化为启动期 panic，而不是可诊断的图标降级。

## 范围

- 新增本 phase 文档，并在 `docs/TODO.md` 追加一个未完成追踪项。
- 继续使用现有 `src-tauri/icons/icon.ico` 作为 Windows 运行态与打包态的唯一原生图标来源，不新增第二套图标资源。
- 在 `src-tauri/src/lib.rs` 的 `setup` 阶段为运行态窗口显式应用默认图标，并让托盘图标与窗口图标共享同一个来源。
- 复核 `src-tauri/tauri.conf.json` 的 `bundle.icon`，仅做最小必要的图标配置收敛，不改产品名、包名、版本号或构建脚本分支。

## 实施方案

### 1. 文档落地

- 新增本文件记录现象、根因、修复策略、验证方式与回滚点。
- 在 `docs/TODO.md` 中新增 “Phase 5.58y” 未完成项，保持“先文档、后代码”的开发循环。

### 2. Windows 运行态图标修复

- 在 Tauri `setup` 中读取 `app.default_window_icon()`，对已创建的运行态 Webview 窗口显式调用 `set_icon(...)`。
- 仅在 Windows 路径执行这一步，不改变 macOS / Linux 行为。
- 将托盘图标构建改为安全读取默认图标：
  - 取到图标时正常设置托盘图标。
  - 取不到图标时记录可诊断日志，不再 `unwrap()` 崩溃。

### 3. 安装产物一致性复核

- 保留 `bundle.icon` 的现有资源集合，只做最小配置收敛，确保 Windows 原生 `icon.ico` 保持明确入口。
- 手动复核开发态、打包 exe、开始菜单或桌面快捷方式的图标是否一致。

## 回滚点

- 文档层仅回滚本 phase 文档与 `docs/TODO.md` 条目。
- 实现层仅回滚 `src-tauri/src/lib.rs` 和必要的 `src-tauri/tauri.conf.json` 图标配置，不牵涉其他模块。

## 验收

- `npm run check:encoding`
- `npm run check:file-size`
- `npm run tauri dev`
- 手动验证：
  - 任务栏显示 DragonClaw 图标，而不是空白默认图标。
  - Alt-Tab / 任务切换视图显示正确图标。
  - 托盘图标仍正常显示，左键和右键行为不回归。
  - 关闭窗口隐藏到托盘后，再次唤起仍保持正确图标。
- Windows 打包验证：
  - 生成的 exe 图标正确。
  - 安装后的快捷方式图标正确。
  - 启动后的任务栏图标与托盘图标一致。
