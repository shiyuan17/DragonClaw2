# Phase 5.21: Workspace 技能市场同步

> 状态：规划中
> 类型：前后端联动功能迁移
> 前置阶段：Phase 5.15.6 skills/tools 弹窗、Phase 5.15.7 SkillHub 安装链路

## 目标

将 `DragonClaw` 的技能市场能力同步到 `DragonClaw2` 的 `workspace-clone > skills` 菜单页。

本次实现保留现有技能弹窗作为“当前 Agent 技能启用/禁用”面板，不改变它的职责；新增的技能市场页面负责：

- 浏览技能市场目录
- 分类切换与关键字搜索
- 查看技能详情
- 选择一个或多个 Agent 作为安装目标
- 安装后刷新已安装状态，并让当前 Agent 的技能弹窗看到新技能

## 范围

### 本次包含

- 新增 `workspace-clone` 技能市场主页面
- 新增技能详情弹窗
- 新增安装目标选择弹窗
- 新增技能市场前端数据层与类型
- 新增 Tauri 技能市场命令：
  - `load_skill_market_top`
  - `load_skill_market_by_category`
  - `load_installed_skill_market_slugs`
  - `load_installed_skills_snapshot`
  - `install_skill_market_skill`
- 安装根目录按目标 Agent 落到 `workspace_root_for_agent(agent_id)/skills`
- 技能弹窗的“可选技能列表”改为按当前 Agent 读取可见技能

### 本次不包含

- 不扩展聊天侧 related skill / 自动推荐 / 启动流程联动
- 不改变现有技能弹窗的保存语义
- 不修改已有 `invoke("get_agent_skill_config")` / `invoke("save_agent_skill_config")`
- 不引入新的 Rust 后台服务进程或新的外部安装协议

## 关键设计

### 1. 页面职责拆分

- 左侧菜单 `skills` 进入独立技能市场页面，不再显示 compact 占位页
- 现有右侧技能弹窗继续只负责当前 Agent 的 `selectedSkillNames`
- 市场页安装行为不自动启用技能；安装完成后仍需用户在技能弹窗中勾选启用

### 2. 安装语义

- 技能市场安装支持多 Agent 目标选择
- 每个目标 Agent 的安装目录为：
  - `main` -> `paths::main_workspace_dir()/skills`
  - 其他 Agent -> `paths::workspace_root_for_agent(Some(agent_id))/skills`
- 已安装标记按“任意可见安装根目录存在该技能”计算

### 3. 技能可见性

- 现有 `list_skills()` 保持兼容，不作为技能市场主数据源
- 新增 `load_installed_skills_snapshot(agent_id?)`，返回当前 Agent 可见的技能集合：
  - `paths::main_workspace_dir()/skills`
  - `paths::user_config_dir()/skills`
  - `paths::skillhub_workspace_skills_dir()`
  - `paths::workspace_root_for_agent(Some(agent_id))/skills`（如果目标不是 `main`）
- 技能弹窗刷新时优先使用新的 snapshot 命令，确保按 Agent 看到刚安装的技能

### 4. 技能市场数据源

- 前端服务层保留“浏览器/桌面 fetch + Tauri fallback”模式
- `top` 与分类列表走技能市场 API
- 搜索沿用关键字搜索 API
- 后端命令只负责透传 API 响应与本地安装，不改前端显示字段契约

## 对外接口

- `load_skill_market_top()` -> 技能市场原始响应
- `load_skill_market_by_category(request)` -> 技能市场原始响应
- `load_installed_skill_market_slugs()` -> `string[]`
- `load_installed_skills_snapshot(agent_id?)` -> `{ sourcePath, installed[] }`
- `install_skill_market_skill(skill_slug, target_agent_ids?)` -> `string`

## 验收标准

- `workspace-clone > skills` 显示真实技能市场页面，而不是骨架占位
- 可以切换分类、搜索技能、查看详情与分页
- 可以选择多个 Agent 安装技能
- 安装完成后页面出现已安装状态
- 若当前 Agent 被选为安装目标，重新打开技能弹窗后可看到新技能
- 不影响现有 memory / tools / channels / chat 行为

## 2026-05-02 Install Target Modal Polish

### 目标

- 优化“选择安装目标”弹窗的信息层级、列表密度与底部操作区布局
- 保持多选安装语义与现有 `install_skill_market_skill` 调用不变
- 仅调整 `tsx/css` 渲染与样式，不改前后端接口和安装逻辑

### 范围

- 强化技能名称与多选说明的头部呈现
- 将安装目标列表升级为更明确的可点击卡片式多选项
- 收紧大面积空白，让底部已选统计和主次按钮更贴近内容区
- 所有新增视觉值优先复用现有 `--dc-*` / `--dc-workspace-*` token
