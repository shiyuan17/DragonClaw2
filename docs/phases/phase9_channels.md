# Phase 9: 平台接入配置

> 📋 待开始 | 目标版本：`v0.7.0`

## 铁律

> [!CAUTION]
> **三端验收**：所有改动必须在 Windows / Linux / macOS 三端验证通过。
> **UI 一致**：深色主题配色、Lucide 图标、`framer-motion` 动画。
> **不破坏已有配置**：写入 channels 时不能覆盖 models/agents/gateway 字段。

---

## 技术前提：JSON 结构化读写

> [!WARNING]
> 当前 `config.rs` 用字符串拼接操作 JSON，不够健壮。本 Phase 必须先将配置读写重构为 `serde_json::Value`，确保 channels 写入不破坏其他字段。

### 重构步骤
1. 读取 `openclaw.json` → `serde_json::Value`
2. 按路径修改指定字段 (如 `["channels"]["telegram"]`)
3. 写回文件（保留其他字段不变）

---

## 9.1 平台配置 UI

### 位置
集成到「智能体」Tab 底部，与 Agent 管理在同一页面。

### 每个平台的引导流程

#### Telegram
| 步骤 | 内容 |
|---|---|
| Step 1 | 引导打开 @BotFather（带链接按钮）|
| Step 2 | 输入 Bot Token（格式校验: `\d+:[A-Za-z0-9_-]+`）|
| Step 3 | DM/群聊策略选择 (pairing / open / allowlist) |

#### Discord
| 步骤 | 内容 |
|---|---|
| Step 1 | 引导打开 Discord Developer Portal |
| Step 2 | 输入 Bot Token |
| Step 3 | 提醒用户开启 Message Content Intent |
| Step 4 | 生成邀请链接提示 |

#### 飞书
| 步骤 | 内容 |
|---|---|
| Step 1 | 引导打开飞书开放平台 |
| Step 2 | 输入 App ID + App Secret |
| Step 3 | 输入 Verification Token + Event URL 说明 |

### 新增后端命令 (`channels.rs` NEW)

| 命令 | 说明 |
|---|---|
| `list_channels()` | 读取 openclaw.json 的 channels 部分 |
| `save_channel_config(platform, config)` | 结构化写入 channels 配置 |
| `remove_channel(platform)` | 删除指定平台配置 |

### 边界情况
- Token 格式校验失败 → 前端红字提示，不允许保存
- 已有配置的平台显示"已连接"状态 + 编辑/删除按钮
- openclaw.json 不存在时 → 先创建基础结构再写 channels
- 多账号场景（同一平台多个 bot）→ V3 暂不支持，1 平台 1 账号
-  QQ: 需确认 OpenClaw 原生支持情况，若不支持则此阶段不做

---

## 变更文件

| 文件 | 操作 | 说明 |
|---|---|---|
| [NEW] `src-tauri/src/channels.rs` | 新增 | 频道配置 CRUD |
| [NEW] `src/components/ChannelConfigModal.tsx` | 新增 | 分步配置弹窗 |
| `src-tauri/src/config.rs` | 重构 | 字符串拼接 → serde_json::Value |
| `src/components/AgentsTab.tsx` | 修改 | 底部新增平台接入区域 |
| `src-tauri/src/lib.rs` | 修改 | 注册新命令 |

---

## 验收标准

```
✅ Telegram: 输入 Bot Token → 写入 openclaw.json → 重启服务后 bot 响应
✅ Discord: 完整引导 → 配置正确写入
✅ 飞书: 三步引导 → 配置正确写入
✅ 已有 API Key / 模型 / Agent 配置不受影响
✅ 删除频道 → 配置正确清理
✅ Token 格式错误 → 前端校验提示
✅ openclaw.json 从无到有 → 正确生成
✅ [Windows / Linux / macOS] 三端验证通过
✅ cargo test 通过
```
