# Phase 5.13: 按截图收敛聊天工作区 UI

> 状态：规划中
> 类型：前端界面优化
> 前置阶段：Phase 5.10 默认首页壳层克隆、Phase 5.12 聊天工作区 UI 克隆

## 目标

以用户提供的两张截图为直接视觉目标，对默认首页 `workspace-clone` 下的 `聊天` 工作区做一次“尽量贴图”的界面收敛。

本次重点不是新增更多假功能，而是把当前 Phase 5.12 已经落下来的聊天区骨架简化成截图里的轻量桌面布局：

- 左侧轻量导航栏
- 中间目录栏
- 右侧聊天主区
- 截图 2 中的右侧 Agent 详情抽屉

本次只迁移界面与本地 UI 开合状态，不迁移聊天、设置、资源管理等真实业务功能。

## 来源界面

本次视觉参考来源：

- 用户在当前需求中提供的两张聊天工作区截图
- `D:/Github/DragonClaw/src/components/chat/WorkspaceHeader.vue`
- `D:/Github/DragonClaw/src/components/chat/ChatSessionView.vue`
- `D:/Github/DragonClaw/src/components/chat/ChatComposer.vue`
- `D:/Github/DragonClaw/src/components/layout/SidebarPanel.vue`
- `D:/Github/DragonClaw/src/components/layout/DirectoryPanel.vue`

## 本次范围

### 包含

- `聊天` 菜单对应的右侧工作区视觉重绘
- 聊天头部的头像、标题、副标题、右上图标按钮组
- 稀疏空态消息画布与建议卡片区
- 截图 2 风格的右侧 Agent 详情抽屉
- 输入区的圆角输入条、工具按钮、发送区
- 左侧栏与目录栏的轻量化视觉收敛
- 修正 `workspace-clone` 相关组件中的乱码中文文案

### 不包含

- 新的 Tauri / Rust 命令
- 任何 `invoke()` 名称、参数、返回类型调整
- `useService / useConfig / useSetup / useLogs` 业务逻辑修改
- legacy `dashboard`、legacy top-tab shell 删除
- 其他菜单的深度 UI 重构

## 视觉对齐原则

- 默认状态优先对齐截图 1：轻、白、平、留白更多
- 打开右侧抽屉时优先对齐截图 2：详情面板固定在聊天主区右侧
- 不逐像素照搬 Vue CSS，但保留布局比例、信息层级、控件分区和开合节奏
- 允许简化当前更重的假 UI 模块，只保留后续功能迁移需要的骨架

## 结构映射

| 目标区域 | DragonClaw2 落点 |
| --- | --- |
| 左侧导航栏 | `WorkspaceCloneSidebar` |
| 中间目录栏 | `WorkspaceCloneDirectory` |
| 聊天头部 | `WorkspaceCloneHeader` |
| 聊天画布 | `WorkspaceCloneChatView` |
| 输入区 | `WorkspaceCloneComposer` |
| 右侧详情抽屉 | `WorkspaceCloneUtilityDrawer` 重构后的聊天主抽屉 |

## 交互约束

- 右上按钮统一保留为本地 UI 假交互，不接真实功能
- 抽屉内的模型、记忆、技能库、命令、工具权限、频道、定时任务只展示占位信息
- `history / logs / settings / schedule / workbench` 不删除，但降级为聊天区中的次级面板概念
- related resource modal、agent info modal、runtime log detail modal、settings text preview modal 继续保留，只做样式收敛

## 验收标准

- 默认首页进入 `workspace-clone` 后，`聊天` 菜单视觉接近截图 1
- 头部右上操作区为图标化控件，不再是英文文字按钮
- 点击对应动作后，可打开截图 2 风格的右侧 Agent 详情抽屉
- 抽屉内包含头像卡、状态 chips、七宫格操作区和详情信息块
- composer 上方有建议卡片或快捷入口，输入区整体接近截图的单条圆角形态
- 左侧栏 `反馈 / 管理员`、目录栏搜索与 tabs、选中项高亮统一到截图风格
- 全页面无乱码中文、无横向滚动、无前端报错

## 遗留说明

以下内容本次继续保留为后续迁移对象：

- legacy `dashboard` 页面
- legacy top-tab shell
- 现有真实业务 hooks 与弹窗逻辑
- `聊天` 以外菜单的深层界面

待本次视觉收敛稳定后，再逐步讨论真实功能迁移与旧假 UI 清理。
