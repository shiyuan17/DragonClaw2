# Phase 5.63: 全仓乱码文案排查与编码门禁补强

> 状态：规划中
> 类型：文案热修 / 工程门禁补强

## 目标

修复仓库里已确认的高曝光乱码文案，并补强编码检查门禁，避免同类 mojibake 字符串再次进入代码、文档或错误提示链路。本轮只处理文案与检查脚本，不改任何 Tauri command、`invoke()` 契约或业务流程。

## 本次范围

- 新增本轮 Phase 文档，并在 `docs/TODO.md` 记录对应任务。
- 修复 `src/components/workspace-clone/WorkspaceClonePage.tsx` 中已确认损坏的用户可见错误标题文案。
- 修复 `src-tauri/src/onboarding.rs` 中已确认损坏的 onboarding / SkillHub 相关错误提示文案。
- 更新 `scripts/check-mojibake.mjs`，让当前实际命中的乱码特征后续能被 `npm run check:encoding` 稳定拦截。
- 保持文本检查范围只覆盖源码、配置和文档文件，不扩展到图片、压缩包或其他二进制资源。

## 不包含

- 不改任何 `#[tauri::command]` 名称、参数或返回类型。
- 不改任何前端 `invoke()` 名称、参数、返回值或状态流。
- 不顺带清理无关模块的历史文案，也不重写现有提示体系。
- 不修改 `src/utils/text-mojibake.ts` 的用途；该文件仍作为前端判定乱码的样本来源之一存在。

## 已确认命中

- `src/components/workspace-clone/WorkspaceClonePage.tsx`
  - `skillErrorTitle`
- `src-tauri/src/onboarding.rs`
  - 推荐技能校验失败提示
  - GitHub 仓库 URL 校验失败提示
  - SkillHub 安装任务调度失败提示
  - GitHub 安装任务调度失败提示
- `scripts/check-mojibake.mjs`
  - 当前词表未覆盖以上真实命中，导致 `check:encoding` 存在漏报

## 实施约束

- `WorkspaceClonePage.tsx` 与 `onboarding.rs` 当前已有未提交改动，本轮只做外科手术式字符串替换，不回退、不重排、不顺手整理周边逻辑。
- 若终端中文显示异常，以文件真实 Unicode 内容和脚本扫描结果为准，不以终端直观显示作为唯一判断依据。
- 文档 commit 与代码 commit 必须分开，遵循“先文档，后代码”的项目规则。

## 验收标准

- `workspace-clone` 相关错误标题显示为正常中文。
- onboarding / SkillHub 相关失败提示显示为正常中文。
- `node scripts/check-mojibake.mjs` 能命中本轮新增的高置信乱码特征，并在修复后通过。
- `npm.cmd run check:encoding` 通过。
- `npm.cmd run check:file-size` 通过。
- `npm.cmd run tauri dev` 可启动，且本轮触达文案没有回归为乱码。

## 假设

- 当前确认的高置信乱码集中在 `WorkspaceClonePage.tsx`、`onboarding.rs` 与检测脚本门禁覆盖不足，不需要把本轮扩大成全仓逐字审校。
- Phase 编号使用 `5.63`，不与现有文档冲突。
