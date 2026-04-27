# Phase 10: i18n + Ollama + 数据统计

> 📋 待开始 | 目标版本：`v0.8.0`

## 铁律

> [!CAUTION]
> **三端验收**：所有改动必须在 Windows / Linux / macOS 三端验证通过。
> **UI 一致**：深色主题配色、Lucide 图标、`framer-motion` 动画。统计图表配色需与现有 accent 色系一致。

---

## 10.1 i18n 国际化（前端 UI）

### 方案
- 框架: `react-i18next` + `i18next`
- 目录: `src/i18n/zh-CN.json`, `src/i18n/en.json`, `src/i18n/init.ts`
- 范围: 仅前端 UI 文本，Rust 后端日志不做国际化
- 默认语言: 检测系统 locale → 匹配 → 回退 zh-CN
- 切换入口: 设置 → 通用 → 语言选择

### 工作量估算
- 约 15 个组件需要替换硬编码中文
- 预计 200+ 个翻译 key

### 边界情况
- 日期/数字格式跟随语言
- 动态拼接文本（`format!()` 生成的后端消息）暂不国际化
- 语言偏好持久化到 localStorage

---

## 10.2 Ollama 集成（AI 引擎页面）

### 方案
整合到现有 AI 引擎(模型) 页面，作为新的 provider 分类。

### 新增后端命令 (`ollama.rs` NEW)

| 命令 | 说明 |
|---|---|
| `detect_ollama()` | GET `http://localhost:11434/api/tags`，判断可达性 |
| `list_ollama_models()` | 解析返回的模型列表 |
| `add_ollama_provider(model)` | 写入 openclaw.json 作为本地 provider |

### 前端改动
- **ModelsTab.tsx**: 分类筛选新增 "本地模型"
- 检测到 Ollama → 显示已安装模型列表 + "一键添加" 按钮
- 未检测到 → 显示提示 "安装 Ollama 后即可使用本地模型" + 链接

### 边界情况
- Ollama 未安装: 不报错，静默隐藏或显示安装引导
- 自定义端口: 允许用户在设置中配置 Ollama 端口
- 模型列表为空: 提示 `ollama pull <model>` 用法
- Ollama 运行中但无 GPU: 照常展示，性能问题由用户自行判断

---

## 10.3 数据统计 Tab

### 数据来源
```
~/.openclaw/agents/<name>/sessions/  ← .jsonl 会话日志
```

每条日志包含: timestamp, model, tokens (input/output), duration 等。

### 新增后端命令 (`analytics.rs` NEW)

| 命令 | 说明 |
|---|---|
| `get_usage_stats(range)` | 按日/周/月统计请求数和 token 用量 |
| `get_model_distribution()` | 模型使用频率分布 |
| `get_daily_trend(days)` | 每日请求量趋势数据 |

### 前端 AnalyticsTab 布局

- **时间切换**: 日 / 周 / 月 按钮组
- **请求趋势**: 折线图 (使用 `recharts` 库)
- **Token 用量卡片**: 输入 / 输出 / 总计
- **模型分布**: 饼图或横向柱状图
- **预估费用**: 基于模型定价估算（标注"仅供参考"）

### 边界情况
- 无历史数据: 空态展示 "开始使用后将自动统计"
- 日志文件过大: 分页读取，只统计最近 90 天
- 多 Agent: 支持 Agent 维度筛选
- 费用估算精度: 标注"仅供参考，以提供商账单为准"
- sessions 目录不存在: 返回空数据，不报错

---

## 变更文件

| 文件 | 操作 | 说明 |
|---|---|---|
| [NEW] `src/i18n/zh-CN.json` | 新增 | 中文翻译文件 |
| [NEW] `src/i18n/en.json` | 新增 | 英文翻译文件 |
| [NEW] `src/i18n/init.ts` | 新增 | i18next 初始化 |
| [NEW] `src-tauri/src/ollama.rs` | 新增 | Ollama 检测 + 模型列表 |
| [NEW] `src-tauri/src/analytics.rs` | 新增 | 统计数据读取 |
| [NEW] `src/hooks/useAnalytics.ts` | 新增 | 统计数据 Hook |
| `src/components/AnalyticsTab.tsx` | 实现 | 从占位升级为完整统计页 |
| `src/components/ModelsTab.tsx` | 修改 | 新增本地模型分类 |
| `src/components/SettingsTab.tsx` | 修改 | 通用设置新增语言选择 |
| 所有 `.tsx` 组件 | 修改 | 硬编码中文 → `t('key')` |
| `package.json` | 修改 | 新增 react-i18next, recharts |
| `src-tauri/src/lib.rs` | 修改 | 注册新命令 |

---

## 验收标准

```
✅ 设置页切换语言 (中 ↔ 英) → 全部 UI 文本正确切换
✅ 刷新后语言偏好保持
✅ 检测到 Ollama → AI 引擎显示本地模型
✅ 未安装 Ollama → 友好提示安装
✅ 数据统计 Tab: 折线图 / Token 卡片 / 饼图 正确渲染
✅ 无数据时空态友好
✅ 大数据量 (1000+ 条日志) 加载性能可接受 (<2s)
✅ [Windows / Linux / macOS] 三端验证通过
✅ cargo test 通过
```
