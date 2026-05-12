import type { LogEntry, WorkspaceEntityType } from "../../types";
import { MAIN_AGENT_DISPLAY_NAME } from "../../data/agencyRoster";
import type {
  WorkspaceEntity,
  WorkspaceHistoryItem,
  WorkspaceMenuItem,
  WorkspaceMessage,
  WorkspaceResourceItem,
  WorkspaceScheduleItem,
  WorkspaceToolItem,
  WorkspaceTypeTab,
  WorkspaceWorkbenchItem,
} from "./workspaceCloneTypes";

export const WORKSPACE_MENU_ITEMS: WorkspaceMenuItem[] = [
  { key: "chat", label: "聊天", icon: "message-circle" },
  { key: "schedule", label: "任务", icon: "calendar-clock" },
  { key: "employees", label: "数字员工", icon: "users" },
  { key: "skills", label: "技能市场", icon: "sparkles" },
  { key: "tasks", label: "产品落地", icon: "layout-dashboard" },
];

export const WORKSPACE_TYPE_TABS: WorkspaceTypeTab[] = [
  { key: "agents", label: "数字员工", icon: "users" },
  { key: "channels", label: "频道", icon: "radio" },
  { key: "teams", label: "团队", icon: "bot" },
];

export const WORKSPACE_REAL_TYPE_TABS: WorkspaceTypeTab[] = WORKSPACE_TYPE_TABS.filter((tab) => tab.key === "agents");

export const WORKSPACE_HOME_SUGGESTIONS = [
  {
    id: "task",
    title: "任务",
    description: "把周期性工作、提醒和摘要整理成可以直接执行的自动化任务。",
    icon: "calendar-clock",
  },
  {
    id: "docs",
    title: "文件整理",
    description: "识别文件内容、提取关键信息，并按规则完成归档和命名。",
    icon: "book-open",
  },
  {
    id: "social",
    title: "社交媒体",
    description: "围绕平台搜索、内容生成、账号监控和发布动作组织任务。",
    icon: "message-circle",
  },
  {
    id: "local",
    title: "本地生活",
    description: "把本地活动、服务预约和商品筛选整理成可执行的生活助手任务。",
    icon: "radio",
  },
  {
    id: "study",
    title: "教育学习",
    description: "围绕课程设计、练习反馈与资料摘要，生成可跟进的学习任务。",
    icon: "layout-dashboard",
  },
];

export function buildWorkspaceEntities(
  currentModelName: string,
  currentProviderName: string,
  running: boolean,
): Record<WorkspaceEntityType, WorkspaceEntity[]> {
  return {
    agents: [
      {
        id: "main",
        entityType: "agents",
        name: MAIN_AGENT_DISPLAY_NAME,
        searchText: `main ${MAIN_AGENT_DISPLAY_NAME}`,
        subtitle: running ? "工作中" : "待命中",
        status: running ? "busy" : "offline",
        avatarLabel: "M",
        accent: "main",
        currentWork: running ? "等待新的任务请求" : "服务尚未启动，当前仅展示首页聊天界面。",
        recentOutput: `${currentModelName} / ${currentProviderName}`,
      },
    ],
    channels: [
      {
        id: "wechat",
        entityType: "channels",
        name: "微信服务号",
        subtitle: "已连接",
        status: "online",
        avatarLabel: "微",
        accent: "wechat",
        channelLabel: "2 个账号",
        currentWork: "等待接入新的接待 Agent。",
      },
      {
        id: "feishu",
        entityType: "channels",
        name: "飞书企业消息",
        subtitle: "待配置",
        status: "busy",
        avatarLabel: "飞",
        accent: "feishu",
        channelLabel: "1 个租户",
        currentWork: "保留二维码与手动配置骨架。",
      },
    ],
    teams: [
      {
        id: "studio",
        entityType: "teams",
        name: "增长工作室",
        subtitle: "3 名成员",
        status: "online",
        avatarLabel: "团",
        accent: "team",
        memberLabels: ["运", "策", "执"],
        currentWork: "评审聊天首页视觉方向。",
        recentOutput: "默认首页以图 1 作为唯一主参考。",
      },
    ],
  };
}

