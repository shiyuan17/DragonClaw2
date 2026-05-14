// Copyright (C) 2026 shiyuan
// SPDX-License-Identifier: GPL-3.0-only
// This file is part of DragonClaw. See LICENSE for details.
import { lazy, Suspense, useCallback, useEffect, useMemo, useRef, useState, type MouseEvent as ReactMouseEvent } from "react";
import { invoke } from "@tauri-apps/api/core";
import { listen } from "@tauri-apps/api/event";
import { open } from "@tauri-apps/plugin-dialog";
import { openPath } from "@tauri-apps/plugin-opener";
import { motion, useReducedMotion } from "framer-motion";
import { resolveWorkspaceAgentDisplayName } from "../../data/agencyRoster";
import type {
  CurrentConfig,
  KnowledgeBaseRecord,
  LogEntry,
  ProviderInfo,
  SavedProvider,
  WorkspaceSavedProviderSyncEvent,
  WorkspaceChannelId,
  WorkspaceEntityType,
  WorkspaceMenuKey,
} from "../../types";
import { useWorkspaceGatewayChat } from "../../hooks/useWorkspaceGatewayChat";
import { useFeedback } from "../../hooks/useFeedback";
import { useWorkspaceCommandsAdmin } from "../../hooks/workspace-clone/useWorkspaceCommandsAdmin";
import { useWorkspaceCloneFeedback } from "../../hooks/workspace-clone/useWorkspaceCloneFeedback";
import { useWorkspaceCronTasks } from "../../hooks/workspace-clone/useWorkspaceCronTasks";
import { useWorkspaceMemoryAdmin } from "../../hooks/workspace-clone/useWorkspaceMemoryAdmin";
import { useWorkspaceSkillsAdmin } from "../../hooks/workspace-clone/useWorkspaceSkillsAdmin";
import { formatUptime } from "../../utils/log-humanizer";
import { useWorkspaceServiceStartupStatus } from "../../hooks/workspace-clone/useWorkspaceServiceStartupStatus";
import { useWorkspaceToolsAdmin } from "../../hooks/workspace-clone/useWorkspaceToolsAdmin";
import {
  buildWorkspaceEntities,
  WORKSPACE_HISTORY,
  WORKSPACE_MENU_ITEMS,
  WORKSPACE_TYPE_TABS,
  WORKSPACE_WORKBENCH,
} from "./workspaceCloneData";
import { buildWorkspaceRuntimeLogs } from "./workspaceCloneLogs";
import { formatAgentAvatar } from "./workspaceCloneGateway";
import { workspaceCloneAvatarCategoryTabs } from "./workspaceCloneAvatarPresets";
import { resolveWorkspaceGatewayAvatarUrl } from "./workspaceCloneAvatarUtils";
import {
  loadWorkspaceAgentWorkdirs,
  persistWorkspaceAgentWorkdirs,
  resolveWorkspaceAgentWorkdir,
  resolveWorkspaceChatAgentId,
  updateWorkspaceAgentWorkdirs,
} from "./workspaceCloneAgentWorkdirState";
import {
  buildWorkspaceChatFileItemsFromRenderableMessages,
  isWorkspaceUrlTarget,
  resolveWorkspaceLocalOpenPath,
} from "./workspaceCloneChatFiles";
import { useWorkspaceRenderableMessages } from "./useWorkspaceRenderableMessages";
import { WorkspaceCloneChatView } from "./WorkspaceCloneChatView";
import { WorkspaceCloneComposer } from "./WorkspaceCloneComposer";
import { toWorkspaceActiveSkill } from "./workspaceCloneSlashCommands";
import {
  DEFAULT_VISIBLE_AGENT_RECENT_SESSIONS,
  WorkspaceCloneDirectory,
} from "./WorkspaceCloneDirectory";
import { useWorkspaceCloneAvatarState } from "./useWorkspaceCloneAvatarState";
import { WorkspaceCloneEmailBindingModal } from "./WorkspaceCloneEmailBindingModal";
import { WorkspaceCloneHeader } from "./WorkspaceCloneHeader";
import { WorkspaceCloneCompactView } from "./WorkspaceCloneCompactView";
import { WorkspaceCloneProductLandingView } from "./WorkspaceCloneProductLandingView";
import { WorkspaceCloneSchedulePage } from "./WorkspaceCloneSchedulePage";
import { WorkspaceCloneScenePresetSwitcher } from "./WorkspaceCloneScenePresetSwitcher";
import { WorkspaceCloneSettingsModal } from "./WorkspaceCloneSettingsModal";
import { WorkspaceCloneSidebar } from "./WorkspaceCloneSidebar";
import { WorkspaceCloneTaskEditorModal } from "./WorkspaceCloneTaskEditorModal";
import { WorkspaceCloneIcon } from "./workspaceCloneIcons";
import { Modal } from "../ui/Modal";
import { buildWorkspaceManualTaskExecutionContent } from "./workspaceCloneManualTaskExecution";
import { resolveWorkspaceTaskDisplayTitle } from "./workspaceCloneTaskTitle";
import {
  buildWorkspaceScenePresetStateKey,
  loadWorkspaceScenePresetOpenState,
  persistWorkspaceScenePresetOpenState,
  resolveWorkspaceScenePresetOpenState,
  updateWorkspaceScenePresetOpenState,
} from "./workspaceCloneScenePresetState";
import { useWorkspaceChannels } from "../../hooks/workspace-clone/useWorkspaceChannels";
import { useWorkspaceComposerModelMenu } from "../../hooks/workspace-clone/useWorkspaceComposerModelMenu";
import { useWorkspaceEmailBinding } from "../../hooks/workspace-clone/useWorkspaceEmailBinding";
import { loadLocalAgentRoster } from "../../hooks/workspace-gateway/local-agent-roster";
import {
  captureTelemetryEvent,
  getTelemetryEnabled,
  getTelemetryHost,
  isTelemetryConfigured,
  setTelemetryEnabled,
} from "../../utils/telemetry";
import type {
  WorkspaceActiveSkillList,
  WorkspaceCronJob,
  WorkspaceChatFileItem,
  WorkspaceEntity,
  WorkspaceGatewayAgentRow,
  WorkspaceGatewayAgentsListResult,
  WorkspaceHistoryItem,
  WorkspaceGatewaySkillStatusResult,
  WorkspaceMemoryFile,
  WorkspaceRelatedResource,
  WorkspaceResourceItem,
  WorkspaceRuntimeLogItem,
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
const WorkspaceCloneKnowledgePage = lazy(() =>
  import("./WorkspaceCloneKnowledgePage").then((module) => ({ default: module.WorkspaceCloneKnowledgePage })),
);
const WorkspaceCloneOverlayStack = lazy(() =>
  import("./WorkspaceCloneOverlayStack").then((module) => ({ default: module.WorkspaceCloneOverlayStack })),
);
const loadWorkspaceCloneModelConfigModal = () => import("./WorkspaceCloneModelConfigModal");
const WorkspaceCloneModelConfigModal = lazy(() =>
  loadWorkspaceCloneModelConfigModal().then((module) => ({ default: module.WorkspaceCloneModelConfigModal })),
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
  handleEnqueueWorkspaceSavedProviderConfig: (payload: {
    providerKey: string;
    displayName?: string | null;
    baseUrl: string;
    api: string;
    apiKey: string;
    modelId: string;
    modelOptions?: string[];
  }) => Promise<string>;
  handleDeleteSavedProviderConfig: (providerKey: string) => Promise<string>;
  bumpConfigVersion: () => void;
}
function resolveWorkspaceModelName(currentConfig: CurrentConfig | null, fallbackModelName: string) {
  const primaryModel = currentConfig?.model || fallbackModelName;
  if (!primaryModel) {
    return fallbackModelName;
  }
  return primaryModel.includes("/") ? primaryModel.split("/").slice(1).join("/") : primaryModel;
}

function resolveWorkspaceGatewayAgentName(agent: WorkspaceGatewayAgentRow) {
  return resolveWorkspaceAgentDisplayName(
    agent.id,
    agent.identity?.name?.trim() || agent.name?.trim() || agent.id,
  );
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
  const isEmployeesLabel = label === "\u6570\u5b57\u5458\u5de5" || label.includes("\u6570");
  const isSkillsLabel = label === "\u6280\u80fd\u5e02\u573a" || label.includes("\u6280");
  const isModelConfigLabel = label === "\u6a21\u578b\u914d\u7f6e" || label.includes("\u6a21");
  const normalizedLabel = isEmployeesLabel ? "\u6570\u5b57\u5458\u5de5" : isSkillsLabel ? "\u6280\u80fd\u5e02\u573a" : label;

  if (!isModelConfigLabel) {
    return <WorkspaceCloneSectionFallback label={normalizedLabel} />;
  }

  return (
    <Modal show maxWidth={840} overlayClassName="workspace-model-modal__overlay" contentClassName="workspace-model-modal__surface">
      <div className="workspace-model-modal">
        <div className="workspace-model-modal__header">
          <div>
            <h3>模型配置</h3>
            <p>弹窗资源准备中，请稍候。</p>
          </div>
        </div>
        <div className="workspace-model-modal__body">
          <section className="workspace-model-modal__cards">
            <div className="workspace-model-modal__cards-grid">
              {["one", "two", "three"].map((item) => (
                <article key={item} className="workspace-model-card">
                  <button type="button" className="workspace-model-card__main" disabled>
                    <div className="workspace-model-card__title-row">
                      <strong>正在加载...</strong>
                    </div>
                    <p>模型配置准备中</p>
                  </button>
                </article>
              ))}
            </div>
          </section>
        </div>
      </div>
    </Modal>
  );
}

function buildGatewayAgentEntities(params: {
  agents: NonNullable<ReturnType<typeof useWorkspaceGatewayChat>["agents"]>;
  selectedAgentId: string;
  currentMainSession: ReturnType<typeof useWorkspaceGatewayChat>["currentMainSession"];
  sessionsResult: ReturnType<typeof useWorkspaceGatewayChat>["sessionsResult"];
  agentListSource: ReturnType<typeof useWorkspaceGatewayChat>["agentListSource"];
  agentLastMessageById: ReturnType<typeof useWorkspaceGatewayChat>["agentLastMessageById"];
  recentSessionsByAgentId: Record<string, WorkspaceHistoryItem[]>;
  running: boolean;
  isGenerating: boolean;
  currentModelName: string;
  currentProviderName: string;
  resolveAvatarUrl: (agent: WorkspaceGatewayAgentRow) => string;
}) {
  const {
    agents,
    selectedAgentId,
    currentMainSession,
    sessionsResult,
    agentListSource,
    agentLastMessageById,
    recentSessionsByAgentId,
    running,
    isGenerating,
    currentModelName,
    currentProviderName,
    resolveAvatarUrl,
  } = params;
  const isCachedAgentList = agentListSource === "cache";

  return agents.map<WorkspaceEntity>((agent) => {
    const sessionKey = `agent:${agent.id}:main`;
    const isSelectedAgent = agent.id === selectedAgentId;
    const mainSession = sessionsResult?.sessions.find((session) => session.key === sessionKey) ?? null;
    const modelLabel =
      [mainSession?.modelProvider || currentProviderName, mainSession?.model || currentModelName]
        .filter(Boolean)
        .join(" / ") || "OpenClaw \u4e3b\u4f1a\u8bdd";

    return {
      id: agent.id,
      entityType: "agents",
      name: resolveWorkspaceGatewayAgentName(agent),
      searchText: [agent.id, agent.identity?.name?.trim(), agent.name?.trim()]
        .filter(Boolean)
        .join(" "),
      subtitle: agentLastMessageById[agent.id] || "",
      recentSessions: recentSessionsByAgentId[agent.id] ?? [],
      status:
        isCachedAgentList || !running
          ? "offline"
          : isGenerating && isSelectedAgent
            ? "busy"
            : isSelectedAgent && currentMainSession?.abortedLastRun
              ? "busy"
              : "online",
      avatarLabel: formatAgentAvatar(agent),
      avatarUrl: resolveAvatarUrl(agent) || undefined,
      accent: agent.id,
      currentWork:
        isCachedAgentList
          ? "\u8fde\u63a5\u540e\u540c\u6b65\u6700\u65b0 Agent \u72b6\u6001\u3002"
          : !running
          ? "\u670d\u52a1\u5c1a\u672a\u542f\u52a8\uff0c\u9996\u9875\u804a\u5929\u6682\u4e0d\u53ef\u7528\u3002"
          : isGenerating && isSelectedAgent
            ? "\u6b63\u5728\u751f\u6210\u5f53\u524d\u4e3b\u4f1a\u8bdd\u56de\u590d\u3002"
            : "\u9996\u9875\u5df2\u63a5\u5165\u5f53\u524d Agent \u7684\u4e3b\u4f1a\u8bdd\u3002",
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
  handleEnqueueWorkspaceSavedProviderConfig,
  handleDeleteSavedProviderConfig,
  bumpConfigVersion,
}: WorkspaceClonePageProps) {
  const { pushFeedback } = useFeedback();
  const [activeMenu, setActiveMenu] = useState<WorkspaceMenuKey>("chat");
  const [activeType, setActiveType] = useState<WorkspaceEntityType>("agents");
  const [selectedEntityId, setSelectedEntityId] = useState("main");
  const [isSidebarCollapsed, setIsSidebarCollapsed] = useState(false);
  const [isDirectoryCollapsed, setIsDirectoryCollapsed] = useState(false);
  const [searchQuery, setSearchQuery] = useState("");
  const [composerDraft, setComposerDraft] = useState("");
  const [activeSkillIds, setActiveSkillIds] = useState<string[]>([]);
  const [agentWorkspaceDirs, setAgentWorkspaceDirs] = useState<Record<string, string>>(
    () => loadWorkspaceAgentWorkdirs(),
  );
  const [utilityPanel, setUtilityPanel] = useState<WorkspaceUtilityPanel>(null);
  const [activeSessionSection, setActiveSessionSection] = useState<WorkspaceSessionSectionKey>("model");
  const [adminOpen, setAdminOpen] = useState(false);
  const [adminPanel, setAdminPanel] = useState<WorkspaceSidebarAdminPanel>(null);
  const [showAgentInfo, setShowAgentInfo] = useState(false);
  const [selectedRuntimeLogId, setSelectedRuntimeLogId] = useState<string | null>(null);
  const [showWorkspaceSettingsModal, setShowWorkspaceSettingsModal] = useState(false);
  const [telemetryEnabled, setTelemetryEnabledState] = useState(() => getTelemetryEnabled());
  const [relatedResource, setRelatedResource] = useState<WorkspaceRelatedResource>(null);
  const [editingTaskId, setEditingTaskId] = useState<string | null>(null);
  const [isModelConfigOpen, setIsModelConfigOpen] = useState(false);
  const [knowledgePanelOpen, setKnowledgePanelOpen] = useState(false);
  const [currentKnowledgeBase, setCurrentKnowledgeBase] = useState<KnowledgeBaseRecord | null>(null);
  const [savedProviders, setSavedProviders] = useState<SavedProvider[]>([]);
  const [savedProvidersLoading, setSavedProvidersLoading] = useState(false);
  const [providerSyncEvent, setProviderSyncEvent] = useState<{
    seq: number;
    payload: WorkspaceSavedProviderSyncEvent;
  } | null>(null);
  const [localAgentsResult, setLocalAgentsResult] = useState<WorkspaceGatewayAgentsListResult | null>(null);
  const [scenePresetOpenStateByKey, setScenePresetOpenStateByKey] = useState<Record<string, boolean>>(
    () => loadWorkspaceScenePresetOpenState(),
  );
  const homepageChat = useWorkspaceGatewayChat({ running, servicePort, gatewayToken });
  const savedProvidersLoadSeqRef = useRef(0);
  const providerSyncEventSeqRef = useRef(0);
  const modelConfigOpenRef = useRef(false);
  const prefersReducedMotion = useReducedMotion();
  const telemetryConfigured = isTelemetryConfigured();
  const telemetryHost = getTelemetryHost();
  const showDirectory = activeMenu === "chat";

  useEffect(() => {
    if (activeMenu === "knowledge") {
      setActiveMenu("chat");
    }
  }, [activeMenu]);

  useEffect(() => {
    persistWorkspaceAgentWorkdirs(agentWorkspaceDirs);
  }, [agentWorkspaceDirs]);

  const workspaceChannels = useWorkspaceChannels({ configVersion, enabled: showDirectory });
  const { setContextMenu } = workspaceChannels;
  const serviceStartup = useWorkspaceServiceStartupStatus({
    running,
    loading,
    connectionStatus: homepageChat.status,
    connectionError: homepageChat.error,
    logs,
  });
  const workspaceEmailBinding = useWorkspaceEmailBinding();
  const refreshLocalAgentRoster = useCallback(async (existingResult?: WorkspaceGatewayAgentsListResult | null) => {
    const nextResult = await loadLocalAgentRoster(existingResult ?? homepageChat.agentsResult ?? null);
    setLocalAgentsResult(nextResult);
    const nextAgentId =
      nextResult?.agents.some((agent) => agent.id === homepageChat.selectedAgentId)
        ? homepageChat.selectedAgentId
        : nextResult?.defaultId || nextResult?.agents[0]?.id || "";

    if (nextAgentId && nextAgentId !== homepageChat.selectedAgentId) {
      homepageChat.selectAgent(nextAgentId);
    }

    return nextResult;
  }, [homepageChat.agentsResult, homepageChat.selectedAgentId, homepageChat.selectAgent]);
  const handleAgentRosterChanged = useCallback(async () => {
    await refreshLocalAgentRoster().catch(() => undefined);

    if (homepageChat.connected) {
      await homepageChat.reload().catch(() => undefined);
    }

    await workspaceChannels.refreshChannels().catch(() => undefined);
  }, [
    homepageChat.connected,
    homepageChat.reload,
    refreshLocalAgentRoster,
    workspaceChannels.refreshChannels,
  ]);

  useEffect(() => {
    void refreshLocalAgentRoster().catch(() => undefined);
  }, [refreshLocalAgentRoster]);

  const refreshSavedProviders = useCallback(async () => {
    const requestId = savedProvidersLoadSeqRef.current + 1;
    savedProvidersLoadSeqRef.current = requestId;
    const nextProviders = await invoke<SavedProvider[]>("list_saved_providers");
    if (savedProvidersLoadSeqRef.current === requestId) {
      setSavedProviders(nextProviders);
    }
  }, []);

  useEffect(() => {
    let disposed = false;

    const unlistenPromise = listen<WorkspaceSavedProviderSyncEvent>("workspace-provider-config-sync", async (event) => {
      if (disposed) {
        return;
      }

      const payload = event.payload;
      if (!payload?.providerKey || payload.operation !== "upsert") {
        return;
      }

      if (payload.status === "success") {
        await refreshSavedProviders().catch(() => undefined);
        bumpConfigVersion();
      } else if (!modelConfigOpenRef.current) {
        pushFeedback({
          tone: "error",
          title: "模型配置",
          message: payload.error?.trim() || payload.message,
          dedupeKey: `workspace-provider-sync-${payload.providerKey}`,
          persistent: false,
          autoCloseMs: 3600,
        });
      }

      providerSyncEventSeqRef.current += 1;
      if (!disposed) {
        setProviderSyncEvent({
          seq: providerSyncEventSeqRef.current,
          payload,
        });
      }
    });

    return () => {
      disposed = true;
      void unlistenPromise.then((unlisten) => unlisten());
    };
  }, [bumpConfigVersion, pushFeedback, refreshSavedProviders]);

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
  const workspaceCurrentModelId = useMemo(() => currentConfig?.model?.trim() || "", [currentConfig]);
  const composerModelMenu = useWorkspaceComposerModelMenu({
    configVersion,
    currentModelId: workspaceCurrentModelId,
    handleSetModel,
  });

  useEffect(() => {
    if (composerModelMenu.isOpen) {
      void loadWorkspaceCloneModelConfigModal();
    }
  }, [composerModelMenu.isOpen]);

  useEffect(() => {
    if (activeMenu !== "chat") {
      return undefined;
    }

    const prefetchTimer = window.setTimeout(() => {
      void loadWorkspaceCloneModelConfigModal();
    }, 220);

    return () => {
      window.clearTimeout(prefetchTimer);
    };
  }, [activeMenu]);

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
  const mergedGatewayAgents = useMemo(() => {
    if (!localAgentsResult) {
      return homepageChat.agents;
    }

    const localAgents = localAgentsResult.agents;
    const localAgentIds = new Set(localAgents.map((agent) => agent.id));
    const knownAgentsById = new Map(
      homepageChat.agents
        .filter((agent) => localAgentIds.has(agent.id))
        .map((agent) => [agent.id, agent]),
    );

    return localAgents.map((agent) => knownAgentsById.get(agent.id) ?? agent);
  }, [homepageChat.agents, localAgentsResult]);
  const mergedAgentListSource = homepageChat.agentListSource !== "none"
    ? homepageChat.agentListSource
    : localAgentsResult
      ? "cache"
      : "none";
  const avatarStateSelectedAgent = useMemo(() => {
    if (activeType !== "agents") {
      return null;
    }

    if (mergedAgentListSource !== "none" && mergedGatewayAgents.length > 0) {
      const targetAgentId = selectedEntityId || homepageChat.selectedAgentId || mergedGatewayAgents[0]?.id || "";
      const targetAgent =
        mergedGatewayAgents.find((agent) => agent.id === targetAgentId) ?? mergedGatewayAgents[0] ?? null;

      if (targetAgent) {
        return {
          id: targetAgent.id,
          name: resolveWorkspaceGatewayAgentName(targetAgent),
          subtitle: homepageChat.agentLastMessageById[targetAgent.id] || "",
          avatarLabel: formatAgentAvatar(targetAgent),
          avatarUrl: resolveWorkspaceGatewayAvatarUrl(targetAgent.identity) || undefined,
        };
      }
    }

    const fallbackAgent =
      staticEntitiesByType.agents.find((entity) => entity.id === selectedEntityId) ??
      staticEntitiesByType.agents[0] ??
      null;

    if (!fallbackAgent) {
      return null;
    }

    return {
      id: fallbackAgent.id,
      name: fallbackAgent.name,
      subtitle: fallbackAgent.subtitle,
      avatarLabel: fallbackAgent.avatarLabel,
      avatarUrl: fallbackAgent.avatarUrl,
    };
  }, [
    activeType,
    homepageChat.agentLastMessageById,
    homepageChat.selectedAgentId,
    mergedAgentListSource,
    mergedGatewayAgents,
    selectedEntityId,
    staticEntitiesByType.agents,
  ]);
  const avatarState = useWorkspaceCloneAvatarState(avatarStateSelectedAgent);
  const staticAgentEntities = useMemo(
    () =>
      staticEntitiesByType.agents.map((entity) => ({
        ...entity,
        avatarUrl: avatarState.resolvePersistedAgentAvatarUrl(entity.id, entity.avatarUrl) || undefined,
      })),
    [avatarState.resolvePersistedAgentAvatarUrl, staticEntitiesByType.agents],
  );

  const gatewayAgentEntities = useMemo(
    () =>
      mergedAgentListSource !== "none" && mergedGatewayAgents.length > 0
        ? buildGatewayAgentEntities({
            agents: mergedGatewayAgents,
            selectedAgentId: homepageChat.selectedAgentId,
            currentMainSession: homepageChat.currentMainSession,
            sessionsResult: homepageChat.sessionsResult,
            agentListSource: mergedAgentListSource,
            agentLastMessageById: homepageChat.agentLastMessageById,
            recentSessionsByAgentId: homepageChat.agentRecentSessionsById,
            running,
            isGenerating: homepageChat.isGenerating,
            currentModelName: workspaceModelName,
            currentProviderName: workspaceProviderName,
            resolveAvatarUrl: (agent) =>
              avatarState.resolvePersistedAgentAvatarUrl(
                agent.id,
                resolveWorkspaceGatewayAvatarUrl(agent.identity),
              ),
          })
        : staticAgentEntities,
    [
      avatarState.resolvePersistedAgentAvatarUrl,
      mergedAgentListSource,
      mergedGatewayAgents,
      workspaceModelName,
      workspaceProviderName,
      homepageChat.currentMainSession,
      homepageChat.agentLastMessageById,
      homepageChat.agentRecentSessionsById,
      homepageChat.isGenerating,
      homepageChat.selectedAgentId,
      homepageChat.sessionsResult,
      running,
      staticAgentEntities,
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

  const handleToggleDirectoryCollapsed = useCallback(() => {
    setIsDirectoryCollapsed((value) => !value);
  }, []);

  const handleSelectDirectoryEntity = useCallback((entityId: string) => {
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
  }, [activeType, filteredEntities, homepageChat.selectAgent]);

  const handleOpenDirectoryContextMenu = useCallback((event: ReactMouseEvent<HTMLButtonElement>, entity: WorkspaceEntity) => {
    event.stopPropagation();
    setContextMenu({
      kind: entity.entityType === "channels" ? "channel" : entity.entityType === "teams" ? "team" : "agent",
      entityId: entity.id,
      title: entity.name,
      x: event.clientX,
      y: event.clientY,
      configured: entity.status !== "offline",
    });
  }, [setContextMenu]);

  const handleCloseDirectoryContextMenu = useCallback(() => {
    setContextMenu(null);
  }, [setContextMenu]);

  const handleOpenChannelBindingModal = useCallback((entity: WorkspaceEntity) => {
    void workspaceChannels.openBindingModal(entity);
  }, [workspaceChannels.openBindingModal]);

  const handleCloseChannelBindingModal = useCallback(() => {
    void workspaceChannels.closeBindingModal();
  }, [workspaceChannels.closeBindingModal]);

  const handleStartWeixinQrBinding = useCallback(() => {
    void workspaceChannels.startWeixinQrBindingFlow();
  }, [workspaceChannels.startWeixinQrBindingFlow]);

  const handleOpenExternalBindingLink = useCallback((url: string) => {
    void workspaceChannels.handleOpenExternalBindingLink(
      url,
      (workspaceChannels.modal.channelId as WorkspaceChannelId) || "weixin",
    );
  }, [workspaceChannels.handleOpenExternalBindingLink, workspaceChannels.modal.channelId]);

  const handleRequestFeishuQr = useCallback(() => {
    void workspaceChannels.handleRequestFeishuQr();
  }, [workspaceChannels.handleRequestFeishuQr]);

  const handleCheckFeishuQr = useCallback(() => {
    void workspaceChannels.handleCheckFeishuQr();
  }, [workspaceChannels.handleCheckFeishuQr]);

  const handleSaveChannelBinding = useCallback(() => {
    void workspaceChannels.handleSaveBinding();
  }, [workspaceChannels.handleSaveBinding]);

  const handleRemoveChannelBinding = useCallback((entityId: string) => {
    const target = entitiesByType.channels.find((item) => item.id === entityId);
    if (target) {
      void workspaceChannels.handleRemoveBinding(target);
    }
  }, [entitiesByType.channels, workspaceChannels.handleRemoveBinding]);

  const visibleAgentHistoryTitlePrefetch = useMemo(() => {
    if (!showDirectory || activeType !== "agents") {
      return { signature: "", targets: [] as Array<{ agentId: string; sessionKeys: string[] }> };
    }

    const targets = filteredEntities
      .map((entity) => {
        const sessionKeys = (entity.recentSessions ?? [])
          .slice(0, DEFAULT_VISIBLE_AGENT_RECENT_SESSIONS)
          .map((session) => session.sessionKey || session.id)
          .filter((sessionKey): sessionKey is string => Boolean(sessionKey));

        return {
          agentId: entity.id,
          sessionKeys,
        };
      })
      .filter((entry) => entry.sessionKeys.length > 0);

    return {
      signature: JSON.stringify(targets),
      targets,
    };
  }, [activeType, filteredEntities, showDirectory]);
  const visibleAgentHistoryTitlePrefetchTargetsRef = useRef(visibleAgentHistoryTitlePrefetch.targets);

  useEffect(() => {
    visibleAgentHistoryTitlePrefetchTargetsRef.current = visibleAgentHistoryTitlePrefetch.targets;
  }, [visibleAgentHistoryTitlePrefetch.targets]);

  useEffect(() => {
    if (!homepageChat.connected || visibleAgentHistoryTitlePrefetchTargetsRef.current.length === 0) {
      return;
    }

    homepageChat.loadHistoryTitles({
      agentIds: visibleAgentHistoryTitlePrefetchTargetsRef.current.map((target) => target.agentId),
      sessionKeysByAgentId: Object.fromEntries(
        visibleAgentHistoryTitlePrefetchTargetsRef.current.map((target) => [target.agentId, target.sessionKeys]),
      ),
    });
  }, [
    homepageChat.connected,
    homepageChat.loadHistoryTitles,
    visibleAgentHistoryTitlePrefetch.signature,
  ]);

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
      composerModelMenu.closeMenu();
      setUtilityPanel(null);
      setContextMenu(null);
      setRelatedResource(null);
      setShowAgentInfo(false);
      setIsModelConfigOpen(false);
      setSavedProvidersLoading(false);
      setSelectedRuntimeLogId(null);
      setShowWorkspaceSettingsModal(false);
      workspaceEmailBinding.closeEmailBindingModal({ clearStatus: true, force: true });
    }
  }, [activeMenu, composerModelMenu.closeMenu, setContextMenu, workspaceEmailBinding.closeEmailBindingModal]);

  useEffect(() => {
    if (activeMenu !== "chat" || activeType !== "agents" || !avatarStateSelectedAgent) {
      avatarState.closeAvatarModal();
    }
  }, [activeMenu, activeType, avatarState.closeAvatarModal, avatarStateSelectedAgent]);

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

  const currentWorkspaceAgentId = useMemo(
    () =>
      resolveWorkspaceChatAgentId({
        activeType,
        selectedEntityId: selectedEntity?.id || selectedEntityId,
        selectedEntityRuntimeAgentId: selectedEntity?.runtimeAgentId,
        selectedAgentId: homepageChat.selectedAgentId,
      }),
    [activeType, homepageChat.selectedAgentId, selectedEntity?.id, selectedEntity?.runtimeAgentId, selectedEntityId],
  );
  const currentSessionWorkspaceDir = useMemo(
    () => resolveWorkspaceAgentWorkdir(agentWorkspaceDirs, currentWorkspaceAgentId),
    [agentWorkspaceDirs, currentWorkspaceAgentId],
  );
  const currentMemoryAgentId = currentWorkspaceAgentId || null;
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
  const activeSkills = useMemo<WorkspaceActiveSkillList>(
    () =>
      activeSkillIds.reduce<WorkspaceActiveSkillList>((result, skillId) => {
        const activeSkill = toWorkspaceActiveSkill(
          skillsAdmin.selectedSkillOptions.find((item) => item.id === skillId) ?? null,
        );
        if (activeSkill) {
          result.push(activeSkill);
        }
        return result;
      }, []),
    [activeSkillIds, skillsAdmin.selectedSkillOptions],
  );
  const toolsAdmin = useWorkspaceToolsAdmin({ agentId: currentMemoryAgentId });
  const cronTasks = useWorkspaceCronTasks({
    agentId: currentMemoryAgentId,
    gatewayConnected: homepageChat.connected,
    request: homepageChat.request,
    enabled: activeMenu === "chat" || activeMenu === "schedule",
  });

  useWorkspaceCloneFeedback({
    memoryNotice: memoryAdmin.memoryNotice,
    memoryError: memoryAdmin.memoryError,
    memoryErrorTitle: "记忆",
    skillNotice: skillsAdmin.skillNotice,
    skillError: skillsAdmin.skillError,
    skillErrorTitle: "技能库",
    toolNotice: toolsAdmin.toolNotice,
    toolError: toolsAdmin.toolError,
    toolErrorTitle: "工具权限",
    commandNotice: commandsAdmin.commandNotice,
    commandError: commandsAdmin.commandError,
    channelNotice: workspaceChannels.modalNotice,
    channelError: workspaceChannels.modalError,
    channelErrorTitle: "\u6e20\u9053\u7ed1\u5b9a",
    taskFeedbackEvent: cronTasks.taskFeedbackEvent,
    activeChannelId: workspaceChannels.modal.channelId,
    weixinQrStarting: workspaceChannels.weixinQrStarting,
    weixinQrPolling: workspaceChannels.weixinQrPolling,
    weixinQrUrl: workspaceChannels.weixinQrUrl,
    hasActiveWeixinQrSession: workspaceChannels.hasActiveWeixinQrSession,
  });

  useEffect(() => {
    if (!editingTaskId) {
      return;
    }

    if (!cronTasks.tasks.some((task) => task.id === editingTaskId)) {
      setEditingTaskId(null);
    }
  }, [cronTasks.tasks, editingTaskId]);

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

  useEffect(() => {
    setActiveSkillIds([]);
  }, [currentMemoryAgentId]);

  useEffect(() => {
    const availableSkillIds = new Set(skillsAdmin.selectedSkillOptions.map((item) => item.id));
    setActiveSkillIds((current) => {
      const next = current.filter((skillId) => availableSkillIds.has(skillId));
      return next.length === current.length ? current : next;
    });
  }, [skillsAdmin.selectedSkillOptions]);

  const handleAppendActiveSkill = useCallback((skillId: string) => {
    setActiveSkillIds((current) => (current.includes(skillId) ? current : [...current, skillId]));
  }, []);

  const handleRemoveActiveSkill = useCallback((skillId: string) => {
    setActiveSkillIds((current) => current.filter((item) => item !== skillId));
  }, []);

  const handleClearActiveSkills = useCallback(() => {
    setActiveSkillIds([]);
  }, []);

  const handleSelectSessionWorkspaceDir = useCallback(async () => {
    if (!currentWorkspaceAgentId) {
      return;
    }

    const selected = await open({
      directory: true,
      multiple: false,
      title: "选择工作目录",
    });

    if (selected && typeof selected === "string") {
      setAgentWorkspaceDirs((current) => updateWorkspaceAgentWorkdirs(current, currentWorkspaceAgentId, selected));
    }
  }, [currentWorkspaceAgentId]);

  const handleClearSessionWorkspaceDir = useCallback(() => {
    if (!currentWorkspaceAgentId) {
      return;
    }

    setAgentWorkspaceDirs((current) => updateWorkspaceAgentWorkdirs(current, currentWorkspaceAgentId, ""));
  }, [currentWorkspaceAgentId]);

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

  const uptimeLabel = running ? formatUptime(uptime) : "\u672a\u542f\u52a8";
  const derivedLogs = useMemo(
    () => buildWorkspaceRuntimeLogs(logs),
    [logs],
  );
  const chatMessages = useMemo(
    () => (chatEnabled ? homepageChat.messages : []),
    [chatEnabled, homepageChat.messages],
  );
  const chatRenderableMessages = useWorkspaceRenderableMessages(chatMessages);
  const chatFileItems = useMemo(
    () => buildWorkspaceChatFileItemsFromRenderableMessages(chatRenderableMessages),
    [chatRenderableMessages],
  );
  const selectedRuntimeLog = useMemo<WorkspaceRuntimeLogItem | null>(
    () => derivedLogs.find((item) => item.id === selectedRuntimeLogId) ?? null,
    [derivedLogs, selectedRuntimeLogId],
  );

  const handleOpenChatFile = useCallback(async (item: WorkspaceChatFileItem) => {
    if (isWorkspaceUrlTarget(item.target)) {
      await invoke("open_url", { url: item.target });
      return;
    }

    await openPath(resolveWorkspaceLocalOpenPath(item.target));
  }, []);
  const memoryResourceItems = useMemo(
    () => buildWorkspaceMemoryResourceItems(memoryAdmin.memoryFiles),
    [memoryAdmin.memoryFiles],
  );
  const skillResourceItems = useMemo(() => skillsAdmin.skillResourceItems, [skillsAdmin.skillResourceItems]);
  const toolResourceItems = useMemo(() => toolsAdmin.toolResourceItems, [toolsAdmin.toolResourceItems]);
  const commandResourceItems = useMemo(
    () => buildCommandSummaryItems(commandsAdmin.slashCommands, commandsAdmin.activeSlashCommandId),
    [commandsAdmin.activeSlashCommandId, commandsAdmin.slashCommands],
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

  const openCustomModelConfigModal = useCallback(() => {
    composerModelMenu.closeMenu();
    void loadWorkspaceCloneModelConfigModal();
    window.requestAnimationFrame(() => {
      openModelConfigModal();
    });
  }, [composerModelMenu.closeMenu, openModelConfigModal]);

  const toggleUtilityPanel = (panel: Exclude<WorkspaceUtilityPanel, null>) => {
    setUtilityPanel((current) => current === panel ? null : panel);
  };

  const openSessionPanel = (section: WorkspaceSessionSectionKey = activeSessionSection) => {
    setActiveSessionSection(section);
    setUtilityPanel("session");
  };

  const openRuntimeLogDetail = useCallback((logId: string) => {
    setSelectedRuntimeLogId(logId);
  }, []);

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

  const editingTask = useMemo(
    () => cronTasks.tasks.find((task) => task.id === editingTaskId) ?? null,
    [cronTasks.tasks, editingTaskId],
  );
  const editingTaskAgentLabel = useMemo(() => {
    const targetAgentId =
      editingTask?.agentId?.trim()
      || currentMemoryAgentId
      || homepageChat.selectedAgentId
      || selectedEntity?.runtimeAgentId
      || selectedEntity?.id
      || "main";

    const matchedAgent = mergedGatewayAgents.find((agent) => agent.id === targetAgentId);
    if (matchedAgent) {
      return resolveWorkspaceGatewayAgentName(matchedAgent);
    }

    if (selectedEntity?.entityType === "agents" && selectedEntity.id === targetAgentId && selectedEntity.name.trim()) {
      return selectedEntity.name.trim();
    }

    return resolveWorkspaceAgentDisplayName(targetAgentId, targetAgentId);
  }, [
    currentMemoryAgentId,
    editingTask?.agentId,
    homepageChat.selectedAgentId,
    mergedGatewayAgents,
    selectedEntity?.entityType,
    selectedEntity?.id,
    selectedEntity?.name,
    selectedEntity?.runtimeAgentId,
  ]);

  const handleSelectTask = useCallback((taskId: string) => {
    cronTasks.setSelectedTaskId(taskId);
    void cronTasks.loadTaskRuns(taskId);
  }, [cronTasks]);

  const handleEditTask = useCallback((task: WorkspaceCronJob) => {
    cronTasks.setSelectedTaskId(task.id);
    setEditingTaskId(task.id);
  }, [cronTasks]);

  const handleDeleteTask = useCallback((task: WorkspaceCronJob) => {
    const taskDisplayTitle = resolveWorkspaceTaskDisplayTitle(task);
    const confirmed = window.confirm(`\u786e\u8ba4\u5220\u9664\u4efb\u52a1\u201c${taskDisplayTitle}\u201d\u5417\uff1f\u8fd9\u4f1a\u76f4\u63a5\u5220\u9664 OpenClaw \u4e2d\u7684\u771f\u5b9e\u4efb\u52a1\u914d\u7f6e\u3002`);
    if (!confirmed) {
      return;
    }

    void cronTasks.deleteTask(task.id);
  }, [cronTasks]);

  const handleRunTask = useCallback(async (task: WorkspaceCronJob) => {
    const taskAgentId =
      task.agentId?.trim()
      || currentMemoryAgentId
      || homepageChat.selectedAgentId
      || selectedEntity?.runtimeAgentId
      || selectedEntity?.id
      || "main";
    const mainParentSessionKey = homepageChat.sessionsResult?.sessions.find((session) => session.key === `agent:${taskAgentId}:main`)?.key || null;
    const executionContent = buildWorkspaceManualTaskExecutionContent(task);
    const taskRunNotice = executionContent.displayTitle.trim()
      ? `“${executionContent.displayTitle}”正在执行中`
      : "任务正在执行中";

    pushFeedback({
      tone: "info",
      title: "立即执行任务",
      message: taskRunNotice,
      dedupeKey: `workspace-task-run-starting-${task.id}`,
      persistent: false,
      autoCloseMs: 2400,
    });

    setActiveType("agents");
    setSelectedEntityId(taskAgentId);
    setUtilityPanel(null);
    cronTasks.clearTaskStatus();

    const started = await homepageChat.runTaskInNewChat({
      agentId: taskAgentId,
      content: executionContent,
      parentSessionKey: mainParentSessionKey,
    });
    if (started) {
      captureTelemetryEvent("launcher_task_run_started", {
        trigger: "manual",
        agent_id: taskAgentId,
      });
    }
  }, [
    cronTasks,
    currentMemoryAgentId,
    homepageChat,
    homepageChat.sessionsResult,
    pushFeedback,
    selectedEntity?.id,
    selectedEntity?.runtimeAgentId,
  ]);

  const handleSaveEditingTask = useCallback(async (patch: Parameters<typeof cronTasks.updateTask>[1]) => {
    if (!editingTask) {
      return;
    }

    try {
      await cronTasks.updateTask(editingTask.id, patch);
      setEditingTaskId(null);
    } catch {
      // Keep the modal open so the user can adjust the draft after an error.
    }
  }, [cronTasks, editingTask]);

  const handleOpenWorkspaceSettingsModal = useCallback(() => {
    setShowWorkspaceSettingsModal(true);
    setAdminOpen(false);
    setAdminPanel(null);
  }, []);

  const handleToggleTelemetry = useCallback((enabled: boolean) => {
    setTelemetryEnabledState(setTelemetryEnabled(enabled));
  }, []);

  const shouldRenderOverlayStack = Boolean(
    avatarState.isAvatarModalOpen ||
    showAgentInfo ||
    memoryAdmin.showMemoryModal ||
    skillsAdmin.showSkillsModal ||
    toolsAdmin.showToolsModal ||
    selectedRuntimeLogId ||
    selectedRuntimeLog ||
    relatedResource,
  );

  return (
    <motion.section
      key="workspace-clone-home"
      className="workspace-clone-shell"
      initial={{ opacity: 0, y: prefersReducedMotion ? 0 : 8 }}
      animate={{ opacity: 1, y: 0 }}
      exit={{ opacity: 0, y: prefersReducedMotion ? 0 : -6 }}
      transition={{ duration: prefersReducedMotion ? 0 : 0.16, ease: [0.2, 0, 0, 1] }}
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
          onOpenSettings={handleOpenWorkspaceSettingsModal}
        />

        {showDirectory && (
          <WorkspaceCloneDirectory
            typeTabs={WORKSPACE_TYPE_TABS}
            activeType={activeType}
            entities={filteredEntities}
            selectedEntityId={selectedEntity?.id || ""}
            currentSessionKey={homepageChat.currentSessionKey}
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
            onToggleCollapsed={handleToggleDirectoryCollapsed}
            onSelectType={setActiveType}
            onSelectEntity={handleSelectDirectoryEntity}
            onSelectSession={homepageChat.selectSession}
            onSearchChange={setSearchQuery}
            onOpenContextMenu={handleOpenDirectoryContextMenu}
            onCloseContextMenu={handleCloseDirectoryContextMenu}
            onOpenChannelBindingModal={handleOpenChannelBindingModal}
            onCloseChannelBindingModal={handleCloseChannelBindingModal}
            onSelectChannelBindingAgent={workspaceChannels.setSelectedAgentId}
            onStartWeixinQrBinding={handleStartWeixinQrBinding}
            onOpenExternalBindingLink={handleOpenExternalBindingLink}
            onRequestFeishuQr={handleRequestFeishuQr}
            onCheckFeishuQr={handleCheckFeishuQr}
            onChangeFeishuAppId={workspaceChannels.setFeishuAppId}
            onChangeFeishuAppSecret={workspaceChannels.setFeishuAppSecret}
            onChangeFeishuDmPolicy={workspaceChannels.setFeishuDmPolicy}
            onChangeFeishuAllowFromDraft={workspaceChannels.setFeishuAllowFromDraft}
            onAddFeishuAllowFromSessionId={workspaceChannels.addFeishuAllowFromSessionId}
            onRemoveFeishuAllowFromSessionId={workspaceChannels.removeFeishuAllowFromSessionId}
            onToggleFeishuManualExpanded={workspaceChannels.toggleFeishuManualExpanded}
            onToggleFeishuAppSecretVisible={workspaceChannels.toggleFeishuAppSecretVisible}
            onSaveChannelBinding={handleSaveChannelBinding}
            onRemoveChannelBinding={handleRemoveChannelBinding}
          />
        )}

        <section
          className={[
            "workspace-clone__workspace",
            activeMenu !== "chat" && activeMenu !== "employees" && activeMenu !== "skills" ? "is-compact" : "",
            activeMenu === "employees" ? "is-employees" : "",
            activeMenu === "skills" ? "is-skills" : "",
            activeMenu === "tasks" ? "is-product-landing" : "",
          ].join(" ").trim()}
        >
          {activeMenu === "chat" ? (
            <>
              <div className="workspace-clone__top">
                <WorkspaceCloneHeader
                  selectedEntity={selectedEntity}
                  activeUtilityPanel={utilityPanel}
                  avatarEditable={activeType === "agents" && Boolean(selectedEntity)}
                  onToggleUtilityPanel={toggleUtilityPanel}
                  onOpenAvatarPicker={avatarState.openAvatarModal}
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
                messages={chatRenderableMessages}
                liveSteps={chatEnabled ? homepageChat.liveSteps : []}
                liveTranscriptItems={chatEnabled ? homepageChat.liveTranscriptItems : []}
                connectionError={homepageChat.error}
                pendingTaskRunBridge={cronTasks.pendingRunNowBridge ? {
                  title: cronTasks.pendingRunNowBridge.taskDisplayTitle,
                  message: cronTasks.pendingRunNowBridge.message,
                } : null}
                historyLoading={homepageChat.historyLoading}
                historyPageState={homepageChat.historyPageState}
                isGenerating={homepageChat.isGenerating}
                utilityPanel={utilityPanel}
                activeSessionSection={activeSessionSection}
                historyItems={chatEnabled ? homepageChat.historyItems : WORKSPACE_HISTORY}
                logs={derivedLogs}
                selectedRuntimeLogId={selectedRuntimeLog?.id ?? null}
                tasks={cronTasks.tasks}
                selectedTaskId={cronTasks.selectedTaskId}
                selectedTaskRuns={cronTasks.selectedTaskRuns}
                taskLoading={cronTasks.taskLoading}
                taskRunsLoading={cronTasks.taskRunsLoading}
                taskRunsLoadingId={cronTasks.taskRunsLoadingId}
                taskActionJobId={cronTasks.taskActionJobId}
                optimisticRunningTaskIds={cronTasks.optimisticRunningTaskIds}
                startupPreview={homepageChat.startupPreview}
                chatFailure={homepageChat.chatFailure}
                gatewayConnected={homepageChat.connected}
                workbenchItems={WORKSPACE_WORKBENCH}
                fileItems={chatFileItems}
                memoryItems={memoryResourceItems}
                skillItems={skillResourceItems}
                commandItems={commandResourceItems}
                channelItems={workspaceChannels.channelResourceItems}
                toolItems={toolResourceItems}
                currentModelName={workspaceModelName}
                currentProviderName={workspaceProviderName}
                running={running}
                selectedWorkspaceDir={currentSessionWorkspaceDir}
                serviceStartup={serviceStartup}
                 showHomeSuggestions={activeType !== "agents"}
                 onCloseUtilityPanel={() => setUtilityPanel(null)}
                 onSelectSessionSection={setActiveSessionSection}
                 onSelectHistorySession={homepageChat.selectSession}
                 onOpenRelatedResource={handleOpenRelatedResource}
                 onOpenSettingsTextPreview={handleOpenWorkspaceSettingsModal}
                onStart={handleStart}
                onOpenModelConfig={openModelConfigModal}
                onOpenLogs={() => toggleUtilityPanel("logs")}
                onSelectWorkspaceDir={handleSelectSessionWorkspaceDir}
                onClearWorkspaceDir={handleClearSessionWorkspaceDir}
                onOpenChatFile={(item) => {
                  void handleOpenChatFile(item);
                }}
                onOpenRuntimeLogDetail={openRuntimeLogDetail}
                onRefreshTasks={() => {
                  void cronTasks.refreshTasks({ showLoading: true });
                }}
                onSelectTask={handleSelectTask}
                onToggleTaskEnabled={(task) => {
                  void cronTasks.toggleTaskEnabled(task);
                }}
                onEditTask={handleEditTask}
                onRunTask={(task) => {
                  void handleRunTask(task);
                }}
                onDeleteTask={handleDeleteTask}
                onContinueStartupPreview={() => {
                  homepageChat.continueStartupPreview();
                }}
                onRetryChatFailure={() => {
                  void homepageChat.retryLastSend();
                }}
                onLoadOlderHistoryPage={homepageChat.loadOlderHistoryPage}
              />

              {showScenePresetToggle && scenePresetsOpen && (
                <div className="workspace-clone__scene-switcher-shell">
                  <WorkspaceCloneScenePresetSwitcher onSelectCase={handleSelectScenePreset} />
                </div>
              )}

              <WorkspaceCloneComposer
                sessionKey={homepageChat.currentSessionKey}
                running={running}
                chatEnabled={chatEnabled}
                connectionStatus={homepageChat.status}
                selectedEntityName={selectedEntity?.name || null}
                currentModelName={workspaceModelName}
                selectedKnowledgeBaseName={currentKnowledgeBase?.name || ""}
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
                onOpenKnowledgePanel={() => setKnowledgePanelOpen(true)}
                onOpenEmailBindingModal={workspaceEmailBinding.openEmailBindingModal}
                currentModelId={workspaceCurrentModelId}
                modelMenuOpen={composerModelMenu.isOpen}
                modelMenuItems={composerModelMenu.items}
                modelMenuLoading={composerModelMenu.loading}
                modelMenuError={composerModelMenu.error}
                modelMenuSwitchingId={composerModelMenu.switchingId}
                onToggleModelMenu={composerModelMenu.toggleMenu}
                onCloseModelMenu={composerModelMenu.closeMenu}
                onRetryModelMenuLoad={composerModelMenu.loadItems}
                onSelectModelMenuItem={composerModelMenu.selectModel}
                onOpenModelConfig={openCustomModelConfigModal}
                emailBindingBound={workspaceEmailBinding.isBound}
                emailBindingBoundProvider={workspaceEmailBinding.boundProvider}
                emailBindingBoundAccount={workspaceEmailBinding.boundAccount}
                emailBindingBoundProviderLabel={workspaceEmailBinding.boundProviderLabel}
                selectedWorkspaceDir={currentSessionWorkspaceDir}
                slashCommands={commandsAdmin.slashCommands}
                skillOptions={skillsAdmin.selectedSkillOptions}
                activeSlashCommand={commandsAdmin.activeSlashCommand}
                activeSkills={activeSkills}
                onActivateSlashCommand={commandsAdmin.handleActivateSlashCommand}
                onClearActiveSlashCommand={() => commandsAdmin.handleActivateSlashCommand("")}
                onAppendSkill={handleAppendActiveSkill}
                onRemoveActiveSkill={handleRemoveActiveSkill}
                onClearActiveSkills={handleClearActiveSkills}
                onSelectWorkspaceDir={handleSelectSessionWorkspaceDir}
                onClearWorkspaceDir={handleClearSessionWorkspaceDir}
                onSend={(value, attachments) =>
                  homepageChat.sendMessage(value, {
                    activeCommand: commandsAdmin.activeSlashCommand || undefined,
                    activeSkills,
                    attachments,
                    knowledgeBase: currentKnowledgeBase || undefined,
                    workspaceDirectory: currentSessionWorkspaceDir || undefined,
                  })
                }
                onAbort={homepageChat.abortMessage}
                onResetSession={async () => Boolean(await homepageChat.createNewSession())}
              />
            </>
          ) : activeMenu === "employees" ? (
            <Suspense fallback={<WorkspaceCloneLazyFallback label="\u6570\u5b57\u5458\u5de5" />}> 
              <WorkspaceCloneEmployeesView onAgentRosterChanged={handleAgentRosterChanged} />
            </Suspense>
          ) : activeMenu === "skills" ? (
            <Suspense fallback={<WorkspaceCloneLazyFallback label="\u6280\u80fd\u5e02\u573a" />}> 
              <WorkspaceCloneSkillsMarketView
                currentAgentId={currentMemoryAgentId}
                onRefreshCurrentAgentSkills={() => skillsAdmin.refreshSkillOptions({ showLoading: true })}
              />
            </Suspense>
          ) : activeMenu === "schedule" ? (
            <WorkspaceCloneSchedulePage
              selectedEntity={selectedEntity}
              tasks={cronTasks.tasks}
              selectedTaskId={cronTasks.selectedTaskId}
              taskLoading={cronTasks.taskLoading}
              taskActionJobId={cronTasks.taskActionJobId}
              optimisticRunningTaskIds={cronTasks.optimisticRunningTaskIds}
              gatewayConnected={homepageChat.connected}
              onSelectTask={handleSelectTask}
              onToggleTaskEnabled={(task) => {
                void cronTasks.toggleTaskEnabled(task);
              }}
              onEditTask={handleEditTask}
              onRunTask={(task) => {
                void handleRunTask(task);
              }}
              onDeleteTask={handleDeleteTask}
            />
          ) : activeMenu === "tasks" ? (
            <WorkspaceCloneProductLandingView />
          ) : (
            <WorkspaceCloneCompactView
              activeMenu={activeMenu}
              workspaceModelName={workspaceModelName}
              running={running}
              uptimeLabel={uptimeLabel}
            />
          )}
        </section>

        {shouldRenderOverlayStack ? (
          <Suspense fallback={null}>
            <WorkspaceCloneOverlayStack
              selectedEntity={selectedEntity}
              showAvatarModal={avatarState.isAvatarModalOpen}
              showAgentInfo={showAgentInfo}
              showMemoryModal={memoryAdmin.showMemoryModal}
              showSkillsModal={skillsAdmin.showSkillsModal}
              showToolsModal={toolsAdmin.showToolsModal}
              showRuntimeLogDetail={Boolean(selectedRuntimeLogId)}
              runtimeLog={selectedRuntimeLog}
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
              avatarCategoryTabs={workspaceCloneAvatarCategoryTabs}
              avatarCategory={avatarState.avatarCategory}
              avatarPresetOptions={avatarState.avatarPresetOptions}
              selectedAvatarPresetId={avatarState.selectedAvatarPresetId}
              avatarNotice={avatarState.avatarNotice}
              avatarError={avatarState.avatarError}
              channelItems={workspaceChannels.channelResourceItems}
              tasks={cronTasks.tasks}
              selectedTaskId={cronTasks.selectedTaskId}
              selectedTaskRuns={cronTasks.selectedTaskRuns}
              optimisticRunningTaskIds={cronTasks.optimisticRunningTaskIds}
              taskLoading={cronTasks.taskLoading}
              taskError={cronTasks.taskError}
              taskRunsError={cronTasks.taskRunsError}
              taskRunsLoading={cronTasks.taskRunsLoading}
              onCloseAvatarModal={avatarState.closeAvatarModal}
              onSetAvatarCategory={avatarState.setAvatarCategory}
              onApplyAvatarPreset={avatarState.applyAvatarPreset}
              onAvatarUploadChange={avatarState.handleAvatarUploadChange}
              onResetAvatarOverride={avatarState.resetAvatarOverride}
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
              onCloseRuntimeLogDetail={() => {
                setSelectedRuntimeLogId(null);
              }}
              onCloseRelatedResource={() => setRelatedResource(null)}
            />
          </Suspense>
        ) : null}

        <Modal
          show={knowledgePanelOpen}
          onClose={() => setKnowledgePanelOpen(false)}
          maxWidth={1180}
          overlayClassName="workspace-knowledge-panel__overlay"
          contentClassName="workspace-knowledge-panel__surface"
        >
          <div className="workspace-knowledge-panel">
            <div className="workspace-knowledge-panel__header">
              <div>
                <span className="workspace-knowledge-panel__kicker">Agent Resource</span>
                <h3>知识库</h3>
                <p>作为聊天和 `/kb-*` 命令的工作材料使用。</p>
              </div>
              <button
                type="button"
                className="workspace-knowledge-panel__close"
                onClick={() => setKnowledgePanelOpen(false)}
                aria-label="关闭知识库"
                title="关闭"
              >
                <WorkspaceCloneIcon name="x" size={16} strokeWidth={2} />
              </button>
            </div>
            <div className="workspace-knowledge-panel__body">
              <Suspense fallback={<WorkspaceCloneLazyFallback label="\u77e5\u8bc6\u5e93" />}>
                <WorkspaceCloneKnowledgePage onSelectedKnowledgeBaseChange={setCurrentKnowledgeBase} />
              </Suspense>
            </div>
          </div>
        </Modal>

        <WorkspaceCloneSettingsModal
          show={showWorkspaceSettingsModal}
          telemetryEnabled={telemetryEnabled}
          telemetryConfigured={telemetryConfigured}
          posthogHost={telemetryHost}
          onClose={() => setShowWorkspaceSettingsModal(false)}
          onToggleTelemetry={handleToggleTelemetry}
        />

        {isModelConfigOpen ? (
          <Suspense fallback={<WorkspaceCloneLazyFallback label="\u6a21\u578b\u914d\u7f6e" />}> 
            <WorkspaceCloneModelConfigModal
              show={isModelConfigOpen}
              savedProviders={savedProviders}
              currentConfig={currentConfig}
              providers={providers}
              loading={savedProvidersLoading}
              onClose={closeModelConfigModal}
              onRefreshSavedProviders={refreshSavedProviders}
              onRefreshCurrentConfig={refreshCurrentConfig}
              onEnqueueSavedProviderConfig={handleEnqueueWorkspaceSavedProviderConfig}
              onDeleteSavedProviderConfig={handleDeleteSavedProviderConfig}
              providerSyncEvent={providerSyncEvent}
            />
          </Suspense>
        ) : null}

        <WorkspaceCloneTaskEditorModal
          show={Boolean(editingTask)}
          job={editingTask}
          agentLabel={editingTaskAgentLabel}
          saving={cronTasks.taskActionJobId === editingTask?.id && cronTasks.taskActionType === "save"}
          notice={cronTasks.taskNotice}
          error={cronTasks.taskError}
          onClose={() => setEditingTaskId(null)}
          onSave={handleSaveEditingTask}
        />

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
