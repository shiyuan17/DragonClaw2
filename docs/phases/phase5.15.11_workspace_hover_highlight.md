# Phase 5.15.11: `workspace-clone` 全域悬浮高亮统一

> 状态：规划中
> 类型：前端 UI 优化
> 前置阶段：Phase 5.15.3 / Phase 5.15.9 / Phase 5.16

## 目标

围绕 `workspace-clone` 当前工作台界面，统一所有“可用且可点击”的交互元素悬浮高亮反馈，让左侧一级菜单、第二栏、主区头部、drawer、composer、建议卡、popover 与当前 workspace 专属弹层在 hover / focus-visible 语义上保持一致。

本次改动仅处理前端 `.tsx` / `.css` 的渲染层与样式层，不调整任何 `invoke()` 调用、事件处理逻辑、hooks、数据流或 Rust 后端命令。

## 本次范围

- 左侧一级菜单、折叠按钮、反馈按钮、管理员按钮及管理员 popover 项
- 第二栏搜索框、分类 tab、实体列表卡片、频道配置入口、折叠按钮
- 主区头部 icon 按钮、more menu、welcome suggestion cards
- composer 工具按钮、胶囊按钮、文本按钮、发送 / 停止按钮、内联建议项
- 右侧 drawer 的关闭按钮、session tiles、资源按钮
- `workspace-clone` 专属 modal / overlay 中沿用当前命名体系的可点击项
- 统一 `hover`、`focus-visible`、`active`、`muted`、`disabled` 的优先级和视觉反馈

## 不包含

- 不扩散到 legacy 首页、legacy tabs 或其他非 `workspace-clone` 页面
- 不新增、删除或改名任何菜单项、命令、数据结构、Tauri command
- 不调整 `invoke()` 名称、参数、返回值类型
- 不修改业务 hooks、状态切换逻辑、条件渲染语义
- 不额外重做布局结构，只统一交互态表现

## 视觉与交互规则

- 仅“可用且可点击”的元素提供明显 hover / focus-visible 高亮
- `is-active` 的视觉强度必须高于 hover，hover 不得覆盖 active
- `is-muted` 保持弱化，不提供强高亮
- `disabled` 保持禁用语义，不提供 hover 误导
- 高亮方式统一为轻抬升、浅蓝底、边框增强、柔和阴影、文本着色，不改变布局尺寸或造成跳动
- 尽量通过 `workspace-clone` 现有 CSS 变量与类名体系扩展，避免影响其他页面

## 实施要点

- 在 `src/styles/workspace-clone.css` 中补充统一 hover tokens，并覆盖主要交互组件
- 仅在 `src/components/workspace-clone/` 下补必要 className 或结构包裹，给缺少独立挂点的按钮提供选择器
- 保持现有折叠态、展开态、drawer 打开态、popover 打开态下的交互反馈一致

## 验收标准

- 左侧菜单、反馈、管理员、管理员 popover 项 hover 明显且一致
- 第二栏搜索框、类型 tab、列表卡片、频道配置入口、折叠按钮 hover 明显且一致
- 主区头部 icon、more menu、welcome 建议卡、composer 按钮 / 胶囊按钮 hover 一致
- 右侧 drawer 的关闭按钮、session tiles、资源项 hover 一致
- 折叠态侧栏与折叠态目录栏 hover 仍成立，不出现跳动、错位或强弱失衡
- `is-active` 项仍然比 hover 更醒目，`is-muted` 与 `disabled` 不出现错误高亮
- 仅修改 `workspace-clone` 相关前端文件，不引入新的业务逻辑回归
- `npm run build` 可通过，且无新的 TypeScript / CSS 错误
