# Phase 5.5: 仪表盘体验优化 + 端口扩展

> 📋 待开始

## 铁律

> [!CAUTION]
> **前端 UI/UX 改动为主，不改功能逻辑。** 唯一的后端改动：端口范围扩展（`service.rs` 3 行）。

---

## Stage 19: 全局启动加载 + Logo 替换 + 端口扩展

### A. 全局启动加载框 (StartupOverlay)

**当前问题**：点击"初始化并启动"后，仅按钮文字变化，用户可能以为卡死。

**方案**：
1. 新增 `StartupOverlay` 组件，全屏半透明蒙层 + 居中 logo + 旋转动画 + "正在启动..."
2. `useService` 中新增 `startingUp` state，`handleStart` 时设为 true
3. 监听 `service-log` 事件，检测 ready 信号（`listening` / `started on`）时关闭 overlay
4. 浏览器打开 = overlay 关闭，形成完整反馈闭环

### B. Logo 替换 + 脉冲光效

**当前问题**：Header 纯文字、Dashboard 用 Lucide 通用图标，无品牌辨识度。光效太暗。

**方案**：
1. 复制 `logo.jpg` → `src/assets/logo.jpg`
2. **Header**：文字前加 20px logo 图片
3. **Dashboard status-ring**：Lucide `Box`/`Activity` → 48px logo 图片（圆形裁切）
4. 脉冲光效增强：
   - stopped: `rgba(255,255,255, 0.06→0.25)` 呼吸循环
   - running: `rgba(255,255,255, 0.15→0.4)` 更亮更快

### C. 端口范围扩展

**当前问题**：`18789..=18799` 仅 11 个端口，多实例场景容易耗尽。

**方案**：`service.rs` 改为 `18789..=18899`（111 个端口），更新错误提示。

---

### 变更文件

| 文件 | 改动 |
|---|---|
| [NEW] `src/assets/logo.jpg` | 品牌 logo 图片 |
| [NEW] `src/components/StartupOverlay.tsx` | 全局启动加载蒙层组件 |
| `src/components/Header.tsx` | 文字前加 logo 图片 |
| `src/components/DashboardTab.tsx` | status-ring 内 Lucide → logo |
| `src/styles/dashboard.css` | 脉冲光效增强 + logo 圖片适配 |
| `src/hooks/useService.ts` | 新增 `startingUp` state + ready 监听 |
| `src/App.tsx` | 渲染 StartupOverlay |
| `src-tauri/src/service.rs` | 端口范围 18799→18899 (3 行) |

---

## 验收标准

```
✅ npm run tauri dev / cargo build 无编译错误
✅ 点击启动 → 出现全局加载蒙层 → 服务就绪后蒙层消失
✅ Header 左上角有 logo 小图标
✅ Dashboard 中间圆圈显示 logo 而非 Lucide 图标
✅ 圆圈光效：停止态从暗到亮呼吸，运行态更亮
✅ 端口范围扩展至 18899
```
