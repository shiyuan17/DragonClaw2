# Phase 5.18: ElevenLabs 主题 Token 化与全局规范统一

> 状态：待验收
> 类型：前端视觉规范 / 设计系统底座

## 目标

把 `docs/design/DESIGN-elevenlabs.md` 落成 DragonClaw 前端唯一的主题真源，建立可复用的 design token 层，并把共享样式入口切换到统一语义变量上，为后续页面分阶段迁移提供底座。

## 本次范围

- 新增 `src/styles/tokens.css`，沉淀颜色、字体、圆角、间距、阴影、动效和核心组件 token。
- 重构共享样式入口，让 `global.css`、按钮、标题栏、弹窗、启动页、启动遮罩优先消费 token。
- 保留旧 `--bg-*` / `--text-*` / `--accent-*` 变量作为兼容别名，避免一次性改完所有页面。
- 把“新 UI 只能走 token 层”的规则写回设计文档、`AGENTS.md` 和 `docs/TODO.md`。

## 不包含

- 不改任何 `invoke()` 调用、hooks 业务逻辑或 Rust 后端接口。
- 不一次性重写 `workspace-clone` 与所有业务页面的全部局部样式。
- 不引入新的主题切换逻辑或并行品牌方案。

## 验收标准

- 共享样式底座已切换到 ElevenLabs token 体系，应用默认视觉不再依赖旧深色主题变量定义。
- 新增视觉值优先落在 `src/styles/tokens.css`，共享样式文件不再新增裸色值作为设计真源。
- `docs/design/DESIGN-elevenlabs.md`、`AGENTS.md`、`docs/TODO.md` 都明确声明 token 约束。
- `npm run build` 通过；`npm run tauri dev` 可启动并可人工检查启动页、主壳、弹窗与设置相关界面。
