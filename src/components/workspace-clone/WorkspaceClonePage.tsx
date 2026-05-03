// Copyright (C) 2026 shiyuan
// SPDX-License-Identifier: GPL-3.0-only
// This file is part of DragonClaw. See LICENSE for details.
import { lazy, Suspense, useCallback, useEffect, useMemo, useRef, useState } from "react";
import { invoke } from "@tauri-apps/api/core";
import { motion } from "framer-motion";
import { resolveWorkspaceAgentDisplayName } from "../../data/agencyRoster";
import type {
  CurrentConfig,
  LogEntry,
  ProviderInfo,
  SavedProvider,
  WorkspaceChannelId,
  WorkspaceEntityType,
  WorkspaceMenuKey,
} from "../../types";
import { useFeedback } from "../../hooks/useFeedback";
import { useWorkspaceGatewayChat } from "../../hooks/useWorkspaceGatewayChat";
import { formatUptime } from "../../utils/log-humanizer";
import {
  buildWorkspaceEntities,
  buildWorkspaceLogs,
  WORKSPACE_COMMAND_ITEMS,
  WORKSPACE_HISTORY,
  WORKSPACE_MENU_ITEMS,
  WORKSPACE_SCHEDULES,
  WORKSPACE_TYPE_TABS,
  WORKSPACE_WORKBENCH,
} from "./workspaceCloneData";
import { formatAgentAvatar, isGatewaySkillStatusResult } from "./workspaceCloneGateway";
import { WorkspaceCloneChatView } from "./WorkspaceCloneChatView";
import { WorkspaceCloneComposer } from "./WorkspaceCloneComposer";
import { WorkspaceCloneDirectory } from "./WorkspaceCloneDirectory";
import { WorkspaceCloneHeader } from "./WorkspaceCloneHeader";
import { WorkspaceCloneScenePresetSwitcher } from "./WorkspaceCloneScenePresetSwitcher";
import { WorkspaceCloneSidebar } from "./WorkspaceCloneSidebar";
import {
  buildWorkspaceScenePresetStateKey,
  loadWorkspaceScenePresetOpenState,
  persistWorkspaceScenePresetOpenState,
  resolveWorkspaceScenePresetOpenState,
  updateWorkspaceScenePresetOpenState,
} from "./workspaceCloneScenePresetState";
import { useWorkspaceChannels } from "./useWorkspaceChannels";
import type {
  WorkspaceEntity,
  WorkspaceAgentSkillConfig,
  WorkspaceAgentSkillSaveResult,
  WorkspaceAgentToolConfig,
  WorkspaceGatewaySkillStatusResult,
  WorkspaceInstalledSkillInfo,
  WorkspaceMemoryFile,
  WorkspaceRelatedResource,
  WorkspaceResourceItem,
  WorkspaceSkillCategory,
  WorkspaceSkillOption,
  WorkspaceSessionSectionKey,
  WorkspaceSidebarAdminPanel,
  WorkspaceToolCategory,
  WorkspaceToolItem,
  WorkspaceToolOption,
  WorkspaceUtilityPanel,
} from "./workspaceCloneTypes";

const WorkspaceCloneEmployeesView = lazy(() =>
  import("./WorkspaceCloneEmployeesView").then((module) => ({ default: module.WorkspaceCloneEmployeesView })),
);
const WorkspaceCloneSkillsMarketView = lazy(() =>
  import("./WorkspaceCloneSkillsMarketView").then((module) => ({ default: module.WorkspaceCloneSkillsMarketView })),
);
const WorkspaceCloneOverlayStack = lazy(() =>
  import("./WorkspaceCloneOverlayStack").then((module) => ({ default: module.WorkspaceCloneOverlayStack })),
);
const WorkspaceCloneModelConfigModal = lazy(() =>
  import("./WorkspaceCloneModelConfigModal").then((module) => ({ default: module.WorkspaceCloneModelConfigModal })),
);

export interface WorkspaceClonePageProps {
  running: boolean;
  loading: boolean;
  servicePort: number;
  gatewayToken?: string | null;
  uptime: number;
  currentModelName: string;
  currentProviderName: string;
  currentConfig: CurrentConfig | null;
  configVersion: number;
  providers: ProviderInfo[];
  workspacePath: string;
  logs: LogEntry[];
  handleStart: () => void;
  handleStop: () => void;
  refreshCurrentConfig: () => Promise<CurrentConfig>;
  handleSetModel: (modelId: string) => Promise<void>;
  handleUpsertSavedProviderConfig: (payload: {
    providerKey: string;
    displayName?: string | null;
    baseUrl: string;
    api: string;
    apiKey: string;
    modelId: string;
    modelOptions?: string[];
  }) => Promise<string>;
  handleDeleteSavedProviderConfig: (providerKey: string) => Promise<string>;
}

const COMPACT_COPY: Record<Exclude<WorkspaceMenuKey, "chat" | "employees">, { title: string; description: string; bullets: string[] }> = {
  schedule: {
    title: "定时任务工作区骨架",
    description: "这里先保留定时任务栏目结构与信息节奏，后续再逐步迁移真实调度能力。",
    bullets: ["后续迁移任务列表、启停状态和调度设置。", "当前仅保留标题、说明卡片和状态占位。"],
  },
  knowledge: {
    title: "知识库管理工作区骨架",
    description: "先保留知识类工作区的分区结构，为后续资料树、上传区和知识面板预留接口位置。",
    bullets: ["占位卡片模拟知识源、文档集和索引状态。", "本次不接入任何真实文档或后端命令。"],
  },
  skills: {
    title: "技能市场工作区骨架",
    description: "保留技能市场的栏目名称、区块层级和卡片节奏，但暂不接入安装、搜索或管理逻辑。",
    bullets: ["为后续迁移技能列表、筛选和安装入口预留空间。", "当前仅展示静态推荐卡片和说明文案。"],
  },
  tasks: {
    title: "产品落地工作区骨架",
    description: "保留产品落地栏目的主体结构，为后续承接项目编排、分阶段推进和结果沉淀预留骨架。",
    bullets: ["当前不提供真实任务流。", "后续按 DragonClaw 的能力逐项接入。"],
  },
};

function formatRecentLabel(timestamp?: number | null) {
  if (!timestamp) {
    return "主会话";
  }

  const date = new Date(timestamp);
  return `最近活跃 ${new Intl.DateTimeFormat("zh-CN", {
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
  }).format(date)}`;
}

function resolveWorkspaceModelName(currentConfig: CurrentConfig | null, fallbackModelName: string) {
  const primaryModel = currentConfig?.model || fallbackModelName;
  if (!primaryModel) {
    return fallbackModelName;
  }
  return primaryModel.includes("/") ? primaryModel.split("/").slice(1).join("/") : primaryModel;
}

