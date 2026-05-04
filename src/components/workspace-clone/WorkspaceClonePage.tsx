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
import { useWorkspaceCommandsAdmin } from "../../hooks/workspace-clone/useWorkspaceCommandsAdmin";
import { useWorkspaceMemoryAdmin } from "../../hooks/workspace-clone/useWorkspaceMemoryAdmin";
import { useWorkspaceSkillsAdmin } from "../../hooks/workspace-clone/useWorkspaceSkillsAdmin";
import { formatUptime } from "../../utils/log-humanizer";
import { useWorkspaceServiceStartupStatus } from "../../hooks/workspace-clone/useWorkspaceServiceStartupStatus";
import { useWorkspaceToolsAdmin } from "../../hooks/workspace-clone/useWorkspaceToolsAdmin";
import {
  buildWorkspaceEntities,
  buildWorkspaceLogs,
  WORKSPACE_HISTORY,
  WORKSPACE_MENU_ITEMS,
  WORKSPACE_SCHEDULES,
  WORKSPACE_TYPE_TABS,
  WORKSPACE_WORKBENCH,
} from "./workspaceCloneData";
import { formatAgentAvatar } from "./workspaceCloneGateway";
import { WorkspaceCloneChatView } from "./WorkspaceCloneChatView";
import { WorkspaceCloneComposer } from "./WorkspaceCloneComposer";
import { WorkspaceCloneDirectory } from "./WorkspaceCloneDirectory";
import { WorkspaceCloneEmailBindingModal } from "./WorkspaceCloneEmailBindingModal";
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
import { useWorkspaceChannels } from "../../hooks/workspace-clone/useWorkspaceChannels";
import { useWorkspaceEmailBinding } from "../../hooks/workspace-clone/useWorkspaceEmailBinding";
import type {
  WorkspaceEntity,
  WorkspaceGatewaySkillStatusResult,
  WorkspaceMemoryFile,
  WorkspaceRelatedResource,
  WorkspaceResourceItem,
  WorkspaceSlashCommandDefinition,
  WorkspaceSessionSectionKey,
  WorkspaceSidebarAdminPanel,
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

function resolveWorkspaceModelName(currentConfig: CurrentConfig | null, fallbackModelName: string) {
  const primaryModel = currentConfig?.model || fallbackModelName;
  if (!primaryModel) {
    return fallbackModelName;
  }
  return primaryModel.includes("/") ? primaryModel.split("/").slice(1).join("/") : primaryModel;
}

function buildWorkspaceMemoryResourceItems(files: WorkspaceMemoryFile[]): WorkspaceResourceItem[] {
  return [...files]
    .sort((left, right) => left.displayName.localeCompare(right.displayName, "zh-CN", { sensitivity: "base" }))
    .map((file) => ({
      id: file.id,
      title: file.displayName,
      subtitle: file.summary,
      tag: file.isFocus ? "\u91cd\u70b9" : file.exists ? undefined : "\u5f85\u521b\u5efa",
    }));
}

function buildCommandSummaryItems(
  commands: WorkspaceSlashCommandDefinition[],
  activeCommandId: string,
): WorkspaceResourceItem[] {
  return commands.map((item) => ({
    id: item.id,
    title: item.command,
    subtitle: item.description || item.name,
    tag: item.source === "builtin" ? "\u53ea\u8bfb" : item.id === activeCommandId ? "\u5df2\u6fc0\u6d3b" : "\u81ea\u5b9a\u4e49",
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
  const isEmployeesLabel = label === "数字员工" || label.includes("数");
  const isSkillsLabel = label === "技能市场" || label.includes("技");
  const isModelConfigLabel = label === "模型配置" || label.includes("模");
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
  agentListSource: ReturnType<typeof useWorkspaceGatewayChat>["agentListSource"];
  agentLastMessageById: ReturnType<typeof useWorkspaceGatewayChat>["agentLastMessageById"];
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
    agentListSource,
    agentLastMessageById,
    running,
    isGenerating,
    currentModelName,
    currentProviderName,
  } = params;
  const isCachedAgentList = agentListSource === "cache";

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
      subtitle: agentLastMessageById[agent.id] || "",
      status:
        isCachedAgentList || !running
          ? "offline"
          : isGenerating && isAgentSessionActive
            ? "busy"
            : agent.id === selectedAgentId && currentMainSession?.abortedLastRun
              ? "busy"
              : "online",
      avatarLabel: formatAgentAvatar(agent),
      accent: agent.id,
      currentWork:
        isCachedAgentList
          ? "连接后同步最新 Agent 状态。"
          : !running
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
  loading,
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
  const [showRuntimeLogDetail, setShowRuntimeLogDetail] = useState(false);
  const [showSettingsTextPreview, setShowSettingsTextPreview] = useState(false);
  const [relatedResource, setRelatedResource] = useState<WorkspaceRelatedResource>(null);
  const [isModelConfigOpen, setIsModelConfigOpen] = useState(false);
  const [savedProviders, setSavedProviders] = useState<SavedProvider[]>([]);
  const [savedProvidersLoading, setSavedProvidersLoading] = useState(false);
  const [scenePresetOpenStateByKey, setScenePresetOpenStateByKey] = useState<Record<string, boolean>>(
    () => loadWorkspaceScenePresetOpenState(),
  );
  const homepageChat = useWorkspaceGatewayChat({ running, servicePort, gatewayToken });
  const currentAgentIdRef = useRef<string | null>(null);
  const savedProvidersLoadSeqRef = useRef(0);
  const modelConfigOpenRef = useRef(false);
  const showDirectory = activeMenu === "chat";
  const channelDataEnabled =
    showDirectory &&
    (activeType === "channels" || relatedResource === "channel" || (utilityPanel === "session" && activeSessionSection === "channel"));
  const workspaceChannels = useWorkspaceChannels({ configVersion, enabled: channelDataEnabled });
  const { setContextMenu } = workspaceChannels;
  const serviceStartup = useWorkspaceServiceStartupStatus({
    running,
    loading,
    connectionStatus: homepageChat.status,
    connectionError: homepageChat.error,
    logs,
  });
  const workspaceEmailBinding = useWorkspaceEmailBinding();

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
      homepageChat.agentListSource !== "none" && homepageChat.agents.length > 0
        ? buildGatewayAgentEntities({
            agents: homepageChat.agents,
            selectedAgentId: homepageChat.selectedAgentId,
            currentSessionKey: homepageChat.currentSessionKey,
            currentMainSession: homepageChat.currentMainSession,
            sessionsResult: homepageChat.sessionsResult,
            agentListSource: homepageChat.agentListSource,
            agentLastMessageById: homepageChat.agentLastMessageById,
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
      homepageChat.agentListSource,
      homepageChat.agentLastMessageById,
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
      savedProvidersLoadSeqRef.current += 1;
      modelConfigOpenRef.current = false;
      setUtilityPanel(null);
      setContextMenu(null);
      setRelatedResource(null);
      setShowAgentInfo(false);
      setIsModelConfigOpen(false);
      setSavedProvidersLoading(false);
      setShowRuntimeLogDetail(false);
      setShowSettingsTextPreview(false);
      workspaceEmailBinding.closeEmailBindingModal({ clearStatus: true, force: true });
    }
  }, [activeMenu, setContextMenu, workspaceEmailBinding.closeEmailBindingModal]);

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
  const memoryAdmin = useWorkspaceMemoryAdmin({ agentId: currentMemoryAgentId });
  const commandsAdmin = useWorkspaceCommandsAdmin();
  const requestSkillStatus = useCallback(
    (agentId: string) => homepageChat.request<WorkspaceGatewaySkillStatusResult>("skills.status", { agentId }),
    [homepageChat.request],
  );
  const skillsAdmin = useWorkspaceSkillsAdmin({
    agentId: currentMemoryAgentId,
    gatewayConnected: homepageChat.connected,
    requestSkillStatus,
  });
  const toolsAdmin = useWorkspaceToolsAdmin({ agentId: currentMemoryAgentId });

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

  useEffect(() => {
    if (activeMenu !== "chat") {
      memoryAdmin.closeMemoryModal();
      commandsAdmin.closeCommandsModal();
      skillsAdmin.closeSkillsModal();
      toolsAdmin.closeToolsModal();
    }
  }, [
    activeMenu,
    commandsAdmin.closeCommandsModal,
    memoryAdmin.closeMemoryModal,
    skillsAdmin.closeSkillsModal,
    toolsAdmin.closeToolsModal,
  ]);

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


  useEffect(() => {
    const message = memoryAdmin.memoryNotice.trim();
    if (!message) {
      return;
    }

    pushFeedback({
      tone: "success",
      message,
      dedupeKey: "workspace-memory-notice",
      persistent: false,
    });
  }, [memoryAdmin.memoryNotice, pushFeedback]);

  useEffect(() => {
    const message = memoryAdmin.memoryError.trim();
    if (!message) {
      return;
    }

    pushFeedback({
      tone: "error",
      title: "记忆",
      message,
      dedupeKey: "workspace-memory-error",
      persistent: false,
      autoCloseMs: 3600,
    });
  }, [memoryAdmin.memoryError, pushFeedback]);

  useEffect(() => {
    const message = skillsAdmin.skillNotice.trim();
    if (!message) {
      return;
    }

    pushFeedback({
      tone: "success",
      message,
      dedupeKey: "workspace-skills-notice",
      persistent: false,
    });
  }, [pushFeedback, skillsAdmin.skillNotice]);

  useEffect(() => {
    const message = skillsAdmin.skillError.trim();
    if (!message) {
      return;
    }

    pushFeedback({
      tone: "error",
      title: "技能库",
      message,
      dedupeKey: "workspace-skills-error",
      persistent: false,
      autoCloseMs: 3600,
    });
  }, [pushFeedback, skillsAdmin.skillError]);

  useEffect(() => {
    const message = toolsAdmin.toolNotice.trim();
    if (!message) {
      return;
    }

    pushFeedback({
      tone: "success",
      message,
      dedupeKey: "workspace-tools-notice",
      persistent: false,
    });
  }, [pushFeedback, toolsAdmin.toolNotice]);

  useEffect(() => {
    const message = toolsAdmin.toolError.trim();
    if (!message) {
      return;
    }

    pushFeedback({
      tone: "error",
      title: "工具权限",
      message,
      dedupeKey: "workspace-tools-error",
      persistent: false,
      autoCloseMs: 3600,
    });
  }, [pushFeedback, toolsAdmin.toolError]);

  useEffect(() => {
    const message = commandsAdmin.commandNotice.trim();
    if (!message) {
      return;
    }

    pushFeedback({
      tone: "success",
      message,
      dedupeKey: "workspace-commands-notice",
      persistent: false,
    });
  }, [commandsAdmin.commandNotice, pushFeedback]);

  useEffect(() => {
    const message = commandsAdmin.commandError.trim();
    if (!message) {
      return;
    }

    pushFeedback({
      tone: "error",
      title: "Slash Commands",
      message,
      dedupeKey: "workspace-commands-error",
      persistent: false,
      autoCloseMs: 3600,
    });
  }, [commandsAdmin.commandError, pushFeedback]);

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






  const openCommandsModal = useCallback(() => {
    setActiveSessionSection("commands");
    setRelatedResource("commands");
    commandsAdmin.openCommandsModal();
  }, [commandsAdmin.openCommandsModal]);

  const closeCommandsModal = useCallback(() => {
    setRelatedResource((current) => (current === "commands" ? null : current));
    commandsAdmin.closeCommandsModal();
  }, [commandsAdmin.closeCommandsModal]);

  const openMemoryModal = useCallback(() => {
    setActiveSessionSection("memory");
    memoryAdmin.openMemoryModal();
  }, [memoryAdmin.openMemoryModal]);

  const closeMemoryModal = useCallback(() => {
    memoryAdmin.closeMemoryModal();
  }, [memoryAdmin.closeMemoryModal]);

  const openSkillsModal = useCallback(() => {
    setActiveSessionSection("skills");
    skillsAdmin.openSkillsModal();
  }, [skillsAdmin.openSkillsModal]);

  const closeSkillsModal = useCallback(() => {
    skillsAdmin.closeSkillsModal();
  }, [skillsAdmin.closeSkillsModal]);

  const openToolsModal = useCallback(() => {
    setActiveSessionSection("tools");
    toolsAdmin.openToolsModal();
  }, [toolsAdmin.openToolsModal]);

  const closeToolsModal = useCallback(() => {
    toolsAdmin.closeToolsModal();
  }, [toolsAdmin.closeToolsModal]);





  useEffect(() => {
    commandsAdmin.clearCommandStatus();
  }, [commandsAdmin.clearCommandStatus, currentMemoryAgentId]);

  useEffect(() => {
    if (utilityPanel === "history") {
      homepageChat.loadHistoryTitles();
    }
  }, [homepageChat.loadHistoryTitles, utilityPanel]);

  const uptimeLabel = running ? formatUptime(uptime) : "未启动";
  const shouldBuildLogRows = utilityPanel === "logs" || showRuntimeLogDetail;
  const shouldBuildMemoryRows =
    memoryAdmin.showMemoryModal || relatedResource === "memory" || (utilityPanel === "session" && activeSessionSection === "memory");
  const shouldBuildSkillRows =
    skillsAdmin.showSkillsModal || relatedResource === "skills" || (utilityPanel === "session" && activeSessionSection === "skills");
  const shouldBuildCommandRows = relatedResource === "commands" || utilityPanel === "session";
  const shouldBuildToolRows =
    toolsAdmin.showToolsModal || relatedResource === "tools" || (utilityPanel === "session" && activeSessionSection === "tools");
  const shouldBuildChannelRows =
    relatedResource === "channel" || (utilityPanel === "session" && activeSessionSection === "channel");
  const derivedLogs = useMemo(() => (shouldBuildLogRows ? buildWorkspaceLogs(logs) : []), [logs, shouldBuildLogRows]);
  const memoryResourceItems = useMemo(
    () => (shouldBuildMemoryRows ? buildWorkspaceMemoryResourceItems(memoryAdmin.memoryFiles) : []),
    [memoryAdmin.memoryFiles, shouldBuildMemoryRows],
  );
  const skillResourceItems = useMemo(() => (shouldBuildSkillRows ? skillsAdmin.skillResourceItems : []), [shouldBuildSkillRows, skillsAdmin.skillResourceItems]);
  const toolResourceItems = useMemo(() => (shouldBuildToolRows ? toolsAdmin.toolResourceItems : []), [shouldBuildToolRows, toolsAdmin.toolResourceItems]);
  const commandResourceItems = useMemo(
    () =>
      shouldBuildCommandRows
        ? buildCommandSummaryItems(commandsAdmin.slashCommands, commandsAdmin.activeSlashCommandId)
        : [],
    [commandsAdmin.activeSlashCommandId, commandsAdmin.slashCommands, shouldBuildCommandRows],
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
    if (resource === "commands") {
      openCommandsModal();
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
    memoryAdmin.showMemoryModal ||
    skillsAdmin.showSkillsModal ||
    toolsAdmin.showToolsModal ||
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
                commandItems={commandResourceItems}
                channelItems={shouldBuildChannelRows ? workspaceChannels.channelResourceItems : []}
                toolItems={toolResourceItems}
                currentModelName={workspaceModelName}
                currentProviderName={workspaceProviderName}
                running={running}
                serviceStartup={serviceStartup}
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
                onOpenCommandsModal={openCommandsModal}
                onOpenEmailBindingModal={workspaceEmailBinding.openEmailBindingModal}
                onOpenModelConfig={openModelConfigModal}
                emailBindingBound={workspaceEmailBinding.isBound}
                emailBindingBoundProviderLabel={workspaceEmailBinding.boundProviderLabel}
                slashCommands={commandsAdmin.slashCommands}
                activeSlashCommand={commandsAdmin.activeSlashCommand}
                onActivateSlashCommand={commandsAdmin.handleActivateSlashCommand}
                onClearActiveSlashCommand={() => commandsAdmin.handleActivateSlashCommand("")}
                onSend={(value) => homepageChat.sendMessage(value, { activeCommand: commandsAdmin.activeSlashCommand || undefined })}
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
                onRefreshCurrentAgentSkills={() => skillsAdmin.refreshSkillOptions({ showLoading: true })}
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
          showMemoryModal={memoryAdmin.showMemoryModal}
          showSkillsModal={skillsAdmin.showSkillsModal}
          showToolsModal={toolsAdmin.showToolsModal}
          showRuntimeLogDetail={showRuntimeLogDetail}
          showSettingsTextPreview={showSettingsTextPreview}
          relatedResource={relatedResource}
          memoryFiles={memoryAdmin.memoryFiles}
          selectedMemoryFileId={memoryAdmin.selectedMemoryFileId}
          memoryDraftContent={memoryAdmin.memoryDraftContent}
          memoryLoading={memoryAdmin.memoryLoading}
          memorySaving={memoryAdmin.memorySaving}
          memoryNotice={memoryAdmin.memoryNotice}
          memoryError={memoryAdmin.memoryError}
          skillSearch={skillsAdmin.skillSearch}
          skillCategory={skillsAdmin.skillCategory}
          skillOptions={skillsAdmin.selectedSkillOptions}
          skillLoading={skillsAdmin.skillLoading}
          skillSaving={skillsAdmin.skillSaving}
          skillNotice={skillsAdmin.skillNotice}
          skillError={skillsAdmin.skillError}
          toolCategory={toolsAdmin.toolCategory}
          toolProfileLabel={toolsAdmin.toolProfileLabel}
          toolOptions={toolsAdmin.selectedToolOptions}
          toolLoading={toolsAdmin.toolLoading}
          toolSaving={toolsAdmin.toolSaving}
          toolNotice={toolsAdmin.toolNotice}
          toolError={toolsAdmin.toolError}
          memoryItems={memoryResourceItems}
          commandItems={commandsAdmin.slashCommands}
          activeCommandId={commandsAdmin.activeSlashCommandId}
          commandSearch={commandsAdmin.commandSearch}
          commandDraft={commandsAdmin.commandDraft}
          editingCommandId={commandsAdmin.editingCommandId}
          commandEditorOpen={commandsAdmin.commandEditorOpen}
          commandLoading={commandsAdmin.commandLoading}
          commandSaving={commandsAdmin.commandSaving}
          commandNotice={commandsAdmin.commandNotice}
          commandError={commandsAdmin.commandError}
          channelItems={shouldBuildChannelRows ? workspaceChannels.channelResourceItems : []}
          scheduleItems={scheduleResourceItems}
          onCloseAgentInfo={() => setShowAgentInfo(false)}
          onCloseMemoryModal={closeMemoryModal}
          onRefreshMemoryModal={() => {
            memoryAdmin.clearMemoryStatus();
            void memoryAdmin.refreshMemoryFiles({
              showLoading: true,
              preferredId: memoryAdmin.selectedMemoryFileId || undefined,
            });
          }}
          onSelectMemoryFile={memoryAdmin.handleSelectMemoryFile}
          onUpdateMemoryDraftContent={memoryAdmin.setMemoryDraftContent}
          onSaveMemoryFile={() => {
            void memoryAdmin.handleSaveMemoryFile();
          }}
          onCloseSkillsModal={closeSkillsModal}
          onRefreshSkillsModal={() => {
            skillsAdmin.clearSkillStatus();
            void skillsAdmin.refreshSkillOptions({ showLoading: true });
          }}
          onUpdateSkillSearch={skillsAdmin.setSkillSearch}
          onChangeSkillCategory={skillsAdmin.setSkillCategory}
          onToggleSkill={skillsAdmin.handleToggleSkill}
          onSelectAllSkills={skillsAdmin.handleSelectAllSkills}
          onClearSkills={skillsAdmin.handleClearSkills}
          onSaveSkills={() => {
            void skillsAdmin.handleSaveSkills();
          }}
          onCloseToolsModal={closeToolsModal}
          onRefreshToolsModal={() => {
            toolsAdmin.clearToolStatus();
            void toolsAdmin.refreshToolOptions({ showLoading: true });
          }}
          onChangeToolCategory={toolsAdmin.setToolCategory}
          onToggleTool={toolsAdmin.handleToggleTool}
          onSelectAllTools={toolsAdmin.handleSelectAllTools}
          onClearTools={toolsAdmin.handleClearTools}
          onSaveTools={() => {
            void toolsAdmin.handleSaveTools();
          }}
          onCloseCommandsModal={closeCommandsModal}
          onRefreshCommandsModal={() => {
            commandsAdmin.clearCommandStatus();
            void commandsAdmin.refreshSlashCommands({ showLoading: true });
          }}
          onUpdateCommandSearch={commandsAdmin.setCommandSearch}
          onActivateCommand={commandsAdmin.handleActivateSlashCommand}
          onStartCreateCommand={commandsAdmin.handleStartCreateSlashCommand}
          onStartEditCommand={commandsAdmin.handleStartEditSlashCommand}
          onCancelCommandEdit={commandsAdmin.handleCancelSlashCommandEdit}
          onDeleteCommand={(commandId) => {
            void commandsAdmin.handleDeleteSlashCommand(commandId);
          }}
          onUpdateCommandDraft={commandsAdmin.setCommandDraft}
          onSaveCommandDraft={() => {
            void commandsAdmin.handleSaveSlashCommandDraft();
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

        <WorkspaceCloneEmailBindingModal
          show={workspaceEmailBinding.isOpen}
          loading={workspaceEmailBinding.loading}
          saving={workspaceEmailBinding.saving}
          notice={workspaceEmailBinding.notice}
          error={workspaceEmailBinding.error}
          provider={workspaceEmailBinding.provider}
          providerOptions={workspaceEmailBinding.providerOptions}
          account={workspaceEmailBinding.account}
          accountPlaceholder={workspaceEmailBinding.accountPlaceholder}
          authorizationCode={workspaceEmailBinding.authorizationCode}
          isCustomProvider={workspaceEmailBinding.isCustomProvider}
          customImapHost={workspaceEmailBinding.customImapHost}
          customImapPort={workspaceEmailBinding.customImapPort}
          customSmtpHost={workspaceEmailBinding.customSmtpHost}
          customSmtpPort={workspaceEmailBinding.customSmtpPort}
          customImapTls={workspaceEmailBinding.customImapTls}
          customSmtpSecure={workspaceEmailBinding.customSmtpSecure}
          onClose={() => workspaceEmailBinding.closeEmailBindingModal({ clearStatus: true })}
          onSubmit={() => {
            void workspaceEmailBinding.saveBinding();
          }}
          onProviderChange={workspaceEmailBinding.updateProvider}
          onAccountChange={workspaceEmailBinding.setAccount}
          onAuthorizationCodeChange={workspaceEmailBinding.setAuthorizationCode}
          onCustomImapHostChange={workspaceEmailBinding.setCustomImapHost}
          onCustomImapPortChange={workspaceEmailBinding.setCustomImapPort}
          onCustomSmtpHostChange={workspaceEmailBinding.setCustomSmtpHost}
          onCustomSmtpPortChange={workspaceEmailBinding.setCustomSmtpPort}
          onCustomImapTlsChange={workspaceEmailBinding.setCustomImapTls}
          onCustomSmtpSecureChange={workspaceEmailBinding.setCustomSmtpSecure}
        />
      </main>
    </motion.section>
  );
}
