import type {
  WorkspaceAgentToolConfig,
  WorkspaceGatewaySkillStatusEntry,
  WorkspaceInstalledSkillInfo,
  WorkspaceResourceItem,
  WorkspaceSkillOption,
  WorkspaceToolCategory,
  WorkspaceToolCategoryCount,
  WorkspaceToolGroup,
  WorkspaceToolItem,
  WorkspaceToolOption,
} from "./workspaceCloneTypes";

export interface WorkspaceCoreToolDefinition {
  id: string;
  title: string;
  description: string;
  category: Exclude<WorkspaceToolCategory, "all">;
  categoryLabel: string;
}

const TOOL_CATEGORY_LABELS: Record<Exclude<WorkspaceToolCategory, "all">, string> = {
  fs: "文件",
  runtime: "运行时",
  web: "网页",
  memory: "记忆",
  sessions: "会话",
  messaging: "消息",
  ui: "界面",
  automation: "自动化",
  nodes: "节点",
  other: "其他",
};

const TOOL_CATEGORY_ORDER: Array<Exclude<WorkspaceToolCategory, "all">> = [
  "fs",
  "runtime",
  "web",
  "memory",
  "sessions",
  "messaging",
  "ui",
  "automation",
  "nodes",
  "other",
];

export const WORKSPACE_CORE_TOOL_DEFINITIONS: WorkspaceCoreToolDefinition[] = [
  { id: "read", title: "read", description: "读取文件内容", category: "fs", categoryLabel: TOOL_CATEGORY_LABELS.fs },
  { id: "write", title: "write", description: "创建或覆盖文件", category: "fs", categoryLabel: TOOL_CATEGORY_LABELS.fs },
  { id: "edit", title: "edit", description: "精确编辑文件", category: "fs", categoryLabel: TOOL_CATEGORY_LABELS.fs },
  { id: "apply_patch", title: "apply_patch", description: "应用补丁，多块编辑", category: "fs", categoryLabel: TOOL_CATEGORY_LABELS.fs },
  { id: "exec", title: "exec", description: "执行 shell 命令", category: "runtime", categoryLabel: TOOL_CATEGORY_LABELS.runtime },
  { id: "process", title: "process", description: "管理后台进程", category: "runtime", categoryLabel: TOOL_CATEGORY_LABELS.runtime },
  { id: "web_search", title: "web_search", description: "网页搜索", category: "web", categoryLabel: TOOL_CATEGORY_LABELS.web },
  { id: "web_fetch", title: "web_fetch", description: "抓取网页内容", category: "web", categoryLabel: TOOL_CATEGORY_LABELS.web },
  { id: "memory_search", title: "memory_search", description: "记忆语义搜索", category: "memory", categoryLabel: TOOL_CATEGORY_LABELS.memory },
  { id: "memory_get", title: "memory_get", description: "读取记忆文件", category: "memory", categoryLabel: TOOL_CATEGORY_LABELS.memory },
  { id: "sessions_list", title: "sessions_list", description: "会话列表", category: "sessions", categoryLabel: TOOL_CATEGORY_LABELS.sessions },
  { id: "sessions_history", title: "sessions_history", description: "会话历史", category: "sessions", categoryLabel: TOOL_CATEGORY_LABELS.sessions },
  { id: "sessions_send", title: "sessions_send", description: "发送会话消息", category: "sessions", categoryLabel: TOOL_CATEGORY_LABELS.sessions },
  { id: "sessions_spawn", title: "sessions_spawn", description: "创建会话", category: "sessions", categoryLabel: TOOL_CATEGORY_LABELS.sessions },
  { id: "session_status", title: "session_status", description: "会话状态", category: "sessions", categoryLabel: TOOL_CATEGORY_LABELS.sessions },
  { id: "message", title: "message", description: "消息发送", category: "messaging", categoryLabel: TOOL_CATEGORY_LABELS.messaging },
  { id: "browser", title: "browser", description: "浏览页面与交互结果", category: "ui", categoryLabel: TOOL_CATEGORY_LABELS.ui },
  { id: "canvas", title: "canvas", description: "画布能力", category: "ui", categoryLabel: TOOL_CATEGORY_LABELS.ui },
  { id: "cron", title: "cron", description: "自动化与定时任务", category: "automation", categoryLabel: TOOL_CATEGORY_LABELS.automation },
  { id: "gateway", title: "gateway", description: "访问本地网关控制能力", category: "automation", categoryLabel: TOOL_CATEGORY_LABELS.automation },
  { id: "nodes", title: "nodes", description: "节点能力", category: "nodes", categoryLabel: TOOL_CATEGORY_LABELS.nodes },
  { id: "agents_list", title: "agents_list", description: "读取 Agent 列表", category: "other", categoryLabel: TOOL_CATEGORY_LABELS.other },
  { id: "image", title: "image", description: "图像理解与生成", category: "other", categoryLabel: TOOL_CATEGORY_LABELS.other },
];

