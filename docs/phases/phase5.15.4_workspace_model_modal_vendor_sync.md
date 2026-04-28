# Phase 5.15.4: Workspace-Clone 模型弹窗与模型厂商同步

> 状态：规划中
> 类型：前后端联动功能补齐
> 前置阶段：Phase 5.15.3 顶部标题栏与右侧会话边栏重构

## 目标

在 `workspace-clone` 中新增一套独立的模型配置弹窗，点击模型相关入口后打开，整体结构和交互对齐 `D:/Github/DragonClaw` 的 `RelatedModelPanel`。

本次只接管 `workspace-clone` 的模型入口，不替换全局现有 `ModelSwitchModal` / `ApiKeyModal`。同时同步 DragonClaw 的模型厂商列表作为弹窗私有数据源，并补齐后端命令，让弹窗支持真实的新增、编辑、删除和切换模型配置。

## 本次范围

- 将 `workspace-clone` 中所有模型入口统一接入新的 workspace 专用模型弹窗
- 同步 DragonClaw 的模型厂商列表为前端私有常量
- 新增模型配置卡片列表、厂商下拉、表单编辑与保存交互
- 新增 workspace 专用后端命令，用于保存、删除和列出模型配置
- 扩展 `App -> WorkspaceClonePage` 的配置数据与动作传递

## 不包含

- 替换全局 `ModelSwitchModal` / `ApiKeyModal`
- 修改 `src-tauri/resources/providers.json`
- 改动 AI 引擎页现有 provider 分类、注册入口和推荐逻辑
- 改动 `workspace-clone` 以外菜单的模型交互入口

## 关键设计

### 1. Workspace 专用模型弹窗

- 弹窗头部包含标题、副标题、刷新按钮和关闭按钮
- 弹窗上半区展示已保存配置卡片和“新增配置”卡片
- 弹窗下半区展示模型厂商、名称、请求地址、API Key、模型 ID、协议等固定字段
- 点击卡片可快速切换模型，编辑和删除走独立按钮

### 2. 模型厂商同步策略

- 从 `D:/Github/DragonClaw/src/config/model_data.json` 提取厂商数据
- 转换为 DragonClaw2 内部前端常量，仅供 workspace 模型弹窗使用
- 预设厂商自动填充请求地址、协议和模型候选
- “自定义”厂商保留自由编辑能力

### 3. 后端命令补齐

- 新增 workspace 专用保存命令，支持按任意 provider key 创建或更新配置
- 新增 workspace 专用删除命令，支持删除指定配置并处理当前激活项切换
- 复用 `list_saved_providers` 但补充 `display_name`
- 保持现有 `save_api_config` / `set_default_model` 签名不变，避免影响旧入口

## 验收标准

- 在 `workspace-clone` 点击模型入口可打开新弹窗
- 弹窗结构接近参考图，包含卡片区、厂商下拉、完整表单、刷新和关闭按钮
- 切换厂商时，请求地址、协议和模型候选自动同步
- 选择“自定义”时，名称、请求地址和模型 ID 可自由编辑
- 新增、编辑、删除、切换模型配置都会真实写入 `openclaw.json`
- 删除最后一个保存配置会被拒绝并给出提示
- `npm run build` 可以通过
