# Phase 5.10: 主控制界面高仿迁移

> 状态: 待开发
> 目标: 将 `dashboard` 标签页替换为一套参考 `DragonClaw` 主工作台视觉结构的 React 控制台页面，同时保持现有启动、停止、模型切换、Provider 配置和控制台访问能力不变。

## 铁律

> [!CAUTION]
> 本阶段只做前端界面迁移与接线，不改 `invoke()` 接口契约，不改 hooks 业务逻辑，不改 Rust 后端。

---

## 背景

`DragonClaw2` 当前 `dashboard` 页面仍然是单列 Hero 面板，更像启动页，不像长期承载主控制能力的工作台。`DragonClaw` 项目已经形成了成熟的三段式主界面结构:

- 左侧品牌与导航侧栏
- 中间目录/概览信息栏
- 右侧主工作区与控制区

本阶段以该结构为视觉蓝本，在 `DragonClaw2` 中新增 React 版控制台工作台页面，并将其挂载到现有 `dashboard` 标签页。

---

## 迁移范围

### 本次包含

- 新增 React 控制台工作台页面:
  - `ConsoleWorkspacePage`
  - `ConsoleSidebar`
  - `ConsoleDirectoryPanel`
  - `ConsoleControlPanel`
- 新增专属样式 `src/styles/console-workspace.css`
- `App.tsx` 将 `dashboard` 标签页入口切换到新页面
- 使用已有前端数据映射以下信息:
  - 运行状态
  - 当前 Provider
  - 当前模型
  - 工作区路径
  - 服务端口
  - 最近日志摘要
- 保留并复用现有操作入口:
  - 启动服务
  - 停止服务
  - 访问控制台
  - 打开 API 配置
  - 打开模型切换

### 本次不包含

- 不迁移 `DragonClaw` 聊天区、团队区、utility panel 等复杂业务
- 不增加新的全局路由或全局 Tab
- 不删除旧 `DashboardTab.tsx`
- 不做后端协议、命令、配置结构调整
- 不重构 `useService`、`useConfig`、`useSetup`

---

## UI 映射表

| 来源 (`DragonClaw`) | 目标 (`DragonClaw2`) | 本次实现 |
|---|---|---|
| `WorkspaceMainLayout` 左侧栏 | `ConsoleSidebar` | 品牌卡 + 页内菜单 + 状态徽记 |
| `DirectoryPanel` | `ConsoleDirectoryPanel` | 运行信息列表 + 快捷入口 + 日志摘要 |
| `WorkspaceHeader` + 工作区画布 | `ConsoleControlPanel` | 主标题、状态说明、操作按钮、控制卡片 |
| 工作台分栏布局 | `ConsoleWorkspacePage` | 三段式响应式容器 |

---

## 页面结构

### 1. 左侧栏 `ConsoleSidebar`

- 展示 DragonClaw 风格品牌水印卡片
- 提供页内 section 切换:
  - `overview`
  - `runtime`
  - `model`
  - `diagnostics`
- 菜单只切换本页局部视图，不接入新后端逻辑

### 2. 中间信息栏 `ConsoleDirectoryPanel`

- 展示以下信息块:
  - 服务状态
  - 当前 Provider
  - 当前模型
  - 工作区路径
  - 服务端口
  - 最新日志摘要
- 可点击入口仅复用现有前端动作:
  - Provider 卡片 -> 打开 API Key 配置
  - 模型卡片 -> 打开模型切换

### 3. 主工作区 `ConsoleControlPanel`

- 对齐 `DragonClaw` 工作台右侧内容结构
- 顶部包含状态标题、状态说明、运行徽记
- 中部保留主控制操作:
  - 启动
  - 停止
  - 访问控制台
- 底部使用卡片承载运行信息与操作说明

---

## 接线方案

`App.tsx` 中保持以下边界不变:

- `TabId = "dashboard"` 保持不变
- 顶部五个 Tab 保持不变
- `activeTab === "dashboard"` 时渲染 `ConsoleWorkspacePage`

传入 props 固定为:

- `running`
- `loading`
- `servicePort`
- `uptime`
- `currentModelName`
- `currentProviderName`
- `workspacePath`
- `logs`
- `handleStart`
- `handleStop`
- `setShowKeyModal`
- `setShowModelSwitchModal`

---

## 旧页面保留策略

- `src/components/DashboardTab.tsx` 本次保留，不删除
- 文档层面标记为“已被控制台工作台替代，后续待功能迁移与确认后再清理”
- 避免一次性删除旧实现，给后续 UI 对比和回退留缓冲

---

## 验收标准

```text
[ ] dashboard 标签页显示新控制台工作台页面
[ ] 旧 Hero Dashboard 不再作为 dashboard 实际入口
[ ] 启动/停止/访问控制台行为与现状一致
[ ] 点击模型入口仍可打开现有模型切换弹窗
[ ] 点击 Provider 入口仍可打开现有 API 配置弹窗
[ ] models / agents / analytics / settings 页面不受影响
[ ] 1200px 以下中间栏折叠
[ ] 900px 以下无横向滚动
[ ] npm run build 通过
[ ] npm run tauri dev 可正常渲染
```