export const WORKSPACE_MESSAGES: WorkspaceMessage[] = [
  {
    id: "assistant-1",
    role: "assistant",
    author: "M",
    text: "我是主 Agent，已经准备好协助你拆解和执行任务。",
    time: "23:45",
  },
];

export const WORKSPACE_HISTORY: WorkspaceHistoryItem[] = [
  {
    id: "h-1",
    title: "首页视觉收敛",
    subtitle: "以图 1 作为默认状态基准，继续调整首页聊天布局。",
    time: "今天 09:10",
  },
  {
    id: "h-2",
    title: "频道绑定弹窗",
    subtitle: "保留微信、飞书和手动配置三段式结构。",
    time: "今天 08:42",
  },
  {
    id: "h-3",
    title: "聊天工作区壳层",
    subtitle: "目录区、聊天区和输入区已经完成首版接线。",
    time: "昨天 21:30",
  },
];

export const WORKSPACE_SCHEDULES: WorkspaceScheduleItem[] = [
  { id: "s-1", title: "晨报汇总", subtitle: "每天 09:00 推送到团队频道", enabled: true, tone: "online" },
  { id: "s-2", title: "渠道巡检", subtitle: "每小时检查一次绑定状态", enabled: false, tone: "offline" },
  { id: "s-3", title: "需求回顾提醒", subtitle: "每周五 16:30 触发", enabled: true, tone: "busy" },
];

export const WORKSPACE_WORKBENCH: WorkspaceWorkbenchItem[] = [
  { id: "w-1", title: "首页评审", detail: "确认三栏比例、建议卡和输入区是否贴近图 1。", time: "09:18" },
  { id: "w-2", title: "目录收敛", detail: "压缩目录区卡片数量与圆角、边框和阴影存在感。", time: "08:56" },
];

export const WORKSPACE_MEMORY_ITEMS: WorkspaceResourceItem[] = [
  { id: "m-1", title: "首页记忆", subtitle: "记录聊天首页默认状态以图 1 为准。", tag: "Focus" },
  { id: "m-2", title: "频道说明", subtitle: "后续绑定接入时需要的提示文案与说明块。", tag: "Pinned" },
];

export const WORKSPACE_SKILL_ITEMS: WorkspaceResourceItem[] = [
  { id: "sk-1", title: "文档整理", subtitle: "把需求和阶段说明整理成结构化记录。", tag: "Installed" },
  { id: "sk-2", title: "渠道接待", subtitle: "生成欢迎语和接待话术。", tag: "Built-in" },
  { id: "sk-3", title: "排期助手", subtitle: "输出任务和执行节奏建议。", tag: "Built-in" },
];

export const WORKSPACE_COMMAND_ITEMS: WorkspaceResourceItem[] = [
  { id: "cmd-1", title: "/summary", subtitle: "快速总结当前工作区内容。", tag: "Command" },
  { id: "cmd-2", title: "/handoff", subtitle: "生成交接说明和后续行动项。", tag: "Command" },
  { id: "cmd-3", title: "/review-ui", subtitle: "列出当前首页与截图之间的差距。", tag: "Command" },
];

export const WORKSPACE_CHANNEL_ITEMS: WorkspaceResourceItem[] = [
  { id: "ch-1", title: "微信服务号 / 默认账号", subtitle: `已为 ${MAIN_AGENT_DISPLAY_NAME} 预留绑定入口。`, tag: "已绑定" },
  { id: "ch-2", title: "飞书租户 / 华东区", subtitle: "等待二维码接入与成员映射。", tag: "待接入" },
];

export const WORKSPACE_TOOLS: WorkspaceToolItem[] = [
  { id: "tool-1", title: "浏览器检查", description: "查看本地页面与控制台诊断状态。", enabled: true },
  { id: "tool-2", title: "文档导出", description: "整理阶段说明与交付备注。", enabled: true },
  { id: "tool-3", title: "频道调试", description: "预留后续接入频道命令时的诊断能力。", enabled: false },
];

export function buildWorkspaceLogs(logs: LogEntry[]) {
  return logs.slice(-8).reverse().map((entry, index) => ({
    id: `log-${index}`,
    title: entry.humanized || entry.message,
    subtitle: `[${entry.level}] ${entry.time}`,
  }));
}
