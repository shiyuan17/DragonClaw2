# Phase 5.26: 全项目消息提示统一为顶部居中浮层

> 状态：开发中
> 类型：前端体验统一 / 全局反馈系统收敛

## Background

当前项目中的消息提示、操作提示、通知提示仍然分散在多套实现里：

- App 根层存在特例 `RepairToast`
- `workspace-clone > employees` 使用页面内联横幅
- 模型配置、技能市场、记忆 / 技能 / 工具权限等弹窗各自维护 `notice/error` 状态条
- 启动 / 初始化失败仍然依赖独立 Modal 呈现错误与重试

这些提示的样式、位置、交互和优先级并不统一，已经开始影响整体产品质感，也让新功能继续接入时缺少统一出口。

## Goal

在不修改任何 Tauri `invoke()` 契约、后端命令签名或业务流程的前提下，建立一套前端统一反馈中心，把全项目的消息反馈收敛为“顶部居中浮层”。

本期统一后的规则如下：

- 全项目全替换，不再保留旧的页面横幅 / 底部 toast / modal 状态条
- 顶部最多同时显示 3 条提示，后续提示按 FIFO 排队补位
- 成功 / 普通通知默认自动消失
- 错误和带操作按钮的提示默认常驻，直到用户关闭或执行操作
- 有操作时显示 1 个主按钮；无操作时不显示操作按钮

## Scope

- 新增全局反馈 provider / hook / 宿主组件
- 在 `src/styles/tokens.css` 增加反馈组件专用 token
- 新增统一反馈样式文件
- 替换以下现有反馈入口：
  - App 根层 `RepairToast`
  - 启动 / 初始化 / 启动失败提示
  - 更新发现提示
  - `workspace-clone > employees` 加入 / 移除结果横幅
  - `workspace-clone > skills` 技能市场加载 / 安装提示
  - `workspace-clone` 模型配置弹窗状态条
  - `workspace-clone` 记忆 / 技能 / 工具权限弹窗状态条
  - `workspace-clone` 频道绑定弹窗反馈条

## Out Of Scope

- 不修改 Rust / Tauri 命令
- 不修改 `invoke()` 名称、参数或返回值
- 不新增后端事件总线
- 不替换确认类 Modal 本体
- 不改聊天区连接态、空态等页面结构化状态视图

## Implementation Notes

### Shared feedback layer

- 在 `src/hooks/useFeedback.ts` 提供统一接口：
  - `pushFeedback`
  - `dismissFeedback`
  - `clearFeedbacks`
- `pushFeedback` 的 payload 固定支持：
  - `tone`
  - `title`
  - `message`
  - `actionLabel?`
  - `onAction?`
  - `autoCloseMs?`
  - `dedupeKey?`
- 宿主层负责：
  - 队列管理
  - 最多 3 条可见堆叠
  - 自动消失
  - 关闭
  - 同类去重

### Visual system

- 只允许在 `src/styles/tokens.css` 中补充新的 `--dc-*` / `--dc-workspace-*` token
- 不新增第二套品牌色或反馈色源
- 顶部浮层需与 ElevenLabs 主题保持一致：
  - 浅底玻璃感卡片
  - 统一圆角、边框、阴影
  - 成功 / 警告 / 错误 / 信息态仅通过 token 切换

### Migration strategy

- 优先把“展示型 notice/error”迁移为直接调用统一反馈 hook
- 对仍承担流程状态语义的字段，保留状态本身，但不再在组件内渲染旧反馈条
- `RepairToast` 退役为反馈中心中的一个带操作按钮的 sticky 项
- 频道绑定中的流程内说明文本可保留，但 modal 顶部 / 底部反馈条需移除

### Clarifications

- 本次落地的浮层只承接“结果类提示 + 可操作错误”；加载中、扫码中、步骤说明继续保留在原上下文。
- 视觉参考截图的深色胶囊风格，但颜色和间距仍通过 `src/styles/tokens.css` 统一供给。
## Validation

1. `npm run build`
2. 启动流程中人为触发初始化失败 / 启动失败，确认顶部出现可重试提示
3. 触发 repair flow，确认顶部出现“修复连接”操作提示
4. 在 `workspace-clone > employees` 验证加入 / 移除成功失败都走顶部浮层
5. 在模型配置、技能市场、记忆 / 技能 / 工具权限弹窗中验证保存、删除、刷新、加载失败都走顶部浮层
6. 打开 Modal 时确认顶部提示仍高于 overlay 显示
7. 连续触发 4 条提示，确认同时仅显示 3 条，第 4 条进入队列补位

## Acceptance Notes

- 本期先完成文档 + 实现 + 构建验证
- `docs/TODO.md` 在用户验收通过后再从 `[ ]` 改为 `[x]`
- 代码 commit 与 TODO 勾选放到验收后收尾阶段
