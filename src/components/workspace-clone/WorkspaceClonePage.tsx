// Copyright (C) 2026 shiyuan
// SPDX-License-Identifier: GPL-3.0-only
// This file is part of DragonClaw. See LICENSE for details.
import { useCallback, useEffect, useMemo, useState } from "react";
import { invoke } from "@tauri-apps/api/core";
import { motion } from "framer-motion";
import type { CurrentConfig, LogEntry, ProviderInfo, SavedProvider, WorkspaceEntityType, WorkspaceMenuKey } from "../../types";
import { useWorkspaceGatewayChat } from "../../hooks/useWorkspaceGatewayChat";
import { formatUptime } from "../../utils/log-humanizer";
import {
  buildWorkspaceEntities,
  buildWorkspaceLogs,
  WORKSPACE_CHANNEL_ITEMS,
  WORKSPACE_COMMAND_ITEMS,
  WORKSPACE_HISTORY,
  WORKSPACE_MEMORY_ITEMS,
  WORKSPACE_MENU_ITEMS,
  WORKSPACE_SCHEDULES,
  WORKSPACE_SKILL_ITEMS,
  WORKSPACE_TOOLS,
  WORKSPACE_TYPE_TABS,
  WORKSPACE_WORKBENCH,
} from "./workspaceCloneData";
import { formatAgentAvatar } from "./workspaceCloneGateway";
import { WorkspaceCloneChatView } from "./WorkspaceCloneChatView";
import { WorkspaceCloneComposer } from "./WorkspaceCloneComposer";
import { WorkspaceCloneDirectory } from "./WorkspaceCloneDirectory";
import { WorkspaceCloneHeader } from "./WorkspaceCloneHeader";
import { WorkspaceCloneModelConfigModal } from "./WorkspaceCloneModelConfigModal";
import { WorkspaceCloneOverlayStack } from "./WorkspaceCloneOverlayStack";
import { WorkspaceCloneSidebar } from "./WorkspaceCloneSidebar";
import type {
  ChannelBindingModalState,
  DirectoryContextMenuState,
  WorkspaceEntity,
  WorkspaceRelatedResource,
  WorkspaceSessionSectionKey,
  WorkspaceSidebarAdminPanel,
  WorkspaceUtilityPanel,
} from "./workspaceCloneTypes";

