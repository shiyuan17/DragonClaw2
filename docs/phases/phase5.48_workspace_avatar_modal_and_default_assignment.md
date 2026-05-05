# Phase 5.48: Workspace 头像弹窗修复与默认头像分配

> 类型：前端修复 / 体验补完
> 范围：`workspace-clone > chat > agents`、`workspace-clone > employees`
> 约束：不新增、不删除、不修改任何 Tauri command / `invoke()` 契约

## 背景

当前 `workspace-clone` 的头像能力已经迁入一部分基础设施，但仍存在 3 个影响体验的问题：

1. 聊天回复区的 assistant 头像在消息流里会被拉伸成横条，出现半张头像被裁切的情况。
2. 头像设置弹窗仍保留英文标题、分类和按钮文案，且在当前窗口尺寸下显示不完整。
3. 新加入的数字员工如果没有网关头像，只能回退到字母占位，无法自动获得稳定的默认头像。

本期在不触碰后端接口的前提下，把这 3 个问题一并收口。

## 目标

- 修复聊天消息头像容器尺寸，避免头像在消息流中被横向拉伸或异常裁切。
- 将头像设置弹窗改为完整中文文案，并保证弹窗内容在常见窗口尺寸下完整可见、可内部滚动。
- 为没有自带头像的新加入数字员工按 `agentId` 稳定分配默认插画头像。
- 统一头像优先级，确保目录、顶部头像、聊天欢迎态、assistant 回复、员工卡片显示一致。

## 实现要点

- 文案与弹窗：
  - 将 `WorkspaceCloneAvatarModal.tsx` 中的标题、说明、分类标签、上传按钮、恢复默认按钮、成功/失败反馈改成中文。
  - 调整 `workspace-clone.css` 中头像弹窗容器与内容区布局，保证内容过多时在弹窗内部滚动，而不是整体溢出裁切。

- 默认头像规则：
  - 在 `workspaceCloneAvatarPresets.ts` 中补充“按 `agentId` 稳定分配插画头像”的 helper。
  - 复用现有 `src/assets/avatar/*` 插画素材，不新增后端存储。
  - 主分身 `main` 以及已有网关头像/本地覆盖头像的实体不受默认分配逻辑覆盖。

- 头像解析优先级：
  - `local override` > `gateway avatarUrl/avatar` > `default illustration avatar` > `avatarLabel`
  - 该规则同时作用于：
    - 聊天目录
    - 顶部 header
    - 聊天欢迎态与 assistant 回复头像
    - 数字员工市场卡片

## 验收标准

1. 聊天区 assistant 头像不再出现横向拉伸或只显示半张头像的问题。
2. 头像设置弹窗标题、分类、按钮、提示文案全部为中文。
3. 头像设置弹窗在当前窗口尺寸下完整显示，底部操作区不会被裁掉；内容多时可在弹窗内部滚动。
4. 上传自定义头像后，目录、顶部、聊天区即时同步更新。
5. 点击“恢复默认”后，能正确回退到网关头像或默认插画头像。
6. 新安装一个原本无头像的数字员工后，员工页卡片、聊天目录、顶部头像、聊天回复都会显示同一张稳定的默认插画头像。
7. 刷新或重启应用后，自定义头像覆盖仍保留，默认头像分配结果保持稳定。

## 验证

- `npm run check:encoding`
- `npm run check:file-size`
- `npm run build`
- `npm run tauri dev`
- 手动检查 `workspace-clone > chat > 数字员工` 与 `workspace-clone > employees`