export const WORKSPACE_TOOL_GROUPS: Record<string, string[]> = {
  "group:memory": ["memory_search", "memory_get"],
  "group:web": ["web_search", "web_fetch"],
  "group:fs": ["read", "write", "edit", "apply_patch"],
  "group:runtime": ["exec", "process"],
  "group:sessions": ["sessions_list", "sessions_history", "sessions_send", "sessions_spawn", "session_status"],
  "group:ui": ["browser", "canvas"],
  "group:automation": ["cron", "gateway"],
  "group:messaging": ["message"],
  "group:nodes": ["nodes"],
  "group:openclaw": [
    "browser",
    "canvas",
    "nodes",
    "cron",
    "message",
    "gateway",
    "agents_list",
    "sessions_list",
    "sessions_history",
    "sessions_send",
    "sessions_spawn",
    "session_status",
    "memory_search",
    "memory_get",
    "web_search",
    "web_fetch",
    "image",
  ],
};

export const WORKSPACE_TOOL_PROFILES: Record<string, { allow?: string[]; deny?: string[] }> = {
  minimal: {
    allow: ["session_status"],
  },
  coding: {
    allow: ["group:fs", "group:runtime", "group:sessions", "group:memory", "image"],
  },
  messaging: {
    allow: ["group:messaging", "sessions_list", "sessions_history", "sessions_send", "session_status"],
  },
  full: {},
};

const CORE_TOOL_NAME_SET = new Set(WORKSPACE_CORE_TOOL_DEFINITIONS.map((item) => item.id));

function getToolProfileLabel(profile?: string | null) {
  switch ((profile || "").trim()) {
    case "full":
      return "全量";
    case "coding":
      return "coding";
    case "messaging":
      return "messaging";
    case "minimal":
      return "minimal";
    default:
      return "";
  }
}

export function normalizeWorkspaceStringList(values: string[]) {
  const seen = new Set<string>();
  const normalized: string[] = [];

  for (const value of values) {
    const trimmed = value.trim();
    if (!trimmed || seen.has(trimmed)) {
      continue;
    }
    seen.add(trimmed);
    normalized.push(trimmed);
  }

  return normalized;
}

function normalizeSkillName(value: string) {
  return value.trim().toLowerCase().replace(/[^a-z0-9]+/g, "");
}

function expandToolGroups(values: string[]) {
  const expanded: string[] = [];

  for (const value of normalizeWorkspaceStringList(values)) {
    const groupValues = WORKSPACE_TOOL_GROUPS[value];
    if (groupValues) {
      expanded.push(...groupValues);
      continue;
    }
    expanded.push(value);
  }

  return normalizeWorkspaceStringList(expanded);
}

export function getWorkspaceToolProfileLabel(config: WorkspaceAgentToolConfig | null | undefined) {
  const explicitLabel = getToolProfileLabel(config?.profile);
  if (explicitLabel) {
    return explicitLabel;
  }

  const selectedCount = buildSelectedToolIds(config).length;
  if (selectedCount === WORKSPACE_CORE_TOOL_DEFINITIONS.length) {
    return "全量";
  }

  return selectedCount > 0 ? "自定义" : "空白";
}

export function buildSelectedToolIds(config: WorkspaceAgentToolConfig | null | undefined) {
  const profile = config?.profile?.trim() || "";
  const allow = config?.allow ?? [];
  const alsoAllow = config?.alsoAllow ?? [];
  const deny = config?.deny ?? [];

  let selected = WORKSPACE_CORE_TOOL_DEFINITIONS.map((item) => item.id);
  if (profile && profile !== "full") {
    const profilePolicy = WORKSPACE_TOOL_PROFILES[profile];
    selected = expandToolGroups(profilePolicy?.allow ?? []);
  } else if (allow.length > 0 || alsoAllow.length > 0) {
    selected = expandToolGroups(allow);
  }

  if (alsoAllow.length > 0) {
    selected = normalizeWorkspaceStringList([...selected, ...expandToolGroups(alsoAllow)]);
  }

  const denied = new Set(expandToolGroups(deny));
  return selected.filter((item) => !denied.has(item));
}

