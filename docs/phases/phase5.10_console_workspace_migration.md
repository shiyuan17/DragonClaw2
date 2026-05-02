# Phase 5.10: 退役旧控制台与 `open_console`

> 状态: 待验收
> 目标: 将 `workspace-clone` 固化为唯一首页，移除旧 `legacy` 控制台壳层与所有“打开控制台”入口，并在确认无残留调用后退役内部 Tauri 命令 `open_console`。

## 铁律

> [!CAUTION]
> 本次任务以退役旧 UI/入口为主，不修改服务启停、聊天、日志、配置等既有业务契约；除退役 `open_console` 外，不改其他 `#[tauri::command]` 的签名与返回结构。

---

## 背景

`DragonClaw2` 早期同时保留了两套首页能力：

- 新首页：`workspace-clone`
- 旧首页：`legacy` 顶部 Tab + `dashboard`

随着首页聊天、运行日志、频道绑定和模型配置逐步迁入 `workspace-clone`，旧控制台已经不再是主路径，但相关外壳、懒加载入口和 `open_console` 浏览器跳转仍残留在仓库中，造成以下问题：

- 首页实现存在双轨维护成本
- 构建仍会产出 legacy ready-page chunk
- 用户在新首页仍会看到“打开控制台”这种旧入口
- 前端和后端仍保留仅为旧控制台服务的内部链路

因此本阶段从“迁移”切换为“退役”，正式下线旧控制台。

---

## 本次包含

### 1. 首页收口为单一路径

- `phase === "ready"` 后只渲染 `workspace-clone`
- 删除 `legacy` 首页分支、懒加载入口与仅为其服务的 props / types
- 不再保留回退到 `legacy-tabs` 的前端视图状态

### 2. 前端移除旧控制台入口

- 删除 `DashboardTab`、`LegacyHomeShell`、`LegacyHomeReadyPage`
- 删除所有 `invoke("open_console")` 前端调用
- 删除 `consoleUrl` 这类仅为打开旧控制台服务的派生数据
- `workspace-clone` 空态中保留：
  - 启动服务
  - 运行日志
  - 日志诊断

### 3. 后端退役 `open_console`

- 先静态确认前端、托盘和其他模块无残留调用
- 删除 `providers::open_console` 实现
- 从 `src-tauri/src/lib.rs` 的命令注册中移除 `providers::open_console`
- 保留 `open_url`，不调整其签名和行为

### 4. 构建清理

- 清理不再引用的 legacy ready-page 样式入口
- 确保构建产物不再生成 `LegacyHomeReadyPage` 相关 chunk

---

## 本次不包含

- 不改 `invoke()` 之外的现有业务逻辑
- 不改服务生命周期、网关握手、聊天协议和日志结构
- 不改除 `open_console` 外的其他 Tauri 命令签名
- 不新增新的首页导航体系
- 不改 Rust 托盘“打开浏览器”能力

---

## 实施说明

### 前端

- `App.tsx` 收敛为单一 ready-page 渲染分支
- `src/types/index.ts` 清理 `TabId`、`HomeView` 等 legacy 内部类型
- `workspace-clone` 聊天空态删除“打开控制台”按钮，保留“查看日志”
- 删除旧首页壳层及其样式入口文件

### 后端

- `providers.rs` 删除 `open_console`
- `lib.rs` 删除 `providers::open_console` 注册
- 如测试中发现兼容性依赖，则回退为“仅移除前端入口、后端命令暂留”，并在本文档补记原因

---

## 验收标准

```text
[ ] ready 状态后仅显示 `workspace-clone` 首页
[ ] 仓库中不再存在 `LegacyHomeReadyPage` / `LegacyHomeShell` / `DashboardTab` 的有效引用
[ ] 仓库中不再存在 `invoke("open_console")` 与 `consoleUrl` 的有效引用
[ ] `workspace-clone` 空态不再出现“打开控制台”按钮
[ ] `workspace-clone` 仍可正常启动服务并查看运行日志
[ ] 设置中心日志诊断入口保持可用
[ ] `npm run build` 通过
[ ] `npm run tauri dev` 可正常启动
[ ] 构建产物不再生成 `LegacyHomeReadyPage` 相关 chunk
```

---

## 提交与验收流程

1. 先更新本文档与 `docs/TODO.md`
2. 单独提交文档 commit
3. 再进行代码退役
4. 运行构建与桌面启动验证
5. 用户验收通过后，再将 `TODO` 对应项改为 `[x]` 并提交代码 commit
