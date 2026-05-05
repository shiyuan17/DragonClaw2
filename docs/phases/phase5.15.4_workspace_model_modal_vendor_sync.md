# Phase 5.15.4: Workspace Model Modal Vendor Sync
> 状态：已落地，持续迭代
> 类型：前后端联动的模型管理与聊天入口交互
> 前置阶段：Phase 5.15.3 聊天标题栏与会话侧栏重构

## 目标

在 `workspace-clone` 中保留独立的模型配置弹窗能力，同时把聊天框底部的模型按钮升级为“先列出已保存模型，再按需进入自定义配置”的两段式交互。

本次调整只影响 `workspace-clone` 聊天输入区和已有的 workspace 模型配置弹窗，不替换全局 `ModelSwitchModal` / `ApiKeyModal`，也不修改任何 Tauri command 的签名或前端 `invoke()` 契约。

## 本次范围

- 保留现有 `WorkspaceCloneModelConfigModal`，继续承接新增、编辑、删除、自定义模型配置
- 将聊天框底部模型入口改为轻量下拉菜单，而不是直接打开配置弹窗
- 菜单展示全部已保存模型的扁平列表，数据来自现有 `list_all_models()`
- 点击真实模型项时直接调用现有 `set_default_model`
- 菜单底部保留“配置自定义模型”入口，点击后再打开现有配置弹窗

## 不包含

- 替换全局 `ModelSwitchModal` / `ApiKeyModal`
- 修改 `src-tauri/resources/providers.json`
- 新增、删除或重命名任何 Tauri command
- 为聊天框模型菜单引入 `Auto` 自动路由语义

## 关键设计

### 1. 聊天框模型按钮改为两段式交互

- 点击聊天框底部模型 pill 时，优先打开轻量模型菜单
- 菜单展示所有已保存 provider/model 的扁平模型列表，不按当前 provider 限制
- 当前选中的模型使用明确的选中态与勾选态高亮
- 点击模型项后立即切换并关闭菜单，不增加二次确认按钮

### 2. 自定义模型能力继续留在现有弹窗

- 菜单底部单独提供“配置自定义模型”入口
- 只有点击该入口时，才打开 `WorkspaceCloneModelConfigModal`
- 自定义 provider、Base URL、API Key、模型 ID、协议等编辑能力仍完全由原弹窗承接

### 3. 只复用现有接口，不扩后端契约

- `list_all_models()`：用于聊天框模型菜单的扁平列表
- `list_saved_providers()`：继续用于现有 workspace 模型配置弹窗
- `set_default_model()`：继续负责真实模型切换
- 不新增任何后端接口，不改变现有返回 shape

## 验收标准

- 点击 `workspace-clone` 聊天框“模型”按钮时，先出现模型列表，不直接出现配置弹窗
- 菜单列表展示全部已保存模型，且不显示 `Auto`
- 点击任一已保存模型后，模型立即切换，菜单关闭，按钮文案同步更新
- 点击“配置自定义模型”后，才打开现有模型配置弹窗
- 当前模型在菜单中有明确选中态
- 空列表、加载失败、重复打开、`Escape` 关闭、点空白处关闭都正常
- `npm run check:encoding`、`npm run check:file-size`、`npm run tauri dev` 可作为提交前回归检查