export interface WorkspaceClonePageProps {
  running: boolean;
  loading: boolean;
  servicePort: number;
  gatewayToken?: string | null;
  consoleUrl: string | null;
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

const COMPACT_COPY: Record<Exclude<WorkspaceMenuKey, "chat">, { title: string; description: string; bullets: string[] }> = {
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
  employees: {
    title: "数字员工工作区骨架",
    description: "先把数字员工首页壳层保留下来，后续再把现有 Agent 能力逐步映射进来。",
    bullets: ["当前只展示静态的栏目说明和布局占位。", "后续再逐项接入真实的 agents 功能。"],
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
    const mainSession = sessionsResult?.sessions.find((session) => session.key === sessionKey) ?? null;
    const modelLabel =
      [mainSession?.modelProvider || currentProviderName, mainSession?.model || currentModelName]
        .filter(Boolean)
        .join(" / ") || "OpenClaw 主会话";

    return {
      id: agent.id,
      entityType: "agents",
      name: agent.identity?.name?.trim() || agent.name?.trim() || agent.id,
      subtitle:
        !running
          ? "待命中"
          : isGenerating && currentSessionKey === sessionKey
            ? "生成中"
            : formatRecentLabel(mainSession?.updatedAt),
      status:
        !running
          ? "offline"
          : isGenerating && currentSessionKey === sessionKey
            ? "busy"
            : agent.id === selectedAgentId && currentMainSession?.abortedLastRun
              ? "busy"
              : "online",
      avatarLabel: formatAgentAvatar(agent),
      accent: agent.id,
      currentWork:
        !running
          ? "服务尚未启动，首页聊天暂不可用。"
          : isGenerating && currentSessionKey === sessionKey
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
  consoleUrl,
  uptime,
  currentModelName,
  currentProviderName,
  currentConfig,
  configVersion,
  providers,
  workspacePath,
  logs,
  handleStart,
  handleStop,
  refreshCurrentConfig,
  handleSetModel,
  handleUpsertSavedProviderConfig,
  handleDeleteSavedProviderConfig,
}: WorkspaceClonePageProps) {
  const [activeMenu, setActiveMenu] = useState<WorkspaceMenuKey>("chat");
  const [activeType, setActiveType] = useState<WorkspaceEntityType>("agents");
  const [selectedEntityId, setSelectedEntityId] = useState("main");
  const [isSidebarCollapsed, setIsSidebarCollapsed] = useState(false);
  const [isDirectoryCollapsed, setIsDirectoryCollapsed] = useState(false);
  const [searchQuery, setSearchQuery] = useState("");
  const [utilityPanel, setUtilityPanel] = useState<WorkspaceUtilityPanel>(null);
  const [activeSessionSection, setActiveSessionSection] = useState<WorkspaceSessionSectionKey>("model");
  const [adminOpen, setAdminOpen] = useState(false);
  const [adminPanel, setAdminPanel] = useState<WorkspaceSidebarAdminPanel>(null);
  const [contextMenu, setContextMenu] = useState<DirectoryContextMenuState>(null);
  const [channelBindingModal, setChannelBindingModal] = useState<ChannelBindingModalState>({
    open: false,
    channelId: "",
    channelName: "",
    view: "wechat",
  });
  const [showAgentInfo, setShowAgentInfo] = useState(false);
  const [showRuntimeLogDetail, setShowRuntimeLogDetail] = useState(false);
  const [showSettingsTextPreview, setShowSettingsTextPreview] = useState(false);
  const [relatedResource, setRelatedResource] = useState<WorkspaceRelatedResource>(null);
  const [isModelConfigOpen, setIsModelConfigOpen] = useState(false);
  const [savedProviders, setSavedProviders] = useState<SavedProvider[]>([]);
  const homepageChat = useWorkspaceGatewayChat({ running, servicePort, gatewayToken });

  const refreshSavedProviders = useCallback(async () => {
    const nextProviders = await invoke<SavedProvider[]>("list_saved_providers");
    setSavedProviders(nextProviders);
  }, []);

  useEffect(() => {
    void refreshSavedProviders().catch(() => {});
  }, [configVersion, refreshSavedProviders]);

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
    }),
    [gatewayAgentEntities, staticEntitiesByType],
  );

  const chatEnabled = activeType === "agents";

  const filteredEntities = useMemo(() => {
    const source = entitiesByType[activeType];
    const query = searchQuery.trim().toLowerCase();
    if (!query) return source;
    return source.filter((entity) => `${entity.name} ${entity.subtitle}`.toLowerCase().includes(query));
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
      setUtilityPanel(null);
      setContextMenu(null);
      setRelatedResource(null);
      setShowAgentInfo(false);
      setShowRuntimeLogDetail(false);
      setShowSettingsTextPreview(false);
    }
  }, [activeMenu]);

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
  }, []);

  const selectedEntity = useMemo(
    () => entitiesByType[activeType].find((entity) => entity.id === selectedEntityId) ?? filteredEntities[0] ?? null,
    [activeType, entitiesByType, filteredEntities, selectedEntityId],
  );

  const uptimeLabel = running ? formatUptime(uptime) : "未启动";
  const derivedLogs = useMemo(() => buildWorkspaceLogs(logs), [logs]);
  const openModelConfigModal = () => setIsModelConfigOpen(true);

  const openChannelBindingModal = (entityId: string) => {
    const entity = entitiesByType.channels.find((item) => item.id === entityId);
    if (!entity) return;
    setChannelBindingModal({
      open: true,
      channelId: entity.id,
      channelName: entity.name,
      view: entity.id === "feishu" ? "feishu" : "wechat",
    });
  };

  const toggleUtilityPanel = (panel: Exclude<WorkspaceUtilityPanel, null>) => {
    setUtilityPanel((current) => current === panel ? null : panel);
  };

  const openSessionPanel = (section: WorkspaceSessionSectionKey = activeSessionSection) => {
    setActiveSessionSection(section);
    setUtilityPanel("session");
  };

  const handleOpenRelatedResource = (resource: WorkspaceRelatedResource) => {
    if (!resource) return;
    setActiveSessionSection(resource);
    setRelatedResource(resource);
  };

  const renderCompactWorkspace = () => {
    const section = COMPACT_COPY[activeMenu as Exclude<WorkspaceMenuKey, "chat">];
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
          isSidebarCollapsed ? "workspace-clone--sidebar-collapsed" : "",
          isDirectoryCollapsed ? "workspace-clone--directory-collapsed" : "",
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

        {activeMenu === "chat" && (
          <WorkspaceCloneDirectory
            typeTabs={WORKSPACE_TYPE_TABS}
            activeType={activeType}
            entities={filteredEntities}
            selectedEntityId={selectedEntity?.id || ""}
            isCollapsed={isDirectoryCollapsed}
            searchQuery={searchQuery}
            contextMenu={contextMenu}
            channelBindingModal={channelBindingModal}
            onToggleCollapsed={() => setIsDirectoryCollapsed((value) => !value)}
            onSelectType={setActiveType}
            onSelectEntity={(entityId) => {
              setSelectedEntityId(entityId);
              if (activeType === "agents") {
                homepageChat.selectAgent(entityId);
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
            onOpenChannelBindingModal={(entity) => openChannelBindingModal(entity.id)}
            onCloseChannelBindingModal={() => setChannelBindingModal((prev) => ({ ...prev, open: false }))}
            onSelectChannelBindingView={(view) => setChannelBindingModal((prev) => ({ ...prev, view }))}
          />
        )}

        <section className={`workspace-clone__workspace ${activeMenu !== "chat" ? "is-compact" : ""}`}>
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
                messages={chatEnabled ? homepageChat.messages : []}
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
                memoryItems={WORKSPACE_MEMORY_ITEMS}
                skillItems={WORKSPACE_SKILL_ITEMS}
                commandItems={WORKSPACE_COMMAND_ITEMS}
                channelItems={WORKSPACE_CHANNEL_ITEMS}
                toolItems={WORKSPACE_TOOLS}
                currentModelName={workspaceModelName}
                currentProviderName={workspaceProviderName}
                workspacePath={workspacePath}
                running={running}
                loading={loading}
                onCloseUtilityPanel={() => setUtilityPanel(null)}
                onSelectSessionSection={setActiveSessionSection}
                onOpenRelatedResource={handleOpenRelatedResource}
                onOpenSettingsTextPreview={() => setShowSettingsTextPreview(true)}
                onStart={handleStart}
                onStop={handleStop}
                onOpenConsole={() => {
                  if (consoleUrl) {
                    void invoke("open_url", { url: consoleUrl });
                  }
                }}
                onOpenModelConfig={openModelConfigModal}
                onOpenLogs={() => toggleUtilityPanel("logs")}
              />

              <WorkspaceCloneComposer
                running={running}
                chatEnabled={chatEnabled}
                connectionStatus={homepageChat.status}
                selectedEntityName={selectedEntity?.name || null}
                currentModelName={workspaceModelName}
                sending={homepageChat.sending}
                isGenerating={homepageChat.isGenerating}
                resettingSession={homepageChat.resettingSession}
                onOpenSessionSection={openSessionPanel}
                onOpenModelConfig={openModelConfigModal}
                onSend={homepageChat.sendMessage}
                onAbort={homepageChat.abortMessage}
                onResetSession={homepageChat.resetSession}
              />
            </>
          ) : renderCompactWorkspace()}
        </section>

        <WorkspaceCloneOverlayStack
          selectedEntity={selectedEntity}
          showAgentInfo={showAgentInfo}
          showRuntimeLogDetail={showRuntimeLogDetail}
          showSettingsTextPreview={showSettingsTextPreview}
          relatedResource={relatedResource}
          memoryItems={WORKSPACE_MEMORY_ITEMS}
          skillItems={WORKSPACE_SKILL_ITEMS}
          commandItems={WORKSPACE_COMMAND_ITEMS}
          channelItems={WORKSPACE_CHANNEL_ITEMS}
          toolItems={WORKSPACE_TOOLS}
          scheduleItems={WORKSPACE_SCHEDULES.map((item) => ({
            id: item.id,
            title: item.title,
            subtitle: item.subtitle,
            tag: item.enabled ? "已启用" : "未启用",
          }))}
          onCloseAgentInfo={() => setShowAgentInfo(false)}
          onCloseRuntimeLogDetail={() => setShowRuntimeLogDetail(false)}
          onCloseSettingsTextPreview={() => setShowSettingsTextPreview(false)}
          onCloseRelatedResource={() => setRelatedResource(null)}
        />

        <WorkspaceCloneModelConfigModal
          show={isModelConfigOpen}
          savedProviders={savedProviders}
          currentConfig={currentConfig}
          providers={providers}
          onClose={() => setIsModelConfigOpen(false)}
          onRefreshSavedProviders={refreshSavedProviders}
          onRefreshCurrentConfig={refreshCurrentConfig}
          onSetModel={handleSetModel}
          onUpsertSavedProviderConfig={handleUpsertSavedProviderConfig}
          onDeleteSavedProviderConfig={handleDeleteSavedProviderConfig}
        />
      </main>
    </motion.section>
  );
}
