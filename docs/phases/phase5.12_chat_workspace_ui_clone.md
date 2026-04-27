# Phase 5.12: 聊天工作区全套 UI 克隆迁移

> 状态：规划中
> 类型：前端界面迁移
> 前置阶段：Phase 5.10 默认首页壳层克隆

## 目标

在现有 `workspace-clone` 默认首页内，只针对 `聊天` 菜单继续深挖，把 `DragonClaw` 聊天工作区对应的整套界面结构迁到 `DragonClaw2` 的 React 页面里。

本次只迁移界面，不迁移真实聊天、知识库、频道绑定、邮件绑定、调度、技能管理等业务功能。

## 来源界面

本次 UI 克隆的主要参考来源：

- `D:/Github/DragonClaw/src/components/chat/WorkspaceHeader.vue`
- `D:/Github/DragonClaw/src/components/chat/ChatSessionView.vue`
- `D:/Github/DragonClaw/src/components/chat/ChatComposer.vue`
- `D:/Github/DragonClaw/src/components/layout/SidebarPanel.vue`
- `D:/Github/DragonClaw/src/components/layout/DirectoryPanel.vue`
- `D:/Github/DragonClaw/src/components/chat/session/ChatSessionOverlayStack.vue`
- `D:/Github/DragonClaw/src/components/chat/composer/ComposerModalStack.vue`

## 范围与原则

### 本次包含

- 聊天工作区顶部头部与图标控件
- 聊天消息画布空态与静态消息排版
- 右侧 utility drawer
- related resource 大弹窗
- runtime log detail / agent info / settings text preview 等 overlay
- 输入区 toolbar / suggestion layer / turn context / modal stack
- 左侧栏 admin shortcut popover 与二级面板
- 目录区聊天菜单下的上下文菜单与频道绑定弹窗骨架

### 本次不包含

- 任何新后端命令
- 任何 Rust 修改
- 任何 `invoke()` 名称、参数、返回类型调整
- `useService / useConfig / useSetup / useLogs` 业务逻辑修改
- 旧 `dashboard`、legacy top-tab shell 删除
- 其他菜单的同等深度 UI 迁移

### 界面迁移原则

- 所有新控件只保留本地 UI 状态
- 允许展开/收起/切换/弹出/关闭等纯前端假交互
- 不接真实保存、刷新、删除、发送、绑定逻辑
- 视觉层级、栏目命名、区块节奏对齐 `DragonClaw`
- 不直接照搬 Vue 代码和 CSS 类名，按 React 结构重建

## UI 映射

| DragonClaw 来源 | DragonClaw2 落点 |
| --- | --- |
| `WorkspaceHeader` | `workspace-clone` 聊天主区顶部头部 |
| `ChatSessionView` | 消息画布、utility drawer、overlay 容器 |
| `ChatComposer` | 底部输入区、建议层、toolbar、modal stack |
| `SidebarPanel` | 左侧品牌卡、菜单、admin shortcut popover |
| `DirectoryPanel` | 聊天目录区、上下文菜单、频道绑定弹窗骨架 |
| `ChatSessionOverlayStack` | agent info / runtime logs / related resource 等大弹层 |
| `ComposerModalStack` | 知识库、slash command、email binding 等输入区弹层 |

## 组件拆分方向

在 `src/components/workspace-clone/` 下按职责拆分 React 子组件，至少覆盖：

- `WorkspaceClonePage`
- `WorkspaceCloneSidebar`
- `WorkspaceCloneDirectory`
- `WorkspaceCloneHeader`
- `WorkspaceCloneChatView`
- `WorkspaceCloneUtilityDrawer`
- `WorkspaceCloneComposer`
- `WorkspaceCloneOverlayStack`
- `WorkspaceCloneComposerModals`
- `WorkspaceCloneChannelBindingModal`

必要时继续补充更细颗粒度的 presentational 组件，但不改现有业务 hooks 契约。

## 数据与交互策略

### 可最小复用的现有数据

- `logs`：用于 logs 面板和最近日志摘要
- `currentModelName`：用于顶部、settings、model 相关占位
- `currentProviderName`：用于顶部、settings、provider 相关占位
- `workspacePath`：用于 settings / workspace 区域
- `running / loading / uptime / servicePort`：用于状态显示与现有可用入口按钮

### 本地假数据

- history 列表
- schedule 卡片
- workbench 记录
- memory / skills / commands / tools / channel / schedule modal 内容
- slash command / mention 建议项
- 频道绑定弹窗的二维码说明与表单占位

### 允许保留的现有入口

仅限当前已经存在且可安全复用的前端入口：

- 启动服务
- 停止服务
- 打开本地控制台
- 打开模型切换弹窗
- 打开 Provider / API 配置弹窗

除此之外，其余新控件统一保持纯 UI 假交互。

## 验收标准

- 默认首页进入 `workspace-clone` 后，`聊天` 菜单显示完整聊天工作区 UI，而不是旧的 hero 卡片首页
- 顶部 avatar、icon buttons、more 菜单、team variant 头部都可展示并正常开合
- 右侧 utility drawer 可切换 `history / logs / settings / schedule / workbench`
- 输入区具备 turn context、input shell、toolbar、suggestion layer、modal stack 外观
- related resource modal、agent info modal、runtime log detail modal、settings text preview modal 都能打开/关闭
- 左侧 admin shortcut popover 与 theme/language 二级面板可展开收起
- 目录区 channels 上下文菜单与频道绑定弹窗骨架可展示
- `定时任务 / 知识库管理 / 数字员工 / 技能市场 / 产品落地` 仍保持当前骨架，不被波及
- legacy `dashboard` 与 legacy top-tab shell 保留不动

## 遗留说明

以下内容本次继续保留为 legacy 或后续迁移项：

- 旧 `dashboard` 页面
- legacy top-tab shell
- 现有业务 hooks 与弹窗逻辑
- 所有真实聊天与资源管理功能

待聊天工作区 UI 骨架稳定后，再逐项评估真实功能迁移和遗留代码清理。
