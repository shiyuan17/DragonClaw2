# Phase 5.6: 自定义模型 ID 输入

> 📋 待开始

## 铁律

> [!CAUTION]
> **纯前端 UI 改动。** 不改 `useConfig.ts`、`types/index.ts`、后端 Rust 代码。
> 后端 `save_api_config` / `set_default_model` 接受任意字符串，不做白名单校验。

---

## Stage 20: 模型选择支持手动输入

### 当前问题

选择提供商后，可用模型只有预设列表。若提供商上线了新模型，用户无法使用。

### 方案

在 **ApiKeyModal** 和 **ModelSwitchModal** 的模型列表末尾，新增一个"手动输入"选项：
- 点击后展开 input 框
- 用户输入任意模型 ID（如 `gpt-5`、`deepseek-r1-0528`）
- 保存时自动 `trim()`，空值不允许选中
- ModelSwitchModal 中的 fullModelId 自动拼接 `{provider}/{customInput}`

### 边界处理

- 空字符串/纯空格 → 不允许保存
- 自定义模型无 `is_free` badge（正确行为）
- ModelSwitchModal 的 "当前" 标记需兼容自定义值

### 变更文件

| 文件 | 改动 |
|---|---|
| `src/components/ApiKeyModal.tsx` | 模型按钮列表后加"手动输入"选项 + input |
| `src/components/ModelSwitchModal.tsx` | 模型列表后加"手动输入"选项 + input |
| `src/styles/models.css` | 自定义输入框样式 |

---

## 验收标准

```
✅ vite build 无编译错误
✅ ApiKeyModal 选择提供商后，模型列表末尾有"手动输入"选项
✅ 点击"手动输入"→ 出现 input 框，输入后可保存
✅ ModelSwitchModal 同样支持手动输入
✅ 预设模型的选择行为不受影响
✅ 自定义模型保存后能正常使用
```
