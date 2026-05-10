# Phase 5.68.1: Workspace Composer Pill Text Compaction

## Summary
- 收敛 `workspace-clone` composer 中场景 / 邮箱 / 命令 / 工作目录 pills 的可见文案，改为图标优先的紧凑入口。
- 邮箱在已绑定状态下以及邮箱绑定弹窗中都使用对应 provider 图标语义；模型 pill 去掉“模型”前缀，仅保留当前模型名称。
- 本轮仅调整前端渲染层与样式，不修改任何 Tauri / Gateway / `invoke()` 契约。

## Implementation Changes
- 文档先行：
  - 在 `docs/TODO.md` 追加本次 UI 微调待办，便于验收留痕。
  - 新增本 Phase 文档，说明范围与边界。
- 前端渲染：
  - `WorkspaceCloneComposer.tsx` 将场景、邮箱、命令、工作目录 pills 收敛为图标按钮。
  - 邮箱已绑定态根据 `boundProvider` 切换对应图标语义，未绑定时保留通用邮箱图标。
  - `WorkspaceCloneSessionWorkdirPicker.tsx` 的 composer 菜单改为 portal 浮层，避免被输入区遮挡。
  - `WorkspaceCloneEmailBindingModal.tsx` 将原生 provider `select` 改为可展示图标的自绘 picker。
  - 模型入口保留当前模型名，去掉“模型”前缀文案。
- 样式对齐：
  - `workspace-clone.css` 为图标态 pills、工作目录 portal 菜单与邮箱 provider picker 补齐布局与状态样式，延续现有 token 体系。

## Interfaces / Contracts
- 不修改任何 Tauri command、Gateway 事件、`invoke()` 名称 / 参数 / 返回结构。
- 不修改邮箱绑定弹窗保存逻辑、场景切换、命令管理、模型切换或工作目录选择链路，仅调整入口展示与浮层承载方式。

## Test Plan
- 检查 `workspace-clone` composer：
  - 场景 / 邮箱 / 命令 / 工作目录 pills 已去掉可见文字，仅保留图标入口。
  - 已绑定邮箱后，按钮显示对应 provider 图标语义；未绑定时仍显示通用邮箱图标。
  - 邮箱绑定弹窗中的 provider 选择器可显示同一套 provider 图标。
  - 模型 pill 仅显示模型名，不再显示“模型”前缀。
  - 工作目录菜单展开后不再被 composer / 聊天区域遮挡。
  - 上述入口点击后，原有弹窗 / 菜单 / 行为保持不变。
- 提交前执行：
  - `npm run check:encoding`
  - `npm run check:file-size`

## Assumptions
- 本次“去除文字”同时覆盖 composer 工作目录入口，但不改变欢迎态 hero 中工作目录选择器的文案结构。