function normalizeWorkspaceStringList(values: string[]) {
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

function buildWorkspaceMemoryResourceItems(files: WorkspaceMemoryFile[]): WorkspaceResourceItem[] {
  return [...files]
    .sort((left, right) => left.displayName.localeCompare(right.displayName, "zh-CN", { sensitivity: "base" }))
    .map((file) => ({
      id: file.id,
      title: file.displayName,
      subtitle: file.summary,
      tag: file.isFocus ? "重点" : file.exists ? undefined : "待创建",
    }));
}

function buildSkillSummaryItems(options: WorkspaceSkillOption[]): WorkspaceResourceItem[] {
  return options.map((item) => ({
    id: item.id,
    title: item.title,
    subtitle: item.description,
    tag: item.selected ? "已启用" : item.tag,
  }));
}

function buildToolSummaryItems(options: WorkspaceToolOption[]): WorkspaceToolItem[] {
  return options.map((item) => ({
    id: item.id,
    title: item.title,
    description: item.description,
    enabled: item.selected,
    tag: item.selected ? "已启用" : item.tag,
  }));
}

/* function WorkspaceCloneSectionFallback({ label }: { label: string }) {
  return (
    <section className="workspace-clone__loading-shell" aria-busy="true" aria-label={`${label} 加载中`}>
      <div className="workspace-clone__loading-panel">
        <div className="workspace-clone__loading-kicker">{label}</div>
        <div className="workspace-clone__loading-lines" aria-hidden="true">
          <span className="workspace-clone__loading-line workspace-clone__loading-line--wide" />
          <span className="workspace-clone__loading-line workspace-clone__loading-line--full" />
          <span className="workspace-clone__loading-line workspace-clone__loading-line--full" />
          <span className="workspace-clone__loading-line workspace-clone__loading-line--medium" />
        </div>
        <div className="workspace-clone__loading-footer" aria-hidden="true">
          <span className="workspace-clone__loading-divider" />
          <span className="workspace-clone__loading-chevron" />
        </div>
      </div>
    </section>
  );
}

*/

function WorkspaceCloneSectionFallback({ label }: { label: string }) {
  return (
    <section className="workspace-clone__loading-shell" aria-busy="true" aria-label={`${label} loading`}>
      <div className="workspace-clone__loading-panel">
        <div className="workspace-clone__loading-kicker">{label}</div>
        <div className="workspace-clone__loading-lines" aria-hidden="true">
          <span className="workspace-clone__loading-line workspace-clone__loading-line--wide" />
          <span className="workspace-clone__loading-line workspace-clone__loading-line--full" />
          <span className="workspace-clone__loading-line workspace-clone__loading-line--full" />
          <span className="workspace-clone__loading-line workspace-clone__loading-line--medium" />
        </div>
        <div className="workspace-clone__loading-footer" aria-hidden="true">
          <span className="workspace-clone__loading-divider" />
          <span className="workspace-clone__loading-chevron" />
        </div>
      </div>
    </section>
  );
}

function WorkspaceCloneLazyFallback({ label }: { label: string }) {
  const isEmployeesLabel = label === "数字员工" || label.includes("鏁") || label.includes("数");
  const isSkillsLabel = label === "技能市场" || label.includes("鎶") || label.includes("技");
  const isModelConfigLabel = label === "模型配置" || label.includes("妯") || label.includes("模");
  const normalizedLabel = isEmployeesLabel ? "数字员工" : isSkillsLabel ? "技能市场" : label;

  if (!isModelConfigLabel) {
    return <WorkspaceCloneSectionFallback label={normalizedLabel} />;
  }

  return (
    <div className="workspace-clone__compact-panel">
      <div className="workspace-clone__compact-hero">
        <div className="workspace-clone__compact-badge">{label}</div>
        <h1>正在加载</h1>
        <p>页面资源准备中，请稍候。</p>
      </div>
    </div>
  );
}

function buildGatewayAgentEntities(params: {
  agents: NonNullable<ReturnType<typeof useWorkspaceGatewayChat>["agents"]>;
  selectedAgentId: string;
  currentSessionKey: string;
  currentMainSession: ReturnType<typeof useWorkspaceGatewayChat>["currentMainSession"];
  sessionsResult: ReturnType<typeof useWorkspaceGatewayChat>["sessionsResult"];
  running: boolean;
  isGenerating: boolean;
  currentModelName: string;
  currentProviderName: string;
}) {
  const {
    agents,
    selectedAgentId,
    currentSessionKey,
    currentMainSession,
    sessionsResult,
    running,
    isGenerating,
    currentModelName,
    currentProviderName,
  } = params;

  return agents.map<WorkspaceEntity>((agent) => {
    const sessionKey = `agent:${agent.id}:main`;
    const isAgentSessionActive = currentSessionKey.startsWith(`agent:${agent.id}:`);
    const mainSession = sessionsResult?.sessions.find((session) => session.key === sessionKey) ?? null;
    const modelLabel =
      [mainSession?.modelProvider || currentProviderName, mainSession?.model || currentModelName]
        .filter(Boolean)
        .join(" / ") || "OpenClaw 主会话";

    return {
      id: agent.id,
      entityType: "agents",
      name: resolveWorkspaceAgentDisplayName(
        agent.id,
        agent.identity?.name?.trim() || agent.name?.trim() || agent.id,
      ),
      searchText: [agent.id, agent.identity?.name?.trim(), agent.name?.trim()]
        .filter(Boolean)
        .join(" "),
      subtitle:
        !running
          ? "待命中"
          : isGenerating && isAgentSessionActive
            ? "生成中"
            : formatRecentLabel(mainSession?.updatedAt),
      status:
        !running
          ? "offline"
          : isGenerating && isAgentSessionActive
            ? "busy"
            : agent.id === selectedAgentId && currentMainSession?.abortedLastRun
              ? "busy"
              : "online",
      avatarLabel: formatAgentAvatar(agent),
      accent: agent.id,
      currentWork:
        !running
          ? "服务尚未启动，首页聊天暂不可用。"
          : isGenerating && isAgentSessionActive
            ? "正在生成当前主会话回复。"
            : "首页已接入当前 Agent 的主会话。",
      recentOutput: modelLabel,
    };
  });
}

export function WorkspaceClonePage({
  running,
  servicePort,
  gatewayToken,
  uptime,
  currentModelName,
  currentProviderName,
  currentConfig,
  configVersion,
  providers,
  logs,
  handleStart,
  refreshCurrentConfig,
  handleSetModel,
  handleUpsertSavedProviderConfig,
  handleDeleteSavedProviderConfig,
}: WorkspaceClonePageProps) {
  const { pushFeedback } = useFeedback();
  const [activeMenu, setActiveMenu] = useState<WorkspaceMenuKey>("chat");
  const [activeType, setActiveType] = useState<WorkspaceEntityType>("agents");
  const [selectedEntityId, setSelectedEntityId] = useState("main");
  const [isSidebarCollapsed, setIsSidebarCollapsed] = useState(false);
  const [isDirectoryCollapsed, setIsDirectoryCollapsed] = useState(false);
  const [searchQuery, setSearchQuery] = useState("");
  const [composerDraft, setComposerDraft] = useState("");
  const [utilityPanel, setUtilityPanel] = useState<WorkspaceUtilityPanel>(null);
  const [activeSessionSection, setActiveSessionSection] = useState<WorkspaceSessionSectionKey>("model");
  const [adminOpen, setAdminOpen] = useState(false);
  const [adminPanel, setAdminPanel] = useState<WorkspaceSidebarAdminPanel>(null);
  const [showAgentInfo, setShowAgentInfo] = useState(false);
  const [showMemoryModal, setShowMemoryModal] = useState(false);
  const [showSkillsModal, setShowSkillsModal] = useState(false);
  const [showToolsModal, setShowToolsModal] = useState(false);
  const [showRuntimeLogDetail, setShowRuntimeLogDetail] = useState(false);
  const [showSettingsTextPreview, setShowSettingsTextPreview] = useState(false);
  const [relatedResource, setRelatedResource] = useState<WorkspaceRelatedResource>(null);
  const [isModelConfigOpen, setIsModelConfigOpen] = useState(false);
  const [savedProviders, setSavedProviders] = useState<SavedProvider[]>([]);
  const [savedProvidersLoading, setSavedProvidersLoading] = useState(false);
  const [memoryFiles, setMemoryFiles] = useState<WorkspaceMemoryFile[]>([]);
  const [selectedMemoryFileId, setSelectedMemoryFileId] = useState("agents.md");
  const [memoryDraftContent, setMemoryDraftContent] = useState("");
  const [memoryLoading, setMemoryLoading] = useState(false);
  const [memorySaving, setMemorySaving] = useState(false);
  const [memoryNotice, setMemoryNotice] = useState("");
  const [memoryError, setMemoryError] = useState("");
  const [skillOptions, setSkillOptions] = useState<WorkspaceSkillOption[]>([]);
  const [skillSearch, setSkillSearch] = useState("");
  const [skillCategory, setSkillCategory] = useState<WorkspaceSkillCategory>("builtIn");
  const [skillDraftIds, setSkillDraftIds] = useState<string[]>([]);
  const [skillLoading, setSkillLoading] = useState(false);
  const [skillSaving, setSkillSaving] = useState(false);
  const [skillNotice, setSkillNotice] = useState("");
  const [skillError, setSkillError] = useState("");
  const [toolOptions, setToolOptions] = useState<WorkspaceToolOption[]>([]);
  const [toolCategory, setToolCategory] = useState<WorkspaceToolCategory>("all");
  const [toolProfileLabel, setToolProfileLabel] = useState("全量");
  const [toolDraftIds, setToolDraftIds] = useState<string[]>([]);
  const [toolLoading, setToolLoading] = useState(false);
  const [toolSaving, setToolSaving] = useState(false);
  const [toolNotice, setToolNotice] = useState("");
  const [toolError, setToolError] = useState("");
  const [scenePresetOpenStateByKey, setScenePresetOpenStateByKey] = useState<Record<string, boolean>>(
    () => loadWorkspaceScenePresetOpenState(),
  );
  const homepageChat = useWorkspaceGatewayChat({ running, servicePort, gatewayToken });
  const currentAgentIdRef = useRef<string | null>(null);
  const memoryLoadSeqRef = useRef(0);
  const skillLoadSeqRef = useRef(0);
  const toolLoadSeqRef = useRef(0);
  const savedProvidersLoadSeqRef = useRef(0);
  const modelConfigOpenRef = useRef(false);
  const showDirectory = activeMenu === "chat";
  const channelDataEnabled =
    showDirectory &&
    (activeType === "channels" || relatedResource === "channel" || (utilityPanel === "session" && activeSessionSection === "channel"));
  const workspaceChannels = useWorkspaceChannels({ configVersion, enabled: channelDataEnabled });
  const { setContextMenu } = workspaceChannels;

  const refreshSavedProviders = useCallback(async () => {
    const requestId = savedProvidersLoadSeqRef.current + 1;
    savedProvidersLoadSeqRef.current = requestId;
    const nextProviders = await invoke<SavedProvider[]>("list_saved_providers");
    if (savedProvidersLoadSeqRef.current === requestId && modelConfigOpenRef.current) {
      setSavedProviders(nextProviders);
    }
  }, []);

  useEffect(() => {
    persistWorkspaceScenePresetOpenState(scenePresetOpenStateByKey);
  }, [scenePresetOpenStateByKey]);

  useEffect(() => {
    modelConfigOpenRef.current = isModelConfigOpen;
  }, [isModelConfigOpen]);

  const workspaceModelName = useMemo(
    () => resolveWorkspaceModelName(currentConfig, currentModelName),
    [currentConfig, currentModelName],
  );

  const workspaceProviderName = useMemo(() => {
    const primaryProviderKey = currentConfig?.provider;
    if (!primaryProviderKey) {
      return currentProviderName;
    }

    const savedProvider = savedProviders.find((item) => item.name === primaryProviderKey);
    return savedProvider?.display_name || currentProviderName || primaryProviderKey;
  }, [currentConfig, currentProviderName, savedProviders]);

  const staticEntitiesByType = useMemo(
    () => buildWorkspaceEntities(workspaceModelName, workspaceProviderName, running),
    [workspaceModelName, workspaceProviderName, running],
  );

  const gatewayAgentEntities = useMemo(
    () =>
      homepageChat.agents.length > 0
        ? buildGatewayAgentEntities({
            agents: homepageChat.agents,
            selectedAgentId: homepageChat.selectedAgentId,
            currentSessionKey: homepageChat.currentSessionKey,
            currentMainSession: homepageChat.currentMainSession,
            sessionsResult: homepageChat.sessionsResult,
            running,
            isGenerating: homepageChat.isGenerating,
            currentModelName: workspaceModelName,
            currentProviderName: workspaceProviderName,
          })
        : staticEntitiesByType.agents,
    [
      workspaceModelName,
      workspaceProviderName,
      homepageChat.agents,
      homepageChat.currentMainSession,
      homepageChat.currentSessionKey,
      homepageChat.isGenerating,
      homepageChat.selectedAgentId,
      homepageChat.sessionsResult,
      running,
      staticEntitiesByType.agents,
    ],
  );

  const entitiesByType = useMemo(
    () => ({
      ...staticEntitiesByType,
      agents: gatewayAgentEntities,
      channels: workspaceChannels.channelEntities,
    }),
    [gatewayAgentEntities, staticEntitiesByType, workspaceChannels.channelEntities],
  );

  const filteredEntities = useMemo(() => {
    const source = entitiesByType[activeType];
    const query = searchQuery.trim().toLowerCase();
    if (!query) return source;
    return source.filter((entity) =>
      `${entity.name} ${entity.searchText || ""} ${entity.subtitle}`.toLowerCase().includes(query),
    );
  }, [activeType, entitiesByType, searchQuery]);

  useEffect(() => {
    if (activeType === "agents" && homepageChat.selectedAgentId && selectedEntityId !== homepageChat.selectedAgentId) {
      setSelectedEntityId(homepageChat.selectedAgentId);
      return;
    }

    const nextEntity = filteredEntities[0];
    if (!filteredEntities.some((entity) => entity.id === selectedEntityId)) {
      setSelectedEntityId(nextEntity?.id || "");
    }
  }, [activeType, filteredEntities, homepageChat.selectedAgentId, selectedEntityId]);

  useEffect(() => {
    if (activeMenu !== "chat") {
      memoryLoadSeqRef.current += 1;
      skillLoadSeqRef.current += 1;
      toolLoadSeqRef.current += 1;
      savedProvidersLoadSeqRef.current += 1;
      modelConfigOpenRef.current = false;
      setUtilityPanel(null);
      setContextMenu(null);
      setRelatedResource(null);
      setShowAgentInfo(false);
      setShowMemoryModal(false);
      setShowSkillsModal(false);
      setShowToolsModal(false);
      setMemoryLoading(false);
      setMemorySaving(false);
      setMemoryNotice("");
      setMemoryError("");
      setSkillSearch("");
      setSkillCategory("builtIn");
      setSkillLoading(false);
      setSkillSaving(false);
      setSkillNotice("");
      setSkillError("");
      setToolCategory("all");
      setToolLoading(false);
      setToolSaving(false);
      setToolNotice("");
      setToolError("");
      setIsModelConfigOpen(false);
      setSavedProvidersLoading(false);
      setShowRuntimeLogDetail(false);
      setShowSettingsTextPreview(false);
    }
  }, [activeMenu, setContextMenu]);

  useEffect(() => {
    const handleDocumentClick = () => {
      setContextMenu(null);
      setAdminOpen(false);
      setAdminPanel(null);
    };

    const handleWindowResize = () => {
      setContextMenu(null);
    };

    document.addEventListener("click", handleDocumentClick);
    window.addEventListener("resize", handleWindowResize);
    return () => {
      document.removeEventListener("click", handleDocumentClick);
      window.removeEventListener("resize", handleWindowResize);
    };
  }, [setContextMenu]);

  const selectedEntity = useMemo(
    () => entitiesByType[activeType].find((entity) => entity.id === selectedEntityId) ?? filteredEntities[0] ?? null,
    [activeType, entitiesByType, filteredEntities, selectedEntityId],
  );

  const chatEnabled = activeType === "agents"
    || (activeType === "channels" && Boolean(selectedEntity?.runtimeAgentId));

  const chatDisabledReason = activeType === "channels" && !selectedEntity?.runtimeAgentId
    ? "channel-unbound"
    : !chatEnabled
      ? "unsupported"
      : undefined;

  const currentMemoryAgentId = useMemo(
    () => {
      if (activeType === "agents") {
        return selectedEntity?.id || selectedEntityId || homepageChat.selectedAgentId || "main";
      }
      if (activeType === "channels" && selectedEntity?.runtimeAgentId) {
        return selectedEntity.runtimeAgentId;
      }
      return null;
    },
    [activeType, homepageChat.selectedAgentId, selectedEntity?.id, selectedEntity?.runtimeAgentId, selectedEntityId],
  );

  const showScenePresetToggle = activeMenu === "chat" && activeType === "agents" && Boolean(selectedEntity?.id);
  const scenePresetStateKey = useMemo(
    () => buildWorkspaceScenePresetStateKey({
      enabled: showScenePresetToggle,
      entityType: selectedEntity?.entityType ?? null,
      entityId: selectedEntity?.id ?? null,
      sessionId: homepageChat.currentMainSession?.sessionId ?? homepageChat.currentSessionKey ?? null,
    }),
    [
      homepageChat.currentMainSession?.sessionId,
      homepageChat.currentSessionKey,
      selectedEntity?.entityType,
      selectedEntity?.id,
      showScenePresetToggle,
    ],
  );
  const scenePresetsOpen = resolveWorkspaceScenePresetOpenState(scenePresetOpenStateByKey, scenePresetStateKey);

  useEffect(() => {
    currentAgentIdRef.current = currentMemoryAgentId;
  }, [currentMemoryAgentId]);

  const toggleScenePresets = useCallback(() => {
    if (!showScenePresetToggle) {
      return;
    }

    setScenePresetOpenStateByKey((current) =>
      updateWorkspaceScenePresetOpenState(
        current,
        scenePresetStateKey,
        !resolveWorkspaceScenePresetOpenState(current, scenePresetStateKey),
      ),
    );
  }, [scenePresetStateKey, showScenePresetToggle]);

  const closeScenePresets = useCallback(() => {
    if (!showScenePresetToggle) {
      return;
    }

    setScenePresetOpenStateByKey((current) => updateWorkspaceScenePresetOpenState(current, scenePresetStateKey, false));
  }, [scenePresetStateKey, showScenePresetToggle]);

  const handleSelectScenePreset = useCallback((content: string) => {
    setComposerDraft(content);
  }, []);

  const activeMemoryFile = useMemo(
    () => memoryFiles.find((file) => file.id === selectedMemoryFileId) ?? memoryFiles[0] ?? null,
    [memoryFiles, selectedMemoryFileId],
  );

  const clearMemoryStatus = useCallback(() => {
    setMemoryNotice("");
    setMemoryError("");
  }, []);

  const clearSkillStatus = useCallback(() => {
    setSkillNotice("");
    setSkillError("");
  }, []);

  const clearToolStatus = useCallback(() => {
    setToolNotice("");
    setToolError("");
  }, []);

  useEffect(() => {
    const message = memoryNotice.trim();
    if (!message) {
      return;
    }

    pushFeedback({
      tone: "success",
      message,
      dedupeKey: "workspace-memory-notice",
      persistent: false,
    });
  }, [memoryNotice, pushFeedback]);

  useEffect(() => {
    const message = memoryError.trim();
    if (!message) {
      return;
    }

    pushFeedback({
      tone: "error",
      title: "璁板繂",
      message,
      dedupeKey: "workspace-memory-error",
      persistent: false,
      autoCloseMs: 3600,
    });
  }, [memoryError, pushFeedback]);

  useEffect(() => {
    const message = skillNotice.trim();
    if (!message) {
      return;
    }

    pushFeedback({
      tone: "success",
      message,
      dedupeKey: "workspace-skills-notice",
      persistent: false,
    });
  }, [pushFeedback, skillNotice]);

  useEffect(() => {
    const message = skillError.trim();
    if (!message) {
      return;
    }

    pushFeedback({
      tone: "error",
      title: "鎶€鑳藉簱",
      message,
      dedupeKey: "workspace-skills-error",
      persistent: false,
      autoCloseMs: 3600,
    });
  }, [pushFeedback, skillError]);

  useEffect(() => {
    const message = toolNotice.trim();
    if (!message) {
      return;
    }

    pushFeedback({
      tone: "success",
      message,
      dedupeKey: "workspace-tools-notice",
      persistent: false,
    });
  }, [pushFeedback, toolNotice]);

  useEffect(() => {
    const message = toolError.trim();
    if (!message) {
      return;
    }

    pushFeedback({
      tone: "error",
      title: "宸ュ叿鏉冮檺",
      message,
      dedupeKey: "workspace-tools-error",
      persistent: false,
      autoCloseMs: 3600,
    });
  }, [pushFeedback, toolError]);

  useEffect(() => {
    const message = workspaceChannels.modalNotice.trim();
    if (!message) {
      return;
    }

    const isWeixinProcessNotice = workspaceChannels.modal.channelId === "weixin" && (
      workspaceChannels.weixinQrStarting
      || workspaceChannels.weixinQrPolling
      || workspaceChannels.weixinQrUrl.trim().length > 0
      || workspaceChannels.hasActiveWeixinQrSession
    );
    if (isWeixinProcessNotice) {
      return;
    }

    pushFeedback({
      tone: "success",
      message,
      dedupeKey: "workspace-channel-notice",
      persistent: false,
    });
  }, [
    pushFeedback,
    workspaceChannels.hasActiveWeixinQrSession,
    workspaceChannels.modal.channelId,
    workspaceChannels.modalNotice,
    workspaceChannels.weixinQrPolling,
    workspaceChannels.weixinQrStarting,
    workspaceChannels.weixinQrUrl,
  ]);

  useEffect(() => {
    const message = workspaceChannels.modalError.trim();
    if (!message) {
      return;
    }

    pushFeedback({
      tone: "error",
      title: "棰戦亾缁戝畾",
      message,
      dedupeKey: "workspace-channel-error",
      persistent: false,
      autoCloseMs: 3600,
    });
  }, [pushFeedback, workspaceChannels.modalError]);

  const refreshMemoryFiles = useCallback(async (options?: {
    showLoading?: boolean;
    preferredId?: string;
  }) => {
    const showLoading = options?.showLoading ?? false;
    const preferredId = options?.preferredId;

    if (!currentMemoryAgentId) {
      setMemoryFiles([]);
      setSelectedMemoryFileId("");
      setMemoryDraftContent("");
      return;
    }

    if (showLoading) {
      setMemoryLoading(true);
    }

    const targetAgentId = currentMemoryAgentId;
    const requestId = memoryLoadSeqRef.current + 1;
    memoryLoadSeqRef.current = requestId;

    try {
      const memoryModule = await import("./workspaceCloneMemory");
      const snapshot = await memoryModule.loadWorkspaceMemorySnapshot(targetAgentId);
      if (memoryLoadSeqRef.current !== requestId || currentAgentIdRef.current !== targetAgentId) {
        return;
      }
      const nextFiles = snapshot.items.length > 0
        ? snapshot.items.map((item) => memoryModule.normalizeWorkspaceMemoryFile(item))
        : memoryModule.createWorkspaceFallbackMemoryFiles();
      const nextSelectedId =
        preferredId && nextFiles.some((file) => file.id === preferredId)
          ? preferredId
          : nextFiles.some((file) => file.id === selectedMemoryFileId)
            ? selectedMemoryFileId
            : nextFiles[0]?.id || "";
      const nextActiveFile = nextFiles.find((file) => file.id === nextSelectedId) ?? nextFiles[0] ?? null;

      setMemoryFiles(nextFiles);
      setSelectedMemoryFileId(nextSelectedId);
      setMemoryDraftContent(nextActiveFile?.content || "");
      setMemoryError("");
    } catch (memoryLoadError) {
      if (memoryLoadSeqRef.current !== requestId || currentAgentIdRef.current !== targetAgentId) {
        return;
      }
      setMemoryError(memoryLoadError instanceof Error ? memoryLoadError.message : "读取记忆文件失败");
      if (memoryFiles.length === 0) {
        const memoryModule = await import("./workspaceCloneMemory");
        const fallbackFiles = memoryModule.createWorkspaceFallbackMemoryFiles();
        setMemoryFiles(fallbackFiles);
        setSelectedMemoryFileId(fallbackFiles[0]?.id || "");
        setMemoryDraftContent(fallbackFiles[0]?.content || "");
      }
    } finally {
      if (showLoading && memoryLoadSeqRef.current === requestId && currentAgentIdRef.current === targetAgentId) {
        setMemoryLoading(false);
      }
    }
  }, [currentMemoryAgentId, memoryFiles.length, selectedMemoryFileId]);

  const refreshSkillOptions = useCallback(async (options?: { showLoading?: boolean }) => {
    const showLoading = options?.showLoading ?? false;
    if (!currentMemoryAgentId) {
      setSkillOptions([]);
      setSkillDraftIds([]);
      return;
    }

    if (showLoading) {
      setSkillLoading(true);
    }

    const targetAgentId = currentMemoryAgentId;
    const requestId = skillLoadSeqRef.current + 1;
    skillLoadSeqRef.current = requestId;

    try {
      const agentResources = await import("./workspaceCloneAgentResources");
      const savedConfig = await invoke<WorkspaceAgentSkillConfig>("get_agent_skill_config", {
        agentId: targetAgentId,
      });
      if (skillLoadSeqRef.current !== requestId || currentAgentIdRef.current !== targetAgentId) {
        return;
      }

      let nextOptions: WorkspaceSkillOption[] = [];
      if (homepageChat.connected) {
        const report = await homepageChat.request<WorkspaceGatewaySkillStatusResult>("skills.status", {
          agentId: targetAgentId,
        });
        if (skillLoadSeqRef.current !== requestId || currentAgentIdRef.current !== targetAgentId) {
          return;
        }
        if (!isGatewaySkillStatusResult(report)) {
          throw new Error("skills.status 返回格式不正确");
        }
        const installedSkills = await invoke<WorkspaceInstalledSkillInfo[]>("list_skills").catch(() => []);
        if (skillLoadSeqRef.current !== requestId || currentAgentIdRef.current !== targetAgentId) {
          return;
        }
        nextOptions = agentResources.buildSkillOptions({
          selectedSkillNames: savedConfig.selectedSkillNames,
          statusEntries: report.skills,
          installedSkills,
        });
      } else {
        const installedSkills = await invoke<WorkspaceInstalledSkillInfo[]>("list_skills");
        if (skillLoadSeqRef.current !== requestId || currentAgentIdRef.current !== targetAgentId) {
          return;
        }
        nextOptions = agentResources.buildSkillOptions({
          selectedSkillNames: savedConfig.selectedSkillNames,
          installedSkills,
        });
      }

      setSkillOptions(nextOptions);
      setSkillDraftIds(nextOptions.filter((item) => item.selected).map((item) => item.id));
      setSkillError("");
    } catch (skillLoadError) {
      if (skillLoadSeqRef.current !== requestId || currentAgentIdRef.current !== targetAgentId) {
        return;
      }
      setSkillError(skillLoadError instanceof Error ? skillLoadError.message : "读取技能配置失败");
      setSkillOptions((current) =>
        current.length > 0
          ? current
          : [
              {
                id: "pending",
                title: "技能配置",
                description: "未能读取真实技能配置，请稍后刷新。",
                tag: "Error",
                category: "builtIn",
                selected: false,
              },
            ],
      );
      setSkillDraftIds((current) => current);
    } finally {
      if (showLoading && skillLoadSeqRef.current === requestId && currentAgentIdRef.current === targetAgentId) {
        setSkillLoading(false);
      }
    }
  }, [currentMemoryAgentId, homepageChat.connected, homepageChat.request]);

  const refreshToolOptions = useCallback(async (options?: { showLoading?: boolean }) => {
    const showLoading = options?.showLoading ?? false;
    if (!currentMemoryAgentId) {
      setToolOptions([]);
      setToolProfileLabel("全量");
      setToolDraftIds([]);
      return;
    }

    if (showLoading) {
      setToolLoading(true);
    }

    const targetAgentId = currentMemoryAgentId;
    const requestId = toolLoadSeqRef.current + 1;
    toolLoadSeqRef.current = requestId;

    try {
      const agentResources = await import("./workspaceCloneAgentResources");
      const config = await invoke<WorkspaceAgentToolConfig>("get_agent_tool_config", {
        agentId: targetAgentId,
      });
      if (toolLoadSeqRef.current !== requestId || currentAgentIdRef.current !== targetAgentId) {
        return;
      }
      const nextOptions = agentResources.buildToolOptions(config);
      setToolOptions(nextOptions);
      setToolProfileLabel(agentResources.getWorkspaceToolProfileLabel(config));
      setToolDraftIds(nextOptions.filter((item) => item.selected).map((item) => item.id));
      setToolError("");
    } catch (toolLoadError) {
      if (toolLoadSeqRef.current !== requestId || currentAgentIdRef.current !== targetAgentId) {
        return;
      }
      setToolError(toolLoadError instanceof Error ? toolLoadError.message : "读取工具权限失败");
      setToolOptions([]);
      setToolProfileLabel("全量");
      setToolDraftIds([]);
    } finally {
      if (showLoading && toolLoadSeqRef.current === requestId && currentAgentIdRef.current === targetAgentId) {
        setToolLoading(false);
      }
    }
  }, [currentMemoryAgentId]);

  const openMemoryModal = useCallback(() => {
    setActiveSessionSection("memory");
    setShowMemoryModal(true);
    clearMemoryStatus();
    void refreshMemoryFiles({
      showLoading: true,
      preferredId: selectedMemoryFileId || undefined,
    });
  }, [clearMemoryStatus, refreshMemoryFiles, selectedMemoryFileId]);

  const closeMemoryModal = useCallback(() => {
    memoryLoadSeqRef.current += 1;
    setShowMemoryModal(false);
    setMemoryLoading(false);
    setMemorySaving(false);
    clearMemoryStatus();
  }, [clearMemoryStatus]);

  const openSkillsModal = useCallback(() => {
    setActiveSessionSection("skills");
    setShowSkillsModal(true);
    clearSkillStatus();
    void refreshSkillOptions({ showLoading: true });
  }, [clearSkillStatus, refreshSkillOptions]);

  const closeSkillsModal = useCallback(() => {
    skillLoadSeqRef.current += 1;
    setShowSkillsModal(false);
    setSkillSearch("");
    setSkillLoading(false);
    setSkillSaving(false);
    clearSkillStatus();
  }, [clearSkillStatus]);

  const openToolsModal = useCallback(() => {
    setActiveSessionSection("tools");
    setShowToolsModal(true);
    clearToolStatus();
    void refreshToolOptions({ showLoading: true });
  }, [clearToolStatus, refreshToolOptions]);

  const closeToolsModal = useCallback(() => {
    toolLoadSeqRef.current += 1;
    setShowToolsModal(false);
    setToolLoading(false);
    setToolSaving(false);
    clearToolStatus();
  }, [clearToolStatus]);

  const handleSelectMemoryFile = useCallback((fileId: string) => {
    setSelectedMemoryFileId(fileId);
    const nextFile = memoryFiles.find((file) => file.id === fileId);
    setMemoryDraftContent(nextFile?.content || "");
  }, [memoryFiles]);

  const handleSaveMemoryFile = useCallback(async () => {
    if (!activeMemoryFile || !currentMemoryAgentId) {
      setMemoryError("请先选择一个记忆文件");
      return;
    }

    clearMemoryStatus();
    setMemorySaving(true);

    try {
      const memoryModule = await import("./workspaceCloneMemory");
      await memoryModule.saveWorkspaceMemoryFile({
        sourcePath: activeMemoryFile.sourcePath,
        content: memoryDraftContent,
        agentId: currentMemoryAgentId,
      });
      setMemoryNotice(`记忆文件已保存：${activeMemoryFile.displayName}`);
      await refreshMemoryFiles({ preferredId: activeMemoryFile.id });
    } catch (memorySaveError) {
      setMemoryError(memorySaveError instanceof Error ? memorySaveError.message : "保存记忆文件失败");
    } finally {
      setMemorySaving(false);
    }
  }, [activeMemoryFile, clearMemoryStatus, currentMemoryAgentId, memoryDraftContent, refreshMemoryFiles]);

  const handleToggleSkill = useCallback((skillId: string) => {
    setSkillDraftIds((current) =>
      current.includes(skillId)
        ? current.filter((item) => item !== skillId)
        : [...current, skillId],
    );
  }, []);

  const handleToggleTool = useCallback((toolId: string) => {
    setToolDraftIds((current) =>
      current.includes(toolId)
        ? current.filter((item) => item !== toolId)
        : [...current, toolId],
    );
  }, []);

  const handleSaveSkills = useCallback(async () => {
    if (!currentMemoryAgentId) {
      setSkillError("当前未选中 Agent");
      return;
    }

    clearSkillStatus();
    setSkillSaving(true);

    try {
      const result = await invoke<WorkspaceAgentSkillSaveResult>("save_agent_skill_config", {
        agentId: currentMemoryAgentId,
        skillNames: normalizeWorkspaceStringList(skillDraftIds),
      });
      setSkillNotice(
        result.appliesOnNextMessage
          ? "技能配置已保存，下一条消息会按新配置生效。"
          : "技能配置已保存。",
      );
      await refreshSkillOptions();
    } catch (saveError) {
      setSkillError(saveError instanceof Error ? saveError.message : "保存技能配置失败");
    } finally {
      setSkillSaving(false);
    }
  }, [clearSkillStatus, currentMemoryAgentId, refreshSkillOptions, skillDraftIds]);

  const handleSaveTools = useCallback(async () => {
    if (!currentMemoryAgentId) {
      setToolError("当前未选中 Agent");
      return;
    }

    clearToolStatus();
    setToolSaving(true);

    try {
      await invoke<WorkspaceAgentToolConfig>("save_agent_tool_config", {
        agentId: currentMemoryAgentId,
        selectedToolNames: normalizeWorkspaceStringList(toolDraftIds),
      });
      setToolNotice("工具权限已保存，下一条消息会按新权限执行。");
      await refreshToolOptions();
    } catch (saveError) {
      setToolError(saveError instanceof Error ? saveError.message : "保存工具权限失败");
    } finally {
      setToolSaving(false);
    }
  }, [clearToolStatus, currentMemoryAgentId, refreshToolOptions, toolDraftIds]);

  useEffect(() => {
    setSkillSearch("");
    setSkillCategory("builtIn");
    setToolCategory("all");
    clearSkillStatus();
    clearToolStatus();
  }, [clearSkillStatus, clearToolStatus, currentMemoryAgentId]);

  useEffect(() => {
    if (utilityPanel === "history") {
      homepageChat.loadHistoryTitles();
    }
  }, [homepageChat.loadHistoryTitles, utilityPanel]);

  const uptimeLabel = running ? formatUptime(uptime) : "未启动";
  const shouldBuildLogRows = utilityPanel === "logs" || showRuntimeLogDetail;
  const shouldBuildMemoryRows =
    showMemoryModal || relatedResource === "memory" || (utilityPanel === "session" && activeSessionSection === "memory");
  const shouldBuildSkillRows =
    showSkillsModal || relatedResource === "skills" || (utilityPanel === "session" && activeSessionSection === "skills");
  const shouldBuildToolRows =
    showToolsModal || relatedResource === "tools" || (utilityPanel === "session" && activeSessionSection === "tools");
  const shouldBuildChannelRows =
    relatedResource === "channel" || (utilityPanel === "session" && activeSessionSection === "channel");
  const derivedLogs = useMemo(() => (shouldBuildLogRows ? buildWorkspaceLogs(logs) : []), [logs, shouldBuildLogRows]);
  const memoryResourceItems = useMemo(
    () => (shouldBuildMemoryRows ? buildWorkspaceMemoryResourceItems(memoryFiles) : []),
    [memoryFiles, shouldBuildMemoryRows],
  );
  const skillResourceItems = useMemo(
    () =>
      shouldBuildSkillRows
        ? buildSkillSummaryItems(
            skillOptions.map((item) => ({
              ...item,
              selected: skillDraftIds.includes(item.id),
            })),
          )
        : [],
    [shouldBuildSkillRows, skillDraftIds, skillOptions],
  );
  const toolResourceItems = useMemo(
    () =>
      shouldBuildToolRows
        ? buildToolSummaryItems(
            toolOptions.map((item) => ({
              ...item,
              selected: toolDraftIds.includes(item.id),
            })),
          )
        : [],
    [shouldBuildToolRows, toolDraftIds, toolOptions],
  );
  const openModelConfigModal = useCallback(() => {
    modelConfigOpenRef.current = true;
    setIsModelConfigOpen(true);
    setSavedProvidersLoading(true);
    void refreshSavedProviders()
      .catch(() => undefined)
      .finally(() => {
        if (modelConfigOpenRef.current) {
          setSavedProvidersLoading(false);
        }
      });
  }, [refreshSavedProviders]);

  const closeModelConfigModal = useCallback(() => {
    savedProvidersLoadSeqRef.current += 1;
    modelConfigOpenRef.current = false;
    setIsModelConfigOpen(false);
    setSavedProvidersLoading(false);
  }, []);

  const toggleUtilityPanel = (panel: Exclude<WorkspaceUtilityPanel, null>) => {
    setUtilityPanel((current) => current === panel ? null : panel);
  };

  const openSessionPanel = (section: WorkspaceSessionSectionKey = activeSessionSection) => {
    setActiveSessionSection(section);
    setUtilityPanel("session");
  };

  const handleOpenRelatedResource = (resource: WorkspaceRelatedResource) => {
    if (!resource) return;
    if (resource === "memory") {
      openMemoryModal();
      return;
    }
    if (resource === "skills") {
      openSkillsModal();
      return;
    }
    if (resource === "tools") {
      openToolsModal();
      return;
    }
    setActiveSessionSection(resource);
    setRelatedResource(resource);
  };

  const renderCompactWorkspace = () => {
    const section = COMPACT_COPY[activeMenu as Exclude<WorkspaceMenuKey, "chat" | "employees">];
    const menuLabel = WORKSPACE_MENU_ITEMS.find((item) => item.key === activeMenu)?.label || "";

    return (
      <div className="workspace-clone__compact-panel">
        <div className="workspace-clone__compact-hero">
          <div className="workspace-clone__compact-badge">{menuLabel}</div>
          <h1>{section.title}</h1>
          <p>{section.description}</p>
        </div>
        <div className="workspace-clone__compact-grid">
          {section.bullets.map((bullet) => (
            <div key={bullet} className="workspace-clone__compact-card">
              <div className="workspace-clone__compact-card-icon">{menuLabel.slice(0, 1)}</div>
              <div>
                <strong>{menuLabel}</strong>
                <small>{bullet}</small>
              </div>
            </div>
          ))}
          <div className="workspace-clone__compact-card">
            <div className="workspace-clone__compact-card-icon">模</div>
            <div>
              <strong>当前模型</strong>
              <small>{workspaceModelName}</small>
            </div>
          </div>
          <div className="workspace-clone__compact-card">
            <div className="workspace-clone__compact-card-icon">运</div>
            <div>
              <strong>运行状态</strong>
              <small>{running ? `运行中 · ${uptimeLabel}` : "服务尚未启动，当前仅保留骨架页面。"}</small>
            </div>
          </div>
        </div>
      </div>
    );
  };

  const shouldRenderOverlayStack = Boolean(
    showAgentInfo ||
    showMemoryModal ||
    showSkillsModal ||
    showToolsModal ||
    showRuntimeLogDetail ||
    showSettingsTextPreview ||
    relatedResource,
  );
  const scheduleResourceItems = relatedResource === "schedule"
    ? WORKSPACE_SCHEDULES.map((item) => ({
        id: item.id,
        title: item.title,
        subtitle: item.subtitle,
        tag: item.enabled ? "enabled" : "disabled",
      }))
    : [];

  return (
    <motion.section
      key="workspace-clone-home"
      className="workspace-clone-shell"
      initial={{ opacity: 0, y: 8 }}
      animate={{ opacity: 1, y: 0 }}
      exit={{ opacity: 0, y: -8 }}
      transition={{ duration: 0.2 }}
    >
      <main
        className={[
          "workspace-clone",
          !showDirectory ? "workspace-clone--no-directory" : "",
          isSidebarCollapsed ? "workspace-clone--sidebar-collapsed" : "",
          showDirectory && isDirectoryCollapsed ? "workspace-clone--directory-collapsed" : "",
        ].join(" ").trim()}
      >
        <WorkspaceCloneSidebar
          menuItems={WORKSPACE_MENU_ITEMS}
          activeMenu={activeMenu}
          isCollapsed={isSidebarCollapsed}
          adminOpen={adminOpen}
          adminPanel={adminPanel}
          onSelectMenu={(key) => {
            setActiveMenu(key);
            setAdminOpen(false);
            setAdminPanel(null);
          }}
          onToggleCollapsed={() => setIsSidebarCollapsed((value) => !value)}
          onToggleAdmin={() => {
            setAdminOpen((value) => !value);
            setAdminPanel(null);
          }}
          onSelectAdminPanel={(panel) => {
            setAdminOpen(true);
            setAdminPanel(panel);
          }}
        />

        {showDirectory && (
          <WorkspaceCloneDirectory
            typeTabs={WORKSPACE_TYPE_TABS}
            activeType={activeType}
            entities={filteredEntities}
            selectedEntityId={selectedEntity?.id || ""}
            isCollapsed={isDirectoryCollapsed}
            searchQuery={searchQuery}
            contextMenu={workspaceChannels.contextMenu}
            channelBindingModal={workspaceChannels.modal}
            channelBindingAgents={workspaceChannels.agents}
            channelBindingAgentId={workspaceChannels.selectedAgentId}
            channelBindingModalLoading={workspaceChannels.modalLoading}
            channelBindingModalSaving={workspaceChannels.modalSaving}
            channelBindingNotice={workspaceChannels.modalNotice}
            channelBindingError={workspaceChannels.modalError}
            weixinQrStarting={workspaceChannels.weixinQrStarting}
            weixinQrPolling={workspaceChannels.weixinQrPolling}
            weixinQrUrl={workspaceChannels.weixinQrUrl}
            weixinQrImageUrl={workspaceChannels.weixinQrImageUrl}
            weixinQrDetail={workspaceChannels.weixinQrSnapshot?.detail?.trim() || ""}
            weixinQrLogs={workspaceChannels.weixinQrLogs}
            hasActiveWeixinQrSession={workspaceChannels.hasActiveWeixinQrSession}
            isCurrentWeixinChannelAlreadyBound={workspaceChannels.isCurrentWeixinChannelAlreadyBound}
            weixinQrStatusTone={workspaceChannels.weixinQrStatusTone}
            weixinQrStatusText={workspaceChannels.weixinQrStatusText}
            feishuQrRequesting={workspaceChannels.feishuQrRequesting}
            feishuQrChecking={workspaceChannels.feishuQrChecking}
            feishuQrVisible={workspaceChannels.feishuQrVisible}
            feishuQrTargetUrl={workspaceChannels.feishuQrTargetUrl}
            feishuQrUserCode={workspaceChannels.feishuQrUserCode}
            feishuQrExpiresAtMs={workspaceChannels.feishuQrExpiresAtMs}
            feishuAppId={workspaceChannels.feishuAppId}
            feishuAppSecret={workspaceChannels.feishuAppSecret}
            feishuAppSecretConfigured={workspaceChannels.feishuAppSecretConfigured}
            feishuAppSecretVisible={workspaceChannels.feishuAppSecretVisible}
            feishuDmPolicy={workspaceChannels.feishuDmPolicy}
            feishuManualExpanded={workspaceChannels.feishuManualExpanded}
            feishuAllowFromDraft={workspaceChannels.feishuAllowFromDraft}
            feishuAllowFromSessionIds={workspaceChannels.feishuAllowFromSessionIds}
            onToggleCollapsed={() => setIsDirectoryCollapsed((value) => !value)}
            onSelectType={setActiveType}
            onSelectEntity={(entityId) => {
              setSelectedEntityId(entityId);
              if (activeType === "agents") {
                homepageChat.selectAgent(entityId);
                return;
              }
              if (activeType === "channels") {
                const entity = filteredEntities.find((item) => item.id === entityId);
                if (entity?.runtimeAgentId) {
                  homepageChat.selectAgent(entity.runtimeAgentId);
                }
              }
            }}
            onSearchChange={setSearchQuery}
            onOpenContextMenu={(event, entity) => {
              event.stopPropagation();
              setContextMenu({
                kind: entity.entityType === "channels" ? "channel" : entity.entityType === "teams" ? "team" : "agent",
                entityId: entity.id,
                title: entity.name,
                x: event.clientX,
                y: event.clientY,
                configured: entity.status !== "offline",
              });
            }}
            onCloseContextMenu={() => setContextMenu(null)}
            onOpenChannelBindingModal={(entity) => {
              void workspaceChannels.openBindingModal(entity);
            }}
            onCloseChannelBindingModal={() => {
              void workspaceChannels.closeBindingModal();
            }}
            onSelectChannelBindingAgent={workspaceChannels.setSelectedAgentId}
            onStartWeixinQrBinding={() => {
              void workspaceChannels.startWeixinQrBindingFlow();
            }}
            onOpenExternalBindingLink={(url) => {
              void workspaceChannels.handleOpenExternalBindingLink(
                url,
                (workspaceChannels.modal.channelId as WorkspaceChannelId) || "weixin",
              );
            }}
            onRequestFeishuQr={() => {
              void workspaceChannels.handleRequestFeishuQr();
            }}
            onCheckFeishuQr={() => {
              void workspaceChannels.handleCheckFeishuQr();
            }}
            onChangeFeishuAppId={workspaceChannels.setFeishuAppId}
            onChangeFeishuAppSecret={workspaceChannels.setFeishuAppSecret}
            onChangeFeishuDmPolicy={workspaceChannels.setFeishuDmPolicy}
            onChangeFeishuAllowFromDraft={workspaceChannels.setFeishuAllowFromDraft}
            onAddFeishuAllowFromSessionId={workspaceChannels.addFeishuAllowFromSessionId}
            onRemoveFeishuAllowFromSessionId={workspaceChannels.removeFeishuAllowFromSessionId}
            onToggleFeishuManualExpanded={workspaceChannels.toggleFeishuManualExpanded}
            onToggleFeishuAppSecretVisible={workspaceChannels.toggleFeishuAppSecretVisible}
            onSaveChannelBinding={() => {
              void workspaceChannels.handleSaveBinding();
            }}
            onRemoveChannelBinding={(entityId) => {
              const target = entitiesByType.channels.find((item) => item.id === entityId);
              if (target) {
                void workspaceChannels.handleRemoveBinding(target);
              }
            }}
          />
        )}

        <section
          className={[
            "workspace-clone__workspace",
            activeMenu !== "chat" && activeMenu !== "employees" && activeMenu !== "skills" ? "is-compact" : "",
            activeMenu === "employees" ? "is-employees" : "",
            activeMenu === "skills" ? "is-skills" : "",
          ].join(" ").trim()}
        >
          {activeMenu === "chat" ? (
            <>
              <div className="workspace-clone__top">
                <WorkspaceCloneHeader
                  selectedEntity={selectedEntity}
                  activeUtilityPanel={utilityPanel}
                  onToggleUtilityPanel={toggleUtilityPanel}
                  onOpenAgentInfo={() => setShowAgentInfo(true)}
                  onOpenSessionPanel={() => toggleUtilityPanel("session")}
                  onOpenWorkbench={() => toggleUtilityPanel("workbench")}
                  onOpenMemberManagement={() => {
                    openSessionPanel("channel");
                    setRelatedResource("channel");
                  }}
                />
              </div>

              <WorkspaceCloneChatView
                selectedEntity={selectedEntity}
                chatEnabled={chatEnabled}
                chatDisabledReason={chatDisabledReason}
                messages={chatEnabled ? homepageChat.messages : []}
                liveSteps={chatEnabled ? homepageChat.liveSteps : []}
                connectionStatus={homepageChat.status}
                connectionError={homepageChat.error}
                historyLoading={homepageChat.historyLoading}
                isGenerating={homepageChat.isGenerating}
                utilityPanel={utilityPanel}
                activeSessionSection={activeSessionSection}
                historyItems={chatEnabled ? homepageChat.historyItems : WORKSPACE_HISTORY}
                logs={derivedLogs}
                schedules={WORKSPACE_SCHEDULES}
                workbenchItems={WORKSPACE_WORKBENCH}
                memoryItems={memoryResourceItems}
                skillItems={skillResourceItems}
                commandItems={WORKSPACE_COMMAND_ITEMS}
                channelItems={shouldBuildChannelRows ? workspaceChannels.channelResourceItems : []}
                toolItems={toolResourceItems}
                currentModelName={workspaceModelName}
                currentProviderName={workspaceProviderName}
                running={running}
                 showHomeSuggestions={activeType !== "agents"}
                 onCloseUtilityPanel={() => setUtilityPanel(null)}
                 onSelectSessionSection={setActiveSessionSection}
                 onSelectHistorySession={homepageChat.selectSession}
                 onOpenRelatedResource={handleOpenRelatedResource}
                 onOpenSettingsTextPreview={() => setShowSettingsTextPreview(true)}
                 onStart={handleStart}
                onOpenModelConfig={openModelConfigModal}
                onOpenLogs={() => toggleUtilityPanel("logs")}
              />

              {showScenePresetToggle && scenePresetsOpen && (
                <div className="workspace-clone__scene-switcher-shell">
                  <WorkspaceCloneScenePresetSwitcher onSelectCase={handleSelectScenePreset} />
                </div>
              )}

              <WorkspaceCloneComposer
                running={running}
                chatEnabled={chatEnabled}
                connectionStatus={homepageChat.status}
                selectedEntityName={selectedEntity?.name || null}
                currentModelName={workspaceModelName}
                draftValue={composerDraft}
                onDraftValueChange={setComposerDraft}
                scenePresetsOpen={scenePresetsOpen}
                showScenePresetToggle={showScenePresetToggle}
                onToggleScenePresets={toggleScenePresets}
                onCloseScenePresets={closeScenePresets}
                sending={homepageChat.sending}
                isGenerating={homepageChat.isGenerating}
                resettingSession={homepageChat.resettingSession}
                onOpenSessionSection={openSessionPanel}
                onOpenMemoryModal={openMemoryModal}
                onOpenModelConfig={openModelConfigModal}
                onSend={homepageChat.sendMessage}
                onAbort={homepageChat.abortMessage}
                onResetSession={homepageChat.resetSession}
              />
            </>
          ) : activeMenu === "employees" ? (
            <Suspense fallback={<WorkspaceCloneLazyFallback label="数字员工" />}>
              <WorkspaceCloneEmployeesView />
            </Suspense>
          ) : activeMenu === "skills" ? (
            <Suspense fallback={<WorkspaceCloneLazyFallback label="技能市场" />}>
              <WorkspaceCloneSkillsMarketView
                currentAgentId={currentMemoryAgentId}
                onRefreshCurrentAgentSkills={() => refreshSkillOptions({ showLoading: true })}
              />
            </Suspense>
          ) : (
            renderCompactWorkspace()
          )}
        </section>

        {shouldRenderOverlayStack ? (
          <Suspense fallback={null}>
            <WorkspaceCloneOverlayStack
          selectedEntity={selectedEntity}
          showAgentInfo={showAgentInfo}
          showMemoryModal={showMemoryModal}
          showSkillsModal={showSkillsModal}
          showToolsModal={showToolsModal}
          showRuntimeLogDetail={showRuntimeLogDetail}
          showSettingsTextPreview={showSettingsTextPreview}
          relatedResource={relatedResource}
          memoryFiles={memoryFiles}
          selectedMemoryFileId={selectedMemoryFileId}
          memoryDraftContent={memoryDraftContent}
          memoryLoading={memoryLoading}
          memorySaving={memorySaving}
          memoryNotice={memoryNotice}
          memoryError={memoryError}
          skillSearch={skillSearch}
          skillCategory={skillCategory}
          skillOptions={skillOptions.map((item) => ({
            ...item,
            selected: skillDraftIds.includes(item.id),
          }))}
          skillLoading={skillLoading}
          skillSaving={skillSaving}
          skillNotice={skillNotice}
          skillError={skillError}
          toolCategory={toolCategory}
          toolProfileLabel={toolProfileLabel}
          toolOptions={toolOptions.map((item) => ({
            ...item,
            selected: toolDraftIds.includes(item.id),
          }))}
          toolLoading={toolLoading}
          toolSaving={toolSaving}
          toolNotice={toolNotice}
          toolError={toolError}
          memoryItems={memoryResourceItems}
          commandItems={WORKSPACE_COMMAND_ITEMS}
          channelItems={shouldBuildChannelRows ? workspaceChannels.channelResourceItems : []}
          scheduleItems={scheduleResourceItems}
          onCloseAgentInfo={() => setShowAgentInfo(false)}
          onCloseMemoryModal={closeMemoryModal}
          onRefreshMemoryModal={() => {
            clearMemoryStatus();
            void refreshMemoryFiles({
              showLoading: true,
              preferredId: selectedMemoryFileId || undefined,
            });
          }}
          onSelectMemoryFile={handleSelectMemoryFile}
          onUpdateMemoryDraftContent={setMemoryDraftContent}
          onSaveMemoryFile={() => {
            void handleSaveMemoryFile();
          }}
          onCloseSkillsModal={closeSkillsModal}
          onRefreshSkillsModal={() => {
            clearSkillStatus();
            void refreshSkillOptions({ showLoading: true });
          }}
          onUpdateSkillSearch={setSkillSearch}
          onChangeSkillCategory={setSkillCategory}
          onToggleSkill={handleToggleSkill}
          onSelectAllSkills={() => setSkillDraftIds(skillOptions.map((item) => item.id))}
          onClearSkills={() => setSkillDraftIds([])}
          onSaveSkills={() => {
            void handleSaveSkills();
          }}
          onCloseToolsModal={closeToolsModal}
          onRefreshToolsModal={() => {
            clearToolStatus();
            void refreshToolOptions({ showLoading: true });
          }}
          onChangeToolCategory={setToolCategory}
          onToggleTool={handleToggleTool}
          onSelectAllTools={() => setToolDraftIds(toolOptions.map((item) => item.id))}
          onClearTools={() => setToolDraftIds([])}
          onSaveTools={() => {
            void handleSaveTools();
          }}
          onCloseRuntimeLogDetail={() => setShowRuntimeLogDetail(false)}
          onCloseSettingsTextPreview={() => setShowSettingsTextPreview(false)}
          onCloseRelatedResource={() => setRelatedResource(null)}
            />
          </Suspense>
        ) : null}

        {isModelConfigOpen ? (
          <Suspense fallback={<WorkspaceCloneLazyFallback label="模型配置" />}>
            <WorkspaceCloneModelConfigModal
              show={isModelConfigOpen}
              savedProviders={savedProviders}
              currentConfig={currentConfig}
              providers={providers}
              loading={savedProvidersLoading}
              onClose={closeModelConfigModal}
              onRefreshSavedProviders={refreshSavedProviders}
              onRefreshCurrentConfig={refreshCurrentConfig}
              onSetModel={handleSetModel}
              onUpsertSavedProviderConfig={handleUpsertSavedProviderConfig}
              onDeleteSavedProviderConfig={handleDeleteSavedProviderConfig}
            />
          </Suspense>
        ) : null}
      </main>
    </motion.section>
  );
}
