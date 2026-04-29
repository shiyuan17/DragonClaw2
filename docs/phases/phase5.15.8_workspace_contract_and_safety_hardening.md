# Phase 5.15.8: 工作区契约与安全止血
> 状态：进行中
> 类型：前后端联动整改
> 前置阶段：Phase 5.15.6 / 5.15.7

## 目标

围绕 `workspace-clone`、Agent 配置、onboarding 和本地 gateway 链路，优先完成一轮“真源收敛 + 风险止血”，先解决会直接影响用户信任、配置生效和本地安全边界的核心问题，再为后续 Agent 管理迁移与首页减负打基础。

## 本次范围

- 统一 `openclaw.json` 的真实读写入口，避免沙箱配置与 `~/.openclaw/` 双真源继续漂移
- 给工作区选择建立正式后端契约，让首次选择和后续切换都写入真实配置并可回读
- 为 Agent 读/改/删链路补统一 ID 校验和路径边界保护
- 修复 onboarding 首次技能安装的失败语义与重试条件
- 修复启动阶段对 gateway 端口的旧闭包引用
- 收紧 `open_url` 只允许可信 scheme / localhost 控制台入口
- 收敛首页最误导的一批占位入口，避免继续把未实现能力伪装成可用交互

## 不包含

- 不在本阶段引入下载校验、签名验证或完整的供应链安全框架
- 不在本阶段完成完整的 Agent 管理页迁移
- 不在本阶段彻底拆完 `WorkspaceClonePage`，只处理与当前风险直接相关的局部状态管理问题
- 不在本阶段重做控制台认证方式，只先停止前端继续扩散 token

## 关键实现

### 1. 配置真源收敛

- 统一以 `paths::openclaw_config_path()` 作为 `openclaw.json` 的唯一入口
- `setup / config / provider_mgr / agent_resource_settings` 共用同一套读写 helper
- 默认工作区改为通过配置根 `agents.defaults.workspace` 明确持久化

### 2. 工作区真实生效

- `inject_default_config` 接收可选 `workspace_path`
- 新增工作区更新命令，支持已初始化后的切换
- 前端在引导页与后续切换后回显真实生效路径，而不是仅保存本地 state

### 3. Agent 基础安全与注册同步

- Agent 相关命令统一复用合法 ID 校验
- 路径访问前做规范化和目录边界检查
- 创建 / 删除 Agent 时同步维护 `agents.list[]` 与默认 workspace 目录

### 4. onboarding / gateway 止血

- onboarding 失败不再落成 `completed: true`
- 启动监听改为读取最新端口，避免首次安装连错 gateway
- 首页打开控制台改走后端受控入口，`open_url` 拒绝非 `https` 和非本地 `http`

## 验收标准

- 首次选择工作区后，`get_current_config()` 能回读到相同路径
- 切换工作区后，后续 memory / skills / gateway 读取的工作区与 UI 展示一致
- Agent 的读取、更新、删除无法越界访问 `agents/` 目录之外的路径
- onboarding 任一技能安装失败时，不会把状态永久锁成“已完成”
- 服务自动换端口后，首次 onboarding 仍能连接正确的 gateway
- 首页与 legacy 打开控制台的入口不再把 token 暴露给前端 state / prop