export function buildToolOptions(config: WorkspaceAgentToolConfig | null | undefined): WorkspaceToolOption[] {
  const selectedIds = new Set(buildSelectedToolIds(config));
  const configuredUnknownIds = [...selectedIds].filter((id) => !CORE_TOOL_NAME_SET.has(id));

  const baseOptions = WORKSPACE_CORE_TOOL_DEFINITIONS.map<WorkspaceToolOption>((item) => ({
    id: item.id,
    title: item.title,
    description: item.description,
    tag: "Core",
    category: item.category,
    categoryLabel: item.categoryLabel,
    groupKey: item.category,
    groupLabel: item.categoryLabel,
    selected: selectedIds.has(item.id),
  }));

  const syntheticOptions = configuredUnknownIds.map<WorkspaceToolOption>((id) => ({
    id,
    title: id,
    description: "当前配置中存在的额外工具。",
    tag: "Configured",
    category: "other",
    categoryLabel: TOOL_CATEGORY_LABELS.other,
    groupKey: "other",
    groupLabel: TOOL_CATEGORY_LABELS.other,
    selected: true,
  }));

  return [...baseOptions, ...syntheticOptions];
}

export function buildToolCategoryCounts(options: WorkspaceToolOption[]): WorkspaceToolCategoryCount[] {
  return TOOL_CATEGORY_ORDER
    .map((key) => ({
      key,
      label: TOOL_CATEGORY_LABELS[key],
      count: options.filter((item) => item.category === key).length,
    }))
    .filter((item) => item.count > 0);
}

export function buildVisibleToolGroups(
  options: WorkspaceToolOption[],
  category: WorkspaceToolCategory,
): WorkspaceToolGroup[] {
  const visibleOptions = category === "all" ? options : options.filter((item) => item.category === category);

  return TOOL_CATEGORY_ORDER
    .map((key) => {
      const tools = visibleOptions.filter((item) => item.groupKey === key);
      if (tools.length === 0) {
        return null;
      }

      return {
        key,
        label: TOOL_CATEGORY_LABELS[key],
        tools,
      } satisfies WorkspaceToolGroup;
    })
    .filter((item): item is WorkspaceToolGroup => Boolean(item));
}

export function buildToolSummaryItems(options: WorkspaceToolOption[]): WorkspaceToolItem[] {
  return options.map((item) => ({
    id: item.id,
    title: item.title,
    description: item.description,
    enabled: item.selected,
    tag: item.tag,
  }));
}

export function buildSkillOptions(params: {
  selectedSkillNames: string[];
  statusEntries?: WorkspaceGatewaySkillStatusEntry[];
  installedSkills?: WorkspaceInstalledSkillInfo[];
}): WorkspaceSkillOption[] {
  const normalizedSelectedNames = normalizeWorkspaceStringList(params.selectedSkillNames);
  const selectedIds = new Set(normalizedSelectedNames.map((item) => normalizeSkillName(item)));
  const map = new Map<string, WorkspaceSkillOption>();

  for (const entry of params.statusEntries ?? []) {
    const key = normalizeSkillName(entry.name);
    const tag = entry.disabled
      ? "Disabled"
      : entry.blockedByAllowlist
        ? "Blocked"
        : entry.bundled
          ? "Built-in"
          : "Installed";
    map.set(key, {
      id: entry.name,
      title: entry.name,
      description: entry.description || "该技能暂无额外说明。",
      tag,
      category: entry.bundled ? "builtIn" : "installed",
      selected: selectedIds.has(key),
    });
  }

  for (const entry of params.installedSkills ?? []) {
      const key = normalizeSkillName(entry.name);
      if (map.has(key)) {
        continue;
      }
      map.set(key, {
        id: entry.name,
        title: entry.name,
        description: entry.description || "本地已安装技能。",
        tag: "Installed",
        category: "installed",
        selected: selectedIds.has(key),
      });
  }

  for (const skillName of normalizedSelectedNames) {
    const key = normalizeSkillName(skillName);
    if (map.has(key)) {
      continue;
    }
    map.set(key, {
      id: skillName,
      title: skillName,
      description: "当前 Agent 配置中已选中，但当前列表里未找到该技能。",
      tag: "Configured",
      category: "installed",
      selected: true,
    });
  }

  return [...map.values()].sort((left, right) => {
    if (left.selected !== right.selected) {
      return left.selected ? -1 : 1;
    }
    return left.title.localeCompare(right.title);
  });
}

export function buildSkillSummaryItems(options: WorkspaceSkillOption[]): WorkspaceResourceItem[] {
  return options.map((item) => ({
    id: item.id,
    title: item.title,
    subtitle: item.description,
    tag: item.selected ? "已启用" : item.tag,
  }));
}
