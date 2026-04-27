# Phase 5.2: 日志诊断面板优化 + 导出诊断 ZIP 🔧

> 📋 待开始

## 铁律

> [!CAUTION]
> **UI 部分仅改渲染层。导出 ZIP 是新功能，需要新增后端 Tauri command。**

## 背景

设置中心「日志诊断」面板存在以下问题：
- 「显示原始日志流」开关无实际价值，增加认知负担
- 日志仅显示最近 20 条（`slice(-20)`），无法滚动查看更多
- 「导出诊断 ZIP」按钮无功能实现

---

## Stage 16: 日志面板简化 + 导出诊断 ZIP

### A. 前端 — 日志面板简化（UI-only）

**改动**：
1. 移除「显示原始日志流」toggle 及 `showRawLogs` / `setShowRawLogs` 状态传递
2. 默认显示 humanized 日志（有 humanized 显示 humanized，没有的显示 raw message）
3. 移除 `slice(-20)` 限制，显示全部日志
4. 日志面板已有 `overflow: auto`，确保可滚动 + 自动滚底

#### 变更文件

| 文件 | 改动 |
|---|---|
| `SettingsTab.tsx` | 移除 log-header（toggle 区域），移除 `showRawLogs` 相关 props 和逻辑，改为固定使用 humanized 优先 |
| `SettingsTab` props 接口 | 移除 `showRawLogs` / `setShowRawLogs` |
| `App.tsx` | 移除传递 `showRawLogs` / `setShowRawLogs` 给 SettingsTab |
| `useLogs.ts` | 移除 `showRawLogs`/ `setShowRawLogs` 状态和 return |

---

### B. 后端 — 导出诊断 ZIP（新功能）

**方案**：新增 Tauri command `export_diagnostics_zip`

1. 调用 `tauri::dialog::save_file()` 让用户选择保存路径
2. 收集以下诊断文件打入 ZIP：
   - `openclaw-engine/openclaw.json`（配置文件，脱敏 API Key）
   - 前端内存中的日志（通过 invoke 参数传入）
   - 系统信息：OS 版本、Node 版本、工作区路径
3. 用已有的 `zip` crate 创建 ZIP 文件
4. 保存到用户指定路径

#### 变更文件

| 文件 | 改动 |
|---|---|
| [NEW] `src-tauri/src/diagnostics.rs` | 新模块：`export_diagnostics_zip` 函数 |
| `src-tauri/src/lib.rs` | 注册新 command |
| `SettingsTab.tsx` | 「导出诊断 ZIP」按钮绑定 `onClick` 调用 invoke |
| `SettingsTab` props 接口 | 新增 `onExportDiagnostics` handler |
| `App.tsx` | 新增 handler 调用 `invoke("export_diagnostics_zip", { logs })` |

---

## 验收标准

```
✅ npx vite build + cargo build 通过
✅ 日志面板无 toggle，直接显示日志，可滚动查看全部
✅ 点击「导出诊断 ZIP」→ 弹出保存对话框 → 生成 ZIP
✅ ZIP 中包含：config (API Key 脱敏)、日志、系统信息
```
