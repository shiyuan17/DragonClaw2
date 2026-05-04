# Phase 5.41: Startup Source Mojibake Cleanup and Encoding Guard
> 状态: Planned
> 日期: 2026-05-04
> 类型: 启动修复 / encoding cleanup / guardrail

## 背景

本次问题不是仓库整体编码策略失效，而是少量源码文件中真实存储了错码中文、坏掉的全角标点和被截断的字符串字面量。它们已经开始破坏 Rust 解析，导致 `src-tauri/src/channels/` 在启动阶段直接编译失败。

## 目标

- 恢复 `channels` 后端与 `workspace-clone` 前端已定位错码文案的可读中文。
- 修复坏字符串、缺失引号和括号失配，恢复 `channels` 模块可编译状态。
- 新增可执行的编码扫描脚本，阻止同类乱码再次进入仓库。

## 实施范围

### 1. 文档与规范
- 在 `docs/TODO.md` 记录本次治理任务，覆盖后端、前端与防回归脚本。
- 更新 `AGENTS.md`，明确文本源码必须保存为 UTF-8，不允许提交错码/乱码字符串。
- 将 `npm run check:encoding` 纳入提交前验证规则。

### 2. 后端修复
- 清理 `src-tauri/src/channels/{mod.rs,config.rs,qr_session.rs,shared.rs,weixin_plugin.rs}` 中的真实错码字符串。
- 恢复被损坏的中文标点，统一保留 `\n`、`,`、`，` 分隔与中文收尾标点裁剪。
- 修复遗留坏字符串引发的语法截断，不修改任何 Tauri command 签名。
- 若 `mod.rs` 中遗留的配置 helper 已不再被主模块使用，则直接删除，避免重复维护。

### 3. 前端修复
- 将 `WorkspaceCloneEmployeesView.tsx` 的反馈标题恢复为 `分身定义详情`。
- 将 `WorkspaceClonePage.tsx` 的频道反馈标题恢复为 `频道绑定`。
- 仅修复渲染层字符串，不改动 `invoke()`、事件处理和状态流。

### 4. 防回归检查
- 新增 `scripts/check-mojibake.mjs`，扫描文本源码与配置文件中的错码 token、替换字符 `U+FFFD`、私有区非法字符和已知坏标点占位。
- 在 `package.json` 增加 `check:encoding`，并接入 `build` 流程作为默认门禁。

## 验收标准

- `src-tauri/src/channels/` 不再因乱码字符串导致 Rust 解析失败。
- `workspace-clone` 中“分身定义详情”“频道绑定”显示正常。
- `npm run check:encoding` 能通过，并对已知乱码模式报错失败。
- `npm run check:file-size` 继续通过，不引入新的大文件违规。
