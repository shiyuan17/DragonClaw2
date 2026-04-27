# Phase 5: UI 风格统一 — 配色 + 图标一致性 🎨

> 📋 待开始 — 目标：全 UI 遵循 PRD V2 设计语言

## 铁律

> [!CAUTION]
> **本阶段仅改 UI 渲染层代码（CSS / JSX class / icon / 文案），绝不动任何功能逻辑代码（hooks / invoke / state / event 等）。**

## 背景

Phase 4.6 完成架构定版后，UI 审查发现 **54 处**违反 [UI_PRD_V2](../UI_PRD_V2.md) 设计规范：
- 25 处 UI 可见 Emoji 图标（PRD 要求统一使用 `lucide-react`）
- 12 处 `accent-green` (#22c55e)（PRD 要求黑/白/深灰/透，仅红/黄告警）
- 16 处 `accent-blue` (#3b82f6) 过亮高亮
- 1 处内联硬编码色值

---

## Stage 12: 色彩体系重置 ⏱️ ~45min

**目标**：将色彩变量从"多彩"切换到 PRD 规范的"克制黑白灰"

### 变更文件（仅 CSS）

#### [MODIFY] [global.css](file:///home/zsts/openclaw-switch/dragonclaw/src/styles/global.css)

重定义色彩变量：
```diff
- --accent-blue: #3b82f6;
- --accent-green: #22c55e;
+ --accent-active: rgba(255, 255, 255, 0.15);   /* 激活态背景 */
+ --accent-success: rgba(255, 255, 255, 0.85);   /* 成功文字 */
```
保留 `--accent-red`, `--accent-yellow`（PRD 允许告警色）
保留 `--accent-purple`, `--accent-cyan`（仅 setup 进度条用，可接受）

#### [MODIFY] 其他 CSS 文件

| 文件 | 改动 |
|---|---|
| models.css | `.active` 边框/文字：`accent-blue` → `--border-active` + `--text-primary` |
| modal.css | 成功/激活边框：`accent-green/blue` → `--border-active` |
| header.css | 运行状态点：`accent-green` → `--text-primary` 白色微光 |
| settings.css | 侧边栏选中线：`accent-blue` → `--border-active` 白色 |
| buttons.css | 链接色：`accent-blue` → `--text-primary` |
| logs.css | success 日志：`accent-green` → `--text-secondary` |
| setup.css | 进度条渐变保留紫色系，移除蓝端 |

### 验收标准

```
✅ npx vite build 通过
✅ npm run tauri dev → 全 UI 无绿色高亮、无亮蓝色高亮
✅ 激活态改为半透明白/浅灰 + 微光边框
✅ 运行状态点由绿色变为白色
✅ 所有功能正常（零功能代码修改）
```

---

## Stage 13: Emoji → Lucide 图标统一 ⏱️ ~45min

**目标**：所有 UI 可见 Emoji 替换为 `lucide-react` 线条图标

### 变更文件（仅 JSX icon/文案，不动逻辑）

| 文件 | Emoji 数量 | 替换对照 |
|---|---|---|
| SettingsTab.tsx | 11 处 | 🎛️→`SlidersHorizontal` 📂→`FolderOpen` ✅/❌→`Check`/`X` 🔑→`Key` 🔄→`RefreshCw` 🔧→`Wrench` 🗑️→`Trash2` 📄→`FileText` 📦→`Download` 💬→`MessageCircle` ☕→`Heart` |
| ModelsTab.tsx | 2 处 | 🤖→`Cpu` 💾→`Save` |
| ApiKeyModal.tsx | 2 处 | 🔑→`Key` ✅→移除 |
| DashboardTab.tsx | 1 处 | ⏹→`Square` |
| SetupWizard.tsx | 2 处 | 📂→`FolderOpen` ✅→移除 |
| ModelSwitchModal.tsx | 1 处 | 🔄→纯文字 title |
| RepairToast.tsx | 2 处 | ⚠️→`AlertTriangle` 🔧→`Wrench` |
| App.tsx | 5 处 | Modal title emoji→纯文字 |

> ⚠️ hooks/ 中 addLog() 的 emoji 不改（日志消息不影响 UI 视觉风格）

### 验收标准

```
✅ npx vite build 通过
✅ npm run tauri dev → 全 UI 无 emoji 图标，统一 lucide 线条风格
✅ 所有功能正常（仅改 JSX 渲染层，不动 state/event/invoke）
```

---

## Stage 14: 内联色值清理 + 风格细节 ⏱️ ~20min

**目标**：消除最后的硬编码颜色和文案风格不一致

### 变更

| 文件 | 改动 |
|---|---|
| RepairToast.tsx | `color: '#ff6b6b'` → `color: 'var(--accent-red)'` |
| App.tsx (ConfirmModal children) | `accent-green` → `--text-secondary` |
| App.tsx (ConfirmModal titles) | 去除 emoji 前缀（已在 Stage 13 覆盖） |

### 验收标准

```
✅ npx vite build 通过
✅ grep 全源码无硬编码 hex 色值（排除 global.css 定义）
✅ 所有功能正常
```

---

## 协作约定

每个 Stage 完成后：
1. 运行 `npx vite build` 确认编译通过
2. 暂停等待用户 `npm run tauri dev` 验收
3. 验收通过后 `git commit` + `git tag v2-stage{N}-complete`
4. 再开始下一个 Stage
