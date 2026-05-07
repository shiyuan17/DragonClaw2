# Phase 5.58: Workspace Agent 详情弹窗内容迁移
## Summary

- 将旧仓库 `DragonClaw` 的 `ChatAgentInfoReferenceModal` 信息结构迁移到 `DragonClaw2` 的 `workspace-clone > employees` 详情弹窗。
- 本轮按“完全替换”执行：当前 markdown 定义正文退出可见主界面，改为使命、身份、workflow、capabilities、rules、radar、likes/dislikes、tags 的富信息卡片布局。
- 限定只改 React 渲染层、前端数据整理层和新增样式文件；不改 Rust、`invoke()`、安装/卸载逻辑、事件语义和其他入口。

## Implementation Changes

- 文档先行：
  - 新增本 Phase 文档。
  - 在 `docs/TODO.md` 新增 `Phase 5.58` 对应未完成任务。
- 数据层：
  - 在 `src/data/agencyRoster.ts` 新增前端内部详情类型与 `loadAgencyRoleProfile(agentId)`。
  - 从现有 `agency-agent-profiles/<agentId>.json` 按需加载结构化资料。
  - 采用 `zh -> en -> 空默认值` 回退顺序。
  - 归一化输出 `name / mission / identity / workflow / capabilities / rules / likes / dislikes / tags / personalityRadar`。
  - 为雷达图补齐默认分值，保证字段缺失时也能稳定渲染。
- 员工详情弹窗：
  - 保留现有员工卡片点击、打开/关闭、toast、安装/移除与 roster 刷新逻辑。
  - 用旧版信息结构重建详情主体：
    - 左栏：头像、名称、标签、身份描述。
    - 中栏：使命、工作流、能力矩阵、执行规则。
    - 右栏：人格雷达、偏好、禁忌。
  - 移除当前可见的 markdown `definitionSections` 渲染。
  - `selectedRole` 继续作为入口对象，但详情展示改由 profile 数据驱动。
- 样式层：
  - 新增独立 CSS 文件承载迁移后的弹窗样式，避免与当前未提交的 `workspace-clone.css` 变更混在一起。
  - 继续使用现有 `--dc-*` 与 `--dc-workspace-*` token，不引入旧仓库主题变量。
  - 桌面端采用三栏布局，窄屏下自动收敛为单栏堆叠。
- 保持 `loadAgencyRoleDefinition()` 继续存在，不在本任务里顺手清理。

## Public Interfaces

- 新增前端内部类型：`AgencyRosterRoleProfile`
- 新增前端内部函数：`loadAgencyRoleProfile(agentId)`
- 不修改任何 Tauri command、`invoke()` 参数/返回值、Rust 接口或用户数据存储结构

## Validation

1. `npm run check:encoding`
2. `npm run check:file-size`
3. `npm run build`
4. `npm run tauri dev`
5. 手动验证：
   - 打开 `workspace-clone > employees`，点击任意员工卡片可打开新详情弹窗。
   - 弹窗展示使命、身份、workflow、capabilities、rules、radar、likes/dislikes、tags。
   - 当前 markdown 定义分节不再出现在可见主内容中。
   - 字段不完整的 agent 仍有稳定 fallback，不出现空白塌陷。
   - 安装/移除按钮语义保持不变。
   - 窄窗口下布局不溢出，关闭和滚动交互正常。

## Assumptions

- 本次“agent 信息详情弹窗”仅指 `workspace-clone` 员工页详情弹窗。
- “完全替换”按可见内容理解，不保留 markdown 正文 tab、折叠区或附录入口。
- 头像继续复用 `DragonClaw2` 现有 `workspace-clone` 默认头像体系。
- 现阶段不引入新的 React 组件测试基建，以现有脚本和手动回归为主。
