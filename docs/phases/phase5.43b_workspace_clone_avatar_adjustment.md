# Phase 5.43b: `workspace-clone` 头像调整功能迁移

> 类型：前端功能迁移
> 范围：`workspace-clone > chat > agents`
> 约束：不新增或修改任何 Tauri command / `invoke()` 契约

## 背景

旧仓库 `D:/Github/DragonClaw` 已经具备头像调整能力，支持：

- 预设头像
- 上传自定义头像
- 恢复默认头像

当前 `DragonClaw2` 的 `workspace-clone` 只有头像展示能力，还没有：

- 本地头像覆盖状态
- 头像调整入口
- 头像调整弹窗
- 预设头像资源

本阶段只把这条前端能力迁移到 `workspace-clone`，并严格限定在 Agent 会话范围内。

## 目标

- 仅在 `workspace-clone > chat > agents` 中支持头像调整
- 迁移旧仓库完整预设头像素材与分类
- 支持上传图片和恢复默认头像
- 使用前端本地存储持久化覆盖结果
- 不改动任何 Rust 接口、网关协议或现有 `invoke()` 签名

## 范围

### 本期包含

- 扩展 `WorkspaceEntity`，增加 `avatarUrl?: string`
- 新增 Agent 头像本地覆盖映射与持久化
- 将旧仓库 `avatar-presets` 逻辑和 `src/assets/avatar/**` 资源迁入当前仓库
- 在 `workspace-clone` 中新增头像调整 modal
- 让头像结果同步回显到：
  - 顶部 `WorkspaceCloneHeader`
  - 目录列表
  - 折叠态 mini-rail
  - 聊天欢迎态和 assistant 标记

### 本期不包含

- Team / 频道头像编辑
- 后端持久化或新建 Tauri command
- 用户消息头像逻辑调整
- sidebar 底部管理员区域头像编辑

## 实现约束

- 优先级固定为：
  `local override` > `gateway identity.avatarUrl` > `gateway identity.avatar`（仅图片 URL / data URL）> 现有 `avatarLabel`
- 仅当 `activeType === "agents"` 且存在 `selectedEntity` 时允许打开头像调整
- 上传大小限制保持为 2MB
- 错误与成功提示沿用 `workspace-clone` modal 的现有反馈风格
- 本地覆盖结果不能被 `agents.list`、缓存回填或会话切换覆盖掉

## 验收标准

1. 选中 Agent 时可以打开头像调整弹窗，Team / 频道不可编辑
2. 预设头像切换后，顶部、目录、折叠态、聊天区头像立即更新
3. 上传合法图片后，刷新和重启应用仍能保留
4. 非图片文件或超过 2MB 的图片会被拦截并提示错误
5. 点击“恢复默认”后，删除本地覆盖并回退到网关头像或字母/emoji
6. 网关重连、`agents.list` 刷新、缓存回填后，本地覆盖依然优先显示

## 验证

- `npm run check:encoding`
- `npm run check:file-size`
- `npm run build`
- `npm run tauri dev`
- 手动检查 `workspace-clone > chat > agents` 的头像调整全链路
